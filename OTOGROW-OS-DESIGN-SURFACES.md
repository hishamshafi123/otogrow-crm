# Otogrow OS design surface manifest

Created: 2026-11-06, Asia/Makassar. Source inventory owner: design-loop inventory agent. Process: `OTOGROW-OS-DESIGN-QA-LOOP.md`; business/workflow/design decisions and whole-improvement status remain in `OTOGROW-OS-IMPROVEMENTS.md`.

The user approved the loop with “ok start”. The initial source inventory is preserved below; the **2026-11-06 pilot execution overrides** record subsequent implementation, coordinator-operated browser checks and independent review. All entries retain **Source inventoried / Runtime unverified** defaults unless an explicit override says otherwise. There are currently **354 source entries**, including aliases and discovery families, not 354 verified pages. **No full surface is locally accepted in this redesign loop yet.** Historical functional acceptance and a passing pictured state do not establish current whole-surface design acceptance.

## Coverage rules and current limits

The seven delivery navigation groups expose at most 22 destinations, according to current effective permissions. They are not 22 total screens. The delivery dispatcher, query-selected views, local forms, overlays and role branches below require separate acceptance. The previously reported 36 principal delivery combinations is a lower bound, not the denominator for this manifest.

Stable IDs identify a meaningful user surface or a documented discovery family. Never renumber accepted entries. Parameterized records use one template with representative cases; a new client is not another screen. A materially different form, tab, modal or command receives a child ID even when it shares a component. Record aliases against their target instead of counting them as new designs. A family entry cannot be accepted until its reachable children are enumerated and checked. An unavailable provider or disabled feature remains unverified with its prerequisite; it does not silently leave scope.

Source reconciliation is not runtime reconciliation. Native object/view metadata, flags, installed applications, local form branches, command-menu actions and configured settings determine additional reachable surfaces. Their discovery families below stay open. There is no OS-wide completion percentage or claim of a final exhaustive count.

Source shorthand below resolves from the repository root:

| Prefix | Exact root |
| --- | --- |
| D/ | `packages/twenty-front/src/modules/delivery/` |
| M/ | `packages/twenty-front/src/modules/` |
| P/ | `packages/twenty-front/src/pages/` |
| S/ | `packages/twenty-shared/src/types/` |

Every delivery selector beginning `view=` is appended to `/delivery?`; child selectors inherit the parent's containing route. “Local action” means component state, not an invented URL. Exact request IDs and opaque cursors are fixture values, never hard-coded client identifiers in this document.

## Per-surface acceptance record

Each inventory row supplies ID, parent, source/route, user job, access cases and matrix profile. Until an individual record overrides it, its fields are: **status Source inventoried; runtime Unverified; iteration 0; baseline findings Not captured; design decision Pending baseline and mandatory review; implementation owner Unassigned; independent reviewer Unassigned; all applicable gate results Unverified; before/after evidence None; rendering revision Not captured; invalidated dependencies Not assessed; cleanup receipt Not applicable, no fixture created; deployment/staff acceptance Unverified.** These defaults apply to every row, including a family or alias; they do not imply a gate passed.

When work begins, add a record keyed by the stable ID with: date; exact containing route; effective role/capabilities/flags; business outcome and observable scenario; current → proposed journey; alternatives and chosen layout; design rationale/tradeoffs; fixtures and mutation boundaries; iteration; author and independent reviewer; findings with severity/location; status; every matrix/gate result; before/after screenshots and interaction evidence; source revision/diff fingerprint and dependency versions; adjacent journeys checked; remaining issues; cleanup receipt; deployment and staff acceptance. Preserve failed iterations. Shared-component edits mark all mapped consumers Needs recheck.

Access abbreviations describe cases to discover, not a new authorization policy: **A** founder/workspace administrator; **M** permitted delivery manager/PM; **S** scoped staff member; **R** permitted independent reviewer; **F** finance reader/editor as separate cases; **C** client/public access; **N** native CRM object/field/row permissions; **P(flag)** settings permission named by the route. Test denied/revoked and relevant combined-role cases alongside allowed access. A job title alone never establishes permission.

| Matrix | Required cases, in addition to the approved ten quality gates |
| --- | --- |
| B — every surface | Containing route/direct link/Back/Forward/reload; desktop 1440 and 1280, tablet 768, phone 390 and 320, actual layout breakpoints and wide/collapsed sidebar where present; light/dark; keyboard/focus; actual 200% text scaling; contrast; reduced motion; populated/empty/loading/long-content; transport error/retry; denied/revoked access; purpose, owner, state and next action understood without author explanation. |
| L — lists and selection | Realistic dense rows, long names, zero versus unknown, filters/sorts/paging and restored selection; empty search; stale/removed record; destination and return preserve context. |
| F — forms and commands | Open/create/edit variants separately; defaults/prerequisites; field validation and focus; dirty navigation; save/cancel; stale version; uncertain result/check exact request; safe recovery; outcome re-read, not just toast. Destructive/external actions use the approved isolated test boundary. |
| H — history and versions | Current versus old version, complete readable attribution/timestamps, paging, comparison/corrections/reversal, source links and unavailable sources; immutable history remains distinguishable from current state. |
| O — overlays | Open from real trigger; accessible label; focus entry/containment/return; Escape/close; nested overlay and mobile height; long content and dirty-close recovery. |
| V — media | Missing/expired/unsupported/loading media, aspect ratios, playback/keyboard controls, exact-version selection and comparison, accessible alternatives, safe downloads; no paid generation required for layout evidence. |
| X — integrations/AI | Manual/unconfigured/connected/paused/error truthfulness; scoped context, cost/limit and cancellation feedback, source citations and uncertain outcomes; no real send, paid run, schedule activation or provider mutation for design QA. |
| $ — financial decisions | Currency/units/signs/dates, zero versus missing, allocation/recognition/source distinction, separate read/edit rights, reversals and locked periods, partial/multi-currency records, totals retain meaning at narrow widths. |
| G — configuration and permissions | Effective access explains grants/denials; own/other/combined roles, last-admin/self-approval constraints, secret masking, unavailable prerequisites, changes and recovery without privilege expansion. |
| C — public/client | Independent non-workspace session, service entitlement, access entry/expiry/revocation, no staff-private content, exact shared version, validation/draft/uncertain-response recovery and native browser leave prompts. |

All profiles include B. The abbreviated profile column names additional checks; “B” alone never exempts loading, error, access, responsive or accessibility checks. Use **Pass / Needs work / Unverified / Not applicable with reason** per gate, never an averaged score. Split a matrix branch into a stable child if runtime discovery reveals a different composition or workflow.

## Source routing reconciliation

The ordered dispatcher is `D/DeliveryWorkspacePage.tsx`. The navigation source is `D/useDeliveryNavigation.ts`; personal defaults/pins are `D/navigation/delivery-navigation-preferences.ts`. These are different inventories.

| Dispatcher condition | Canonical surface | Additional branch / reconciliation requirement |
| --- | --- | --- |
| Missing `view`; `home`, `mine`, `planner`, `reviews` | DAY-01/02, PLAN-01–04, REV-01 | Entry view may resolve from identity preferences. Invalid or disallowed view recovery is NAV-06. |
| `ads`, without `adView=legacy`, `metaReport`, `businessRecord` | ADS-01 | LEG-01 covers legacy Meta/manual/budget routes and deep-link transition. |
| `inbox`, without `inboxView=legacy`, `businessRecord` | MSG-01 | LEG-02 covers the legacy containing route. |
| `onboarding` | CLI-10 | Hidden from the 22-item sidebar; discover from client/native-company setup links. |
| `clients`, without `clientView=agreements/legacy` or `task` | CLI-01 | CLI-04 and LEG-03 cover agreements/legacy/task-selected branches. |
| `creative`, `creativeView=learning` | LEARN-01 | Evaluated before production. |
| `creative`, other than `creativeView=legacy` | CRE-01–08 | Selected task/stage is a full production journey; legacy is LEG-04. |
| `development`, without `developerView=legacy`, `businessRecord`, `task` | DEV-01 | LEG-05 covers alternate containing route. |
| `competitors`, without `competitorView=legacy`, `businessRecord`, `task` | COMP-01 | LEG-06 covers alternate containing route. |
| `content`, without `contentView=legacy`, `businessRecord`, `task` | CONTENT-01–04 | LEG-07 covers alternate containing route. |
| `seo`; `knowledge` | SEO-01; KNOW-01 | Dedicated pages regardless of generic task selectors; validate stale cross-domain query cleanup. |
| `chat`, `health`, `activity`, without `task` | MSG-10; ORG-05; ACT-01 | LEG-08/09/10 cover task-selected legacy compositions. |
| `agents`, `agentView=media` | AI-10 | Media takes precedence. |
| `agents`, except `agentView=spending` | AI-01 | Assistant catalog/task/history selectors still apply. |
| `agents`, `agentView=spending` | AI-08 | Legacy containing workspace, dedicated spending body. |
| Remaining recognized `workflows`, `batches`, `operations`, `team`, `finance` | OPS-01/03/05, ORG-01, FIN-01–07 | Legacy workspace shell and selected task drawer remain dependencies. |

## Navigation, daily work and planning

Related improvements: IMP-01–06, 09–12, 16–17, 37, 39–40, 42. Every row: **Source inventoried / Runtime unverified**.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| NAV-01 | — | Main delivery navigation, seven groups | D/DeliveryNavigation.tsx; D/useDeliveryNavigation.ts | Find permitted work; A/M/R/S/F and combined roles | L,G |
| NAV-02 | NAV-01 | Expanded, collapsed and pinned navigation | D/navigation/DeliveryNavigationPreferences.tsx; M/ui/navigation/navigation-drawer/components/NavigationDrawer.tsx | Personalize and recover location without changing rights; all staff | F,G |
| NAV-03 | NAV-01 | Mobile navigation/workspace switcher | D/tasks/DeliveryTasksPage.tsx; D/DeliveryWorkspacePage.tsx; M/navigation/components/MainNavigationDrawerScrollableItems.tsx | Change workspace section without losing draft; all staff | F,O |
| NAV-04 | NAV-01 | Sales & CRM disclosure and return | M/navigation/components/MainNavigationDrawerScrollableItems.tsx | Reach retained CRM and return to OS; N | L |
| NAV-05 | NAV-01 | Settings drawer and return | M/navigation/components/SettingsNavigationDrawer.tsx; M/settings/components/SettingsNavigationDrawerItems.tsx | Find permitted personal/workspace configuration; P | L,G |
| NAV-06 | NAV-01 | Missing/invalid/denied view and workspace recovery | D/DeliveryWorkspacePage.tsx; D/tasks/DeliveryTasksPage.tsx | Recover verified access without leaking prior data or discarding hidden drafts incorrectly; all | F,G |
| NAV-07 | NAV-01 | Unsaved navigation confirmation | D/drafts/DeliveryDraftGuard.tsx; D/drafts/DeliveryDraftConflict.tsx | Continue editing, discard or recover exact current data; all editors | F,O |
| DAY-01 | NAV-01 | Today; `view=home` | D/tasks/DeliveryTasksToday.tsx; D/tasks/DeliveryTasksPage.tsx | Identify urgent work and next action; S/M/A, review-capable/non-review cases | L |
| DAY-02 | NAV-01 | My tasks; `view=mine` | D/tasks/DeliveryTaskSummaryList.tsx; D/DeliveryMyWorkQueue.tsx | Prioritize own work, revisions, blockers and upcoming tasks; S | L |
| DAY-03 | DAY-01, DAY-02 | Filters and paged results; `attention`, `status`, `project`, `member`, `service`, `search`, dates, `tasksAfter` | D/tasks/DeliveryTaskFilters.tsx; D/tasks/task-navigation.ts | Narrow workload and return from exact task without losing criteria; S/M | L,F |
| DAY-04 | DAY-01 | Assigned-review summary/receipt | D/reviews/DeliveryAssignedReviewsToday.tsx; D/tasks/DeliveryTaskAssignmentRead.tsx | Distinguish visible work, seen assignment and acknowledged responsibility; S/R | L,H |
| PLAN-01 | NAV-01 | Planner task list; `view=planner&plannerView=tasks` | D/tasks/DeliveryTasksPage.tsx; D/tasks/DeliveryTaskSummaryList.tsx | Plan team work by owner/date/service; M | L |
| PLAN-02 | PLAN-01 | Planner board; `layout=board` | D/tasks/DeliveryTaskSummaryList.tsx | Scan production states with readable cards and labelled scrolling; M | L |
| PLAN-03 | PLAN-01 | Workload; `plannerView=capacity` or capacity selector inference | D/capacity/read/DeliveryPlannerCapacity.tsx | Compare capacity, missing owners and overload; M | L,$ |
| PLAN-04 | PLAN-03 | Member/day/bucket assignments; `capacityMember`, `capacityDate`, `capacityBucket` | D/capacity/read/DeliveryCapacityAssignments.tsx | Explain a workload total by exact tasks; M | L |
| PLAN-05 | PLAN-03 | Availability/capacity editor | D/capacity/DeliveryCapacity.tsx; D/capacity/read/DeliveryPlannerCapacity.tsx | Correct real planning availability without inventing hours; M | F,H |
| REV-01 | NAV-01 | Approvals queue; `view=reviews`, review filters/cursor | D/reviews/DeliveryReviewQueue.tsx | Find exact waiting submissions and responsible reviewer; R/M | L |
| REV-02 | REV-01 | Guided batch; `reviewBatch`, `reviewBatchIndex` | D/reviews/ReviewBatchProgress.tsx | Review each submission independently and retain progress; R | L,H |
| REV-03 | REV-01, TASK-03 | Review decision | D/DeliveryTaskDetail.tsx; responsibility/access dependency D/reviews/DeliveryTaskReview.tsx | Approve or request precise changes to the selected version; R; self-review denied | F,H |
| REV-04 | REV-01, TASK-03 | Backup assignment | D/reviews/ReviewAssignmentForm.tsx | Choose an eligible independent backup with reason; authorized M/R | F,G |
| REV-05 | REV-04 | Assignment notice/history/acknowledgement | D/reviews/ReviewAssignmentNotice.tsx; D/reviews/ReviewAssignmentHistory.tsx | Understand current owner and previous handoffs; R/M | H,L |

## Task lifecycle and shared task drawers

