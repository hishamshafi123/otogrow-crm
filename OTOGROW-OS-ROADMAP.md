# Otogrow OS roadmap and delivery tracker

Build a simpler workspace for Otogrow's martech agency, prioritizing delivery, team management, approvals, configurable AI agents, and creative production. This roadmap extends the existing CRM; it does not replace the historical CRM plan or declare existing features production-verified.

## Current authorization and workflow

The user superseded the earlier approval gates with: “continue all the rest of the phases without my approval”. Plan, implement and verify phases 5–10 sequentially without asking for phase approval. Record progress and unfinished work honestly. Continue independent work when a provider connection is unavailable. Account credentials, unconfigured services, deployment destinations and actual external sends still require the necessary concrete details; this instruction does not invent credentials or increase the existing spending cap.

The older per-phase approval wording below is historical and no longer blocks implementation.

## Current position

- Current work: phases 5–10 authorized for autonomous continuation; local workflow foundations implemented and being verified, integration/automation work remains. Phase 4 is implemented and locally verified. Phase 3 is implemented and locally verified with live image/video acceptance.
- Phase 1: implemented locally and verified with the repository-wide typecheck limitations recorded in its plan.
- Approval evidence for Phase 1: user replied "continue" immediately after the Phase 1 approval request.
- Completed local OS implementation phases: 1, 2, 3 and 4. Production rollout is not complete.
- Next action: continue unfinished reporting, finance, content and integration work across phases 5–10 under the standing authorization.
- Phase 2 implementation approval: "approve". The user subsequently supplied a Gemini key "for your testing", authorizing bounded live checks. These completed with synthetic data and rollback; the key was not permanently configured.
- Current implementation checkpoint: client-portal advertising budgets and ad-report calculations (2026-10-25).
- Requirements source: user discovery conversation, consolidated in `OTOGROW-OS-REQUIREMENTS.md`.

## Provisional phase sequence

| Phase | Outcome | Planning | Approval | Execution |
| --- | --- | --- | --- | --- |
| 1 | Redesigned delivery workspace, team permissions, task boards, submissions and approvals | Approved plan | Approved by user | Implemented locally; verification limitations recorded |
| 2 | Configurable AI agents, task assignment to agents, evidence review and run visibility | Approved plan | Approved with "approve" | Implemented locally; live synthetic Gemini checks passed |
| 3 | Creative reference library, briefs, shots, model/provider selection, generation and variants | Approved plan | Approved with "approve"; live test maximum USD 2 | Implemented locally; live image/video acceptance passed after billing update |
| 4 | Recurring service work, delivery confirmation, fulfilment reminders and Telegram notifications | Approved plan | Approved with "approve" | Implemented locally; Telegram live test awaits connection/recipient |
| 5 | Client onboarding, service-aware portal and unified client inbox | Approved plan | Approved with “continue” | In progress |
| 6 | Meta/Shopify reporting, recommendations, assignments and budget-change verification | Plan recorded | Approved for autonomous continuation | Local workflow foundation; integration work remains |
| 7 | Financial transactions, collections, salary allocation, profitability and accounting export | Plan recorded | Approved for autonomous continuation | Local workflow foundation; integration work remains |
| 8 | Internal content operations, configurable social accounts, publishing and competitor research | Plan recorded | Approved for autonomous continuation | Local workflow foundation; integration work remains |
| 9 | Developer delivery tools, releases and any remaining technology-service requirements | Plan recorded | Approved for autonomous continuation | Local workflow foundation; integration work remains |
| 10 | Cross-company founder reporting, reliability, operational checks and rollout | Plan recorded | Approved for autonomous continuation | Local workflow foundation; integration work remains |

Security, permissions, verification, and usable design apply in every phase; Phase 10 is not permission to postpone them. Developer staff can use the common task system in Phase 1; Phase 9 adds specialist features. Basic agents are prioritized in Phase 2, before provider-heavy creative generation.

## Phase completion log

### Phase 1

Approved with "continue". Implemented the `/delivery` workspace, role-aware planning, scoped projects, native task extensions, submission/revision history and manager-only review. Added the generated delivery migration and protections in both ORM engines. Source lives in `packages/twenty-front/src/modules/delivery` and `packages/twenty-server/src/modules/delivery`.

