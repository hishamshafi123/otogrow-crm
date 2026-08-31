# crm.otogrow.com — native deployment

Runbook for deploying this fork to the shared Hostinger VPS that already runs
`bon.otogrow.com` and `otogrow.com`.

This supersedes `deploy/RUNBOOK.md` and `deploy/docker-compose.yml`, which
describe a Docker Compose stack on a dedicated host. **Docker is not used.**
See "Why not Docker" below.

- Server: Hostinger KVM 2, Ubuntu 24.04, 2 vCPU, 8 GB RAM, 96 GB disk
- Runtime model: native systemd units, atomic release directories
- Public entry: Cloudflare → Nginx on 443 → `127.0.0.1:3002`
- CI/CD: GitHub Actions builds; Tailscale + SSH ships; a root-owned
  installer migrates, swaps and health-checks
- Data: the VPS's existing PostgreSQL 16, plus a Redis instance dedicated
  to this app

---

## Separation from the other two sites

Nothing here shares a file, user, port, unit, lock or process with BON or
otogrow.com. That is deliberate and load-bearing — `provision.sh` aborts
rather than disturb them.

| | BON | otogrow.com | **otogrow-crm** |
| --- | --- | --- | --- |
| Service user | `bonapp` | `otogrowapp` | **`crmapp`** |
| Deploy user | `bondeploy` | `otodeploy` | **`crmdeploy`** |
| App port | 8080 / 3000 | 3001 | **3002** |
| Node | system | `/usr/bin/node` (22) | **`/opt/nodejs/24`** |
| Redis | 6379 | — | **6380 (own instance)** |
| PostgreSQL | shared instance | shared instance | **shared instance, own role + DB** |
| Release root | `/opt/bon` | `/opt/otogrow` | **`/opt/otogrow-crm`** |
| Nginx vhost | `bon.conf` | `otogrow.conf` | **`otogrow-crm.conf`** |
| Installer | `bon-install-release` | `otogrow-install-release` | **`otogrow-crm-install-release`** |
| Deploy lock | `bon-deploy.lock` | `otogrow-deploy.lock` | **`otogrow-crm-deploy.lock`** |

Three shared resources, and how each is kept safe:

- **Nginx** — `otogrow-crm.conf` declares no `default_server` (`bon.conf`
  owns those; a duplicate makes `nginx -t` fail and takes both other sites
  down). All `map` and `limit_req_zone` names are `crm_`-prefixed because
  that namespace is shared across every vhost. `provision.sh` removes its own
  symlink and aborts if `nginx -t` fails.
- **PostgreSQL** — a new role and database on the running instance. No
  config file is edited and the server is never restarted.
- **`/usr/bin/node`** — left on Node 22, which otogrow.com's unit executes.
  Node 24 goes to `/opt/nodejs/24` and every CRM unit hard-codes that path.

---

## Why not Docker

Twenty ships a Dockerfile and this fork carries a Compose stack, so Docker was
the obvious first choice. It was rejected for this host:

- The Compose file publishes ports **80 and 443 for Caddy**, which Nginx
  already owns. Caddy is dropped entirely; its `/forms` and `/portal` routing
  rule is ported into `otogrow-crm.nginx.conf`.
- Compose brings **its own Postgres and Redis containers**, duplicating
  services the VPS already runs.
- Image storage costs money on GHCR for a private package of this size, and
  a registry on the VPS is one more moving part.
- The box is otherwise 100% systemd-native; a container daemon would be the
  only one of its kind on it.

**The cost of this choice**, stated plainly: the upstream `Dockerfile` is
Twenty's maintained build definition, and this deployment replaces it with a
hand-maintained equivalent split across
`.github/workflows/cd-deploy-otogrow-crm.yaml` (artifact assembly) and
`otogrow-crm-migrate` (a shell port of `entrypoint.sh`). **When merging
upstream, diff `packages/twenty-docker/twenty/Dockerfile` and
`entrypoint.sh` against those two files.** A change to the build output
layout or the startup sequence will not surface any other way.

---

## Architecture

```
Cloudflare (proxied)
  └── Nginx :443  crm.otogrow.com          [existing nginx, new vhost]
        └── 127.0.0.1:3002
              otogrow-crm.service          node dist/main
                ├── PostgreSQL 127.0.0.1:5432   db "crm"    [existing instance]
                ├── Redis      127.0.0.1:6380               [new instance]
                └── /var/lib/otogrow-crm/storage            [uploaded files]

              otogrow-crm-worker.service   node dist/queue-worker/queue-worker
              otogrow-crm-migrate.service  oneshot, run by the installer
```

