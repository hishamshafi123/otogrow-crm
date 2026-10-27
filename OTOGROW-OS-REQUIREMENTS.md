# Otogrow OS requirements

These requirements consolidate the user's discovery answers. Phase plans define when they are built. Suggestions and unresolved details below are not settled user decisions.

## Business and ownership

- Otogrow is a martech agency delivering AI video, static creative, performance marketing, SEO, websites, SaaS/custom software and mobile apps. Clipping is outside the initial scope.
- The founder handles acquisition, sales, closing and client relationships. Amna leads delivery, strategy and approvals.
- Founder is admin; Amna is secondary admin with access to all company data, including finances. Employees receive role/client-specific access. Initial roles: project manager, editor, performance marketer, SEO specialist or combined role, static-ad designer. Two developers also work in the company.
- Roles, assignments, services, packages, schedules, social accounts, competitors and agents must be configurable. Internal content responsibilities are not yet assigned.
- Priority: delivery/task management, team management, approvals, task-specific dynamic agents and creative assistance.
- Redesign for clarity: restrained raised cards, readable hierarchy, clear owners and next actions, visible progress and fewer competing controls.

## Meeting knowledge — discovery update 2026-10-26

- Add a Fathom/recording link and/or paste meeting transcripts or notes into the brand knowledge library after each meeting.
- Agents working on that brand should receive the latest approved meeting decisions and use them when proposing task, brief and plan updates. Keep the meeting source and version traceable.
- Preserve the distinction between original evidence, draft interpretation and published knowledge. Do not turn transcript text into authority to change permissions, spend money, communicate externally or bypass final approval.
- The first implementation is explicitly project-scoped: authorized contributors save notes, managers publish reviewed knowledge, and the existing task assistants receive bounded approved context. Cross-project brand sharing must be configured deliberately.
- Automatic Fathom import, recording transcription, AI extraction of decisions and broader task/plan automation remain separate pending capabilities. Storing a link alone does not mean its transcript was retrieved.

## Dynamic roles and person-level activity — discovery update 2026-10-25

Confirmed user requirements:

- The founder can create and change roles dynamically, inspect what each role can see and do, and assign those roles to people. Job titles must not be hard-coded permission categories.
- Show a person-level activity log so the founder can inspect who did what across the OS.
- Allow AI analysis of the recorded activity, including summaries and questions about who performed particular actions.
- These additions belong to the approved improvement work tracked in `OTOGROW-OS-IMPROVEMENTS.md` (39, 43 and 44). They remain requirements until their acceptance checks pass.

Proposed behavior to refine in the approved plan:

- Provide an understandable permission matrix covering visible areas and actions such as view, create, edit, assign, submit, review, approve, export, communicate with clients, run agents and manage models. Separately show client/project/conversation scope and any sensitive-field restrictions.
- Offer editable starter roles for existing jobs, plus a read-only access preview for a role and an individual person's effective permissions. Show why access is granted or denied, including inherited rules and exceptions.
- Reuse Twenty's existing role/permission infrastructure where appropriate. Apply the same rules in the sidebar, individual controls, APIs, files, search, background work and AI retrieval; hiding a menu alone is insufficient.
- Preserve the founder and Amna's agreed company-wide access, explicit inbox grants, and independent final approval. A custom role does not permit an assignee to approve their own final deliverable. Protect against accidentally removing the last administrator's access.
- Record meaningful work actions with actor, timestamp/timezone, affected client/project/task, action, outcome, and relevant before/after changes. Distinguish the human initiator, executing AI agent or integration, and human approver. Include role/access changes, assignments, submissions, revisions, approvals, client-message sends, budget requests/application evidence, financial changes and agent runs.
- Support filters by person, date, client/project, action and outcome, with links to the underlying records. Preserve historical actor identity when staff leave and do not let ordinary edits rewrite audit history. Exclude secrets and unnecessary private content from log payloads.
- AI summaries must cite the underlying events and respect the requesting person's permissions. Separate observed actions from explanations or hypotheses; missing integration data means unknown activity, not inactivity. Do not infer time worked or productivity solely from clicks, presence or log volume.
- Example questions: "What did this editor complete this week?", "Who changed this assignment or advertising budget request?", "Which deliverables are waiting for Amna's review?", and "Where did work spend the most time waiting?" Reuse configured AI funding and spending controls; no additional paid access is authorized by this requirement.

