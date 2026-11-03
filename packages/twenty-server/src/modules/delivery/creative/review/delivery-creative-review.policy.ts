import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type CreativeAsset } from 'src/modules/delivery/creative/delivery-creative.types';
import {
  assertCreativeSubmission,
  isCreativeAssetCurrent,
} from 'src/modules/delivery/creative/delivery-creative.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import {
  type DeliveryCreativeReviewAssetDTO,
  type DeliveryCreativeReviewTargetDTO,
} from 'src/modules/delivery/creative/review/delivery-creative-review.dto';
export const CREATIVE_REVIEW_PAGE_SIZE = 25;
export const CREATIVE_REVIEW_SOURCE_LIMIT = 2000;
export const CREATIVE_REVIEW_MAX_BYTES = 100 * 1024 * 1024;
const id = z.uuid().transform((value) => value.toLowerCase());
const version = z.number().int().positive();
const optionalVersion = version.nullish().transform((value) => value ?? null);
const optionalId = id.nullish().transform((value) => value ?? null);
const text = z.string().trim().min(1).max(6000);
const targetKind = z.enum(['ASSET', 'SUBMISSION']);
const targetIdentity = {
  targetKind,
  submissionVersion: optionalVersion,
  assetId: optionalId,
};
export const creativeReviewQuerySchema = z
  .object({
    taskId: id,
    ...targetIdentity,
    compareSubmissionVersion: optionalVersion,
    compareAssetId: optionalId,
    beforeSubmissionVersion: optionalVersion,
    afterFeedbackId: optionalId,
    selectedFeedbackId: optionalId,
  })
  .strict()
  .refine(
    (value) =>
      value.targetKind === 'ASSET'
        ? value.assetId !== null && value.submissionVersion === null
        : true,
    'Choose one explicit asset or a submitted version.',
  );
export const creativeFeedbackCreateSchema = z
  .object({
    commandId: id,
    taskId: id,
    ...targetIdentity,
    assetId: id,
    targetToken: z.string().length(64),
    body: text,
    anchorKind: z.enum(['GENERAL', 'TIME', 'RANGE']),
    startMs: z.number().int().min(0).max(2147483647).nullable(),
    endMs: z.number().int().min(0).max(2147483647).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.targetKind === 'ASSET'
        ? value.submissionVersion === null
        : value.submissionVersion !== null,
    'Submission feedback needs its exact submitted version.',
  )
  .refine(
    (value) =>
      value.anchorKind === 'GENERAL'
        ? value.startMs === null && value.endMs === null
        : value.anchorKind === 'TIME'
          ? value.startMs !== null && value.endMs === null
          : value.startMs !== null &&
            value.endMs !== null &&
            value.endMs > value.startMs,
    'Choose general feedback, a time, or a range ending after its start.',
  );
export const creativeFeedbackChangeSchema = z
  .object({
    commandId: id,
    taskId: id,
    feedbackId: id,
    revision: version,
    action: z.enum(['REPLY', 'ADDRESSED', 'RESOLVED', 'REOPENED']),
    body: text,
    evidenceTargetKind: targetKind.nullable(),
    evidenceSubmissionVersion: optionalVersion,
    evidenceAssetId: optionalId,
    evidenceTargetToken: z.string().length(64).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      ['ADDRESSED', 'RESOLVED'].includes(value.action)
        ? value.evidenceTargetKind !== null &&
          value.evidenceAssetId !== null &&
          value.evidenceTargetToken !== null &&
          ((value.evidenceTargetKind === 'ASSET' &&
            value.evidenceSubmissionVersion === null) ||
            (value.evidenceTargetKind === 'SUBMISSION' &&
              value.evidenceSubmissionVersion !== null))
        : value.evidenceTargetKind === null &&
          value.evidenceSubmissionVersion === null &&
          value.evidenceAssetId === null &&
          value.evidenceTargetToken === null,
    'Addressing/resolving requires exact correction evidence; replies/reopening use their explanation.',
  );
export const creativeFeedbackHistorySchema = z
  .object({ taskId: id, feedbackId: id, beforeId: optionalId })
  .strict();
export const parseCreativeReview = <TOutput>(
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message).join(' '),
    );
  return result.data;
};
export type CreativeReviewIdentity = {
  targetKind: 'ASSET' | 'SUBMISSION';
  submissionVersion: number | null;
  assetId: string | null;
};
export const creativeReviewAsset = (
  details: DeliveryDetails,
  asset: CreativeAsset,
): DeliveryCreativeReviewAssetDTO => ({
  id: asset.id,
  name: asset.name,
  kind: asset.kind,
  mimeType: asset.mimeType,
  size: asset.size,
  createdAt: asset.createdAt,
  briefVersion: asset.briefVersion,
  productionVersion: asset.productionVersion,
  assemblyVersion: asset.assemblyVersion,
  shotId: asset.shotId,
  shotVersion: asset.shotVersion,
  parentAssetId: asset.parentAssetId,
  storageState: asset.storageState,
  current: details.creative
    ? isCreativeAssetCurrent(details.creative, asset)
    : false,
});
const supportedMedia = (mime: string) =>
  [
    'image/png',
    'image/jpeg',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
  ].includes(mime);
