# Python image for the one-off data pipeline.
# rasterio's wheels bundle GDAL, so no system GDAL install is needed and the
# pipeline behaves the same on Windows, macOS and Linux hosts.
FROM python:3.11-slim

# rasterio's bundled GDAL still dlopens system libs (libexpat, libgomp)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libexpat1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Make GDAL robust when reading large remote/local files.
ENV GDAL_HTTP_MAX_RETRY=5 \
    GDAL_HTTP_RETRY_DELAY=3 \
    GDAL_CACHEMAX=512 \
    PYTHONUNBUFFERED=1

CMD ["python", "run_all.py"]
