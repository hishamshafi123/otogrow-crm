import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FATHOM_MAX_BYTES = 1024 * 1024;
export const FATHOM_MAX_CHARACTERS = 200000;
export const fathomHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const fathomRecordingId = z.string().regex(/^[1-9][0-9]{0,14}$/);
const dateTime = z.iso.datetime({ offset: true });
export const fathomProjectInput = z
  .object({ projectId: z.uuid(), sourceId: z.uuid() })
  .strict();
export const fathomSettingsInput = z
  .object({
    revision: z.number().int().nonnegative(),
    enabled: z.boolean(),
    apiKey: z.string().trim().min(1).max(2000).nullish(),
    removeCredential: z.boolean().optional(),
  })
  .strict();
export const fathomMeetingsInput = fathomProjectInput
  .extend({
    createdAfter: dateTime,
    createdBefore: dateTime,
    after: z.string().max(2000).nullish(),
    exactUrl: z.string().max(2000).nullish(),
  })
  .strict()
  .refine(
    (value) =>
      Date.parse(value.createdAfter) < Date.parse(value.createdBefore) &&
      Date.parse(value.createdBefore) - Date.parse(value.createdAfter) <=
        366 * 86400000,
    'Choose a date range of no more than one year.',
  );
export const fathomPreviewInput = fathomProjectInput
  .extend({
    recordingId: fathomRecordingId,
    meetingProof: z.string().max(16000).nullish(),
  })
  .strict();
export const fathomMeetingSchema = z
  .object({
    recordingId: fathomRecordingId,
    title: z.string().max(1000).nullable(),
    recordedAt: dateTime.nullable(),
    sourceUrl: z.string().max(2000).nullable(),
  })
  .strict();
export const fathomProofSchema = z
  .object({
    version: z.literal(1),
    purpose: z.enum(['FATHOM_MEETING', 'FATHOM_TRANSCRIPT']),
    workspaceId: z.uuid(),
    memberId: z.uuid(),
    userWorkspaceId: z.uuid(),
    projectId: z.uuid(),
    projectRevision: z.number().int().positive(),
    companyId: z.uuid().nullable(),
    sourceId: z.uuid(),
    connectionRevision: z.number().int().positive(),
    meeting: fathomMeetingSchema,
    capturedAt: dateTime,
    expiresAt: dateTime,
    transcriptHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    segmentCount: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const parseFathomInput = <TOutput>(
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Check the Fathom input and its limits.');
  return result.data;
};
export const normalizeFathomUrl = (input: string): string => {
  let value: URL;
  try {
    value = new URL(input);
  } catch {
    throw new BadRequestException(
      'Use an exact HTTPS fathom.video meeting or share link.',
    );
  }
  if (
    value.protocol !== 'https:' ||
    value.hostname !== 'fathom.video' ||
    value.port ||
    value.username ||
    value.password ||
    !/^\/(?:calls\/|share\/)?[A-Za-z0-9_-]+\/?$/.test(value.pathname)
  )
    throw new BadRequestException(
      'Use an exact HTTPS fathom.video meeting or share link.',
    );
  return `${value.origin}${value.pathname.replace(/\/$/, '')}`;
};
export const formatFathomTranscript = (raw: unknown) => {
  const segments = parseFathomInput(
    z.object({
      transcript: z
        .array(
          z.object({
            speaker: z.object({
              display_name: z.string().max(300).nullable().optional(),
            }),
            text: z.string().max(FATHOM_MAX_CHARACTERS),
            timestamp: z.string().regex(/^\d{2,3}:[0-5]\d:[0-5]\d$/),
          }),
        )
        .max(20000),
    }),
    raw,
  ).transcript;
  const transcript = segments
    .map(
      (segment) =>
        `[${segment.timestamp}] ${segment.speaker.display_name?.trim() || 'Unknown speaker'}: ${segment.text}`,
    )
    .join('\n')
    .trim();
  if (
    !segments.some((segment) => segment.text.trim()) ||
    transcript.length > FATHOM_MAX_CHARACTERS ||
    Buffer.byteLength(transcript, 'utf8') > FATHOM_MAX_BYTES ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(transcript)
  )
    throw new BadRequestException(
      'The transcript is empty, unsupported or exceeds the import limit. Export a smaller text selection instead.',
    );
  return {
    transcript,
    segmentCount: segments.length,
    transcriptHash: fathomHash(transcript),
  };
};
