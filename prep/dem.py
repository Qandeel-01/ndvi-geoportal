"""
Step 2b: build the Copernicus DEM GLO-30 mosaic and its derivatives.

Runs after download.py and before process.py so process.py can sample an
elevation value per point at no extra cost.

Outputs (all clipped to the AOI):
  data/rasters/dem_cop30.tif     float32 metres, EPSG:32643 @ 30 m, COG
  data/rasters/hillshade.tif     uint8 shading (0 nodata), COG
  data/vectors/terrain.json      elevation stats, contour lines (EPSG:4326),
                                 and a downsampled 2D grid ("ridgeline") that
                                 the web dashboard uses as its hero visual.

Copernicus DEM GLO-30 is free, no login, worldwide. Tiles are 1x1 degree in
EPSG:4326. Four tiles cover the AOI (N33E072, N33E073, N34E072, N34E073).
"""
import json
import logging
import math
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.merge import merge as rio_merge
from rasterio.shutil import copy as rio_copy
from rasterio.warp import calculate_default_transform, reproject
from rasterio.windows import Window
from shapely.geometry import mapping, shape

# contourpy: fast, well-maintained contour engine (matplotlib depends on it).
from contourpy import contour_generator

import aoi as aoi_mod
import config

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# STAC fetch + mosaic in the DEM's native CRS (EPSG:4326)
# ---------------------------------------------------------------------------
def _search_dem_items(geom) -> list:
    """Return every Cop DEM tile intersecting the AOI."""
    cat = pystac_client.Client.open(config.STAC_URL)
    search = cat.search(collections=[config.DEM_COLLECTION], intersects=mapping(geom))
    items = list(search.items())
    if not items:
        raise RuntimeError("Copernicus DEM STAC search returned no items")
    log.info("Cop DEM: %d tiles intersect AOI", len(items))
    return items


def _download_and_mosaic(items, tmp_dir: Path) -> Path:
    """Download each DEM tile, then merge into one GeoTIFF (still in 4326)."""
    tmp_dir.mkdir(parents=True, exist_ok=True)
    local_tifs = []
    for it in items:
        href = planetary_computer.sign(it.assets[config.DEM_ASSET].href)
        dst = tmp_dir / f"{it.id}.tif"
        if not dst.exists() or dst.stat().st_size == 0:
            log.info("Cop DEM downloading %s ...", it.id)
            _stream(href, dst)
        local_tifs.append(dst)

    # Open all tiles and merge with first-non-nodata-wins.
    srcs = [rasterio.open(p) for p in local_tifs]
    try:
        mosaic, transform = rio_merge(srcs, nodata=config.DEM_NODATA)
        profile = srcs[0].profile.copy()
    finally:
        for s in srcs:
            s.close()
    profile.update(
        driver="GTiff", height=mosaic.shape[1], width=mosaic.shape[2],
        transform=transform, nodata=config.DEM_NODATA, count=1, dtype="float32",
        tiled=True, blockxsize=512, blockysize=512, compress="DEFLATE",
    )
    merged_path = tmp_dir / "_merged_wgs84.tif"
    with rasterio.open(merged_path, "w", **profile) as dst:
        dst.write(mosaic.astype("float32"))
    return merged_path


def _stream(url: str, dest: Path, attempts: int = 4) -> None:
    """
    Streaming download without progress bar. Retries on transient network
    errors (DNS blips, connection resets) with exponential backoff. Each
    attempt starts from scratch: a .part is dropped between attempts.
    """
    import time
    import requests
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, attempts + 1):
        try:
            with requests.get(url, stream=True, timeout=180) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(1024 * 1024):
                        f.write(chunk)
            tmp.rename(dest)
            return
        except (requests.exceptions.ConnectionError,
                requests.exceptions.ChunkedEncodingError,
                requests.exceptions.Timeout) as e:
            wait = min(30, 3 * (2 ** (attempt - 1)))
            log.warning("Download attempt %d/%d failed (%s); retrying in %ds",
                        attempt, attempts, type(e).__name__, wait)
            try:
                tmp.unlink(missing_ok=True)
            except Exception:
                pass
            if attempt == attempts:
                raise
            time.sleep(wait)


