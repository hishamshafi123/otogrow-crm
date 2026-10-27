import { BadRequestException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { DeliveryFinanceAiClaimEntity } from 'src/modules/delivery/finance/entities/delivery-finance-ai-claim.entity';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import {
  financeAiAmount,
  financeAiModelIdentity,
} from 'src/modules/delivery/finance/delivery-finance-ai-cost.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { DELIVERY_FINANCE_PAGE_SIZE } from 'src/modules/delivery/finance/delivery-finance.policy';
import {
  type DeliveryFinanceAiCostEvidenceDTO,
  type DeliveryFinanceAiCostSourceDTO,
  type DeliveryFinanceAiCostEntryReferenceDTO,
} from 'src/modules/delivery/finance/delivery-finance-ai-cost.dto';

export const FINANCE_AI_EVIDENCE_ACTIONS = [
  'SETTLED',
  'MANUALLY_RECONCILED',
  'LATE_PROVIDER_USAGE',
];
export type FinanceAiEvidenceRow = {
  id: string;
  action: string;
  createdAt: Date;
  actualAmount: string | null;
  reportedAmount: string | null;
};
const EVIDENCE_COLUMNS =
  'id,action,"createdAt","after"->>\'actualMicroUsd\' AS "actualAmount","after"->>\'reportedActualMicroUsd\' AS "reportedAmount"';
export const projectFinanceAiEvidence = (
  row: FinanceAiEvidenceRow,
): DeliveryFinanceAiCostEvidenceDTO | null => {
  const amount = financeAiAmount(
    row.action === 'LATE_PROVIDER_USAGE'
      ? row.reportedAmount
      : row.actualAmount,
  );
  if (amount === null || !FINANCE_AI_EVIDENCE_ACTIONS.includes(row.action))
    return null;
  return {
    id: row.id,
    basis:
      row.action === 'MANUALLY_RECONCILED'
        ? 'MANUAL_EVIDENCE'
        : row.action === 'LATE_PROVIDER_USAGE'
          ? 'LATE_PRICED_USAGE'
          : 'PRICED_USAGE',
    amountMicros: amount,
    recordedAt: row.createdAt.toISOString(),
  };
};
export const readFinanceAiEvidence = async (
  manager: EntityManager,
  workspaceId: string,
  spendId: string,
  eventId: string,
) => {
  const rows: FinanceAiEvidenceRow[] = await manager.query(
    `SELECT ${EVIDENCE_COLUMNS} FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 AND "spendId"=$2 AND id=$3 AND action=ANY($4::text[])`,
    [workspaceId, spendId, eventId, FINANCE_AI_EVIDENCE_ACTIONS],
  );
  return rows[0] ? projectFinanceAiEvidence(rows[0]) : null;
};
export const readFinanceAiEvidencePage = async (
  manager: EntityManager,
  workspaceId: string,
  spendId: string,
  afterId: string | null,
) => {
  if (afterId) {
    const [cursor]: { id: string }[] = await manager.query(
      'SELECT id FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 AND "spendId"=$2 AND id=$3 AND action=ANY($4::text[])',
      [workspaceId, spendId, afterId, FINANCE_AI_EVIDENCE_ACTIONS],
    );
    if (!cursor)
      throw new BadRequestException(
        'This evidence cursor is not valid for the selected AI charge.',
      );
  }
  const rows: FinanceAiEvidenceRow[] = await manager.query(
    `SELECT ${EVIDENCE_COLUMNS} FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 AND "spendId"=$2 AND action=ANY($3::text[]) AND ($4::uuid IS NULL OR ("createdAt",id)>(SELECT cursor."createdAt",cursor.id FROM core."otogrowAiSpendEvent" cursor WHERE cursor."workspaceId"=$1 AND cursor."spendId"=$2 AND cursor.id=$4)) ORDER BY "createdAt",id LIMIT $5`,
    [
      workspaceId,
      spendId,
      FINANCE_AI_EVIDENCE_ACTIONS,
      afterId,
      DELIVERY_FINANCE_PAGE_SIZE + 1,
    ],
  );
  const more = rows.length > DELIVERY_FINANCE_PAGE_SIZE;
  const visible = rows.slice(0, DELIVERY_FINANCE_PAGE_SIZE);
  return {
    evidenceOptions: visible
      .map(projectFinanceAiEvidence)
      .filter((row) => row !== null),
    nextEvidenceId: more ? visible[visible.length - 1].id : null,
  };
};

export type FinanceAiSourceState = {
  spend: OtogrowAiSpendEntity;
  claim: DeliveryFinanceAiClaimEntity | null;
  currentEntry: DeliveryFinanceEntryEntity | null;
  replacementEntry: DeliveryFinanceEntryEntity | null;
  source: DeliveryFinanceAiCostSourceDTO;
};

const entryReference = async (
  manager: EntityManager,
  workspaceId: string,
  id: string | null,
) => {
  if (!id) return { entry: null, reference: null, matchVersion: null };
  const entry = await manager
    .getRepository(DeliveryFinanceEntryEntity)
    .findOneBy({ workspaceId, id });
  if (!entry) return { entry: null, reference: null, matchVersion: null };
  const [matching]: { amount: string; count: number; version: string }[] =
    await manager.query(
      "SELECT COALESCE(SUM(\"amountMicros\") FILTER (WHERE status='ACTIVE'),0)::text AS amount,COUNT(*) FILTER (WHERE status='ACTIVE')::int AS count,md5(COALESCE(string_agg(id::text||':'||revision::text||':'||status||':'||\"amountMicros\"::text,',' ORDER BY id),'')) AS version FROM core.\"deliveryFinanceCashMatch\" WHERE \"workspaceId\"=$1 AND \"entryId\"=$2",
      [workspaceId, id],
    );
  const reference: DeliveryFinanceAiCostEntryReferenceDTO = {
    id: entry.id,
    revision: entry.revision,
    status: entry.status,
    month: entry.month,
    amountMicros: entry.amountMicros,
    matchedMicros: matching.amount,
    activeMatchCount: matching.count,
  };
  return { entry, reference, matchVersion: matching.version };
};

export const readFinanceAiSource = async (
  manager: EntityManager,
  workspaceId: string,
  spend: OtogrowAiSpendEntity,
): Promise<FinanceAiSourceState> => {
  const claim = await manager
    .getRepository(DeliveryFinanceAiClaimEntity)
    .findOneBy({ workspaceId, spendId: spend.id });
  const current = await entryReference(
    manager,
    workspaceId,
    claim?.currentEntryId ?? null,
  );
  const replacement = await entryReference(
    manager,
    workspaceId,
    claim?.replacementEntryId ?? null,
  );
  const project = spend.projectId
    ? await manager
        .getRepository(DeliveryProjectEntity)
        .findOneBy({ workspaceId, id: spend.projectId })
    : null;
  const task = spend.taskId
    ? await manager
        .getRepository(DeliveryTaskEntity)
        .findOneBy({ workspaceId, taskId: spend.taskId })
    : null;
  const [evidence]: { version: string; lateCount: number }[] =
    await manager.query(
      "SELECT md5(COALESCE(string_agg(id::text||':'||EXTRACT(EPOCH FROM \"createdAt\")::text||':'||action||':'||COALESCE(\"after\"->>'actualMicroUsd','null')||':'||COALESCE(\"after\"->>'reportedActualMicroUsd','null'),',' ORDER BY \"createdAt\",id),'')) AS version,COUNT(*) FILTER (WHERE action='LATE_PROVIDER_USAGE')::int AS \"lateCount\" FROM core.\"otogrowAiSpendEvent\" WHERE \"workspaceId\"=$1 AND \"spendId\"=$2 AND action=ANY($3::text[])",
      [workspaceId, spend.id, FINANCE_AI_EVIDENCE_ACTIONS],
    );
  const originals: FinanceAiEvidenceRow[] = await manager.query(
    `SELECT ${EVIDENCE_COLUMNS} FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 AND "spendId"=$2 AND action=ANY($3::text[]) ORDER BY "createdAt",id LIMIT 1`,
    [workspaceId, spend.id, ['SETTLED', 'MANUALLY_RECONCILED']],
  );
  const original = originals[0] ? projectFinanceAiEvidence(originals[0]) : null;
  const amount = financeAiAmount(spend.actualMicroUsd);
  const model = financeAiModelIdentity(spend.price);
  const claimValid =
    !claim ||
    ((!claim.currentEntryId ||
      (current.entry?.sourceType === 'AI_SPEND' &&
        current.entry.sourceAiSpend?.spendId === spend.id)) &&
      (!claim.replacementEntryId ||
        (replacement.entry?.sourceType === 'AI_SPEND' &&
          replacement.entry.sourceAiSpend?.spendId === spend.id)));
  const sourceWarnings = [
    ...(spend.state !== 'SETTLED' ? ['SOURCE_NOT_SETTLED'] : []),
    ...(amount === null ? ['SOURCE_AMOUNT_INVALID'] : []),
    ...(!model ? ['SOURCE_MODEL_UNAVAILABLE'] : []),
    ...(!original || original.amountMicros !== amount
      ? ['SETTLEMENT_EVIDENCE_UNAVAILABLE']
      : []),
    ...(evidence.lateCount > 0 ? ['LATE_EVIDENCE_AVAILABLE'] : []),
    ...(spend.projectId && !project ? ['SOURCE_PROJECT_UNAVAILABLE'] : []),
    ...(project && project.companyId !== spend.clientId
      ? ['SOURCE_CLIENT_CHANGED']
      : []),
    ...(spend.taskId && (!task || task.projectId !== spend.projectId)
      ? ['SOURCE_TASK_MOVED']
      : []),
    ...(!claimValid ? ['CLAIM_UNAVAILABLE'] : []),
  ];
  const source: DeliveryFinanceAiCostSourceDTO = {
    id: spend.id,
    revision: spend.revision,
    state: spend.state,
    sourceKind: spend.sourceKind,
    modelId: model?.modelId ?? '',
    currency: 'USD',
    settledAmountMicros: amount,
    createdAt: spend.createdAt.toISOString(),
    dispatchedAt: spend.dispatchedAt?.toISOString() ?? null,
    settledAt: spend.settledAt?.toISOString() ?? null,
    projectId: spend.projectId,
    projectName: project?.name ?? null,
    eligible:
      spend.state === 'SETTLED' &&
      amount !== null &&
      model !== null &&
      original !== null &&
      original.amountMicros === amount &&
      claimValid,
    sourceWarnings,
    claim: {
      revision: claim?.revision ?? 0,
      currentEntry: current.reference,
      replacementEntry: replacement.reference,
    },
    evidenceOptions: [],
    nextEvidenceId: null,
    sourceReviewToken: financeReviewToken([
      workspaceId,
      spend.id,
      spend.revision,
      spend.state,
      amount,
      spend.sourceKind,
      spend.sourceRunId,
      spend.projectId,
      spend.clientId,
      spend.taskId,
      model,
      project ? [project.id, project.companyId, project.name] : null,
      task ? [task.taskId, task.projectId] : null,
      evidence.version,
      claim
        ? [claim.revision, claim.currentEntryId, claim.replacementEntryId]
        : null,
      current.reference,
      current.matchVersion,
      replacement.reference,
      replacement.matchVersion,
      sourceWarnings,
    ]),
  };
  return {
    spend,
    claim,
    currentEntry: current.entry,
    replacementEntry: replacement.entry,
    source,
  };
};
