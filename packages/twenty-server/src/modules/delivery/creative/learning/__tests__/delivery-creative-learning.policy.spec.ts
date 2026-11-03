import { advertisingDraftFixture } from 'src/modules/delivery/advertising/drafts/__tests__/advertising-draft.fixture';
import { creativeReviewTarget } from 'src/modules/delivery/creative/review/delivery-creative-review.policy';
import {
  reviewDetails,
  reviewAsset,
  REVIEW_ASSET_ID,
  REVIEW_ASSIGNEE_ID,
  REVIEW_MEMBER_ID,
  REVIEW_PROJECT_ID,
  REVIEW_TASK_ID,
} from 'src/modules/delivery/creative/review/__tests__/creative-review.fixtures';
import { freezeCreativeSubmissionLearning } from '../freeze-creative-submission-learning';
import {
  assertCreativeLearningClient,
  creativeAdPreviewFingerprint,
  creativeLessonEvidenceComparable,
  creativeLearningChoiceCursor,
  eligibleCreativeLearningComponents,
  readCreativeLearningChoiceCursor,
} from '../delivery-creative-learning.policy';
import {
  type CreativeAdLinkBody,
  creativeAdLinkChoicesSchema,
  creativeAdLinkPreviewSchema,
  creativeLessonSaveSchema,
} from '../delivery-creative-learning.types';

