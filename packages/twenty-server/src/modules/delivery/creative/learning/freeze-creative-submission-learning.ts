import { type CreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
import { isCreativeAssetApproved } from 'src/modules/delivery/creative/delivery-creative.policy';
import {
  type CreativeLearningComponent,
  type CreativeSubmissionLearning,
} from './delivery-creative-learning.types';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

export const freezeCreativeSubmissionLearning = (
  document: CreativeDocument,
  copy: string | undefined,
  project: { id: string; companyId: string | null },
): CreativeSubmissionLearning => {
  const finalAssetId = document.finalAssetId;
  if (!finalAssetId)
    throw new BadRequestException(
      'A frozen creative learning snapshot requires the exact final asset.',
    );
  const runs =
    document.mediaRuns?.filter(
      (run) =>
        run.kind === 'ASSEMBLY' &&
        run.status === 'SUCCEEDED' &&
        run.assetId === finalAssetId,
    ) ?? [];
  let assemblyRunId: string | null = null;
  let components: CreativeLearningComponent[] = [];
  if (
    runs.length === 1 &&
    runs[0].briefVersion === document.briefVersion &&
    runs[0].shotVersion === document.productionVersion &&
    runs[0].settingsVersion === document.assemblyVersion
  ) {
    try {
      const assembly = z
        .object({ assetIds: z.array(z.uuid()).max(12) })
        .parse(JSON.parse(runs[0].prompt));
      if (
        new Set(assembly.assetIds).size === assembly.assetIds.length &&
        assembly.assetIds.every((id) => runs[0].referenceAssetIds.includes(id))
      ) {
        const selected = document.assets.filter((asset) =>
          assembly.assetIds.includes(asset.id),
        );
        if (
          selected.length === assembly.assetIds.length &&
          selected.every((asset) => isCreativeAssetApproved(document, asset))
        ) {
          assemblyRunId = runs[0].id;
          components = selected.flatMap((asset) =>
            asset.kind === 'BASE' ||
            asset.kind === 'HOOK' ||
            asset.kind === 'CTA'
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
                  },
                ]
              : [],
          );
        }
      }
    } catch {
      assemblyRunId = null;
      components = [];
    }
  }
  return {
    version: 1,
    projectId: project.id,
    companyId: project.companyId,
    creativeVersion: document.version,
    finalAssetId,
    briefVersion: document.briefVersion,
    concept: document.brief.concept,
    angle: document.brief.angle,
    plannedHook: document.brief.hook,
    plannedCta: document.brief.cta,
    copyText: copy ?? null,
    assemblyRunId,
    components,
  };
};
