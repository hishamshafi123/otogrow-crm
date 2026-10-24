# Phase 9 — Developer delivery

Status: implementation authorized by “continue all the rest of the phases without my approval”. Local implementation in progress; no phase approval pause.

## Scope and acceptance

Use existing scoped task boards for developer assignments. Add project releases with owners, repository links, target dates, acceptance/test/rollback/handover checks, independent approval and release evidence. Preserve release history and assign follow-up tasks. Do not deploy repositories automatically. Git/CI synchronization, release-to-task dependency checks and client handover acceptance require further implementation.

Verify permissions and durable history with synthetic fixtures, validate relevant calculations and transitions, and check the UI at desktop/narrow widths. Record completed checks and remaining integration work in the roadmap; unfinished items stay open.

## Local foundation checkpoint

The shared `delivery/business` service and `DeliveryBusiness` screens now persist this phase’s initial records, scoped access, optimistic revisions, approvals and audit histories. Data is additive JSON under `core.deliveryOperations.state.business` with the existing workspace transaction lock and 10 MB history bound; normalization/archive is required for scale. These records are manually entered. They must not be described as provider-synchronized, automatically published, accrual accounts or a completed production rollout.

Shared verification: policy/calculation tests, frontend behavior tests and rollback PostgreSQL workflow/permission checks passed. Finance receipt/void browser check passed. No external account connections, deployment or additional paid AI testing. See the roadmap’s autonomous continuation checkpoint for unfinished scope.