### Additional confirmed access rules — 2026-10-25

- A person may hold multiple roles at the same time. Show the combined effective access and which role grants each permission.
- Phone access is a distinct capability, including the dialer and calling APIs. Default grants belong only to Sales, Setter, Admin (founder) and Secondary Admin (Amna). Other roles, including Marketing by itself, do not grant phone access.
- A person with an eligible additional role can use the phone; removing the final role that grants it removes access. Existing project/client scopes still apply and an assignee still cannot approve their own final work.
- Implement these rules through real permissions, not editable job-title text or hiding the phone button. Role changes and call actions belong in the activity log.

## Delivery and team work

- Amna plans and adjusts daily/weekly assignments across roles, with instructions such as music, references and general notes.
- Employees need a daily list, planned work, progress bars and a completion celebration after approval. Respect reduced-motion preferences.
- Editors may approve intermediate images/clips, and escalate to the project manager; they cannot approve their own final deliverable.
- AI should review work against the brief before project-manager review. Final human approval remains required.
- Show revision numbers and request/history; unlimited revisions are allowed. Optional revision charges default to zero.
- Work is fulfilled after delivery without an outstanding client objection and project-manager confirmation, not merely after production approval.
- Ask the project manager 12 hours after delivery: Fulfilled, Not fulfilled, or Redoing. Not fulfilled repeats the question every 12 hours. Redoing returns work to revision; the proposed restart point is revised approval and delivery, followed by another 12-hour check.
- Telegram reminders operate 24/7: one ping after five minutes of an unattended message or assignment, without repeated reminders. Task opening marks only the actual assignee's assignment seen; addressed task notes retain recipient-specific seen/acknowledgment state.
- The OS includes internal Team chat, initially direct teammate conversations. A message is viewed only when it is visibly displayed in the recipient's focused window; opening a conversation must not clear hidden messages. Unviewed messages become eligible for a single Telegram ping after five minutes, dispatched on the next scheduler pass. Bot configuration, linked recipients and a running messaging worker are required.
- Founder Telegram alerts cover unhappy clients, late work, budget overruns, contract changes and poor campaign performance. Thresholds still need definition.
- Native boards and progress tracking; no Jira integration planned. Specialist development features need later discovery.

## Creative production

- Two goals: direct-response ads for sales/leads, and organic brand content for look, feel and positioning.
- Research includes customer pain points, reviews, communities and competitors; derive angles, concepts and video ideas.
- Editors propose references; Amna approves individually or in batches. Track production against approved batches; adapted reuse is allowed.
- There is no standardized brief today; introduce editable briefs and a reference library with links, summaries and tags.
- Typical process: reference shot screenshots, adapt subject/product/location/grade, generate images, animate shots, edit and submit.
- Current reported capacity: about six completed unique videos per editor per day, excluding variants. This is a user estimate, not a target guarantee.
- Client inputs: logo, guidelines, website and sometimes idea documents/sheets; collect required assets through forms.
- Current image tool described as Flow/Nano Banana Pro; video tools described as Veo and Seedance. Confirm exact models/providers during integration planning.
- Allow admin-controlled model/provider access and switching; evaluate affordable alternatives. Provider mentioned in dictation is unconfirmed.
- Failed outputs may require prompt edits, new candidates, or changed reference images/videos. Retain versions and support partial retries.
- Quality: realism, camera quality, no distortion, correct product details, physically sensible objects and speech-ready faces/teeth for UGC.
- Offer asset export and AI-assisted final editing. Keep image, clip and final-edit review stages.
- Usually two or three hooks and two or three CTA variants; combine approved components into suitable versions.

## Client communication and commercial arrangements