export const creativeReviewTarget = (
  taskId: string,
  details: DeliveryDetails,
  identity: CreativeReviewIdentity,
): DeliveryCreativeReviewTargetDTO => {
  const result: DeliveryCreativeReviewTargetDTO = {
    targetKind: identity.targetKind,
    submissionVersion: identity.submissionVersion,
    creativeVersion: null,
    assetId: identity.assetId,
    asset: null,
    availability: 'ASSET_MISSING',
    targetToken: null,
    warnings: [],
  };
  if (identity.targetKind === 'SUBMISSION') {
    const submissions = details.submissions ?? [];
    const selectedVersion =
      identity.submissionVersion ??
      submissions[submissions.length - 1]?.version ??
      null;
    if (selectedVersion === null)
      return { ...result, availability: 'NO_SUBMISSION', assetId: null };
    const matches = submissions.filter(
      (submission) => submission.version === selectedVersion,
    );
    if (matches.length !== 1)
      throw new NotFoundException(
        'This exact submitted version is unavailable.',
      );
    const submission = matches[0];
    result.submissionVersion = submission.version;
    result.creativeVersion = submission.creativeVersion ?? null;
    if (!submission.finalAssetId || !submission.creativeVersion)
      return {
        ...result,
        assetId: null,
        availability: 'LEGACY_IDENTITY_MISSING',
        warnings: ['LEGACY_SUBMISSION_NO_FROZEN_MEDIA'],
      };
    if (identity.assetId && identity.assetId !== submission.finalAssetId)
      throw new BadRequestException(
        'The selected asset does not match this frozen submission.',
      );
    result.assetId = isValidUuid(submission.finalAssetId)
      ? submission.finalAssetId
      : null;
  }
  if (!result.assetId) return result;
  const assets =
    details.creative?.assets.filter((asset) => asset.id === result.assetId) ??
    [];
  if (assets.length !== 1)
    return { ...result, warnings: ['MEDIA_ASSET_UNAVAILABLE'] };
  const asset = assets[0];
  result.asset = creativeReviewAsset(details, asset);
  if (identity.targetKind === 'SUBMISSION' && asset.kind !== 'FINAL')
    return { ...result, warnings: ['INVALID_FROZEN_FINAL_ASSET'] };
  if (asset.storageState !== 'READY')
    return {
      ...result,
      availability: 'STORAGE_NOT_READY',
      warnings: ['MEDIA_STORAGE_NOT_READY'],
    };
  if (
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    asset.size > CREATIVE_REVIEW_MAX_BYTES
  )
    return {
      ...result,
      availability: 'STORAGE_NOT_READY',
      warnings: ['MEDIA_METADATA_INVALID'],
    };
  if (!supportedMedia(asset.mimeType))
    return {
      ...result,
      availability: 'UNSUPPORTED_MEDIA',
      warnings: ['MEDIA_TYPE_UNSUPPORTED'],
    };
  result.availability = 'AVAILABLE';
  result.warnings = [
    ...(!result.asset.current ? ['HISTORICAL_ASSET_LINEAGE'] : []),
    ...(/^(video|audio)\//.test(asset.mimeType)
      ? ['DURATION_NOT_VERIFIED']
      : []),
  ];
  const { current: _current, ...lineage } = result.asset;
  result.targetToken = financeReviewToken({
    taskId,
    targetKind: result.targetKind,
    submissionVersion: result.submissionVersion,
    creativeVersion: result.creativeVersion,
    asset: lineage,
  });
  return result;
};
export const assertCreativeReviewTarget = (
  target: DeliveryCreativeReviewTargetDTO,
  token: string,
) => {
  if (target.availability !== 'AVAILABLE' || target.targetToken === null)
    throw new ConflictException(
      'The exact review media is unavailable. Refresh this target.',
    );
  if (target.targetToken !== token)
    throw new ConflictException(
      'The review target changed. Reload its exact media before saving.',
    );
};
export const assertCreativeReviewAnchor = (
  target: DeliveryCreativeReviewTargetDTO,
  anchorKind: string,
) => {
  if (
    anchorKind !== 'GENERAL' &&
    !/^(video|audio)\//.test(target.asset?.mimeType ?? '')
  )
    throw new BadRequestException(
      'Only video or audio supports time-based feedback.',
    );
};
export const creativeReviewSameTarget = (
  left: Pick<
    DeliveryCreativeReviewTargetDTO,
    'targetKind' | 'submissionVersion' | 'assetId'
  >,
  right: Pick<
    DeliveryCreativeReviewTargetDTO,
    'targetKind' | 'submissionVersion' | 'assetId'
  >,
) =>
  left.targetKind === right.targetKind &&
  left.submissionVersion === right.submissionVersion &&
  left.assetId === right.assetId;
export const creativeReviewPermissions = (
  details: DeliveryDetails,
  memberId: string,
  isManager: boolean,
  assigneeId: string | null,
  selected: DeliveryCreativeReviewTargetDTO,
  reviewAuthority?: boolean,
) => {
  const canResolve =
    (reviewAuthority ?? (isManager && details.reviewerId === memberId)) &&
    assigneeId !== memberId;
  const latest = details.submissions[details.submissions.length - 1];
  let currentFinal = false;
  if (
    details.creative &&
    selected.availability === 'AVAILABLE' &&
    selected.asset?.current &&
    selected.targetKind === 'SUBMISSION' &&
    selected.submissionVersion === latest?.version &&
    selected.creativeVersion === details.creative.version &&
    selected.assetId === details.creative.finalAssetId
  ) {
    try {
      assertCreativeSubmission(details.creative);
      currentFinal = true;
    } catch {
      currentFinal = false;
    }
  }
  return {
    canComment: true,
    canAddress: isManager || assigneeId === memberId,
    canResolve,
    canReviewFinal: canResolve && details.state === 'IN_REVIEW' && currentFinal,
  };
};
