import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  assertCreativeReviewAnchor,
  assertCreativeReviewTarget,
  creativeFeedbackChangeSchema,
  creativeFeedbackCreateSchema,
  creativeReviewPermissions,
  creativeReviewQuerySchema,
  creativeReviewTarget,
  parseCreativeReview,
} from 'src/modules/delivery/creative/review/delivery-creative-review.policy';
import {
  REVIEW_ASSET_ID,
  REVIEW_CHANGE_ID,
  REVIEW_COMMAND_ID,
  REVIEW_CORRECTION_ID,
  REVIEW_MEMBER_ID,
  REVIEW_ASSIGNEE_ID,
  REVIEW_TASK_ID,
  reviewDetails,
} from 'src/modules/delivery/creative/review/__tests__/creative-review.fixtures';

const create = {
  commandId: REVIEW_COMMAND_ID,
  taskId: REVIEW_TASK_ID,
  targetKind: 'SUBMISSION',
  submissionVersion: 1,
  assetId: REVIEW_ASSET_ID,
  targetToken: 'a'.repeat(64),
  body: 'Please correct the logo.',
  anchorKind: 'GENERAL',
  startMs: null,
  endMs: null,
};
const change = {
  commandId: REVIEW_CHANGE_ID,
  taskId: REVIEW_TASK_ID,
  feedbackId: REVIEW_COMMAND_ID,
  revision: 1,
  action: 'RESOLVED',
  body: 'The original mark is correct.',
  evidenceTargetKind: 'SUBMISSION',
  evidenceSubmissionVersion: 1,
  evidenceAssetId: REVIEW_ASSET_ID,
  evidenceTargetToken: 'a'.repeat(64),
};
const submitted = {
  targetKind: 'SUBMISSION' as const,
  submissionVersion: 1,
  assetId: null,
};
describe('exact creative review targets', () => {
  it('reviews the frozen submitted asset when production selects another final', () => {
    const details = reviewDetails();
    details.creative!.finalAssetId = REVIEW_CORRECTION_ID;
    details.creative!.version = 2;
    const target = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
    expect(target.assetId).toBe(REVIEW_ASSET_ID);
    expect(target.creativeVersion).toBe(1);
    expect(target.availability).toBe('AVAILABLE');
  });
  it('refuses an explicitly wrong submission or asset instead of falling back', () => {
    const details = reviewDetails();
    expect(() =>
      creativeReviewTarget(REVIEW_TASK_ID, details, {
        ...submitted,
        submissionVersion: 99,
      }),
    ).toThrow(NotFoundException);
    expect(() =>
      creativeReviewTarget(REVIEW_TASK_ID, details, {
        ...submitted,
        assetId: REVIEW_CORRECTION_ID,
      }),
    ).toThrow(BadRequestException);
  });
  it('does not infer legacy submission media from today’s final', () => {
    const details = reviewDetails();
    delete details.submissions[0].finalAssetId;
    const target = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
    expect(target.availability).toBe('LEGACY_IDENTITY_MISSING');
    expect(target.assetId).toBeNull();
    expect(target.asset).toBeNull();
    expect(target.targetToken).toBeNull();
  });
  it('distinguishes no submission from an exact intermediate asset', () => {
    const details = reviewDetails();
    details.submissions = [];
    expect(
      creativeReviewTarget(REVIEW_TASK_ID, details, {
        ...submitted,
        submissionVersion: null,
      }).availability,
    ).toBe('NO_SUBMISSION');
    expect(
      creativeReviewTarget(REVIEW_TASK_ID, details, {
        targetKind: 'ASSET',
        submissionVersion: null,
        assetId: REVIEW_CORRECTION_ID,
      }).availability,
    ).toBe('AVAILABLE');
  });
  it.each(['PENDING', 'FAILED'] as const)(
    'does not authorize %s media',
    (storageState) => {
      const details = reviewDetails();
      details.creative!.assets[0].storageState = storageState;
      const target = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
      expect(target.availability).toBe('STORAGE_NOT_READY');
      expect(() => assertCreativeReviewTarget(target, 'a'.repeat(64))).toThrow(
        ConflictException,
      );
    },
  );
  it('refuses duplicate/missing exact media and unsupported types', () => {
    const details = reviewDetails();
    details.creative!.assets.push({ ...details.creative!.assets[0] });
    expect(
      creativeReviewTarget(REVIEW_TASK_ID, details, submitted).availability,
    ).toBe('ASSET_MISSING');
    details.creative!.assets.pop();
    details.creative!.assets[0].mimeType = 'text/html';
    expect(
      creativeReviewTarget(REVIEW_TASK_ID, details, submitted).availability,
    ).toBe('UNSUPPORTED_MEDIA');
  });
  it('keeps historical exact-media tokens stable across unrelated creative changes', () => {
    const details = reviewDetails();
    const before = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
    details.creative!.version += 1;
    details.creative!.briefVersion += 1;
    details.creative!.productionVersion += 1;
    details.creative!.finalAssetId = REVIEW_CORRECTION_ID;
    const after = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
    expect(after.targetToken).toBe(before.targetToken);
    expect(after.warnings).toContain('HISTORICAL_ASSET_LINEAGE');
    expect(after.asset?.current).toBe(false);
    expect(() =>
      assertCreativeReviewTarget(after, before.targetToken!),
    ).not.toThrow();
  });
  it('stales tokens when reviewed asset lineage changes and separates ASSET/SUBMISSION context', () => {
    const details = reviewDetails();
    const before = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
    const intermediate = creativeReviewTarget(REVIEW_TASK_ID, details, {
      targetKind: 'ASSET',
      submissionVersion: null,
      assetId: REVIEW_ASSET_ID,
    });
    expect(intermediate.targetToken).not.toBe(before.targetToken);
    details.creative!.assets[0].assemblyVersion = 2;
    const after = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
    expect(() =>
      assertCreativeReviewTarget(after, before.targetToken!),
    ).toThrow(ConflictException);
  });
});
describe('creative feedback inputs and authority', () => {
  it('requires explicit intermediate identity and strict input combinations', () => {
    expect(() =>
      parseCreativeReview(creativeReviewQuerySchema, {
        taskId: REVIEW_TASK_ID,
        targetKind: 'ASSET',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseCreativeReview(creativeReviewQuerySchema, {
        taskId: REVIEW_TASK_ID,
        targetKind: 'ASSET',
        assetId: REVIEW_ASSET_ID,
        submissionVersion: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseCreativeReview(creativeFeedbackCreateSchema, {
        ...create,
        submissionVersion: null,
      }),
    ).toThrow(BadRequestException);
  });
  it('allows millisecond zero and a bounded range without inventing a verified duration', () => {
    expect(
      parseCreativeReview(creativeFeedbackCreateSchema, {
        ...create,
        anchorKind: 'TIME',
        startMs: 0,
      }).startMs,
    ).toBe(0);
    expect(
      parseCreativeReview(creativeFeedbackCreateSchema, {
        ...create,
        anchorKind: 'RANGE',
        startMs: 0,
        endMs: 2147483647,
      }).endMs,
    ).toBe(2147483647);
    const details = reviewDetails();
    details.creative!.assets[0].mimeType = 'video/mp4';
    const target = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
    expect(target.warnings).toContain('DURATION_NOT_VERIFIED');
    expect(() => assertCreativeReviewAnchor(target, 'RANGE')).not.toThrow();
  });
  it.each([
    { anchorKind: 'TIME', startMs: -1 },
    { anchorKind: 'RANGE', startMs: 5, endMs: 5 },
    { anchorKind: 'RANGE', startMs: 10, endMs: 5 },
    { anchorKind: 'TIME', startMs: 2147483648 },
    { anchorKind: 'GENERAL', startMs: 0 },
  ])('rejects invalid time/range/general anchors %p', (fields) => {
    expect(() =>
      parseCreativeReview(creativeFeedbackCreateSchema, {
        ...create,
        ...fields,
      }),
    ).toThrow(BadRequestException);
  });
  it('only permits general image feedback while supporting exact video/audio anchors', () => {
    const target = creativeReviewTarget(
      REVIEW_TASK_ID,
      reviewDetails(),
      submitted,
    );
    expect(() => assertCreativeReviewAnchor(target, 'TIME')).toThrow(
      BadRequestException,
    );
    expect(() => assertCreativeReviewAnchor(target, 'GENERAL')).not.toThrow();
  });
  it('requires explanation and exact correction evidence, with none attached to replies/reopening', () => {
    expect(() =>
      parseCreativeReview(creativeFeedbackChangeSchema, {
        ...change,
        body: '  ',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseCreativeReview(creativeFeedbackChangeSchema, {
        ...change,
        evidenceTargetToken: null,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseCreativeReview(creativeFeedbackChangeSchema, {
        ...change,
        action: 'REPLY',
      }),
    ).toThrow(BadRequestException);
    expect(
      parseCreativeReview(creativeFeedbackChangeSchema, {
        ...change,
        action: 'REOPENED',
        evidenceTargetKind: null,
        evidenceSubmissionVersion: null,
        evidenceAssetId: null,
        evidenceTargetToken: null,
      }).action,
    ).toBe('REOPENED');
  });
  it('permits reader comments but preserves independent assigned-reviewer resolution', () => {
    const details = reviewDetails();
    const target = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
    expect(
      creativeReviewPermissions(
        details,
        REVIEW_MEMBER_ID,
        true,
        REVIEW_ASSIGNEE_ID,
        target,
      ),
    ).toMatchObject({
      canComment: true,
      canAddress: true,
      canResolve: true,
      canReviewFinal: true,
    });
    expect(
      creativeReviewPermissions(
        details,
        REVIEW_ASSIGNEE_ID,
        true,
        REVIEW_ASSIGNEE_ID,
        target,
      ),
    ).toMatchObject({ canResolve: false, canReviewFinal: false });
    expect(
      creativeReviewPermissions(
        details,
        REVIEW_MEMBER_ID,
        false,
        REVIEW_ASSIGNEE_ID,
        target,
      ),
    ).toMatchObject({
      canComment: true,
      canAddress: false,
      canResolve: false,
      canReviewFinal: false,
    });
  });
  it('never offers final approval for an old selection or legacy missing identity', () => {
    const details = reviewDetails();
    const old = creativeReviewTarget(REVIEW_TASK_ID, details, submitted);
    details.submissions.push({ ...details.submissions[0], version: 2 });
    expect(
      creativeReviewPermissions(
        details,
        REVIEW_MEMBER_ID,
        true,
        REVIEW_ASSIGNEE_ID,
        old,
      ).canReviewFinal,
    ).toBe(false);
    delete details.submissions[1].creativeVersion;
    const legacy = creativeReviewTarget(REVIEW_TASK_ID, details, {
      ...submitted,
      submissionVersion: 2,
    });
    expect(
      creativeReviewPermissions(
        details,
        REVIEW_MEMBER_ID,
        true,
        REVIEW_ASSIGNEE_ID,
        legacy,
      ).canReviewFinal,
    ).toBe(false);
  });
});
