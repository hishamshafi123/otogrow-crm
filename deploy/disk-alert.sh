#!/usr/bin/env bash
# Disk-usage alert: pings a healthchecks.io-style URL when the filesystem that
# holds Docker volumes exceeds DISK_ALERT_THRESHOLD percent.
#
# Wire it up on the VPS:
#   1. Create a check on healthchecks.io (free), set its period to 1 day,
#      and put its ping URL as DISK_ALERT_PING_URL in deploy/.env.
#   2. crontab -e
#      17 * * * * /opt/otogrow/repo/deploy/disk-alert.sh
# The ping only fires on breach, so silence at healthchecks.io means "disk ok";
# alerts come from the ping itself (configure email/Slack notification there —
# no SMTP needed on the VPS).
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=/dev/null
source "${DEPLOY_DIR}/.env"

THRESHOLD="${DISK_ALERT_THRESHOLD:-80}"
PING_URL="${DISK_ALERT_PING_URL:-}"

if [[ -z "${PING_URL}" ]]; then
  echo "DISK_ALERT_PING_URL is not set in ${DEPLOY_DIR}/.env" >&2
  exit 1
fi

# Docker volumes live under /var/lib/docker; its filesystem is what matters.
USAGE="$(df -P /var/lib/docker | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"

if (( USAGE >= THRESHOLD )); then
  curl -fsS -m 10 --retry 3 \
    --data-raw "disk usage at ${USAGE}% (threshold ${THRESHOLD}%) on $(hostname)" \
    "${PING_URL}/fail" > /dev/null
  echo "[$(date -Is)] disk usage ${USAGE}% >= ${THRESHOLD}% — alert pinged" >&2
fi
