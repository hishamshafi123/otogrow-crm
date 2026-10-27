import {
  workflowPinSchema,
  workflowReviewSchema,
} from 'src/modules/delivery/workflows/delivery-workflows.types';
import { z } from 'zod';
import { deliveryTaskPlanSchema } from 'src/modules/delivery/capacity/delivery-capacity.types';

const text = z.string().trim().max(20000);
const name = z.string().trim().min(1).max(200);
const id = z.uuid();
const evidence = z
  .array(
    z
      .url()
      .max(2000)
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  )
  .max(30);
const date = z.iso.date().nullable();
const checklist = z
  .array(z.object({ id, text: name, done: z.boolean() }).strict())
  .max(100);
export const deliveryTaskFieldsSchema = z
  .object({
    title: name,
    brief: text,
    service: z.string().trim().max(100),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']),
    scheduledDate: date,
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    assigneeId: id,
    reviewerId: id,
    checklist,
    evidence,
  })
  .strict();

export const deliveryCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('plan'),
      taskId: id,
      revision: z.number().int().positive(),
      plan: deliveryTaskPlanSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('project'),
      id: id.optional(),
      revision: z.number().int().positive().optional(),
      name,
      companyId: id.nullable(),
      memberIds: z.array(id).max(200),
    })
    .strict()
    .refine((command) => Boolean(command.id) === Boolean(command.revision)),
  z
    .object({
      action: z.literal('member'),
      workspaceMemberId: id,
      access: z.enum(['ADMIN', 'MANAGER', 'MEMBER']),
      roleLabel: z.string().trim().max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('create'),
      projectId: id,
      fields: deliveryTaskFieldsSchema,
      workflow: workflowPinSchema.nullish(),
    })
    .strict(),
  z
    .object({
      action: z.literal('edit'),
      taskId: id,
      revision: z.number().int().positive(),
      fields: deliveryTaskFieldsSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('progress'),
      taskId: id,
      revision: z.number().int().positive(),
      state: z.enum(['PLANNED', 'IN_PROGRESS', 'BLOCKED']),
      blocker: text,
      checklist,
      evidence,
    })
    .strict(),
  z
    .object({
      action: z.literal('submit'),
      taskId: id,
      revision: z.number().int().positive(),
      description: name,
      evidence,
    })
    .strict(),
  z
    .object({
      action: z.literal('review'),
      workflowReview: workflowReviewSchema.optional(),
      taskId: id,
      revision: z.number().int().positive(),
      decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
      feedback: text,
    })
    .strict(),
  z
    .object({
      action: z.literal('comment'),
      taskId: id,
      revision: z.number().int().positive(),
      text: name,
    })
    .strict(),
]);
export type DeliveryCommand = z.infer<typeof deliveryCommandSchema>;
