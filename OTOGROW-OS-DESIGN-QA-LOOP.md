# Otogrow OS redesign and QA loop

Status: **Approved and executing — user replied “ok start” on 2026-11-06.**
Prepared: 2026-11-06, Asia/Makassar.
Owner: the primary engineering agent, with separate design/implementation and review agents.
Related tracker: OTOGROW-OS-IMPROVEMENTS.md, especially IMP-01–12, 37, 40 and 42.

## Authorization and intended outcome

The user requested a concrete loop to improve every OS page, inspect the actual result, critique it, and repeat when it remains difficult to read or use. They approved this process with “ok start” on 2026-11-06. Implementation and verification now proceed across the inventory without new per-page approval gates. Existing spending and external-action boundaries remain unchanged.

The outcome is an OS in which the founder, Amna, editors, marketers, SEO staff, designers, developers, sales/setters and clients can understand their current work, responsibility and next action. Improve hierarchy, copy, density, forms, interaction and navigation together. Preserve real capabilities and business safeguards.

The previous pass improved shared styling and selected workflows. It did not establish current page-by-page acceptance across all nested views. The live narrow Finance screen still spends much of its first screen on navigation, repeated headings and explanatory text; Today gives a large amount of space to zero-state summaries. Passing unit tests and avoiding horizontal overflow did not settle those readability issues. IMP-06 is reopened; historical functional evidence remains valid for what it actually tested.

## What counts as complete coverage

Source inspection finds 22 permission-dependent navigation destinations across seven groups and a lower bound of 36 principal delivery page/view combinations. Neither is the complete screen count. The dispatcher also selects legacy/detail branches; there are separate drawers, forms, settings and public journeys. The final denominator must come from reconciling source routes, navigation, component branches and the running app.

Maintain the approved surface manifest. Every reachable page, meaningfully different tab, detail, form, dialog, drawer and public/client screen receives a stable ID. Parameterized records share a template entry with representative data cases; do not count each client as a separate design. Aliases and redirects are recorded against their target. Feature-gated or unavailable surfaces remain explicitly unverified until testable. Unreachable examples/developer tools and external providers' own websites are documented exclusions, not hidden omissions.

| Coverage family | Required scope |
| --- | --- |
| Navigation and daily work | Expanded/collapsed/pinned sidebar, mobile navigation, Today, My tasks, Planner list/board/workload, filters, paging, assignment drilldowns and Approvals |
| Task lifecycle | Create/edit, brief, production, evidence, submission, comparison, feedback, revisions/costs, reviewer handoff, delivery, fulfilment, notes and history |
| Creative and knowledge | Briefs, references, shots, assets, editing, final review, generation, media/model selection, video QA, learning library, brand assets and meeting/transcript imports |
| Clients and public journeys | Setup, agreements, commitments, onboarding, exact-version sharing, client review, service-aware budget forms, expired/revoked access, client portal and public forms |
| Communication and service operations | Inbox, account consent/delegation, conversations/composer/drafts, team chat, reminders, recurring work, service workflows, batches and notification history |
| Growth and development | Advertising reports/recommendations/budgets/connections, SEO, content table/calendar/plans/accounts, competitor sources/findings and release planning/review |
| Finance and management | Cash, forecast, payments/matching, monthly results, cost plans, AI costs, exports, team/projects, roles/effective access, activity, company overview and escalation |
| AI workspace | Assistant catalog/configuration, context/preparation, runs/results/cancellation/history, spending, media providers/defaults and task-associated assistant panels |
| Native CRM and settings | Reachable sales/people/companies/opportunities/tasks/quotes/sequences/calling, dashboards, search and side panels; account/workspace/permissions/integrations and other enabled settings |
| Entry and global states | Login/onboarding, navigation recovery, global dialogs/toasts, permission failures, unavailable features, loading and error boundaries |

Source anchors: useDeliveryNavigation.ts; DeliveryWorkspacePage.tsx; DeliveryTasksPage.tsx; DeliveryTaskDetail.tsx; finance/DeliveryFinance.tsx; content/content-navigation.ts; creative/production/creative-production.types.ts; creative/atlas/DeliveryAiWorkspaceNavigation.tsx; useCreateWorkspaceAppRouter.tsx; SettingsRoutes.tsx; MainNavigationDrawerScrollableItems.tsx. The 100 path-bearing settings declarations include aliases/redirects/feature gates; they are not 100 verified unique screens.

