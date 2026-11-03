import {
  ATLAS_IMAGE_FAMILIES,
  ATLAS_PROFILES,
  atlasProfile,
  normalizeAtlasParameters,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.catalog';
import {
  atlasHash,
  atlasQuoteSchema,
  atlasSettingsSchema,
  parseAtlasInput,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.policy';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { newCreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
import { DeliveryAtlasProductionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-production.service';
import { type DeliveryAtlasConnectionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-connection.service';

describe('Atlas curated generation catalog', () => {
  it('keeps each image family tied to distinct, explicit text and edit profiles', () => {
    expect(new Set(ATLAS_PROFILES.map((profile) => profile.id)).size).toBe(
      ATLAS_PROFILES.length,
    );
    for (const family of ATLAS_IMAGE_FAMILIES) {
      const text = atlasProfile(family.textToImageProfileId!);
      const edit = atlasProfile(family.imageEditProfileId!);
      expect(text.operation).toBe('TEXT_TO_IMAGE');
      expect(text.maximumReferences).toBe(0);
      expect(edit.operation).toBe('IMAGE_EDIT');
      expect(edit.minimumReferences).toBe(1);
      expect(edit.familyId).toBe(text.familyId);
    }
  });
  it('keeps Seedance estimated pricing unavailable rather than inventing a bound', () => {
    expect(
      ATLAS_PROFILES.filter((profile) =>
        profile.familyId.startsWith('seedance'),
      ).every((profile) => profile.estimatedBilling),
    ).toBe(true);
  });
  it.each(['openai/gpt-image-2/text-to-image', 'openai/gpt-image-2/edit'])(
    'blocks %s before estimation even if calculate would omit estimated:true',
    async (profileId) => {
      const document = newCreativeDocument();
      document.approvedBriefVersion = document.briefVersion;
      document.brief.outputKind = 'IMAGE';
      const service = new DeliveryAtlasProductionService(
        {} as DataSource,
        {
          scope: async () => ({
            task: { revision: 1, details: { creative: document } },
          }),
        } as unknown as DeliveryCreativeService,
        {} as DeliveryAtlasConnectionService,
      );
      expect(atlasProfile(profileId).estimatedBilling).toBe(true);
      await expect(
        service.freeze(
          {} as EntityManager,
          {} as WorkspaceEntity,
          'member',
          'membership',
          {
            taskId: 'a59c4f09-49ca-4b74-bfb9-9d3032f68a10',
            taskRevision: 1,
            requestId: 'a59c4f09-49ca-4b74-bfb9-9d3032f68a11',
            profileId,
            target: 'BRIEF',
            shotId: null,
            prompt: 'Explicit still image',
            referenceAssetIds: [],
            parameters: {},
          },
        ),
      ).rejects.toThrow('unbounded estimated billing');
    },
  );
  it('rejects aliases, automatic duration and unrelated model parameters', () => {
    expect(() => atlasProfile('veo')).toThrow();
    const profile = atlasProfile('google/veo3.1-fast/image-to-video');
    expect(() => normalizeAtlasParameters(profile, { duration: -1 })).toThrow();
    expect(() =>
      normalizeAtlasParameters(profile, { size: '1024x1024' }),
    ).toThrow();
    expect(() =>
      normalizeAtlasParameters(profile, { duration: 4, resolution: '4k' }),
    ).toThrow();
    expect(
      normalizeAtlasParameters(profile, { duration: 8, resolution: '4k' }),
    ).toEqual(expect.objectContaining({ duration: 8, resolution: '4k' }));
  });
  it('uses canonical object hashing across JSONB key ordering without changing array order', () => {
    expect(atlasHash({ a: 1, b: { y: 2, x: 1 } })).toBe(
      atlasHash({ b: { x: 1, y: 2 }, a: 1 }),
    );
    expect(atlasHash(['a', 'b'])).not.toBe(atlasHash(['b', 'a']));
  });
  it('supports a static-image brief with no fabricated shot and rejects inconsistent targets', () => {
    const input = {
      taskId: 'a59c4f09-49ca-4b74-bfb9-9d3032f68a10',
      taskRevision: 1,
      requestId: 'a59c4f09-49ca-4b74-bfb9-9d3032f68a11',
      profileId: ATLAS_PROFILES[0].id,
      target: 'BRIEF',
      shotId: null,
      prompt: 'Still image',
      referenceAssetIds: [],
      parameters: {},
    };
    expect(parseAtlasInput(atlasQuoteSchema, input).shotId).toBeNull();
    expect(() =>
      parseAtlasInput(atlasQuoteSchema, { ...input, target: 'SHOT' }),
    ).toThrow();
  });
  it('permits unset defaults and explicit nullable keep-key input without allowing zero reservations', () => {
    const input = {
      revision: 0,
      apiKey: null,
      enabled: false,
      enabledProfileIds: [],
      defaultImageFamilyId: null,
      defaultClipProfileId: null,
      reservationLimits: [],
    };
    expect(
      parseAtlasInput(atlasSettingsSchema, input).defaultImageFamilyId,
    ).toBeNull();
    expect(() =>
      parseAtlasInput(atlasSettingsSchema, {
        ...input,
        reservationLimits: [
          {
            profileId: ATLAS_PROFILES[0].id,
            maximumCostUsd: '0',
            source: 'Reviewed',
            verifiedAt: '2026-10-29T00:00:00Z',
          },
        ],
      }),
    ).toThrow();
  });
});
