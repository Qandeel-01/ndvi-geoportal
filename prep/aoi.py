"""
Step 0: build the area of interest as a single dissolved polygon.

Preference order:
  1. Any .shp / .gpkg / .geojson file the user has dropped into data/aoi/
     (whichever comes first alphabetically). Dissolve all features into one.
  2. Otherwise, fetch geoBoundaries Pakistan ADM2 (district-level), pick
     "Islamabad Capital Territory" and "Rawalpindi", dissolve.

The result is saved to data/aoi/aoi.geojson in EPSG:4326 with a single
Feature carrying properties {name, source, area_km2}. Later steps read
this file to (a) intersect with STAC, (b) clip the raster grid, and (c)
mask sampled points.

We use media.githubusercontent.com for the geoBoundaries fetch because
raw.githubusercontent.com returns a Git-LFS pointer file for that dataset.
"""
import json
import logging
from pathlib import Path

import geopandas as gpd
import requests
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

import config

log = logging.getLogger(__name__)


def _load_local_override() -> gpd.GeoDataFrame | None:
    """
    Look for a user-supplied AOI in data/aoi/. Accepts .geojson / .json /
    .shp / .gpkg. Ignores our own outputs (aoi.geojson, the ADM2 cache).
    """
    if not config.AOI_DIR.exists():
        return None
    exclude = {config.AOI_GEOJSON.name, config.AOI_ADM2_CACHE.name}
    candidates = sorted(
        p for p in config.AOI_DIR.iterdir()
        if p.suffix.lower() in {".geojson", ".json", ".shp", ".gpkg"}
        and p.name not in exclude
    )
    if not candidates:
        return None
    picked = candidates[0]
    log.info("Using user-supplied AOI: %s", picked)
    return gpd.read_file(picked)


def _download_adm2() -> gpd.GeoDataFrame:
    """Fetch (and cache) the geoBoundaries PAK ADM2 GeoJSON."""
    if config.AOI_ADM2_CACHE.exists() and config.AOI_ADM2_CACHE.stat().st_size > 0:
        log.info("ADM2 cache present at %s", config.AOI_ADM2_CACHE)
    else:
        log.info("Downloading geoBoundaries PAK ADM2 ...")
        config.AOI_DIR.mkdir(parents=True, exist_ok=True)
        r = requests.get(config.AOI_ADM2_URL, timeout=120)
        r.raise_for_status()
        # A tiny Git-LFS pointer file is only ~130 bytes and starts with
        # "version https://git-lfs.github.com". Fail loudly if we somehow
        # get one back so the user knows to check the URL.
        if r.content.startswith(b"version https://git-lfs"):
            raise RuntimeError(
                "geoBoundaries download returned a Git-LFS pointer, not GeoJSON. "
                "The URL in config.AOI_ADM2_URL must be media.githubusercontent.com."
            )
        config.AOI_ADM2_CACHE.write_bytes(r.content)
    return gpd.read_file(config.AOI_ADM2_CACHE)


def _select_districts(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Filter geoBoundaries features to our two ADM2 units by shapeName."""
    if "shapeName" not in gdf.columns:
        raise RuntimeError(
            f"Expected 'shapeName' column in ADM2 GeoJSON, got {list(gdf.columns)}"
        )
    picked = gdf[gdf["shapeName"].isin(config.AOI_ADM2_NAMES)].copy()
    missing = set(config.AOI_ADM2_NAMES) - set(picked["shapeName"])
    if missing:
        raise RuntimeError(
            f"ADM2 GeoJSON is missing {missing}. "
            f"Available names include: {sorted(gdf['shapeName'].unique())[:20]}"
        )
    return picked


def _area_km2(geom_wgs84) -> float:
    """
    Approximate area in km2 for a WGS84 geometry, computed in an equal-area
    projection so the result is meaningful. Only used for reporting.
    """
    tmp = gpd.GeoSeries([geom_wgs84], crs="EPSG:4326").to_crs("EPSG:6933")
    return float(tmp.area.iloc[0]) / 1e6


def build_aoi() -> dict:
    """Build data/aoi/aoi.geojson and return {name, source, area_km2, bounds}."""
    config.AOI_DIR.mkdir(parents=True, exist_ok=True)

    override = _load_local_override()
    if override is not None:
        source = "user-supplied file in data/aoi/"
        name = "custom AOI"
        gdf = override.to_crs("EPSG:4326")
    else:
        adm2 = _download_adm2().to_crs("EPSG:4326")
        gdf = _select_districts(adm2)
        source = "geoBoundaries PAK ADM2 (CC-BY 4.0)"
        name = " + ".join(config.AOI_ADM2_NAMES)

    # Dissolve everything into a single geometry. unary_union yields a
    # Polygon or MultiPolygon; make_valid fixes any small topology defects
    # (self-touching rings) that would otherwise upset downstream ops.
    merged = make_valid(unary_union(list(gdf.geometry)))

    props = {
        "name": name,
        "source": source,
        "area_km2": round(_area_km2(merged), 1),
    }
    feature = {"type": "Feature", "properties": props, "geometry": mapping(merged)}
    payload = {"type": "FeatureCollection", "features": [feature]}
    config.AOI_GEOJSON.write_text(json.dumps(payload))

    minx, miny, maxx, maxy = merged.bounds
    log.info(
        "AOI ready: %s, area=%.1f km2, bounds=(%.3f, %.3f, %.3f, %.3f) -> %s",
        name, props["area_km2"], minx, miny, maxx, maxy, config.AOI_GEOJSON,
    )
    return {
        "aoi_name": name,
        "aoi_source": source,
        "aoi_area_km2": props["area_km2"],
        "aoi_bounds": [round(v, 4) for v in (minx, miny, maxx, maxy)],
    }


def load_aoi_geom():
    """Read data/aoi/aoi.geojson and return the single shapely geometry."""
    text = Path(config.AOI_GEOJSON).read_text()
    fc = json.loads(text)
    return shape(fc["features"][0]["geometry"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    build_aoi()
