import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  type AtlasKind,
  type AtlasOperation,
  type AtlasParameters,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.types';
import { type DeliveryAtlasParameterDTO } from 'src/modules/delivery/creative/atlas/delivery-atlas.dto';

export const ATLAS_SCHEMA_REVISION = '2026-10-29.1';
export const ATLAS_MODEL_PREFIX = 'atlascloud/';
export type AtlasProfile = {
  id: string;
  familyId: string;
  label: string;
  kind: AtlasKind;
  operation: AtlasOperation;
  minimumReferences: number;
  maximumReferences: number;
  parameters: DeliveryAtlasParameterDTO[];
  remoteKeys: Partial<Record<keyof AtlasParameters, string>>;
  estimatedBilling: boolean;
};
const choice = (
  name: keyof AtlasParameters,
  label: string,
  choices: string[],
  defaultValue: string,
): DeliveryAtlasParameterDTO => ({
  name,
  label,
  type: 'STRING',
  required: true,
  choices,
  defaultValue,
  minimum: null,
  maximum: null,
});
const duration = (
  minimum: number,
  maximum: number,
  defaultValue = '5',
): DeliveryAtlasParameterDTO => ({
  name: 'duration',
  label: 'Duration in seconds',
  type: 'INTEGER',
  required: true,
  choices: [],
  defaultValue,
  minimum,
  maximum,
});
const sound: DeliveryAtlasParameterDTO = {
  name: 'generateAudio',
  label: 'Generate audio',
  type: 'BOOLEAN',
  required: true,
  choices: [],
  defaultValue: 'false',
  minimum: null,
  maximum: null,
};
const ratios = [
  '1:1',
  '3:2',
  '2:3',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
];
const image = (
  familyId: string,
  label: string,
  textId: string,
  editId: string,
  maximumReferences: number,
  parameters: DeliveryAtlasParameterDTO[],
  remoteKeys: AtlasProfile['remoteKeys'],
  estimatedBilling = false,
): AtlasProfile[] => [
  {
    id: textId,
    familyId,
    label: `${label} · Text to image`,
    kind: 'IMAGE',
    operation: 'TEXT_TO_IMAGE',
    minimumReferences: 0,
    maximumReferences: 0,
    parameters,
    remoteKeys,
    estimatedBilling,
  },
  {
    id: editId,
    familyId,
    label: `${label} · Image edit`,
    kind: 'IMAGE',
    operation: 'IMAGE_EDIT',
    minimumReferences: 1,
    maximumReferences,
    parameters,
    remoteKeys,
    estimatedBilling,
  },
];
const video = (
  id: string,
  familyId: string,
  label: string,
  parameters: DeliveryAtlasParameterDTO[],
  remoteKeys: AtlasProfile['remoteKeys'],
  estimatedBilling = false,
): AtlasProfile => ({
  id,
  familyId,
  label,
  kind: 'CLIP',
  operation: 'IMAGE_TO_VIDEO',
  minimumReferences: 1,
  maximumReferences: 1,
  parameters,
  remoteKeys,
  estimatedBilling,
});
export const ATLAS_PROFILES: AtlasProfile[] = [
  ...image(
    'nano-banana-pro',
    'Nano Banana Pro',
    'google/nano-banana-pro/text-to-image',
    'google/nano-banana-pro/edit',
    10,
    [
      choice('resolution', 'Resolution', ['1k', '2k', '4k'], '1k'),
      choice('aspectRatio', 'Aspect ratio', ratios, '1:1'),
    ],
    { resolution: 'resolution', aspectRatio: 'aspect_ratio' },
  ),
  ...image(
    'seedream-5-pro',
    'Seedream 5 Pro',
    'bytedance/seedream-v5.0-pro/text-to-image',
    'bytedance/seedream-v5.0-pro/edit',
    10,
    [
      choice(
        'size',
        'Image size',
        [
          '2048*2048',
          '2368*1776',
          '1776*2368',
          '2816*1584',
          '1584*2816',
          '2496*1664',
          '1664*2496',
          '3136*1344',
          '1024*1024',
          '1536*1536',
          '1776*1328',
          '1328*1776',
          '2048*1152',
          '1152*2048',
        ],
        '2048*2048',
      ),
    ],
    { size: 'size' },
  ),
  ...image(
    'gpt-image-2',
    'GPT Image 2',
    'openai/gpt-image-2/text-to-image',
    'openai/gpt-image-2/edit',
    10,
    [
      choice(
        'size',
        'Image size',
        ['1024x1024', '1536x1024', '1024x1536', '1536x864', '864x1536'],
        '1024x1024',
      ),
      choice('quality', 'Quality', ['low', 'medium', 'high'], 'medium'),
    ],
    { size: 'size', quality: 'quality' },
    true,
  ),
  ...image(
    'flux-2-pro',
    'FLUX 2 Pro',
    'black-forest-labs/flux-2-pro/text-to-image',
    'black-forest-labs/flux-2-pro/edit',
    8,
    [
      choice(
        'size',
        'Image size',
        ['1024*1024', '1280*720', '720*1280'],
        '1024*1024',
      ),
    ],
    { size: 'size' },
  ),
  video(
    'bytedance/seedance-2.0/image-to-video',
    'seedance-2',
    'Seedance 2 · Image to video',
    [
      duration(4, 15),
      choice('resolution', 'Resolution', ['480p', '720p', '1080p'], '720p'),
      choice(
        'aspectRatio',
        'Aspect ratio',
        ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
        'adaptive',
      ),
      sound,
    ],
    {
      duration: 'duration',
      resolution: 'resolution',
      aspectRatio: 'ratio',
      generateAudio: 'generate_audio',
    },
    true,
  ),
  video(
    'bytedance/seedance-2.5/image-to-video',
    'seedance-2-5',
    'Seedance 2.5 · Image to video',
    [
      duration(4, 30),
      choice(
        'resolution',
        'Native resolution',
        ['480p', '720p', '1080p'],
        '720p',
      ),
      choice('aspectRatio', 'Aspect ratio', ['adaptive'], 'adaptive'),
      sound,
    ],
    {
      duration: 'duration',
      resolution: 'resolution',
      aspectRatio: 'ratio',
      generateAudio: 'generate_audio',
    },
    true,
  ),
  video(
    'google/veo3.1-fast/image-to-video',
    'veo-3-1-fast',
    'Veo 3.1 Fast · Image to video',
    [
      { ...duration(4, 8, '8'), choices: ['4', '6', '8'] },
      choice('resolution', 'Resolution', ['720p', '1080p', '4k'], '720p'),
      choice('aspectRatio', 'Aspect ratio', ['16:9', '9:16'], '9:16'),
      sound,
    ],
    {
      duration: 'duration',
      resolution: 'resolution',
      aspectRatio: 'aspect_ratio',
      generateAudio: 'generate_audio',
    },
  ),
  video(
    'kwaivgi/kling-v3.0-pro/image-to-video',
    'kling-3-pro',
    'Kling 3 Pro · Image to video',
    [
      duration(3, 15),
      choice('resolution', 'Native resolution', ['1080P'], '1080P'),
      sound,
    ],
    { duration: 'duration', resolution: 'resolution', generateAudio: 'sound' },
  ),
  video(
    'alibaba/wan-3.0/image-to-video',
    'wan-3',
    'Wan 3 · Image to video',
    [
      duration(2, 30),
      choice(
        'resolution',
        'Native resolution',
        ['480p', '720p', '1080p'],
        '720p',
      ),
      sound,
    ],
    { duration: 'duration', resolution: 'resolution', generateAudio: 'audio' },
  ),
  video(
    'minimax/h3/image-to-video',
    'minimax-h3',
    'MiniMax H3 · Image to video',
    [
      duration(4, 15, '8'),
      choice('resolution', 'Native resolution', ['480P', '768P', '2K'], '768P'),
      choice('aspectRatio', 'Aspect ratio', ['adaptive'], 'adaptive'),
    ],
    { duration: 'duration', resolution: 'resolution', aspectRatio: 'ratio' },
  ),
];
export const atlasProfile = (id: string): AtlasProfile => {
  const profile = ATLAS_PROFILES.find((candidate) => candidate.id === id);
  if (!profile)
    throw new BadRequestException(
      'Choose a supported Atlas model and operation.',
    );
  return profile;
};
export const ATLAS_IMAGE_FAMILIES = [
  ...new Set(
    ATLAS_PROFILES.filter((profile) => profile.kind === 'IMAGE').map(
      (profile) => profile.familyId,
    ),
  ),
].map((id) => ({
  id,
  label: ATLAS_PROFILES.find((profile) => profile.familyId === id)!.label.split(
    ' · ',
  )[0],
  textToImageProfileId:
    ATLAS_PROFILES.find(
      (profile) =>
        profile.familyId === id && profile.operation === 'TEXT_TO_IMAGE',
    )?.id ?? null,
  imageEditProfileId:
    ATLAS_PROFILES.find(
      (profile) =>
        profile.familyId === id && profile.operation === 'IMAGE_EDIT',
    )?.id ?? null,
}));
export const normalizeAtlasParameters = (
  profile: AtlasProfile,
  input: unknown,
): AtlasParameters => {
  const parsed = z
    .object({
      resolution: z.string().max(50).nullish(),
      size: z.string().max(50).nullish(),
      aspectRatio: z.string().max(50).nullish(),
      duration: z.number().int().nullish(),
      generateAudio: z.boolean().nullish(),
      quality: z.string().max(50).nullish(),
      seed: z.number().int().min(-1).max(2147483647).nullish(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    throw new BadRequestException('Check this model’s generation parameters.');
  const supplied = Object.fromEntries(
    Object.entries(parsed.data).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );
  if (
    Object.keys(supplied).some(
      (key) => !profile.parameters.some((parameter) => parameter.name === key),
    )
  )
    throw new BadRequestException(
      'This parameter is unavailable for the selected model.',
    );
  const result: Record<string, string | number | boolean> = {};
  for (const parameter of profile.parameters) {
    const value =
      supplied[parameter.name] ??
      (parameter.type === 'INTEGER'
        ? Number(parameter.defaultValue)
        : parameter.type === 'BOOLEAN'
          ? parameter.defaultValue === 'true'
          : parameter.defaultValue);
    if (
      value === null ||
      value === undefined ||
      (parameter.choices.length > 0 &&
        !parameter.choices.includes(String(value))) ||
      (parameter.type === 'INTEGER' &&
        (typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < (parameter.minimum ?? 0) ||
          value > (parameter.maximum ?? 2147483647))) ||
      (parameter.type === 'BOOLEAN' && typeof value !== 'boolean')
    )
      throw new BadRequestException(
        'Choose supported, finite settings for this model.',
      );
    result[parameter.name] = value;
  }
  if (
    profile.id === 'google/veo3.1-fast/image-to-video' &&
    result.resolution !== '720p' &&
    result.duration !== 8
  )
    throw new BadRequestException(
      'Veo 1080p and 4K require an eight-second clip.',
    );
  return result as AtlasParameters;
};
