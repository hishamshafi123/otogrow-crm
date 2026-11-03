import { BadRequestException, NotFoundException } from '@nestjs/common';
import { isDefined } from 'twenty-shared/utils';
import { type EntityManager } from 'typeorm';
import { z } from 'zod';

import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { type OtogrowAiSpendEventEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend-event.entity';
import { microToUsd } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';
import {
  type OtogrowAiFinancialStateDTO,
  type OtogrowAiSpendHistoryInput,
  type OtogrowAiSpendHistoryDTO,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-spend-history.dto';

const HISTORY_INPUT = z
  .object({
    spendId: z.string().uuid(),
    cursor: z.string().max(1000).nullish(),
    limit: z.number().int().min(1).max(100).nullish(),
  })
  .strict();
const HISTORY_CURSOR = z
  .object({
    workspaceId: z.string().uuid(),
    spendId: z.string().uuid(),
    at: z.string().datetime(),
    id: z.string().uuid(),
  })
  .strict();
const FINANCIAL_STATES = new Set([
  'RESERVED',
  'DISPATCHED',
  'UNCERTAIN',
  'SETTLED',
  'RELEASED',
]);
const FINANCIAL_ACTIONS = new Set([
  ...FINANCIAL_STATES,
  'MANUALLY_RECONCILED',
  'LATE_PROVIDER_USAGE',
  'MEDIA_PREDICTION_ACCEPTED',
]);

export const parseOtogrowAiSpendHistoryInput = (
  input: OtogrowAiSpendHistoryInput,
  workspaceId: string,
) => {
  const result = HISTORY_INPUT.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Invalid AI charge history page.');
  const value = result.data;
  let cursor: z.infer<typeof HISTORY_CURSOR> | null = null;
  if (value.cursor) {
    try {
      cursor = HISTORY_CURSOR.parse(
        JSON.parse(Buffer.from(value.cursor, 'base64url').toString('utf8')),
      );
    } catch {
      throw new BadRequestException(
        'Reload this AI charge to reset its history.',
      );
    }
    if (cursor.workspaceId !== workspaceId || cursor.spendId !== value.spendId)
      throw new BadRequestException(
        'Reload history after changing AI charge or workspace.',
      );
  }
  return { spendId: value.spendId, limit: value.limit ?? 20, cursor };
};

export const projectOtogrowAiFinancialState = (
  value: Record<string, unknown>,
): OtogrowAiFinancialStateDTO => {
  const amount = (field: string) => {
    const stored = value[field];
    return typeof stored === 'string' && /^\d{1,30}$/.test(stored)
      ? microToUsd(stored)
      : null;
  };
  return {
    state:
      typeof value.state === 'string' && FINANCIAL_STATES.has(value.state)
        ? value.state
        : null,
    revision:
      typeof value.revision === 'number' &&
      Number.isInteger(value.revision) &&
      value.revision > 0 &&
      value.revision <= 2147483647
        ? value.revision
        : null,
    reservedUsd: amount('reservedMicroUsd'),
    actualUsd: amount('actualMicroUsd'),
    reportedActualUsd: amount('reportedActualMicroUsd'),
  };
};

type EventRow = OtogrowAiSpendEventEntity & { cursorAt: string };
export const readOtogrowAiSpendHistory = async (
  manager: EntityManager,
  identity: {
    workspaceId: string;
    memberId: string;
    userWorkspaceId: string;
    schema: string;
  },
  input: ReturnType<typeof parseOtogrowAiSpendHistoryInput>,
): Promise<OtogrowAiSpendHistoryDTO> => {
  const spend = await manager.getRepository(OtogrowAiSpendEntity).findOneBy({
    workspaceId: identity.workspaceId,
    id: input.spendId,
  });
  if (!spend) throw new NotFoundException('AI charge is unavailable.');
  const parameters: (string | number)[] = [
    identity.workspaceId,
    spend.id,
    input.limit + 1,
  ];
  if (input.cursor) parameters.push(input.cursor.at, input.cursor.id);
  const rows: EventRow[] = await manager.query(
    `SELECT event.*,
      to_char(event."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
    FROM core."otogrowAiSpendEvent" event
    WHERE event."workspaceId"=$1 AND event."spendId"=$2
      ${input.cursor ? 'AND (event."createdAt",event.id)<($4::timestamptz,$5::uuid)' : ''}
    ORDER BY event."createdAt" DESC,event.id DESC LIMIT $3`,
    parameters,
  );
  const more = rows.length > input.limit;
  rows.splice(input.limit);
  const actorIds = rows.map((event) => event.actorId).filter(isDefined);
  const people: { id: string; name: string }[] = actorIds.length
    ? await manager.query(
        `SELECT id, trim(concat_ws(' ',"nameFirstName","nameLastName")) AS name FROM "${identity.schema}"."workspaceMember" WHERE id=ANY($1::uuid[])`,
        [actorIds],
      )
    : [];
  const names = new Map(people.map((person) => [person.id, person.name]));
  const last = rows[rows.length - 1];
  return {
    workspaceId: identity.workspaceId,
    memberId: identity.memberId,
    userWorkspaceId: identity.userWorkspaceId,
    spendId: spend.id,
    sourceKind: spend.sourceKind,
    sourceRunId: spend.sourceRunId,
    modelId: spend.price.modelId,
    kind: spend.price.kind,
    clientName: spend.clientName,
    taskName: spend.taskName,
    priceSource: spend.price.source,
    priceRevision: spend.price.revision,
    priceVerifiedAt: spend.price.verifiedAt,
    events: rows.map((event) => ({
      id: event.id,
      action: FINANCIAL_ACTIONS.has(event.action) ? event.action : 'UNKNOWN',
      actorId: event.actorId,
      actorName: event.actorId ? names.get(event.actorId) || null : null,
      actorAttribution:
        event.actorId === null
          ? 'SYSTEM'
          : event.action === 'MANUALLY_RECONCILED'
            ? 'ADMINISTRATOR'
            : 'INITIATOR',
      createdAt: event.createdAt.toISOString(),
      before: projectOtogrowAiFinancialState(event.before),
      after: projectOtogrowAiFinancialState(event.after),
      evidenceReference:
        event.action === 'MANUALLY_RECONCILED' &&
        isDefined(event.evidenceReference)
          ? event.evidenceReference.slice(0, 1000)
          : null,
      reason:
        event.action === 'MANUALLY_RECONCILED' && isDefined(event.reason)
          ? event.reason.slice(0, 1000)
          : null,
    })),
    nextCursor:
      more && last
        ? Buffer.from(
            JSON.stringify({
              workspaceId: identity.workspaceId,
              spendId: spend.id,
              at: last.cursorAt,
              id: last.id,
            }),
          ).toString('base64url')
        : null,
  };
};
