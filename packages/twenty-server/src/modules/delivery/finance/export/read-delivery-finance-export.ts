import { BadRequestException } from '@nestjs/common';
import { In, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { isValidUuid } from 'twenty-shared/utils';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';
import { DeliveryFinanceAllocationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-allocation.entity';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import { deliveryFinanceAmountSchema } from 'src/modules/delivery/finance/delivery-finance.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { readFinanceForecastCash } from 'src/modules/delivery/finance/read-delivery-forecast-cash';
import {
  FINANCE_EXPORT_MAX_ROWS,
  type FinanceExportSelection,
  type FinanceExportSnapshotRow,
} from 'src/modules/delivery/finance/export/delivery-finance-export.policy';
import { type DeliveryFinanceExportExclusionDTO } from 'src/modules/delivery/finance/export/delivery-finance-export.dto';

type FinanceExportSourceRead = {
  rows: FinanceExportSnapshotRow[];
  exclusions: DeliveryFinanceExportExclusionDTO[];
  signature: unknown[];
};
const safeText = (value: unknown, maximum = 240) =>
  typeof value === 'string' && value.length <= maximum && !value.includes('\0');
const exactLegacyAmount = (value: unknown) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 100000000000
    ? (BigInt(value) * BigInt(10000)).toString()
    : null;
const excluded = (
  sourceId: string | null,
  sourceType: string,
  title: string | null,
  sourceStatus: string | null,
  code: string,
  amountMicros: string | null,
  blocking: boolean,
): DeliveryFinanceExportExclusionDTO => ({
  key: `${sourceId ?? 'UNKNOWN'}:${code}`,
  sourceId,
  sourceType,
  title,
  sourceStatus,
  code,
  amountMicros,
  blocking,
  previousBatchCount: 0,
});
const emptyRow = () => ({
  account: null,
  paymentAccount: null,
  counterparty: null,
  cells: [],
  errors: [],
  warnings: [],
  previousBatchCount: 0,
  latestBatchId: null,
  sourceChanged: false,
});
const withinLimit = (read: FinanceExportSourceRead) => {
  if (read.rows.length + read.exclusions.length > FINANCE_EXPORT_MAX_ROWS)
    throw new BadRequestException(
      'This export selection exceeds 2,000 rows or exclusions. Narrow the date window or service month; no sources were truncated.',
    );
};
export const readFinanceExportCash = async (
  manager: EntityManager,
  workspaceId: string,
  selection: FinanceExportSelection,
  businessDate: string,
): Promise<FinanceExportSourceRead> => {
  const read: FinanceExportSourceRead = {
    rows: [],
    exclusions: [],
    signature: [],
  };
  const operations = await manager
    .getRepository(DeliveryOperationsEntity)
    .findOneBy({ workspaceId });
  const records: unknown = operations?.state?.business?.records ?? [];
  if (!Array.isArray(records))
    return {
      rows: [],
      exclusions: [
        excluded(null, 'CASH', null, null, 'INVALID_SOURCE', null, true),
      ],
      signature: ['INVALID_BUSINESS_RECORDS'],
    };
  const sources = await readFinanceForecastCash(
    manager,
    workspaceId,
    selection.currency,
    businessDate,
  );
  const cash = new Map(
    sources.cash.map((source) => [source.snapshot.id, source]),
  );
  for (const record of records) {
    if (
      !record ||
      typeof record !== 'object' ||
      !('kind' in record) ||
      record.kind !== 'FINANCE'
    )
      continue;
    const source = record as Record<string, unknown>;
    const validCurrency = deliveryCurrencySchema.safeParse(
      source.currency,
    ).success;
    if (validCurrency && source.currency !== selection.currency) continue;
    const date = z.iso.date().safeParse(source.date);
    if (
      date.success &&
      ((selection.dateFrom && date.data < selection.dateFrom) ||
        (selection.dateTo && date.data > selection.dateTo))
    )
      continue;
    const id =
      typeof source.id === 'string' && isValidUuid(source.id)
        ? source.id
        : null;
    const title = safeText(source.title) ? (source.title as string) : null;
    const status = typeof source.status === 'string' ? source.status : null;
    const amount = exactLegacyAmount(source.amount);
    read.signature.push([
      id,
      source.revision,
      source.category,
      source.currency,
      source.date,
      source.status,
      source.amount,
      source.title,
      source.projectId,
      source.evidenceUrl,
      source.externalReference,
    ]);
    if (!validCurrency) {
      read.exclusions.push(
        excluded(id, 'CASH', title, status, 'UNKNOWN_CURRENCY', null, true),
      );
      withinLimit(read);
      continue;
    }
    if (status === 'VOID') {
      read.exclusions.push(
        excluded(id, 'CASH', title, status, 'VOID_SOURCE', amount, false),
      );
      withinLimit(read);
      continue;
    }
    if (!['INCOME', 'EXPENSE', 'SALARY'].includes(String(source.category))) {
      const nonCash =
        source.category === 'RECEIVABLE' ||
        source.category === 'OPENING_BALANCE';
      read.exclusions.push(
        excluded(
          id,
          'CASH',
          title,
          status,
          nonCash ? 'NON_CASH_SOURCE' : 'INVALID_SOURCE',
          amount,
          !nonCash,
        ),
      );
      withinLimit(read);
      continue;
    }
    const current = id ? cash.get(id) : null;
    if (
      !date.success ||
      !current ||
      !title?.trim() ||
      !safeText(source.externalReference, 500) ||
      !Number.isInteger(source.revision) ||
      Number(source.revision) > 2147483647
    ) {
      read.exclusions.push(
        excluded(id, 'CASH', title, status, 'INVALID_SOURCE', amount, true),
      );
      withinLimit(read);
      continue;
    }
    if (!current.eligible) {
      const code = current.warnings.includes('FUTURE_CASH')
        ? 'FUTURE_CASH'
        : 'INVALID_SOURCE';
      read.exclusions.push(
        excluded(
          id,
          'CASH',
          title,
          status,
          code,
          amount,
          code !== 'FUTURE_CASH',
        ),
      );
      withinLimit(read);
      continue;
    }
    const snapshot = current.snapshot;
    const financial = {
      id: snapshot.id,
      revision: snapshot.revision,
      title: snapshot.title,
      kind: snapshot.category,
      currency: snapshot.currency,
      amountMicros: snapshot.amountMicros,
      date: snapshot.date,
      projectId: snapshot.projectId,
      projectName: snapshot.projectName,
      evidenceUrl: snapshot.evidenceUrl,
      reference: source.externalReference,
      status: snapshot.status,
    };
    read.rows.push({
      ...emptyRow(),
      key: `${snapshot.id}:CASH`,
      identityKey: `CASH:${snapshot.id}`,
      sourceId: snapshot.id,
      sourceRevision: snapshot.revision,
      sourceType: 'CASH',
      sourceReference: source.externalReference as string,
      sourceStatus: snapshot.status,
      currentStatus: snapshot.status,
      date: snapshot.date,
      serviceMonth: null,
      kind: snapshot.category,
      category: snapshot.category,
      title: snapshot.title,
      currency: snapshot.currency,
      amountMicros: snapshot.amountMicros,
      projectId: snapshot.projectId,
      projectName: snapshot.projectName,
      evidenceUrl: snapshot.evidenceUrl,
      sourceToken: financeReviewToken(financial),
      bucket: 'CASH',
      warnings: current.warnings.filter(
        (warning) => warning !== 'REPORTING_DATE_NOT_SET',
      ),
    });
    withinLimit(read);
  }
  read.rows.sort((left, right) => left.key.localeCompare(right.key));
  read.exclusions = [
    ...new Map(read.exclusions.map((row) => [row.key, row])).values(),
  ];
  read.exclusions.sort((left, right) => left.key.localeCompare(right.key));
  return read;
};
export const readFinanceExportRecognition = async (
  manager: EntityManager,
  workspaceId: string,
  selection: FinanceExportSelection,
): Promise<FinanceExportSourceRead> => {
  const read: FinanceExportSourceRead = {
    rows: [],
    exclusions: [],
    signature: [],
  };
  const entries = await manager.getRepository(DeliveryFinanceEntryEntity).find({
    where: {
      workspaceId,
      month: selection.serviceMonth as string,
      currency: selection.currency,
    },
    order: { id: 'ASC' },
    take: FINANCE_EXPORT_MAX_ROWS + 1,
  });
  if (entries.length > FINANCE_EXPORT_MAX_ROWS)
    throw new BadRequestException(
      'This service month exceeds 2,000 sources. No sources were truncated.',
    );
  const postedIds = entries
    .filter((entry) => entry.status === 'POSTED')
    .map((entry) => entry.id);
  const [{ count }] = postedIds.length
    ? await manager.query(
        'SELECT COUNT(*)::int AS count FROM core."deliveryFinanceAllocation" WHERE "workspaceId"=$1 AND "entryId"=ANY($2::uuid[])',
        [workspaceId, postedIds],
      )
    : [{ count: 0 }];
  if (count > FINANCE_EXPORT_MAX_ROWS)
    throw new BadRequestException(
      'This service month exceeds 2,000 allocation rows. No allocations were truncated.',
    );
  const allocations = postedIds.length
    ? await manager.getRepository(DeliveryFinanceAllocationEntity).find({
        where: { workspaceId, entryId: In(postedIds) },
        order: { entryId: 'ASC', bucket: 'ASC' },
      })
    : [];
  for (const entry of entries) {
    const amount = deliveryFinanceAmountSchema.safeParse(entry.amountMicros);
    const ownAllocations = allocations.filter(
      (allocation) => allocation.entryId === entry.id,
    );
    const spendId =
      entry.sourceType === 'AI_SPEND' &&
      typeof entry.sourceAiSpend?.spendId === 'string' &&
      isValidUuid(entry.sourceAiSpend.spendId)
        ? entry.sourceAiSpend.spendId
        : null;
    const evidenceId =
      spendId &&
      typeof entry.sourceAiSpend?.evidenceEventId === 'string' &&
      isValidUuid(entry.sourceAiSpend.evidenceEventId)
        ? entry.sourceAiSpend.evidenceEventId
        : null;
    const identityKey = spendId
      ? `AI_SPEND:${spendId}`
      : entry.planId
        ? `PLAN:${entry.planId}:${entry.month}`
        : `ENTRY:${entry.id}`;
    const reference =
      spendId && evidenceId
        ? `ai-spend:${spendId}/evidence:${evidenceId}`
        : entry.planId
          ? `plan:${entry.planId}/month:${entry.month}`
          : entry.id;
    const signature = {
      id: entry.id,
      revision: entry.revision,
      kind: entry.kind,
      category: entry.category,
      title: entry.title,
      currency: entry.currency,
      amountMicros: entry.amountMicros,
      status: entry.status,
      month: entry.month,
      sourceType: entry.sourceType,
      reference,
      evidenceUrl: entry.evidenceUrl,
      allocations: ownAllocations.map((allocation) => ({
        id: allocation.id,
        bucket: allocation.bucket,
        amountMicros: allocation.amountMicros,
        projectId: allocation.projectId,
        projectName: allocation.projectName,
      })),
    };
    read.signature.push(signature);
    if (entry.status !== 'POSTED') {
      read.exclusions.push(
        excluded(
          entry.id,
          'RECOGNITION',
          entry.title,
          entry.status,
          entry.status === 'VOID' ? 'VOID_SOURCE' : 'DRAFT_SOURCE',
          amount.success ? amount.data : null,
          false,
        ),
      );
      withinLimit(read);
      continue;
    }
    if (
      !amount.success ||
      !safeText(entry.title) ||
      !entry.title.trim() ||
      !safeText(entry.category, 100) ||
      !entry.category.trim() ||
      !['REVENUE', 'COST'].includes(entry.kind) ||
      !Number.isInteger(entry.revision) ||
      entry.revision < 1 ||
      entry.revision > 2147483647 ||
      (entry.evidenceUrl !== null &&
        !z.url({ protocol: /^https?$/ }).safeParse(entry.evidenceUrl)
          .success) ||
      (entry.sourceType === 'AI_SPEND' && (!spendId || !evidenceId))
    ) {
      read.exclusions.push(
        excluded(
          entry.id,
          'RECOGNITION',
          safeText(entry.title) ? entry.title : null,
          entry.status,
          'INVALID_SOURCE',
          amount.success ? amount.data : null,
          true,
        ),
      );
      withinLimit(read);
      continue;
    }
    const validAllocations = ownAllocations.every(
      (allocation) =>
        allocation.workspaceId === workspaceId &&
        allocation.entryId === entry.id &&
        deliveryFinanceAmountSchema.safeParse(allocation.amountMicros)
          .success &&
        (allocation.projectId === null || isValidUuid(allocation.projectId)) &&
        allocation.bucket === (allocation.projectId ?? 'COMPANY') &&
        (allocation.projectName === null || safeText(allocation.projectName)),
    );
    const total = validAllocations
      ? ownAllocations.reduce(
          (sum, allocation) => sum + BigInt(allocation.amountMicros),
          BigInt(0),
        )
      : null;
    if (
      !validAllocations ||
      new Set(ownAllocations.map((allocation) => allocation.bucket)).size !==
        ownAllocations.length ||
      total !== BigInt(amount.data)
    ) {
      read.exclusions.push(
        excluded(
          entry.id,
          'RECOGNITION',
          entry.title,
          entry.status,
          'UNKNOWN_ALLOCATION',
          amount.data,
          true,
        ),
      );
      withinLimit(read);
      continue;
    }
    const rows = ownAllocations.length
      ? ownAllocations
      : [
          {
            bucket: 'UNALLOCATED_ZERO',
            projectId: null,
            projectName: null,
            amountMicros: '0',
          },
        ];
    for (const allocation of rows) {
      read.rows.push({
        ...emptyRow(),
        key: `${entry.id}:${allocation.bucket}`,
        identityKey,
        sourceId: entry.id,
        sourceRevision: entry.revision,
        sourceType: entry.sourceType,
        sourceReference: reference,
        sourceStatus: 'POSTED',
        currentStatus: 'POSTED',
        date: selection.accountingDate as string,
        serviceMonth: entry.month,
        kind: entry.kind,
        category: entry.category,
        title: entry.title,
        currency: entry.currency,
        amountMicros: allocation.amountMicros,
        projectId: allocation.projectId,
        projectName: allocation.projectName,
        evidenceUrl: entry.evidenceUrl,
        sourceToken: financeReviewToken(signature),
        bucket: allocation.bucket,
        warnings: ownAllocations.length
          ? []
          : ['ZERO_ENTRY_WITHOUT_ALLOCATION'],
      });
      withinLimit(read);
    }
  }
  read.rows.sort((left, right) => left.key.localeCompare(right.key));
  read.exclusions.sort((left, right) => left.key.localeCompare(right.key));
  return read;
};
