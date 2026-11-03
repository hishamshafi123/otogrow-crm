# Otogrow OS Phase 1 delivery workspace

Status: implemented locally; focused verification complete. Repository-wide typecheck limitations are recorded below.

## Outcome

Amna can plan the team's work in a clear workspace, employees can find and submit their assignments, and Amna can approve or request revisions. Founder and Amna see work across the company; employees see permitted work. The visual redesign is a functional part of this phase.

This phase provides the common foundation for editors, designers, SEO, performance marketing and developers. Phase 2 will add executable configurable AI agents; Phase 3 will add shot-level generation and editing assistance. Existing CRM functionality remains accessible.

## Screens and design

1. Home: role-aware summary cards for due work, overdue work, waiting review and blockers, with direct links to the relevant list. Founder/admin sees the team; employees see their assignments.
2. My Work: today/upcoming list with client, deliverable, due date, priority, production notes and next action. Visible progress distinguishes submitted from approved work.
3. Team Planner: list and Kanban views filtered by person, client, service and date. Amna/admin can assign, schedule, change priorities and add instructions.
4. Task detail: brief/description, assignee, reviewer, client/engagement, due date, checklist, reference/evidence links, attachments, internal discussion and versioned submission history.
5. Reviews: submitted work with evidence, approve/request-changes actions and a revision history. Reviewer can return a precise explanation to the employee.
6. Team access: configure membership, role and allowed client/project scope using existing permission infrastructure wherever possible.

Visual direction: calm neutral background, Otogrow blue accents, raised cards with subtle shadows, generous spacing, restrained borders, readable text and explicit statuses. Keep the primary action prominent. Use drawers for task details to preserve context. Navigation focuses on Home, My Work, Team Planner, Reviews and Clients; existing CRM/admin features remain reachable. Do not show empty future modules as working features.

Use informative empty states, keyboard-accessible controls, contrast that does not depend only on color, responsive layouts and reduced-motion support. A short approval celebration should never obstruct the next task or replay every time the page opens.

## Work model and permissions

- Relate work to a client and an engagement/project where applicable. Permit internal work without a client. Engagements group service work and are not a fixed-price/package engine in this phase.
- Initial fields: title, description/brief, service label, assignee, reviewer, scheduled date, due date, priority, production state, blocker reason, checklist, evidence and submission version.
- Provisional production states: Planned, In progress, Blocked, In review, Changes requested, Approved. Delivery and fulfilment remain separate concepts and are added in Phase 4.
- Submission creates a versioned snapshot of the submitted description/evidence. Revision retains prior submissions and reviewer feedback.
- Founder and Amna have full visibility. Other employees receive explicit scope. Role labels and assignments are configurable; do not hard-code staff names into authorization.
- Editor/designer/specialist can work on and submit permitted assignments. An assignee cannot approve their own final submission, even if another permission would normally allow review; route it to another authorized reviewer.
- Reviewer approval/request-changes is enforced server-side, not just hidden in the UI. Record actor and timestamp for assignments, submissions and review decisions.
- Show checklist progress separately from approved-deliverable progress. Neither submission nor approval should falsely mark a retainer fulfilled.

## Implementation sequence after approval

1. Inspect current app routes/UI, task metadata, roles, files and timeline behavior; establish a baseline with the existing application. Choose exact extension points before modifying schemas.
2. Implement the visual shell and reusable card/list/detail patterns in the existing frontend. Use Linaria, Lingui and the existing component system.
3. Extend existing task/workspace metadata or add narrowly scoped related records for engagements and submissions, based on the repository's established patterns. Avoid a parallel task database.
4. Implement persisted assignments, filtered work views, evidence submissions, revision history and server-enforced review transitions.
5. Connect home summaries, review queue and progress to real records. Implement the bounded approval animation.
6. Verify the end-to-end workflow and report the result. Record completion evidence in the roadmap, then prepare Phase 2 for approval.