# ---------------------------------------------------------------------------
# Reproject to EPSG:32643 at 30 m, clip to AOI
# ---------------------------------------------------------------------------
def _reproject_clip(src_path: Path, aoi_geom_wgs84, tmp_dir: Path) -> Path:
    """
    Reproject the WGS84 mosaic to EPSG:32643 at 30 m and clip to the AOI.
    Grid alignment: snap the transform origin to a multiple of 30 m so the
    result is a clean grid, matching common cartographic conventions.
    """
    import geopandas as gpd

    aoi_utm = gpd.GeoSeries([aoi_geom_wgs84], crs="EPSG:4326").to_crs(
        config.DEM_TARGET_CRS
    ).iloc[0]
    minx, miny, maxx, maxy = aoi_utm.bounds
    res = config.DEM_TARGET_RES
    # Snap outward so the AOI stays fully inside.
    minx = math.floor(minx / res) * res
    miny = math.floor(miny / res) * res
    maxx = math.ceil(maxx / res) * res
    maxy = math.ceil(maxy / res) * res
    width = int((maxx - minx) / res)
    height = int((maxy - miny) / res)
    dst_transform = rasterio.transform.from_origin(minx, maxy, res, res)

    with rasterio.open(src_path) as src:
        dst_path = tmp_dir / "_dem_utm.tif"
        profile = {
            "driver": "GTiff", "height": height, "width": width, "count": 1,
            "dtype": "float32", "crs": config.DEM_TARGET_CRS,
            "transform": dst_transform, "nodata": config.DEM_NODATA,
            "tiled": True, "blockxsize": 512, "blockysize": 512,
            "compress": "DEFLATE",
        }
        with rasterio.open(dst_path, "w", **profile) as dst:
            reproject(
                source=rasterio.band(src, 1),
                destination=rasterio.band(dst, 1),
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=dst_transform,
                dst_crs=config.DEM_TARGET_CRS,
                dst_nodata=config.DEM_NODATA,
                src_nodata=src.nodata,
                resampling=Resampling.bilinear,
            )

    # Clip: set values outside AOI to nodata so downstream stats and colour
    # ramps ignore them. We reopen in r+ mode and rewrite once with the mask.
    with rasterio.open(dst_path, "r+") as ds:
        data = ds.read(1)
        mask = geometry_mask(
            [mapping(aoi_utm)],
            out_shape=data.shape,
            transform=ds.transform,
            invert=False,  # True = pixels inside geom; invert=False -> mask is TRUE outside
        )
        data[mask] = config.DEM_NODATA
        ds.write(data, 1)
    return dst_path


def _to_cog(src: Path, dst: Path) -> None:
    rio_copy(
        src, dst,
        driver="COG",
        COMPRESS="DEFLATE",
        PREDICTOR="YES",
        BLOCKSIZE=512,
        OVERVIEW_RESAMPLING="AVERAGE",
        BIGTIFF="IF_SAFER",
        NUM_THREADS="ALL_CPUS",
    )


# ---------------------------------------------------------------------------
# Hillshade (numpy, no external tool)
# ---------------------------------------------------------------------------
def _hillshade(dem: np.ndarray, res: float, az_deg: float, alt_deg: float) -> np.ndarray:
    """
    Standard Horn hillshade. Returns uint8 0-255 (0 = shadow, 254 = light,
    255 reserved as nodata for masked cells).
    """
    az = math.radians(360.0 - az_deg + 90.0)  # convert from compass to math
    alt = math.radians(alt_deg)
    # Gradients (units: metres / metre) via central differences.
    gy, gx = np.gradient(dem.astype(np.float32), res)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    shaded = (
        np.sin(alt) * np.cos(slope)
        + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    )
    shaded = np.clip(shaded, 0.0, 1.0)
    return (shaded * 254).astype(np.uint8)


