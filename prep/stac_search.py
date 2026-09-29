"""
Step 1: pick the best Sentinel-2 acquisition covering the AOI.

The AOI (Islamabad + Rawalpindi) straddles multiple MGRS tiles, so no single
STAC item covers it. Instead we:

  1. Search STAC for items intersecting the AOI in the date range.
  2. Group items by acquisition date (same datatake / same pass).
  3. For each date, union the item footprints. Keep dates whose union fully
     contains the AOI.
  4. Among the covering dates, pick the one with the LOWEST MEAN cloud cover
     across its tiles. That's the day whose mosaic will look cleanest.

The chosen items are saved to data/raw/items.json (a list) for the next step.
"""
import json
import logging
from collections import defaultdict

import pystac_client
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

import aoi as aoi_mod
import config

log = logging.getLogger(__name__)


def _acq_date(item) -> str:
    """Group key: acquisition date as YYYY-MM-DD."""
    return item.datetime.date().isoformat()


def find_scene() -> list[dict]:
    """Search STAC and return the list of chosen items (one per MGRS tile)."""
    catalog = pystac_client.Client.open(config.STAC_URL)
    aoi_geom = aoi_mod.load_aoi_geom()

    # Use the AOI polygon itself for intersects (STAC accepts any geometry).
    # This is more precise than the bbox and returns fewer irrelevant items.
    search = catalog.search(
        collections=[config.COLLECTION],
        intersects=mapping(aoi_geom),
        datetime=config.DATE_RANGE,
        query={"eo:cloud_cover": {"lt": config.MAX_CLOUD}},
    )
    items = list(search.items())
    log.info("STAC returned %d candidate items across the date range", len(items))
    if not items:
        raise RuntimeError(
            "No STAC items match. Widen DATE_RANGE or raise MAX_CLOUD."
        )

    # Group by acquisition date so we can evaluate whole-mosaic coverage.
    by_date: dict[str, list] = defaultdict(list)
    for it in items:
        by_date[_acq_date(it)].append(it)

    # Keep only dates whose combined footprint fully covers the AOI. Because
    # adjacent MGRS tiles overlap slightly, the union nearly always closes.
    covering = []
    for date, group in by_date.items():
        footprint = unary_union([shape(it.geometry) for it in group])
        if footprint.contains(aoi_geom):
            mean_cloud = sum(
                it.properties.get("eo:cloud_cover", 100) for it in group
            ) / len(group)
            covering.append((date, group, mean_cloud))

    if not covering:
        raise RuntimeError(
            "No acquisition date whose tiles fully cover the AOI. "
            "Try a wider DATE_RANGE or a higher MAX_CLOUD."
        )

    # Cleanest mosaic wins. Ties are stable (dict order = insertion order).
    date, group, mean_cloud = min(covering, key=lambda x: x[2])
    tiles = sorted({it.properties.get("s2:mgrs_tile", "?") for it in group})
    log.info(
        "Selected %s: %d tiles (%s), mean cloud %.2f%%",
        date, len(group), ",".join(tiles), mean_cloud,
    )

    config.RAW_DIR.mkdir(parents=True, exist_ok=True)
    # Save every chosen item so download.py can iterate without a STAC call.
    dicts = [it.to_dict() for it in group]
    (config.RAW_DIR / "items.json").write_text(json.dumps(dicts, indent=2))
    return dicts


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    find_scene()