## The repeatable loop

1. **Map the page and its job.** Record the role, purpose, entry route, prerequisites, primary action, owner, downstream result and all child surfaces. Start at the real containing route, not an isolated component.
2. **Capture the baseline.** Open the current screen with empty, realistic populated and dense/long-content cases. Capture the full reading path, including below the fold and expanded forms. Record concrete problems with locations and business impact.
3. **Design before editing.** Define the desired reading order and interaction flow. Compare at least two plausible arrangements where restructuring is material. Choose how to expose the primary work and reduce repeated prose, competing controls and unnecessary panels. Reuse an agreed component pattern; record any justified new pattern.
4. **Implement one coherent slice.** Assign a bounded page/journey to an implementation owner. Keep the containing route, role boundaries, drafts, history and downstream handoff working. Avoid unrelated backend changes or placeholder functionality.
5. **Run technical and browser QA.** Use focused behavior tests, direct type checking and scoped lint. Then actually complete the page's scenario in the running app: navigate, read, edit, validate, save/submit where safely supported, recover and return. Compare resulting state/data with expectations; a click or toast alone is insufficient.
6. **Independent critique.** A reviewer who did not author the slice receives its user role, task and criteria, without an author-led walkthrough. The reviewer examines the actual screen and journey, before/after evidence, wording and the gates below. Findings need a location, impact and concrete correction. AI review is not represented as real staff usability testing.
7. **Rework and repeat.** Any failed mandatory gate returns the slice to design or implementation. Reproduce each finding, fix it and retest the exact case plus affected neighbors. Capture fresh evidence after changes. Do not close a page on a test count, attractive screenshot or subjective numeric score.
8. **Accept, record and move on.** The coordinator checks current evidence, fixture cleanup and downstream regressions. Mark the surface locally accepted only when every applicable gate passes. Record remaining deployment/staff verification separately, then take the next queued surface.

Loop: inventory → baseline → design → implementation → technical/browser QA → independent critique → fixes and retest → regression check → local acceptance.

If three attempts fail to resolve the same readability or workflow problem, change the layout approach and assign a fresh reviewer. Three attempts are not a completion limit. If a genuine missing prerequisite prevents verification, retain an explicit unverified status with the exact next step and continue independent pages; never convert absence of evidence into a pass.

## Required quality gates

Each gate has one of four evidence-backed results: **Pass, Needs work, Unverified, Not applicable with reason**. There is no averaged score that can hide a failed gate.

| Gate | Acceptance evidence |
| --- | --- |
| Understandable purpose | A reviewer can identify what this page is for, current state, responsibility and next action from the page itself. No author explanation is needed. |
| Readable content | Core task text and values use the agreed legible type scale; sane line length/spacing, visible labels, sensible wrapping and clear grouping. No clipping, overlapping text, giant prose blocks or unexplained technical vocabulary. Do not solve clutter by shrinking essential text. |
| Useful hierarchy | Work and decision inputs precede secondary configuration. Primary action is clear within each task context. Dates, units, owner, status and next action stay associated. Empty workspaces offer a useful next step instead of a wall of zero counters. |
| Appropriate density | Lists/tables support scanning; forms group related fields; optional details use clear disclosure. Remove duplicate introductions. Keep warnings or limitations visible where they affect a decision; do not hide important financial, approval or access meaning for cosmetic simplicity. |
| Coherent visual design | Typography, spacing, surfaces, controls, selected/hover/focus/disabled states and icons follow the shared system. Each screen is judged as a complete composition, not just a collection of compliant components. |
| Responsive interaction | No page-level horizontal overflow or obscured controls at the required widths. Deliberately scrollable boards/tables are labelled and operable; ordinary text remains readable. Test wide/collapsed sidebars and floating controls. All content/actions remain reachable. |
| Accessibility | Visible focus, sensible keyboard order, labels and announced results/errors, contrast measured in both themes, motion preferences respected and actual text scaling verified. Modal focus enters, stays correctly contained and returns on close. |
| Complete workflow | Primary action and a material exception path work from the containing route through the real result and return path. Reload, direct links and Back/Forward preserve appropriate state. Validation is specific; drafts and uncertain results are recoverable. |
| Role and business correctness | Inspect distinct role-sensitive renderings, own/other/unassigned work and relevant combined roles. Preserve independent final approval, approved-versus-fulfilled distinction, client-service visibility, private communications, phone access and spend controls. |
| Honest data and failures | Empty, unknown, zero, stale, loading, denied and error states remain distinguishable. Retry/permission recovery gives an accurate next action. Manual workflows or unconfigured providers are never presented as connected. |

