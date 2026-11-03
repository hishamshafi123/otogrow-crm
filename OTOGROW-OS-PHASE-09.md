# Phase 9 — Developer delivery

Status: implementation authorized by “continue all the rest of the phases without my approval”. Local implementation in progress; no phase approval pause.

## Scope and acceptance

Use existing scoped task boards for developer assignments. Add project releases with owners, repository links, target dates, acceptance/test/rollback/handover checks, independent approval and release evidence. Preserve release history and assign follow-up tasks. Do not deploy repositories automatically. Native release-to-task dependency checks and separate client handover/acceptance are locally implemented and accepted. Automatic Git/CI synchronization and production/staff acceptance remain unfinished.

Verify permissions and durable history with synthetic fixtures, validate relevant calculations and transitions, and check the UI at desktop/narrow widths. Record completed checks and remaining integration work in the roadmap; unfinished items stay open.

## Local foundation checkpoint

The shared `delivery/business` service and `DeliveryBusiness` screens now persist this phase’s initial records, scoped access, optimistic revisions, approvals and audit histories. Data is additive JSON under `core.deliveryOperations.state.business` with the existing workspace transaction lock and 10 MB history bound; normalization/archive is required for scale. These records are manually entered. They must not be described as provider-synchronized, automatically published, accrual accounts or a completed production rollout.

Shared verification: policy/calculation tests, frontend behavior tests and rollback PostgreSQL workflow/permission checks passed. Finance receipt/void browser check passed. No external account connections, deployment or additional paid AI testing. See the roadmap’s autonomous continuation checkpoint for unfinished scope.


### 2026-11-03 — native release workflow in progress

A normalized release manifest/version/event engine now references exact native task/revision/independent-approval evidence, optional existing Jira/issues/PR links, repository/commit, acyclic dependencies and test/review/rollback/handover checks. Independent manager review, recorded successful/failed deployment, separate manager-recorded client handover/acceptance, immutable receipts and current native task field/row/client/member scope are implemented locally. These are human-recorded external evidence links; no GitHub/Jira synchronization, deployment action, client message or automatic native task fulfilment is claimed. Read/source/command services are split and legacy release records remain preserved.

Source/schema/privacy proof and policy acceptance are in progress under IMP-33. The migration was generated with the official CLI, scoped to its three additive tables/five indexes/seven FKs, and given retained-history guards; unrelated pre-existing ORM drift was excluded before any SQL execution. The UI, independent-session/interrupt recovery and full browser acceptance remain required. IMP-33 is In progress, not complete. See OTOGROW-OS-IMPROVEMENTS.md for the decision and evolving checks.


### 2026-11-03 — workflow acceptance checkpoint

The normalized native release workflow passed70 source/schema checks,54 policy/native-permission regressions, independent-session concurrency/revocation and three interruption paths. Actual browser acceptance covered new-plan preview/save, incomplete-submission guidance, independent approval, failed then successful deployment, separate handover/acceptance, exact refresh recovery, keyboard focus,390px reflow and retained drafts through navigation/API outages. Eight declared fixture events, cleanup rollback and precommit creation rollback were verified; all disposable records were removed with192 protected workspace tables preserved. This accepts the local human-recorded evidence workflow, not automatic Git/CI/Jira synchronization or external deployment/client sends. The broader IMP-33 remains Partial and phase9 is not declared fully complete. Validation and rollout details remain in the authoritative improvement tracker.
