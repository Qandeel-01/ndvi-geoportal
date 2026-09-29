"""
Central configuration for the data pipeline.

Everything tunable lives here so the individual steps stay free of magic
numbers. Values can be overridden with environment variables.
"""
import os
from pathlib import Path

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "../data")).resolve()
RAW_DIR = DATA_DIR / "raw"            # downloaded Sentinel-2 bands (per item)
RASTER_DIR = DATA_DIR / "rasters"     # final COGs served by GeoServer
VECTOR_DIR = DATA_DIR / "vectors"     # intermediate point samples + terrain JSON
AOI_DIR = DATA_DIR / "aoi"            # AOI GeoJSON + cached ADM2 download
MANIFEST = DATA_DIR / "manifest.json" # record of what was produced (sizes, counts)

# AOI GeoJSON (EPSG:4326, single dissolved polygon). Written by aoi.py.
AOI_GEOJSON = AOI_DIR / "aoi.geojson"

# Raster products (all COG, all clipped to AOI)
RGB_COG = RASTER_DIR / "rgb_s2.tif"          # 4-band: R, G, B, NIR (uint16)
NDVI_COG = RASTER_DIR / "ndvi_s2.tif"        # float32
DEM_COG = RASTER_DIR / "dem_cop30.tif"       # float32 (m)
HILLSHADE_COG = RASTER_DIR / "hillshade.tif" # uint8

# Intermediate vector data
POINTS_NPZ = VECTOR_DIR / "sample_points.npz"
TERRAIN_JSON = VECTOR_DIR / "terrain.json"   # DEM stats + ridgeline + contours

# --------------------------------------------------------------------------
# Area of interest
# --------------------------------------------------------------------------
# AOI is the dissolved boundary of these two ADM2 units (geoBoundaries PAK).
# aoi.py downloads and dissolves them, or reads a user-supplied file in AOI_DIR.
AOI_ADM2_NAMES = ("Islamabad Capital Territory", "Rawalpindi")

# The raw ADM2 GeoJSON. Uses media.githubusercontent.com because raw.
# githubusercontent.com returns a Git LFS pointer for this dataset.
AOI_ADM2_URL = (
    "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/"
    "main/releaseData/gbOpen/PAK/ADM2/geoBoundaries-PAK-ADM2.geojson"
)
AOI_ADM2_CACHE = AOI_DIR / "geoBoundaries-PAK-ADM2.geojson"

# A generous bbox around the AOI, used only for the STAC search (STAC needs
# a geometry; the real AOI is applied later to clip). Roughly Islamabad +
# Rawalpindi with a small margin, so STAC returns a manageable candidate list.
AOI_SEARCH_BBOX = (72.4, 32.9, 73.7, 34.2)

# --------------------------------------------------------------------------
# Scene search (Microsoft Planetary Computer STAC, no account needed)
# Post-monsoon / winter months give clear skies and good vegetation contrast.
# The AOI spans several MGRS tiles, so search.py groups items by date and
# picks the date whose union of footprints fully covers the AOI.
# --------------------------------------------------------------------------
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "sentinel-2-l2a"
DATE_RANGE = os.getenv("DATE_RANGE", "2025-10-01/2026-03-31")
MAX_CLOUD = float(os.getenv("MAX_CLOUD", "10"))

# Assets we need: blue, green, red, NIR (10 m) and the scene classification (20 m).
ASSETS = {"blue": "B02", "green": "B03", "red": "B04", "nir": "B08", "scl": "SCL"}

# --------------------------------------------------------------------------
# Copernicus DEM GLO-30 (30 m, global). Free, no login. Best available
# open-data DEM for Pakistan and easily mosaicked from 1x1 degree tiles.
# --------------------------------------------------------------------------
DEM_COLLECTION = "cop-dem-glo-30"
DEM_ASSET = "data"           # STAC asset key for the elevation GeoTIFF
DEM_NODATA = -32767.0
DEM_TARGET_CRS = "EPSG:32643"
DEM_TARGET_RES = 30.0