Verification: 73 backend tests, 4 frontend tests, rollback-only PostgreSQL workflow/isolation checks, changed-file lint, server compilation, metadata codegen and responsive browser checks. Full repository typechecks retain errors in existing front-component and Meta lead intake modules; see Phase 1's verification section. No deployment or paid model calls. Real staff and projects still need operational setup.

Detailed Phase 1 evidence and limitations are in `OTOGROW-OS-PHASE-01.md`.

### Phase 2 — locally implemented and live-tested

Approved with "approve". Implemented configurable delivery agents, task context previews, brief/copy assistants, public-page SEO verification, human acceptance/rejection, scoped access, run limits and persistent run history. Local PostgreSQL and Redis checks passed with model fixtures; 54 backend and 6 frontend tests passed. Server compilation, metadata codegen, changed-source lint and browser checks passed. Existing repository-wide typecheck errors remain.

The user supplied a Gemini testing key. Live synthetic copy and brief checks passed on `gemini-3.5-flash-lite` through the actual service and SDK, including persisted findings, accepted edits and unchanged delivery approval. Initial brief output invented missing facts; instructions were corrected and the live recheck preserved confirmation placeholders. Three successful requests reported 588 input / 649 output tokens; two earlier requests to a retired model failed. Monetary cost is unknown. All test records were rolled back and the key was not saved permanently.

Real client benchmarking with Amna, permanent provider configuration, staff/projects and production workers remain rollout prerequisites. The shared ChatGPT personal-plan arrangement remains unverified and was not used. Existing unrelated typecheck errors remain. See `OTOGROW-OS-PHASE-02.md` for full evidence and limitations.

### Phase 3 — locally implemented and live acceptance passed

Prepared `OTOGROW-OS-PHASE-03.md` covering the reference library, structured briefs, shot production, intermediate approvals, provider controls, manual upload/export, variants and bounded editing assistance. The user approved with "approve"; local implementation and synthetic/browser checks are recorded in the Phase 3 document. Live image/video generation remains unverified and requires separately bounded testing authorization and verified provider access.

## Architecture decisions to resolve in the applicable phase

- Keep the existing Twenty-based CRM, accounts, permissions, client records, tasks and agent infrastructure where they fit.
- Phase 2 evaluated Paperclip and Bennett's FounderOS. Retain Twenty permissions, records, model registry and queues; neither external runtime is installed. See Phase 2 for rationale and sources.
- Verify provider APIs, licenses, remote deployment and authentication before choosing integrations. Do not assume shared use of a personal ChatGPT Pro plan is supported.
- Preserve existing sales, quoting, calling and CRM routes while introducing the OS workspace.

Live media acceptance update: user authorized maximum USD 2. One image request returned HTTP 429 with zero free-tier quota; no video call or retry. See Phase 3 document and saved test ledger. A credential with paid media access is required to resume.

After the billing update, image and video acceptance passed. A missing optional interaction ID exposed and resolved an importer bug; paid failed-response usage is included. Estimated usage USD 0.6834985, below the authorized USD 2. See Phase 3 evidence and ledger. Phase 4 proposal prepared; execution awaits approval.

### Phase 4 — locally implemented and verified

Approved with "approve". Recurring work, delivery/fulfilment history, addressed notes, one-time reminders, private Telegram linking and founder attention are implemented. Additive migration applied locally. Calendar tests, transactional workflow/permission tests, frontend behavior and responsive browser checks passed. No live Telegram message was sent; bot setup and an authorized recipient remain operational acceptance work. See `OTOGROW-OS-PHASE-04.md` for limits and evidence. Phase 5 plan is ready for review.

### Phase 5 — in progress

Approved with “continue”. Client engagements, configurable onboarding, brand files, separate expiring portal access, exact approved-version sharing and review/fulfilment integration are locally implemented and checked. Scoped manual inbox and AI reply drafting are implemented; live provider adapters remain outstanding. Continue remaining phases under the new authorization; do not mark unfinished integration work complete. Detailed verification and limitations are recorded in `OTOGROW-OS-PHASE-05.md`.

## Autonomous continuation checkpoint

