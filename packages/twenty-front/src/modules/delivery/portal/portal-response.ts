import { z } from 'zod';
import { parseFinanceAmountMicros } from '@/delivery/finance/finance-money';

export const portalSessionSchema = z.object({
  engagement: z.object({
    name: z.string(),
    services: z.array(z.string()),
    scope: z.string(),
    allowance: z.string(),
    contact: z.string(),
    revision: z.number().int().positive(),
    fields: z.array(
      z.object({ id: z.string(), label: z.string(), required: z.boolean() }),
    ),
  }),
  assets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mimeType: z.string(),
      size: z.number(),
      createdAt: z.string(),
    }),
  ),
  submissions: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      formRevision: z.number().int().positive(),
      accepted: z.boolean(),
      answers: z.array(z.object({ label: z.string(), value: z.string() })),
    }),
  ),
  shares: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      kind: z.enum(['BRIEF', 'SUBMISSION']),
      version: z.number().int().positive(),
      content: z.string(),
      links: z.array(z.string()),
      hasAsset: z.boolean().optional(),
      reviews: z.array(
        z.object({
          id: z.string(),
          at: z.string(),
          decision: z.enum(['COMMENT', 'APPROVED', 'CHANGES_REQUESTED']),
          comment: z.string(),
        }),
      ),
    }),
  ),
  advertising: z
    .object({
      currency: z.string(),
      channel: z.string(),
      period: z.string(),
      requests: z.array(
        z.object({
          id: z.string(),
          clientRequestId: z.string().nullable().optional(),
          clientRequestRevision: z.number().nullable().optional(),
          reason: z.string().optional(),
          amount: z.number().int(),
          currency: z.string(),
          channel: z.string(),
          period: z.string(),
          status: z.string(),
          createdAt: z.string(),
        }),
      ),
    })
    .nullable()
    .optional(),
});
export type PortalSession = z.infer<typeof portalSessionSchema>;
export type PortalForm = Pick<
  PortalSession['engagement'],
  'revision' | 'fields'
>;
export type PortalReviewDecision = 'COMMENT' | 'APPROVED' | 'CHANGES_REQUESTED';
export type PortalCommand =
  | {
      action: 'onboard';
      requestId: string;
      revision: number;
      answers: Record<string, string>;
    }
  | {
      action: 'review';
      requestId: string;
      shareId: string;
      decision: PortalReviewDecision;
      comment: string;
    }
  | {
      action: 'budget';
      requestId: string;
      revision: number;
      amount: number;
      reason: string;
    };
export type PortalAttempt = {
  command: PortalCommand;
  form: PortalForm | null;
  state: 'UNKNOWN' | 'RETRY' | 'CONFLICT' | 'STALE';
};

export const portalBudgetCents = (input: string): number | null => {
  const micros = parseFinanceAmountMicros(input);
  if (micros === null) return null;
  const value = BigInt(micros);
  if (value % 10_000n !== 0n || value > 1_000_000_000_000_000n) return null;
  return Number(value / 10_000n);
};

export const portalAttemptResult = (
  attempt: PortalAttempt,
  session: PortalSession,
): 'MATCH' | 'NOT_FOUND' | 'CONFLICT' | 'STALE' => {
  const command = attempt.command;
  if (command.action === 'onboard') {
    const saved = session.submissions.find(
      (item) => item.id === command.requestId,
    );
    if (saved) {
      const expected = attempt.form?.fields.map((field) => ({
        label: field.label,
        value: command.answers[field.id] ?? '',
      }));
      return saved.formRevision === command.revision &&
        expected &&
        saved.answers.length === expected.length &&
        saved.answers.every(
          (item, index) =>
            item.label === expected[index].label &&
            item.value === expected[index].value,
        )
        ? 'MATCH'
        : 'CONFLICT';
    }
    return command.revision === session.engagement.revision
      ? 'NOT_FOUND'
      : 'STALE';
  }
  if (command.action === 'review') {
    const share = session.shares.find((item) => item.id === command.shareId);
    if (!share) return 'STALE';
    const saved = share.reviews.find((item) => item.id === command.requestId);
    if (!saved) return 'NOT_FOUND';
    return saved.comment === command.comment &&
      saved.decision === command.decision
      ? 'MATCH'
      : 'CONFLICT';
  }
  const saved = session.advertising?.requests.find(
    (item) => item.clientRequestId === command.requestId,
  );
  if (saved)
    return saved.amount === command.amount &&
      saved.reason === command.reason &&
      saved.clientRequestRevision === command.revision
      ? 'MATCH'
      : 'CONFLICT';
  return session.advertising && command.revision === session.engagement.revision
    ? 'NOT_FOUND'
    : 'STALE';
};
