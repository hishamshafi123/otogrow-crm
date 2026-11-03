import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { engagementSchema } from 'src/modules/delivery/clients/delivery-clients.types';
import { deliveryTaskFieldsSchema } from 'src/modules/delivery/delivery-validation';

const identifier = z.uuid();
export const clientSetupContextSchema = z
  .object({
    companySearch: z
      .string()
      .trim()
      .max(160)
      .nullish()
      .transform((value) => value ?? ''),
    companyId: identifier.nullish().transform((value) => value ?? null),
    projectId: identifier.nullish().transform((value) => value ?? null),
  })
  .strict()
  .refine((input) => !input.projectId || Boolean(input.companyId));
export const clientSetupPlanSchema = engagementSchema.omit({
  id: true,
  revision: true,
  projectId: true,
});
export const clientSetupTaskSchema = deliveryTaskFieldsSchema
  .omit({ checklist: true })
  .extend({ checklist: z.array(z.string().trim().min(1).max(200)).max(100) })
  .strict();
export const clientSetupCreateSchema = z
  .object({
    requestId: identifier,
    companyId: identifier,
    companySourceToken: z.string().regex(/^[a-f0-9]{64}$/),
    projectId: identifier.nullable(),
    projectRevision: z.number().int().positive().nullable(),
    projectName: z.string().trim().min(1).max(200).nullable(),
    memberIds: z
      .array(identifier)
      .max(200)
      .transform((values) => [...new Set(values)].sort()),
    engagementId: identifier.nullable(),
    engagementRevision: z.number().int().positive().nullable(),
    plan: clientSetupPlanSchema.nullable(),
    firstTask: clientSetupTaskSchema.nullable(),
  })
  .strict()
  .refine((input) =>
    input.projectId
      ? input.projectRevision !== null &&
        input.projectName === null &&
        input.memberIds.length === 0
      : input.projectRevision === null && input.projectName !== null,
  )
  .refine((input) =>
    input.engagementId
      ? input.projectId !== null &&
        input.engagementRevision !== null &&
        input.plan === null
      : input.engagementRevision === null && input.plan !== null,
  );
export const clientSetupReceiptSchema = z
  .object({ requestId: identifier })
  .strict();
export const parseClientSetup = <TResult>(
  schema: z.ZodType<TResult>,
  input: unknown,
): TResult => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Review the selected company, project, team, service plan and first task.',
    );
  return parsed.data;
};
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value instanceof Date
      ? value.toISOString()
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, item]) => [key, canonical(item)]),
          )
        : value;
export const clientSetupHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
export type ClientSetupCommand = z.infer<typeof clientSetupCreateSchema>;
export type ClientSetupCompany = {
  id: string;
  name: string;
  updatedAt: string;
  sourceToken: string;
};