The initial type baseline is 14–16px for primary operational reading and 12–13px for secondary metadata, adjusted only with documented purpose and actual review. It is a design starting point, not a claim that font size alone makes a page usable.

Contrast targets follow [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): at least 4.5:1 for ordinary text and 3:1 for qualifying large text. Test [200% text scaling](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) without losing functionality. Inspect [320 CSS-pixel reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) separately; a narrow viewport is not proof of actual browser zoom. Aim for 44px primary touch targets, informed by [W3C's enhanced target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html); this does not assert blanket WCAG certification.

## Verification matrix and evidence

- Inspect every surface at normal desktop and narrow phone width in both themes. Baseline widths: 1440, 1280, 768, 390 and 320px; inspect intermediate widths where components change layout and the widest supported sidebar.
- Every unique page/layout gets keyboard traversal and actual 200% scaling verification in a browser that supports it. If the in-app browser cannot provide real zoom, use a supported browser or record the case unverified. Do not substitute CSS transforms or a small viewport for zoom.
- State rows include populated, empty, loading, long/dense content, form validation, success, transport failure/retry, access denial/revocation, unsaved edits and uncertain mutation outcome where applicable.
- Role cases cover founder/admin, secondary admin/PM, ordinary staff and clients, plus specialist capabilities that visibly change the screen. Dynamic roles are grouped by actual effective access/rendering, not assumed job-title permissions. Do not test the unrestricted founder screen and infer everyone else's experience.
- Use safe realistic agency fixtures: long brand/task names, several deadlines, mixed statuses, revisions, missing assets, waiting approvals, multi-currency figures and long messages/transcripts where relevant. Empty screens alone cannot validate a busy team.
- Use existing behavior checks and browser tooling. Add tests for meaningful new behavior/regressions; do not write tests that merely mirror styling. A small manifest/check helper can be added after approval if it prevents omissions, but do not build a second application just to manage this work.
- Store evidence under an ignored local artifact directory, with manifest references to route, role, state, viewport/theme/zoom, source revision or diff fingerprint, timestamp, reviewer and findings. Browser screenshots and source observations are distinct evidence. Capture top and scrolled/expanded states when necessary.
- Use isolated local fixtures with explicit ownership and cleanup receipts. Keep real client data and credentials out of evidence. Restore temporary theme, viewport and other test preferences. Do not send real messages, spend provider credits, change ad budgets or activate schedules as part of design QA.

An implementation change invalidates the evidence for the affected surface. A shared-style/component change marks affected consumers **Needs recheck**; use dependency mapping to retest every consumer that can change visibly or behaviorally. Earlier screenshots cannot close a changed surface or dependency. Evidence may carry forward across an unrelated commit when the coordinator records why that surface's rendering, behavior, relevant dependencies, role/configuration and fixture definitions remain unchanged; retain its original revision and timestamp. This permits finite incremental acceptance without pretending that stale evidence validates a changed screen. A quick global sweep after a batch does not replace each surface's required acceptance.

## Agent responsibilities and resource controls

Use up to four concurrent agents: coordinator/workflow architect, page designer/implementer, independent visual/copy reviewer, and workflow/accessibility/regression reviewer. Assign non-overlapping file ownership. Parallelize investigation and independent page slices; serialize shared-style integration, heavy builds, fixture changes and the active browser session. Keep within the user's 6–8GB RAM guidance. An unavailable agent leaves its review pending; the author does not silently self-certify that gate.

The coordinator owns the common design vocabulary, permission/business decisions, final integration and completion status. Reviewers can reject a page even when tests pass. Review output must state observed facts and limitations, not praise the implementation.

## Tracker and progress reporting

Maintain the detailed manifest beside this plan after approval, linked back to the existing IMP IDs rather than inventing new improvement counts.

Each surface row records: ID; parent/child IDs; URL/query branch and source; role/capabilities/flags; user job and acceptance scenario; data-state cases; baseline findings; design decision; implementation owner; reviewer; iteration; current status; required matrix results; before/after evidence; code revision; related IMP IDs; dependencies invalidated; remaining issue/input; cleanup receipt.

Statuses: **Inventoried → Baseline captured → Design ready → Implementing → QA → Needs rework → Locally accepted**. **Needs recheck** reopens changed consumers. **Unverified/setup needed** identifies a concrete prerequisite. Deployment/staff acceptance are separate fields.

Report exact surfaces accepted / enumerated, unresolved required cases, failed review findings, iterations completed, current work and next work. New discoveries increase the denominator visibly. A family cannot close with unenumerated children. Do not announce an OS-wide completion percentage until the inventory is reconciled; do not treat a shared CSS update as acceptance of all consumers.

## Approved execution order

| Stage | Scope | Current state |
| --- | --- | --- |
| 0 | Reconcile all routes, branches, subviews, dialogs and role/state cases; capture baselines | In progress: 354 source entries including aliases/discovery families; runtime reconciliation remains open |
| 1 | Calibrate the design with three different real workflows: daily work, populated Creative studio/task detail, and a dense Finance view | First implementation/critique iterations verified locally; full acceptance open, especially dense Finance, role/state matrix and actual zoom |
| 2 | Apply validated patterns across task planning, production, approval and client handoffs | In progress: planning/workload and Approvals implemented; populated workflow QA and independent critique in progress, complete matrix remains open |
| 3 | Communication, brand knowledge, content, competitor research, ads, SEO and development | Queued under approved process |
| 4 | Remaining finance, management, AI administration, native CRM, settings and public/client pages | Queued under approved process |
| 5 | Whole-app consistency sweep, current-evidence coverage check, linked-journey regression and release readiness | Queued under approved process |

Pilot results are shown for feedback as work proceeds; they do not create a new page-by-page approval requirement. User feedback that exposes a material gap reopens the relevant surfaces and the shared pattern. Preserve earlier incomplete engineering work and keep it visible in the original tracker.

## Approval and execution record

The user approved this process with “ok start” on 2026-11-06. Inventory reconciliation and the three pilot workflows are active. Detailed progress lives in `OTOGROW-OS-DESIGN-SURFACES.md`; whole improvement status remains in `OTOGROW-OS-IMPROVEMENTS.md`. A page's implementation is not its acceptance.


### 2026-11-06 pilot execution checkpoint

Today, Creative queue/brief, task detail/journey and Cash/Forecast have actual before/after evidence and independently reviewed iterations. The loop caught remaining mobile clipping, duplicated refresh controls and a buried task identity; the authors corrected them and captured new evidence. No full surface is accepted yet: realistic populated Finance, complete role/state and save/recovery scenarios, actual 200% text scaling and affected shared-header consumers remain open. The source manifest records exact scope instead of using the 354 entries as a page-completion denominator.

213 final focused cases across nine suites plus 70 distinct Finance cases across four suites passed; direct frontend types, scoped typed lint/format and production build passed. All temporary task fixture rows were removed with exact preservation checks, normal API service restored, and temporary appearance/viewport preferences restored. Details and evidence are in the manifest and IMP-06/11 execution record. This is local pilot implementation, not deployment or staff acceptance.

### 2026-11-06 planning and Approvals checkpoint

Stage2 now has implemented workload/assignment and Approvals hierarchy, actual populated paging, availability save/reload, exact independent approval/revision decisions and independent desktop/mobile critique. The loop found and corrected misleading access-failure copy during normal review loading.94 focused cases, final direct frontend types, scoped typed lint/format and final production build pass. The repaired Reviews fixture passed failure-recovery proofs and final201-table/schema/full-Operations/cache restoration; the first legacy timestamp-preservation failure remains explicitly recorded. Normal local preview and viewport were restored. Full surface acceptance is still open: realistic populated Finance, the complete roles/states/themes/accessibility/actual200% zoom matrix and remaining page families have not been substituted with these bounded successes. See the second-batch section in the surface manifest and the current improvement snapshot.
