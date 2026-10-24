# Otogrow OS Phase 2 configurable delivery agents

Status: approved with "approve"; implementation and local verification completed, live model acceptance pending. Phase 2 remains open until a supported provider connection and an authorized live check are available.

## Outcome

Amna can configure an assistant for a specific job, run it against a permitted delivery task, inspect its evidence and result, and decide what happens next. Employees can use the agents enabled for their work. Every agent run has a responsible human and a visible status.

Phase 1 supplies projects, human assignments, briefs, evidence, revisions and review decisions. Phase 2 connects useful AI work to that delivery workflow. Media generation and shot production remain Phase 3.

## Proposed screens

1. Agent library: enabled agents, their purpose, allowed projects, allowed roles and available models. Admins can create, edit, disable and duplicate an agent.
2. Agent configuration: instructions, required inputs, output format, approved tools, provider/model choice, run limits and whether a human must confirm a proposed action. Configuration changes create a version so earlier results remain explainable.
3. Task assistance: choose an enabled agent, preview the context it will receive, start the run and inspect its findings alongside the brief and submission history.
4. Run history: queued, running, waiting for human review, succeeded, failed or cancelled; input/version, output, tool activity, timestamps and available usage/cost information. Failed or cancelled runs cannot appear as completed delivery work.

Use the Phase 1 card and drawer design. Keep configuration details out of the employee's normal task flow.

## First useful agents

| Agent | Input | Result | Human decision |
| --- | --- | --- | --- |
| Brief checker | Brief, service, checklist and supplied brand requirements | Missing requirements, contradictions and suggested questions | Amna accepts or edits suggested changes |
| Copy and submission checker | Submitted copy, task brief and accessible evidence | Findings with severity, evidence and suggested corrections | Employee revises; assigned manager retains approval |
| SEO evidence verifier | Explicit task requirements and submitted public URLs | Reachability, observed backlink/anchor/destination and what could not be verified | Specialist resolves findings; Amna approves work |

An agent must distinguish observed evidence from suggestions. A text-only run must not claim to have watched a video or verified a visual product detail. Robust frame/video inspection belongs with the media pipeline in Phase 3.

## Authority and configuration

- Founder and secondary admin can configure agent availability and model access. Managers can run enabled agents on work they manage; employees can run permitted assistants within their projects.
- A task retains a human owner and reviewer, even when an agent performs part of the work. Agent execution appears as a separate assignment/run linked to that task.
- Agent access is the intersection of its configured tools, the initiating user's permissions and the task's project scope. Recheck permissions at execution and before applying any result.
- Agents cannot grant access, approve their own output, send client messages, change advertising budgets or move money in this phase.
- Initial outputs are findings and proposed edits. A person explicitly accepts edits or submits the result through the existing review workflow.
- An admin can disable a model/provider or agent. New runs stop being scheduled; cancellation behavior for running jobs is visible and does not imply a provider has refunded a request.
- Treat fetched content as evidence, not as instructions. Restrict public URL fetching, reject private/internal destinations, bound downloads and retain source URLs and inspection times.

## Implementation approach

1. Review the existing agent entities, prompts, role bindings, model catalog, queues and execution tooling before introducing another runtime. Inspect the exact Paperclip and FounderOS projects and their integration/license fit. Record the decision; no replacement of the CRM or automatic installation is assumed.
2. Add delivery-scoped agent configuration and versioned run records using the existing infrastructure where practical. Supply narrowly scoped delivery tools rather than exposing unrestricted CRM CRUD.
3. Implement queued execution, retries, cancellation, idempotency and visible failures. A worker restart must not silently duplicate an accepted edit or submission.
4. Build the agent library/configuration and task-assistance screens, then connect the three starter agents to real inputs and results.
5. Add model allowlists and usage limits. Store provider secrets on the server and keep credentials out of prompts, browser storage and logs.
6. Verify the full manager/employee/agent workflow, record results, and prepare Phase 3 for approval.

A supported provider connection is required for real model execution. Verify the available authentication and billing options before selecting one; a shared personal ChatGPT Pro login is not an assumed implementation mechanism. Do not purchase credits or make paid test runs without the user's authorization. Development fixtures must be labelled and never presented as real agent results.

## Acceptance criteria

- Admin creates an agent, selects an available model and restricts its tools and project access.
- Amna runs a brief checker on a task and sees a persisted result, evidence and configuration version after reload.
- An employee cannot run a disabled agent, choose a disallowed model or access another project's context through a direct API call.
- The SEO verifier checks a supplied test page and accurately distinguishes an observed backlink, a missing backlink and an inaccessible page.
- Copy review identifies a supplied mismatch and lets the user accept or reject a proposed correction.
- Agent output does not count as manager approval or client fulfilment.
- Timeout, provider failure, cancellation and worker retry leave an accurate, inspectable run history.
- Usage limits prevent new runs when reached; unavailable pricing is shown as unknown rather than zero.

## Approval boundary

Approval authorizes this agent foundation and the three starter workflows. Generation providers, social publishing, client inbox sending, finance actions, advertising changes and unattended recurring execution remain in their later phases. Material changes to the chosen architecture or agent authority require a revised proposal.


