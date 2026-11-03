import { type DeliveryAtlasSettingsInput } from '~/generated-metadata/graphql';
import { type AtlasSettings } from '@/delivery/creative/atlas/atlas.types';
export const atlasSettingsInput = (
  snapshot: AtlasSettings,
): DeliveryAtlasSettingsInput => ({
  revision: snapshot.revision,
  enabled: snapshot.enabled,
  enabledProfileIds: [...snapshot.enabledProfileIds],
  defaultImageFamilyId: snapshot.defaultImageFamilyId ?? null,
  defaultClipProfileId: snapshot.defaultClipProfileId ?? null,
  reservationLimits: snapshot.reservationLimits.map((limit) => ({
    profileId: limit.profileId,
    maximumCostUsd: limit.maximumCostUsd,
    source: limit.source,
    verifiedAt: limit.verifiedAt,
  })),
});
