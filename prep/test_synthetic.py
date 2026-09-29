"""
Synthetic-data smoke test for process.py + dem.py logic.

Builds:
  * A tiny AOI polygon in EPSG:4326 that crosses two adjacent MGRS-style
    tiles.
  * Two adjacent fake Sentinel-2 tiles in EPSG:32643 at 10 m: B02/B03/B04/B08
    as uint16 (with a distinctive pattern per tile), and SCL at 20 m.
  * A tiny synthetic DEM COG in EPSG:32643 at 30 m covering both tiles.
  * A minimal STAC item.json per tile (only the fields process.py reads).

Then runs process.process() and asserts:
  * Both tiles contribute to the mosaic (first-non-zero-wins).
  * Pixels outside the AOI are set to nodata.
  * Points are sampled only inside the AOI and carry an `elevation` value.
  * The RGB is written with 4 bands.

Runs against isolated temp dirs (never touches real data/).
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import mapping, Polygon


HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))


def _write_uint16_tile(path: Path, origin_x: float, origin_y: float, size_px: int,
                      res: float, value: int, crs: str = "EPSG:32643") -> None:
    """Write a solid-value uint16 GeoTIFF (1 band)."""
    transform = from_origin(origin_x, origin_y, res, res)
    profile = {
        "driver": "GTiff", "width": size_px, "height": size_px,
        "count": 1, "dtype": "uint16", "crs": crs,
        "transform": transform, "nodata": 0,
        "tiled": True, "blockxsize": 256, "blockysize": 256,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(np.full((size_px, size_px), value, dtype=np.uint16), 1)


def _write_scl_tile(path: Path, origin_x: float, origin_y: float, size_px: int,
                    res: float, crs: str = "EPSG:32643") -> None:
    """SCL is 20 m so we halve size_px and double res."""
    _write_uint16_tile(path, origin_x, origin_y, size_px // 2, res * 2, value=4, crs=crs)


def _write_dem(path: Path, origin_x: float, origin_y: float, width_px: int,
               height_px: int, res: float, crs: str = "EPSG:32643") -> None:
    """Solid-gradient DEM so elevation samples are checkable."""
    transform = from_origin(origin_x, origin_y, res, res)
    profile = {
        "driver": "GTiff", "width": width_px, "height": height_px, "count": 1,
        "dtype": "float32", "crs": crs, "transform": transform, "nodata": -32767.0,
        "tiled": True, "blockxsize": 256, "blockysize": 256,
    }
    # Gradient: elevation increases with column index (0..width).
    data = np.tile(np.arange(width_px, dtype=np.float32) + 500.0, (height_px, 1))
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data, 1)


def _stub_item(item_id: str, dt: str, mgrs: str) -> dict:
    return {
        "id": item_id,
        "geometry": {"type": "Polygon", "coordinates": []},
        "properties": {
            "datetime": f"{dt}T00:00:00Z",
            "s2:mgrs_tile": mgrs,
            "s2:processing_baseline": "05.11",
            "eo:cloud_cover": 0.0,
        },
    }


def run() -> None:
    # ------------------------------------------------------------------
    # Set up an isolated data directory and reload config with DATA_DIR
    # pointing to it. Everything (raw, rasters, vectors, aoi) will live
    # under that temp dir so the real data/ folder is not touched.
    # ------------------------------------------------------------------
    tmp = Path(tempfile.mkdtemp(prefix="ndvi_synth_"))
    try:
        import os
        os.environ["DATA_DIR"] = str(tmp)
        os.environ["SAMPLE_STEP"] = "4"      # smaller stride so we get plenty of points
        os.environ["RGB_MIN_MB"] = "0"        # skip the size floor in the synthetic run
        # Force a fresh import so config picks up env vars.
        for mod in ("config", "aoi", "process", "dem"):
            sys.modules.pop(mod, None)
        import config  # type: ignore
        import aoi as aoi_mod  # type: ignore
        from process import process  # type: ignore

        # AOI in EPSG:4326 that (a) fits inside the union of the two synthetic
        # tiles' geographic footprints, and (b) crosses the boundary between
        # them so BOTH tiles must contribute.
        # Tile A origin at UTM (500000, 3800000), 512 px @ 10 m -> covers up
        # to x=505120. Tile B starts at x=505120. AOI spans x=500500..509500.
        # Using shapely with a manual UTM->WGS84 back-conversion is fiddly, so
        # instead build the AOI directly in UTM and transform to WGS84.
        from pyproj import Transformer
        to_wgs = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
        # Rectangle in UTM: 500500,3800500 -> 509500,3809500 (9 km x 9 km)
        utm_ring = [
            (500500, 3800500),
            (509500, 3800500),
            (509500, 3809500),
            (500500, 3809500),
            (500500, 3800500),
        ]
        wgs_ring = [to_wgs.transform(x, y) for x, y in utm_ring]
        aoi_poly = Polygon(wgs_ring)
        config.AOI_DIR.mkdir(parents=True, exist_ok=True)
        fc = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"name": "synthetic AOI", "source": "test", "area_km2": 81.0},
                "geometry": mapping(aoi_poly),
            }],
        }
        config.AOI_GEOJSON.write_text(json.dumps(fc))

        # Two adjacent tiles (10 m), 512 x 512 px, side by side in x.
        tile_size_px = 512
        res10 = 10.0
        tile_a = config.RAW_DIR / "T_A"
        tile_b = config.RAW_DIR / "T_B"
        tile_a.mkdir(parents=True, exist_ok=True)
        tile_b.mkdir(parents=True, exist_ok=True)

        for i, (item_dir, x0) in enumerate([(tile_a, 500000), (tile_b, 505120)]):
            # Each band uses a different constant so we can tell tiles apart.
            for k, band in config.ASSETS.items():
                if k == "scl":
                    continue
                value = 1200 + (i * 100) + {"blue": 0, "green": 1, "red": 2, "nir": 3}[k]
                _write_uint16_tile(item_dir / f"{band}.tif", x0, 3810240,
                                   tile_size_px, res10, value=value)
            _write_scl_tile(item_dir / "SCL.tif", x0, 3810240, tile_size_px, res10)

        items = [
            _stub_item("T_A", "2025-11-02", "43SCT"),
            _stub_item("T_B", "2025-11-02", "43SDT"),
        ]
        (config.RAW_DIR / "items.json").write_text(json.dumps(items))

        # Synthetic DEM covering both tiles (30 m).
        config.RASTER_DIR.mkdir(parents=True, exist_ok=True)
        _write_dem(
            config.DEM_COG,
            origin_x=499800, origin_y=3810240,
            # 10.5 km wide x 10.5 km tall
            width_px=int((510320 - 499800) / 30) + 1,
            height_px=int(10520 / 30) + 1,
            res=30.0,
        )

        # ------------------------------------------------------------
        # Run process step
        # ------------------------------------------------------------
        result = process(items=items)

        # ------------------------------------------------------------
        # Assertions
        # ------------------------------------------------------------
        with rasterio.open(config.RGB_COG) as rgb:
            assert rgb.count == 4, f"expected 4 bands, got {rgb.count}"
            assert str(rgb.crs).endswith("32643"), f"CRS: {rgb.crs}"
            arr = rgb.read()
            # There must be some non-nodata pixels (AOI area).
            valid = arr[0] != config.NODATA_RGB
            assert valid.any(), "RGB has no valid pixels inside AOI"
            # There must be some nodata pixels (outside AOI).
            assert (~valid).any(), "RGB has no nodata pixels; AOI clip is not working"
            # Both tiles must contribute: check that red-band values include
            # both tile-A and tile-B distinctive values (1202 and 1302 after
            # BOA offset removal at baseline 05.11 -> 202 / 302).
            uniq = set(np.unique(arr[0][valid]).tolist())
            assert 202 in uniq, f"tile A red value missing: {sorted(uniq)[:6]}"
            assert 302 in uniq, f"tile B red value missing: {sorted(uniq)[:6]}"

        with rasterio.open(config.NDVI_COG) as nd:
            nd_arr = nd.read(1)
            nd_valid = nd_arr != config.NODATA_NDVI
            assert nd_valid.any(), "NDVI has no valid pixels"
            assert (~nd_valid).any(), "NDVI has no nodata pixels"

        raw = np.load(config.POINTS_NPZ)
        assert result["points"] > 100, f"too few points: {result['points']}"
        elev = raw["elev"]
        n_finite_elev = int(np.isfinite(elev).sum())
        assert n_finite_elev > 100, f"elevation missing on most points: {n_finite_elev}"
        # Elevation was built as a horizontal gradient starting at 500. All
        # sampled points should fall within a reasonable range.
        finite = elev[np.isfinite(elev)]
        assert finite.min() >= 490 and finite.max() <= 1100, (
            f"elev out of range: [{finite.min()}, {finite.max()}]"
        )

        print("SYNTHETIC TEST PASSED")
        print(f"  points: {result['points']}")
        print(f"  rgb bands: 4, size: {config.RGB_COG.stat().st_size} bytes")
        print(f"  elevation finite: {n_finite_elev} / {len(elev)}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    run()