Related improvements: IMP-07–12, 14–19, 37, 39–40. Every row: **Source inventoried / Runtime unverified**. Drawer behavior must be checked in both typed primary pages and the legacy containing page; they are separate consumers.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| TASK-01 | DAY-01, PLAN-01 | New-task drawer; containing page New task action | D/DeliveryTaskForm.tsx; D/tasks/DeliveryTasksPage.tsx | Assign clear work with valid project, owner/reviewer and dates; M | F,O,G |
| TASK-02 | TASK-03 | Edit-task form | D/DeliveryTaskForm.tsx; D/DeliveryTaskDetail.tsx | Update task instructions without overwriting newer work; permitted editor | F,O,H |
| TASK-03 | DAY-01, DAY-02, PLAN-01, REV-01 | Exact task drawer; `task`, `panel=task` | D/DeliveryTaskDetail.tsx; D/tasks/DeliveryTasksPage.tsx | Understand brief, current responsibility and next action; scoped S/M/R plus native read restrictions | O,H |
| TASK-04 | TASK-03 | Lifecycle and panel navigation | D/lifecycle/DeliveryTaskJourney.tsx; D/tasks/DeliveryTasksPage.tsx | Move between work, production, approval, delivery and assistants without confusing stages; S/M/R | L |
| TASK-05 | TASK-03 | Workflow requirements/evidence | D/workflows/DeliveryTaskWorkflow.tsx; D/workflows/WorkflowDefinitionView.tsx | Complete required evidence and inspect pinned requirements; S/R | F,H |
| TASK-06 | TASK-03 | Task plan and estimates | D/capacity/DeliveryTaskPlan.tsx | Set accountable effort/date plan and show capacity consequence; M/S as permitted | F,H |
| TASK-07 | TASK-03 | Progress, blocker, checklist and submission | D/DeliveryTaskDetail.tsx | Record progress and submit exact evidence for review; S | F,H |
| TASK-08 | TASK-03 | Revisions/reopening | D/revisions/DeliveryRevisions.tsx; D/revisions/RevisionEditor.tsx | Explain change cause and return to the correct stage; permitted S/M/R | F,H |
| TASK-09 | TASK-08 | Revision effort/cost detail | D/revisions/DeliveryRevisionCosts.tsx | Trace recorded revision cost without implying automatic time tracking; permitted manager/finance | F,H,$ |
| TASK-10 | TASK-03 | Submission history/version; `creativeSubmission` | D/DeliveryTaskDetail.tsx; D/workflows/WorkflowDefinitionView.tsx | Inspect exact old evidence and requirements without editing history; S/R | H,V |
| TASK-11 | TASK-03 | Creative panel/hand-off; `panel=creative` | D/DeliveryWorkspacePage.tsx; D/DeliveryCreative.tsx | Reach the exact task's production context; S/R | O,V |
| TASK-12 | TASK-03 | Delivery and messages panel; `panel=operations` | D/DeliveryWorkspacePage.tsx; D/DeliveryOperations.tsx | Record delivery and follow up separately from approval; permitted S/M | O,F,H |
| TASK-13 | TASK-03 | Text assistants panel; `panel=agents` | D/DeliveryWorkspacePage.tsx; D/DeliveryAgents.tsx | Prepare scoped help for this task and review output; permitted S/M | O,F,X |
| TASK-14 | TASK-03 | Task-access loss, stale detail and retry | D/tasks/DeliveryTasksPage.tsx; D/DeliveryWorkspacePage.tsx | Hide revoked facts, preserve only eligible transport-failure drafts, explicitly re-open after access check; all | F,G,O |

## Clients, commitments and onboarding

Related improvements: IMP-04, 09–10, 13–14, 20, 39–40, 42. Every row: **Source inventoried / Runtime unverified**.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| CLI-01 | NAV-01 | Clients/commitments directory; `view=clients` | D/commitments/DeliveryCommitmentsPage.tsx; D/commitments/DeliveryCommitmentDirectory.tsx | Find service promises for permitted clients; M versus S commitment-only access | L,G |
| CLI-02 | CLI-01 | Commitment period/allocation/history; `clientEngagement`, `commitmentPeriod` | D/commitments/DeliveryCommitments.tsx | Distinguish contracted quantity, assigned work and fulfilled work; S/M | L,H |
| CLI-03 | CLI-02 | Commitment create/edit/allocation commands | D/commitments/CommitmentEditor.tsx | Correct promises/allocations with explicit dates and quantity; M | F,H |
| CLI-04 | CLI-01 | Agreements; `clientView=agreements` | D/DeliveryClients.tsx | Inspect service agreement and client portal configuration; M | L,G |
| CLI-05 | CLI-04 | Agreement create/edit/service fields | D/DeliveryClients.tsx; D/onboarding/ServicePlanFields.tsx | Define service/retainer scope with current prerequisites; M | F,$ |
| CLI-06 | CLI-04 | Client onboarding form configuration/submission review | D/DeliveryClients.tsx | Ask required brand questions and review exact responses; M | F,H |
| CLI-07 | CLI-04 | Share exact approved brief/submission | D/DeliveryClientShareForm.tsx | Share the intended version and asset only; M | F,V,G |
| CLI-08 | CLI-04 | Portal access issue/revoke and shared-work history | D/DeliveryClients.tsx | Manage separate expiring client access and understand existing shares; M | F,H,G,C |
| CLI-09 | CLI-02 | Orphan allocation cleanup/cancellation | D/commitments/CommitmentOrphanCleanup.tsx | Repair removed work without losing contractual totals or private data; M | F,H,G |
| CLI-10 | CLI-01, CRM-03 | Setup wizard; `view=onboarding`, `setupCompany`, `setupProject`, `setupPlan` | D/onboarding/DeliveryClientSetupPage.tsx; D/onboarding/ClientSetupWizard.tsx | Take company through project/team/service plan/first task; M | F,G |
| CLI-11 | CLI-10 | Native company creation/selection | D/onboarding/SetupCompanyCreation.tsx | Create/reuse the correct native client and return to setup; M plus N create | F,G |
| CLI-12 | CLI-10 | First-task fields and service plan | D/onboarding/SetupFirstTaskFields.tsx; D/onboarding/ServicePlanFields.tsx | Assign first useful work and independent reviewer; M | F |
| CLI-13 | CLI-10 | Setup receipt and exact-request recovery | D/onboarding/ClientSetupReceipt.tsx | Verify saved company/project/plan/task and continue after interruption; M | H,F |
| CLI-14 | CLI-04, CRM-04 | Accepted-deal handoff list/detail | D/handoffs/DeliveryHandoffs.tsx | Trace accepted scope into accountable delivery setup; M/sales as permitted | L,H |
| CLI-15 | CLI-14 | Handoff form/review | D/handoffs/DeliveryHandoffForm.tsx | Transfer correct client/service/deal evidence without duplicating setup; permitted M | F,H |

## Creative production, media review and learning

Related improvements: IMP-07–10, 15, 23–28, 37, 39–40, 42. Every row: **Source inventoried / Runtime unverified**.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| CRE-01 | NAV-01 | Creative queue; `view=creative` | D/creative/production/DeliveryCreativeProductionPage.tsx; D/creative/production/CreativeProductionQueue.tsx | Find assigned production with stage and next action; S/M | L |
| CRE-02 | CRE-01 | Brief stage; `task`, `creativeStage=brief` | D/creative/production/CreativeProductionTask.tsx; D/DeliveryCreative.tsx | Read/edit structured brief and constraints; scoped S/M | F,H |
| CRE-03 | CRE-01 | References stage; `creativeStage=references` | D/creative/production/CreativeApprovedReferences.tsx; D/DeliveryCreative.tsx | Select approved brand/reference material and inspect source; S | F,V |
| CRE-04 | CRE-01 | Shots stage; `creativeStage=shots` | D/DeliveryCreative.tsx; D/DeliveryCreativeForms.tsx | Plan/edit shots, owner and intermediate review; S/R | F,H,V |
| CRE-05 | CRE-01 | Assets stage; `creativeStage=assets`, `creativeAsset` | D/DeliveryMedia.tsx; D/DeliveryCreative.tsx | Find/upload/inspect exact production assets; S/R | F,V,L |
| CRE-06 | CRE-01 | Edit stage; `creativeStage=edit` | D/DeliveryCreative.tsx; D/DeliveryCreativeForms.tsx | Assemble production/editing guidance without unclear stage ownership; S | F,V |
| CRE-07 | CRE-01 | Final stage; `creativeStage=final` | D/creative/production/CreativeProductionTask.tsx; D/DeliveryTaskDetail.tsx | Inspect final submission and hand off to independent approval; S/R | F,H,V |
| CRE-08 | CRE-01 | Generate stage; `creativeStage=generate` | D/creative/atlas/AtlasGenerationForm.tsx; D/creative/atlas/AtlasProductionTools.tsx | Choose permitted model/parameters and understand cost/readiness; S with production access | F,X,V |
| CRE-09 | CRE-02–06 | Creative form variants: brief/reference/shot/variant/edit | D/DeliveryCreativeForms.tsx | Enter context-specific production instructions; S/M | F,V |
| CRE-10 | CRE-05, CRE-07, TASK-10 | Exact media review/player | D/creative/review/DeliveryCreativeReview.tsx; D/creative/review/CreativeReviewPlayer.tsx; D/creative/review/CreativeReviewTargetDetails.tsx | Review permitted exact asset, timestamp and submission; S/R | V,H |
| CRE-11 | CRE-10 | Comparison; `creativeCompare`, `creativeSubmission` | D/creative/review/DeliveryCreativeReview.tsx | Compare correct versions while retaining context; R/S | V,H |
| CRE-12 | CRE-10 | Feedback editor | D/creative/review/CreativeFeedbackForm.tsx | Leave precise timestamp/region/version feedback; R/S | F,V |
| CRE-13 | CRE-10 | Feedback history/resolution | D/creative/review/CreativeFeedbackHistory.tsx | Trace comments, response and resolution; R/S | F,H |
| CRE-14 | CRE-07 | Video QA preparation/context/coverage | D/creative/video-qa/DeliveryVideoQa.tsx; D/creative/video-qa/VideoQaPreparation.tsx; D/creative/video-qa/VideoQaCoverage.tsx | Understand media coverage and prepare bounded QA; permitted S/R | F,X,V |
| CRE-15 | CRE-14 | QA run/result/evidence; `creativeQaRun` | D/creative/video-qa/VideoQaRunView.tsx; D/creative/video-qa/VideoQaResult.tsx; D/creative/video-qa/VideoQaEvidenceMedia.tsx | Interpret grounded findings without replacing human approval; S/R | X,V,H |
| CRE-16 | CRE-15 | QA cancellation; `creativeQaCancel` | D/creative/video-qa/VideoQaCancel.tsx | Cancel eligible execution and understand uncertain/cost state; authorized initiator | F,X |
| LEARN-01 | CRE-01 | Learning library; `creativeView=learning` | D/creative/learning/DeliveryCreativeLearningPage.tsx; D/creative/learning/CreativeLearningLibrary.tsx | Find evidence-backed creative lessons; permitted S/M | L |
| LEARN-02 | LEARN-01 | Learning detail/versions; `learningLink`, `learningVersion` | D/creative/learning/CreativeLearningDetail.tsx; D/creative/learning/CreativeLearningEvidence.tsx | Distinguish creative evidence, ad measurement and interpretation; S/M/R | H,V |
| LEARN-03 | LEARN-01 | Link/evidence editor; `learningMode=new/edit` | D/creative/learning/CreativeLearningEditor.tsx; D/creative/learning/CreativeLessonEvidencePicker.tsx | Connect exact creative/ad evidence without false attribution; permitted editor | F,H |
| LEARN-04 | LEARN-02 | Submit/review/request changes/retract/correct; `learningMode=decision`, `learningAction` | D/creative/learning/CreativeLearningAttempt.tsx; D/creative/learning/CreativeLearningEditor.tsx | Independently review conclusions and preserve corrections; R/editor | F,H |
| LEARN-05 | LEARN-02 | Lessons and correction; `learningMode=lesson`, `learningLesson` | D/creative/learning/CreativeLearningLessons.tsx | Reuse scoped reviewed lessons with limits and evidence; S/R | F,H |

## Brand knowledge and meeting material

Related improvements: IMP-09–10, 18, 24, 37, 39–40, 42. Every row: **Source inventoried / Runtime unverified**.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| KNOW-01 | NAV-01 | Project/brand directory; `view=knowledge` | D/knowledge/DeliveryKnowledge.tsx; D/knowledge/KnowledgeProjects.tsx | Find permitted brand context; S/M | L |
| KNOW-02 | KNOW-01 | Source library; `project`, category/search/cursors | D/knowledge/KnowledgeList.tsx | Find current approved facts/reference/meeting decisions; S/M | L |
| KNOW-03 | KNOW-02 | Source detail/history; `source` | D/knowledge/KnowledgeSource.tsx | Read source provenance/status and correct context; S/M | H,V |
| KNOW-04 | KNOW-02 | Source create/edit/review; `knowledgeCreate`, local actions | D/knowledge/KnowledgeEditor.tsx; D/knowledge/DeliveryKnowledgeForm.tsx | Capture/review reusable knowledge with explicit permission; editor/reviewer | F,H |
| KNOW-05 | KNOW-04 | Asset attachments/file preview/download | D/knowledge/assets/KnowledgeAssetAttachments.tsx; D/knowledge/assets/KnowledgeAssetFile.tsx | Attach permitted brand files and see processing/failure state; S/M | F,V |
| KNOW-06 | KNOW-02 | Unused uploads cleanup | D/knowledge/assets/KnowledgeUnusedUploads.tsx | Recover/remove owned unattached uploads safely; permitted editor | L,F |
| KNOW-07 | KNOW-04 | Local transcript import | D/knowledge/transcript/DeliveryTranscriptImport.tsx | Import meeting text and inspect extracted source before reuse; permitted editor | F,H |
| KNOW-08 | KNOW-04 | Fathom import | D/knowledge/fathom/DeliveryFathomImport.tsx | Understand supported import/setup and retained meeting evidence; permitted editor | F,X,H |

## Service operations, communication and chat

Related improvements: IMP-08–10, 14–15, 17, 22, 29, 34–35, 39–40, 42, 46. Every row: **Source inventoried / Runtime unverified**.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| OPS-01 | NAV-01 | Service workflow catalog; `view=workflows` | D/workflows/DeliveryWorkflowCatalog.tsx; D/workflows/WorkflowDefinitionView.tsx | Find reusable service requirements and current version; M | L,H |
| OPS-02 | OPS-01 | Workflow editor/apply/pin | D/workflows/WorkflowEditor.tsx; D/workflows/WorkflowApplyEditor.tsx; D/workflows/WorkflowPinField.tsx | Define/apply exact requirements with correct downstream effect; M | F,H |
| OPS-03 | NAV-01 | Production batch list/detail/progress; `view=batches`, `batchProject`, `batch` | D/batches/DeliveryBatches.tsx; D/batches/BatchProgress.tsx | Plan grouped delivery without replacing per-task review/fulfilment; S/M | L,H |
| OPS-04 | OPS-03 | Batch editor | D/batches/BatchEditor.tsx | Set weekly/monthly plan and eligible tasks; M | F |
| OPS-05 | NAV-01 | Delivery/reminders overview; `view=operations` | D/DeliveryOperations.tsx | Find notices, recurring work and fulfilment needing action; S/M/A | L,X |
| OPS-06 | OPS-05 | Notices/read/acknowledge and source links | D/DeliveryOperations.tsx; D/reviews/ReviewAssignmentLink.tsx | Distinguish unread, seen and acknowledged responsibility; recipient | L,H,F |
| OPS-07 | OPS-05, TASK-12 | Delivery record/evidence/history | D/DeliveryOperations.tsx | Record where exact approved work was delivered; permitted S/M | F,H |
| OPS-08 | OPS-05, TASK-12 | Fulfilment decision/recheck/redo | D/DeliveryOperations.tsx | Distinguish delivered, fulfilled and redoing without false completion; M | F,H |
| OPS-09 | OPS-05 | Recurring work list/pause/resume | D/DeliveryOperations.tsx | Understand frequency, last occurrence and schedule state; M | L,F,X |
| OPS-10 | OPS-09 | Recurring template create/edit | D/operations/forms/RecurringTemplateForm.tsx | Configure valid calendar and prerequisites without losing draft; M | F,X |
| OPS-11 | OPS-05, TASK-12 | Addressed internal message | D/DeliveryOperations.tsx | Address scoped task context to correct teammate; authorized staff | F,G |
| OPS-12 | OPS-05, TASK-12 | Founder issue flag/acknowledge/resolve | D/DeliveryOperations.tsx | Escalate owned client/contract/budget exception; authorized S/M/A | F,H |
| OPS-13 | OPS-05 | Telegram connection and team status | D/DeliveryOperations.tsx | Understand linking, unavailable/sending/uncertain delivery and recipients; own account/M | F,X,G |
| MSG-01 | NAV-01 | Inbox list; `view=inbox`, filters/cursors | D/inbox/workspace/DeliveryInboxPage.tsx; D/inbox/workspace/InboxConversations.tsx | Find conversations currently permitted to read; S/M | L,G,X |
| MSG-02 | MSG-01 | Conversation/messages; `inboxConversation` | D/inbox/workspace/InboxConversationPanel.tsx; D/inbox/workspace/InboxMessages.tsx | Read exact scoped messages and account/source context; granted reader | L,H |
| MSG-03 | MSG-02 | Compose/prepare draft; `inboxMode=prepare` | D/inbox/workspace/InboxComposer.tsx; D/inbox/workspace/InboxAssistantPicker.tsx | Draft appropriate reply from permitted sources; granted drafter | F,X |
| MSG-04 | MSG-02 | Reply detail and history; `inboxReply` | D/inbox/workspace/InboxReplyView.tsx; D/inbox/workspace/InboxReplyHistory.tsx | Review current/old draft and attribution; granted reader/sender | H |
| MSG-05 | MSG-02 | Consent/revoke; `inboxMode=consent/revoke` | D/inbox/workspace/InboxConsent.tsx; D/inbox/ConversationPermissions.tsx | Grant/revoke account/conversation use with understandable scope; authorized owner/manager | F,G,X |
| MSG-06 | MSG-04 | Send/cancel/exact-attempt recovery; `inboxMode=send/cancel` | D/inbox/workspace/InboxAttempt.tsx | Confirm send authority and durable result without duplicate delivery; granted sender | F,X,H |
| MSG-07 | LEG-02 | Manual conversation/inbound-note form | D/DeliveryInboxForm.tsx; D/DeliveryBusiness.tsx | Record manual communication truthfully; permitted staff | F,X |
| MSG-10 | NAV-01 | Team chat peers; `view=chat` | D/operations-pages/DeliveryChatPage.tsx; D/chat/DeliveryChat.tsx | Find an active permitted teammate; S/M/A | L |
| MSG-11 | MSG-10 | Chat history/visible receipts; `chatWith`, `chatBefore` | D/chat/DeliveryChat.tsx | Read actual visible messages without marking hidden ones read; participant | L,H |
| MSG-12 | MSG-11 | Chat composer/send/retry | D/chat/DeliveryChat.tsx | Send once, preserve unsent text and understand unread reminder; participant | F,X |

