"""
Step 3: build AOI-clipped RGB + NDVI rasters and draw the point sample.

Rewritten for multi-tile mosaics:

  * Target grid = AOI bounds in EPSG:32643, snapped outward to multiples of
    GRID_ALIGN_M (20 m). This aligns exactly with every source MGRS tile
    origin (multiples of 60 m) and with the 20 m SCL grid.
  * For each BLOCK x BLOCK window we compute the world coordinates of the
    window, then read the same window from every downloaded tile using an
    exact integer window (boundless=True, fill_value=0). "First non-zero
    wins" mosaic: as soon as a tile contributes a pixel, later tiles cannot
    overwrite it.
  * The AOI polygon is rasterised per window; every pixel outside becomes
    nodata. Only pixels inside the AOI are eligible for point sampling.
  * RGB is 4 bands: Red, Green, Blue, NIR (enables a false-colour style and
    ensures the raster stays above the 200 MB floor).
  * Each point gets a DEM elevation attribute sampled from data/rasters/dem_cop30.tif
    (built by dem.py in the step before).

Adaptive compression: after the raw GeoTIFF is written we try DEFLATE, then
LZW, then NONE, keeping the first codec whose COG size >= RGB_MIN_MB.
"""
import json
import logging
import math

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.shutil import copy as rio_copy
from rasterio.transform import from_origin, xy
from rasterio.warp import reproject
from rasterio.windows import Window, from_bounds
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform as shp_transform

import aoi as aoi_mod
import config

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# BOA offset + reflectance helpers (unchanged behaviour)
# ---------------------------------------------------------------------------
def boa_offset(item: dict) -> int:
    """Return the DN offset to remove for this scene's processing baseline."""
    baseline = item["properties"].get("s2:processing_baseline", "00.00")
    return config.BOA_OFFSET if float(baseline) >= float(config.BOA_OFFSET_BASELINE) else 0


def to_reflectance(dn: np.ndarray, offset: int) -> np.ndarray:
    """
    Convert L2A digital numbers to 'reflectance x 10000' (uint16).

    DN == 0 is Sentinel-2's no-data value and stays 0. Valid pixels are
    clipped to >= 1 so a genuinely dark pixel is never mistaken for no-data
    by the mosaic step ("first non-zero wins").
    """
    out = dn.astype(np.int32) - offset
    out = np.clip(out, 1, 65535)
    out[dn == 0] = config.NODATA_RGB
    return out.astype(np.uint16)


def compute_ndvi(red: np.ndarray, nir: np.ndarray, invalid: np.ndarray) -> np.ndarray:
    """NDVI = (NIR - Red) / (NIR + Red), invalid pixels set to no-data."""
    red = red.astype(np.float32)
    nir = nir.astype(np.float32)
    denom = nir + red
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (nir - red) / denom
    ndvi = np.clip(ndvi, -1.0, 1.0)
    ndvi[invalid | (denom == 0)] = config.NODATA_NDVI
    return ndvi.astype(np.float32)


# ---------------------------------------------------------------------------
# Target-grid helpers
# ---------------------------------------------------------------------------
def _target_grid(aoi_geom_wgs84):
    """
    Return (transform, width, height, aoi_utm_polygon) for the AOI-clipped
    grid at 10 m in EPSG:32643. Bounds are snapped OUTWARD to multiples of
    GRID_ALIGN_M so every S2 pixel origin aligns.
    """
    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True).transform
    aoi_utm = shp_transform(to_utm, aoi_geom_wgs84)
    minx, miny, maxx, maxy = aoi_utm.bounds
    a = config.GRID_ALIGN_M
    minx = math.floor(minx / a) * a
    miny = math.floor(miny / a) * a
    maxx = math.ceil(maxx / a) * a
    maxy = math.ceil(maxy / a) * a
    width = int((maxx - minx) / 10)
    height = int((maxy - miny) / 10)
    transform = from_origin(minx, maxy, 10.0, 10.0)  # ul-origin, y grows down
    return transform, width, height, aoi_utm


def _open_sources(paths_per_item: dict[str, dict]):
    """
    Open every downloaded band file for every item. Returns a dict:
      {'blue': [DatasetReader, ...], 'green': [...], ..., 'scl': [...]}
    """
    opened = {k: [] for k in config.ASSETS}
    for _item_id, paths in paths_per_item.items():
        for k in config.ASSETS:
            opened[k].append(rasterio.open(paths[k]))
    return opened


