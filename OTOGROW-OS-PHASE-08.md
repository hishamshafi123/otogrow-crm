# Phase 8 — Content and competitor operations

Status: implementation authorized by “continue all the rest of the phases without my approval”. Local implementation in progress; no phase approval pause.

## Scope and acceptance

Dynamic social channel/account selection, named content owners, scheduled dates, copy/asset links, independent approval and recorded publication evidence. Store competitor sources, dated observed facts, separate interpretations and adapted ideas; convert findings into delivery tasks. Live publishing and automated competitor collection must use supported APIs with verified account access. Do not claim manual entries are automated monitoring.

Verify permissions and durable history with synthetic fixtures, validate relevant calculations and transitions, and check the UI at desktop/narrow widths. Record completed checks and remaining integration work in the roadmap; unfinished items stay open.

## Local foundation checkpoint

The shared `delivery/business` service and `DeliveryBusiness` screens now persist this phase’s initial records, scoped access, optimistic revisions, approvals and audit histories. Data is additive JSON under `core.deliveryOperations.state.business` with the existing workspace transaction lock and 10 MB history bound; normalization/archive is required for scale. These records are manually entered. They must not be described as provider-synchronized, automatically published, accrual accounts or a completed production rollout.

Shared verification: policy/calculation tests, frontend behavior tests and rollback PostgreSQL workflow/permission checks passed. Finance receipt/void browser check passed. No external account connections, deployment or additional paid AI testing. See the roadmap’s autonomous continuation checkpoint for unfinished scope.
