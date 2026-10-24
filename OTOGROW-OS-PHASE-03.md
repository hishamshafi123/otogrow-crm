# Phase 3 proposal — creative production workspace

Status: approved for implementation by the user replying "approve". Implemented and locally verified, including bounded live image/video acceptance. Production rollout remains separate. The user subsequently authorized a maximum USD 2 for live acceptance testing; this does not authorize a permanent paid connection or larger spend.

## Outcome

An editor can take an Amna-approved concept from reference to shots, approved images, clips and a final submission inside one clear workspace. Amna can see what is blocked, review batches and approve final deliverables. Existing delivery tasks remain the source of ownership, dates and final approval.

## Scope

1. **Reference library.** Store links, uploaded reference assets, summaries, brand/project, tags, angle and approval history. Editors propose references; Amna approves individually or in batches. A link without accessible content is labelled as uninspected. Reuse creates a new production item linked to its reference, preserving the original.
2. **Structured briefs.** Editable objective (ads or organic), audience, pain point, angle, concept, product facts, mandatory claims/disclaimers, visual direction, format/duration, hook, CTA, music notes and linked brand assets. Unknown facts remain unresolved. Version the approved brief; significant changes invalidate affected production approvals rather than silently changing their basis.
3. **Shot board.** Ordered shots with reference screenshots, image prompt, animation prompt, duration, product/subject/location details, notes and versions. Show each shot's next action and failed attempts. Retry one shot or replace its reference without regenerating approved work.
4. **Media review.** Editor accepts intermediate images/clips or escalates to Amna. Check realism, product fidelity, anatomy/teeth when relevant and physical plausibility. Record review against a specific asset version. Final edits always return to manager approval; an editor cannot approve their own final video.
5. **Provider controls.** Reuse server-side model access concepts, but distinguish text, image and video capabilities. Admin enables supported providers/models by role/project. Each generation requires an explicit request showing inputs and available estimated cost, with per-run and daily limits. Unknown pricing is labelled and bounded by run limits. Store provider job IDs; retry polling without resubmitting a paid generation. Cancellation does not imply refund.
6. **Manual and assisted production.** Upload externally produced images/clips/final edits and export approved assets plus a shot manifest. Add one image adapter and one video adapter only after verifying API access, permitted use, output handling and credentials. Gemini text testing does not establish access to Flow, Nano Banana, Veo or Seedance. Unsupported choices remain unavailable. No browser automation of consumer generation accounts is assumed.
7. **Hooks and CTAs.** Store approved base video, 2–3 hook options and 2–3 CTA options as separate components. Build an explicit variant matrix, count unique concepts separately from variants, and select which combinations to render/export. Preserve lineage and revision numbers. Optional revision charge defaults to zero; financial posting belongs to the finance phase.
8. **Editing assistance and quality checks.** Start with an editable assembly plan for approved clips, text, audio and selected variants, plus export for external editing. Offer bounded automatic assembly where the chosen renderer supports it; this is not a full nonlinear editor. Media-aware AI checks must cite the inspected frames/text and state coverage limitations. Human review remains mandatory.

## Screens and workflow

- Creative overview: restrained cards for concepts, shots needing work, review requests and final submissions; owner, deadline and blocker visible.
- Production detail: Brief → References → Shots → Edit/Variants → Final review, with only the relevant stage controls prominent.
- Shot drawer: reference, prompt, candidate versions and approval side by side; failed generations show a reason and an explicit retry action.
- Amna's review queue: batch reference approval, escalated intermediate reviews and final edits. Batch approval acts on explicitly selected versions only.
- Existing My Work links directly to the next production action. Progress distinguishes completed production from manager approval.

Client shareable strategy pages remain in Phase 5 with portal permissions. Automated competitor collection remains in Phase 8; references can be added manually now.

## Architecture and permissions

Extend the existing delivery module with creative records linked to task/project, versioned briefs, references, shots, assets, generation attempts, reviews and variant compositions. Use generated migrations and existing queues; every external generation has one durable request identity.

Reuse the existing file-storage infrastructure where appropriate. The inspected generic file-by-ID route verifies a workspace/file bearer token, not current delivery-project membership. Creative assets therefore need delivery-scoped authorization for upload, attachment, download and preview. Do not treat a generic workspace token as sufficient client/project isolation. Define download expiry, revocation behavior, size/type limits and orphan cleanup before enabling media uploads.

Provider requests use only selected project assets. Recheck access before dispatch and result publication; retain the brief/model/prompt versions. Secrets stay server-side. Validate provider callback signatures or poll authenticated job status; never trust a callback's workspace/task identifiers without the saved job mapping. Block unsafe remote fetches and limit downloads.