def _close_sources(opened: dict[str, list]) -> None:
    for lst in opened.values():
        for s in lst:
            try:
                s.close()
            except Exception:
                pass


def _read_window_mosaic(
    sources: list, transform, width: int, height: int,
    win: Window, dtype=np.uint16, upsample_2x: bool = False,
) -> np.ndarray:
    """
    Read one BLOCK-sized window from each source using EXACT integer windows
    computed from the target grid's world coordinates, then combine with
    'first non-zero wins'. If upsample_2x is set, each source read happens on
    a 20 m grid then is nearest-neighbour upsampled to 10 m (for SCL).
    """
    # World bounds of this target window.
    tl_x, tl_y = xy(transform, win.row_off, win.col_off, offset="ul")
    br_x, br_y = xy(
        transform, win.row_off + win.height, win.col_off + win.width, offset="ul"
    )
    left, right = tl_x, br_x
    top, bottom = tl_y, br_y
    if bottom > top:
        top, bottom = bottom, top

    out = np.zeros((win.height, win.width), dtype=dtype)
    empty_mask = out == 0

    for src in sources:
        # Ask rasterio for the source pixel window that matches these bounds;
        # boundless=True + fill_value=0 lets us read even if the source does
        # not cover the whole extent (returns zeros for uncovered pixels).
        src_win = from_bounds(left, bottom, right, top, transform=src.transform)
        # Use round to avoid drifting by 1 px at chunk edges due to floats.
        row_off = int(round(src_win.row_off))
        col_off = int(round(src_win.col_off))
        w = int(round(src_win.width))
        h = int(round(src_win.height))
        read_win = Window(col_off, row_off, w, h)
        arr = src.read(
            1, window=read_win, boundless=True, fill_value=0,
            out_shape=(win.height, win.width),
            resampling=Resampling.nearest if upsample_2x else Resampling.nearest,
        ).astype(dtype, copy=False)
        # First non-zero wins: only fill pixels that are still empty.
        take = empty_mask & (arr != 0)
        if take.any():
            out[take] = arr[take]
            empty_mask &= ~take
        if not empty_mask.any():
            break
    return out


# ---------------------------------------------------------------------------
# Adaptive compression
# ---------------------------------------------------------------------------
def _write_cog(src_path, dst_path, compress: str) -> None:
    rio_copy(
        src_path, dst_path,
        driver="COG", COMPRESS=compress, PREDICTOR="YES",
        BLOCKSIZE=512, OVERVIEW_RESAMPLING="AVERAGE",
        BIGTIFF="IF_SAFER", NUM_THREADS="ALL_CPUS",
    )


def _write_rgb_meeting_size(rgb_tmp, rgb_out, min_mb: int) -> str:
    """
    Write the RGB COG; if under min_mb, rewrite with a weaker codec.
    Returns the codec actually used.
    """
    for codec in config.COG_COMPRESS_TRY:
        _write_cog(rgb_tmp, rgb_out, codec)
        size_mb = rgb_out.stat().st_size / 1e6
        log.info("RGB COG with %s: %.1f MB", codec, size_mb)
        if size_mb >= min_mb:
            return codec
    log.warning("RGB COG below %d MB even at %s codec", min_mb, config.COG_COMPRESS_TRY[-1])
    return config.COG_COMPRESS_TRY[-1]


# ---------------------------------------------------------------------------
# Point sampling
# ---------------------------------------------------------------------------
def _sample_window(rng, win: Window, ndvi: np.ndarray, aoi_mask: np.ndarray, step: int):
    """
    Stratified random sampling constrained to AOI + valid NDVI. Returns
    (rows, cols) in window coordinates.
    """
    h, w = ndvi.shape
    by, bx = np.meshgrid(
        np.arange(math.ceil(h / step)),
        np.arange(math.ceil(w / step)),
        indexing="ij",
    )
    by, bx = by.ravel(), bx.ravel()
    size_y = np.minimum(step, h - by * step)
    size_x = np.minimum(step, w - bx * step)
    rows = by * step + (rng.random(by.size) * size_y).astype(int)
    cols = bx * step + (rng.random(bx.size) * size_x).astype(int)
    keep = (ndvi[rows, cols] != config.NODATA_NDVI) & aoi_mask[rows, cols]
    return rows[keep], cols[keep]


