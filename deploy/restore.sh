#!/usr/bin/env bash
# Restore a Postgres dump produced by backup.sh into the db container.
#
# Usage: ./restore.sh /opt/otogrow/backups/otogrow-db-20260901-030000.sql.gz
#
# Destructive: stops app + worker, drops and recreates the database, restores
# the dump, then starts the stack again. See the RUNBOOK restore drill.
set -euo pipefail
umask 077

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "${DEPLOY_DIR}/docker-compose.yml" --env-file "${DEPLOY_DIR}/.env")

# shellcheck source=/dev/null
source "${DEPLOY_DIR}/.env"
: "${PG_DATABASE_USER:?PG_DATABASE_USER is required}"
: "${PG_DATABASE_NAME:?PG_DATABASE_NAME is required}"

DUMP_FILE="${1:-}"

if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "usage: $0 <path-to-otogrow-db-*.sql.gz>" >&2
  exit 1
fi

# Invalid compressed input must not reach the destructive confirmation or database commands.
gzip -t "${DUMP_FILE}"

echo "About to REPLACE database '${PG_DATABASE_NAME}' with the contents of:"
echo "  ${DUMP_FILE}"
read -r -p "Type 'restore' to continue: " CONFIRM || { echo "aborted"; exit 1; }
if [[ "${CONFIRM}" != "restore" ]]; then
  echo "aborted"
  exit 1
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] stopping app and worker"
"${COMPOSE[@]}" stop app worker

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] recreating database"
"${COMPOSE[@]}" exec -T db \
  dropdb -U "${PG_DATABASE_USER}" --if-exists "${PG_DATABASE_NAME}"
"${COMPOSE[@]}" exec -T db \
  createdb -U "${PG_DATABASE_USER}" "${PG_DATABASE_NAME}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] restoring dump"
gunzip -c "${DUMP_FILE}" | "${COMPOSE[@]}" exec -T db \
  psql -U "${PG_DATABASE_USER}" -d "${PG_DATABASE_NAME}" -v ON_ERROR_STOP=1 --quiet

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] starting stack (entrypoint re-runs migrations/upgrade)"
"${COMPOSE[@]}" up -d

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] restore done — run the smoke-test checklist from the RUNBOOK"

# File storage is restored separately if needed:
#   cat otogrow-storage-TS.tar.gz | docker compose -f deploy/docker-compose.yml \
#     --env-file deploy/.env exec -T app \
#     tar xzf - -C /app/packages/twenty-server/.local-storage
