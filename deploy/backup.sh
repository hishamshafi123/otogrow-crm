#!/usr/bin/env bash
# Daily backup for the Otogrow CRM production stack.
# Dumps Postgres from the db container and tars the local file-storage volume,
# then rotates anything older than BACKUP_RETENTION_DAYS.
#
# Install on the VPS (as the deploy user):
#   chmod +x /opt/otogrow/repo/deploy/backup.sh
#   crontab -e
#   0 3 * * * /opt/otogrow/repo/deploy/backup.sh >> /var/log/otogrow-backup.log 2>&1
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose -f ${DEPLOY_DIR}/docker-compose.yml --env-file ${DEPLOY_DIR}/.env"

# shellcheck source=/dev/null
source "${DEPLOY_DIR}/.env"

BACKUP_DIR="${BACKUP_DIR:-/opt/otogrow/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Is)] starting backup ${TIMESTAMP}"

# 1. Postgres dump (plain SQL, gzip-compressed)
"${COMPOSE[@]}" exec -T db \
  pg_dump -U "${PG_DATABASE_USER}" -d "${PG_DATABASE_NAME}" --no-owner --no-privileges \
  | gzip > "${BACKUP_DIR}/otogrow-db-${TIMESTAMP}.sql.gz"

# 2. Local file storage (STORAGE_TYPE=local lives in the app-storage volume,
#    mounted in the app container)
"${COMPOSE[@]}" exec -T app \
  tar czf - -C /app/packages/twenty-server/.local-storage . \
  > "${BACKUP_DIR}/otogrow-storage-${TIMESTAMP}.tar.gz"

# 3. Local rotation
find "${BACKUP_DIR}" -name 'otogrow-*.gz' -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date -Is)] backup done: $(ls -lh "${BACKUP_DIR}"/*"${TIMESTAMP}"* | awk '{print $9, $5}')"

# ---------------------------------------------------------------------------
# OPTIONAL offsite copy (recommended once the VPS is stable):
#   1. Install rclone on the VPS and run `rclone config` to add a remote
#      (S3, B2, Drive, ...).
#   2. Uncomment the lines below, replacing REMOTE:otogrow-backups.
# rclone copy "${BACKUP_DIR}" REMOTE:otogrow-backups \
#   --include 'otogrow-*' --max-age 25h --log-level INFO
# ---------------------------------------------------------------------------
