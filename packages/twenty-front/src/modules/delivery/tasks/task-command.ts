import { z } from 'zod';
const checklist = z.array(
  z.object({ id: z.string(), text: z.string(), done: z.boolean() }),
);
export const taskCommandSchema = z
  .object({
    action: z.string().min(1),
    taskId: z.string().nullish(),
    revision: z.number().int().nullish(),
    projectId: z.string().nullish(),
    fields: z
      .object({
        title: z.string(),
        brief: z.string(),
        service: z.string(),
        priority: z.string(),
        scheduledDate: z.string().nullable(),
        dueAt: z.string().nullable(),
        assigneeId: z.string(),
        reviewerId: z.string(),
        checklist,
        evidence: z.array(z.string()),
      })
      .nullish(),
    state: z.string().nullish(),
    blocker: z.string().nullish(),
    checklist: checklist.nullish(),
    evidence: z.array(z.string()).nullish(),
    description: z.string().nullish(),
    decision: z.string().nullish(),
    feedback: z.string().nullish(),
    text: z.string().nullish(),
    selectedSubmissionVersion: z.number().int().nullish(),
    reviewAssignmentRevision: z.number().int().nullish(),
    creativeVersion: z.number().int().nullish(),
    finalAssetId: z.string().nullish(),
    plan: z.unknown().optional(),
    workflow: z.unknown().optional(),
    workflowReview: z.unknown().optional(),
  })
  .strict();
