#!/bin/sh
set -e

attempt=0
until mc alias set local http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null 2>&1 \
  && mc ready local >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "MinIO did not become ready in time." >&2
    exit 1
  fi
  sleep 2
done

mc mb --ignore-existing "local/$MINIO_BUCKET"
# Media stays private; the API hands out short-lived presigned URLs.
mc anonymous set none "local/$MINIO_BUCKET"
echo "Bucket '$MINIO_BUCKET' is ready."
