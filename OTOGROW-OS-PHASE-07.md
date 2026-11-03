# Phase 7 — Agency finance

Status: implementation authorized by “continue all the rest of the phases without my approval”. Local implementation in progress; no phase approval pause.

## Scope and acceptance

Immutable cash-basis entries, receivables, payment confirmation, opening cash and expense/salary allocation to projects. Separate supported currencies, never invent exchange rates. Show cash, receivables/overdue, last-30-day cash contribution, burn, runway and growth. Preserve evidence, void/correct history and accounting CSV exports. No tax-exemption assumptions. Accountant-specific Zoho mapping, monthly salary automation, multi-project allocations and reconciliation remain required before accounting rollout.

Verify permissions and durable history with synthetic fixtures, validate relevant calculations and transitions, and check the UI at desktop/narrow widths. Record completed checks and remaining integration work in the roadmap; unfinished items stay open.

## Local foundation checkpoint

The shared `delivery/business` service and `DeliveryBusiness` screens now persist this phase’s initial records, scoped access, optimistic revisions, approvals and audit histories. Data is additive JSON under `core.deliveryOperations.state.business` with the existing workspace transaction lock and 10 MB history bound; normalization/archive is required for scale. These records are manually entered. They must not be described as provider-synchronized, automatically published, accrual accounts or a completed production rollout.

Shared verification: policy/calculation tests, frontend behavior tests and rollback PostgreSQL workflow/permission checks passed. Finance receipt/void browser check passed. No external account connections, deployment or additional paid AI testing. See the roadmap’s autonomous continuation checkpoint for unfinished scope.


## 2026-10-27 monthly management-finance checkpoint

Monthly cost plans, exact explicit client/company allocations, service-month recognition, source review, posting/voiding and immutable history are now locally implemented and inspected at desktop/390px. Exact-money, form/orchestration, rollback, migration and concurrency acceptance passed. Existing cash records are a separate view; monthly results are recorded contribution, not complete profitability. The finance tracker retains IMP-21 In progress while source-linked partial payments/matching, AI cost import, forecasts, closing and accountant-specific mappings remain. See the improvement tracker for the current payment-reconciliation design and detailed evidence.

## 2026-10-28 payment reconciliation and recovery checkpoint

Partial invoice payments, separate monthly allocation matches, conserved balances, source/history links and reasoned reversal/voiding passed policy, actual-service rollback, independent-session concurrency and desktop/390px acceptance. Invoice application updates the existing receivable/overdue summary; matching never recognizes revenue or creates cash. Full API outage/retry retains hidden same-identity finance drafts, while verified denial/identity changes dispose them. The shared connection error supports actual Retry and cannot be dismissed into a blank page by Escape. All verified fixture finance data was removed; existing financial/activity/outbox baselines matched and current unrelated Operations state, including its worker heartbeat, was preserved. See the tracker for the explicit cleanup evidence and original whole-Operations hash limitation.

Phase 7 and IMP-21 remained in progress at this checkpoint; the subsequent AI-cost acceptance is recorded below. Counts are unchanged; nothing is deployed and no real payment occurred.

## 2026-10-28 recorded AI-cost checkpoint

Explicit production-ledger financial evidence can now be reviewed, allocated and posted to a service month. A unique source claim and pending replacement draft prevent double recognition; reviewed lower/higher corrections atomically void prior recognition and reverse its monthly matches without altering actual cash, invoices or budget settlement. Exact zero/sub-cent amounts, safe finance-only access, immutable history, stale/retry/concurrency behavior, generated migration rollback and desktop/390px journeys passed local acceptance. Two disposable browser fixtures were cleaned with all fifteen protected table baselines matching; current unrelated Operations state was preserved. These internal charges are not verified provider invoices.

Monthly result locking is the next active slice, followed by collection/payment forecasts and accountant-specific mappings. IMP-21 and Phase 7 remain In progress. No production deployment, paid provider calls, real payments or external messages occurred. Detailed decisions, evidence and whole-item counts remain in the improvement tracker.

## 2026-10-28 monthly result-locking checkpoint

Reviewed months now have a reasoned management lock/reopen workflow, exact immutable all-currency/client/company summaries and history. Drafts and cross-month AI corrections block locking; ordinary recognition and both affected AI periods enforce the lock. Payments, invoice settlement, matching/reversal, plan configuration and incoming evidence stay operational. Direct types/lint/build/codegen, 51 server policy cases, 283 frontend cases, generated migration rollback and actual-service/concurrency acceptance passed. Desktop/390px, real outage recovery, stale/new-review recovery, keyboard reopening, corrected relock/history, month changes and activity source links were inspected. The disposable browser fixture was removed with all sixteen protected table baselines matching and current unrelated Operations state unchanged.

The next scope is reviewed collection/payment forecasting, then accountant-specific export mappings. This is not a tax/accounting close or a production rollout. IMP-21 remains In progress and the authoritative tracker still has 17 Local complete and 29 unfinished whole items.

## 2026-10-28 cash-forecast source checkpoint

Reviewed starting cash, exact daily scenarios, source-linked collections, plan/manual payment expectations, partial realization/reversal, accountable follow-up and immutable history are implemented. Package types, scoped lint, policy/frontend tests, generated migration rollback, actual-service rollback and independent-session races passed; the improvement tracker records counts and recovery refinements. The empty desktop setup was inspected. Populated desktop/390px end-to-end acceptance and exact browser-fixture cleanup remain, followed by accountant-specific export mappings. Phase 7 and IMP-21 remain In progress; no production rollout or real payment is implied.

## 2026-10-28 finance local acceptance

Reviewed cash forecasts passed populated desktop/390px, exact calendar/source/application/reversal/history and API-outage recovery acceptance. Configurable accountant handoffs now separate actual cash from posted recognition, require explicit dates/currency, validate mappings/precision, prevent unnoticed duplicates, preserve immutable CSV bytes and track reasoned manual import/reversal history. Recorded monthly margins use exact arithmetic and historical cash estimates state their different calendar/completeness basis. Generated migration up/down/data-preservation, actual-service/concurrency, direct types, scoped lint and focused UI regressions passed. All disposable fixtures were removed with21 protected baselines and current unrelated Operations state preserved.

IMP-21 is locally complete; the authoritative tracker has18 locally complete and28 unfinished whole items. Phase7 local workflows are implemented and verified; actual organization headers/accounts/tax choices, complete business balances and production accounting acceptance remain setup. No native Zoho synchronization, external import, tax completeness or production rollout is claimed. See the improvement tracker for decisions and exact acceptance evidence.
