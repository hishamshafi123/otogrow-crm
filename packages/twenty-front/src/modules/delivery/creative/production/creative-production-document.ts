import { type CreativeDocument } from '@/delivery/delivery-creative.types';
import { type DeliveryCreativeDetailQuery } from '~/generated-metadata/graphql';

export const creativeProductionDocument = (
  document: DeliveryCreativeDetailQuery['deliveryCreativeDetail']['document'],
): CreativeDocument | undefined =>
  document
    ? {
        ...document,
        approvedBriefVersion: document.approvedBriefVersion ?? null,
        finalAssetId: document.finalAssetId ?? null,
        brief: {
          ...document.brief,
          outputKind: document.brief.outputKind ?? 'VIDEO',
        },
        briefHistory: document.briefHistory.map((version) => ({
          ...version,
          brief: {
            ...version.brief,
            outputKind: version.brief.outputKind ?? 'VIDEO',
          },
        })),
        references: document.references.map((reference) => ({
          ...reference,
          url: reference.url ?? null,
          assetId: reference.assetId ?? null,
          sourceReferenceId: reference.sourceReferenceId ?? undefined,
        })),
        shots: document.shots.map((shot) => ({
          ...shot,
          referenceId: shot.referenceId ?? null,
          imageId: shot.imageId ?? null,
          clipId: shot.clipId ?? null,
          history: shot.history.map((version) => ({
            ...version,
            referenceId: version.referenceId ?? null,
          })),
        })),
        assets: document.assets.map((asset) => ({
          ...asset,
          shotId: asset.shotId ?? null,
          shotVersion: asset.shotVersion ?? null,
          parentAssetId: asset.parentAssetId ?? null,
        })),
        assembly: {
          ...document.assembly,
          audioId: document.assembly.audioId ?? null,
        },
        mediaSettings: document.mediaSettings ?? undefined,
        mediaRuns: document.mediaRuns?.map((run) => ({
          ...run,
          error: run.error ?? null,
          providerJobId: run.providerJobId ?? null,
          assetId: run.assetId ?? null,
          cost: run.cost ?? null,
          inspection: run.inspection ?? undefined,
        })),
      }
    : undefined;