Schema changes must follow the repository's current-version upgrade/migration rules. Preserve existing records and task consumers. Generate GraphQL artifacts if needed and exclude incidental translation-catalog churn.

## Acceptance criteria

- Admin creates a client engagement and assigns an editor a video task with due date, references and music notes; it appears in that editor's work list.
- Amna can reschedule/reassign work and filter daily/weekly planning across roles.
- Employee submits a file or evidence link; it appears in the reviewer queue with the submitted version.
- An editor's self-approval attempt is rejected at the server, including direct API calls.
- Amna requests changes; the editor sees feedback, submits a new version, and the previous version remains inspectable.
- Approval updates the appropriate progress indicators and shows the celebration once without counting the work as client-fulfilled.
- A user outside the permitted client/project scope cannot read or mutate its tasks/evidence through UI or API.
- Existing CRM task, person, company and opportunity navigation remains functional.
- Reloading preserves assignments, evidence, state and history. Empty and error states clearly communicate what happened.
- Screens are visually inspected at desktop and narrow widths; keyboard operation and reduced-motion behavior are checked.

## Validation

Meaningful tests cover role boundaries, review transitions, self-approval rejection, revision preservation and relevant task regressions. Run affected-package typechecks directly and appropriate diff lint. Perform an end-to-end UI walkthrough with authorized test users/records and capture representative screens. Document failures or unavailable checks rather than claiming they passed. No tests are required for this planning-only document change.

## Scope boundaries

This phase does not install Paperclip/FounderOS, launch agents, connect paid providers, generate media, send external notifications/messages, publish content, change ad accounts, or build financial reporting. Those are tracked in later phases. Existing capability is preserved; new external actions are not implied by approval of this phase.

The phase establishes a working task/review experience rather than a cosmetic dashboard. Approval authorizes the implementation above; future phases require separate plans and approvals.

## Implementation and verification 2026 10 24

- Entry point: `/delivery`, accessible through **Otogrow workspace** in the existing navigation.
- Delivered Home, My Work, Team Planner with list/board and date-range filters, task drawer, review actions, project membership and delivery-role configuration.
- Native CRM task rows retain titles, assignees, due dates and completion status. Core delivery records add project scope, briefs, checklists, versioned evidence, feedback and activity. Ordinary CRM tasks continue to use their existing screens; protected delivery tasks are managed through the delivery workspace.
- Final approval requires the assigned manager and rejects the assignee, including administrators submitting their own work. Optimistic revisions reject stale writes; project changes and mutations serialize per workspace.
- Evidence and attachments are supported as HTTP(S) file links. Direct binary uploads and managed media processing remain part of Phase 3's asset pipeline. Linked files retain their source system's sharing and expiration rules.
- Approval is distinct from client fulfilment. Approval celebration is remembered per user/task/version in this browser; it is not cross-device notification delivery. Refresh retrieves teammates' latest changes.
- Generated and applied the delivery-only instance migration through the repository migration runner. An initial automatic-review rejection was resolved by auditing the full ledger: only this additive migration was pending. Unrelated generated schema changes were removed before application.
- 73 backend tests passed across delivery authorization/validation and query-builder regression suites; 4 frontend interaction tests passed for review feedback, self-approval visibility, resubmission and retained history.
- The rollback-only PostgreSQL script `packages/twenty-server/scripts/check-delivery-workspace.cjs` passed assignment, scoped reads, outsider rejection, stale writes, two submission versions, final approval, access revocation and generic-query isolation through both query engines. All verification fixtures rolled back.
- Changed-file frontend/server lint passed. Server compilation and metadata GraphQL generation succeeded. Shared package rebuilt without Nx cache, bypassing a stalled barrel-generation dependency after the normal command stalled.
- Full direct typechecks still report errors outside the delivery implementation: frontend `useFrontComponentExecutionContext` and its tests have `AppPath` incompatibilities; server `meta-lead-intake.service.ts` has two `DeepPartial` update-input incompatibilities after rebuilding shared declarations. These checks are not reported as green.
- Browser checked sign-in, responsive Home, team setup, weekly date filters and board controls. The local account has one existing teammate, so real staff invitations and role assignment remain operational setup; no fictional production team was created.

