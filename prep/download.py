"""
Step 2: download the Sentinel-2 bands for every selected item.

Each item (one MGRS tile of the mosaic) gets its own directory under
data/raw/<item_id>/ so tiles can never collide by filename. Files that
already exist are skipped, and each download writes to a .part file first
so an interrupted run leaves no half-written GeoTIFF behind.

Signed URLs from Planetary Computer expire after a short time, so we sign
right before each download (not once at the start of the run).
"""
import json
import logging
from pathlib import Path

import planetary_computer
import pystac
import requests
from tqdm import tqdm

import config

log = logging.getLogger(__name__)
CHUNK = 1024 * 1024  # 1 MB


def _download(url: str, dest: Path, attempts: int = 4) -> None:
    """
    Stream a file to disk, writing to a .part file first. Retries on transient
    network errors (DNS blips, connection resets, chunked-encoding drops) with
    exponential backoff. Each retry restarts the whole file (S2 assets do not
    support byte-range resume through the STAC signed URL reliably).
    """
    import time
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, attempts + 1):
        try:
            with requests.get(url, stream=True, timeout=180) as r:
                r.raise_for_status()
                total = int(r.headers.get("content-length", 0))
                with open(tmp, "wb") as f, tqdm(
                    total=total, unit="B", unit_scale=True, desc=dest.name
                ) as bar:
                    for chunk in r.iter_content(CHUNK):
                        f.write(chunk)
                        bar.update(len(chunk))
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


def _download_one_item(item_dict: dict) -> dict[str, Path]:
    """Download every asset for one item into data/raw/<item_id>/."""
    item = pystac.Item.from_dict(item_dict)
    item_dir = config.RAW_DIR / item.id
    item_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for key, asset_name in config.ASSETS.items():
        dest = item_dir / f"{asset_name}.tif"
        paths[key] = dest
        if dest.exists() and dest.stat().st_size > 0:
            log.info("%s/%s already downloaded, skipping", item.id[:20], dest.name)
            continue
        href = planetary_computer.sign(item.assets[asset_name].href)
        log.info("Downloading %s/%s ...", item.id[:20], asset_name)
        _download(href, dest)
    return paths


def download_bands() -> dict[str, dict[str, Path]]:
    """
    Download every asset listed in config.ASSETS for every selected item.
    Returns {item_id: {asset_key: path}}.
    """
    items_path = config.RAW_DIR / "items.json"
    if not items_path.exists():
        raise FileNotFoundError(
            f"{items_path} missing. Run the search step first."
        )
    items = json.loads(items_path.read_text())

    out: dict[str, dict[str, Path]] = {}
    for it in items:
        out[it["id"]] = _download_one_item(it)
    return out


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    download_bands()