The Nest process serves both the API and the built SPA (`dist/front`, via
`@nestjs/serve-static`), so there is one upstream and no separate static root.

### Filesystem layout

```
/opt/otogrow-crm/
  current -> releases/<sha>        atomic symlink
  releases/<sha>/                  root-owned, read-only at runtime
    packages/twenty-server/dist/   compiled server
                          /front/  built SPA
    node_modules/                  hard-linked from deps/<key>
    REVISION  DEPS_KEY
  deps/<sha256>/node_modules       content-addressed dependency store

/etc/otogrow-crm/crm.env           root:crmapp 0640 — all secrets
/var/lib/otogrow-crm/storage       uploaded files, survives deploys
/var/cache/otogrow-crm             scratch
/home/crmdeploy/incoming/          CI drop directory
/opt/nodejs/24/bin/node            Node 24 runtime
```

### The dependency store

Twenty's production `node_modules` is several hundred megabytes. Shipping it
on every deploy would mean a multi-minute upload for a one-line change, so it
is content-addressed by a hash of `yarn.lock`, `.yarnrc.yml` and the
production workspaces' manifests.

CI asks the server whether it already holds that key and uploads the
dependency archive only when it does not. **A deploy that does not touch
`yarn.lock` ships code alone.**

The installer **hard-links** (`cp -al`) the stored tree into each release
rather than symlinking it. This matters: yarn writes relative workspace links
such as `node_modules/twenty-shared -> ../packages/twenty-shared`, which only
resolve when `node_modules` sits directly beside `packages/` inside the
release. Hard links give each release a correctly rooted tree for almost no
extra disk.

---

## First-time setup

### 1. Provision the VPS

```bash
# from your workstation
rsync -av deploy/native/ otogrow-hostinger-vps:~/crm-native/
ssh otogrow-hostinger-vps
sudo bash ~/crm-native/provision.sh
```

Idempotent, and it starts no application service. It creates the users,
directories, dependency store, Node 24 runtime, Redis instance, PostgreSQL
role and database, systemd units, logrotate rules, sudoers entry and the
Nginx vhost.

It prints a generated PostgreSQL password once — **save it**.

### 2. Fill in the secrets

```bash
sudo grep -n '<FILL_ME>' /etc/otogrow-crm/crm.env
sudo -e /etc/otogrow-crm/crm.env
```

Generate each with `openssl rand -base64 32`:

| Variable | Notes |
| --- | --- |
| `APP_SECRET` | signs sessions and tokens; rotating it logs everyone out |
| `ENCRYPTION_KEY` | encrypts stored secrets (e.g. Twilio tokens) at rest; falls back to `APP_SECRET` if unset |
| `PG_DATABASE_URL` | already filled by `provision.sh` if it created the role |

Deliberate defaults that should **not** be "fixed" — see `deploy/RUNBOOK.md`
§4 for the full reasoning:

- `EMAIL_DRIVER=LOGGER` — no SMTP yet, so **invite and password-reset emails
  are not delivered**. Share invite links manually from Settings → Members.
- `IS_EMAIL_VERIFICATION_REQUIRED=false` — must stay false while email is
  LOGGER, or the first sign-up stalls.
- `IS_MULTIWORKSPACE_ENABLED=false` — this is the "disable public sign-up"
  mechanism; once the first workspace exists, no other can be created.
- `TWILIO_DRIVER=LOGGER` — WhatsApp/SMS are logged, not sent.

### 3. Create the CI deploy key

On your workstation:

```bash
ssh-keygen -t ed25519 -C 'otogrow-crm CI' -f ~/.ssh/otogrow_crm_deploy -N ''
cat ~/.ssh/otogrow_crm_deploy.pub   # -> authorized_keys below
cat ~/.ssh/otogrow_crm_deploy       # -> GitHub secret CRM_DEPLOY_SSH_KEY
```

On the VPS:

```bash
sudo tee -a /home/crmdeploy/.ssh/authorized_keys < /dev/stdin <<'KEY'
<paste the .pub line>
KEY
sudo chown crmdeploy:crmdeploy /home/crmdeploy/.ssh/authorized_keys
sudo chmod 600 /home/crmdeploy/.ssh/authorized_keys
```

### 4. GitHub configuration

No environments are used — repository **secrets** and **variables** only.

| Secret | Where it comes from |
| --- | --- |
| `CRM_DEPLOY_SSH_KEY` | private half of the key from step 3 |
| `SERVER_SSH_KNOWN_HOSTS` | already set for otogrow.com; same host, reuse it |
| `TS_OAUTH_CLIENT_ID` | already set; same tailnet |
| `TS_OAUTH_SECRET` | already set; same tailnet |