const project = { id: REVIEW_PROJECT_ID, companyId: REVIEW_PROJECT_ID };
const body = (): CreativeAdLinkBody => {
  const { source, goal } = advertisingDraftFixture();
  const details = reviewDetails();
  return {
    projectId: REVIEW_PROJECT_ID,
    sourceId: source.source.id,
    adId: '1234',
    taskId: REVIEW_TASK_ID,
    submissionVersion: 1,
    assetId: REVIEW_ASSET_ID,
    goal,
    declaredComponents: [],
    declaredCopy: null,
    associationEvidence: 'Human checked exact ad and source media.',
    evidenceUrl: '',
    note: '',
    correctsId: null,
    source: source.source,
    goalSnapshot: goal,
    adName: 'Exact ad',
    adSpendMicros: '0',
    creativeTarget: creativeReviewTarget(REVIEW_TASK_ID, details, {
      targetKind: 'SUBMISSION',
      submissionVersion: 1,
      assetId: REVIEW_ASSET_ID,
    }),
    assetSha256: 'a'.repeat(64),
    assetHashCapturedAt: '2026-11-03T00:00:00.000Z',
    submittedBy: REVIEW_ASSIGNEE_ID,
    submittedByName: 'Editor',
    approvedBy: REVIEW_MEMBER_ID,
    approvedByName: 'Manager',
    approvedAt: '2026-11-03T00:00:00.000Z',
    submittedLearning: null,
    components: [],
    copyText: null,
    copyProvenance: 'UNKNOWN',
    warnings: ['LEGACY_SUBMISSION_LEARNING_MISSING'],
    previewFingerprint: 'b'.repeat(64),
  };
};
describe('frozen creative learning at submission', () => {
  it('pins client/project, original copy and brief intent without inventing uploaded-final components', () => {
    const document = reviewDetails().creative!;
    const result = freezeCreativeSubmissionLearning(
      document,
      'Original ad caption',
      project,
    );
    document.brief.concept = 'Later concept';
    document.brief.hook = 'Later hook';
    document.finalAssetId = REVIEW_MEMBER_ID;
    expect(result).toMatchObject({
      projectId: project.id,
      companyId: project.companyId,
      finalAssetId: REVIEW_ASSET_ID,
      copyText: 'Original ad caption',
      assemblyRunId: null,
      components: [],
    });
    expect(result.concept).not.toBe('Later concept');
    expect(result.plannedHook).not.toBe('Later hook');
  });
  it('keeps absent copy unknown instead of borrowing a later draft', () =>
    expect(
      freezeCreativeSubmissionLearning(
        reviewDetails().creative!,
        undefined,
        project,
      ).copyText,
    ).toBeNull());
  it('preserves an explicitly empty submitted copy', () =>
    expect(
      freezeCreativeSubmissionLearning(reviewDetails().creative!, '', project)
        .copyText,
    ).toBe(''));
  it('requires the exact final asset', () => {
    const document = reviewDetails().creative!;
    document.finalAssetId = null;
    expect(() =>
      freezeCreativeSubmissionLearning(document, undefined, project),
    ).toThrow('exact final asset');
  });
  it('pins only actual successful assembly component identities and their versions', () => {
    const document = reviewDetails().creative!;
    const base = reviewAsset(REVIEW_MEMBER_ID, {
      kind: 'BASE',
      mimeType: 'video/mp4',
      reviews: [
        { memberId: REVIEW_MEMBER_ID, at: '', decision: 'APPROVED', notes: '' },
      ],
    });
    document.assets.push(base);
    document.mediaRuns = [
      {
        id: REVIEW_TASK_ID,
        requestId: REVIEW_TASK_ID,
        modelId: 'local/ffmpeg',
        kind: 'ASSEMBLY',
        shotId: '',
        shotVersion: 1,
        briefVersion: 1,
        settingsVersion: 1,
        prompt: JSON.stringify({ assetIds: [base.id] }),
        referenceAssetIds: [base.id],
        initiatorId: REVIEW_ASSIGNEE_ID,
        userWorkspaceId: REVIEW_ASSIGNEE_ID,
        status: 'SUCCEEDED',
        createdAt: '',
        updatedAt: '',
        error: null,
        providerJobId: null,
        assetId: REVIEW_ASSET_ID,
        cost: null,
      },
    ];
    const result = freezeCreativeSubmissionLearning(
      document,
      undefined,
      project,
    );
    expect(result.assemblyRunId).toBe(REVIEW_TASK_ID);
    expect(result.components).toEqual([
      {
        role: 'BASE',
        assetId: base.id,
        name: base.name,
        briefVersion: 1,
        productionVersion: 1,
        assemblyVersion: 1,
        shotId: null,
        shotVersion: null,
      },
    ]);
    base.productionVersion = 2;
    expect(result.components[0].productionVersion).toBe(1);
  });
  it('does not infer composition from a planned variant or a failed/ambiguous render', () => {
    const document = reviewDetails().creative!;
    document.variants = [
      {
        id: REVIEW_TASK_ID,
        baseId: REVIEW_MEMBER_ID,
        hookId: REVIEW_ASSIGNEE_ID,
        ctaId: REVIEW_ASSET_ID,
        selected: true,
      },
    ];
    expect(
      freezeCreativeSubmissionLearning(document, undefined, project).components,
    ).toEqual([]);
  });
});
describe('reviewed creative/ad evidence', () => {
  it('offers only current approved matching video components and keeps proven roles read-only', () => {
    const document = reviewDetails().creative!;
    const approved = reviewAsset(REVIEW_MEMBER_ID, {
      name: 'Approved hook',
      kind: 'HOOK',
      mimeType: 'video/mp4',
      reviews: [
        { memberId: REVIEW_MEMBER_ID, at: '', decision: 'APPROVED', notes: '' },
      ],
    });
    document.assets = [approved];
    expect(eligibleCreativeLearningComponents(document, approved, [])).toEqual([
      expect.objectContaining({
        role: 'HOOK',
        assetId: approved.id,
        name: 'Approved hook',
        provenance: 'AVAILABLE_FOR_HUMAN_DECLARATION',
      }),
    ]);
    expect(
      eligibleCreativeLearningComponents(document, approved, [
        { role: 'HOOK' },
      ]),
    ).toEqual([]);
    approved.reviews.push({
      memberId: REVIEW_MEMBER_ID,
      at: '',
      decision: 'REJECTED',
      notes: '',
    });
    expect(eligibleCreativeLearningComponents(document, approved, [])).toEqual(
      [],
    );
  });
  it.each([
    { storageState: 'FAILED' as const },
    { briefVersion: 2 },
    { productionVersion: 2 },
    { mimeType: 'image/png' },
    { kind: 'REFERENCE' as const },
  ])('withholds unavailable or unlike component material %o', (fields) => {
    const document = reviewDetails().creative!;
    const final = document.assets[0];
    document.assets = [
      reviewAsset(REVIEW_MEMBER_ID, {
        kind: 'HOOK',
        mimeType: 'video/mp4',
        reviews: [
          {
            memberId: REVIEW_MEMBER_ID,
            at: '',
            decision: 'APPROVED',
            notes: '',
          },
        ],
        ...fields,
      }),
    ];
    expect(eligibleCreativeLearningComponents(document, final, [])).toEqual([]);
  });
  it('requires the complete exact selected creative identity or no selected identity', () => {
    const input = {
      sourceId: REVIEW_PROJECT_ID,
      projectId: REVIEW_PROJECT_ID,
      adId: '123',
    };
    expect(creativeAdLinkChoicesSchema.safeParse(input).success).toBe(true);
    expect(
      creativeAdLinkChoicesSchema.safeParse({
        ...input,
        selectedTaskId: REVIEW_TASK_ID,
        selectedSubmissionVersion: 1,
        selectedAssetId: REVIEW_ASSET_ID,
      }).success,
    ).toBe(true);
    expect(
      creativeAdLinkChoicesSchema.safeParse({
        ...input,
        selectedTaskId: REVIEW_TASK_ID,
      }).success,
    ).toBe(false);
    expect(
      creativeAdLinkChoicesSchema.safeParse({
        ...input,
        selectedTaskId: REVIEW_TASK_ID,
        selectedSubmissionVersion: 1,
      }).success,
    ).toBe(false);
  });
  it('allows same known client across two authorized projects, and internal unknown-client only one project', () => {
    expect(() =>
      assertCreativeLearningClient(
        REVIEW_PROJECT_ID,
        REVIEW_MEMBER_ID,
        REVIEW_TASK_ID,
        REVIEW_MEMBER_ID,
      ),
    ).not.toThrow();
    expect(() =>
      assertCreativeLearningClient(
        REVIEW_PROJECT_ID,
        null,
        REVIEW_PROJECT_ID,
        null,
      ),
    ).not.toThrow();
  });
  it.each([
    [REVIEW_PROJECT_ID, REVIEW_MEMBER_ID, REVIEW_TASK_ID, REVIEW_ASSIGNEE_ID],
    [REVIEW_PROJECT_ID, null, REVIEW_TASK_ID, null],
    [REVIEW_PROJECT_ID, REVIEW_MEMBER_ID, null, REVIEW_MEMBER_ID],
  ] as const)(
    'rejects cross-client or unassigned cross-project sources',
    (creativeProjectId, creativeCompanyId, sourceProjectId, sourceCompanyId) =>
      expect(() =>
        assertCreativeLearningClient(
          creativeProjectId,
          creativeCompanyId,
          sourceProjectId,
          sourceCompanyId,
        ),
      ).toThrow(),
  );
  it('pins final bytes and selected outcome, but capture time and derived current/previous labels do not invalidate identical evidence', () => {
    const original = body();
    const changed = structuredClone(original);
    changed.assetHashCapturedAt = '2026-11-03T00:01:00.000Z';
    changed.warnings.push('HISTORICAL_SOURCE');
    changed.creativeTarget.asset!.current = false;
    expect(creativeAdPreviewFingerprint(changed)).toBe(
      creativeAdPreviewFingerprint(original),
    );
    changed.assetSha256 = 'c'.repeat(64);
    expect(creativeAdPreviewFingerprint(changed)).not.toBe(
      creativeAdPreviewFingerprint(original),
    );
  });
  it('keeps provider zero distinct from unknown and never borrows account totals', () => {
    const original = body();
    const unknown = structuredClone(original);
    unknown.goalSnapshot.value = null;
    expect(creativeAdPreviewFingerprint(unknown)).not.toBe(
      creativeAdPreviewFingerprint(original),
    );
    expect(original.adSpendMicros).toBe('0');
    expect(original.source.spendMicros).not.toBe(original.adSpendMicros);
  });
  it('binds client/ad/creative/copy changes and survives JSONB key ordering', () => {
    const original = body();
    const changed = structuredClone(original);
    changed.copyText = 'Different copy';
    expect(creativeAdPreviewFingerprint(changed)).not.toBe(
      creativeAdPreviewFingerprint(original),
    );
    expect(
      creativeAdPreviewFingerprint({
        ...original,
        source: { ...original.source },
      }),
    ).toBe(creativeAdPreviewFingerprint(original));
  });
  it('rejects ambiguous human component assignments and unsafe evidence links', () => {
    const original = body();
    const input = {
      projectId: original.projectId,
      sourceId: original.sourceId,
      adId: original.adId,
      taskId: original.taskId,
      submissionVersion: 1,
      assetId: original.assetId,
      goal: {
        kind: original.goal.kind,
        metricKey: original.goal.metricKey,
        metricAdId: original.goal.metricAdId,
        provenance: original.goal.provenance,
        value: original.goal.value,
        evidence: original.goal.evidence,
        targetCostMicros: original.goal.targetCostMicros,
      },
      declaredComponents: [],
      declaredCopy: null,
      associationEvidence: original.associationEvidence,
      evidenceUrl: '',
      note: '',
      correctsId: null,
    };
    expect(creativeAdLinkPreviewSchema.safeParse(input).success).toBe(true);
    expect(
      creativeAdLinkPreviewSchema.safeParse({
        ...input,
        evidenceUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
    expect(
      creativeAdLinkPreviewSchema.safeParse({
        ...input,
        declaredComponents: [
          { role: 'HOOK', assetId: REVIEW_ASSET_ID },
          { role: 'HOOK', assetId: REVIEW_MEMBER_ID },
        ],
      }).success,
    ).toBe(false);
  });
  it('binds choices to exact scope before opening another page', () => {
    const cursor = creativeLearningChoiceCursor(
      'a'.repeat(64),
      REVIEW_TASK_ID,
      3,
    );
    expect(
      readCreativeLearningChoiceCursor(cursor, 'a'.repeat(64))
        ?.submissionVersion,
    ).toBe(3);
    expect(() =>
      readCreativeLearningChoiceCursor(cursor, 'b'.repeat(64)),
    ).toThrow('another source');
  });
  it('requires explicit limitations, unique evidence and corresponding exact fingerprints for a lesson', () => {
    const input = {
      id: REVIEW_ASSET_ID,
      requestId: REVIEW_TASK_ID,
      projectId: REVIEW_PROJECT_ID,
      linkIds: [REVIEW_MEMBER_ID],
      linkFingerprints: ['a'.repeat(64)],
      title: 'Provisional lesson',
      assessment: 'INCONCLUSIVE',
      lesson: 'Keep testing the explicitly reviewed variant.',
      limitations: 'Observed association does not establish causation.',
      nextTest: '',
      correctsId: null,
    };
    expect(creativeLessonSaveSchema.safeParse(input).success).toBe(true);
    expect(
      creativeLessonSaveSchema.safeParse({ ...input, limitations: '' }).success,
    ).toBe(false);
    expect(
      creativeLessonSaveSchema.safeParse({
        ...input,
        linkIds: [REVIEW_MEMBER_ID, REVIEW_MEMBER_ID],
      }).success,
    ).toBe(false);
  });
  it('compares the same raw provider metric across different ads without treating unlike action types as equal', () => {
    const first = body();
    const second = body();
    first.goalSnapshot.metricKey = `ad:${'a'.repeat(24)}:actions:${'b'.repeat(32)}`;
    second.goalSnapshot.metricKey = `ad:${'c'.repeat(24)}:actions:${'b'.repeat(32)}`;
    expect(creativeLessonEvidenceComparable([first, second])).toBe(true);
    second.goalSnapshot.metricKey = `ad:${'c'.repeat(24)}:actions:${'d'.repeat(32)}`;
    expect(creativeLessonEvidenceComparable([first, second])).toBe(false);
  });
  it.each([
    'unknown-value',
    'unknown-account',
    'unknown-timezone',
    'human',
    'unmapped',
    'unlike-collection',
  ] as const)('keeps %s evidence inconclusive', (kind) => {
    const first = body();
    first.goalSnapshot.metricKey = `ad:${'a'.repeat(24)}:actions:${'b'.repeat(32)}`;
    const second = structuredClone(first);
    if (kind === 'unknown-value') second.goalSnapshot.value = null;
    if (kind === 'unknown-account') second.source.accountId = null;
    if (kind === 'unknown-timezone') second.source.timezone = null;
    if (kind === 'human') second.goalSnapshot.provenance = 'HUMAN';
    if (kind === 'unmapped')
      second.goalSnapshot.metricKey = 'unsupported-custom-metric';
    if (kind === 'unlike-collection')
      second.goalSnapshot.metricKey = `ad:${'a'.repeat(24)}:action_values:${'b'.repeat(32)}`;
    expect(creativeLessonEvidenceComparable([first, second])).toBe(false);
  });
});
