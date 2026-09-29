"""
Step 5: (re-)publish everything in GeoServer through its REST API.

Because layer structures changed (4-band RGB, new DEM/hillshade/contours/AOI
layers), we DELETE existing stores/layers with recurse=true and recreate.
Styles are PUT-if-exists, POST-otherwise.

Resulting layers (all under workspace ndvi_portal):
  rgb            default rgb_stretch, extra style false_color (NIR-R-G)
  ndvi           ndvi_ramp
  dem            dem_elevation
  hillshade      hillshade
  sample_points  points_ndvi
  aoi_boundary   aoi_boundary
  contours       contours
"""
import logging
import time

import requests
from urllib.parse import urlparse

import config

log = logging.getLogger(__name__)

REST = f"{config.GEOSERVER_URL}/rest"
WS = config.GEOSERVER_WORKSPACE
AUTH = (config.GEOSERVER_USER, config.GEOSERVER_PASSWORD)
JSON = {"Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Small REST helpers
# ---------------------------------------------------------------------------
def _req(method: str, path: str, ok_statuses=(200, 201, 202), **kw) -> requests.Response:
    r = requests.request(method, f"{REST}{path}", auth=AUTH, timeout=300, **kw)
    if r.status_code not in ok_statuses and r.status_code >= 400:
        raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:300]}")
    return r


def _exists(path: str) -> bool:
    r = requests.get(f"{REST}{path}", auth=AUTH, timeout=60)
    return r.status_code == 200


def _delete_if_exists(path: str) -> None:
    """DELETE ignoring 404, but re-raising anything else."""
    r = requests.delete(f"{REST}{path}", auth=AUTH, timeout=120)
    if r.status_code not in (200, 202, 404):
        raise RuntimeError(f"DELETE {path} -> {r.status_code}: {r.text[:200]}")


def wait_for_geoserver(timeout_s: int = 300) -> None:
    """GeoServer takes a while to boot; poll until the REST API answers."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            if requests.get(f"{REST}/about/version.json", auth=AUTH, timeout=5).ok:
                return
        except requests.RequestException:
            pass
        log.info("Waiting for GeoServer...")
        time.sleep(5)
    raise TimeoutError("GeoServer did not become ready in time")


# ---------------------------------------------------------------------------
# Workspace + tear-down
# ---------------------------------------------------------------------------
def create_workspace() -> None:
    if _exists(f"/workspaces/{WS}.json"):
        log.info("Workspace %s exists", WS)
        return
    _req("POST", "/workspaces", json={"workspace": {"name": WS}}, headers=JSON)
    log.info("Created workspace %s", WS)


def _teardown_stores() -> None:
    """
    Remove any pre-existing stores and their layers so we can start clean.
    recurse=true cascades to featuretypes/coverages/layers. Safe if they
    don't exist yet.
    """
    for cs in ("rgb", "ndvi", "dem", "hillshade"):
        _delete_if_exists(f"/workspaces/{WS}/coveragestores/{cs}?recurse=true&purge=none")
    _delete_if_exists(f"/workspaces/{WS}/datastores/postgis?recurse=true")
    log.info("Removed any pre-existing stores")


# ---------------------------------------------------------------------------
# Stores (vector + raster)
# ---------------------------------------------------------------------------
def create_postgis_store() -> None:
    url = urlparse(config.DATABASE_URL)
    params = {
        "dbtype": "postgis",
        "host": url.hostname,
        "port": str(url.port or 5432),
        "database": url.path.lstrip("/"),
        "user": url.username,
        "passwd": url.password,
        "schema": "public",
        "Expose primary keys": "true",
        "Estimated extends": "true",
    }
    body = {
        "dataStore": {
            "name": "postgis",
            "connectionParameters": {"entry": [{"@key": k, "$": v} for k, v in params.items()]},
        }
    }
    _req("POST", f"/workspaces/{WS}/datastores", json=body, headers=JSON)
    log.info("PostGIS store ready")


def publish_feature_type(name: str, title: str, srs: str = "EPSG:4326") -> None:
    body = {
        "featureType": {
            "name": name,
            "nativeName": name,
            "title": title,
            "srs": srs,
        }
    }
    _req(
        "POST",
        f"/workspaces/{WS}/datastores/postgis/featuretypes",
        json=body, headers=JSON,
    )
    log.info("Published feature type %s", name)


def publish_geotiff(store: str, filename: str, title: str) -> None:
    """Create a GeoTIFF store + coverage pointing at a file on GeoServer's disk."""
    file_url = f"file://{config.GEOSERVER_RASTER_DIR}/{filename}"
    _req(
        "PUT",
        f"/workspaces/{WS}/coveragestores/{store}/external.geotiff"
        f"?configure=first&coverageName={store}",
        data=file_url,
        headers={"Content-Type": "text/plain"},
    )
    _req(
        "PUT",
        f"/workspaces/{WS}/coveragestores/{store}/coverages/{store}",
        json={"coverage": {"title": title}},
        headers=JSON,
    )
    log.info("Published raster layer %s", store)


