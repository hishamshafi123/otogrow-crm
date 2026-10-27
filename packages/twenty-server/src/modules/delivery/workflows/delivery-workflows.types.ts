import { z } from 'zod';
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const label = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(3).max(1000);
const revision = z.number().int().nonnegative();
const check = z.object({ id: key, label, required: z.boolean() }).strict();
const evidence = z
  .object({
    id: key,
    label,
    instructions: z.string().trim().max(2000),
    kind: z.enum(['LINK', 'TEXT']),
    required: z.boolean(),
  })
  .strict();
const uniqueIds = (items: { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;
export const workflowDefinitionSchema = z
  .object({
    name: label,
    description: z.string().trim().max(2000),
    service: z.enum([
      'AI_VIDEO',
      'STATIC_AD',
      'SEO',
      'PERFORMANCE_MARKETING',
      'WEB',
      'APP',
      'CUSTOM',
    ]),
    definitionOfDone: z.string().trim().min(1).max(4000),
    checklist: z
      .array(check)
      .max(50)
      .refine(uniqueIds, 'Checklist identifiers must be unique.'),
    evidence: z
      .array(evidence)
      .max(25)
      .refine(uniqueIds, 'Evidence identifiers must be unique.'),
    reviewChecks: z
      .array(check)
      .max(25)
      .refine(uniqueIds, 'Review identifiers must be unique.'),
  })
  .strict();
export type DeliveryWorkflowDefinition = z.infer<
  typeof workflowDefinitionSchema
>;
export type DeliveryWorkflowAnswer = { requirementId: string; value: string };
export type DeliveryAppliedWorkflow = {
  templateId: string;
  version: number;
  revision: number;
  definition: DeliveryWorkflowDefinition;
  checkedIds: string[];
  evidence: DeliveryWorkflowAnswer[];
  appliedAt: string;
  appliedBy: string;
  appliedByName: string;
};
export const workflowCatalogSchema = z
  .object({
    includeArchived: z.boolean().nullish(),
    templateId: z.uuid().nullish(),
  })
  .strict();
export const workflowSaveSchema = z
  .object({
    id: z.uuid(),
    revision,
    definition: workflowDefinitionSchema,
    reason,
  })
  .strict();
export const workflowArchiveSchema = z
  .object({ id: z.uuid(), revision, archived: z.boolean(), reason })
  .strict();
export const taskWorkflowSchema = z
  .object({
    taskId: z.uuid(),
    historyCursor: z.string().max(1000).nullish(),
    limit: z.number().int().min(1).max(50).nullish(),
  })
  .strict();
export const workflowApplySchema = z
  .object({
    taskId: z.uuid(),
    taskRevision: revision,
    templateId: z.uuid(),
    templateRevision: revision,
    version: z.number().int().positive(),
    reopen: z.boolean(),
    reason,
  })
  .strict();
export const workflowProgressSchema = z
  .object({
    taskId: z.uuid(),
    taskRevision: revision,
    workflowRevision: revision,
    checkedIds: z.array(key).max(50),
    evidence: z
      .array(
        z
          .object({ requirementId: key, value: z.string().trim().max(8000) })
          .strict(),
      )
      .max(25),
  })
  .strict();
export const workflowPinSchema = z
  .object({ templateId: z.uuid(), version: z.number().int().positive() })
  .strict();
export const workflowReviewSchema = z
  .object({ checkedIds: z.array(key).max(25) })
  .strict();