## Advertising, SEO, content, competitor research and development

Related improvements: IMP-09–10, 23, 26–33, 36–40, 42. Every row: **Source inventoried / Runtime unverified**.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| ADS-01 | NAV-01 | Advertising reports; `view=ads` | D/advertising/workbench/DeliveryAdvertisingPage.tsx; D/advertising/workbench/AdvertisingReports.tsx | Find scoped fresh/manual/Meta reports and priorities; permitted marketer/M | L,X |
| ADS-02 | ADS-01 | Source/report/ad evidence; `adSource`, `adReport` | D/advertising/workbench/AdvertisingSourcePanel.tsx; D/advertising/workbench/AdvertisingEvidence.tsx; D/advertising/MetaReportAds.tsx | Inspect measurement dates, outcomes and provenance; permitted reader | L,H,$ |
| ADS-03 | ADS-02 | Recommendation/review editor; `adMode=review` | D/advertising/workbench/AdvertisingReviewEditor.tsx; D/advertising/workbench/AdvertisingReviewForm.tsx | Explain evidence-backed decision and measurable follow-up; M | F,H |
| ADS-04 | ADS-03 | Action and assignment; `adMode=assign`, `adAction` | D/advertising/workbench/AdvertisingActionEditor.tsx; D/advertising/workbench/AdvertisingAssignmentReview.tsx | Assign accountable action without obscuring review basis; M | F,H |
| ADS-05 | ADS-04 | Observation/result; `adMode=observe` | D/advertising/workbench/AdvertisingObservationPanel.tsx; D/advertising/workbench/AdvertisingObservationHistory.tsx; D/advertising/workbench/AdvertisingObservationSource.tsx | Record measured follow-up separately from recommendations; permitted marketer/M | F,H |
| ADS-06 | ADS-02 | AI assistant/context/preparation; `adDraftView=assistants/prepare` | D/advertising/drafts/AdvertisingDraftAssistantPicker.tsx; D/advertising/drafts/AdvertisingDraftPreparation.tsx; D/advertising/drafts/AdvertisingDraftContextView.tsx | Inspect scoped report context and budget before bounded draft; M | F,X |
| ADS-07 | ADS-06 | AI run/result/insertion/history; `adDraftRun`, `adDraftView=history` | D/advertising/drafts/AdvertisingDraftRunViewer.tsx; D/advertising/drafts/AdvertisingDraftResultView.tsx; D/advertising/drafts/AdvertisingDraftHistory.tsx | Edit cited proposal before inserting human-reviewed action; M | F,X,H |
| ADS-08 | ADS-07 | AI cancellation/exact-request recovery | D/advertising/drafts/AdvertisingDraftCancel.tsx; D/advertising/drafts/AdvertisingDraftPreviewView.tsx | Stop costs and recover known attempt; authorized initiator | F,X |
| ADS-09 | LEG-01 | Meta connection/account configuration | D/DeliveryMeta.tsx | Understand account scope, credentials, schedule readiness and paused state; A/M as permitted | F,X,G |
| ADS-10 | LEG-01 | Meta report filters/import coverage/archive/detail | D/DeliveryMeta.tsx; D/advertising/MetaReportFilters.tsx; D/advertising/MetaImportCoverage.tsx | Inspect requested ranges, gaps, freshness and preserved reports; permitted reader/operator | L,H,X |
| ADS-11 | LEG-01 | Manual report and advertising budget create/review/apply/verify | D/DeliveryBusiness.tsx | Preserve named marketer application and independent verification; M/marketer; client source at PUB-04 | F,H,$,X |
| SEO-01 | NAV-01 | SEO projects; `view=seo` | D/seo-results/DeliverySeoResultsPage.tsx | Find client's reporting context; permitted specialist/M | L |
| SEO-02 | SEO-01 | Reports/period comparison; `seoProject` | D/seo-results/SeoReports.tsx | Distinguish measured outcomes from completed work; S/M | L,H |
| SEO-03 | SEO-02 | Report/old version; `seoReport`, `seoVersion` | D/seo-results/SeoReportView.tsx; D/seo-results/SeoReportEvidence.tsx | Inspect source-qualified result and accepted task evidence; S/R | H |
| SEO-04 | SEO-02 | Create/edit report/evidence/metrics; `seoMode`, `seoRequest` | D/seo-results/SeoReportForm.tsx; D/seo-results/SeoEvidenceChoices.tsx; D/seo-results/SeoMetricFields.tsx | Enter comparable weekly/monthly results without inventing missing values; specialist | F,H |
| SEO-05 | SEO-03 | Submit/review/change/correct commands | D/seo-results/SeoCommandPanel.tsx | Independently review exact report version and retain history; specialist/R | F,H |
| CONTENT-01 | NAV-01 | Content table; `view=content&contentView=table` | D/content/DeliveryContentPage.tsx; D/content/ContentPostList.tsx | Scan channel, owner, date and publication state; scoped staff/M | L |
| CONTENT-02 | CONTENT-01 | Calendar; `contentView=calendar`, month/day/timezone | D/content/ContentCalendar.tsx | Plan publishing dates/timezones without losing item details; S/M | L |
| CONTENT-03 | CONTENT-01 | Plans; `contentView=plans` | D/content/ContentLibrary.tsx | Find client content plans and variants; S/M | L |
| CONTENT-04 | CONTENT-01 | Accounts; `contentView=accounts` | D/content/ContentLibrary.tsx | Identify channel/account readiness and ownership; permitted S/M | L,X |
| CONTENT-05 | CONTENT-01 | Post/old-version/history; `contentPostId`, `contentVersion` | D/content/ContentPostDetail.tsx | Review exact copy/assets/platform variant and recorded publication; S/R | H,V |
| CONTENT-06 | CONTENT-04 | Account create/edit; `contentMode=account/edit-account` | D/content/ContentCommandPanel.tsx; D/content/ContentSetupFields.tsx | Configure truthful platform destination; authorized manager | F,G,X |
| CONTENT-07 | CONTENT-03 | Plan create/edit; `contentMode=plan/edit-plan` | D/content/ContentCommandPanel.tsx; D/content/ContentSetupFields.tsx | Define client/owner/period plan; permitted manager | F |
| CONTENT-08 | CONTENT-05 | Variant create/edit and asset picker; `contentMode=variant/edit-variant` | D/content/ContentVariantFields.tsx; D/content/ContentAssetPicker.tsx | Prepare channel-specific copy and permitted asset; editor | F,V |
| CONTENT-09 | CONTENT-05 | Submit/approve/request changes | D/content/ContentCommandPanel.tsx; D/content/ContentActionStage.tsx | Review each exact variant independently; editor/R | F,H |
| CONTENT-10 | CONTENT-05 | Publication preview/record failure/uncertainty/correction/cancel | D/content/ContentPostingPreview.tsx; D/content/ContentAttemptNotice.tsx; D/content/ContentCommandPanel.tsx | Record what actually happened without implying unsupported automatic publishing; permitted publisher | F,H,X |
| COMP-01 | NAV-01 | Competitor projects/sources; `view=competitors`, `competitorProject` | D/competitors/DeliveryCompetitorSourcesPage.tsx; D/competitors/CompetitorSourcesLibrary.tsx | Find approved research sources for permitted clients; S/M | L,X |
| COMP-02 | COMP-01 | Source detail/version/coverage; `competitorSource`, `competitorVersion` | D/competitors/CompetitorSourceDetail.tsx; D/competitors/CompetitorSourceCoverage.tsx | Understand source identity, collection coverage and limits; S/M | H,X |
| COMP-03 | COMP-01 | Source create/edit | D/competitors/CompetitorSourceForm.tsx; D/competitors/CompetitorSourceIdentity.tsx | Configure valid bounded source/account data; authorized editor | F,X |
| COMP-04 | COMP-02 | Source review/command stage | D/competitors/CompetitorCommandPanel.tsx; D/competitors/CompetitorSourceStage.tsx | Review configuration and understand supported next collection action; reviewer/editor | F,H,X |
| COMP-05 | LEG-06 | Findings/interpretation/idea/manual evidence forms | D/DeliveryBusiness.tsx | Keep observed evidence distinct from proposed ideas; permitted staff/M | F,H |
| DEV-01 | NAV-01 | Development projects/releases; `view=development`, `releaseProject` | D/development/DeliveryDevelopmentPage.tsx; D/development/ReleaseLibrary.tsx | Find current release plans and owners; developers/M | L |
| DEV-02 | DEV-01 | Release detail/history/version; `releaseId`, `releaseVersion` | D/development/ReleaseDetailView.tsx; D/development/ReleasePlanSummary.tsx | Trace scoped work, dependencies, evidence and acceptance state; developer/R | H |
| DEV-03 | DEV-01 | Release create/edit/included tasks/checks; `releaseMode=new/edit` | D/development/ReleasePlanForm.tsx; D/development/ReleaseIncludedTasks.tsx; D/development/ReleaseChecksForm.tsx | Prepare accountable release with existing tasks/links; developer | F |
| DEV-04 | DEV-02 | Submit/approve/request changes | D/development/ReleaseCommandPanel.tsx; D/development/ReleaseStage.tsx | Independently review exact release plan; developer/R | F,H |
| DEV-05 | DEV-02 | Deployment/failure/handover/acceptance evidence | D/development/ReleaseCommandPanel.tsx; D/development/ReleaseStage.tsx | Record actual release outcome without asserting CI integration; permitted developer/M | F,H,X |

## Finance

Related improvements: IMP-06, 09–11, 19, 21, 26, 39–40, 42. Every row: **Source inventoried / Runtime unverified**. Read-only finance and edit-capable finance are distinct required renderings. All children inherit `$` and B.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| FIN-01 | NAV-01 | Cash records; `view=finance`, `financeView=cash` | D/finance/DeliveryFinance.tsx; D/DeliveryBusiness.tsx | Scan immutable cash/receivables with useful hierarchy; F | L,$ |
| FIN-02 | FIN-01 | Cash forecast; `financeView=forecast` | D/finance/DeliveryFinanceForecast.tsx; D/finance/FinanceForecastProjection.tsx; D/finance/FinanceForecastWorklists.tsx | Understand expected cash and overdue actions; F | L,$ |
| FIN-03 | FIN-01 | Payments/matching; `financeView=payments` | D/finance/DeliveryReconciliation.tsx | Reconcile partial receipts/payments to existing obligations; F | L,$ |
| FIN-04 | FIN-01 | Monthly results; `financeView=monthly` | D/finance/DeliveryMonthlyFinance.tsx; D/finance/FinanceMonthlyResults.tsx | Read actual recognized company/client margin and gaps; F | L,H,$ |
| FIN-05 | FIN-01 | Monthly cost plans; `financeView=plans` | D/finance/DeliveryMonthlyFinance.tsx | Understand planned salaries/costs versus actual recognition; F | L,$ |
| FIN-06 | FIN-01 | AI costs; `financeView=ai-costs` | D/finance/DeliveryFinanceAiCosts.tsx | Reconcile recorded production AI spend and corrections; F | L,X,$ |
| FIN-07 | FIN-01 | Accounting exports; `financeView=exports` | D/finance/export/DeliveryFinanceExports.tsx | Prepare a reviewed handoff to the actual accountant; F | L,X,$ |
| FIN-08 | FIN-01 | Cash/receivable create, payment receipt, void/reversal | D/DeliveryBusiness.tsx; D/finance/DeliveryReceivableBalance.tsx | Record exact financial event and explicit reversal; F editor | F,H,$ |
| FIN-09 | FIN-02 | Forecast anchor | D/finance/FinanceForecastAnchorForm.tsx | Establish dated starting cash and reason; F editor | F,$ |
| FIN-10 | FIN-02 | Forecast item create/edit | D/finance/FinanceForecastItemForm.tsx | Plan a dated inflow/outflow with source and ownership; F editor | F,$ |
| FIN-11 | FIN-02 | Source review/realization | D/finance/FinanceForecastSourceReview.tsx; D/finance/FinanceForecastRealizationForm.tsx | Check source and connect actual cash without double counting; F editor | F,H,$ |
| FIN-12 | FIN-02 | Review/reason/history | D/finance/FinanceForecastReasonForm.tsx; D/finance/FinanceForecastHistory.tsx | Understand changes, decisions and restored source links; F | F,H,$ |
| FIN-13 | FIN-03 | Cash/receivable/monthly source lists; `financeList=cash/receivables/monthly` | D/finance/ReconciliationSources.tsx; D/finance/ReconciliationSelection.tsx | Select correct source and inspect remaining balance; F | L,$ |
| FIN-14 | FIN-03 | Payment form; `financeCash`, `financeReceivable` | D/finance/ReconciliationPaymentForm.tsx | Record partial/full payment with exact currency and date; F editor | F,$ |
| FIN-15 | FIN-03 | Allocation/matching form; `financeMatchEntry` | D/finance/ReconciliationAllocationForm.tsx | Allocate eligible cash to correct recognized entry; F editor | F,$ |
| FIN-16 | FIN-03 | Reverse and matching history | D/finance/ReconciliationReverseForm.tsx; D/finance/ReconciliationHistory.tsx | Correct mistakes with attributable reversal and updated balance; F editor/reader | F,H,$ |
| FIN-17 | FIN-04 | Recognition/allocation entry editor and source | D/finance/FinanceEntryForm.tsx; D/finance/FinanceRecognitionNotice.tsx | Recognize actual cost/revenue in correct month/client/company; F editor | F,H,$ |
| FIN-18 | FIN-04 | Entry history | D/finance/FinanceEntryHistory.tsx | Inspect original/corrected allocations without overwriting evidence; F | H,$ |
| FIN-19 | FIN-04 | Period summary/review/lock/reopen/history | D/finance/FinancePeriodPanel.tsx; D/finance/FinancePeriodSummary.tsx; D/finance/FinancePeriodReviewForm.tsx; D/finance/FinancePeriodHistory.tsx | Review completeness and protect/reopen month with reason; authorized F | F,H,$ |
| FIN-20 | FIN-05 | Cost plan create/edit | D/finance/FinancePlanForm.tsx | Plan recurring cost/salary allocations with clear units; F editor | F,$ |
| FIN-21 | FIN-06 | AI spend source/evidence; `financeAiSpend` | D/finance/FinanceAiCostSourceDetails.tsx; D/finance/FinanceAiCostOrigin.tsx | Trace recorded spend to actual run/correction; F | H,X,$ |
| FIN-22 | FIN-06 | AI import/post/correction | D/finance/FinanceAiCostImportForm.tsx; D/finance/FinanceAiCostPostForm.tsx | Review exact cost before recognition and retain late corrections; F editor | F,H,$ |
| FIN-23 | FIN-07 | Export profiles; `financeExportSection=profiles`, `financeExportProfile` | D/finance/export/FinanceExportProfileDetails.tsx; D/finance/export/FinanceExportProfileForm.tsx | Configure versioned mapping for a real accounting format; F editor/reader | F,H,$ |
| FIN-24 | FIN-07 | Export selection/preview/review; `financeExportSection=review` | D/finance/export/FinanceExportSelectionForm.tsx; D/finance/export/FinanceExportReview.tsx; D/finance/export/FinanceExportReviewRows.tsx | Review scope/totals/mapping before immutable export; F | F,L,$ |
| FIN-25 | FIN-07 | Export batch create/detail/download; `financeExportSection=batches`, `financeExportBatch` | D/finance/export/FinanceExportBatchForm.tsx; D/finance/export/FinanceExportBatchDetails.tsx | Produce and inspect immutable accountant handoff; F | F,H,$ |
| FIN-26 | FIN-07 | Import result/reversal/history | D/finance/export/FinanceExportImportForm.tsx; D/finance/export/FinanceExportHistory.tsx | Record actual import outcome without claiming automatic synchronization; F editor | F,H,X,$ |

