# Phase 5 proposal — client onboarding, portal and shared inbox

Status: approved with “continue”; implementation in progress. Live provider setup remains pending account details and an identified test recipient.

## Outcome

Each client gets a clear place to supply brand assets, review explicitly shared work and see relevant delivery status. The founder controls which client conversations employees can read and answer. The inbox supports human-written and AI-assisted drafts, with an explicit human send action.

## Existing foundation

The repository already contains a company-scoped portal token service and a portal showing opportunities and quotes, plus email synchronization modules. Extend those where suitable; their existence does not establish permission to expose delivery records, internal conversations or assets. The new delivery portal must use a deliberately limited client payload and separate permissions from the current sales portal.

## Implementation sequence

1. **Client engagements and onboarding.** Define configurable services and one-time/retainer engagements, scope, deliverable allowances, contact owners and required onboarding fields. Build shareable onboarding forms for logos, guidelines, website links, documents and notes, with submission history and manager acceptance. Uploads receive type/size validation and client-scoped download authorization. Payment collection and accounting remain in Phase 7; no payment credentials are collected here.
2. **Service-aware client portal.** Show only the services and explicitly shared deliverables relevant to the engagement. Include onboarding progress, approved concepts/briefs, manager-approved submissions, client comments and review decisions. Internal notes, candidate generations, employee costs and AI prompts remain private. Performance-marketing budget controls are reserved for Phase 6 and must never appear for video-only or SEO-only clients.
3. **Share and revision workflow.** A manager selects the exact brief or deliverable version to share. Clients approve, comment or request changes against that version. New revisions preserve history. Objections appear in the delivery/fulfilment workflow and prevent an outdated fulfilment confirmation. Sharing or generating a link alone does not mean the client received the work; retain the explicit recorded-delivery step from Phase 4. Revision charges remain zero by default and require a separate explicit commercial action.
4. **Founder-controlled inbox.** Provide a unified conversation list with client/project mapping, channel/source, assignee, unread state and draft/reply history. Founder and Amna retain administrative visibility into connected business inboxes. Personal/founder-private conversations are excluded from shared staff access by default. Grant view and send permissions separately for selected client conversations; linking an employee to a project must not silently grant their inbox access.
5. **Provider adapters.** Reuse supported email synchronization and add a Slack adapter for selected channels. Implement inbound deduplication, threading, attachment handling, reconnect/error states and sending only where the connected account has the required capability. Provider credentials stay server-side. Validate webhook signatures and avoid treating platform delivery receipts as human acknowledgment.
6. **Selected WhatsApp groups.** Store an explicit allowed-group list and client mapping, but enable synchronization/replies only after confirming that the user's actual account/provider supports those existing groups. Do not substitute personal-session scraping, import all groups or claim support from a generic WhatsApp messaging adapter. If the supported route cannot access the existing groups, present the concrete limitation and an alternative for approval before implementing a materially different integration.
7. **AI reply drafts.** Authorized staff can ask a configured agent for a draft based on the permitted conversation and selected client context. Show the source messages used and allow edits. No automatic sending, contractual commitments, payment confirmation or broader data access. Generating a draft does not acknowledge a message or complete a delivery task.

## Permissions and access

- Client access must be scoped to a company/engagement and explicitly shared versions, with expiry, rotation, revocation and audit history. Review existing sales-portal links without silently expanding their access.
- Treat client review links as bearer credentials. Short-lived sessions and stronger verification for sensitive material must be designed before exposing it. Do not return employee rosters, unrelated clients, internal task details or generic asset tokens.
- Recheck current access on every portal asset request, inbox read and send. A staff revocation must also remove access to cached drafts and attachments.
- A conversation can be shared with multiple staff members, but one clear owner handles follow-up. Client messages remain distinct from internal team notes.
- Sending requires a permitted user, a verified connected sender and an explicit final send action. Keep uncertain sends visible rather than automatically duplicating messages.

## Provider discovery required before live connection

Confirm the email provider/account, Slack workspace and selected channels, and the WhatsApp number/provider plus which existing groups must be included. This is account setup information, not a reason to delay the independent portal and permission work.

Slack documentation confirms conversation access depends on token scopes and membership; private-channel support is not blanket access to the workspace: https://docs.slack.dev/reference/methods/conversations.history/ and https://docs.slack.dev/reference/scopes/groups.history/.

The official WhatsApp groups documentation could not be fetched during this planning pass (HTTP 429). Existing-group compatibility and account eligibility remain unverified. Recheck official provider documentation and the actual account capability before choosing an implementation.

