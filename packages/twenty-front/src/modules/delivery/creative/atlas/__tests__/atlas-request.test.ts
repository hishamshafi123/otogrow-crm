import {
  atlasInitialRequest,
  atlasRequestProfile,
  atlasParameterInput,
  atlasParameterDefaults,
  atlasQuoteInput,
} from '@/delivery/creative/atlas/atlas-request';
import {
  atlasProductionFixture,
  ATLAS_IMAGE_PROFILE_ID,
  ATLAS_EDIT_PROFILE_ID,
  ATLAS_OTHER_IMAGE_PROFILE_ID,
  ATLAS_CLIP_PROFILE_ID,
  ATLAS_ASSET_ID,
  ATLAS_REQUEST_ID,
  ATLAS_SHOT_ID,
} from '@/delivery/creative/atlas/__tests__/atlas.fixtures';
it('starts with unset models when no administrator default exists and never substitutes the first catalog model', () => {
  const source = {
    ...atlasProductionFixture(),
    defaultImageFamilyId: null,
    defaultClipProfileId: null,
  };
  const values = atlasInitialRequest(source);
  expect(values.imageFamilyId).toBe('');
  expect(values.clipProfileId).toBe('');
  expect(atlasRequestProfile(source, values)).toBeUndefined();
  expect(
    atlasQuoteInput(
      source,
      { ...values, prompt: 'Explicit image prompt' },
      ATLAS_REQUEST_ID,
    ),
  ).toBeNull();
});
it('maps friendly image families and visible operation choices to their exact supported profiles', () => {
  const source = atlasProductionFixture();
  const values = atlasInitialRequest(source);
  expect(atlasRequestProfile(source, values)?.id).toBe(ATLAS_IMAGE_PROFILE_ID);
  expect(
    atlasRequestProfile(source, { ...values, imageMode: 'IMAGE_EDIT' })?.id,
  ).toBe(ATLAS_EDIT_PROFILE_ID);
  expect(
    atlasRequestProfile(source, {
      ...values,
      imageFamilyId: 'gpt-image-2',
      imageMode: 'IMAGE_EDIT',
    }),
  ).toBeUndefined();
  expect(
    atlasRequestProfile(source, { ...values, imageFamilyId: 'gpt-image-2' })
      ?.id,
  ).toBe(ATLAS_OTHER_IMAGE_PROFILE_ID);
});
it('prepares a static image from explicit prompt and approved brief without fabricating a shot', () => {
  const source = atlasProductionFixture();
  const values = {
    ...atlasInitialRequest(source),
    prompt: 'Explicit static image prompt',
  };
  expect(atlasQuoteInput(source, values, ATLAS_REQUEST_ID)).toMatchObject({
    target: 'BRIEF',
    shotId: null,
    profileId: ATLAS_IMAGE_PROFILE_ID,
    prompt: values.prompt,
    referenceAssetIds: [],
    parameters: { resolution: '1k' },
  });
});
it('requires exact current approved image-to-video source and keeps false audio without inventing reference images', () => {
  const source = { ...atlasProductionFixture(), outputKind: 'VIDEO' };
  const profile = source.profiles.find(
    (item) => item.id === ATLAS_CLIP_PROFILE_ID,
  )!;
  const values = {
    ...atlasInitialRequest(source),
    kind: 'CLIP' as const,
    shotId: ATLAS_SHOT_ID,
    prompt: source.shots[0].animationPrompt,
    parameters: atlasParameterDefaults(profile),
  };
  expect(atlasQuoteInput(source, values, ATLAS_REQUEST_ID)).toMatchObject({
    profileId: ATLAS_CLIP_PROFILE_ID,
    referenceAssetIds: [ATLAS_ASSET_ID],
    parameters: { duration: 8, generateAudio: false },
  });
  expect(
    atlasQuoteInput({ ...source, assets: [] }, values, ATLAS_REQUEST_ID),
  ).toBeNull();
  expect(
    atlasQuoteInput(
      source,
      { ...values, prompt: 'Changed unsaved shot prompt' },
      ATLAS_REQUEST_ID,
    ),
  ).toBeNull();
});
it('rejects unsupported, non-finite and removed parameters rather than silently coercing them', () => {
  const profile = atlasProductionFixture().profiles.find(
    (item) => item.id === ATLAS_CLIP_PROFILE_ID,
  )!;
  expect(
    atlasParameterInput(profile, { duration: '8', generateAudio: 'false' }),
  ).toEqual({ duration: 8, generateAudio: false });
  for (const duration of ['', 'Infinity', '4.5', '30', '-1'])
    expect(
      atlasParameterInput(profile, { duration, generateAudio: 'false' }),
    ).toBeNull();
  expect(
    atlasParameterInput(profile, {
      duration: '8',
      generateAudio: 'false',
      removedOption: 'keep-visible',
    }),
  ).toBeNull();
});
it('blocks disabled or unapproved source without changing its prepared selection', () => {
  const source = atlasProductionFixture();
  const values = { ...atlasInitialRequest(source), prompt: 'Prepared input' };
  expect(
    atlasQuoteInput({ ...source, enabled: false }, values, ATLAS_REQUEST_ID),
  ).toBeNull();
  expect(
    atlasQuoteInput(
      { ...source, briefApproved: false },
      values,
      ATLAS_REQUEST_ID,
    ),
  ).toBeNull();
  expect(
    atlasQuoteInput(
      { ...source, allowedProfileIds: [] },
      values,
      ATLAS_REQUEST_ID,
    ),
  ).toBeNull();
  expect(values.imageFamilyId).toBe('nano-banana-pro');
});