def _write_hillshade(dem_path: Path, out_path: Path) -> None:
    with rasterio.open(dem_path) as src:
        dem = src.read(1)
        profile = src.profile.copy()
        valid = dem != config.DEM_NODATA
        # Replace nodata with the local median so gradients don't spike at edges.
        safe = dem.copy()
        if valid.any():
            safe[~valid] = float(np.median(dem[valid]))
        hs = _hillshade(safe, res=config.DEM_TARGET_RES,
                        az_deg=config.HILLSHADE_AZIMUTH,
                        alt_deg=config.HILLSHADE_ALTITUDE)
        hs[~valid] = 0  # 0 = nodata for the uint8 raster
    profile.update(dtype="uint8", nodata=0, compress="DEFLATE")
    tmp = out_path.with_suffix(".tmp.tif")
    with rasterio.open(tmp, "w", **profile) as dst:
        dst.write(hs, 1)
    _to_cog(tmp, out_path)
    tmp.unlink()


# ---------------------------------------------------------------------------
# Contours (contourpy) + ridgeline (dashboard)
# ---------------------------------------------------------------------------
def _contours(dem_path: Path) -> list[dict]:
    """
    Generate contour lines at CONTOUR_INTERVAL, tagged major/minor.
    Returns a list of GeoJSON-like dicts in EPSG:4326.
    """
    import geopandas as gpd
    from shapely.geometry import LineString, MultiLineString

    with rasterio.open(dem_path) as src:
        z = src.read(1).astype(np.float32)
        valid = z != config.DEM_NODATA
        transform = src.transform
        crs = src.crs

    if not valid.any():
        return []
    zmin = float(np.floor(z[valid].min() / config.CONTOUR_INTERVAL)) * config.CONTOUR_INTERVAL
    zmax = float(np.ceil(z[valid].max() / config.CONTOUR_INTERVAL)) * config.CONTOUR_INTERVAL

    # contourpy wants 1D x/y arrays or a full grid; we use pixel indices then
    # convert to world coords via the affine transform.
    height, width = z.shape
    z_for_cg = np.where(valid, z, np.nan)
    # 'serial' is contourpy's default algorithm and supports LineType.Separate,
    # which yields a plain list of (n, 2) ndarrays for lines().
    cg = contour_generator(z=z_for_cg, name="serial", line_type="Separate")

    def _px_to_world(xs, ys):
        # transform * (col, row) -> (x, y)
        world_x = transform.a * xs + transform.b * ys + transform.c
        world_y = transform.d * xs + transform.e * ys + transform.f
        return world_x, world_y

    features_utm = []  # (elev, major, MultiLineString in UTM)
    elev = zmin
    while elev <= zmax + 0.5:
        try:
            polys = cg.lines(elev)
        except Exception:  # NaN edges can trip the generator on empty levels
            polys = []
        lines = []
        for poly in polys:
            # contourpy returns nested lists for some line types; normalise
            # to a (n, 2) ndarray of pixel-space coordinates.
            arr = np.asarray(poly, dtype=float)
            if arr.ndim != 2 or arr.shape[0] < 2 or arr.shape[1] < 2:
                continue
            xs, ys = _px_to_world(arr[:, 0], arr[:, 1])
            lines.append(list(zip(xs.tolist(), ys.tolist())))
        if lines:
            major = int(round(elev)) % config.CONTOUR_MAJOR_INTERVAL == 0
            geoms = [LineString(l) for l in lines]
            features_utm.append((int(round(elev)), major, MultiLineString(geoms)))
        elev += config.CONTOUR_INTERVAL

    if not features_utm:
        return []

    # Project all contours to WGS84 in one shot.
    geoms = [g for _, _, g in features_utm]
    gdf = gpd.GeoDataFrame(
        {"elev": [e for e, _, _ in features_utm],
         "major": [m for _, m, _ in features_utm]},
        geometry=geoms, crs=crs,
    ).to_crs("EPSG:4326")
    out = []
    for _, row in gdf.iterrows():
        out.append({
            "elev": int(row["elev"]),
            "major": bool(row["major"]),
            "geom": mapping(row.geometry),
        })
    log.info("Contours: %d lines at %dm interval", len(out), config.CONTOUR_INTERVAL)
    return out