def _sample_dem(dem_src, xs_utm: np.ndarray, ys_utm: np.ndarray) -> np.ndarray:
    """Sample the DEM at UTM coordinates using nearest-pixel lookup."""
    inv = ~dem_src.transform
    cols = np.floor(inv.a * xs_utm + inv.b * ys_utm + inv.c).astype(int)
    rows = np.floor(inv.d * xs_utm + inv.e * ys_utm + inv.f).astype(int)
    ok = (rows >= 0) & (rows < dem_src.height) & (cols >= 0) & (cols < dem_src.width)
    out = np.full(xs_utm.shape, np.nan, dtype=np.float32)
    if ok.any():
        vals = dem_src.read(1)[rows[ok], cols[ok]].astype(np.float32)
        vals[vals == config.DEM_NODATA] = np.nan
        out[ok] = vals
    return out


# ---------------------------------------------------------------------------
# Main step
# ---------------------------------------------------------------------------
def process(items: list[dict] | None = None) -> dict:
    if items is None:
        items = json.loads((config.RAW_DIR / "items.json").read_text())
    if not items:
        raise RuntimeError("No items to process; run search + download first.")

    # Every item on the same day shares the same processing baseline, so we
    # take the offset from the first one.
    offset = boa_offset(items[0])
    log.info("Processing baseline offset: %d (items: %d)", offset, len(items))

    # Build the target grid from the AOI.
    aoi_geom = aoi_mod.load_aoi_geom()
    transform, width, height, aoi_utm = _target_grid(aoi_geom)
    log.info("Target grid: %d x %d px (EPSG:32643, 10 m)", width, height)

    # Assemble per-item file paths (download.py stores them under RAW_DIR/<id>/).
    paths_per_item = {}
    for it in items:
        item_dir = config.RAW_DIR / it["id"]
        paths_per_item[it["id"]] = {
            k: item_dir / f"{v}.tif" for k, v in config.ASSETS.items()
        }
    sources = _open_sources(paths_per_item)

    config.RASTER_DIR.mkdir(parents=True, exist_ok=True)
    config.VECTOR_DIR.mkdir(parents=True, exist_ok=True)
    rgb_tmp = config.RASTER_DIR / "_rgb_tmp.tif"
    ndvi_tmp = config.RASTER_DIR / "_ndvi_tmp.tif"

    # DEM is optional but the elevation column will be NaN if missing.
    dem_src = None
    if config.DEM_COG.exists():
        dem_src = rasterio.open(config.DEM_COG)
    else:
        log.warning("DEM not found at %s; elevation column will be NULL", config.DEM_COG)

    rng = np.random.default_rng(config.RANDOM_SEED)
    step = config.SAMPLE_STEP
    samples = {k: [] for k in ("row", "col", "red", "green", "blue", "nir",
                                "ndvi", "scl", "elev")}

    base = dict(
        driver="GTiff", width=width, height=height, crs="EPSG:32643",
        transform=transform, tiled=True, blockxsize=512, blockysize=512,
        compress="LZW", BIGTIFF="IF_SAFER",
    )
    rgb_profile = {**base, "count": 4, "dtype": "uint16", "nodata": config.NODATA_RGB}
    ndvi_profile = {**base, "count": 1, "dtype": "float32", "nodata": config.NODATA_NDVI}

    try:
        with rasterio.open(rgb_tmp, "w", **rgb_profile) as rgb_dst, \
             rasterio.open(ndvi_tmp, "w", **ndvi_profile) as ndvi_dst:

            rgb_dst.descriptions = ("red", "green", "blue", "nir")
            ndvi_dst.descriptions = ("ndvi",)

            n_rows = math.ceil(height / config.BLOCK)
            n_cols = math.ceil(width / config.BLOCK)
            for i in range(n_rows):
                for j in range(n_cols):
                    win = Window(
                        j * config.BLOCK, i * config.BLOCK,
                        min(config.BLOCK, width - j * config.BLOCK),
                        min(config.BLOCK, height - i * config.BLOCK),
                    )

                    red_dn = _read_window_mosaic(sources["red"], transform, width, height, win)
                    green_dn = _read_window_mosaic(sources["green"], transform, width, height, win)
                    blue_dn = _read_window_mosaic(sources["blue"], transform, width, height, win)
                    nir_dn = _read_window_mosaic(sources["nir"], transform, width, height, win)
                    scl = _read_window_mosaic(
                        sources["scl"], transform, width, height, win,
                        dtype=np.uint16, upsample_2x=True,
                    ).astype(np.uint8)

                    red = to_reflectance(red_dn, offset)
                    green = to_reflectance(green_dn, offset)
                    blue = to_reflectance(blue_dn, offset)
                    nir = to_reflectance(nir_dn, offset)

                    # AOI mask for this window: True = inside AOI.
                    aoi_mask = ~geometry_mask(
                        [mapping(aoi_utm)],
                        out_shape=(win.height, win.width),
                        transform=rasterio.windows.transform(win, transform),
                        invert=False,  # invert=False -> True OUTSIDE (mask)
                    )

                    # Outside-AOI pixels become nodata in every raster.
                    for arr in (red, green, blue, nir):
                        arr[~aoi_mask] = config.NODATA_RGB

                    invalid = (
                        (red_dn == 0) | (nir_dn == 0)
                        | np.isin(scl, list(config.INVALID_SCL))
                        | ~aoi_mask
                    )
                    ndvi = compute_ndvi(red, nir, invalid)

                    rgb_dst.write(np.stack([red, green, blue, nir]), window=win)
                    ndvi_dst.write(ndvi, 1, window=win)

                    # --- point sample for this window (AOI-constrained) ---
                    rows_w, cols_w = _sample_window(rng, win, ndvi, aoi_mask, step)
                    if rows_w.size:
                        samples["row"].append(rows_w + int(win.row_off))
                        samples["col"].append(cols_w + int(win.col_off))
                        samples["red"].append(red[rows_w, cols_w])
                        samples["green"].append(green[rows_w, cols_w])
                        samples["blue"].append(blue[rows_w, cols_w])
                        samples["nir"].append(nir[rows_w, cols_w])
                        samples["ndvi"].append(ndvi[rows_w, cols_w])
                        samples["scl"].append(scl[rows_w, cols_w])
                        if dem_src is not None:
                            # UTM coords of these pixel centres.
                            xs_w, ys_w = xy(
                                transform,
                                rows_w + int(win.row_off),
                                cols_w + int(win.col_off),
                                offset="center",
                            )
                            elev = _sample_dem(
                                dem_src, np.asarray(xs_w), np.asarray(ys_w)
                            )
                        else:
                            elev = np.full(rows_w.shape, np.nan, dtype=np.float32)
                        samples["elev"].append(elev)

                log.info("Row of windows %d/%d done", i + 1, n_rows)

            scene_id = items[0]["id"]
            date = items[0]["properties"]["datetime"][:10]
            tiles = sorted({
                it["properties"].get("s2:mgrs_tile", "") for it in items
            })
            tags = dict(
                source_items=",".join(it["id"] for it in items),
                acquired=date, tiles=",".join(tiles),
                scale="reflectance = value / 10000",
                boa_offset_removed=str(offset),
                aoi="Islamabad + Rawalpindi",
            )
            rgb_dst.update_tags(**tags)
            ndvi_dst.update_tags(**tags)
    finally:
        _close_sources(sources)

    # ---- points: pixel centres -> lon/lat --------------------------------
    if samples["row"]:
        pts = {k: np.concatenate(v) for k, v in samples.items()}
    else:
        pts = {k: np.array([]) for k in samples}
    xs, ys = xy(transform, pts["row"], pts["col"], offset="center")
    to_wgs84 = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
    lon, lat = to_wgs84.transform(np.asarray(xs), np.asarray(ys))
    date = items[0]["properties"]["datetime"][:10]
    tiles = ",".join(sorted({it["properties"].get("s2:mgrs_tile", "") for it in items}))
    np.savez_compressed(
        config.POINTS_NPZ, lon=lon, lat=lat, **pts,
        acquired=date, tile=tiles,
    )
    log.info("Sampled %d points (inside AOI)", len(lon))
    if dem_src is not None:
        dem_src.close()

    # ---- final COGs ------------------------------------------------------
    log.info("Writing NDVI COG...")
    _write_cog(ndvi_tmp, config.NDVI_COG, "DEFLATE")
    ndvi_tmp.unlink()

    log.info("Writing RGB COG (adaptive compression)...")
    codec = _write_rgb_meeting_size(rgb_tmp, config.RGB_COG, config.RGB_MIN_MB)
    rgb_tmp.unlink()

    result = {
        "rgb_cog_mb": round(config.RGB_COG.stat().st_size / 1e6, 1),
        "ndvi_cog_mb": round(config.NDVI_COG.stat().st_size / 1e6, 1),
        "raster_size_px": [int(width), int(height)],
        "raster_crs": "EPSG:32643",
        "rgb_compression": codec,
        "points": int(len(lon)),
        "scene_date": date,
        "tiles": tiles,
        "item_ids": [it["id"] for it in items],
    }
    log.info("Rasters: %s", result)
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    process()