## Acceptance

- Two synthetic clients cannot access each other's onboarding, shared versions, comments, conversations or files, including guessed IDs and expired/revoked links.
- Staff can see and send only in explicitly allowed conversations; private founder content remains excluded.
- A client change request is tied to the reviewed version and appears in delivery follow-up without automatically approving or billing anything.
- Email/Slack fixtures verify threading, duplicate events, reconnects, permission revocation and ambiguous send outcomes. WhatsApp tests use the exact supported provider route once established.
- AI drafts cite permitted context and never send automatically.
- Portal and staff inbox are usable on narrow and desktop screens.
- Before calling any provider connection operational, run a bounded live round trip with an identified test account/channel and approved test message. A missing connection stays visibly unavailable.

## Approval boundary

Approval authorizes Phase 5 implementation and local tests. It does not authorize broadcasting links, contacting clients, sending agreements, connecting personal inboxes, purchases or deployment. Account connections and live test recipients will be made concrete before the corresponding action. The later user instruction authorizes all remaining phases without further phase approvals; continue planning and implementation under the updated roadmap.

## Implementation checkpoint — client onboarding and reviews

Approved with “continue”. The onboarding/review portion is implemented locally; **Phase 5 remains in progress**. Shared inbox, provider adapters, conversation grants and AI reply drafting are still outstanding and must not be represented as connected or complete.

- Manager-only engagements support dynamic services, retainer/one-time arrangements, scope, allowances, contact notes and configurable required questions. Submission snapshots preserve their form revision and manager acceptance.
- Separate delivery portal access expires after 24 hours, rotates/revokes previous links, hashes both the link credential and a separately shared random access code, and checks both on every read/write/download. Credentials are removed from the browser URL and are never included in sales-portal links. This is code possession verification, not verified client identity or MFA; sensitive material requiring identity verification remains a rollout/design restriction.
- PNG/JPEG/WebP/PDF brand uploads have content-type detection, a 20 MB file limit, 30-file/100 MB engagement allowance and scoped downloads. Office documents can be supplied as links in onboarding answers. General file scanning, attachment deletion and abandoned-file cleanup after process death are not yet implemented; production rollout needs these decisions.
- Exact manager-approved brief/submission snapshots can be shared or withdrawn. Internal briefs, employee identities, feedback, prompts and candidate assets are omitted from client payloads. Clients comment/approve/request changes against a share ID and version; retry IDs prevent duplicate submissions/reviews. A change request records a task event, alerts the reviewer and changes fulfilment history so stale confirmations fail. Creating a share/link does not record delivery or charge for a revision.
- Additive JSON data lives in the existing `core.deliveryOperations.state.clients` namespace under the existing workspace transaction lock; no physical column/entity mapping changes or schema migration are needed. The existing 10 MB state limit applies. Normalization/archiving remains a scaling prerequisite.
- Endpoints use `/portal/delivery-client/*` and `/portal/delivery-client-files/*`, preserving the existing API proxy/ingress prefix. The frontend public route is `/delivery-client`; managers use Delivery → Clients.

Verification so far: server compilation and metadata code generation passed; rollback-only PostgreSQL checks cover two-client isolation, manager controls, code verification, file access, required questions, duplicate response handling, approved-version sharing, private payloads, objection/stale fulfilment, withdrawal, rotation, revocation and expiry. Three frontend behavior tests passed. Client source lint passed in both packages; direct typechecks retain only the pre-existing unrelated Meta lead-intake and AppPath failures. Browser checks verified manager acceptance and a client change request on the actual API, plus desktop/mobile review layouts. Temporary client/project/user fixtures were removed. No real clients contacted, no provider accounts connected, no paid AI calls and no deployment.

Next work remains within this approved phase: shared inbox permissions and read/send workflows, email/Slack integration, supported selected-group WhatsApp route discovery, scoped AI draft generation, provider fixtures and live acceptance with an identified test account/message. Awaiting the user's email provider/account, Slack workspace/channels and WhatsApp provider/group details; independent inbox permission work can continue meanwhile.

## Inbox checkpoint under autonomous continuation

Conversation privacy and explicit read/send grants are implemented independently of project membership. Selected manually recorded inbound notes can feed an enabled project/role-scoped COPY agent. The model receives no other conversations; sources remain attached to the editable, unsent draft. AI generation has no send tools, no automatic retry, a 60-second timeout, bounded inputs/outputs, shared agent daily counts across delivery and inbox, and a final access/configuration/revision check. Failed runs count; late output after access changes is discarded. Synthetic SDK checks verified sources, daily cap and in-flight revocation without paid calls. Human sends and live provider sync remain unavailable.