## Team, company visibility and activity

Related improvements: IMP-09–11, 16–17, 22, 39–46. Every row: **Source inventoried / Runtime unverified**.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| ORG-01 | NAV-01 | Team & projects; `view=team` | D/DeliveryTeam.tsx | Find project ownership and membership; M | L,G |
| ORG-02 | ORG-01 | Project create/edit/member scope | D/DeliveryTeam.tsx | Give correct people access to permitted client/internal work; M | F,G |
| ORG-03 | ORG-01 | Business roles/capability bundles | M/otogrow-access/OtogrowTeamRoles.tsx | Configure multiple roles without accidental privilege expansion; A | F,G |
| ORG-04 | ORG-03 | Effective person/role access preview | M/otogrow-access/OtogrowTeamRoles.tsx | Explain grant/denial provenance including phone/finance; A | L,G |
| ORG-05 | NAV-01 | Company overview; `view=health` | D/operations-pages/DeliveryCompanyOverviewPage.tsx; D/founder/DeliveryFounderExceptions.tsx | Find business exceptions needing a named owner; A | L |
| ORG-06 | ORG-05 | Exception source/detail/follow-up | D/founder/FounderExceptionRow.tsx; D/founder/escalation/EscalationFollowUpOwner.tsx | Reach correct scoped source and responsible person; A | F,H |
| ORG-07 | ORG-05 | Escalation rules/setup/summary | D/founder/escalation/DeliveryFounderAlertRules.tsx; D/founder/escalation/EscalationSetupStatus.tsx; D/founder/escalation/EscalationRuleSummary.tsx | Understand configured rules and missing prerequisites; A | L,X |
| ORG-08 | ORG-07 | Rule editor/preview/enable confirmation | D/founder/escalation/EscalationRuleForm.tsx; D/founder/escalation/EscalationPreview.tsx; D/founder/escalation/EscalationEnableReview.tsx; D/founder/escalation/EscalationConfirmForm.tsx | Review exact affected population before enabling authorized rule; A | F,X,G |
| ORG-09 | ORG-07 | Configuration/history | D/founder/escalation/EscalationConfigurationDetails.tsx; D/founder/escalation/EscalationHistory.tsx | Explain previous rule and delivery decisions; A | H |
| ORG-10 | ORG-05 | Readiness; `readinessStatus` | D/readiness/DeliveryReadiness.tsx | Distinguish available/manual/missing/connected/paused and real next step; A | L,X |
| ORG-11 | ORG-05 | Performance; `founderPanel=performance`, month/timezone/currency and paging | D/founder/performance/DeliveryFounderPerformance.tsx; D/founder/performance/PerformanceDirectories.tsx | Founder reviews exact company/client financial and employee operational KPIs with source links; A plus finance read | L,H,$ |
| ACT-01 | NAV-01 | Team activity feed/person/date/source filters; `view=activity` | M/otogrow-activity/OtogrowActivityPage.tsx; M/otogrow-activity/ActivityWorkspace.tsx; M/otogrow-activity/ActivityFilterBar.tsx | Trace recorded human/agent work without invented productivity; A | L,H |
| ACT-02 | ACT-01 | Exact event/before-after/source | M/otogrow-activity/ActivityEvent.tsx; M/otogrow-activity/ActivityExactEvent.tsx; M/otogrow-activity/ActivityRecordPicker.tsx | Understand who changed what and reach permitted evidence; A | H,G |
| ACT-03 | ACT-01 | AI analysis selection/preparation/context | M/otogrow-activity/analysis/ActivityAnalysisAssistantPicker.tsx; M/otogrow-activity/analysis/ActivityAnalysisPreparation.tsx; M/otogrow-activity/analysis/ActivityAnalysisContextView.tsx | Ask a bounded question with transparent source/time scope; A | F,X |
| ACT-04 | ACT-03 | Current task/reviewer evidence opt-in/detail | M/otogrow-activity/analysis/ActivityCurrentWorkView.tsx; M/otogrow-activity/analysis/ActivityCurrentTaskViewer.tsx; M/otogrow-activity/analysis/ActivityCurrentTaskFacts.tsx | Separate current native-authorized facts from past activity; A plus N | L,H,G |
| ACT-05 | ACT-03 | Analysis run/result/citation/history | M/otogrow-activity/analysis/ActivityAnalysisRunViewer.tsx; M/otogrow-activity/analysis/ActivityAnalysisResultView.tsx; M/otogrow-activity/analysis/ActivityAnalysisCitation.tsx; M/otogrow-activity/analysis/ActivityAnalysisHistory.tsx | Inspect cited answer and evidence gaps; A | H,X |
| ACT-06 | ACT-05 | Analysis cancellation | M/otogrow-activity/analysis/ActivityAnalysisCancel.tsx | Stop eligible run and verify result/cost state; authorized initiator | F,X |

## AI assistant and media administration

Related improvements: IMP-09–11, 23–26, 37, 39–40, 42. Every row: **Source inventoried / Runtime unverified**.

| ID | Parent | Surface / selector | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| AI-01 | NAV-01 | Assistant catalog; `view=agents`, `agentView=assistants` | D/assistants/DeliveryAssistantsPage.tsx; D/assistants/AssistantCatalog.tsx | Find enabled permitted assistant and honest capability; S/M/A | L,X |
| AI-02 | AI-01 | Assistant configuration create/edit; `assistantCreate`, `assistantEdit=1`, `assistant` | D/assistants/AssistantConfigurationEditor.tsx | Configure purpose/model/tools/limits without hidden cost; authorized administrator | F,G,X |
| AI-03 | AI-01 | Task selection; `assistantPickTask=1` | D/assistants/AssistantTaskPicker.tsx | Select exact currently permitted task; S/M plus N | L,G |
| AI-04 | AI-01 | Assistant/context selection and preparation; `assistantRequest` | D/assistants/AssistantSelection.tsx; D/assistants/AssistantContextSummary.tsx; D/assistants/AssistantPreparation.tsx | Inspect scoped sources before starting supported run; permitted S/M | F,X |
| AI-05 | AI-01 | Runs; `assistantView=history` | D/assistants/AssistantRunHistory.tsx | Find current/past run without exposing revoked task context; permitted S/M | L,H,X |
| AI-06 | AI-05 | Run detail/result/accept/reject/cancel; `assistantRun` | D/assistants/AssistantRunDetails.tsx | Review/insert output through human decision and recover exact result; permitted initiator/reviewer | F,H,X |
| AI-07 | TASK-13, LEG-04 | Legacy task-associated configuration/permissions/run form | D/DeliveryAgents.tsx; D/DeliveryAgentForm.tsx; D/DeliveryAgentPermissions.tsx | Understand older entry paths and same current rights; permitted S/M/A | F,H,X,G |
| AI-08 | AI-01 | AI spending; `agentView=spending` | M/otogrow-ai-budget/OtogrowAiBudget.tsx; M/otogrow-ai-budget/DeliveryAiWorkspace.tsx; M/otogrow-ai-budget/AiSpendHistory.tsx | Read shared actual/reserved spending and limits; A | L,H,$,X |
| AI-09 | AI-08 | Budget/price/reconciliation forms | M/otogrow-ai-budget/AiBudgetLimitForm.tsx; M/otogrow-ai-budget/AiPriceForm.tsx; M/otogrow-ai-budget/AiSpendReconcileForm.tsx | Set explicit tariffs/budget and reconcile uncertain charge with evidence; A | F,H,$,X |
| AI-10 | AI-01 | Media models; `agentView=media` | D/creative/atlas/AtlasMediaPage.tsx; D/creative/atlas/AtlasMediaSettings.tsx | Understand provider/model availability and production defaults; A | L,G,X |
| AI-11 | AI-10 | Connection/settings/defaults | D/creative/atlas/AtlasConnectionForm.tsx; D/creative/atlas/AtlasSettingsForm.tsx; D/creative/atlas/AtlasProfileReadiness.tsx | Configure valid provider without exposing secret; A | F,G,X |
| AI-12 | AI-10 | Production access | D/creative/atlas/AtlasProductionAccessForm.tsx | Grant explicit bounded production permission; A | F,G,X |
| AI-13 | AI-10, CRE-08 | Generation/parameter form | D/creative/atlas/AtlasGenerationForm.tsx; D/creative/atlas/AtlasParameterFields.tsx | Choose supported settings with clear limits and approval; permitted producer | F,X,V |
| AI-14 | AI-10, CRE-08 | Media run list/status/result | D/creative/atlas/AtlasRunList.tsx; D/creative/atlas/AtlasProductionTools.tsx | Inspect durable generation and available asset/recovery; permitted producer | L,H,X,V |

## Legacy containing-route variants

Every row: **Source inventoried / Runtime unverified**. These are existing reachable source branches, not exclusions or acceptance shortcuts. Reuse child surface IDs where the composition is identical, but retain separate containing-route evidence. Native task denial, unsaved drafts and direct links can differ at this boundary. Related IMP-09–10, 13, 34, 37, 39–40.

| ID | Parent/target | Selector | Source | Required reconciliation |
| --- | --- | --- | --- | --- |
| LEG-01 | ADS-01, ADS-09–11 | `view=ads&adView=legacy`, or `metaReport`/`businessRecord` | D/DeliveryWorkspacePage.tsx; D/DeliveryBusiness.tsx; D/DeliveryMeta.tsx | Map manual reports, budget records, connections and exact report links to child IDs. |
| LEG-02 | MSG-01, MSG-07 | `view=inbox&inboxView=legacy`, or `businessRecord` | D/DeliveryWorkspacePage.tsx; D/DeliveryBusiness.tsx | List/create/detail/manual note and conversation permission branches. |
| LEG-03 | CLI-04, TASK-03 | `view=clients&clientView=legacy/agreements`, or `task` | D/DeliveryWorkspacePage.tsx; D/DeliveryClients.tsx | Manager versus staff commitments, exact task overlay and contract access under native denial. |
| LEG-04 | CRE-01, TASK-11 | `view=creative&creativeView=legacy` | D/DeliveryWorkspacePage.tsx; D/DeliveryCreative.tsx | Legacy task filtering/list/board/drawer and production forms. |
| LEG-05 | DEV-01 | `developerView=legacy`, `businessRecord` or `task` with `view=development` | D/DeliveryWorkspacePage.tsx; D/DeliveryBusiness.tsx | Existing release checklist/detail plus task overlay. |
| LEG-06 | COMP-01, COMP-05 | `competitorView=legacy`, `businessRecord` or `task` with `view=competitors` | D/DeliveryWorkspacePage.tsx; D/DeliveryBusiness.tsx | Existing findings/ideas/manual research and exact task context. |
| LEG-07 | CONTENT-01 | `contentView=legacy`, `businessRecord` or `task` with `view=content` | D/DeliveryWorkspacePage.tsx; D/DeliveryBusiness.tsx | Existing content record/review/publication evidence and task overlay. |
| LEG-08 | MSG-10 | `view=chat&task=:id` | D/DeliveryWorkspacePage.tsx; D/chat/DeliveryChat.tsx | Chat body plus legacy task overlay and permission recovery. |
| LEG-09 | ORG-05 | `view=health&task=:id` | D/DeliveryWorkspacePage.tsx; D/founder/DeliveryFounderExceptions.tsx; D/readiness/DeliveryReadiness.tsx | Founder body plus exact task overlay and source-bound access. |
| LEG-10 | ACT-01 | `view=activity&task=:id` | D/DeliveryWorkspacePage.tsx; M/otogrow-activity/OtogrowActivity.tsx | Activity body plus exact task overlay and denied-source behavior. |

## Public portals and entry journeys

Route authority: `M/app/hooks/useCreateWorkspaceAppRouter.tsx`, `M/app/hooks/useCreateRootAppRouter.tsx`, `S/AppPath.ts`. Every row: **Source inventoried / Runtime unverified**. Related IMP-04, 09–11, 13, 20, 29, 39, 42; existing CRM public flows remain in coverage.

