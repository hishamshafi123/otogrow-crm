import { type EntityManager } from 'typeorm';

import { type OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { type OtogrowAiBudgetScope } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';

type SpendPageRow = OtogrowAiSpendEntity & {
  cursorAt: string;
  reportedActualMicroUsd: string | null;
};
export type AiScopeExposure = {
  scope: OtogrowAiBudgetScope;
  scopeId: string;
  chargedMicroUsd: string;
  heldMicroUsd: string;
  attentionCount: number;
};
const REPORTED_AMOUNT = `MAX(CASE WHEN event."after"->>'reportedActualMicroUsd' ~ '^[0-9]+$' THEN (event."after"->>'reportedActualMicroUsd')::numeric END)`;
const NEEDS_ATTENTION = `(spend.state='UNCERTAIN' OR spend."attentionReason" IS NOT NULL)`;

export const readOtogrowAiSpendPage = async (
  manager: EntityManager,
  workspaceId: string,
  input: {
    needsAttention: boolean;
    limit: number;
    cursor: { at: string; id: string } | null;
  },
): Promise<{ page: SpendPageRow[]; more: boolean }> => {
  const parameters: (string | number)[] = [workspaceId, input.limit + 1];
  if (input.cursor) parameters.push(input.cursor.at, input.cursor.id);
  // Opaque cursors retain database microseconds that JavaScript Date would truncate.
  const rows: SpendPageRow[] = await manager.query(
    `WITH selected AS (
      SELECT spend.* FROM core."otogrowAiSpend" spend
      WHERE spend."workspaceId"=$1
        ${input.needsAttention ? `AND ${NEEDS_ATTENTION}` : ''}
        ${input.cursor ? 'AND (spend."createdAt",spend.id)<($3::timestamptz,$4::uuid)' : ''}
      ORDER BY spend."createdAt" DESC,spend.id DESC LIMIT $2
    ), reported AS (
      SELECT event."spendId",${REPORTED_AMOUNT} AS amount
      FROM core."otogrowAiSpendEvent" event
      WHERE event."workspaceId"=$1 AND event.action='LATE_PROVIDER_USAGE'
        AND event."spendId" IN (SELECT id FROM selected)
      GROUP BY event."spendId"
    )
    SELECT selected.*,reported.amount::text AS "reportedActualMicroUsd",
      to_char(selected."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
    FROM selected LEFT JOIN reported ON reported."spendId"=selected.id
    ORDER BY selected."createdAt" DESC,selected.id DESC`,
    parameters,
  );
  const more = rows.length > input.limit;
  rows.splice(input.limit);
  return { page: rows, more };
};

export const readOtogrowAiExposure = async (
  manager: EntityManager,
  workspaceId: string,
  scopeIds: { clients: string[]; tasks: string[] },
): Promise<AiScopeExposure[]> =>
  manager.query(
    `WITH reported AS (
      SELECT event."spendId",${REPORTED_AMOUNT} AS amount
      FROM core."otogrowAiSpendEvent" event
      WHERE event."workspaceId"=$1 AND event.action='LATE_PROVIDER_USAGE'
      GROUP BY event."spendId"
    ), exposure AS (
      SELECT spend."clientId",spend."taskId",${NEEDS_ATTENTION} AS attention,
        GREATEST(CASE WHEN spend.state='SETTLED' THEN COALESCE(spend."actualMicroUsd",0)::numeric ELSE 0 END,COALESCE(reported.amount,0)) AS charged,
        CASE WHEN spend.state IN ('RESERVED','DISPATCHED','UNCERTAIN') THEN spend."reservedMicroUsd"::numeric ELSE 0 END AS held
      FROM core."otogrowAiSpend" spend LEFT JOIN reported ON reported."spendId"=spend.id
      WHERE spend."workspaceId"=$1
    )
    SELECT 'WORKSPACE' AS scope,$1::uuid AS "scopeId",COALESCE(SUM(charged),0)::text AS "chargedMicroUsd",
      COALESCE(SUM(held),0)::text AS "heldMicroUsd",COUNT(*) FILTER (WHERE attention)::int AS "attentionCount" FROM exposure
    UNION ALL
    SELECT 'CLIENT',"clientId",SUM(charged)::text,SUM(held)::text,COUNT(*) FILTER (WHERE attention)::int
      FROM exposure WHERE "clientId"=ANY($2::uuid[]) GROUP BY "clientId"
    UNION ALL
    SELECT 'TASK',"taskId",SUM(charged)::text,SUM(held)::text,COUNT(*) FILTER (WHERE attention)::int
      FROM exposure WHERE "taskId"=ANY($3::uuid[]) GROUP BY "taskId"`,
    [workspaceId, scopeIds.clients, scopeIds.tasks],
  );