Phase 2 is proposed in `OTOGROW-OS-PHASE-02.md` and must receive separate approval. Nothing has been deployed or connected to paid AI providers in Phase 1.

## 2026-10-29 — IMP-17 review bottleneck follow-up

Implementation is authorized under the improvement tracker. Extend Approvals with factual pending submission age, exact queue/batch journeys, submission-scoped backup reviewer assignment and optional explicitly configured elapsed-age escalation. Keep canonical manager/client-delivery ownership and existing project membership; a narrow delivery.review capability must not grant global management or self-approval. The mandatory business/workflow/design decision and acceptance criteria are recorded underIMP-17 in OTOGROW-OS-IMPROVEMENTS.md.

IMP-17 is locally accepted: exact typed queue/counts/history, guided individual checks/decisions, conditional independent backup authority, immediate verified owner updates, primary/backup notices and configured elapsed-age rules passed functional, concurrency, migration and actual desktop/390px/outage/navigation acceptance. The generated additive migration is applied locally. All disposable UI records/notices were removed with protected original-state digests. No live send or production deployment is implied; full evidence and remaining rollout limits are in the improvement tracker.

## 2026-10-29 — bounded primary task reads

IMP-37/40 follow-up is authorized and In progress under the mandatory decision in the improvement tracker. Split task-free typed context, complete scoped counters/lightweight pages, exact on-demand detail and thin task-command results. Remove the sidebar's hidden full workspace fetch. Today/My tasks migrate first; Planner requires complete current-plan capacity reads. Specialized legacy consumers remain explicit until migrated; no summary can masquerade as a full task and no whole-item completion is claimed for a first slice. Preserve existing permissions, independent approvals, native tasks, source links/drafts and immutable history. Local/actual-volume and desktop390px acceptance remain required; no provider or production action is implied.

The Today/My tasks slice is locally accepted with50 backend and171 frontend cases, direct types/lint/build/codegen,167-task actual-service scope/paging/payload checks and desktop390px/outage/create/submit/independent-review journeys. Cold primary journeys made no legacy workspace operation; deliberate specialized-domain navigation remains a legacy boundary. The exact-assignment receipt race under IMP-12 was repaired and verified. All39 owned UI tasks and other fixtures were removed with original digests preserved. Full evidence and limits are in the improvement tracker. Continue IMP-37 with complete bounded Planner capacity aggregates and assignment drilldowns; whole-item completion remains open.


2026-10-29: IMP-37 Planner is locally accepted. Tasks and complete Team workload now use separate focused views with typed25-row summaries/drilldowns, coherent database aggregates, exact existing plan/availability writes and protected drafts.29backend/100frontend cases, direct types/lint/build/codegen,61-member actual rollback/interleaving checks and desktop390px journeys passed; all owned fixtures were removed with original digests preserved. Approvals is the next task-free boundary migration under the decision in the improvement tracker. Specialized legacy consumers and whole IMP-37 remain unfinished; no production deployment or live external action.


2026-10-29: The IMP-37 Approvals boundary is locally accepted: task-free context, bounded existing review queue, exact selected detail and thin exact acknowledgement, with no legacy workspace/Operations or task-list requests after entry.71backend/277distinct frontend cases, final direct types/lint/build/codegen,54-item actual rollback/snapshot-spy checks and55-item desktop390px guided/paged/backup/Seen/Acknowledge/independent-decision journeys passed. A discovered workflow-read outage/retry validity defect was repaired and repeat-tested without bypassing checks; IMP-17 returns to Local complete. All owned fixtures were removed with protected digests. Whole37 and broader06/10/11/34/40 remain unfinished; current totals21locally complete and25unfinished. No paid or live external action, Git push or deployment. Complete evidence is in OTOGROW-OS-IMPROVEMENTS.md.