| ID | Parent | Surface / route | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| PUB-01 | CLI-08 | Delivery client access; `/delivery-client` | D/DeliveryClientPortal.tsx; D/portal/useClientPortal.ts | Enter separate client code; invalid/expired/revoked/current access; C | F,C |
| PUB-02 | PUB-01 | Service summary and brand assets | D/DeliveryClientPortal.tsx | Understand actual services and inspect permitted files; C by service entitlement | C,L,V |
| PUB-03 | PUB-01 | Brand onboarding form/submissions | D/DeliveryClientPortal.tsx | Submit required information and see exact recorded answers/review; C | C,F,H |
| PUB-04 | PUB-01 | Advertising budget request/history | D/DeliveryClientPortal.tsx | Request permitted budget change without implying it was applied; performance client versus other service | C,F,H,$ |
| PUB-05 | PUB-01 | Shared brief/submission/version review/download | D/DeliveryClientPortal.tsx | Review only intentionally shared exact version and submit comment/decision; C | C,F,H,V |
| PUB-06 | PUB-03–05 | Uncertain response/access recheck/leave prompt | D/DeliveryClientPortal.tsx; D/portal/PortalLeaveGuard.tsx | Recover exact attempt and preserve eligible notes without duplicate response; C | C,F,O |
| PUB-07 | CRM-05 | Native quote/client portal; `/portal/:token` | P/portal/ClientPortalPage.tsx | Inspect quoted scope/status and supported client actions; C | C,F,H,$ |
| PUB-08 | SET-LeadFormDetail | Public lead form; `/forms/:publicId` | P/forms/PublicLeadForm.tsx | Submit configured required fields with clear success/failure; anonymous C | C,F |
| ENTRY-01 | — | Sign in/up; `/welcome`, invitation `/invite/:workspaceInviteHash` | P/auth/SignInUp.tsx | Enter correct workspace, email/password/available provider and invite state; unauthenticated | F,G |
| ENTRY-02 | ENTRY-01 | Reset password; `/reset-password/:passwordResetToken` | P/auth/PasswordReset.tsx | Recover access with valid/expired token; unauthenticated | F,G |
| ENTRY-03 | ENTRY-01 | Email verification; `/verify-email`; activation verification `/verify` | M/auth/components/VerifyEmail.tsx; P/onboarding/Verify.tsx | Verify identity and understand next required step; onboarding user | F,G |
| ENTRY-04 | ENTRY-01 | Workspace activation; `/workspace-activation` | P/onboarding/WorkspaceActivation.tsx | Complete configured workspace activation without losing context; onboarding user | F,G |
| ENTRY-05 | ENTRY-04 | Profile creation; `/create/profile` | P/onboarding/CreateProfile.tsx | Create accountable staff identity; onboarding user | F |
| ENTRY-06 | ENTRY-04 | Email sync; `/sync/emails` | P/onboarding/SyncEmails.tsx | Understand optional/required account permissions and setup; onboarding user | F,X,G |
| ENTRY-07 | ENTRY-04 | Install apps; `/install-apps` | P/onboarding/InstallApps.tsx | Inspect available application setup without claiming connected capability; onboarding user | F,X |
| ENTRY-08 | ENTRY-04 | Invite team; `/invite-team` | P/onboarding/InviteTeam.tsx | Prepare correct team access; onboarding user; no real invitation during design QA | F,G,X |
| ENTRY-09 | ENTRY-04 | Plan requirement/payment-success; `/plan-required`, `/plan-required/payment-success` | P/onboarding/ChooseYourPlan.tsx; P/onboarding/PaymentSuccess.tsx | Understand plan state and result; availability/configuration unverified | F,X,$ |
| ENTRY-10 | ENTRY-04 | Book call; `/book-call` | P/onboarding/BookCall.tsx | Understand available onboarding help; no external booking | F,X |
| ENTRY-11 | ENTRY-01 | Authorization; `/authorize` | P/auth/Authorize.tsx | Inspect and approve only understood application access; signed-in user | F,G,X |
| ENTRY-12 | — | Not found/catch-all; `*`, `/not-found` | P/not-found/NotFound.tsx; M/app/hooks/useCreateWorkspaceAppRouter.tsx | Recover from unavailable route with usable navigation; all | B |

## Native CRM and shared application families

Every row: **Source inventoried / Runtime unverified**. Rows marked **family** require discovery of configured objects, view layouts, dialogs and command actions before closure. No DB or metadata read was performed for this inventory. Related IMP-01, 04, 10–11, 20, 39, 45 and retained CRM acceptance.

| ID | Parent | Surface / route | Source | User job and access cases | Matrix |
| --- | --- | --- | --- | --- | --- |
| CRM-01 | NAV-04 | Object index family; `/objects/:objectNamePlural` | P/object-record/RecordIndexPage.tsx | Find permitted sales/customer/operational records; N | L,G |
| CRM-02 | CRM-01 | Record detail family; `/object/:objectNameSingular/:objectRecordId` | P/object-record/RecordShowPage.tsx | Inspect/edit linked facts, activity, files and tabs; N | F,H,G |
| CRM-03 | CRM-01, CRM-02 | People/company record templates | M/object-record/; D/onboarding/ClientSetupLink.tsx | Maintain client identity and start delivery from correct company; N, M | L,F,H |
| CRM-04 | CRM-01, CRM-02 | Opportunities/native tasks templates; `/objects/opportunities`, `/objects/tasks` | S/AppPath.ts; P/object-record/RecordIndexPage.tsx; P/object-record/RecordShowPage.tsx | Preserve sales pipeline/native task consumers and protected delivery-task guidance; N | L,F,G |
| CRM-05 | CRM-02 | Quote builder, line items, totals, actions/PDF | M/page-layout/widgets/quote-builder/components/QuoteBuilderWidget.tsx; M/quoting/components/QuoteLineItemsEditor.tsx; M/quoting/components/QuoteActionsBar.tsx | Prepare correct quote and accepted-deal handoff; N/sales | F,H,$,X |
| CRM-06 | CRM-01, CRM-02 | Sequence index/builder/settings/analytics | M/page-layout/widgets/sequence-builder/components/SequenceBuilderWidget.tsx; M/sequences/components/SequenceStepsEditor.tsx; M/sequences/components/SequenceSettingsSection.tsx; M/sequences/components/SequenceAnalyticsStrip.tsx | Inspect/edit sequence without accidental external enrolment/send; N/sales | L,F,H,X |
| CRM-07 | CRM-06 | Sequence step editor/enrol/unenrol commands | M/sequences/components/SequenceStepEditor.tsx; M/command-menu-item/engine-command/record/sequences/components/EnrollInSequenceRecordCommand.tsx; M/command-menu-item/engine-command/record/sequences/components/UnenrollFromSequenceRecordCommand.tsx | Understand recipient and exact sequence action; authorized sales | F,O,X |
| CRM-08 | CRM-02 | Portal sharing widget | M/page-layout/widgets/client-portal/components/ClientPortalWidget.tsx | Manage native client portal access and return to quote; N | F,G,C |
| CRM-09 | NAV-04 | Meta leads; `/meta-lead-forms` | M/meta-lead-forms/MetaLeadFormsPage.tsx; M/meta-lead-forms/MetaLeadFormTabs.tsx | Find current forms and leads with setup status; permitted sales/marketing | L,X |
| CRM-10 | CRM-09 | Meta lead detail | M/meta-lead-forms/MetaLeadDetailPanel.tsx | Inspect scoped lead/source and move to correct native record; N | O,H |
| CRM-11 | CRM-02, GLOBAL-02 | Dialer/recent calls | M/calling/components/PhoneDialer.tsx; M/calling/components/DialPad.tsx; M/calling/components/RecentCallsList.tsx | Read number/context and call eligibility; phone capability and N | F,O,G,X |
| CRM-12 | CRM-11 | Incoming/active call controls | M/calling/components/IncomingCallControls.tsx; M/calling/components/ActiveCallControls.tsx | Understand active/ringing/mute/end/revoked state using safe fixtures; allowed versus denied calling roles | O,G,X |
| CRM-13 | NAV-04 | Standalone dashboards/page layouts; `/page/:pageLayoutId` | P/page-layout/StandalonePageLayoutPage.tsx; M/page-layout/ | Inspect configured metrics and record widgets with valid scope; N | L,H,G |
| CRM-14 | NAV-04 | Workflow core and workflow record/editor family; `/workflow-core` | P/object-core/WorkflowCoreIndexPage.tsx; M/workflow/ | Find configured native workflows and distinguish editing from execution; feature gated/N | L,F,X |
| CRM-15 | NAV-01 | Native AI chat; `/chat/:threadId?` | P/ai-chat/AiChatPage.tsx | Read/continue permitted native AI thread distinctly from Team chat; allowed user | F,H,X |
| CRM-16 | NAV-03 | Mobile home; `/home` | P/mobile-home/MobileHomePage.tsx | Reach objects and OS from mobile landing; allowed user | L |
| GLOBAL-01 | CRM-01 | Native table/board/calendar/view configuration family | M/object-record/record-index/; M/object-record/record-board/; M/object-record/record-calendar/ | Filter/sort/group/select/reorder and save permitted views; N | L,F,G |
| GLOBAL-02 | NAV-01 | Search/command-menu family | M/side-panel/pages/search/components/SidePanelSearchRecordsPage.tsx; M/command-menu-item/components/ | Find records/actions without leaking scope or losing task context; all/N | L,O,G |
| GLOBAL-03 | GLOBAL-02 | Record side panel/create/edit/merge family | M/side-panel/components/SidePanelRouter.tsx; M/side-panel/pages/record-page/components/SidePanelRecordPage.tsx; M/side-panel/pages/record-page/components/SidePanelMergeRecordPage.tsx | Act on selected record and return with focus/context; N | F,O,G |
| GLOBAL-04 | GLOBAL-02 | Other side-panel routes/subpages family | M/side-panel/components/SidePanelSubPageRouter.tsx; M/side-panel/components/SidePanelRouter.tsx | Reconcile ask-AI, compose-email, rich-text, records, page layout, front-component and application-provided panels; configured access | F,O,X,G |
| GLOBAL-05 | NAV-01 | Workspace/account menu, switch/logout and global notices/dialogs family | M/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/; M/ui/ | Reconcile global confirmations, toasts, errors and identity transitions; all | O,F,G |

## Settings route ledger

Settings rows follow below. Their source of truth is `M/app/components/SettingsRoutes.tsx` and `S/SettingsPath.ts`; the latter also contains paths with no direct route declaration. A declaration is not evidence that a given account can reach the screen. All concrete routed settings pages receive stable IDs derived from their enum key; aliases and undeclared constants are listed separately. Every setting inherits B/G; editor pages add F, list/detail/history pages add L/H as applicable, and integrations add X. All are **Source inventoried / Runtime unverified**, with child-dialog/form discovery pending.


Settings are related primarily to IMP-01, 09–11, 23–26, 39, 41–42 and 45. Changing settings is not required merely to inspect their design. Do not connect providers, invite real people, change billing or alter production permissions during design QA.

### Settings: personal

Access: **Own account**. Business job: Manage personal identity, authentication and reading preferences. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-ProfilePage | Personal profile; `/settings/profile` | P/settings/profile/SettingsProfile.tsx | G,F |
| SET-TwoFactorAuthenticationStrategyConfig | Two-factor authentication method; `/settings/profile/two-factor-authentication/:twoFactorAuthenticationStrategy` | P/settings/profile/SettingsTwoFactorAuthenticationMethod.tsx | G,F |
| SET-Experience | Reading and workspace preferences; `/settings/experience` | P/settings/profile/appearance/components/SettingsExperience.tsx | G,F |

### Settings: CONNECTED_ACCOUNTS

Access: **P(CONNECTED_ACCOUNTS)**. Business job: Manage authorized email/calendar connections, visibility and synchronization. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-Accounts | Connected accounts; `/settings/accounts` | P/settings/accounts/SettingsAccounts.tsx | G,F,L,H,X |
| SET-AccountsEmails | Email synchronization settings; `/settings/accounts/emails` | P/settings/accounts/SettingsAccountsEmails.tsx | G,F,L,H,X |
| SET-AccountsCalendars | Calendar synchronization settings; `/settings/accounts/calendars` | P/settings/accounts/SettingsAccountsCalendars.tsx | G,F,L,H,X |
| SET-NewAccount | Connect account; `/settings/accounts/new` | P/settings/accounts/SettingsNewAccount.tsx | G,F,X |
| SET-AccountsConfiguration | Connected account configuration; `/settings/accounts/configuration/:connectedAccountId` | P/settings/accounts/SettingsAccountsConfiguration.tsx | G,F,L,H,X |
| SET-NewImapSmtpCaldavConnection | Create IMAP/SMTP/CalDAV connection; `/settings/accounts/new-imap-smtp-caldav-connection` | M/settings/accounts/components/SettingsAccountsNewImapSmtpCaldavConnection.tsx | G,F,X |
| SET-EditImapSmtpCaldavConnection | Edit IMAP/SMTP/CalDAV connection; `/settings/accounts/edit-imap-smtp-caldav-connection/:connectedAccountId` | M/settings/accounts/components/SettingsAccountsEditImapSmtpCaldavConnection.tsx | G,F,X |

### Settings: WORKSPACE

Access: **P(WORKSPACE)**. Business job: Maintain workspace communication, plan, domain and legal configuration. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-General | Workspace general settings; `/settings/general` | P/settings/general/SettingsGeneral.tsx | G,F |
| SET-WorkspaceCommunications | Workspace communication settings; `/settings/communications` | P/settings/communications/SettingsWorkspaceCommunications.tsx | G,F |
| SET-NewEmailGroupChannel | Create shared email group; `/settings/email/new-email-group` | M/settings/accounts/components/SettingsAccountsNewEmailGroupChannel.tsx | G,F |
| SET-EmailGroupChannelDetail | Shared email group details; `/settings/email/email-group/:messageChannelId` | P/settings/communications/SettingsWorkspaceCommunicationGroupChannelDetail.tsx | G,F,L,H |
| SET-NewUnsubscribeTopic | Create unsubscribe topic; `/settings/email/new-unsubscribe-topic` | P/settings/communications/SettingsWorkspaceNewUnsubscribeTopic.tsx | G,F |
| SET-UnsubscribeTopicDetail | Unsubscribe topic details; `/settings/email/unsubscribe-topic/:unsubscribeTopicId` | P/settings/communications/SettingsWorkspaceUnsubscribeTopicDetail.tsx | G,F,L,H |
| SET-Unsubscribe | Unsubscribe settings; `/settings/communications/unsubscribe` | P/settings/communications/SettingsWorkspaceUnsubscribe.tsx | G,F |
| SET-Billing | Billing status; `/settings/billing` | P/settings/billing/SettingsBilling.tsx | G,F,X,$ |
| SET-BillingPlans | Plan choices; `/settings/billing/plans` | P/settings/billing/SettingsBillingPlans.tsx | G,F,X,$ |
| SET-Usage | Workspace usage; `/settings/billing/usage` | P/settings/billing/SettingsUsage.tsx | G,F,L,H,$ |
| SET-UsageUserDetail | Member usage detail; `/settings/billing/usage/user/:userWorkspaceId` | P/settings/billing/SettingsUsageUserDetail.tsx | G,F,L,H,$ |
| SET-Subdomain | Workspace subdomain; `/settings/general/subdomain` | P/settings/domains/SettingsSubdomainPage.tsx | G,F,X |
| SET-CustomDomain | Custom domain; `/settings/general/custom-domain` | P/settings/domains/SettingsCustomDomainPage.tsx | G,F,X |
| SET-PublicDomain | Public application domain; `/settings/applications/public-domain` | M/settings/domains/components/SettingPublicDomain.tsx | G,F,X |
| SET-LegalDpa | Data processing agreement list; `/settings/legal/dpa` | P/settings/legal/SettingsLegalDpa.tsx | G,F |
| SET-LegalDpaNew | Create data processing agreement; `/settings/legal/dpa/new` | P/settings/legal/SettingsLegalDpaNew.tsx | G,F |

### Settings: AI_SETTINGS

Access: **P(AI_SETTINGS)**. Business job: Inspect and configure native AI behavior, prompts, skills, tools and usage. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-AI | Native AI settings; `/settings/ai` | P/settings/ai/SettingsAI.tsx | G,F,X |
| SET-AiPrompts | Native AI prompts; `/settings/ai/prompts` | P/settings/ai/SettingsAiPrompts.tsx | G,F,X |
| SET-AiNewAgent | Create native AI agent; `/settings/ai/new-agent` | P/settings/ai/SettingsAgentForm.tsx | G,F,X |
| SET-AiAgentDetail | Edit native AI agent; `/settings/ai/agents/:agentId` | P/settings/ai/SettingsAgentForm.tsx | G,F,L,H,X |
| SET-AiAgentTurnDetail | Native agent turn detail; `/settings/ai/agents/:agentId/turns/:turnId` | P/settings/ai/SettingsAgentTurnDetail.tsx | G,F,L,H,X |
| SET-AiNewSkill | Create native AI skill; `/settings/ai/new-skill` | P/settings/ai/SettingsSkillForm.tsx | G,F,X |
| SET-AiSkillDetail | Edit native AI skill; `/settings/ai/skills/:skillId` | P/settings/ai/SettingsSkillForm.tsx | G,F,L,H,X |
| SET-AiUsageUserDetail | Member AI usage detail; `/settings/ai/usage/user/:userWorkspaceId` | P/settings/ai/SettingsAiUsageUserDetail.tsx | G,F,L,H,X,$ |
| SET-AiToolDetail | Native AI tool details; `/settings/ai/tools/:toolIdentifier` | P/settings/ai/SettingsToolDetail.tsx | G,F,L,H,X |
| SET-LogicFunctionDetail | Logic function detail; `/settings/functions/:logicFunctionId` | P/settings/logic-functions/SettingsLogicFunctionDetail.tsx | G,F,L,H,X |

