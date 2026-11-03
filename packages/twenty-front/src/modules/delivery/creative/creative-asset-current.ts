import {
  type CreativeAsset,
  type CreativeDocument,
} from '@/delivery/delivery-creative.types';
export const isCreativeAssetCurrent = (
  document: CreativeDocument,
  asset: CreativeAsset,
) => {
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
    if (
      !shot ||
      shot.version !== asset.shotVersion ||
      (asset.kind === 'CLIP' && shot.imageId !== asset.parentAssetId)
    )
      return false;
  }
  return true;
};
