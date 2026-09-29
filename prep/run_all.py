"""
Run the whole data pipeline end to end:

    aoi       build the AOI polygon (Islamabad + Rawalpindi, dissolved)
    search    pick the best multi-tile Sentinel-2 acquisition for the AOI
    download  fetch B02, B03, B04, B08, SCL for every selected item
    dem       mosaic + reproject Copernicus DEM, hillshade, contours, ridgeline
    process   AOI-clip 4-band RGB + NDVI COGs; sample points with elevation
    load      apply idempotent schema + COPY into PostGIS + AOI + contours + meta
    publish   (re-)create workspace, stores, layers, styles in GeoServer

Each step can also be run on its own (e.g. `python setup_geoserver.py`).
Use --skip to skip finished steps, e.g. `python run_all.py --skip aoi search download dem`.
"""
import argparse
import json
import logging
import time

import config

STEPS = ["aoi", "search", "download", "dem", "process", "load", "publish"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--skip", nargs="*", default=[], choices=STEPS,
                        help="steps to skip (order-independent)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log = logging.getLogger("pipeline")

    manifest: dict = json.loads(config.MANIFEST.read_text()) if config.MANIFEST.exists() else {}
    t0 = time.time()

    if "aoi" not in args.skip:
        from aoi import build_aoi
        manifest.update(build_aoi())
    if "search" not in args.skip:
        from stac_search import find_scene
        items = find_scene()
        manifest["scene_items"] = [it["id"] for it in items]
    if "download" not in args.skip:
        from download import download_bands
        download_bands()
    if "dem" not in args.skip:
        from dem import build_dem
        manifest.update(build_dem())
    if "process" not in args.skip:
        from process import process
        manifest.update(process())
        # Persist manifest before load so the loader picks up the freshest sizes.
        config.MANIFEST.write_text(json.dumps(manifest, indent=2))
    if "load" not in args.skip:
        from load_postgis import load_points
        manifest.update(load_points())
    if "publish" not in args.skip:
        from setup_geoserver import setup
        manifest.update(setup())

    config.MANIFEST.write_text(json.dumps(manifest, indent=2))
    log.info("Done in %.1f min. Summary written to %s", (time.time() - t0) / 60, config.MANIFEST)
    log.info(json.dumps(manifest, indent=2, default=str))


if __name__ == "__main__":
    main()
