#!/usr/bin/env bash
# One-time (idempotent) provisioning for crm.otogrow.com on the shared VPS
# that already runs bon.otogrow.com and otogrow.com.
#
# Run as root:  sudo bash provision.sh
#
# Touches NOTHING belonging to BON or otogrow.com. It creates its own service
# user, deploy user, release tree, Node runtime, Redis instance, systemd
# units, Nginx vhost, installer and sudoers file. It starts no application
# service and changes no DNS.
#
# Specifically, it does NOT:
#   * modify /usr/bin/node (Node 22, owned by otogrow.com's unit)
#   * modify the packaged redis-server on 6379 (owned by BON)
#   * modify postgresql.conf, pg_hba.conf, or restart PostgreSQL
#   * add a default_server to Nginx, or touch bon.conf / otogrow.conf
set -Eeuo pipefail
umask 022

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '   ok  %s\n' "$*"; }
warn() { printf '   !!  %s\n' "$*"; }

[[ "$(id -u)" -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }

NODE_VERSION='24.18.0'   # matches packages/twenty-docker/twenty/Dockerfile
NODE_PREFIX='/opt/nodejs/24'
CRM_PORT='3002'
REDIS_PORT='6380'

required_files=(
  otogrow-crm.service
  otogrow-crm-worker.service
  otogrow-crm-migrate.service
  otogrow-crm-migrate
  otogrow-crm-install-release
  otogrow-crm.nginx.conf
  otogrow-crm-proxy.snippet.conf
  redis-otogrow-crm.service
  redis-otogrow-crm.conf
)
for f in "${required_files[@]}"; do
  [[ -f "$src/$f" ]] || { echo "Missing $src/$f" >&2; exit 1; }
done

say 'Refusing to run if it would disturb the existing sites'
for unit in bon-backend bon-user-dashboard otogrow; do
  if systemctl cat "$unit.service" >/dev/null 2>&1; then
    ok "$unit.service present, will not be touched"
  fi
done
for port in 80 443 3000 3001 5432 6379; do
  ok "port $port left alone"
done
if ss -ltn "( sport = :$CRM_PORT )" | grep -q ":$CRM_PORT"; then
  echo "Port $CRM_PORT is already in use; pick another and update the unit" >&2
  exit 1
fi
if ss -ltn "( sport = :$REDIS_PORT )" | grep -q ":$REDIS_PORT"; then
  echo "Port $REDIS_PORT is already in use; pick another" >&2
  exit 1
fi
ok "ports $CRM_PORT (app) and $REDIS_PORT (redis) are free"

say 'Base packages'
# postgresql-contrib supplies the unaccent extension setup-db.js creates.
# Everything here is either already installed or additive.
apt-get update -qq
apt-get install -y --no-install-recommends \
  ca-certificates curl xz-utils postgresql-contrib redis-server jq ffmpeg
ok 'ca-certificates curl xz-utils postgresql-contrib redis-server jq ffmpeg'

say "Node.js $NODE_VERSION at $NODE_PREFIX"
# Deliberately NOT installed system-wide. /usr/bin/node stays on Node 22,
# which is what otogrow.com's unit executes. Every CRM unit hard-codes
# $NODE_PREFIX/bin/node instead.
if [[ -x "$NODE_PREFIX/bin/node" ]] \
  && [[ "$("$NODE_PREFIX/bin/node" -v)" == "v$NODE_VERSION" ]]; then
  ok "already present ($("$NODE_PREFIX/bin/node" -v))"
else
  tmp="$(mktemp -d)"
  trap 'rm -rf -- "$tmp"' RETURN
  tarball="node-v$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSL --retry 3 -o "$tmp/$tarball" \
    "https://nodejs.org/dist/v$NODE_VERSION/$tarball"
  curl -fsSL --retry 3 -o "$tmp/SHASUMS256.txt" \
    "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  ( cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c - )
  ok 'checksum verified'
  install -d -o root -g root -m 0755 /opt/nodejs
  rm -rf -- "$NODE_PREFIX"
  mkdir -p "$NODE_PREFIX"
  tar -xJf "$tmp/$tarball" -C "$NODE_PREFIX" --strip-components=1
  chown -R root:root "$NODE_PREFIX"
  rm -rf -- "$tmp"
  trap - RETURN
  ok "installed $("$NODE_PREFIX/bin/node" -v)"
fi
"$NODE_PREFIX/bin/node" -v >/dev/null
[[ "$(readlink -f /usr/bin/node)" != "$NODE_PREFIX"* ]] \
  || { echo '/usr/bin/node now points into the CRM runtime; aborting' >&2; exit 1; }
ok "/usr/bin/node still $(/usr/bin/node -v) and untouched"

say 'Users'
if ! id crmapp >/dev/null 2>&1; then
  adduser --system --group --home /nonexistent --no-create-home crmapp
fi
ok "service user crmapp (uid $(id -u crmapp))"

if ! id crmdeploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos '' crmdeploy
  passwd -l crmdeploy >/dev/null
fi
ok "deploy user crmdeploy (uid $(id -u crmdeploy))"

say 'Directories'
install -d -o root -g root       -m 0755 /opt/otogrow-crm \
                                         /opt/otogrow-crm/releases \
                                         /opt/otogrow-crm/deps
install -d -o root -g crmapp     -m 0750 /etc/otogrow-crm
install -d -o crmapp -g crmapp   -m 0750 /var/lib/otogrow-crm \
                                         /var/lib/otogrow-crm/storage \
                                         /var/cache/otogrow-crm \
                                         /var/log/otogrow-crm
install -d -o crmdeploy -g crmdeploy -m 0700 /home/crmdeploy/incoming \
                                             /home/crmdeploy/.ssh
touch /home/crmdeploy/.ssh/authorized_keys
chown crmdeploy:crmdeploy /home/crmdeploy/.ssh/authorized_keys
chmod 0600 /home/crmdeploy/.ssh/authorized_keys
ok 'release tree, deps store, storage, cache, logs, CI drop dir'

say "Dedicated Redis instance on 127.0.0.1:$REDIS_PORT"
# A second instance, NOT a change to the packaged one on 6379. BullMQ needs
# maxmemory-policy=noeviction, which is server-global -- forcing it on the
# shared instance would change behaviour for BON.
install -d -o redis -g redis -m 0750 /var/lib/redis-otogrow-crm \
                                     /var/log/redis-otogrow-crm
install -o root -g redis -m 0640 "$src/redis-otogrow-crm.conf" \
  /etc/redis/otogrow-crm.conf
install -o root -g root -m 0644 "$src/redis-otogrow-crm.service" \
  /etc/systemd/system/redis-otogrow-crm.service
systemd-analyze verify /etc/systemd/system/redis-otogrow-crm.service
systemctl daemon-reload
systemctl enable --now redis-otogrow-crm.service
for _ in $(seq 1 10); do
  redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping >/dev/null 2>&1 && break
  sleep 1
done
redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping | grep -q PONG
policy="$(redis-cli -h 127.0.0.1 -p "$REDIS_PORT" config get maxmemory-policy | tail -1)"
[[ "$policy" == 'noeviction' ]] || {
  echo "CRM Redis policy is '$policy', expected noeviction" >&2
  exit 1
}
ok "running, maxmemory-policy=noeviction, 6379 untouched"

say 'PostgreSQL role and database'
# Uses the PostgreSQL instance that is already running. No config file is
# edited and the server is never restarted, so BON and otogrow.com are
# unaffected. uuid-ossp and unaccent are trusted extensions in PG13+, so the
# database owner can create them without superuser.
if [[ -z "${CRM_DB_PASSWORD:-}" ]]; then
  CRM_DB_PASSWORD="$(openssl rand -base64 36 | tr -d '/+=' | cut -c1-40)"
  generated_db_password='true'
else
  generated_db_password='false'
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='crm'" | grep -q 1; then
  ok 'role crm already exists (password left as-is)'
  generated_db_password='false'
  CRM_DB_PASSWORD=''
else
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "CREATE ROLE crm LOGIN PASSWORD '$CRM_DB_PASSWORD'"
  ok 'role crm created'
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='crm'" | grep -q 1; then
  ok 'database crm already exists'
else
  sudo -u postgres createdb -O crm crm
  ok 'database crm created, owned by crm'
fi

# Created as superuser because a trusted extension still needs CREATE on the
# target schema; doing it here means setup-db.js finds them already present.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d crm -c \
  'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"' >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 -d crm -c \
  'CREATE EXTENSION IF NOT EXISTS "unaccent"' >/dev/null
ok 'extensions uuid-ossp and unaccent present'

say 'Environment file'
if [[ ! -f /etc/otogrow-crm/crm.env ]]; then
  cat > /etc/otogrow-crm/crm.env <<ENVEOF
# Filled by provision.sh; secrets marked <FILL_ME> must be set by hand.
NODE_ENV=production
NODE_PORT=$CRM_PORT
NODE_OPTIONS=--max-old-space-size=1024

SERVER_URL=https://crm.otogrow.com
FRONTEND_URL=https://crm.otogrow.com

PG_DATABASE_URL=postgres://crm:<FILL_ME>@127.0.0.1:5432/crm
REDIS_URL=redis://127.0.0.1:$REDIS_PORT

# openssl rand -base64 32
APP_SECRET=<FILL_ME>
ENCRYPTION_KEY=<FILL_ME>

# Persistent, outside the release tree so deploys and rollbacks never touch it.
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=/var/lib/otogrow-crm/storage

# Deliberate defaults -- see deploy/RUNBOOK.md section 4 before changing.
IS_MULTIWORKSPACE_ENABLED=false
IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS=true
IS_EMAIL_VERIFICATION_REQUIRED=false
SIGN_IN_PREFILLED=false
TWILIO_DRIVER=LOGGER
EMAIL_DRIVER=LOGGER
EMAIL_FROM_ADDRESS=noreply@otogrow.com
EMAIL_FROM_NAME=Otogrow CRM
ENVEOF
  if [[ "$generated_db_password" == 'true' ]]; then
    sed -i "s|postgres://crm:<FILL_ME>@|postgres://crm:$CRM_DB_PASSWORD@|" \
      /etc/otogrow-crm/crm.env
    ok 'created; database password filled in from the role just created'
  else
    ok 'created with placeholders'
  fi
else
  ok 'already exists, left untouched'
fi
chown root:crmapp /etc/otogrow-crm/crm.env
chmod 0640 /etc/otogrow-crm/crm.env

say 'Release installer and migration helper'
install -o root -g root -m 0755 "$src/otogrow-crm-install-release" \
  /usr/local/sbin/otogrow-crm-install-release
install -o root -g root -m 0755 "$src/otogrow-crm-migrate" \
  /usr/local/sbin/otogrow-crm-migrate
bash -n /usr/local/sbin/otogrow-crm-install-release
bash -n /usr/local/sbin/otogrow-crm-migrate
ok 'installed to /usr/local/sbin (syntax valid)'

say 'Sudoers for crmdeploy'
cat > /etc/sudoers.d/otogrow-crm-deploy <<'SUDOEOF'
Defaults:crmdeploy !requiretty
crmdeploy ALL=(root) NOPASSWD: /usr/local/sbin/otogrow-crm-install-release *
SUDOEOF
chown root:root /etc/sudoers.d/otogrow-crm-deploy
chmod 0440 /etc/sudoers.d/otogrow-crm-deploy
visudo -cf /etc/sudoers.d/otogrow-crm-deploy
ok 'crmdeploy may run only the release installer'

say 'systemd units'
for unit in otogrow-crm.service otogrow-crm-worker.service otogrow-crm-migrate.service; do
  install -o root -g root -m 0644 "$src/$unit" "/etc/systemd/system/$unit"
  systemd-analyze verify "/etc/systemd/system/$unit"
  ok "$unit installed and verified"
done
systemctl daemon-reload
ok 'units are NOT enabled and NOT started (no release exists yet)'

say 'Log rotation'
cat > /etc/logrotate.d/otogrow-crm <<'LOGEOF'
/var/log/otogrow-crm/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    su crmapp crmapp
}
/var/log/redis-otogrow-crm/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    su redis redis
}
LOGEOF
ok '/etc/logrotate.d/otogrow-crm'

