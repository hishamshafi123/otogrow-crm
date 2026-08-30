# Otogrow CRM — Production Deployment Runbook

Target: `crm.otogrow.com` on a single VPS, Docker Compose stack
(app + worker + postgres + redis + caddy). Everything deploy-side lives in
`deploy/` at the repo root.

This runbook is the only deployment document. Follow it top to bottom for the
first deploy; later sections cover upgrades, rollback, restores, and wiring up
SMTP/Twilio later.

---

## 0. Architecture in one paragraph

One Docker image (`deploy/docker-compose.yml` builds it from
`packages/twenty-docker/twenty/Dockerfile`, target `twenty`) contains the
compiled NestJS server **and** the built React SPA (copied to
`dist/front`, served by `@nestjs/serve-static`). The public
`twentycrm/twenty` registry images are **not** used — this fork has custom
code (forms, portal, quoting, sequences, Twilio, lead scoring, analytics)
that only exists in this source tree. Caddy terminates TLS (automatic
Let's Encrypt) and reverse-proxies to the app container. Postgres and Redis
are containers on the internal network only — no public ports.

### The `/forms` and `/portal` routing rule (read before touching Caddy)

`/forms/:publicId` and `/portal/:token` are **both** hosted public SPA pages
and public REST prefixes. The Nest controllers (`FormPublicController`,
`PortalPublicController`) answer on those paths regardless of the `Accept`
header, and the SPA needs the same URL for browser navigations. The split is
done in `deploy/Caddyfile`:

- Request path matches `^/(forms|portal)/[^/]+/?$` **and** `Accept` contains
  `text/html` (browser navigation) → rewritten internally to `/index.html`
  → SPA loads → client-side router renders the public page. The browser URL
  stays `/forms/...` / `/portal/...`.
- Everything else (XHR/fetch with `Accept: */*` or `application/json`, POST
  submits, and deeper paths such as `/portal/:token/quotes/:quoteId/pdf`)
  → passed through untouched → Nest controllers / static files as usual.

The portal SPA fetches PDFs as XHR blobs precisely so the PDF endpoint never
needs the `text/html` treatment. All other API prefixes (`/graphql`,
`/metadata`, `/rest`, `/webhooks`, `/file`, `/files`, `/healthz`, `/auth`,
...) are controller-only paths with no SPA collision, so they need no rule.

---

## 1. What you must provide (checklist before starting)

- [ ] VPS with SSH access (Ubuntu/Debian assumed; adjust package commands
      otherwise), ideally ≥ 4 GB RAM. See the memory note in §3.
- [ ] DNS **A record**: `crm.otogrow.com` → VPS public IP. Do this early —
      Caddy needs it resolvable to issue the TLS certificate.
- [ ] A signup at https://healthchecks.io (free) or UptimeRobot for uptime
      monitoring (§9) — no server-side work needed.
- [ ] Nothing else. SMTP and Twilio are intentionally deferred (§11, §12).

---

## 2. VPS prerequisites

```bash
# as root or a sudo user on the VPS
apt-get update && apt-get upgrade -y

# Docker + compose plugin (official repo)
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
docker compose version   # must print v2.x

# Firewall: SSH, HTTP, HTTPS only (Postgres/Redis are never published)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

# Deploy layout
mkdir -p /opt/otogrow/backups
```

---

## 3. Getting the source onto the VPS and building

**Decided strategy: rsync the source tree to the VPS and `docker build`
there.** Reasons: the repo's only git remote is upstream
(`github.com/twentyhq/twenty`) — the fork's changes are not pushed to any
remote you control — and `docker save | ssh docker load` ships multi-GB
images over SSH on every change, while rsync sends only diffs and the VPS
rebuilds with layer caching.

> Longer term, pushing this fork to a private GitHub remote and
> `git clone`/`git pull` on the VPS is cleaner (the fork's work is currently
> uncommitted in the working tree — commit it first). The commands below are
> identical either way; only the transfer step changes.

```bash
# from your workstation, in the repo root:
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude .nx --exclude dist \
  --exclude 'packages/*/node_modules' --exclude '.venv-brand' \
  ./  <user>@<vps-ip>:/opt/otogrow/repo/

# keep packages/twenty-front/build if you pre-built it (see memory note)
```

### Memory note (important on small VPSs)

The frontend build inside Docker wants ~8 GB of Node heap
(`--max-old-space-size=8192` in the Dockerfile). Two options:

- **VPS has ≥ 8 GB RAM (or 4 GB + generous swap):** build everything on the
  VPS, nothing to do.
- **Smaller VPS:** pre-build the frontend on your workstation
  (`cd packages/twenty-front && npx vite build`) and include
  `packages/twenty-front/build/` in the rsync — the Dockerfile detects it and
  skips the in-container build. `.dockerignore` does not exclude it.

### Build + first boot

```bash
cd /opt/otogrow/repo/deploy

cp .env.example .env
chmod 600 .env
# edit .env now — see §4

docker compose --env-file .env build app        # 15–40 min first time
docker compose --env-file .env up -d
docker compose --env-file .env ps
docker compose --env-file .env logs -f app      # watch migrations run
```

On first boot the app container's entrypoint detects the empty database,
runs `database:init:prod` (schema + metadata seed), then
`command:prod upgrade` (runs the fork's `2-34` upgrade commands — forms,
sequences, Twilio config, quoting, portal entities/widgets — exactly like a
normal Twenty upgrade). Healthy when `docker compose ps` shows
`app ... (healthy)` and `curl -s localhost:3000/healthz` works from the VPS.

---

## 4. Environment (`deploy/.env`)

Generate secrets **on the VPS**:

```bash
openssl rand -base64 32   # → APP_SECRET
openssl rand -base64 32   # → ENCRYPTION_KEY
openssl rand -base64 32   # → PG_DATABASE_PASSWORD (or any long random string)
```

Set in `.env`:

| Var | Value |
|---|---|
| `SERVER_URL` | `https://crm.otogrow.com` |
| `APP_SECRET` | generated above — **never commit, never reuse the example value** |
| `ENCRYPTION_KEY` | generated above (encrypts stored secrets e.g. Twilio tokens; falls back to `APP_SECRET` if unset) |
| `PG_DATABASE_PASSWORD` | generated above |
| everything else | the `.env.example` defaults are already correct for this deploy |

Deliberate defaults baked into `.env.example` — do not "fix" them:

- `TWILIO_DRIVER=LOGGER` — WhatsApp/SMS messages are logged, not sent, until
  §12 is done.
- `EMAIL_DRIVER=LOGGER` — emails are written to the app logs, not sent, until
  §11 is done. Consequences until then: **no invite emails** (share invite
  links manually, §5), **no password-reset emails**, **no email-verification
  emails** (`IS_EMAIL_VERIFICATION_REQUIRED=false` must stay or sign-up
  stalls).
- `IS_MULTIWORKSPACE_ENABLED=false` — after the first workspace exists,
  workspace creation (i.e. public sign-up) is refused by the server. This is
  the "disable sign-up" mechanism in this codebase; there is no separate
  `IS_SIGN_UP_DISABLED` var.

---

## 5. First workspace + admin user (no SMTP)

1. Browse to `https://crm.otogrow.com` (after DNS + TLS, §6) — the sign-up
   screen appears.
2. Register with your real email + password. Because
   `IS_EMAIL_VERIFICATION_REQUIRED=false`, no verification email is needed;
   you land directly in onboarding and the first workspace is created.
3. The first user is the workspace admin. From this moment, sign-up for
   additional workspaces is closed (§4).
4. **Inviting teammates without SMTP:** Settings → Members → Invite → copy
   the invite link (the UI shows a copyable link) and send it over any
   channel. Invited users set their own password on the link; no email is
   required.
5. **Password resets do not work until §11.** Don't lose the admin password;
   if you do, see §10 for DB access to the VPS as a recovery path.

---

## 6. DNS + TLS cutover

1. Create the A record `crm.otogrow.com → <VPS IP>` (and wait for
   `dig +short crm.otogrow.com` on the VPS to return it).
2. `cd /opt/otogrow/repo/deploy && docker compose --env-file .env up -d caddy`
3. Caddy obtains and renews the Let's Encrypt certificate automatically
   (needs ports 80+443 open, §2). Watch `docker compose logs -f caddy` for
   `certificate obtained`.
4. Open `https://crm.otogrow.com` — you should get the app over HTTPS.

---

## 7. Smoke-test checklist (run after every deploy/upgrade)

- [ ] `https://crm.otogrow.com/healthz` returns 200 (also what monitoring hits)
- [ ] Log in with the admin user
- [ ] Create a Person/Company record manually
- [ ] Create a lead form in Settings/Forms, open its public URL in an
      incognito window (`https://crm.otogrow.com/forms/<publicId>`) — the
      hosted branded page renders (proves the Caddy Accept-split works)
- [ ] Submit the form → lead appears in the CRM with `leadSource = FORM`
- [ ] Create a quote, generate the PDF — branded Otogrow PDF downloads
- [ ] Generate a client portal link on a company, open
      `https://crm.otogrow.com/portal/<token>` incognito — portal renders;
      open an accepted quote's PDF from the portal
- [ ] Open the analytics dashboard — widgets render
- [ ] `docker compose --env-file .env logs worker --tail=50` shows no crash loop

---

## 8. Upgrade procedure (deploying new code)

```bash
# workstation: transfer the diff
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude .nx --exclude dist \
  --exclude 'packages/*/node_modules' --exclude '.venv-brand' \
  ./  <user>@<vps-ip>:/opt/otogrow/repo/

# VPS:
cd /opt/otogrow/repo/deploy
docker compose --env-file .env build app        # layer cache makes this fast
docker compose --env-file .env up -d            # recreates app+worker on the new image
docker compose --env-file .env logs -f app      # upgrade commands run automatically
```

The entrypoint runs `yarn command:prod upgrade` on every boot; new upgrade
commands (this fork adds them under
`packages/twenty-server/src/database/commands/upgrade-version-command/2-34/`)
are applied exactly once, in timestamp order. Bump `APP_VERSION` in `.env`
when the upstream version the fork is based on changes.

Take a manual backup first for anything non-trivial:

```bash
/opt/otogrow/repo/deploy/backup.sh
```

---

## 9. Monitoring

- **Uptime:** on healthchecks.io (or UptimeRobot), create an HTTP check on
  `https://crm.otogrow.com/healthz`, interval 1–5 min, with email/SMS/Slack
  notifications configured on their side. Nothing to install.
- **Disk:** `deploy/disk-alert.sh` pings a healthchecks.io check's `/fail`
  URL when the Docker filesystem exceeds `DISK_ALERT_THRESHOLD` (80%).
  Create a second healthchecks.io check, put its ping URL as
  `DISK_ALERT_PING_URL` in `/opt/otogrow/repo/deploy/.env`, then:

```bash
crontab -e
17 * * * * /opt/otogrow/repo/deploy/disk-alert.sh
```

- **Backups failing?** healthchecks.io can also monitor the backup cron:
  append `&& curl -fsS -m 10 --retry 3 https://hc-ping.com/<uuid>` to the
  backup cron line in §10.

---

## 10. Backups and restore drill

Nightly cron (3 AM) on the VPS:

```bash
chmod +x /opt/otogrow/repo/deploy/backup.sh /opt/otogrow/repo/deploy/restore.sh
crontab -e
0 3 * * * /opt/otogrow/repo/deploy/backup.sh >> /var/log/otogrow-backup.log 2>&1
```

`backup.sh` writes `otogrow-db-<ts>.sql.gz` (pg_dump) and
`otogrow-storage-<ts>.tar.gz` (uploaded files — `STORAGE_TYPE=local`) to
`BACKUP_DIR` (`/opt/otogrow/backups`) and deletes anything older than 14
days. An rclone offsite-copy section is included, commented out, at the
bottom of the script — enable it once you configure an rclone remote.

**Restore drill (do this once before you trust the backups):**

```bash
# list dumps
ls -lh /opt/otogrow/backups/

# restore (stops app, recreates the DB, restores, restarts; asks to type "restore")
/opt/otogrow/repo/deploy/restore.sh /opt/otogrow/backups/otogrow-db-<ts>.sql.gz

# then re-run the §7 smoke tests
```

File-storage restore instructions are printed at the end of `restore.sh`
(it's a separate tar; only needed if files were lost).

Emergency DB access on the VPS (e.g. admin password lost before SMTP is
wired):

```bash
cd /opt/otogrow/repo/deploy
docker compose --env-file .env exec db psql -U postgres -d default
```

---

## 11. Wiring SMTP later

1. Pick a provider (Resend, SES, Postmark, any SMTP relay).
2. Edit `/opt/otogrow/repo/deploy/.env`:

```
EMAIL_DRIVER=smtp
EMAIL_SMTP_HOST=<host>
EMAIL_SMTP_PORT=465
EMAIL_SMTP_USER=<user>
EMAIL_SMTP_PASSWORD=<password>
EMAIL_FROM_ADDRESS=noreply@otogrow.com
EMAIL_FROM_NAME=Otogrow CRM
```

3. `docker compose --env-file .env up -d app worker` (recreate with new env).
4. Optionally set `IS_EMAIL_VERIFICATION_REQUIRED=true` at the same time.
5. Test: invite a teammate — the invite email should arrive, with the Otogrow
   logo loaded from `https://crm.otogrow.com/images/brand/otogrow-logo-192.png`
   (the email header logo resolves from `SERVER_URL` at render time).

---

## 12. Wiring Twilio later (WhatsApp/SMS)

1. Keep `TWILIO_DRIVER=LOGGER` until credentials exist; then set
   `TWILIO_DRIVER=TWILIO` in `.env` and recreate `app`/`worker`.
2. Account SID / auth token / sender numbers are configured **per workspace
   in the CRM UI (Settings)**, stored encrypted in `core."twilioConfig"`
   (encrypted with `ENCRYPTION_KEY`) — they are not env vars.
3. Before flipping the driver, send a test message with `LOGGER` and check
   `docker compose logs app` to confirm the payload looks right.

---

## 13. Rollback

```bash
# code rollback = restore the previous source tree on the VPS, rebuild, up
# (keep a copy of the previous tree: rsync to /opt/otogrow/repo-prev before
# each upgrade, or use git tags once the fork has its own remote)
cd /opt/otogrow/repo-prev/deploy
docker compose --env-file .env build app && docker compose --env-file .env up -d

# data rollback (only if a migration corrupted data — rare):
/opt/otogrow/repo/deploy/restore.sh /opt/otogrow/backups/otogrow-db-<pre-upgrade-ts>.sql.gz
```

Upgrade commands are idempotent-by-cursor (applied once, tracked in the DB),
so re-running an old image against a newer DB schema can fail — prefer
restoring the matching dump when rolling back across a schema change.

---

## Appendix A — Stack reference

| Piece | Detail |
|---|---|
| Compose project | `otogrow-crm` (`deploy/docker-compose.yml`) |
| App image | built from `packages/twenty-docker/twenty/Dockerfile`, target `twenty`, tagged `otogrow-crm/app:local` |
| Internal ports | app/worker: 3000, db: 5432, redis: 6379 (none published) |
| Published ports | 80, 443 (Caddy only) |
| Volumes | `db-data`, `redis-data`, `app-storage` (uploads), `caddy-data` + `caddy-config` (certs) |
| Healthcheck | `GET /healthz` on app; compose healthchecks on db/redis |
| TLS | Caddy automatic Let's Encrypt for `crm.otogrow.com` |

## Appendix B — Files in this directory

| File | Purpose |
|---|---|
| `docker-compose.yml` | production stack definition |
| `.env.example` | every env var, commented; copy to `.env` on the VPS |
| `Caddyfile` | TLS + reverse proxy + `/forms`/`/portal` Accept-header split |
| `backup.sh` | nightly pg_dump + storage tar, 14-day rotation, optional rclone |
| `restore.sh` | confirmed, destructive DB restore from a dump |
| `disk-alert.sh` | hourly disk-usage ping to healthchecks.io |
| `RUNBOOK.md` | this file |
