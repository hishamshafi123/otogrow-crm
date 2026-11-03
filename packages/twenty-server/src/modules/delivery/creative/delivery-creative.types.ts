import {
  type DeliveryMediaSettings,
  type DeliveryMediaRun,
} from 'src/modules/delivery/creative/delivery-media.types';
import { z } from 'zod';

const text = z.string().trim().max(6000);
export const creativeBriefSchema = z
  .object({
    outputKind: z.enum(['IMAGE', 'VIDEO']).optional(),
    objective: z.enum(['ADS', 'ORGANIC']),
    audience: text,
    painPoint: text,
    angle: text,
    concept: text,
    productFacts: text,
    mandatoryClaims: text,
    visualDirection: text,
    format: text,
    duration: z.number().int().min(1).max(300),
    hook: text,
    cta: text,
    music: text,
    brandAssets: z.array(z.string().uuid()).max(20),
  })
  .strict();
export const creativeShotSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    imagePrompt: text,
    animationPrompt: text,
    duration: z.number().min(1).max(30),
    subject: text,
    product: text,
    location: text,
    notes: text,
    referenceId: z.string().uuid().nullable(),
  })
  .strict();
export const creativeReferenceSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    url: z
      .string()
      .url()
      .max(2000)
      .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol))
      .nullable(),
    assetId: z.string().uuid().nullable(),
    summary: text,
    angle: text,
    tags: z.array(z.string().trim().min(1).max(80)).max(20),
  })
  .strict()
  .refine((value) => value.url || value.assetId);
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;
export type CreativeShotFields = z.infer<typeof creativeShotSchema>;
export type CreativeReview = {
  memberId: string;
  at: string;
  decision: 'APPROVED' | 'REJECTED' | 'ESCALATED';
  notes: string;
};
export type CreativeReference = z.infer<typeof creativeReferenceSchema> & {
  id: string;
  version: number;
  reviews: CreativeReview[];
  sourceReferenceId?: string;
};
export type CreativeAsset = {
  storageState: 'PENDING' | 'READY' | 'FAILED';
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: string;
  briefVersion: number;
  productionVersion: number;
  assemblyVersion: number;
  shotId: string | null;
  shotVersion: number | null;
  kind:
    | 'REFERENCE'
    | 'IMAGE'
    | 'CLIP'
    | 'BASE'
    | 'HOOK'
    | 'CTA'
    | 'FINAL'
    | 'AUDIO';
  parentAssetId: string | null;
  reviews: CreativeReview[];
};
export type CreativeShot = CreativeShotFields & {
  id: string;
  version: number;
  history: (CreativeShotFields & { version: number })[];
  imageId: string | null;
  clipId: string | null;
};
export type CreativeDocument = {
  mediaSettings?: DeliveryMediaSettings;
  mediaRuns?: DeliveryMediaRun[];
  version: number;
  productionVersion: number;
  assemblyVersion: number;
  brief: CreativeBrief;
  briefVersion: number;
  approvedBriefVersion: number | null;
  briefHistory: { version: number; brief: CreativeBrief; approved: boolean }[];
  references: CreativeReference[];
  shots: CreativeShot[];
  assets: CreativeAsset[];
  finalAssetId: string | null;
  assembly: {
    assetIds: string[];
    overlayText: string;
    audioId: string | null;
    notes: string;
  };
  variants: {
    id: string;
    baseId: string;
    hookId: string;
    ctaId: string;
    selected: boolean;
  }[];
  revisionCharge: number;
};
export const newCreativeDocument = (): CreativeDocument => ({
  version: 1,
  productionVersion: 1,
  assemblyVersion: 1,
  briefVersion: 1,
  approvedBriefVersion: null,
  briefHistory: [],
  brief: {
    outputKind: 'VIDEO',
    objective: 'ADS',
    audience: '',
    painPoint: '',
    angle: '',
    concept: '',
    productFacts: '',
    mandatoryClaims: '',
    visualDirection: '',
    format: '9:16',
    duration: 15,
    hook: '',
    cta: '',
    music: '',
    brandAssets: [],
  },
  references: [],
  shots: [],
  assets: [],
  finalAssetId: null,
  assembly: { assetIds: [], overlayText: '', audioId: null, notes: '' },
  variants: [],
  revisionCharge: 0,
});
const identity = {
  taskId: z.string().uuid(),
  revision: z.number().int().positive(),
};
export const creativeCommandSchema = z.discriminatedUnion('action', [
  z.object({ ...identity, action: z.literal('initialize') }).strict(),
  z
    .object({
      ...identity,
      action: z.literal('brief'),
      brief: creativeBriefSchema,
    })
    .strict(),
  z.object({ ...identity, action: z.literal('approveBrief') }).strict(),
  z
    .object({
      ...identity,
      action: z.literal('reference'),
      fields: creativeReferenceSchema,
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('reviewReferences'),
      ids: z.array(z.string().uuid()).min(1).max(50),
      decision: z.enum(['APPROVED', 'REJECTED']),
      notes: text,
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('reuseReference'),
      sourceTaskId: z.string().uuid(),
      referenceId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('shot'),
      id: z.string().uuid().optional(),
      fields: creativeShotSchema,
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('order'),
      ids: z.array(z.string().uuid()).max(50),
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('reviewAsset'),
      assetId: z.string().uuid(),
      decision: z.enum(['APPROVED', 'REJECTED', 'ESCALATED']),
      notes: text,
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('selectAsset'),
      assetId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('assembly'),
      assetIds: z.array(z.string().uuid()).max(50),
      overlayText: text,
      audioId: z.string().uuid().nullable(),
      notes: text,
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('variants'),
      baseId: z.string().uuid(),
      hookIds: z.array(z.string().uuid()).min(1).max(3),
      ctaIds: z.array(z.string().uuid()).min(1).max(3),
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('selectVariants'),
      ids: z.array(z.string().uuid()).max(9),
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('reopen'),
      notes: z.string().trim().min(1).max(6000),
      revisionCharge: z.literal(0).optional(),
    })
    .strict(),
]);
