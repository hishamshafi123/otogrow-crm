import {
  type DeliveryAtlasParametersInput,
  type DeliveryAtlasQuoteInput,
} from '~/generated-metadata/graphql';
import {
  type AtlasProduction,
  type AtlasProfile,
} from '@/delivery/creative/atlas/atlas.types';
export type AtlasRequestValues = {
  kind: 'IMAGE' | 'CLIP';
  imageMode: 'TEXT_TO_IMAGE' | 'IMAGE_EDIT';
  imageFamilyId: string;
  clipProfileId: string;
  imageSelection: 'DEFAULT' | 'OVERRIDE';
  clipSelection: 'DEFAULT' | 'OVERRIDE';
  target: 'BRIEF' | 'SHOT';
  shotId: string;
  prompt: string;
  referenceAssetIds: string[];
  parameters: Record<string, string>;
};
export const atlasRequestProfile = (
  production: AtlasProduction,
  values: AtlasRequestValues,
) => {
  const family = production.families.find(
    (item) => item.id === values.imageFamilyId,
  );
  const id =
    values.kind === 'CLIP'
      ? values.clipProfileId
      : values.imageMode === 'IMAGE_EDIT'
        ? family?.imageEditProfileId
        : family?.textToImageProfileId;
  return production.profiles.find(
    (profile) =>
      profile.id === id &&
      profile.kind === values.kind &&
      profile.operation ===
        (values.kind === 'CLIP' ? 'IMAGE_TO_VIDEO' : values.imageMode),
  );
};
export const atlasParameterDefaults = (
  profile: AtlasProfile | undefined,
): Record<string, string> =>
  Object.fromEntries(
    profile?.parameters.map((parameter) => [
      parameter.name,
      parameter.defaultValue ?? '',
    ]) ?? [],
  );
export const atlasInitialRequest = (
  production: AtlasProduction,
): AtlasRequestValues => {
  const values: AtlasRequestValues = {
    kind: 'IMAGE',
    imageMode: 'TEXT_TO_IMAGE',
    imageFamilyId: production.defaultImageFamilyId ?? '',
    clipProfileId: production.defaultClipProfileId ?? '',
    imageSelection: production.defaultImageFamilyId ? 'DEFAULT' : 'OVERRIDE',
    clipSelection: production.defaultClipProfileId ? 'DEFAULT' : 'OVERRIDE',
    target: production.outputKind === 'IMAGE' ? 'BRIEF' : 'SHOT',
    shotId: '',
    prompt: '',
    referenceAssetIds: [],
    parameters: {},
  };
  return {
    ...values,
    parameters: atlasParameterDefaults(atlasRequestProfile(production, values)),
  };
};
export const atlasParameterInput = (
  profile: AtlasProfile,
  values: Record<string, string>,
): DeliveryAtlasParametersInput | null => {
  if (
    Object.keys(values).some(
      (name) =>
        !profile.parameters.some((parameter) => parameter.name === name),
    )
  )
    return null;
  const result: DeliveryAtlasParametersInput = {};
  for (const parameter of profile.parameters) {
    const raw = values[parameter.name] ?? '';
    if (raw === '') {
      if (parameter.required) return null;
      continue;
    }
    if (parameter.choices.length > 0 && !parameter.choices.includes(raw))
      return null;
    if (parameter.type === 'INTEGER') {
      if (!/^-?\d+$/.test(raw)) return null;
      const value = Number(raw);
      if (
        !Number.isSafeInteger(value) ||
        (parameter.minimum != null && value < parameter.minimum) ||
        (parameter.maximum != null && value > parameter.maximum)
      )
        return null;
      if (parameter.name === 'duration') result.duration = value;
      else if (parameter.name === 'seed') result.seed = value;
      else return null;
    } else if (parameter.type === 'BOOLEAN') {
      if (
        parameter.name !== 'generateAudio' ||
        !['true', 'false'].includes(raw)
      )
        return null;
      result.generateAudio = raw === 'true';
    } else if (parameter.type === 'STRING') {
      if (parameter.name === 'resolution') result.resolution = raw;
      else if (parameter.name === 'size') result.size = raw;
      else if (parameter.name === 'aspectRatio') result.aspectRatio = raw;
      else if (parameter.name === 'quality') result.quality = raw;
      else return null;
    } else return null;
  }
  return result;
};
export const atlasQuoteInput = (
  production: AtlasProduction,
  values: AtlasRequestValues,
  requestId: string,
): DeliveryAtlasQuoteInput | null => {
  const profile = atlasRequestProfile(production, values);
  if (
    !profile ||
    !profile.enabled ||
    !profile.available ||
    !production.allowedProfileIds.includes(profile.id) ||
    production.blockedReasons.length > 0 ||
    !production.briefApproved ||
    !production.enabled
  )
    return null;
  const parameters = atlasParameterInput(profile, values.parameters);
  if (!parameters) return null;
  const shot = production.shots.find((item) => item.id === values.shotId);
  if (
    values.target === 'BRIEF'
      ? values.kind !== 'IMAGE' || production.outputKind !== 'IMAGE'
      : !shot
  )
    return null;
  const prompt = values.prompt.trim();
  if (
    !prompt ||
    (shot &&
      prompt !==
        (values.kind === 'CLIP'
          ? shot.animationPrompt
          : shot.imagePrompt
        ).trim())
  )
    return null;
  const references =
    values.kind === 'CLIP'
      ? shot?.imageId
        ? [shot.imageId]
        : []
      : values.imageMode === 'IMAGE_EDIT'
        ? values.referenceAssetIds
        : [];
  if (
    references.length < profile.minimumReferences ||
    references.length > profile.maximumReferences ||
    new Set(references).size !== references.length ||
    references.some((id) => !production.assets.some((asset) => asset.id === id))
  )
    return null;
  return {
    taskId: production.taskId,
    taskRevision: production.taskRevision,
    requestId,
    profileId: profile.id,
    target: values.target,
    shotId: values.target === 'SHOT' ? values.shotId : null,
    prompt,
    referenceAssetIds: references,
    parameters,
  };
};