say 'Nginx vhost'
install -o root -g root -m 0644 "$src/otogrow-crm-proxy.snippet.conf" \
  /etc/nginx/snippets/otogrow-crm-proxy.conf
install -o root -g root -m 0644 "$src/otogrow-crm.nginx.conf" \
  /etc/nginx/sites-available/otogrow-crm.conf

cert='/etc/nginx/certs/otogrow-crm-origin.pem'
key='/etc/nginx/certs/otogrow-crm-origin.key'
if [[ ! -f "$cert" || ! -f "$key" ]]; then
  # The existing otogrow.com Origin CA cert covers *.otogrow.com, which
  # includes crm.otogrow.com. Copy rather than symlink so a future rotation
  # of one vhost's cert cannot silently change the other's.
  if [[ -f /etc/nginx/certs/otogrow-origin.pem \
     && -f /etc/nginx/certs/otogrow-origin.key ]]; then
    install -o root -g root -m 0644 /etc/nginx/certs/otogrow-origin.pem "$cert"
    install -o root -g root -m 0600 /etc/nginx/certs/otogrow-origin.key "$key"
    ok 'copied the *.otogrow.com origin cert for crm.otogrow.com'
  fi
fi

if [[ -f "$cert" && -f "$key" ]]; then
  ln -sfn /etc/nginx/sites-available/otogrow-crm.conf \
          /etc/nginx/sites-enabled/otogrow-crm.conf
  if nginx -t; then
    systemctl reload nginx
    ok 'vhost enabled, nginx reloaded, bon.conf and otogrow.conf untouched'
  else
    rm -f /etc/nginx/sites-enabled/otogrow-crm.conf
    nginx -t
    echo 'nginx test failed; CRM vhost removed, other sites untouched' >&2
    exit 1
  fi
