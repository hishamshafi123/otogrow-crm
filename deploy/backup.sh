#!/usr/bin/env bash
set -euo pipefail
umask 077

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "${DEPLOY_DIR}/docker-compose.yml" --env-file "${DEPLOY_DIR}/.env")

# shellcheck source=/dev/null
source "${DEPLOY_DIR}/.env"
: "${PG_DATABASE_USER:?PG_DATABASE_USER is required}"
: "${PG_DATABASE_NAME:?PG_DATABASE_NAME is required}"
BACKUP_DIR="${BACKUP_DIR:-/opt/otogrow/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
if [[ ! "${RETENTION_DAYS}" =~ ^[1-9][0-9]*$ ]]; then
  echo 'BACKUP_RETENTION_DAYS must be a positive number of days.' >&2
  exit 64
fi
mkdir -p "${BACKUP_DIR}"
PENDING_DIR="$(mktemp -d "${BACKUP_DIR}/.otogrow-backup.XXXXXX")"
trap 'rm -rf -- "${PENDING_DIR}"' EXIT
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)-${PENDING_DIR##*.}"
DATABASE_FILE="otogrow-db-${TIMESTAMP}.sql.gz"
STORAGE_FILE="otogrow-storage-${TIMESTAMP}.tar.gz"

echo "Starting backup ${TIMESTAMP}"
"${COMPOSE[@]}" exec -T db \
  pg_dump -U "${PG_DATABASE_USER}" -d "${PG_DATABASE_NAME}" --no-owner --no-privileges \
  | gzip > "${PENDING_DIR}/${DATABASE_FILE}"
gzip -t "${PENDING_DIR}/${DATABASE_FILE}"
"${COMPOSE[@]}" exec -T app \
  tar czf - -C /app/packages/twenty-server/.local-storage . \
  > "${PENDING_DIR}/${STORAGE_FILE}"
tar tzf "${PENDING_DIR}/${STORAGE_FILE}" > /dev/null

# A ready marker distinguishes a complete pair from an interrupted final move.
mv "${PENDING_DIR}/${DATABASE_FILE}" "${BACKUP_DIR}/${DATABASE_FILE}"
mv "${PENDING_DIR}/${STORAGE_FILE}" "${BACKUP_DIR}/${STORAGE_FILE}"
printf '%s\n%s\n' "${DATABASE_FILE}" "${STORAGE_FILE}" > "${PENDING_DIR}/complete"
mv "${PENDING_DIR}/complete" "${BACKUP_DIR}/otogrow-${TIMESTAMP}.complete"
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'otogrow-*.gz' -mtime "+${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'otogrow-*.complete' -mtime "+${RETENTION_DAYS}" -delete
echo "Backup complete: ${BACKUP_DIR}/${DATABASE_FILE} and ${BACKUP_DIR}/${STORAGE_FILE}"
