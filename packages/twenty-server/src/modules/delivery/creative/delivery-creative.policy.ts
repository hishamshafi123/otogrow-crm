import { BadRequestException } from '@nestjs/common';
import {
  type CreativeAsset,
  type CreativeDocument,
} from 'src/modules/delivery/creative/delivery-creative.types';

export const isCreativeAssetCurrent = (
  document: CreativeDocument,
  asset: CreativeAsset,
): boolean => {
  if (asset.storageState !== 'READY') return false;
  if (asset.kind === 'REFERENCE' || asset.kind === 'AUDIO') return true;
  if (asset.briefVersion !== document.briefVersion) return false;
  if (
    ['BASE', 'FINAL'].includes(asset.kind) &&
    asset.productionVersion !== document.productionVersion
  )
    return false;
  if (
    asset.kind === 'FINAL' &&
    asset.assemblyVersion !== document.assemblyVersion
  )
    return false;
  if (asset.shotId) {
    const shot = document.shots.find((item) => item.id === asset.shotId);
    if (!shot || shot.version !== asset.shotVersion) return false;
    if (asset.kind === 'CLIP' && shot.imageId !== asset.parentAssetId)
      return false;
  }
  return true;
};
export const isCreativeAssetApproved = (
  document: CreativeDocument,
  asset: CreativeAsset,
): boolean =>
  isCreativeAssetCurrent(document, asset) &&
  asset.reviews[asset.reviews.length - 1]?.decision === 'APPROVED';

export const assertCreativeAssetMime = (
  document: CreativeDocument,
  asset: Pick<CreativeAsset, 'kind' | 'mimeType'>,
) => {
  if (
    (asset.kind === 'IMAGE' ||
      (asset.kind === 'FINAL' && document.brief.outputKind === 'IMAGE')) &&
    !asset.mimeType.startsWith('image/')
  )
    throw new BadRequestException('A still image is required for this asset.');
  if (
    (['CLIP', 'BASE', 'HOOK', 'CTA'].includes(asset.kind) ||
      (asset.kind === 'FINAL' && document.brief.outputKind !== 'IMAGE')) &&
    !asset.mimeType.startsWith('video/')
  )
    throw new BadRequestException('A video is required for this asset.');
  if (asset.kind === 'AUDIO' && !asset.mimeType.startsWith('audio/'))
    throw new BadRequestException('An audio file is required.');
};

export const assertCreativeSubmission = (document: CreativeDocument) => {
  if (document.approvedBriefVersion !== document.briefVersion)
    throw new BadRequestException(
      'Approve the current creative brief before submitting.',
    );
  const isImage = document.brief.outputKind === 'IMAGE';
  if (!isImage && !document.shots.length)
    throw new BadRequestException('Add a shot before submitting.');
  for (const shot of isImage ? [] : document.shots) {
    const image = document.assets.find((item) => item.id === shot.imageId);
    const clip = document.assets.find((item) => item.id === shot.clipId);
    if (
      !image ||
      !isCreativeAssetApproved(document, image) ||
      !clip || !isCreativeAssetApproved(document, clip)
    )
      throw new BadRequestException(
        'Approve and select current images and clips for every shot.',
      );
  }
  const final = document.assets.find(
    (item) => item.id === document.finalAssetId,
  );
  if (
    !final ||
    final.kind !== 'FINAL' ||
    !isCreativeAssetCurrent(document, final)
  )
    throw new BadRequestException(
      'Select a current final edit before submitting.',
    );
  assertCreativeAssetMime(document, final);
};

export const invalidateCreativeAssembly = (document: CreativeDocument) => {
  document.productionVersion++;
  document.assemblyVersion++;
  document.finalAssetId = null;
  document.assembly.assetIds = [];
  document.variants = [];
};

export const invalidateCreativeBrief = (document: CreativeDocument) => {
  document.briefHistory.push({
    version: document.briefVersion,
    brief: document.brief,
    approved: document.approvedBriefVersion === document.briefVersion,
  });
  document.briefVersion++;
  document.shots.forEach((shot) => {
    shot.imageId = null;
    shot.clipId = null;
  });
  document.approvedBriefVersion = null;
  invalidateCreativeAssembly(document);
};
