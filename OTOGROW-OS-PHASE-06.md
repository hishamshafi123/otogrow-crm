# Phase 6 — Advertising intelligence and budget control

Status: implementation authorized by “continue all the rest of the phases without my approval”. Local implementation in progress; no phase approval pause.

## Scope and acceptance

Daily dated reports with explicit Meta/X/TikTok/ChatGPT source, primary conversion goal, spend and source evidence. Keep platform attribution separate from Shopify observed revenue. A manager reviews recommendations before named follow-up assignment. Budget requests progress through manager approval, marketer application and independent manager verification. Client-portal budget controls must be gated by explicit performance-marketing service entitlement. Provider credential setup, daily scheduling and live platform/Shopify imports remain required; manual records must not be called synced reports.

Verify permissions and durable history with synthetic fixtures, validate relevant calculations and transitions, and check the UI at desktop/narrow widths. Record completed checks and remaining integration work in the roadmap; unfinished items stay open.

## Local foundation checkpoint

The shared `delivery/business` service and `DeliveryBusiness` screens now persist this phase’s initial records, scoped access, optimistic revisions, approvals and audit histories. Data is additive JSON under `core.deliveryOperations.state.business` with the existing workspace transaction lock and 10 MB history bound; normalization/archive is required for scale. These records are manually entered. They must not be described as provider-synchronized, automatically published, accrual accounts or a completed production rollout.

Shared verification: policy/calculation tests, frontend behavior tests and rollback PostgreSQL workflow/permission checks passed. Finance receipt/void browser check passed. No external account connections, deployment or additional paid AI testing. See the roadmap’s autonomous continuation checkpoint for unfinished scope.

## 2026-10-25 continuation — portal budget requests and report calculations

Managers can explicitly enable advertising-budget access per engagement, with a platform, currency, period, active manager and separate project marketer. No entitlement is inferred from free-text service names. Other portals omit the entire advertising section. Configuration edits retain the normal engagement revision check and do not change retainers or create budget notifications.

A client submits an integer-minor-unit amount and reason against the current configuration revision. The service revalidates staff membership and manager authority, creates exactly one REVIEW budget record and linked follow-up task per engagement/request ID, and adds a manager notice in the existing notice system, within the shared workspace transaction. The marketer's task explicitly says not to apply until approved. Existing independent approval/application/verification rules remain authoritative. The portal exposes only its own request amounts, platform/currency/period and statuses, never internal staff IDs, evidence or notes. Revoking the entitlement removes the controls and denies new requests. A verified status records the manager's evidence-based confirmation; no live ad API mutation occurs.

Ad reports now calculate cost per selected outcome, attributed ROAS and spend above the entered target × outcomes. Purchases, qualified leads, calls and registrations use their respective counts. Zero spend/outcomes and missing targets are explicit; Shopify observed revenue is not substituted into attributed ROAS. Future/stale report dates are flagged. Rule-based review suggestions are displayed as checks, not proof of winning/losing ads. The data is still manually entered and has no scheduled daily import or push report.

Validation: rollback PostgreSQL portal checks passed for entitlement denial/revocation, stale configuration, request idempotency, cross-client isolation, manager notice, and complete independent approve/apply/verify flow; existing onboarding/sharing/review checks passed. Four portal UI tests passed, including request amount conversion. Added calculation tests for outcome selection, attribution distinction, zero denominators and date freshness. Final test/build results are recorded in the roadmap checkpoint.

## 2026-10-25 live Meta read-only acceptance

User explicitly authorized using their supplied system-user token. Four bounded read-only calls to Meta Graph API v26.0 succeeded: account metadata, seven-day account insights, ninety-day account insights, and campaign list. The credential was used in an Authorization header in process memory; it was not saved to repository files or application configuration. No campaign/budget mutation, paid model call, or scheduler activation occurred.