The new user instruction removes phase-approval gates. Phase 5 now has conversation-level private/read/send grants, manual inbound notes, unsent drafts and scoped AI reply drafting with selected sources. Live email/Slack/WhatsApp synchronization and sending are not implemented. New Business tools screens provide ad-report records and review/assignment, budget application/independent verification, immutable cash-basis finance and accounting CSV, content review/publication evidence, competitor evidence/interpretation/idea records, release checklists and independent review, and founder/readiness counters. These are usable local workflow foundations, not completed integrations or full phase completion.

Validation: seven policy/calculation tests, four frontend behavior tests, and rollback PostgreSQL checks for conversation revocation, finance isolation, one-time payment receipt creation, budget workflow, native task assignment, active membership and mocked AI draft source/limit/in-flight revocation checks. A real browser synthetic receipt/void flow passed and its exact test record was removed. Build, metadata generation and lint passed; final updated typecheck/browser verification is recorded in the phase notes. No paid model calls, external messages, publishing or deployment.

Remaining independent work includes scheduled reporting and alerts, monthly salary/allocation/reconciliation tools, social-growth measurement, richer release dependencies and operational storage/archive work. Provider-specific adapters, live acceptance, accounting mappings and deployment also remain. Do not mark phases 5–10 complete.

Latest verification: AI reply generation was exercised using the AI SDK mock with permitted source notes, daily-budget denial and revoked access during generation. The existing full synthetic delivery-agent/Redis regression passed after sharing daily limits across task and inbox execution. Payment reversal now reopens its linked receivable; duplicate confirmations and voiding a paid invoice before its receipt are rejected. Direct frontend/backend typechecks showed only the previously documented unrelated failures. The updated local API is running, and the founder overview was inspected at desktop and 390-pixel width. No phases were marked complete.

### 2026-10-25 implementation checkpoint

Client-portal advertising budget requests are now implemented locally, including explicit performance-marketing entitlement, current-configuration validation, idempotent request/task creation, manager notice and public request status history. The existing manager approval → named marketer application → independent manager verification lifecycle was tested through the client-created record. Retainer edits remain separate. Advertising reports additionally calculate cost per selected outcome and attributed ROAS, flag stale/future dates and show target-based review prompts using manually entered data. Phase 6 remains in progress: live data adapters, scheduled reporting and production acceptance are outstanding.

Verification for the 2026-10-25 checkpoint: 10 backend policy/calculation tests and 8 frontend behavior tests passed; expanded rollback portal workflow passed. Server compilation and changed-file lint passed. Direct frontend/server typechecks contain no delivery-module errors, with existing unrelated failures unchanged. No paid model calls or live ad mutations were made.

Live Meta acceptance (2026-10-25): authorized read-only API tests succeeded for Otogrow's own USD/Asia-Qatar account, including historical insights and campaigns. Recent seven-day insights were empty, whereas ninety-day insights contained real data. No credential was saved, no ad settings were changed and no daily scheduler was enabled. This verifies API access only; the persistent OS reporting integration remains in progress. See Phase 6 for dates, evidence and attribution limitations.

### Persistent Meta reporting checkpoint (2026-10-25)

The local OS now has a working encrypted Meta connection and account/ad performance importer, with 06:00 account-timezone scheduling, leases, duplicate prevention, retry/auth failure handling, manager-only report review, marketer follow-up assignment and scoped report notices. The authorized Otogrow account is saved in the Otogrow workspace, encrypted storage and scheduler heartbeat are verified, and a real import from the UI succeeded. Credentials are absent from source files and public snapshots.

Automatic reports are OFF pending real staff/project assignment: the local workspace currently has one demo member and no projects. Production hosting is not configured. Meta is now connected locally; Shopify and other providers are not. Phase 6 remains in progress for remaining attribution/reporting automation and production acceptance. See Phase 6 for verification and explicit limits, including yesterday-only scheduled imports and no historical/rolling backfill yet.

Final reporting verification: 15 backend tests and 6 frontend tests passed; rollback checks also exercised report notice isolation/acknowledgement and the existing recurring-work/notification suite. Server build, metadata generation and changed-file lint passed. Direct typechecks have no delivery-module errors; the previously documented unrelated front-component AppPath and Meta lead-intake DeepPartial failures remain. The persisted live token's versioned encryption prefix and the local scheduler heartbeat were checked without exposing the secret. The local app retains the new connection and real empty daily report; schedules remain off awaiting staff/project setup.