| Variable | Value |
| --- | --- |
| `SERVER_TAILSCALE_HOST` | already set (`bon-test.<tailnet>.ts.net`) |
| `OTOGROW_CI_TAG` | already set (`tag:bon-ci`) |
| `CRM_PUBLIC_URL` | `https://crm.otogrow.com` |

Only `CRM_DEPLOY_SSH_KEY` and `CRM_PUBLIC_URL` are new.

### 5. DNS and TLS

Cloudflare: **A record `crm.otogrow.com` → the VPS IP, proxied**.

TLS uses a Cloudflare Origin CA certificate. The existing `*.otogrow.com`
origin cert covers this hostname, and `provision.sh` copies it to
`/etc/nginx/certs/otogrow-crm-origin.{pem,key}`. It copies rather than
symlinks so rotating one vhost's certificate cannot silently change the
other's.

### 6. Deploy

Push to `main`, or run the workflow manually. The first deploy takes longest:
it uploads the dependency archive and runs `database:init:prod` against an
empty database.

Then make the units survive a reboot:

```bash
sudo systemctl enable otogrow-crm.service otogrow-crm-worker.service
```

> They are deliberately **not** enabled by `provision.sh`, because enabling a
> unit with no release to run would fail on the next boot. This step is easy
> to forget — an unenabled unit works fine until the machine reboots, which
> is exactly what happened to BON.

### 7. First workspace

Browse to `https://crm.otogrow.com`. The first account registered becomes the
workspace admin, and sign-up closes behind it. There is **no password reset
until SMTP is configured**, so store the admin credentials properly.

---

## Deploying

`git push origin main` → the workflow builds, ships and activates.

The installer, in order: validates the archive → extracts → materialises
`node_modules` → swaps `current` → stops the worker → runs
`otogrow-crm-migrate.service` → restarts API and worker → health-checks
`127.0.0.1:3002/healthz` for up to five minutes.

Any failure after the swap restores the previous release automatically.

## Rollback

> **Migrations are forward-only.** Twenty's `command:prod upgrade` has no down
> migrations, so restoring the previous release restores the previous *code*
> against a database that may already carry the new schema. For a failure
> during or after the migrate step, restore the database too.

Manual rollback to a specific release:

```bash
ls -lt /opt/otogrow-crm/releases
sudo ln -sfn /opt/otogrow-crm/releases/<sha> /opt/otogrow-crm/.rollback
sudo mv -Tf /opt/otogrow-crm/.rollback /opt/otogrow-crm/current
sudo systemctl restart otogrow-crm.service otogrow-crm-worker.service
```

Take a dump before any deploy that changes the schema:

```bash
sudo -u postgres pg_dump -Fc crm > "crm-$(date +%F-%H%M).dump"
```

## Operating

```bash
systemctl status otogrow-crm.service otogrow-crm-worker.service
journalctl -u otogrow-crm.service -f
journalctl -u otogrow-crm-migrate.service -n 200     # last migration run

curl -s localhost:3002/healthz                       # bypasses Cloudflare
readlink -f /opt/otogrow-crm/current                 # active release

redis-cli -h 127.0.0.1 -p 6380 info keyspace         # CRM queue only
systemctl status redis-otogrow-crm.service
```

Confirm the other two sites are unaffected after any change here:

```bash
systemctl is-active bon-backend bon-user-dashboard otogrow nginx
curl -sI https://otogrow.com | head -1
```

## Storage and retention

Automatic:

- **Releases** — the three newest are kept; older ones are deleted after each
  successful deploy.
- **Dependency store** — trees no surviving release references are removed.
- **Upload archives** — deleted once installed; `.part` files are cleaned up
  when a deploy fails.
- **Logs** — logrotate, 14 days, for both the app and the CRM Redis.
- **Redis AOF** — rewritten automatically at 100% growth over 32 MB.

Not yet done — **open items**:

- [ ] Automated PostgreSQL backups of the `crm` database, with off-server
      retention. `deploy/backup.sh` exists but assumes Docker volumes and
      needs porting.
- [ ] Disk-usage alerting. `deploy/disk-alert.sh` likewise.
- [ ] A cap on GitHub Actions cache growth for this repo.
- [ ] The ~25 inherited upstream `ci-*.yaml` workflows still trigger on
      push/PR. Most cannot pass here (they need twentyhq secrets) and they
      consume Actions minutes. Disable the unwanted ones in the repository's
      Actions settings — that is reversible and, unlike deleting the files,
      does not conflict on every upstream merge.
- [ ] `deploy/docker-compose.yml`, `deploy/Caddyfile` and `deploy/.env.example`
      are superseded by this directory but left in place; decide whether to
      keep them for a future dedicated host.