# Hillshade shading angles (degrees). Standard cartographic defaults.
HILLSHADE_AZIMUTH = 315.0
HILLSHADE_ALTITUDE = 45.0

# Contour intervals (metres). Major contours drawn thicker/labelled in SLD.
CONTOUR_INTERVAL = 100
CONTOUR_MAJOR_INTERVAL = 500

# Dashboard ridgeline sample (rows x cols) computed once by dem.py.
RIDGELINE_ROWS = 42
RIDGELINE_COLS = 140

# --------------------------------------------------------------------------
# Raster processing
# --------------------------------------------------------------------------
BLOCK = 1024                 # processing window size in pixels (keeps RAM low)
NODATA_RGB = 0
NODATA_NDVI = -9999.0

# Adaptive compression: we try DEFLATE first; if the RGB COG comes out below
# RGB_MIN_MB (the assessment floor), we rewrite with a weaker codec so the
# 200 MB requirement is met without hand-tuning per scene.
COG_COMPRESS_TRY = ("DEFLATE", "LZW", "NONE")
RGB_MIN_MB = int(os.getenv("RGB_MIN_MB", "200"))

# Grid alignment: snap the AOI-clipped raster grid to multiples of 20 m so
# the 10 m bands and the 20 m SCL align on the same pixel edges. All MGRS
# tile origins are multiples of 20 m, so this also keeps every source pixel
# on-grid when we mosaic tiles.
GRID_ALIGN_M = 20

# Since processing baseline 04.00 (Jan 2022) L2A digital numbers carry a
# +1000 offset: reflectance = (DN - 1000) / 10000. We remove it so every
# scene is on the same "reflectance x 10000" scale.
BOA_OFFSET_BASELINE = "04.00"
BOA_OFFSET = 1000

# Scene Classification (SCL) codes treated as invalid for NDVI.
# 0 no data, 1 saturated/defective, 3 cloud shadow, 8/9 cloud, 10 cirrus
INVALID_SCL = {0, 1, 3, 8, 9, 10}
SCL_LABELS = {
    0: "no_data", 1: "saturated", 2: "dark_area", 3: "cloud_shadow",
    4: "vegetation", 5: "bare_soil", 6: "water", 7: "unclassified",
    8: "cloud_medium", 9: "cloud_high", 10: "cirrus", 11: "snow_ice",
}

# NDVI classes (upper bounds, exclusive). Used for the point attribute.
NDVI_CLASSES = [
    (0.0, "water"),        # < 0.0
    (0.2, "bare_built"),   # 0.0 - 0.2
    (0.4, "sparse"),       # 0.2 - 0.4
    (0.6, "moderate"),     # 0.4 - 0.6
    (9.9, "dense"),        # >= 0.6
]

# --------------------------------------------------------------------------
# Point sampling: one random valid pixel per SAMPLE_STEP x SAMPLE_STEP block
# (stratified random sampling). Over the ~6,850 km2 AOI at step 6 we get
# roughly 1.9M points; step 5 gives ~2.7M if we need a bigger table.
# --------------------------------------------------------------------------
SAMPLE_STEP = int(os.getenv("SAMPLE_STEP", "6"))
RANDOM_SEED = 42

# --------------------------------------------------------------------------
# Services
# --------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://gis:change_me_pg@localhost:5433/gis")
GEOSERVER_URL = os.getenv("GEOSERVER_URL", "http://localhost:8080/geoserver")
GEOSERVER_USER = os.getenv("GEOSERVER_ADMIN_USER", "admin")
GEOSERVER_PASSWORD = os.getenv("GEOSERVER_ADMIN_PASSWORD", "change_me_gs")
GEOSERVER_WORKSPACE = os.getenv("GEOSERVER_WORKSPACE", "ndvi_portal")
# Where GeoServer (inside its own container) finds the rasters.
GEOSERVER_RASTER_DIR = os.getenv("GEOSERVER_RASTER_DIR", "/data/rasters")

STYLES_DIR = Path(__file__).parent / "styles"
SCHEMA_SQL = Path(__file__).parent / "schema.sql"