## Implementation order within this phase

1. Creative data model, scoped asset handling and manual reference/brief/shot workflow.
2. Intermediate approvals, manager review, version invalidation and batch visibility.
3. Verified provider adapters and durable generation jobs, with manual workflow usable while connections are unavailable.
4. Variant planning, export, bounded assembly and evidence-based review assistance.
5. Behavioral tests and browser checks, then a separately authorized, bounded image/video acceptance run before declaring generation verified.

Do not present missing provider integrations as complete merely because the manual path works. Record an explicit integration blocker if the intended provider cannot be accessed.

## Acceptance

- Editor proposes references; Amna approves a selected batch; each approved concept tracks its own production progress.
- Approved brief produces an ordered shot plan; missing facts remain visible.
- Intermediate assets can be accepted or escalated; replacing an image invalidates dependent clip/final approvals without deleting history.
- One failed generation retries independently; duplicate requests/restarted workers do not silently generate twice.
- Revoked project membership prevents direct asset and generation access, including guessed IDs.
- Admin disabling a model prevents new runs and shows what happens to already submitted provider jobs.
- Upload/export/manual editing works without any generation credentials.
- Variants retain base/hook/CTA lineage and do not inflate the unique-video count.
- Final work requires manager approval; accepted AI findings never constitute delivery approval or fulfilment.
- A connected image/video adapter passes a bounded real test, with provider usage and failures recorded honestly. Unsupported providers are clearly unavailable.
- Desktop and narrow-screen workflows remain readable, with keyboard access and reduced-motion support.

## Approval boundary

Approve this phase to implement the creative workspace and its bounded integration work. It does not authorize purchases, bulk generation, deployment, client messages or social posting. The Gemini key supplied for Phase 2 testing is not a permanent media-generation connection. Confirm a concrete model, sample and spending limit before paid media acceptance testing.


## Implementation record — 2026-10-24

Implemented the Creative studio and task production tabs: structured/versioned briefs, manager-approved reference batches, ordered/versioned shots, authenticated uploads/previews/downloads, intermediate approval and escalation, final submission through the existing manager review flow, revision reopening with optional charge defaulting to zero, hook/base/CTA combinations, assembly planning and manifest export. Previous versions remain visible. Changes invalidate dependent approvals and final selections.

Creative records extend the existing delivery task JSON document; this phase adds no database entity or schema migration. Files use the existing storage driver with delivery-project authorization on every request, a pending/ready lifecycle, bounded MIME-validated uploads and cleanup of abandoned pending files. Revoked membership blocks downloads. Export provides a manifest and individual asset downloads, not a ZIP archive.

Generation uses the existing queue with durable request identities and persisted run state. Duplicate dispatch does not repeat a claimed provider request; lost in-flight work is reported as failed with uncertain usage, not silently retried. Permissions, model availability and input versions are rechecked before dispatch and publication. Settings and daily limits are per production task, with workspace model restrictions also applied; these are run-count limits, not a monetary budget ledger.

Google image and video adapters and multimodal still-image inspection are implemented. Video targets Gemini Omni 1.1 Flash through Interactions; current Google documentation reports the older Veo 3.1 preview endpoints retired. No Seedance provider, consumer Flow session or permanent API credential was connected. Current adapter behavior has fixture coverage, but real image/video API access and output remain unverified. Inspection cites supplied image IDs and cannot approve assets; motion/audio review remains human work.

Local FFmpeg assembly produces an unapproved draft from approved clips and an optional soundtrack. Limits: 12 clips, 10 seconds per clip, 120 seconds total, 100 MB output. It removes source clip audio and supports no text overlays; overlays require external editing. Production deployment requires FFmpeg. Variant combinations can be applied to an edit plan and rendered individually; there is no bulk variant renderer.

### Verification

- 11 backend policy/adapter unit tests passed.
- 4 existing frontend review behavior tests passed.
- Synthetic database/controller/service checks passed for reference and brief permissions, shot lineage, upload magic bytes and cleanup, escalation, final approval, revisions, variants, duplicate generation, cancellation, changed inputs, model revocation, limits and revoked downloads. All fixture transactions rolled back.
- Multimodal inspection fixture verified image inputs, asset-cited findings and no automatic approval. It did not call a provider.
- A real local FFmpeg run produced a draft video through the media service using a synthetic clip.
- Browser checks covered narrow and desktop layouts, reference/brief/shot visibility, a persisted shot edit and the missing-provider state. The separately committed browser fixture was subsequently removed; temporary viewport overrides were reset.
- Delivery module lint passed in both packages; server build and metadata GraphQL generation passed. Direct typechecks show only existing unrelated errors: server Meta lead intake DeepPartial errors (2), frontend AppPath errors (4). Whole-repository typechecks are therefore not clean.
- No live media calls, deployment, client messages or social publishing occurred. The full worker process was not started because it includes unrelated integrations; queue routing is wired but media worker dispatch has not been exercised against a live Redis worker.

