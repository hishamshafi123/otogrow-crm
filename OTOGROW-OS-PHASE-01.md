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
