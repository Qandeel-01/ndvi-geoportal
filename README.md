# NDVI Geoportal, Islamabad + Rawalpindi

An interactive dashboard that combines a **4-band Sentinel-2 image** (R, G, B, NIR), a cloud-masked **NDVI raster**, a **Copernicus DEM** with hillshade and contours, and **~2 million stratified-random sample points**, all clipped to the dissolved boundary of Islamabad Capital Territory and Rawalpindi (about 6,853 km²). Click anywhere on the map to identify the nearest point, its NDVI, RGB/NIR reflectance and elevation in a single API call.

**Stack:** React 18 + OpenLayers 10 + GSAP · Node.js 20 / Express · GeoServer 2.25 · PostgreSQL 16 + PostGIS 3.4 · Python 3.11 pipeline · Docker Compose

Full technical write-up: [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) (also as [`docs/DOCUMENTATION.pdf`](docs/DOCUMENTATION.pdf)).

---

---

## Verified results (real numbers from this build)

| Item | Value |
|---|---|
| AOI | Islamabad Capital Territory + Rawalpindi (geoBoundaries PAK ADM2, CC-BY 4.0) |
| AOI area | 6,852.8 km² |
| Scene date | 2025-10-13 |
| MGRS tiles mosaicked | 43SBS, 43SBT, 43SCS, 43SCT (mean cloud 0.00%) |
| Sample points | 1,910,911 |
| Points table size | 309 MB (480 MB with indexes) |
| RGB COG (4 bands: R, G, B, NIR) | 520 MB on disk (545 MB reported) |
| NDVI COG | 279 MB |
| DEM COG (Copernicus GLO-30, EPSG:32643, 30 m) | 25 MB |
| Hillshade COG | 6.4 MB |
| RGB compression codec used | DEFLATE (adaptive; no fallback needed) |
| Elevation range | 319 to 2,670 m (mean 625 m) |
| Contour features loaded | 23 (every 100 m; major every 500 m) |
| GeoServer layers published | 7 (rgb, ndvi, dem, hillshade, sample_points, aoi_boundary, contours) |

---

## Requirements checklist

| Requirement | How it is met | Verified |
|---|---|---|
| Raster and vector on a map | 7 layers published in GeoServer, drawn on OpenLayers | Yes |
| Raster ≥ 200 MB | RGB COG is 520 MB on disk | Yes (2.6×) |
| Vector table ≥ 200 MB | sample_points is 309 MB | Yes (1.5×) |
| Vector ≥ 50,000 features | 1,910,911 sample points | Yes (38×) |
| Click identifies pixel + attribute values | `/api/identify` returns nearest point + NDVI + RGB/NIR + DEM | Yes |
| Layer toggles | Custom switches + opacity sliders + RGB True/False colour segment | Yes |
| Basemap switcher | Dark, Imagery, Light, OSM (all upgrade to Mapbox when token set) | Yes |
| React + Node + GeoServer + PostGIS | Each has a single, defined responsibility | Yes |
| AOI = Islamabad + Rawalpindi boundary only, rasters clipped to it | `aoi.py` builds the polygon; `process.py` snaps and clips per window | Yes |
| Code quality (comments, lint, tests, docs) | ESLint clean, 15/15 unit tests + synthetic pipeline test pass | Yes |

---

## Quick start (Windows PowerShell)

Prerequisites: Docker Desktop (about 6 GB RAM allocated) and ~6 GB free disk. First pipeline run downloads ~1.3 GB (Sentinel-2 tiles + Copernicus DEM).

```powershell
# From the project folder:

# 1. Configuration. Copy the example and edit the passwords.
copy .env.example .env
notepad .env

# 2. Start the database and GeoServer.
docker compose up -d postgis geoserver

# 3. Run the data pipeline (about 30 to 50 minutes on the first run,
#    mostly network I/O for the satellite + DEM downloads).
docker compose run --rm prep python run_all.py

# 4. Start the API and the web app.
docker compose up -d --build api web
```

Open **http://localhost:3000**.

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API health | http://localhost:4000/api/health |
| GeoServer admin | http://localhost:8080/geoserver (set `GEOSERVER_HOST_PORT=8081` in `.env` if 8080 is in use by e.g. XAMPP) |
| PostGIS | `localhost:5433`, user/password from `.env` |

If your `.env` still has `change_me_pg` and `change_me_gs`, **change them before exposing anything publicly.** The stack is safe on `localhost` only.

### Re-running after upgrading

The loader applies the schema on every run (adds `elevation`, new tables) and GeoServer stores are recreated with `?recurse=true`. Existing data volumes upgrade in place:

```powershell
docker compose build prep
docker compose run --rm prep python run_all.py
docker compose up -d --build api web
```