## 2026-10-30 — guided setup follow-up

IMP-04/09 now connects company/project/team/service-plan setup to first work under the mandatory decision in OTOGROW-OS-IMPROVEMENTS.md. Native company writes retain native permission/default handling; project/plan/optional task orchestration needs one exact atomic receipt rather than sequential browser creates. Existing clients/projects/plans remain reusable, missing independent staff is explicit, and saved versus unsaved progress is visible. No client message, portal send, contract/payment action, invitation or provider connection is implied. Implementation/acceptance is authorized without another phase gate; exact source/draft/retry/role and desktop/narrow checks remain required.

The guided project/service-plan/first-task workflow is now implemented and accepted locally, including new and reused work, independent review, exact receipt recovery after a dropped successful response, reload, real outage/draft restoration and desktop320/390px layouts. The additive generated1793315781694 migration is applied locally.129 frontend and15 backend tests, direct package types, build/codegen/lint,214-table migration preservation and actual-service rollback checks passed. All disposable setup data and fault instrumentation were exactly cleaned/restored; acceptance details and private proof paths are in the improvement tracker.

Phase5 remains in progress. The Company creation bridge is implemented using the existing native API with stable UUID/fresh exact-ID recovery, but its full browser commit needs isolated queue acceptance: native writes enqueue Redis webhook/logic-function/audit/timeline jobs that a database-only fixture must not leave behind. This does not block existing-company setup. Gmail is the recorded provider; live Gmail/Slack/selected-WhatsApp adapters, account/channel configuration and authorized live sending acceptance remain separate work. No repeated phase approval or employee-name clarification is needed.

### 2026-10-31 — knowledge/meeting evidence follow-up

The authorized IMP-18/37 batch makes Brand knowledge independent of the legacy full workspace, with current scoped summary/detail reads, exact draft/recovery ownership and a local transcript-file preview/import. Known role/project loss must remove private source evidence; network loss retains only hidden same-source drafts. Immutable versions, manager publication and approved task-assistant fingerprints remain authoritative. TXT/VTT/SRT evidence import does not connect Fathom, transcribe recordings, invoke a model, publish automatically or change tasks/plans. The mandatory decision and acceptance are recorded in the improvement tracker; Phase5 and whole18/37 remain unfinished.

2026-10-31 local knowledge acceptance completed: task-free paged projects/sources, exact version detail, lightweight current-authority polling, source-owned draft/recovery and local TXT/VTT/SRT preview/import are verified.128affected frontend cases,13backend cases across completed bounded runs, direct types/build/codegen/lint, actual scope/search/history/read-only checks, a genuine two-session strict-create collision and the original knowledge/agent/isolated-Redis regressions passed. The generated1793415137847 index passed215-table/full-schema preservation and is applied locally. Desktop320/390px project/source/import/Keep/discard/outage/lost-response/reload/publication journeys passed. Exact55-project/67-source/67-version/3-event cleanup preserved171protected tables and original settings/authentication; normal API/viewport are restored. Whole18/37 and Phase5 remain unfinished for connected Fathom/transcription/media/broader consumers and inbox/provider work. No inference, external send, real account/role change, push or deployment. Full evidence is in the improvement tracker.

## 2026-11-03 — verified continuation checkpoint

IMP-04 is locally complete: actual native Company creation→project/team→SEO retainer→independently reviewed first-task assignment, persistent request recovery,320px review/success and seven guarded DB/Redis interruption paths passed. Portal exact-body recovery/denial races and manager Clients authority/creation handoff are verified slices. Fathom encrypted explicit import, immutable provenance and published-context/client-relink boundaries pass actual services with mocked provider; live Fathom setup/media transcription remain. Gmail owner-consented exact-thread delegation is now being implemented; Slack/WhatsApp remain. No external send or deployment.

## 2026-11-03 — selected Gmail workflow backend and typed UI

Owner-consented exact Gmail account/channel/thread bindings, immutable consent receipts and a separately reviewed reply outbox now reuse native synchronization/transport. Actual source/permission/budget and independent-session send/revocation/unknown-result checks passed using synthetic transport only; additive schema preservation and ordinary local installation passed. The canonical task-free Inbox, exact receipt/draft recovery and legacy bookmarks have focused UI/router tests and inspected empty/setup journeys. Full thread/consent/send browser acceptance, live Google OAuth, Slack/selected WhatsApp and attachments remain; Phase5 and IMP-29 stay unfinished. No real mailbox, consent or email was changed.
