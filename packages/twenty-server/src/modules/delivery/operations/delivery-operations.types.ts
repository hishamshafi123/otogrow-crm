import { workflowPinSchema } from 'src/modules/delivery/workflows/delivery-workflows.types';
import { type MetaReporting } from 'src/modules/delivery/advertising/delivery-meta.types';
import { type DeliveryBusiness } from 'src/modules/delivery/business/delivery-business.types';
import { type DeliveryClients } from 'src/modules/delivery/clients/delivery-clients.types';
import { z } from 'zod';
import { deliveryTaskFieldsSchema } from 'src/modules/delivery/delivery-validation';

const identifier = z.uuid();
const text = z.string().trim().min(1).max(2000);
const date = z.iso.date();
export const recurrenceSchema = z
  .object({
    id: identifier.optional(),
    projectId: identifier,
    workflow: workflowPinSchema.nullish(),
    fields: deliveryTaskFieldsSchema,
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    monthDay: z.number().int().min(1).max(31),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    startDate: date,
    endDate: date.nullable(),
    paused: z.boolean(),
    dueHours: z.number().int().min(1).max(744),
  })
  .strict()
  .refine((value) => !value.endDate || value.endDate >= value.startDate);
export type Recurrence = z.infer<typeof recurrenceSchema> & {
  id: string;
  creatorId: string;
  userWorkspaceId: string;
  lastDate: string | null;
  skipped: number;
  error: string | null;
  lastTaskId: string | null;
};
export type DeliveryNotice = {
  id: string;
  taskId: string;
  recipientId: string;
  senderId: string;
  kind: 'ASSIGNMENT' | 'REVIEW_ASSIGNMENT' | 'MESSAGE' | 'FULFILMENT' | 'ALERT';
  reviewAssignment?: {
    submissionVersion: number;
    assignmentId: string | null;
    assignmentRevision: number;
    recipientId: string;
  };
  text: string;
  createdAt: string;
  remindAt: string;
  seenAt: string | null;
  acknowledgedAt: string | null;
  cancelled: boolean;
  sendState:
    | 'PENDING'
    | 'QUEUED'
    | 'SENDING'
    | 'SENT'
    | 'UNCONFIGURED'
    | 'FAILED'
    | 'UNCERTAIN'
    | 'SUPPRESSED';
  attemptedAt: string | null;
  error: string | null;
};
export type Fulfilment = {
  deliveredSubmissionVersion?: number;
  taskId: string;
  status: 'WAITING' | 'FULFILLED' | 'REDOING';
  deliveredAt: string;
  nextCheckAt: string | null;
  cycle: number;
  history: { at: string; actorId: string; action: string; note: string }[];
};
export type DeliveryAlert = {
  sourceKey?: string;
  id: string;
  taskId: string;
  category: 'LATE' | 'CLIENT' | 'CONTRACT' | 'BUDGET';
  severity: 'NORMAL' | 'URGENT';
  reason: string;
  ownerId: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};
export type ClientFeeSetting = {
  amount: number;
  currency: string;
  cadence: 'MONTHLY' | 'QUARTERLY' | 'ONE_TIME';
  notes: string;
  updatedAt: string;
};
export type DeliveryOperations = {
  serviceCatalog?: string[];
  clientRoster?: {
    includedIds: string[];
    excludedIds: string[];
  };
  clientFees?: Record<string, ClientFeeSetting>;
  founderEscalationRouting?: {
    mode: 'RULES';
    revision: number;
    changedBy: string;
    changedAt: string;
    commandId: string;
    reason: string;
  };
  metaReporting?: MetaReporting;
  business?: DeliveryBusiness;
  clients?: DeliveryClients;
  timezone: string;
  enabled: boolean;
  telegramEnabled: boolean;
  founderId: string | null;
  templates: Recurrence[];
  notices: DeliveryNotice[];
  fulfilments: Fulfilment[];
  alerts: DeliveryAlert[];
  assignments: Record<string, string>;
  connections: Record<string, { chatId: string; linkedAt: string }>;
  linkTokens: { hash: string; memberId: string; expiresAt: string }[];
};
export const newDeliveryOperations = (): DeliveryOperations => ({
  timezone: 'UTC',
  enabled: false,
  telegramEnabled: false,
  founderId: null,
  templates: [],
  notices: [],
  fulfilments: [],
  alerts: [],
  assignments: {},
  connections: {},
  linkTokens: [],
});
const task = { taskId: identifier };
export const operationsCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('settings'),
      timezone: z.string().max(100),
      enabled: z.boolean(),
      telegramEnabled: z.boolean(),
      founderId: identifier.nullable(),
    })
    .strict(),
  z
    .object({ action: z.literal('template'), template: recurrenceSchema })
    .strict(),
  z
    .object({ action: z.literal('pause'), id: identifier, paused: z.boolean() })
    .strict(),
  z
    .object({
      action: z.literal('delivered'),
      ...task,
      revision: z.number().int().positive(),
      note: text,
    })
    .strict(),
  z
    .object({
      action: z.literal('fulfilment'),
      ...task,
      cycle: z.number().int().positive(),
      historyLength: z.number().int().nonnegative(),
      decision: z.enum(['FULFILLED', 'NOT_FULFILLED', 'REDOING']),
      note: text,
    })
    .strict(),
  z
    .object({
      action: z.literal('message'),
      ...task,
      recipientId: identifier,
      text,
    })
    .strict(),
  z.object({ action: z.literal('acknowledge'), id: identifier }).strict(),
  z.object({ action: z.literal('noticeSeen'), id: identifier }).strict(),
  z
    .object({
      action: z.literal('seen'),
      ...task,
      expectedAssignmentKey: z.string().min(1).max(150).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('alert'),
      ...task,
      category: z.enum(['CLIENT', 'CONTRACT', 'BUDGET']),
      severity: z.enum(['NORMAL', 'URGENT']),
      reason: text,
      ownerId: identifier,
    })
    .strict(),
  z
    .object({
      action: z.literal('resolveAlert'),
      id: identifier,
      resolve: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal('linkTelegram') }).strict(),
  z.object({ action: z.literal('unlinkTelegram') }).strict(),
]);
