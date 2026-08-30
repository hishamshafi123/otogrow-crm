# Otogrow CRM — Feature Plan & Phase Prompts

Base product: [Twenty CRM](https://github.com/twentyhq/twenty) (open-source, self-hosted), rebranded as **Otogrow CRM**.

## Brand decisions (locked)

- **App name:** Otogrow CRM
- **Logo:** `otogrowlogo1.jpg` (repo root) — black infinity-G mark, royal-blue accent; 748×748 JPEG. Needs a transparent-background PNG/SVG version for favicon + dark UI.
- **Theme:** black + royal blue accent, otherwise keep Twenty's design system
- **Domain:** decided later (subdomain like `crm.autogrow.com`) — not a blocker for any phase

## Scope decisions (locked)

| Feature | Decision |
| ------- | -------- |
| Embeddable lead capture forms | ✅ In |
| Email sequences (for captured leads) | ✅ In |
| WhatsApp/SMS integration + sequence builder (WhatsApp + email) | ✅ In |
| Lead scoring | ✅ In |
| Dashboards | ✅ In |
| Client portal (read-only) | ✅ In |
| Quoting tool (predefined price book → instant quote doc) | ✅ In |
| Import/migration tooling (HubSpot/Pipedrive) | ❌ Out |
| AI SDR agent | ❌ Out |

## What Twenty already gives us (no work needed)

Contacts/Companies/Pipelines (kanban), email + calendar sync (Gmail/Outlook/IMAP), workflows/automations, webhooks, REST + GraphQL API, permissions/roles, custom objects & fields, AI infrastructure, plugin SDK.

## Phases

| # | Phase | Depends on | Why this order |
| - | ----- | ---------- | -------------- |
| 1 | Rebrand (name, logo, theme, login, emails) | — | Foundation; makes every later screenshot/client demo on-brand |
| 2 | Lead capture forms (embeddable) | 1 | Entry point for all leads; sequences/scoring need lead source data |
| 3 | Email sequences (builder + sender) | 2 | First automation on captured leads |
| 4 | WhatsApp/SMS integration + multichannel sequences | 3 | Extends the sequence builder to WhatsApp/SMS |
| 5 | Lead scoring | 2 | Scores accumulate from form source + sequence engagement (3, 4) |
| 6 | Dashboards | 5 | Reports on leads, sequences, scores — needs data flowing |
| 7 | Quoting tool (price book → quote doc) | 1 | Independent; sales-facing |
| 8 | Client portal (read-only) | 6 | Reuses dashboards/pipeline data |
| 9 | Hardening + VPS deploy | all | Backups, SMTP, monitoring, Docker Compose deploy, TLS, DNS |

---

## Phase prompts

Each prompt is self-contained. Paste into a new session when starting that phase.

Shared context for every phase (already true in this repo):

> Repo: `/Users/hishamshafi/otogrow-crm` (Twenty CRM monorepo, yarn 4 workspaces). Local env is running: front http://localhost:3001, API http://localhost:3000, Postgres+Redis in Docker (DB on host port 5444). Always run repo commands with `export PATH="$HOME/Library/pnpm:$PATH"` (Node 24; Homebrew Node 26 breaks the yarn constraints). `npx nx` targets that use tsx hang in detached shells — run underlying vite/tsgo/nest commands directly instead.

### Phase 1 — Rebrand to Otogrow CRM

> Rebrand this Twenty CRM fork to "Otogrow CRM". App name must be exactly "Otogrow CRM". Logo source: `/Users/hishamshafi/otogrow-crm/otogrowlogo1.jpg` (black mark on white — first generate transparent PNG + favicon variants, store under an `assets/brand/` folder in twenty-front). Replace: (1) app/page titles and any user-visible "Twenty" name in the front-end, (2) login/welcome screen logo and copy, (3) favicon, (4) email templates' product name/logo in twenty-server/twenty-emails, (5) default theme accent color to the logo's royal blue. Do NOT rename packages, npm scopes, file names, or code identifiers — this is a UI-level rebrand only, so upstream merges stay possible. Leave legal/privacy links as-is for now (domain not decided). Verify by running the app locally and screenshotting the login screen and sidebar.

### Phase 2 — Embeddable lead capture forms

> Build embeddable lead capture forms for Otogrow CRM. Requirements: (1) in-app form builder — user picks fields (name, email, phone, company, message + custom fields from the People object), gets an embed snippet (script tag / iframe); (2) public, unauthenticated endpoint in twenty-server that accepts submissions, validates, rate-limits, and creates/updates a Person (+Company) with a `leadSource` marker and the form id; (3) duplicate handling by email (update + timeline note, don't create dupes); (4) submission creates a timeline activity and can trigger Twenty workflows (so sequences can hook in later); (5) basic spam protection (honeypot field; captcha optional via existing CAPTCHA_DRIVER config); (6) a hosted form page (shareable link) in addition to the embed. Follow Twenty's existing patterns: metadata-driven custom objects, GraphQL for app traffic, REST public API style for the public endpoint. Verify end-to-end locally: build a form, embed it in a plain HTML page, submit, see the lead appear in People with source set.

### Phase 3 — Email sequences

> Add email sequences to Otogrow CRM (Twenty has workflows but no sequences). Requirements: (1) sequence builder UI — ordered steps of emails with delays (days/hours), per-step templates with variables ({{firstName}} etc.), sent through the connected mailbox (Gmail/Outlook/IMAP sync already in Twenty); (2) enrollment — manual from a Person record, bulk from a list view, and automatic via workflow trigger (e.g. "lead created by form"); (3) exit conditions — reply received (detect via existing email sync), bounce, unsubscribe link, manual removal; (4) per-lead sequence state visible on the Person record (current step, next send time, history on timeline); (5) sending respects business hours + daily send cap, queued via the existing BullMQ worker; (6) sequence analytics: enrolled / sent / opened (if tracking available) / replied / completed. Model sequences as custom objects where possible; keep migrations reversible. Verify locally with a test mailbox: enroll a lead, watch step 1 send, reply, confirm the lead exits.

### Phase 4 — WhatsApp/SMS integration + multichannel sequences

> Add WhatsApp and SMS to Otogrow CRM via Twilio, and extend the sequence builder from Phase 3 to multichannel. Requirements: (1) Twilio config in settings (account SID, auth token, WhatsApp sender, SMS number); (2) send/receive WhatsApp + SMS messages, logged as timeline activities on the Person (matching by phone number); (3) inbound messages create/update People like the email sync does; (4) sequence steps can now be email OR WhatsApp OR SMS, with WhatsApp using pre-approved templates (template manager in settings); (5) exit conditions: any inbound reply on any channel; (6) respect WhatsApp's 24-hour session window — flag steps that would violate it. Verify locally with Twilio test credentials/sandbox: run a 3-step sequence (email → WhatsApp → SMS) against a test lead.

### Phase 5 — Lead scoring

> Add lead scoring to Otogrow CRM. Requirements: (1) scoring rules UI — admin defines rules: property-based (e.g. company size, industry, country) and behavior-based (form submitted, email opened/replied, WhatsApp replied, meeting booked), each with +/- points and optional decay; (2) score computed asynchronously (worker) and stored on the Person as a read-only computed field + score history; (3) score visible in list views (sortable/filterable column) and on the record page with a breakdown of what contributed; (4) workflow triggers on score thresholds (e.g. score > 50 → notify owner, move pipeline stage); (5) sensible default rule set seeded for new workspaces. Verify locally: create rules, submit a form lead, simulate engagement events, watch the score update.

### Phase 6 — Dashboards

> Build the Otogrow CRM reporting dashboards on top of Twenty's dashboard infrastructure. Requirements: (1) default dashboard pack for new workspaces: leads over time (by source/form), sequence performance (enrolled/sent/replied per sequence), lead score distribution, pipeline conversion by stage, WhatsApp/SMS volume; (2) each widget built with Twenty's existing widget types (graph, iframe, metric) so users can clone/edit them; (3) date-range and owner filters per dashboard. Verify locally: seed demo data covering forms, sequences, scores; confirm every widget renders real numbers.

### Phase 7 — Quoting tool

> Add a quoting tool to Otogrow CRM for the sales team. Requirements: (1) price book: admin-managed custom object of products/services with name, description, unit price, currency, optional tiers/quantity discounts — seeded with our real pricing; (2) quote builder on a Person/Company/Opportunity: pick line items, adjust qty/discount, auto-calc totals, tax %, validity date; (3) one-click branded PDF quote (Otogrow branding, quote number, terms) downloadable and logged to the timeline; (4) quote statuses (draft/sent/accepted/rejected/expired) with status changes on the timeline and available as workflow triggers; (5) list of quotes per opportunity with totals. Verify locally: build a quote from an opportunity, generate the PDF, mark it accepted.

### Phase 8 — Client portal (read-only)

> Add a read-only client portal to Otogrow CRM. Requirements: (1) portal access per Company: generate an invite link/token for external client users (no full workspace seat); (2) portal users see only what we share: their pipeline/opportunities, agreed dashboards/reports, and shared documents/quotes; (3) a dedicated slim portal UI (separate layout, Otogrow-branded, no internal nav); (4) permission enforcement server-side via a portal-scoped role/token — never expose other companies' data; (5) revoke/regenerate links from the Company record. Verify locally: create a portal link for a demo company, open it in an incognito window, confirm read-only access and data isolation.

### Phase 9 — Hardening + VPS deploy

> Deploy Otogrow CRM to a production VPS. Steps: (1) production env config — real APP_SECRET, SMTP (transactional + sequences deliverability: SPF/DKIM/DMARC for the sending domain), file storage (S3-compatible), Turnstile captcha; (2) use Twenty's production Docker Compose (packages/twenty-docker) with pinned version tags, behind Caddy or nginx with TLS; (3) automated Postgres backups (daily dump + offsite copy) and a tested restore; (4) monitoring: uptime check on /healthz, log shipping, disk alerts; (5) DNS for the chosen subdomain (e.g. crm.autogrow.com) once decided; (6) smoke test: signup, email sync, form submission, sequence send, quote PDF. Document the runbook (deploy, rollback, backup restore) in the repo. **Gotcha from Phase 2:** `/forms/:publicId` is both the SPA page (Accept: text/html) and the public REST endpoint (XHR) — the dev vite proxy splits them by Accept header; prod nginx/Caddy ingress needs the same split (or the hosted form page would serve JSON). Also update the email header logo URL (currently Twenty's CDN) to the production domain.

---

## Local environment reference

- App: http://localhost:3001 · GraphQL API: http://localhost:3000/graphql
- Login (dev, prefilled): `tim@apple.dev`
- Infra: Postgres + Redis in Docker (`packages/twenty-docker/docker-compose.dev.yml`, DB on host port **5444** — local Postgres/SSH tunnels occupy 5432/5433)
- Node: `export PATH="$HOME/Library/pnpm:$PATH"` (Node 24; Homebrew Node 26 breaks yarn constraints)
- Known quirk: `npx nx` targets using tsx hang in detached shells — run build steps directly (vite/tsgo/nest)
