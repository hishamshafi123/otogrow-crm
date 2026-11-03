# Phase 4 proposal — recurring work and follow-through

Status: approved by the user replying "approve". Implemented and verified locally. Live Telegram recipients are not yet authorized; no external message was sent.

2026-11-01 follow-up: canonical Team chat now opens through its genuine typed page without first loading the legacy task snapshot. Confirmed query/send/view access denial disposes private drafts, uncertain-send bodies and blocked navigation before a later fresh authorization may reopen current history. Ordinary same-source outages retain hidden drafts; peer/page navigation and late replies cannot carry preparation into another conversation. The existing five-minute reminder/read-receipt server rules are unchanged. Fifteen actual chat-component cases plus shared-shell/router acceptance passed; the local workspace has no second real teammate, so no real employee message or viewed receipt was sent. Full batch evidence is in IMP-37/43 and the adjacent IMP-10/46 correction; live Telegram and production workers remain operational setup.

## Outcome

Amna can schedule recurring work across roles, see what has actually been delivered, and follow up without manually chasing each task. Employees receive one Telegram reminder for unattended assignments or internal messages. Founder alerts surface actionable delivery risks.

## Scope

1. **Recurring service work.** Configurable daily, weekly and monthly task templates with project, service, assignee, reviewer, checklist, evidence requirements and notes. Support selected weekdays, start/end dates, pauses and a workspace timezone. Each occurrence is a normal delivery task with its own submission and approval history. SEO weekly/monthly reports are configurable templates, with existing agent evidence checks available. Editing a template affects future occurrences; existing tasks change only through explicit edits.
2. **Delivery and fulfilment.** Keep production approval separate from delivery. After approval, an authorized manager records when work was actually sent, with delivery evidence or a note. This creates the first fulfilment check 12 hours later. The manager chooses Fulfilled, Not fulfilled or Redoing. Fulfilled closes the cycle. Not fulfilled schedules another check 12 hours later. Redoing reopens the revision workflow and suspends the old cycle; revised approval and recorded redelivery start a new 12-hour cycle. No automatic fulfilment based on client silence.
3. **Internal messages and acknowledgment.** Add task notes addressed to named employees and assignment notifications, with explicit read/acknowledged state. Proposed simple rule: either opening the specific assignment/message or explicitly acknowledging it stops its reminder. Opening a generic dashboard does not count. One reminder after five minutes, 24/7, if neither has happened. Reassignment invalidates the old recipient's pending reminder. An edit does not restart reminders unless the sender explicitly requests fresh acknowledgment.
4. **Telegram delivery.** Reuse suitable existing Telegram transport and encrypted settings, with a delivery-specific notification outbox. Secure, expiring single-use account-link tokens replace trusting raw member IDs for this feature. Employees link their own Telegram chat; admins can see connected/missing status. Messages contain a short task summary and authenticated OS link, not client briefs or assets. The OS remains usable without Telegram, showing failed or unconfigured notifications visibly. No additional external reminder channels in this phase.
5. **Founder attention queue.** Raise deduplicated alerts for overdue deliverables and manager-flagged unhappy clients, scope/contract issues or budget concerns. Founder sees severity, owner, reason and task/project link, with acknowledge/resolve actions and Telegram delivery when configured. Campaign-performance and finance-derived automatic alerts arrive with their respective integrations in later phases; this phase must not invent those signals.

## Screens

- Amna's planner: recurring templates, upcoming occurrences, late work and unresolved fulfilment checks.
- Task detail: production state, latest delivery event, fulfilment status, next check and revision history.
- Employee inbox: unread assignments and addressed internal notes with clear acknowledgment controls.
- Founder attention cards: actionable incidents, age, owner and resolution.
- Settings: workspace timezone, notification availability and personal Telegram connection.

Retain the simpler card layout, keyboard access and reduced-motion behavior. Avoid adding another competing task board.

## Reliability and permissions

- Persist recurrence occurrences and scheduled checks with unique identities. Scheduler retries/restarts must not create duplicate tasks or duplicate logical reminders.
- Use database transactions and an outbox; recheck current membership, task access and acknowledgment before sending.
- Distinguish provider rejection from uncertain delivery. Do not blindly resend after a timeout that could have delivered the Telegram message. Exactly-once delivery cannot be guaranteed by Telegram; expose uncertain sends for review.
- Keep workspace/project isolation, manager-only approval and fulfilment decisions. Employees cannot mark their own work fulfilled or link someone else's chat.
- Store UTC timestamps and evaluate recurring schedules in the configured timezone. Specify month-end handling (last valid day) and daylight-saving handling. After downtime, create at most the latest missed occurrence per template and show skipped occurrences, avoiding a task flood.
- Repeated fulfilment checks refresh one outstanding inbox item; they should not produce an unlimited stack of duplicates. Keep event history for each response and scheduled check.

## Acceptance

- Daily/weekly/monthly templates generate exactly one task per intended occurrence; pauses, timezone changes and month-end schedules behave predictably.
- Approval alone never marks delivery or fulfilment. Twelve-hour checks and the three response paths work across revisions and restarts.
- Seen/acknowledged items suppress the five-minute ping; unattended items produce one logical ping, including outside working hours.
- Reassignment, removed access, bot errors and missing chat connections are handled without leaking data or silently dropping work.
- Founder incidents deduplicate and retain resolution history.
- Test scheduling with an injected clock, transactional fixtures and isolated queue tests. Verify desktop/narrow layouts. A live Telegram smoke test requires a connected bot and an explicitly identified test recipient; no employee messages are sent during development without that authorization.

## Approval boundary