- Dynamic one-time engagements and retainers with configurable budgets, scope and deliverables; no fixed packages assumed.
- Agreements via email; payment channels described as Wise, Stripe and PayPal. Exact accounts/integration access not yet confirmed.
- Inbox: email, Slack and selected WhatsApp groups only. Founder sees client communication and grants staff access; authorized staff can send through the OS.
- Founder-private versus shared inbox boundaries remain to be defined.
- Shareable concept/strategy review pages support client comments and approval.
- Performance-marketing clients alone see advertising-budget controls. Clients with multiple services get the relevant sections.
- Requested ad budget change notifies the project manager, who can escalate to founder. Marketer applies it in Meta and records confirmation; project manager verifies. No automatic live ad-budget mutation requested.
- Retainer edits are separate commercial administration, without the ad-budget notification flow.

## SEO and advertising

- SEO tasks are dynamic: one-time, daily, weekly or monthly; move task tracking out of Google Sheets into Otogrow.
- Specialist submits work/evidence and weekly/monthly reports. Agent checks evidence (for example backlink presence on submitted pages). Amna approves.
- Verification must distinguish verified, issue found and unable to verify. Link existence does not prove indexing or ranking impact.
- Three current performance-marketing clients, two SEO clients, per user. Meta active; X and ChatGPT ads are future integration candidates, subject to verified availability.
- Goals: purchases, qualified leads, sales, webinar registrations and booked calls. Shopify is a primary sales-outcome source.
- Daily ad reports identify performance, successful/unsuccessful creative and excessive spending. Project manager reviews/approves before distribution to account marketer.
- Recommendations can be edited or revised, then explicitly assigned to named people or agents. Human team takes advertising actions unless a future agent's authority is explicitly configured.
- Preserve source attribution differences between ad-platform claims and actual commerce outcomes.

## Finance

- Founder and Amna can enter expenses and confirm payments; both can see all company information.
- Employees have monthly pay. Allocation of salaries/shared costs to clients remains to be designed.
- Track receivables, upcoming payments, expenses, cash, client margins/profit, total margins, burn, runway, spending trends and growth.
- Company registered in UAE, customers outside UAE per user; make no tax-exemption assumptions. Accountant must confirm accounting/export requirements.
- Keep transaction evidence and export/synchronize with Zoho or another accounting platform. Exact Zoho product, currencies and export mapping unresolved.
- Distinguish agency money from client-paid advertising spend.

## Internal growth and competitors

- Internal content ownership assigned later, possibly to multiple people per responsibility.
- Initial desired channels: X, Instagram with Facebook posting, TikTok; account/channel choices remain dynamic.
- Competitor monitoring initially for Otogrow. Add/store competitor page/account links dynamically. Client-specific monitoring remains a future requirement.
- Findings should surface new strategies, ads and video ideas that can inspire adapted work, with sources and actionable suggestions. Strategy interpretations must be distinguished from observed posts/ads.
- Verify publishing APIs and competitor-data access; do not assume complete platform coverage or WhatsApp group support.

## AI execution and funding

- Configure task-specific agents later with dynamic instructions, capabilities, permissions, ownership, allowed tools and spending controls.
- Preserve task context, submitted evidence, outputs, human review and execution history.
- Founder requests one ChatGPT Pro connection for all employees. This remains an eligibility question, not an approved or verified funding architecture. Do not silently activate paid API fallback.
- Assess existing Twenty AI capabilities before adding another orchestration platform. Paperclip and FounderOS are candidates, not commitments.

## Outstanding discovery

- Exact model/provider tools, credentials and permitted APIs; video editing/storage choices.
- Reminder stop condition, inbox privacy boundaries, client feedback/objection windows and escalation thresholds.
- Staffing roster, accounting product/currencies, salary allocation and developer release workflow.
- AI funding eligibility and client-account permissions for integrations.
- Social posting approval/ownership and monitoring cadence, chosen dynamically when those phases are planned.

## Current implementation authorization

The user has now requested a complete tracked list of all criticisms and implementation of every improvement to make the current system easier to use. This supersedes the redesign review's earlier planning-approval pause. Plan, implement and verify in manageable batches, using `OTOGROW-OS-IMPROVEMENTS.md` as the source of completion status. Preserve unfinished original roadmap scope, the existing spending limit and external-action boundaries. Do not mark dynamic roles, audit history or AI analysis implemented until their acceptance checks pass.