### Remaining acceptance and next action

Phase 3 remains open. Agree a concrete synthetic image/video sample, available models and a maximum provider-test spend, then perform bounded live acceptance and record usage/failures. The previously shared Gemini key is not saved as a permanent connection. Do not begin Phase 4 planning until this remaining acceptance is completed or the user explicitly revises the phase scope.


## Bounded live acceptance attempt — 2026-10-24

Authorization: user said "maximum 2 usd". This applies to the proposed one synthetic product image and one short animated clip. It is not a recurring budget. The test runner reserves USD 0.55 for the image request and USD 1.40 for video, with no automatic retries. It refuses to overwrite an existing test ledger. Credentials are read through non-echoing stdin and were not saved to disk or provider settings.

The credential successfully listed models. The single `gemini-3.1-flash-image` generation request then returned HTTP 429 / RESOURCE_EXHAUSTED, specifically a zero free-tier input-token quota. No image was returned. No video request was made. No charge was reported; account billing was not independently inspected. The USD 0.55 entry is a conservative reservation, not an incurred charge.

Evidence: `packages/twenty-server/artifacts/phase3-media-acceptance/usage.json`. Reusable guarded runner: `packages/twenty-server/scripts/check-delivery-media-live.cjs`. The same cumulative USD 2 authorization remains the limit for this acceptance exercise; inspect the ledger before resuming and do not reset or silently replace it to obtain a fresh budget.

During preflight, corrected the video adapter to consume raw REST `steps` output rather than the SDK-only `output_video` convenience field. It now requests explicit 720p synchronous output, disables interaction storage, caps video output at 60,000 tokens and caps one 1K image response at 8,192 tokens. These provider request limits are not a workspace-wide spend control. Added regression coverage for valid REST video bytes and incomplete interactions.

Official references checked: https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/docs/omni, https://ai.google.dev/api/interactions-api. Build passed; direct server typecheck still reports only the two previously recorded unrelated Meta lead-intake errors.

**Remaining blocker:** the supplied Google project needs paid image/video access and usable quota, or a different credential with that access. No billing settings were changed. Phase 3 remains open; Phase 4 is not yet planned.


## Live acceptance completed after billing upgrade — 2026-10-24

The user reported upgrading billing. Resumed with the same ephemeral credential and the original USD 2 cumulative cap, retaining the prior quota rejection in the ledger.

- `gemini-3.1-flash-image` returned a JPEG product image. Visual inspection found coherent shirt/sleeve/hanger geometry, fabric and lighting for the synthetic brief.
- The first `gemini-omni-1.1-flash` request completed at Google but failed local parsing because an unstored interaction omitted its ID. Its usage remains counted. Fixed the adapter to permit a missing ID only within an otherwise completed, validated video response, with a regression test.
- A deliberate second video request reused the image and capped output at 45,000 tokens. It returned a valid H.264/AAC MP4: 1280×720, 24 fps, 3.008 seconds. Sampled frames show a coherent slow push-in and preserved shirt geometry. Audio and frame-by-frame commercial quality have not been certified.
- Estimated total generated usage: USD 0.6834985, including the locally rejected first video response. Conservatively retaining USD 0.55 for the earlier zero-quota rejection gives USD 1.2334985 accounted, still below USD 2. These are published-rate calculations from provider usage, not an independently verified invoice. No further generation is needed for acceptance.
- Artifacts and full usage ledger: `packages/twenty-server/artifacts/phase3-media-acceptance/`. No credential was saved. The raw successful response is retained for offline diagnosis without another paid call.
- Seven adapter tests passed after the fix; build passed; direct typecheck retained only the two known unrelated server errors. Previous workflow/browser evidence remains applicable. Live calls tested the real adapter; Redis worker dispatch and production deployment remain rollout checks, not claimed as live-tested here.

Phase 3 local implementation and its bounded live acceptance are complete. The next step is the Phase 4 proposal, not its implementation. Permanent provider configuration, real staff setup and production operational checks remain separate.