Confirmed account `1657332765534462` (`otogrow`), USD, `Asia/Qatar`, account_status 1. Last-seven-day insights returned an empty data array; this is a successful empty response, not an authentication failure. The ninety-day response explicitly covers 2026-07-27 through 2026-10-24: spend USD 1,055.88, impressions 18,792, clicks 992. The campaign endpoint returned 13 campaigns, all currently PAUSED, with no next page. These are current statuses and do not establish historical status on every date.

Meta reported action_type `lead` with value 51, alongside several overlapping lead-related action types. Preserve provider event types and do not sum overlapping events or label these qualified leads without downstream qualification evidence. API acceptance for this own-business account does not demonstrate permissions for unrelated client accounts or completion of App Review/Tech Provider verification.

The connection is verified for this test session only. Durable encrypted reporting credentials, account/project mapping, scheduled report execution, review notifications and operational deployment remain unfinished. Existing Meta lead-form settings are not the reporting connector.

## Persistent Meta reporting — 2026-10-25

Implemented `delivery/advertising` adapter/service/types, GraphQL JSON query/mutation and the Live Meta reporting panel under Business tools → Ads. Administrators test and save account credentials encrypted with the existing workspace-bound versioned AES-GCM service. Public snapshots never return ciphertext, plaintext tokens, credential-owner IDs or lease details. The account metadata supplies currency/timezone; the UI defaults to the user's requested 06:00. A configured project and separate active project manager/marketer are required to enable automatic reporting.

The scheduler checks every minute, imports yesterday after the configured account-local time, and records a heartbeat. Database leases prevent overlapping workers. Results are discarded when the connection changes during a fetch or its owner loses access. Auth failures disable scheduling; transient provider failures receive an hour backoff. Invalid scheduled staff assignments pause the connection. The adapter uses bearer headers, pinned Meta hosts, no redirects, bounded cursor pagination and sanitized errors; it never follows provider-supplied next URLs. It fetches separate account totals and ad rows (including campaign/ad-set labels) with account attribution settings. Events remain labeled, and qualified leads are not inferred from Meta lead actions.

Successful empty dates are saved as empty reports. Identical reimports create neither another report nor another manager notice; changed provider data creates a new immutable review snapshot. A manager approves recommendations to create one native task for the configured marketer; the marketer cannot self-approve. Before approval, report visibility is limited to administrators and the configured manager. Approved reports become visible to the assigned marketer while they remain a project member. OS follow-through notices use report-specific authorization and link back to Ads; optional Telegram delivery still follows the existing disabled-by-default bot configuration.

Live local setup: the authorized token was submitted through the new password field in the authenticated Otogrow workspace. The database was checked for an `enc:v2:` envelope without reading the stored secret. Account 1657332765534462 is saved with USD, Asia/Qatar and 06:00. The local scheduler heartbeat is confirmed. A live import through the OS saved the empty 2026-10-24 report successfully. No ad changes, Telegram sends or paid model calls occurred.

Automatic reporting remains OFF: the local workspace contains only the demo Tim Apple user and no projects. The real project, manager and marketer need to be set up and selected. Production hosting is also not configured. This is a persistent local integration, not a deployed or enabled daily reporting service.

Verification: five adapter/calendar tests, six frontend tests, rollback reporting permission/schedule/deduplication/approval/auth-failure/in-flight-disconnect checks, and the existing notification/fulfilment regression passed. The latter's fixture clock was corrected to keep native assignment timestamps aligned with its fixed scheduler date. Server build, changed-file lint, metadata codegen and direct typecheck results are tracked in the roadmap. Browser verification covered connection save, secret-form dismissal and live import. No synthetic database fixtures were retained.

Remaining scope: Shopify reconciliation; automatic AI recommendations and outcome/target mapping; account/campaign/ad historical backfill and rolling refresh for delayed attribution; report export/archive beyond the 500-report/10 MB guard; tests on larger live paginated accounts; production deployment and real staff setup. The current scheduler imports yesterday only. Manual reimport can refresh yesterday, with immutable snapshots when values change. No claims of qualified-lead verification, causal revenue attribution or budget optimization are made.
