import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { type CreativeAdLinkBody } from './delivery-creative-learning.types';
import {
  type CreativeAsset,
  type CreativeDocument,
} from 'src/modules/delivery/creative/delivery-creative.types';
import { isCreativeAssetApproved } from 'src/modules/delivery/creative/delivery-creative.policy';
export const eligibleCreativeLearningComponents = (
  document: CreativeDocument,
  final: Pick<CreativeAsset, 'briefVersion' | 'productionVersion'>,
  proven: { role: string }[],
) =>
  document.assets.flatMap((asset) =>
    (asset.kind === 'BASE' || asset.kind === 'HOOK' || asset.kind === 'CTA') &&
    asset.mimeType.startsWith('video/') &&
    asset.briefVersion === final.briefVersion &&
    asset.productionVersion === final.productionVersion &&
    isCreativeAssetApproved(document, asset) &&
    !proven.some((component) => component.role === asset.kind)
      ? [
          {
            role: asset.kind,
            assetId: asset.id,
            name: asset.name,
            briefVersion: asset.briefVersion,
            productionVersion: asset.productionVersion,
            assemblyVersion: asset.assemblyVersion,
            shotId: asset.shotId,
            shotVersion: asset.shotVersion,
            provenance: 'AVAILABLE_FOR_HUMAN_DECLARATION',
          },
        ]
      : [],
  );
export const CREATIVE_LEARNING_PAGE_SIZE = 25;
export const parseCreativeLearning = <TResult>(
  schema: z.ZodType<TResult>,
  raw: unknown,
) => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException(
      'Check the exact ad, approved creative version, outcome evidence and command.',
    );
  return parsed.data;
};
export const assertCreativeLearningClient = (
  creativeProjectId: string,
  creativeCompanyId: string | null,
  sourceProjectId: string | null,
  sourceCompanyId: string | null,
) => {
  if (
    !sourceProjectId ||
    (creativeProjectId !== sourceProjectId &&
      (!creativeCompanyId ||
        !sourceCompanyId ||
        creativeCompanyId !== sourceCompanyId)) ||
    creativeCompanyId !== sourceCompanyId
  )
    throw new ForbiddenException(
      'Use authorized creative and ad sources from the same known client. Unassigned internal sources must stay within one project.',
    );
};
export const creativeAdPreviewFingerprint = (
  body: Omit<CreativeAdLinkBody, 'previewFingerprint'> & {
    previewFingerprint?: string;
  },
) => {
  const {
    assetHashCapturedAt: _assetHashCapturedAt,
    warnings: _warnings,
    previewFingerprint: _previewFingerprint,
    ...factual
  } = body;
  return advertisingHash({
    ...factual,
    creativeTarget: {
      targetKind: body.creativeTarget.targetKind,
      submissionVersion: body.creativeTarget.submissionVersion,
      creativeVersion: body.creativeTarget.creativeVersion,
      assetId: body.creativeTarget.assetId,
      targetToken: body.creativeTarget.targetToken,
    },
  });
};
export const creativeAdEditableBody = (body: CreativeAdLinkBody) => ({
  projectId: body.projectId,
  sourceId: body.sourceId,
  adId: body.adId,
  taskId: body.taskId,
  submissionVersion: body.submissionVersion,
  assetId: body.assetId,
  goal: body.goal,
  declaredComponents: body.declaredComponents,
  declaredCopy: body.declaredCopy,
  associationEvidence: body.associationEvidence,
  evidenceUrl: body.evidenceUrl,
  note: body.note,
  correctsId: body.correctsId,
});
export const creativeLessonEvidenceComparable = (
  evidence: CreativeAdLinkBody[],
) => {
  const first = evidence[0];
  if (
    !first ||
    first.goalSnapshot.provenance !== 'REPORT' ||
    !first.source.accountId ||
    !first.source.timezone
  )
    return false;
  const metricIdentity = (body: CreativeAdLinkBody) =>
    body.goalSnapshot.metricKey
      ?.match(/^ad:[a-f0-9]{24}:(actions|action_values):([a-f0-9]{32})$/)
      ?.slice(1)
      .join(':') ?? null;
  const firstIdentity = metricIdentity(first);
  if (!firstIdentity) return false;
  return evidence.every(
    (body) =>
      body.goalSnapshot.provenance === 'REPORT' &&
      body.goalSnapshot.value !== null &&
      body.goalSnapshot.kind === first.goalSnapshot.kind &&
      body.goalSnapshot.metricUnit === first.goalSnapshot.metricUnit &&
      body.goalSnapshot.metricProvenance ===
        first.goalSnapshot.metricProvenance &&
      metricIdentity(body) === firstIdentity &&
      body.source.currency === first.source.currency &&
      body.source.accountId === first.source.accountId &&
      body.source.timezone === first.source.timezone,
  );
};
const choiceCursorSchema = z
  .object({
    version: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    taskId: z.uuid(),
    submissionVersion: z.number().int().positive(),
  })
  .strict();
export const creativeLearningChoiceCursor = (
  scope: string,
  taskId: string,
  submissionVersion: number,
) =>
  Buffer.from(
    JSON.stringify({ version: 1, scope, taskId, submissionVersion }),
  ).toString('base64url');
export const readCreativeLearningChoiceCursor = (
  value: string | null | undefined,
  scope: string,
) => {
  if (!value) return null;
  try {
    const parsed = choiceCursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    );
    if (parsed.scope === scope) return parsed;
  } catch {
    // A stale cursor must not retain an earlier client's source scope.
  }
  throw new BadRequestException(
    'The approved creative choices changed or this page belongs to another source/access scope. Open the first page.',
  );
};