### Settings: LAYOUTS

Access: **P(LAYOUTS)**. Business job: Maintain reusable layouts without breaking readers of configured records. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-Layout | Layout settings; `/settings/layout` | P/settings/layout/SettingsLayout.tsx | G,F |

### Settings: WORKSPACE_MEMBERS

Access: **P(WORKSPACE_MEMBERS)**. Business job: Manage member identity, invitations and workspace membership. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-WorkspaceMembersPage | Workspace members and roles tab; `/settings/members` | P/settings/members/SettingsWorkspaceMembers.tsx | G,F,L,H |
| SET-WorkspaceMemberPage | Workspace member detail; `/settings/members/:workspaceMemberId` | P/settings/members/SettingsWorkspaceMember.tsx | G,F |

### Settings: DATA_MODEL

Access: **P(DATA_MODEL)**. Business job: Configure native objects, fields and indexes while preserving existing records. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-Objects | Object catalog; `/settings/objects` | P/settings/data-model/SettingsObjects.tsx | G,F,L,H |
| SET-ObjectOverview | Object overview; `/settings/objects/overview` | P/settings/data-model/SettingsObjectOverview.tsx | G,F,L,H |
| SET-ObjectDetail | Object configuration; `/settings/objects/:objectNamePlural` | P/settings/data-model/SettingsObjectDetailPage.tsx | G,F,L,H |
| SET-NewObject | Create object; `/settings/objects/new` | P/settings/data-model/SettingsNewObject.tsx | G,F |
| SET-ObjectNewFieldSelect | Choose new field type; `/settings/objects/:objectNamePlural/new-field/select` | P/settings/data-model/new-field/SettingsObjectNewFieldSelect.tsx | G,F |
| SET-ObjectNewFieldConfigure | Configure new field; `/settings/objects/:objectNamePlural/new-field/configure` | P/settings/data-model/new-field/SettingsObjectNewFieldConfigure.tsx | G,F |
| SET-ObjectNewIndex | Create index; `/settings/objects/:objectNamePlural/new-index` | P/settings/data-model/new-index/SettingsObjectNewIndex.tsx | G,F |
| SET-ObjectFieldEdit | Edit field; `/settings/objects/:objectNamePlural/:fieldName` | P/settings/data-model/SettingsObjectFieldEdit.tsx | G,F |

### Settings: ROLES

Access: **P(ROLES)**. Business job: Configure actual native permission boundaries and explain effective access. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-RoleDetail | Role editor; `/settings/members/roles/:roleId` | P/settings/members/roles/SettingsRoleEdit.tsx | G,F,L,H |
| SET-RoleCreate | Create role; `/settings/members/roles/create` | P/settings/members/roles/SettingsRoleCreate.tsx | G,F |
| SET-RoleObjectLevel | Object permission editor; `/settings/members/roles/:roleId/object/:objectMetadataId` | P/settings/members/roles/SettingsRoleObjectLevel.tsx | G,F |
| SET-RoleAddObjectLevel | Add object permission; `/settings/members/roles/:roleId/add-object-permission` | P/settings/members/roles/SettingsRoleAddObjectLevel.tsx | G,F |

### Settings: API_KEYS_AND_WEBHOOKS

Access: **P(API_KEYS_AND_WEBHOOKS)**. Business job: Manage API/integration credentials, lead collection and communications setup. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-ApiWebhooks | API and webhook settings; `/settings/mcp-apis` | P/settings/api-webhooks/SettingsApiWebhooks.tsx | G,F,X |
| SET-GraphQLPlayground | GraphQL explorer; `/settings/playground/graphql/:schema` | P/settings/developers/playground/SettingsGraphQLPlayground.tsx | G,F,X |
| SET-RestPlayground | REST explorer; `/settings/playground/rest/:schema/*` | P/settings/developers/playground/SettingsRestPlayground.tsx | G,F,X |
| SET-NewApiKey | Create API key; `/settings/mcp-apis/apis/new` | P/settings/developers/api-keys/SettingsDevelopersApiKeysNew.tsx | G,F,X |
| SET-ApiKeyDetail | API key detail; `/settings/mcp-apis/apis/:apiKeyId` | P/settings/developers/api-keys/SettingsDevelopersApiKeyDetail.tsx | G,F,L,H,X |
| SET-NewWebhook | Create webhook; `/settings/mcp-apis/webhooks/new` | P/settings/developers/webhooks/components/SettingsDevelopersWebhookNew.tsx | G,F,X |
| SET-WebhookDetail | Webhook detail; `/settings/mcp-apis/webhooks/:webhookId` | P/settings/developers/webhooks/components/SettingsDevelopersWebhookDetail.tsx | G,F,L,H,X |
| SET-LeadForms | Lead form catalog; `/settings/lead-forms` | P/settings/forms/SettingsLeadForms.tsx | G,F,L,H,X |
| SET-NewLeadForm | Create lead form; `/settings/lead-forms/new` | P/settings/forms/SettingsLeadFormNew.tsx | G,F,X |
| SET-LeadFormDetail | Lead form editor; `/settings/lead-forms/:formId` | P/settings/forms/SettingsLeadFormDetail.tsx | G,F,L,H,X |
| SET-Twilio | Calling provider setup; `/settings/twilio` | P/settings/twilio/SettingsTwilio.tsx | G,F,X |
| SET-MetaAds | Meta advertising/lead setup; `/settings/meta-ads` | P/settings/meta-ads/SettingsMetaAds.tsx | G,F,X |
| SET-SettersTelegram | Setter Telegram setup; `/settings/setters-telegram` | P/settings/setters-telegram/SettingsSettersTelegram.tsx | G,F,X |

### Settings: APPLICATIONS

Access: **P(APPLICATIONS)**. Business job: Inspect installed/available apps and their permissions, connections and components. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-Applications | Applications catalog; `/settings/applications` | P/settings/applications/SettingsApplications.tsx | G,F,L,H,X |
| SET-ApplicationDetail | Installed application detail; `/settings/applications/:applicationId` | P/settings/applications/SettingsApplicationDetails.tsx | G,F,L,H,X |
| SET-ApplicationConnectionDetail | Application connection detail; `/settings/applications/:applicationId/connections/:connectedAccountId` | P/settings/applications/SettingsApplicationConnectionDetail.tsx | G,F,L,H,X |
| SET-AvailableApplicationDetail | Available application detail; `/settings/applications/available/:availableApplicationId` | P/settings/applications/SettingsAvailableApplicationDetails.tsx | G,F,L,H,X |
| SET-ApplicationRegistrationDetail | Application registration detail; `/settings/applications/registrations/:applicationRegistrationId` | P/settings/applications/SettingsApplicationRegistrationDetails.tsx | G,F,L,H,X |
| SET-ApplicationLogicFunctionDetail | Application logic function; `/settings/applications/:applicationId/logicFunctions/:logicFunctionId` | P/settings/logic-functions/SettingsLogicFunctionDetail.tsx | G,F,L,H,X |
| SET-ApplicationFrontComponentDetail | Application frontend component; `/settings/applications/:applicationId/frontComponents/:frontComponentId` | P/settings/applications/SettingsApplicationFrontComponentDetail.tsx | G,F,L,H,X |
| SET-ApplicationCommandMenuItemDetail | Application command action; `/settings/applications/:applicationId/commandMenuItems/:commandMenuItemId` | P/settings/applications/SettingsApplicationCommandMenuItemDetail.tsx | G,F,L,H,X |
| SET-ApplicationViewDetail | Application view; `/settings/applications/:applicationId/views/:viewUniversalIdentifier` | P/settings/layout/SettingsLayoutViewDetail.tsx | G,F,L,H,X |
| SET-ApplicationPageLayoutDetail | Application page layout; `/settings/applications/:applicationId/pageLayouts/:pageLayoutUniversalIdentifier` | P/settings/layout/SettingsLayoutPageLayoutDetail.tsx | G,F,L,H,X |

### Settings: SECURITY

Access: **P(SECURITY)**. Business job: Configure authentication and domain access with clear impact. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-NewSSOIdentityProvider | Create SSO identity provider; `/settings/security/sso/new` | P/settings/security/SettingsSecuritySSOIdentifyProvider.tsx | G,F |
| SET-NewApprovedAccessDomain | Add approved access domain; `/settings/security/approved-access-domain/new` | P/settings/security/SettingsSecurityApprovedAccessDomain.tsx | G,F |

### Settings: admin

Access: **isAdminPageEnabled; actual server rights still required**. Business job: Inspect instance health/configuration, users, providers and support evidence. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-AdminPanel | Instance administration; `/settings/admin-panel` | P/settings/admin-panel/SettingsAdmin.tsx | G,F,X |
| SET-AdminPanelInferredVersion | Inferred version; `/settings/admin-panel/health-status/inferred-version` | P/settings/admin-panel/SettingsAdminInferredVersion.tsx | G,F,X |
| SET-AdminPanelInstanceStatus | Instance health; `/settings/admin-panel/health-status/instance-status` | P/settings/admin-panel/SettingsAdminInstanceStatus.tsx | G,F,L,H,X |
| SET-AdminPanelWorkspacesStatus | Workspace health overview; `/settings/admin-panel/health-status/workspaces-status` | P/settings/admin-panel/SettingsAdminWorkspacesStatus.tsx | G,F,L,H,X |
| SET-AdminPanelIndicatorHealthStatus | Health indicator detail; `/settings/admin-panel/health-status/:indicatorId` | P/settings/admin-panel/SettingsAdminIndicatorHealthStatus.tsx | G,F,L,H,X |
| SET-AdminPanelQueueDetail | Queue health detail; `/settings/admin-panel/health-status/queue/:queueName` | P/settings/admin-panel/SettingsAdminQueueDetail.tsx | G,F,L,H,X |
| SET-AdminPanelConfigVariableDetails | Configuration variable detail; `/settings/admin-panel/config-variables/:variableName` | P/settings/admin-panel/SettingsAdminConfigVariableDetails.tsx | G,F,L,H,X |
| SET-AdminPanelNewAiProvider | Create AI provider; `/settings/admin-panel/ai/new-provider` | P/settings/admin-panel/SettingsAdminNewAiProvider.tsx | G,F,X |
| SET-AdminPanelNewAiModel | Create provider model; `/settings/admin-panel/ai/providers/:providerName/new-model` | P/settings/admin-panel/SettingsAdminNewAiModel.tsx | G,F,X |
| SET-AdminPanelAiProviderDetail | Provider detail; `/settings/admin-panel/ai/providers/:providerName` | P/settings/admin-panel/SettingsAdminAiProviderDetail.tsx | G,F,L,H,X |
| SET-AdminPanelUserDetail | Instance user detail; `/settings/admin-panel/users/:userId` | P/settings/admin-panel/SettingsAdminUserDetail.tsx | G,F,L,H,X |
| SET-AdminPanelWorkspaceDetail | Instance workspace detail; `/settings/admin-panel/workspaces/:workspaceId` | P/settings/admin-panel/SettingsAdminWorkspaceDetail.tsx | G,F,L,H,X |
| SET-AdminPanelApplicationRegistrationDetail | Instance application registration; `/settings/admin-panel/applications/registrations/:applicationRegistrationId` | P/settings/admin-panel/SettingsAdminApplicationRegistrationDetail.tsx | G,F,L,H,X |
| SET-AdminPanelWorkspaceChatThread | Workspace AI thread inspection; `/settings/admin-panel/workspaces/:workspaceId/threads/:threadId` | P/settings/admin-panel/SettingsAdminWorkspaceChatThread.tsx | G,F,X |
| SET-AdminPanelChats | Instance AI chats; `/settings/admin-panel/chats` | P/settings/admin-panel/SettingsAdminChats.tsx | G,F,L,H,X |

### Settings: WORKSPACE

Access: **P(WORKSPACE)**. Business job: Maintain workspace communication, plan, domain and legal configuration. Every row: **Source inventoried / Runtime unverified**. Parent: NAV-05. Child surfaces: inventory during baseline; configured dialogs/forms remain open scope.
| ID | Screen / exact route | Component source | Additional matrix |
| --- | --- | --- | --- |
| SET-Community | Community/workspace information; `/settings/community` | P/settings/community/SettingsCommunity.tsx | G,F |

### Settings aliases, anchors and unresolved constants

Every row: **Source inventoried / Runtime unverified**. An alias needs navigation/reload/Back/Forward evidence against its target, not a duplicate redesign. A source constant without a route remains a discovery item, not an enabled feature claim.

| ID | Source route/constant | Target or unresolved source result | Required next step |
| --- | --- | --- | --- |
| ALIAS-01 | `/settings/members/roles` (`SettingsPath.Roles`) | Redirect to `SET-WorkspaceMembersPage`, `#roles` | Check roles tab location, keyboard focus and permission guard. |
| ALIAS-02 | `/settings/enterprise` | Flag-gated redirect to `SET-AdminPanel`, `#enterprise` | Check gate and target section; do not count as a separate page. |
| ALIAS-03 | `/settings/security` | Redirect to `SET-General`, `#security` | Check section visibility and auth permission separately. |
| ALIAS-04 | `/settings/api-webhooks` | `SET-ApiWebhooks` | Verify old API landing link reaches canonical page. |
| ALIAS-05 | `/settings/api-webhooks/apis/new` | `SET-NewApiKey` | Verify old create link and permission handling. |
| ALIAS-06 | `/settings/api-webhooks/apis/:apiKeyId` | `SET-ApiKeyDetail` | Preserve exact key identity without displaying secret. |
| ALIAS-07 | `/settings/api-webhooks/webhooks/new` | `SET-NewWebhook` | Verify old create link. |
| ALIAS-08 | `/settings/api-webhooks/webhooks/:webhookId` | `SET-WebhookDetail` | Preserve exact webhook identity. |
| ALIAS-09 | `/dpa` | Redirect to `SET-LegalDpa` from workspace router | Check signed-in route and return. |
| ALIAS-10 | `SettingsPath.Security`, `SettingsPath.Logs` | `SET-General` anchors `#security`, `#logs` | Enumerate actual general-settings sections/dialogs. |
| ALIAS-11 | `SettingsPath.AdminPanelEnterprise`, `SettingsPath.AdminPanelHealthStatus` | `SET-AdminPanel` anchors `#enterprise`, `#health-status` | Inspect enabled admin sections and children. |
| DISC-01 | `SettingsPath.LogicFunctions`, `SettingsPath.NewLogicFunction` | Constants `functions`, `functions/new`; no direct declaration in inspected SettingsRoutes | Reconcile actual navigation/application links/feature flags before retaining or excluding. LogicFunctionDetail is separately routed. |
| DISC-02 | `SettingsPath.Integrations` | Constant `integrations`; no direct declaration; navigation item is commented in `M/settings/hooks/useSettingsNavigationItems.tsx` | Confirm no other route/provider exposes it; document exclusion only after runtime/source reconciliation. |
| DISC-03 | `SettingsPath.Legal` | Constant `legal`; no direct declaration; specific DPA pages are routed | Reconcile legal drawer/navigation behavior. |
| DISC-04 | `AppPath.DevelopersCatchAll` | AppPath constant `/developers/*`; workspace router inspected here has no matching route | Check root router/redirects and application links; not a verified enabled page. |
| DISC-05 | `AppPath.Index` and record-index skeleton route | Destination depends on `M/navigation/utils/indexAppPath.ts` and configured metadata | Record actual desktop landing and role/first-visit behavior. |
| DISC-06 | Settings children | 92 concrete routed enum entries, two enum redirects, five legacy redirects and one literal security redirect were source-mapped | Discover every materially different dialog/tab/form reached from these pages; generate child IDs before accepting a parent. |