## Implementation record — 24 October 2026

Implemented in the existing delivery module:

- Agent library and admin configuration with create, duplicate, enable/disable, version checks, project/access-level restrictions, required inputs, output mode, model selection and daily limits.
- Task input preview pinned to task revision and agent version. A changed task or agent requires a fresh preview.
- Brief and copy workflows use the existing server model registry and AI SDK structured output. They pass task text and supplied requirements, not fetched images or video, and have no general-purpose tools.
- SEO verification is a deterministic public-page tool rather than an LLM judgment: exact destination and optional anchor, relative links/document bases, source inspection time, link rel attributes, and destination reachability. It distinguishes inaccessible pages from missing links and makes no indexing claim. It does not render JavaScript.
- Durable agent/run tables, existing AI queue integration, database outbox recovery, single execution claim, bounded generation timeout, cancellation, explicit manual retry as a new run, and interrupted-worker failure states. Running cancellations can still incur provider charges; no refund is implied.
- Findings need human review. Managers can accept a proposed brief; task owners/managers can accept copy as a draft. Explicit rejection leaves work unchanged. Submitted and approved tasks cannot be rewritten. Repeated acceptance cannot duplicate an edit; normal manager approval remains separate.
- Run history stores input/configuration snapshots, versions, activity, decisions and available token usage. Pricing remains unknown rather than using the model registry's default zero values.
- Server checks workspace membership, task/project access, allowed role and model availability at execution and before edits. Public fetches require HTTP(S), prohibit credentials/private literals/nonstandard ports, validate resolved destinations through existing safe agents, revalidate redirects, disable proxies, and bound response size/time.

Code: `packages/twenty-server/src/modules/delivery/agents`, the two new delivery agent entities, and frontend `DeliveryAgents.tsx`, `DeliveryAgentForm.tsx`, and `delivery-agent.types.ts`. Task detail exposes accepted draft copy. `JobsModule` registers the handler for the existing AI queue.

Schema: generated `2-34-instance-command-fast-1792824583893-add-delivery-agents.ts` and generator-maintained registration. Unrelated schema drift was removed from the generated file before application. The local ledger audit found no pending legacy migrations and only this pending fast command. The CLI applied only the two new tables, indexes and workspace foreign keys; no slow commands ran.

## Architecture decision

Keep Twenty as the authenticated system of record and use its existing model registry, permissions and queue. Add delivery-specific configuration/run records because generic agent CRUD authority would be broader than these workflows need.