Approval authorizes this implementation and local verification. It does not authorize deployment, purchases, connecting client inboxes, or messaging real employees. Any live Telegram test will identify its recipient and exact test message before sending. Phase 5 planning follows Phase 4 completion; Phase 5 implementation requires separate approval.


## Implementation and verification — 2026-10-24

Implemented Follow-through navigation, recurring templates, task delivery/history, fulfilment decisions, addressed internal notes, acknowledgment controls, founder attention cards and Telegram connection/settings UI. Existing approval remains separate from recorded delivery. Recurring tasks retain normal task permissions, submissions, evidence and optional agent checks.

The scheduler uses a durable PostgreSQL operations record/outbox and the existing workspace advisory lock, scanned once per minute. This avoids adding a second Redis queue for timed follow-through; duplicate and restarted scheduler calls are covered directly in transactional tests. The worker's existing Telegram poller handles new delivery-specific single-use link tokens. No second bot poller was introduced. The network send holds the same access lock after rechecking membership, acknowledgment and current assignment; ambiguous sends are not automatically repeated.

Assignment timestamps are saved when creating/reassigning tasks, so five minutes is measured from assignment rather than the scheduler's discovery time. Opening the specific task counts as seen. Old assignments without a timestamp enter the workflow on their first scan. Reminder timing is subject to the one-minute scheduler interval, not a real-time guarantee.

The generated migration `2-34-instance-command-fast-1792832831047-add-delivery-operations.ts` adds only the operations table, unique workspace index and workspace foreign key, with a reversible down method. Generation initially included unrelated local schema drift; those statements were removed before application. The Nx generation command stalled in dependency builds; the same repository generation CLI was run directly after a fresh server build. `scripts/apply-delivery-operations.cjs` applied only this reviewed command through the repository migration runner and recorded it normally.

### Checks passed

- Eight recurrence unit tests: daily catch-up, selected weekdays, duplicate suppression, local time, pause/end, leap-year month end and both daylight-saving transitions.
- Three frontend behavior tests: employee restrictions, explicit delivery recording after approval, and a version-checked redo decision.
- Rollback-only database/service verification: recurring creation idempotency and skipped counts; permissions; seen/acknowledged/reassigned/revoked reminders; single send; uncertain transport with no retry; single-use and expired Telegram links; 12-hour fulfilment checks; stale cycle rejection; revision/redelivery; founder alert deduplication. Telegram was mocked; no network message was sent.
- Existing delivery regression fixture passed after transactional creation was extended for recurrence.
- Browser checks verified the actual GraphQL-backed screen, a persisted template pause, opening the generated task, separate delivery state and missing-bot state, plus desktop/narrow layouts. The temporary project/users/state were removed and prior operations settings restored.
- Server build and metadata GraphQL generation passed. Delivery code lint passed in both packages. Direct typechecks retain the existing unrelated errors: two Meta lead-intake errors in the server and four AppPath errors in frontend modules.

### Operational limits

Scheduling and Telegram delivery default to disabled. The development workspace remains disabled and has no configured Telegram bot. Live linking and sending need a configured bot, a running existing bot poller and an identified authorized test recipient; these are not claimed as live-tested. No credentials or employee chat IDs were provisioned during this phase.

There is a maximum of 100 recurring templates per workspace and a 10 MB operations-history limit. This initial agency-scale implementation uses one locked JSON state record per workspace; it is not a high-volume messaging architecture. History retention/archive tooling and larger-volume storage should be addressed before approaching the limit. Invalid templates surface a visible error rather than silently assigning to a revoked user. Due times are configured as hours after actual task creation; catch-up creates only the latest missed occurrence and records how many were skipped.

Automatic founder alerts cover overdue delivery. Client, contract and budget concerns are manager-entered flags; ad-performance and financial detection await their corresponding phases. A Telegram timeout remains visibly uncertain and requires manual review, not an automatic resend. Previously unconfigured notifications remain visible in the OS and are not sent retroactively on connection.

Local Phase 4 implementation is complete. Phase 5 is proposed separately in `OTOGROW-OS-PHASE-05.md`; do not implement it until approved.

## 2026-10-29 — scoped review-assignment handoff follow-up

IMP-17 extends the existing addressed notice/durable outbox with a separate exact review-assignment source. Backups remain independent of native production assignees. Verified visible assignment/explicit receipt stops a once-only five-minute reminder; generic dashboard or production-task reads cannot mark it seen. Current review authority/source is rechecked before dispatch and obsolete notices are suppressed. Existing configuration, network-outside-lock and uncertainty rules remain.

This extension is locally accepted, including primary null-origin/revision0 notices, same-owner deadline preservation, changed-owner/new-submission/decision suppression, exact visible receipt/acknowledgement, independent-session races and mocked once-only after-hours dispatch. Explicit elapsed-age founder rules passed paused-save/history/preview acceptance without activation. No live send, bot/channel setting change or production deployment occurred. The user reports the bot on another deployed copy. The mandatory decision, complete evidence and protected cleanup receipt are underIMP-17 in the improvement tracker.


2026-10-29: The IMP-37 Approvals boundary is locally accepted: task-free context, bounded existing review queue, exact selected detail and thin exact acknowledgement, with no legacy workspace/Operations or task-list requests after entry.71backend/277distinct frontend cases, final direct types/lint/build/codegen,54-item actual rollback/snapshot-spy checks and55-item desktop390px guided/paged/backup/Seen/Acknowledge/independent-decision journeys passed. A discovered workflow-read outage/retry validity defect was repaired and repeat-tested without bypassing checks; IMP-17 returns to Local complete. All owned fixtures were removed with protected digests. Whole37 and broader06/10/11/34/40 remain unfinished; current totals21locally complete and25unfinished. No paid or live external action, Git push or deployment. Complete evidence is in OTOGROW-OS-IMPROVEMENTS.md.