## Shared dependencies and acceptance propagation

`D/deliveryStyles.ts`, `D/DeliveryPageHeader.tsx`, the navigation drawer, global typography/theme variables, draft guards, `D/DeliveryWorkspacePage.tsx`, `D/tasks/DeliveryTasksPage.tsx` and native permission hooks can affect many rows. Each implementation batch must record its actual consumer list. A change to a common header, font size, spacing, native component or error/draft handler reopens affected consumers even when their own source file did not change. Domain styles such as Finance, Atlas, advertising and native page layouts have narrower but still explicit consumers.

A shared source file does not mean a shared acceptance result. For example, FIN-01, ADS-11 and COMP-05 use DeliveryBusiness; PUB-02–06 use DeliveryClientPortal; TASK-03 and legacy routes share task components. Each different user job/layout must retain its own evidence and matrix result. Page top screenshots do not settle expanded forms or below-fold histories.

## Pilot inventory and remaining runtime reconciliation

The approved calibration journeys map to:

| Pilot | Stable IDs | Observable business check | Inventory status |
| --- | --- | --- | --- |
| Daily work | DAY-01–04, TASK-03/04/07, REV-03; NAV-01/03 dependencies | Employee identifies priority, opens exact work, understands next step and can return without lost context; manager/reviewer distinctions remain visible. | DAY-01/04 and task navigation have bounded current evidence below; complete role/state matrix remains In progress. DAY-02 and review decisions remain unverified. |
| Populated Creative studio/task detail | CRE-01–08, CRE-10–13, TASK-03/04/10; select actual observed stages for first slice, keep other stages pending | Producer understands brief → references → shots/assets → final review, and reviewer sees exact version without searching across disconnected panels. | Queue, unsubmitted brief and containing task drawer have bounded synthetic evidence below; other stages/media/review branches remain unverified. |
| Finance | Actual implemented pilot: FIN-01 cash and FIN-02 forecast; FIN-08 draft navigation only. FIN-04 monthly remains a future candidate, not an exercised pilot. | Finance user sees useful records/results and clear amounts/actions before secondary explanation; read-only and edit cases remain distinct. | Empty cash/unknown starting-cash states and a discarded entry draft have evidence below. Dense populated Finance remains required and unverified. |

The coordinator owns runtime evidence and acceptance. The execution overrides below attribute browser checks to the coordinator and source/screenshot critique to the independent reviewer; the inventory author does not claim to have operated those journeys.

Remaining Stage 0 work:

1. Walk all 22 main destinations with actual effective permissions, then the dispatcher branch table; record direct links, disabled/hidden destinations and source-to-runtime discrepancies.
2. Open every listed form, stage, detail, history and overlay using isolated realistic data. Split grouped forms/commands into child IDs when their composition or user decision differs. The named command variants in CONTENT-09/10, DEV-04/05, ADS-11, FIN-08, OPS-02 and AI-06 are explicit pending branches, not collectively accepted screens.
3. Enumerate configured native objects/views/layouts/widgets and command-menu/side-panel actions. Check object read/create/edit, field/row restrictions and phone rights; do not infer configured metadata from standard source examples.
4. Reconcile root/workspace login and onboarding conditions, all settings gates, the eight SettingsPath constants without direct declarations, redirects/anchors, and actual application-provided screens. Record exact gate/setup for unavailable surfaces.
5. Use a separate client/public session for PUB-01–08. Do not infer portal behavior from internal sharing forms. Keep distinct service entitlement, exact-version, expired/revoked and uncertain-response cases.
6. Register screenshot/evidence location, safe fixture owner, teardown receipt and rendering fingerprint per started surface. No old screenshot automatically closes this redesign pass.
7. Run a final source-to-manifest and navigation-to-manifest reconciliation after discoveries. No family may close with unenumerated children, no required gate may be silently omitted, and no overall completion denominator is final until these passes agree.

## 2026-11-06 pilot execution overrides — IMP-06/11, Finance dependency IMP-21

**Status: In progress / QA; zero full-surface local acceptances.** These records supersede only the indicated fields of their stable IDs. Other states, children and roles retain their unverified defaults. Whole-improvement counts remain **26 Local complete, 15 Partial, 5 In progress, 0 Queued: 20 unfinished**; no whole item closes in this batch. Production and real-staff acceptance remain unverified.

### Decision, people and workflow

The company outcome is less time spent finding work and interpreting controls: editors should reach the exact brief and production stage; Amna should see current responsibility and the independent approval step; founder/finance users should reach cash records and scenario setup before secondary investigations. These are expected benefits, not measured productivity gains.

The coordinator's mandatory decision record is under the same date in `OTOGROW-OS-IMPROVEMENTS.md`. Three bounded design notes supply alternatives and tradeoffs: `/tmp/otogrow-creative-design-notes.md`, `/tmp/otogrow-task-detail-design-notes.md` and `/tmp/otogrow-finance-design-notes.md`. Adding another dashboard or fixed stage sidebar was rejected because it adds navigation and width pressure. The chosen pattern uses a compact contextual header, divided task rows, visible primary work and optional in-place disclosures. Existing Linaria/theme controls, URL selections, source freshness, draft guards and business commands remain the infrastructure.

Current → proposed reading paths:

- **DAY-01/04:** repeated zero counters before the queue → attention information when useful, separately authorized assigned reviews, then readable task rows and the exact task link. Review responsibility is not inferred from task-assignment counts.
- **CRE-01/02/09:** repeated introduction and expanded filters before work → compact search, optional filters, task action by its title, then exact task identity/owner/state and the selected stage. Group brief fields into Deliverable, Audience and message, Product and brand, and Creative direction. Keep unknown-fact and approval warnings visible.
- **TASK-03/04/06:** empty comparison form, five equal stage cards and repeated panel controls before the brief → current next owner/action, optional complete stage path, one narrow panel selector, task identity and brief. Capacity and empty checklist disclosures retain mounted editors; real submissions and explicit review selections retain exact review/recovery. Revision/history information remains reachable.
- **FIN-01/02/08:** revision investigation and generic explanation before primary cash work → concise cash-basis warning, entry/records first, secondary analysis later. Forecast shows starting-cash setup when unknown, or the actual scenario before starting-balance audit when configured. Exact amounts, incomplete/unknown meaning, independent read/manage rights and financial command semantics are preserved.

A normal local production refresh is visibly labelled inside Task details; stale/denied/unavailable recovery exposes the action directly. It cannot be replaced by the outer page refresh: the task path validates production metadata and detail in sequence and clears its own recovery state. The mobile workspace title now wraps visibly while retaining a native selector and a visible focus outline. These changes remove duplicate controls and clipping without removing recovery or shrinking essential text.

### Surface records and observed scope

All rows below are **In progress / QA**, not locally accepted. Iteration numbers describe this pilot's design passes; they are not counts of completed pages.

| Stable IDs | Actual containing route and observed state | Owner / iteration | Evidence and remaining scope |
| --- | --- | --- | --- |
| DAY-01, DAY-04; NAV-03 | `/delivery?view=home`; ALLOWED administrator, two unassigned Design tasks and separate review count; normal empty workspace after cleanup | Coordinator / 4 | Current task rows and first action are visible in `today-final-320.png`, `today-final-390.png`, `today-final-1440.png`. Empty light theme observed in `today-light-empty-390.png` and `today-light-empty-1440.png`. Ordinary staff, nonzero urgent/review workload, dense queue and all remaining matrix cases stay unverified. |
| TASK-03, TASK-04, TASK-06; TASK-11 handoff | `/delivery?view=home&task=:fixtureTask`; `panel=creative` then exact Creative studio task | Task-detail owner and coordinator / 2 | `task-detail-final-320.png`, `task-detail-pass2-mobile.png`; current owner/action and complete stage disclosure inspected. Estimate draft and narrow panel navigation exercised below. Submitted/final-review, revision history, actual save and role-specific cases remain unverified. |
| CRE-01 | `/delivery?view=creative`; two synthetic tasks with long titles and private briefs | Creative owner and coordinator / 3 | `creative-final-390.png`; Open production now appears with the task title. Every filter/paging/empty/error state, dense realistic work and all effective roles remain required. |
| CRE-02; brief variant of CRE-09; CRE-03 navigation only | `/delivery?view=creative&task=:fixtureTask`, Brief; guarded stage change to References | Creative owner and coordinator / 3 | `brief-final-320.png`, `brief-final-390.png`, `brief-final-768.png`, `brief-final-1440.png`; full title, stage, approval state and grouped fields inspected. Opening References proves navigation only, not reference selection/approval. Other CRE-09 variants and CRE-04–08/10–16 are not accepted by this work. |
| FIN-01; create-draft variant of FIN-08; NAV-03 | `/delivery?view=finance`; empty cash records, New financial entry draft | Finance owner and coordinator / 2 | `finance-final-mobile.png`, `finance-final-desktop.png`; records/entry precede revision-cost investigation. Entry title Keep editing/Discard checked, with no write. Other FIN-08 commands, populated records, read-only and other roles remain unverified. |
| FIN-02 | `/delivery?view=finance&financeView=forecast`; unknown starting cash | Finance owner and coordinator / 2, followed by bounded desktop action-width correction | `forecast-final-320.png`, `forecast-final-390.png`, `forecast-final-1440.png` show setup hierarchy before the final button-width correction. The correction is verified in `forecast-corrected-final-1440.png` and `forecast-light-final-390.png`/`forecast-light-final-1440.png`; desktop action width is 163.8px inside a 1142px card. Populated projection, long exact amounts, shortfall date, item/history/realization forms and all roles remain unverified. |
| NAV-07 | Finance entry navigation, Creative stage navigation and task estimate cancellation | Coordinator / linked pilot passes | Keep editing retained the exact draft; explicit discard continued the requested navigation/cancel. Full Back/Forward/reload/native-leave, uncertain-save and cross-role failure cases remain unverified. |

Evidence paths in this section are relative to `/tmp/otogrow-design-loop-20261106/`. Baselines are `today-before-desktop.png`, `today-before-narrow.png`, `creative-before-desktop.png`, `creative-before-mobile.png`, `brief-before-desktop.png`, `brief-before-mobile.png`, `task-detail-baseline-mobile.png`, `finance-before-desktop.png`, `finance-before-mobile.png`, `forecast-before-desktop.png` and `forecast-before-mobile.png`. Failed intermediate `*-pass*.png` captures remain available; a final file name alone does not prove every gate. Coordinator binding is recorded in `/tmp/otogrow-design-loop-20261106/evidence-index.json`: SHA-256 `71c8af18bc3b6fb4218fc421333cae890a822d28c4dcd07ea6e9b4e9daf60112` over the 63 changed frontend source/test file hashes. The index records base commit, branch, timestamps, image dimensions, artifact hashes and evidence carry-forward limits. These local temporary artifacts are not a published release or whole-tree acceptance receipt.

### Actual browser checks and data boundary

The coordinator operated the local IAB app with an isolated native-access fixture in ALLOWED administrator mode: two unassigned Design tasks with private briefs/creative concepts. This is deliberately limited populated evidence, not a realistic mixed-workload or ordinary-editor role proof. The fixture permitted reads and disposable drafts only. No business save, approval, assignment acknowledgement, post, external message, paid generation, financial write or advertising action was performed for these checks.

Observed interactions:

1. Opened the exact Today task and closed its drawer; focus returned to its task link. The narrow Task section selector retained the task identity and reached Creative production; Open creative production reached that same task in the studio.
2. Opened the Delivery stages disclosure and closed it with keyboard Enter; the current owner/action stayed visible outside it. The capacity draft's remaining production estimate `45` survived closing and reopening its mounted disclosure; explicit cancellation prompted for discard. The disposable draft was discarded, not saved.
3. Entered a disposable Finance title, requested navigation to forecast, chose Keep editing and observed the retained title/focus, then chose Discard and reached forecast.
4. Entered a disposable Creative concept, requested References using the narrow stage selector, chose Keep editing and observed the exact retained concept/current Brief stage, then chose Discard and reached References. Returning to Brief showed the original saved fixture concept.
5. Opened Task details and used its labelled Refresh production action; the disabled refreshing state returned to the available action. This is successful normal refresh, not proof of every denied/stale/outage recovery.
6. Inspected native mobile workspace switching and current narrow/wide layout. Limited no-horizontal-overflow checks and screenshot widths are not a full reflow, contrast or actual 200% zoom acceptance.

Fixture cleanup passed with exact original **201 protected tables, schema, authentication, role target and four Redis values/absolute expiries** preserved. Receipt: `/tmp/otogrow-native-task-access-ui-fixture.json.e42f7886-57e5-4c81-9d2f-c1fb3e72fd1d.cleaned.json`; log `task-fixture-cleanup.log`. All owned fixture rows were removed and the normal API restarted (coordinator reported PID84023). After cleanup, the coordinator inspected light-theme empty Today/Cash and unknown-balance Forecast, restored the original System theme, reset the temporary viewport override and reloaded the normal app. `local-app-restored.png` shows the normal empty Today page with no fixture tasks. Final source/evidence binding is registered above; preference restoration occurred after the exact fixture teardown.

### Independent critique, fixes and gate results

Reviewer: **design_loop_qa**, separate from the page authors. Its review used source and supplied screenshots; it did not perform the browser journeys and is not real employee usability testing.

Rework resolved observed issues across multiple passes: Today work below the first mobile screen, repeated counts and a review-summary link that opened help; Creative queue/brief actions displaced by filters and metadata, unsupported “Ready” wording, inconsistent deadline presentation, oversized format field, clipped 320px title and ambiguous duplicate refresh icons; task details displaced by empty comparison and five equal stage cards; Finance work displaced by secondary revision analysis and duplicate navigation inside calculation help. Exact due times use the existing task timezone selection/default and explicit UTC fallback for an invalid timezone; no business timezone was invented. A final minor desktop forecast issue was a starting-cash button stretched across the card; the coordinator corrected its desktop alignment while preserving full-width phone behavior, and fresh dark desktop/light desktop/phone screenshots now confirm the correction.

| Required gate | Current result for the full surfaces | Bounded evidence / outstanding requirement |
| --- | --- | --- |
| Understandable purpose | Unverified beyond the pictured states | Reviewer could identify purpose, owner/current state and next action in the supplied pilot images. Remaining role/state compositions have not been judged. |
| Readable content | Unverified beyond the pictured states | Earlier clipping and crowding findings resolved in final pictured states. Dense real briefs, long messages/amounts and remaining widths/themes require review. |
| Useful hierarchy | Unverified beyond the pictured states | Work now precedes secondary information in the observed queue, brief, drawer and empty Finance states. Populated Finance and urgent mixed work remain open. |
| Appropriate density | Unverified beyond the pictured states | Optional filters/stages/details reduce repeated chrome; essential cash/approval warnings retained. Expanded forms and realistic heavy workloads remain open. |
| Coherent visual design | Unverified | Independent review found no other material defect demonstrated by its final ten screenshots; the final forecast width correction is now pictured, while other shared consumers require current evidence. |
| Responsive interaction | Unverified | Pilot screenshots cover selected 320/390/768/1440 states; earlier 1280 Brief evidence predates header changes. All required widths, sidebars, expanded forms and floating controls are not yet covered. |
| Accessibility | Unverified | Named native selectors, keyboard disclosure and task close-focus behavior have bounded evidence. Four actual computed-style forecast samples pass ordinary-text contrast (light warning/button 12.63/10.30; dark warning/button 15.06/4.96), recorded in `contrast-samples.json`. Full keyboard order, remaining text/control contrast, reduced motion and genuine 200% scaling remain open. |
| Complete workflow | Unverified | Navigation, read/draft retention/discard and normal refresh passed the observed cases. No business save/submission/result verification or uncertain-write journey was exercised. |
| Role and business correctness | Unverified | Existing command/freshness logic is preserved and focused tests passed. Current actual browser coverage is the ALLOWED administrator fixture; ordinary staff, manager/reviewer, read-only and combined-role renderings remain open. |
| Honest data and failures | Unverified | Empty and unknown balance remain distinct, planned/not-started copy is corrected, draft retention observed. Current-source loading/stale/denied/outage/uncertainty matrix remains incomplete. |