# ---------------------------------------------------------------------------
# Styles (upload + assignment)
# ---------------------------------------------------------------------------
def upload_style(name: str) -> None:
    sld = (config.STYLES_DIR / f"{name}.sld").read_bytes()
    headers = {"Content-Type": "application/vnd.ogc.sld+xml"}
    if _exists(f"/workspaces/{WS}/styles/{name}.json"):
        _req("PUT", f"/workspaces/{WS}/styles/{name}", data=sld, headers=headers)
    else:
        _req("POST", f"/workspaces/{WS}/styles?name={name}", data=sld, headers=headers)
    log.info("Style %s uploaded", name)


def set_default_style(layer: str, style: str) -> None:
    """Set the workspace-scoped style as the default for a layer."""
    for name in (style, f"{WS}:{style}"):
        body = {"layer": {"defaultStyle": {"name": name, "workspace": WS}}}
        _req("PUT", f"/layers/{WS}:{layer}", json=body, headers=JSON)
        current = _req("GET", f"/layers/{WS}:{layer}.json").json()
        if current["layer"]["defaultStyle"]["name"].endswith(style):
            return
    raise RuntimeError(f"Could not set style {style} on {layer}")


def add_alternate_style(layer: str, style: str) -> None:
    """
    Attach an additional style so clients can request STYLES=<style>. We
    fetch the current styles, append if missing, PUT back.
    """
    info = _req("GET", f"/layers/{WS}:{layer}.json").json()["layer"]
    styles_block = info.get("styles") or {"style": []}
    existing = styles_block.get("style") or []
    if not isinstance(existing, list):
        existing = [existing]
    if any(s.get("name", "").endswith(style) for s in existing):
        return
    existing.append({"name": style, "workspace": WS})
    body = {"layer": {"styles": {"@class": "linked-hash-set", "style": existing}}}
    _req("PUT", f"/layers/{WS}:{layer}", json=body, headers=JSON)
    log.info("Added alternate style %s to %s", style, layer)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def setup() -> dict:
    wait_for_geoserver()
    create_workspace()

    for style in (
        "rgb_stretch", "false_color", "ndvi_ramp",
        "dem_elevation", "hillshade",
        "points_ndvi", "aoi_boundary", "contours",
    ):
        upload_style(style)

    _teardown_stores()

    # Vector store + feature types.
    create_postgis_store()
    publish_feature_type("sample_points", "Sentinel-2 sample points (NDVI, RGB, elevation)")
    publish_feature_type("aoi_boundary", "Area of interest boundary")
    publish_feature_type("contours", "Elevation contours")

    # Raster stores. Only publish those whose files exist so partial
    # pipeline runs (e.g. no DEM yet) still succeed.
    publish_geotiff("rgb", config.RGB_COG.name, "Sentinel-2 true colour (4-band RGB+NIR)")
    publish_geotiff("ndvi", config.NDVI_COG.name, "NDVI (cloud masked, AOI clipped)")
    if config.DEM_COG.exists():
        publish_geotiff("dem", config.DEM_COG.name, "Elevation (Copernicus DEM GLO-30)")
    if config.HILLSHADE_COG.exists():
        publish_geotiff("hillshade", config.HILLSHADE_COG.name, "Hillshade (from GLO-30)")

    # Default styles.
    set_default_style("sample_points", "points_ndvi")
    set_default_style("rgb", "rgb_stretch")
    set_default_style("ndvi", "ndvi_ramp")
    set_default_style("aoi_boundary", "aoi_boundary")
    set_default_style("contours", "contours")
    if config.DEM_COG.exists():
        set_default_style("dem", "dem_elevation")
    if config.HILLSHADE_COG.exists():
        set_default_style("hillshade", "hillshade")

    # Alternate style: false-colour composite on the same RGB layer.
    add_alternate_style("rgb", "false_color")

    layers = [
        f"{WS}:rgb", f"{WS}:ndvi", f"{WS}:sample_points",
        f"{WS}:aoi_boundary", f"{WS}:contours",
    ]
    if config.DEM_COG.exists():
        layers.append(f"{WS}:dem")
    if config.HILLSHADE_COG.exists():
        layers.append(f"{WS}:hillshade")
    log.info("GeoServer ready: %s", layers)
    return {"geoserver_layers": layers}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    setup()