[Paperclip](https://github.com/paperclipai/paperclip) is an agent orchestration server with goals, governance, budgets and a React interface. It is a useful future coordination reference, but adopting it now would add another task/runtime boundary to reconcile.

[Bennett's FounderOS](https://github.com/Bennettxai/FounderOS) provides founder-oriented departments and connector patterns; its current README describes Next.js/SQLite and one operator password rather than individual team accounts. That does not directly fit Otogrow's client/project-scoped team permissions. Neither project was installed or used as a replacement. Both repositories advertise MIT licensing; no source was copied.

## Verification evidence

- 54 backend tests passed across delivery policy, SEO verification and the existing safe HTTP agent suite; 6 frontend tests passed for agent configuration and task review.
- `scripts/check-delivery-agents.cjs` passed against local PostgreSQL with all fixtures rolled back. It exercises the real AI SDK with explicitly labelled in-memory model responses, persisted results, brief/copy acceptance, rejection, access revocation, disabled models/agents, idempotency, stale revisions, daily limits, provider failure, queued/in-flight cancellation, outbox recovery and interrupted-run failure. The actual job handler also processed a run through a uniquely named Redis test queue, removed afterward. No real model quality claim follows from fixture outputs.
- `scripts/check-delivery-seo.cjs` fetched real HTTP fixture pages through a test-only loopback transport and distinguished observed, missing and inaccessible backlinks. The production transport rejected that loopback URL. A separate production fetch against public `https://example.com/` returned HTML successfully; this was a one-off transport check, not a quality benchmark or monitor.
- Changed delivery source passed type-aware lint with zero warnings/errors. Server compilation and metadata GraphQL code generation passed. Browser verification confirmed the agent library, starter configuration, required project selection and honest unavailable-model state at the existing local delivery route.
- Direct full-project typechecks still report the pre-existing front-component AppPath errors and Meta lead intake DeepPartial errors documented in Phase 1. No delivery-module type errors remained. This is not a repository-wide green build claim.

## Remaining live acceptance and operations

1. Live synthetic brief/copy checks are now verified using the user-supplied Gemini testing key; see the follow-up evidence below. No permanent provider connection is configured in the workspace. Production configuration and ongoing usage authorization remain rollout work.
2. Amna should benchmark real client briefs/copy before wider rollout. The live checks establish two narrow examples, not general creative-strategy quality.
3. Configure real projects and staff, then enable agents for those projects. The local UI currently has no delivery projects; test data was rolled back.
4. Production must run the existing queue worker with `ai-queue` enabled and Redis available. The handler was verified through an isolated Redis queue; a full worker with unrelated Telegram/Meta pollers was not started just for this phase.
5. Local technical acceptance now includes live model checks. Phase 3 may be planned for review; it remains unapproved and unimplemented. Production readiness and business-quality benchmarking are not claimed.

### ChatGPT-plan connection finding

Current [OpenAI documentation](https://developers.openai.com/siwc/token-sharing-open-source) describes eligible open-source/locally hosted apps requesting permission to use a user's ChatGPT plan. The registration is bound to that user and workspace; paid or remotely hosted apps are directed to an interest form. This is an additional integration path, not an SDK switch that makes ordinary API calls use Pro automatically. The reviewed docs do not establish that Otogrow can pool one personal Pro plan across every employee. Eligibility and the intended deployment/account arrangement must be resolved before implementing that authentication path. The current implementation uses Twenty's existing provider registry; it does not implement this OAuth flow.

The user replied "just continue" after the connection question. Continue investigating the preferred ChatGPT-plan path without repeating that choice or silently switching billing paths. Do not ask for secrets in chat.

### Continued connection investigation and hardening

The official [self-hosted VM guide](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) explicitly describes an open-source application running on a remote VM. Remote hosting alone therefore does not rule out this flow. It describes local OAuth, protected credential transfer for the same user/workspace, a stable VM host ID and VM-owned refreshes. This does not establish entitlement for multiple employees to consume one founder's personal subscription.

The [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) require streamed Responses with storage disabled, and exclude `max_output_tokens`, audio/video input and the image-generation tool. This is incompatible with simply substituting a ChatGPT token into the existing non-streaming agent execution, which uses an output-token cap. It also cannot supply the planned image/video generation pipeline.

Implementation decision: retain the working provider-neutral agent foundation. A future ChatGPT connection must be a distinct transport with explicit account/plan identity, eligibility verification, protected OAuth state and token storage, serialized refresh, revocation, streamed structured-result validation and honest usage-limit behavior. It must not expose founder credentials to employees or silently fall back to a billed API. Keep it unavailable until the account and deployment arrangement is supported. No OAuth registration, credential transfer or live inference has occurred.

Continued code review found that results checked task revision before execution and before accepting edits, but not when publishing the result for review. The worker now rejects results if the task changes during generation and checks the current task's project against agent permissions. This prevents a result based on an old brief or project from appearing ready for review. The rollback fixture now pauses generation, changes the task revision, resumes generation and asserts failure with no published result.

Verification of this follow-up: server compilation, the expanded rollback PostgreSQL/Redis fixture and changed-service type-aware lint passed. Formatting was applied. Direct server typechecking still reports only the existing Meta lead intake errors at lines 219 and 489; no delivery errors. No real model calls or deployment.

### Authorized Gemini live acceptance — 24 October 2026

The user supplied a Gemini key explicitly "for your testing". This authorizes the bounded tests below, not permanent shared access or unattended generation. The key was read through hidden terminal input and passed in child-process memory; it was not written to source, environment files or the database. No credential is included in this record.

Google's model-list endpoint accepted the key. Two attempts using listed `gemini-2.5-flash-lite` failed; the diagnostic response reported that it is unavailable to new users and recommended `gemini-3.5-flash-lite`. Three generation requests then completed on that replacement model: one copy check and two brief checks, each capped at 2,048 output tokens with no automatic retries.

- Copy: identified the supplied 50% discount as contradicting the approved 20% offer, and proposed "Get 20% off today." Usage: 177 input / 84 output tokens.
- Initial brief: identified missing audience/channel/CTA but filled them with invented assumptions. This exposed a real quality defect, so the production instructions were tightened to preserve supplied facts and mark missing facts explicitly as `[NEEDS CONFIRMATION: field name]`. Usage: 181 input / 179 output tokens.
- Rechecked brief: preserved 20%, flagged the conflicting 50%, and left audience/channel/CTA as confirmation placeholders. Usage: 230 input / 386 output tokens.

Total reported successful usage: 588 input / 649 output tokens. Monetary cost remains unknown; the failed requests do not establish zero billing. No images or videos were generated.

The live script exercises the actual DeliveryAgentService, Google AI SDK transport and structured-output schema, using a test registry and direct worker execution. PostgreSQL records reached WAITING_REVIEW, accepted edits persisted, and task delivery state stayed PLANNED. All synthetic records were rolled back. This verifies the service path, not a permanently configured registry, production queue deployment or Amna's real-client acceptance.

`scripts/check-delivery-agents.cjs --live` now provides an explicit opt-in test path using `DELIVERY_TEST_GEMINI_KEY`; default execution still uses fixtures only. `--brief-only` bounds a targeted recheck. Missing keys fail before opening the database. The default fixture suite passed after adding live mode. Server compilation and changed-service lint passed after the prompt correction.

Phase 2 local technical implementation and live synthetic acceptance are complete. Operational prerequisites above remain visible for rollout; Phase 3 planning can proceed without claiming the OS is deployed or all real-world output is verified.