Technical verification supports implementation, not these missing UI gates: **213 cases in nine final pilot suites**, plus **70 unique Finance cases in four suites** (283 distinct cases, not the sum of overlapping reruns); direct frontend `tsgo` passed; typed lint and `oxfmt --check` passed on63 changed frontend files; production Vite build passed. The final Forecast CSS-only correction received an additional scoped typed-lint pass and fresh screenshots. Logs: `final-pilot-tests.log`, `typecheck-final.log`, `lint-final.log`, `build-final.log`, `/tmp/otogrow-finance-design-tests.log` and `/tmp/otogrow-finance-design-review-tests.log`. Root coordinates any checks affected by later source changes.

### Shared-header consumer invalidation

Source search found these seven direct consumers of `D/DeliveryPageHeader.tsx`. Each changed composition is **Needs recheck** unless the exact state is described above; even those pictured exceptions remain In progress for their full matrix. Existing functional acceptance is preserved, but no earlier visual acceptance automatically transfers to the new header. Child dialogs/forms inherit the containing-layout recheck requirement.

| Direct consumer | Affected manifest surfaces / containing paths | Current coverage |
| --- | --- | --- |
| `D/tasks/DeliveryTasksPage.tsx` | DAY-01–04, PLAN-01–05, REV-01–05, TASK-01–14 and related navigation | Bounded Today/drawer/selector evidence above; every other composition Needs recheck. |
| `D/operations-pages/DeliveryOperationalPage.tsx` | Canonical Clients/commitments CLI-01–03/09; Creative CRE-01–16 and LEARN-01–05; MSG-01–06 and MSG-10 descendants; CONTENT-01–10; COMP-01–04; DEV-01–05; SEO-01–05; ORG-05–10; ACT-01–06 | Only the stated Creative queue/Brief/navigation cases observed; all other consumers and child states Needs recheck. This includes `M/otogrow-activity/OtogrowActivityPage.tsx`, not just components inside D/. |
| `D/DeliveryWorkspacePage.tsx` | FIN-01–26; OPS-01–13; ORG-01–04; AI-08/09; LEG-01–10, including Clients agreements/task-selected branches and nested task panels | Only the bounded cash/unknown forecast/draft cases observed; other Finance, legacy and operational compositions Needs recheck. Use the dispatcher reconciliation above for enabled branches. |
| `D/onboarding/DeliveryClientSetupPage.tsx` | CLI-10 and its setup states | Needs recheck. |
| `D/advertising/workbench/DeliveryAdvertisingPage.tsx` | ADS-01–10 and associated workbench forms/details | Needs recheck. |
| `D/assistants/DeliveryAssistantsPage.tsx` | AI-01–06 and child configuration/run states | Needs recheck. |
| `D/creative/atlas/AtlasMediaPage.tsx` | AI-10–14 in the media administration route | Needs recheck; generation inside Creative also inherits its containing stage recheck. |

The mobile title selector is supplied only by TasksPage, OperationalPage and WorkspacePage. Other consumers still inherit header spacing/typography/actions. `DeliveryTaskSummaryList`, `DeliveryTaskDetail`, `DeliveryTaskJourney`, Finance styles and Creative stage/form styles also affect their sibling surfaces even when a header is absent; these remaining states keep Needs recheck. This mapping is a propagation requirement, not proof every reachable child has been enumerated.

### Prioritized next checks

1. Completed coordinator closeout for this iteration: fingerprint/evidence registration, temporary preference restoration and corrected forecast desktop/phone evidence. Retain the earlier failed screenshots as historical evidence; this does not close the full pilot matrix.
2. Complete the pilot matrix using safe realistic dense Finance and mixed urgent/assigned/review tasks, ordinary staff and manager/reviewer/read-only roles. Separate genuine business saves/submissions and uncertain outcomes from the completed read/draft-only fixture.
3. Verify complete keyboard/focus paths, measured light/dark contrast, reduced motion and actual 200% scaling in a supported browser. Finish missing current-width/theme/state combinations; a small viewport is not zoom evidence.
4. Recheck all seven shared-header consumer families and their meaningful child states before accepting the pattern globally. Reconcile actual navigation against all354 source entries and split discovery families/grouped forms where needed.
5. Continue Stage2 planning/production/approval/handoff surfaces, then the remaining approved groups, retaining explicit provider prerequisites and production/staff acceptance. No new page-by-page user approval is needed.

## Inventory activity

- 2026-11-06: read roadmap, Phase 1, mandatory business/workflow/design review and approved-loop proposal. Source-mapped delivery navigation/dispatcher, main nested surfaces, public/native families and settings declarations. Added acceptance profiles and honest unverified defaults. No product/runtime changes or completion claims. The bounded inventory decision is to track meaningful jobs and branch dependencies rather than count component files or sidebar links as accepted pages; runtime discovery remains explicit so the manifest cannot hide unvisited settings/native children.

- 2026-11-06: coordinator-reported first pilot implementation and repeated independent critique recorded above. Source inventory remains354 entries; full local design acceptances remain0. Exact fixture cleanup passed. Shared-header consumers are explicitly Needs recheck and the remaining full matrix is retained.

## 2026-11-06 second batch — planning and Approvals

**Status: In progress / QA; no full-surface acceptance.** Stage 2 has started. This override records bounded current evidence for PLAN-01–05 and REV-01–05; it does not replace unverified role/state/accessibility cases. Counts remain 354 source entries including aliases/discovery families, with runtime reconciliation open. Whole improvements remain 26 Local complete / 15 Partial / 5 In progress (20 unfinished).

**Design and business decision:** Amna needs dated workload and exact assignment explanations, not seven repeated day cards or a heatmap implying spare capacity from unknown inputs. The roster now uses labelled work/availability rows, visible incomplete/overload signals and optional secondary breakdowns. Generation waiting remains distinct from working effort. Approvals presents the exact pending work, age, action and owner before optional filters/details; blocking warnings remain expanded. Empty, filtered-empty and later-page-empty states retain different recovery. The review header no longer offers unrelated task creation. Independent approval, availability calculations, current access and exact submission identity remain unchanged. Source changes: capacity/read components and new styles, review queue/styles, TasksPage; a final presentation correction in DeliveryTaskReview distinguishes ordinary loading from access failure without changing authority or retention.

| Surface | Actual current evidence | Still open |
| --- | --- | --- |
| PLAN-01/02 | Populated 65-task list/board at390px; scoped count distinguishes page tasks from selection totals. `planner-populated-list-390.png`, `planner-populated-board-390.png`. | All role/filter/keyboard/viewport cases; board column scrolling is not whole-page overflow acceptance. |
| PLAN-03 | 57-member roster paged25+25+7, collapsed/expanded desktop1440 and phone390, visible overload/unknown/incomplete signals. `workload-populated-pass1-1440.png`, `workload-populated-expanded-pass1-1440.png`, `workload-populated-expanded-pass1-390.png`, `workload-day-pass1-390.png`. | Other effective roles, full invalid/source-loss cases, both themes and full responsive/accessibility matrix. |
| PLAN-04 | 55 reservations paged25+25+5, final page without Next and First-page return, exact member/day scope and readable assignment facts. `capacity-assignments-pass1-390.png`, `capacity-assignment-rows-390.png`. | Every bucket/access/return/recovery variant. Reservation counts are not unique task counts. |
| PLAN-05 | Keep editing retained480; owned synthetic availability saved from240 to480 and persisted on reload; displayed minimum overload changed from2880 to2640 minutes. `availability-saved-390.png`. | Stale/outage/uncertain writes and complete role/keyboard cases. |
| REV-01 | 55 pending submissions paged25+25+5; unknown age retained; exact A+B selection persisted across pages. After decisions, stale cursor withheld obsolete results; keyboard First approval page recovered53 pending with both selected identities retained. `reviews-populated-pass1-1440.png`, `reviews-populated-pass1-390.png`, `reviews-row-pass1-390.png`, `reviews-final-recovered-390.png`. | Full filters/roles/denial/outage matrix; pointer recovery click did not navigate in this IAB run, while Enter did. No pointer pass or speculative product fix is claimed. |
| REV-02/03 | Guided1of2→2of2 required separate decisions. A required check enabled approval; saved result is Approved—client delivery needed, not fulfilled. B feedback Keep editing retained exact text; Request changes produced round1, no-charge default and immutable reviewer feedback, all present after reload. `review-approved-delivery-needed-1440.png`, `review-approved-final-390.png`, `review-revisions-needed-320.png`. | Separate reviewer/staff roles, self-review denial in browser, all failure/uncertain decision cases, complete keyboard/contrast/zoom coverage. |
| REV-04/05 | A synthetic backup handoff changed the next review owner and removed the primary's Approve action; history showed the original primary, reason and actor. Restoring Primary retained client-delivery ownership. B's exact seeded notice became Seen and was explicitly acknowledged. `review-backup-primary-blocked-1440.png`. | Actual backup login/decision, revoked or changing permissions, complete notice/failure cases. |

Evidence directory: `/tmp/otogrow-design-loop-20261106-batch2/`. Baselines end in `before-1440.png`/`before-390.png`. Current screenshots above are administrator synthetic states, not real client work or staff usability testing. Source fingerprint and per-image hashes are in `evidence-index.json`; original failed iterations remain distinct.

**Loop correction:** the actual detail journey briefly displayed “could not be verified” during an ordinary initial query. The presentation now shows a neutral “Checking submission review access…” status while loading; known read errors or denial retain priority and hide authority. The coordinator observed the new text in the browser accessibility tree before the verified owner appeared. `review-access-loading-390.png` captures the upper drawer, so it does not itself show or visually prove that lower status. Four added behavior cases cover pending permission/query reads transitioning to verified data and error/denial priority. The independent reviewer found no source regression; final approved390, revisions320 and backup1440 states were readable. These findings do not imply the untested matrix passed.

**Validation:** 94 distinct focused cases in four suites (58 queue/task-page +16 capacity +20 detail-review) passed. Direct final frontend types, typed lint/format for the ten scoped frontend files and fixture formatting/syntax checks passed. Production-build results are in `build.log` and the final loading-fix rebuild in `build-final.log`; final coordinator checkpoint records its result. Independent records: `/tmp/otogrow-batch2-qa.md`, `/tmp/otogrow-planning-design-20261106.md`, `/tmp/otogrow-approval-design-20261106.md`.

**Fixture ownership and limits:** the older capacity helper cleaned its owned rows and passed its documented original native/core/finance/access/bot/routing/notices/outbox checks (`capacity-fixture-cleanup.log`), preserving ordinary authentication lifecycle. It did not establish the stronger full-schema/cache proof. Receipt: `/tmp/otogrow-capacity-reads-ui-fixture.json.fdcd99f7-bc7e-420d-ad4f-d388ac4193bc.cleaned.json`.

The first reviews fixture had an invalid synthetic backup native identity, so exact review was blocked. Its legacy cleanup passed, but the separate full-Operations check failed: synthetic notice creation advanced `updatedAt` and the helper had not captured it. All201 scoped tables and schema matched; state excluding the old heartbeat exception matched. The original timestamp was never guessed/restored. Preserve `reviews-preservation-verify-pass1.log` and `/tmp/otogrow-batch2-reviews-preservation-diagnosis.md` as the bounded failed attempt.

The corrected v2 helper adds only an owned synthetic-backup role target using an existing eligible non-admin role; it journals exact native cache bytes/absolute expiry and restores the full Operations row only after verifying every non-owned field/state. Product access guards were untouched. Independent review and injected create-after-cache / cleanup-after-commit recovery passed. Final real A/B browser journey cleaned successfully: `/tmp/otogrow-reviews-ui-fixture.json.51ea17a4-a438-483a-a2ba-4055c8237207.cleaned.json`. The fresh outer guard independently passed all201 scoped tables (199 exact plus2 bounded current-authentication lifecycle), full schema and full Operations row: `/tmp/otogrow-batch2-reviews-final-preservation.json.verified-1793910812680.json`. Four cache values were restored by the fixture. This is scoped preservation, not a certificate for unrelated/global data. No real messages, provider requests, delivery/fulfilment or schedules were triggered.

**Remaining work:** populated Finance is still unverified; its bounded setup was prepared but not run. Full themes, actual200% browser zoom, measured contrast, complete keyboard/focus, distinct effective roles, uncertain writes and the remaining pages stay open. Original pilot evidence carries forward only where dependencies are unchanged; task-detail responsibility states were recaptured after the loading correction. No new approval gate is needed.

**Final coordinator checkpoint:** final production build exited0 (`build-final.log`,49.02s), final direct types and extra loading-file lint/format passed. The73 changed frontend source/test files are bound in `evidence-index.json` to fingerprint `60879e4c882cb1e3b6e334fa89ecc82176224e7b6be53855194ece0052053b7c`; this includes preserved earlier work, not73 new batch files. The index hashes27 screenshots and the repaired fixture source. Normal API restarted without the schedule-disabling QA preload; no worker was started. Temporary viewport override reset, existing System appearance unchanged, normal Today route loaded and captured in `local-preview-restored.png`. No active batch fixture remains. No commit, push or deployment occurred in this design batch.


## 2026-11-18 — ORG-11 bounded performance acceptance

**Status: Locally accepted bounded slice; full surface matrix remains open.** This does not close IMP-06, change whole-item counts or accept production. Related implementation dependencies are IMP-21 finance, IMP-22 founder reporting and IMP-37 typed task-free reads.

- Reviewed current source against the user job: founder enters existing client/team/finance evidence, selects month/timezone/currency, reads company trends, scans client/employee measures and opens existing sources. No writes are part of the surface.
- Independent review initially returned Needs work for restricted-finance empty claims, revenue-labelled cost contamination, unclear current-assignee history and distant profitability limitations. Corrected code and fresh evidence passed re-review with no new blocker.
- Pass evidence for understandable purpose, readable content, useful hierarchy, appropriate bounded density, coherent shared design, 390/320px reflow and complete read/source journey: `.playwright-mcp/founder-performance/desktop-top-light.png`, `desktop-light.png`, `desktop-dark.png`, `mobile-390-light.png`, `mobile-client-390-light.png`, `mobile-390-dark.png`, `mobile-320-dark.png`. Mobile filter disclosure and empty-month navigation were exercised, not only captured.
- Honest data/failure and role checks are covered by 15 backend and 23 frontend cases plus real GraphQL/PostgreSQL and browser evidence. Current finance/admin authority, restricted states, unknown rates, drafts, invalid sources and currency separation remain explicit.
- Unverified/open: actual 200% browser scaling, measured contrast, keyboard-only full traversal, dense/multi-currency visual fixtures, every effective-role rendering and real staff usability. Existing floating mobile navigation remains visible in captures; content is scrollable and no horizontal overflow was measured, but full accessibility acceptance is not inferred.
- The aggregate frontend run retains an unrelated client-share draft failure recorded in IMP tracker. The affected alert/performance/founder suites passed after correction. No deployment, staff acceptance or whole-surface closure is claimed.
