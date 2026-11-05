import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FileTypeParser } from 'file-type';
import { z } from 'zod';

export const KNOWLEDGE_ASSET_MAX_BYTES = 20 * 1024 * 1024;
export const KNOWLEDGE_ASSET_MAX_ATTACHMENTS = 10;
export const KNOWLEDGE_ASSET_MAX_PROJECT_BYTES = 1024 * 1024 * 1024;
export const KNOWLEDGE_ASSET_MAX_PROJECT_FILES = 500;
export const knowledgeAssetBindingSchema = z
  .object({
    id: z.uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const knowledgeAssetBindingsSchema = z
  .array(knowledgeAssetBindingSchema)
  .max(KNOWLEDGE_ASSET_MAX_ATTACHMENTS)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'Choose each file only once.',
  );
export type KnowledgeAssetBinding = z.infer<typeof knowledgeAssetBindingSchema>;
export const knowledgeUploadSchema = z
  .object({
    requestId: z.uuid(),
    projectId: z.uuid(),
    sourceId: z.uuid(),
    sourceRevision: z.number().int().nonnegative(),
    expectedCompanyId: z.uuid().nullable(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^\u0000-\u001f\u007f/\\]+$/),
    size: z.number().int().positive().max(KNOWLEDGE_ASSET_MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const knowledgeUploadSelectionSchema = z
  .object({
    projectId: z.uuid(),
    sourceId: z.uuid(),
    requestId: z.uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type KnowledgeUploadInput = z.infer<typeof knowledgeUploadSchema>;
export type KnowledgeUploadSelection = z.infer<
  typeof knowledgeUploadSelectionSchema
>;
export const parseKnowledgeAssetInput = <TData>(
  schema: z.ZodType<TData>,
  raw: unknown,
): TData => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues[0]?.message ?? 'Check the selected brand file.',
    );
  return parsed.data;
};
export const knowledgeAssetDigest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const MIME_EXTENSIONS: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};
export const inspectKnowledgeAsset = async (
  input: Pick<KnowledgeUploadInput, 'name' | 'size' | 'sha256'>,
  bytes: Buffer,
) => {
  if (
    !bytes.length ||
    bytes.length > KNOWLEDGE_ASSET_MAX_BYTES ||
    bytes.length !== input.size ||
    knowledgeAssetDigest(bytes) !== input.sha256
  )
    throw new BadRequestException(
      'The file bytes do not match the selected size and SHA256. Select the file again.',
    );
  let detected;
  try {
    detected = await new FileTypeParser().fromBuffer(bytes);
  } catch {
    detected = undefined;
  }
  const extension = input.name.split('.').pop()?.toLowerCase() ?? '';
  if (!detected || !MIME_EXTENSIONS[detected.mime]?.includes(extension))
    throw new BadRequestException(
      'Choose a PNG, JPEG, WebP or PDF with a matching file extension, up to 20 MiB.',
    );
  return detected.mime;
};

// These aliases are internal SQL constants; every file retains its original source and company boundary.
export const knowledgeAssetAnchorSql = (source: string, version: string) =>
  `NOT EXISTS (SELECT 1 FROM jsonb_array_elements(${version}.attachments) binding LEFT JOIN core."deliveryKnowledgeAsset" knowledge_asset ON knowledge_asset.id::text=(binding->>'id') AND knowledge_asset."workspaceId"=${source}."workspaceId" AND knowledge_asset."sourceId"=${source}.id JOIN core."deliveryProject" knowledge_project ON knowledge_project.id=${source}."projectId" AND knowledge_project."workspaceId"=${source}."workspaceId" WHERE knowledge_asset.id IS NULL OR knowledge_asset."projectId"<>knowledge_project.id OR knowledge_asset."companyId" IS DISTINCT FROM knowledge_project."companyId" OR knowledge_asset.state<>'READY' OR knowledge_asset.sha256 IS DISTINCT FROM (binding->>'sha256'))`;