def _ridgeline(dem_path: Path) -> list[list]:
    """
    Downsample the DEM into RIDGELINE_ROWS row-averaged profiles. Each profile
    is RIDGELINE_COLS wide. NaNs mark cells that are outside the AOI, so the
    web dashboard can draw a soft edge instead of dropping to zero.
    """
    with rasterio.open(dem_path) as src:
        z = src.read(1).astype(np.float32)
    z = np.where(z == config.DEM_NODATA, np.nan, z)
    h, w = z.shape
    rows = np.linspace(0, h, config.RIDGELINE_ROWS + 1, dtype=int)
    cols = np.linspace(0, w, config.RIDGELINE_COLS + 1, dtype=int)
    out = []
    for i in range(config.RIDGELINE_ROWS):
        r0, r1 = rows[i], rows[i + 1]
        band = z[r0:r1, :]
        line = []
        for j in range(config.RIDGELINE_COLS):
            c0, c1 = cols[j], cols[j + 1]
            block = band[:, c0:c1]
            if np.all(np.isnan(block)):
                line.append(None)
            else:
                line.append(float(np.nanmean(block)))
        out.append(line)
    return out


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def build_dem() -> dict:
    aoi_geom = aoi_mod.load_aoi_geom()
    config.RASTER_DIR.mkdir(parents=True, exist_ok=True)
    config.VECTOR_DIR.mkdir(parents=True, exist_ok=True)
    tmp_dir = config.DATA_DIR / "raw" / "_dem_tmp"

    items = _search_dem_items(aoi_geom)
    merged = _download_and_mosaic(items, tmp_dir)
    dem_utm = _reproject_clip(merged, aoi_geom, tmp_dir)

    # Compact final DEM as COG.
    log.info("Writing DEM COG...")
    _to_cog(dem_utm, config.DEM_COG)

    # Hillshade + contours + ridgeline all come from the projected DEM.
    log.info("Writing hillshade COG...")
    _write_hillshade(config.DEM_COG, config.HILLSHADE_COG)

    log.info("Generating contours...")
    contours = _contours(config.DEM_COG)

    log.info("Sampling ridgeline for dashboard...")
    ridgeline = _ridgeline(config.DEM_COG)

    with rasterio.open(config.DEM_COG) as ds:
        arr = ds.read(1)
        valid = arr != config.DEM_NODATA
        stats = {
            "elev_min_m": float(np.nanmin(arr[valid])) if valid.any() else None,
            "elev_max_m": float(np.nanmax(arr[valid])) if valid.any() else None,
            "elev_mean_m": float(np.nanmean(arr[valid])) if valid.any() else None,
            "dem_pixels": int(valid.sum()),
        }

    terrain = {
        "contours": contours,
        "ridgeline": ridgeline,
        "cols": config.RIDGELINE_COLS,
        "rows": config.RIDGELINE_ROWS,
        **stats,
    }
    config.TERRAIN_JSON.write_text(json.dumps(terrain))
    log.info("Terrain: %s", {k: v for k, v in terrain.items() if k not in {"contours", "ridgeline"}})

    return {
        "dem_cog_mb": round(config.DEM_COG.stat().st_size / 1e6, 1),
        "hillshade_cog_mb": round(config.HILLSHADE_COG.stat().st_size / 1e6, 1),
        "elev_min_m": stats["elev_min_m"],
        "elev_max_m": stats["elev_max_m"],
        "elev_mean_m": stats["elev_mean_m"],
        "contour_count": len(contours),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    build_dem()