else
  warn "$cert / $key missing and no *.otogrow.com cert to copy."
  warn 'vhost installed but NOT enabled. Install an Origin CA cert covering'
  warn 'crm.otogrow.com (0644 pem / 0600 key, root:root), then re-run.'
fi

say 'Done'
cat <<NEXT
Nothing application-side is running yet, by design.

Provisioned:
  Node        $NODE_PREFIX/bin/node ($("$NODE_PREFIX/bin/node" -v))
  Redis       127.0.0.1:$REDIS_PORT  (redis-otogrow-crm.service, enabled)
  PostgreSQL  database "crm" owned by role "crm" on the existing instance
  App port    127.0.0.1:$CRM_PORT (nothing listening until the first deploy)

Remaining steps:

  1. Fill the remaining secrets -- no <FILL_ME> may remain:
       grep -n '<FILL_ME>' /etc/otogrow-crm/crm.env
     Generate each with:  openssl rand -base64 32

  2. Add the CI deploy public key to
       /home/crmdeploy/.ssh/authorized_keys

  3. Point crm.otogrow.com at this host in Cloudflare DNS (proxied).

  4. Push to main to deploy. After the first successful deploy:
       systemctl enable otogrow-crm.service otogrow-crm-worker.service
NEXT

if [[ "$generated_db_password" == 'true' ]]; then
  echo
  echo "A PostgreSQL password for role \"crm\" was generated and written to"
  echo "/etc/otogrow-crm/crm.env. Save it in your password manager now:"
  echo
  echo "    $CRM_DB_PASSWORD"
  echo
fi