### Custom AOI

Drop any `.geojson`, `.gpkg`, or `.shp` file into `data/aoi/` before running the pipeline; step 1 will dissolve it and use it instead of the default geoBoundaries download.

### Optional: Mapbox basemaps

Paste a Mapbox public token into `.env` on the `VITE_MAPBOX_TOKEN=` line, then `docker compose up -d --build web`. Dark, Imagery and Light will use Mapbox tiles instead of Carto/EOX. Free tier is 50k tile loads/month. Details in `.env.example`.

---

## Share a live demo (Cloudflare Tunnel)

Cloudflare Tunnel exposes only the web app; GeoServer, PostGIS and your `.env` stay private on your machine behind the Node proxy.

```powershell
# One-time install:
winget install --id Cloudflare.cloudflared

# Publish the running dashboard (fresh URL every run):
cloudflared tunnel --url http://localhost:3000
```

Copy the printed `https://*.trycloudflare.com` URL and share it. To stop, press `Ctrl+C` in the tunnel window.

---

## Tech decisions (short version)

- **Windowed multi-tile mosaic**, first-non-zero-wins, 20 m grid alignment: see [DOCUMENTATION.md § 3.5](docs/DOCUMENTATION.md#35-step-5-build-the-rgb-and-ndvi-images-processpy).
- **Adaptive compression** on RGB (DEFLATE → LZW → NONE) to guarantee the 200 MB size floor without hand-tuning: same section.
- **Idempotent schema**: the loader runs `prep/schema.sql` every time so upgrades apply in place; see [§ 3.6](docs/DOCUMENTATION.md#36-step-6-put-everything-into-the-database-load_postgispy).
- **Whitelisted WMS proxy** in the Node API so the browser never talks to GeoServer directly: [§ 5.2](docs/DOCUMENTATION.md#52-why-this-is-safe).
- **Hand-built SVG charts + GSAP entrances** so the dashboard uses no chart library and animations respect `prefers-reduced-motion`: [§ 7.1](docs/DOCUMENTATION.md#71-what-went-wrong-in-the-first-version-and-how-it-was-fixed).

---

## Project structure

```
ndvi-geoportal/
  docker-compose.yml         four services in one file
  .env.example               copy to .env, edit passwords / ports
  db/init/01_schema.sql      DB schema for fresh volumes
  prep/                      Python data pipeline (Docker container)
    run_all.py, aoi.py, stac_search.py, download.py, dem.py,
    process.py, load_postgis.py, setup_geoserver.py,
    schema.sql, test_synthetic.py, styles/*.sld
  api/                       Node.js / Express API
    src/{app.js, routes/, services/, middleware/, utils/}
    test/                    node:test unit tests
  web/                       React + OpenLayers + GSAP (Vite, served by Nginx)
    src/{App.jsx, components/, components/charts/, map/, utils/}
  docs/                      DOCUMENTATION.md + .docx + screenshots/
```

---

## Development (without Docker for API/web)

```powershell
# API (needs PostGIS + GeoServer running from docker compose)
cd api
copy .env.example .env
npm install
npm run dev

# Web app on http://localhost:5173 (Vite proxies /api and /geoserver to :4000)
cd web
npm install
npm run dev

# Quality checks
cd api; npm test; npm run lint
cd web; npm run lint; npm run build

# Synthetic pipeline test (no network, isolated tempdir)
docker compose run --rm --entrypoint python prep test_synthetic.py
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| geoBoundaries download returns a Git-LFS pointer | Confirm `config.AOI_ADM2_URL` uses `media.githubusercontent.com` |
| STAC returns no covering acquisition | Widen date range: `docker compose run --rm -e DATE_RANGE=2024-10-01/2026-06-30 -e MAX_CLOUD=15 prep python run_all.py` |
| Download interrupted mid-way | Re-run: finished bands are skipped, partial `.part` files are ignored |
| `GeoServer did not become ready` | GeoServer can take 1 to 2 min on first start. `docker compose logs geoserver`, then re-run with `--skip aoi search download dem process load` |
| RGB COG < 200 MB after adaptive compression | Very rare; lower `SAMPLE_STEP` to 5 in `.env` to raise the points table above 200 MB |
| Points table below 200 MB | `SAMPLE_STEP=5` and `docker compose run --rm prep python run_all.py --skip aoi search download dem` |
| Process step killed / OOM | Increase Docker Desktop memory to 6 to 8 GB |
| Port 8080 in use (XAMPP Apache) | Set `GEOSERVER_HOST_PORT=8081` in `.env` |
| Imagery basemap not loading | Set `VITE_MAPBOX_TOKEN` in `.env` and `docker compose up -d --build web`; EOX default sometimes rate-limits |
