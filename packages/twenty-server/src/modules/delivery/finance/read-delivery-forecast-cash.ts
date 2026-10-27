import { type EntityManager } from 'typeorm';
import { z } from 'zod';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import {
  type BusinessRecord,
  deliveryCurrencySchema,
} from 'src/modules/delivery/business/delivery-business.types';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryFinanceSourceEntity } from 'src/modules/delivery/finance/entities/delivery-finance-source.entity';
import { DeliveryFinanceSettlementEntity } from 'src/modules/delivery/finance/entities/delivery-finance-settlement.entity';
import {
  financeCashAmountSchema,
  financeCashSnapshot,
  financeCashSourceMatches,
  financeReviewToken,
  type FinanceCashSnapshot,
} from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { financeLegacyReceiptTarget } from 'src/modules/delivery/finance/delivery-finance-reconciliation.hooks';

export type FinanceForecastCashSource = {
  snapshot: FinanceCashSnapshot;
  sourceToken: string;
  createdAt: string | null;
  eligible: boolean;
  warnings: string[];
};
export type FinanceForecastReceivableSource = FinanceForecastCashSource & {
  outstandingMicros: string | null;
  settledMicros: string | null;
};
export type FinanceForecastCashAnomaly = {
  id: string | null;
  title: string | null;
  code: string;
  date: string | null;
  amountMicros: string | null;
  sourceType: 'CASH' | 'RECEIVABLE' | null;
};
export type FinanceForecastCashRead = {
  cash: FinanceForecastCashSource[];
  receivables: FinanceForecastReceivableSource[];
  anomalies: FinanceForecastCashAnomaly[];
};
type ForecastStoredSource = Pick<
  DeliveryFinanceSourceEntity,
  'id' | 'kind' | 'currency' | 'amountMicros' | 'snapshot'
>;
type ForecastSettlement = Pick<
  DeliveryFinanceSettlementEntity,
  'id' | 'cashId' | 'receivableId' | 'currency' | 'amountMicros'
>;
type ForecastCashState = {
  workspaceId: string;
  currency: string;
  businessDate: string | null;
  records: unknown;
  projects: { id: string; name: string }[];
  storedSources: ForecastStoredSource[];
  settlements: ForecastSettlement[];
};
type ForecastLegacyRecord = Extract<BusinessRecord, { kind: 'FINANCE' }>;
type ForecastCashNode = FinanceForecastCashSource & {
  record: ForecastLegacyRecord;
};
const RECORD_CREATION_DATE = z.iso.datetime({ offset: true });
const LEGACY_RECEIPT_PREFIX = 'receivable:';
const CASH_BLOCKERS = new Set([
  'INVALID_CASH',
  'SOURCE_CHANGED',
  'SOURCE_VOID',
  'FUTURE_CASH',
  'REPORTING_DATE_NOT_SET',
]);

export const projectFinanceForecastCash = (
  state: ForecastCashState,
): FinanceForecastCashRead => {
  const anomalies: FinanceForecastCashAnomaly[] = [];
  const recordValues: unknown[] = Array.isArray(state.records)
    ? state.records
    : [];
  if (!Array.isArray(state.records))
    anomalies.push({
      id: null,
      title: null,
      code: 'INVALID_CASH',
      date: null,
      amountMicros: null,
      sourceType: null,
    });
  if (state.businessDate === null)
    anomalies.push({
      id: null,
      title: null,
      code: 'REPORTING_DATE_NOT_SET',
      date: null,
      amountMicros: null,
      sourceType: null,
    });
  const financialRecords: ForecastLegacyRecord[] = [];
  for (const value of recordValues) {
    if (
      !isDefined(value) ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !('kind' in value) ||
      value.kind !== 'FINANCE'
    )
      continue;
    financialRecords.push(value as ForecastLegacyRecord);
  }
  const identities = new Map<string, number>();
  for (const record of financialRecords)
    if (typeof record.id === 'string' && isValidUuid(record.id))
      identities.set(record.id, (identities.get(record.id) ?? 0) + 1);
  const storedSources = new Map(
    state.storedSources.map((source) => [source.id, source]),
  );
  const nodes = new Map<string, ForecastCashNode>();
  const validRecords: BusinessRecord[] = [];
  for (const record of financialRecords) {
    if (record.category === 'OPENING_BALANCE') continue;
    const snapshot = financeCashSnapshot(record, state.projects);
    if (!snapshot) {
      if (
        record.status !== 'VOID' &&
        (record.currency === state.currency ||
          !deliveryCurrencySchema.safeParse(record.currency).success)
      )
        anomalies.push({
          id:
            typeof record.id === 'string' && isValidUuid(record.id)
              ? record.id
              : null,
          title:
            typeof record.title === 'string'
              ? record.title.slice(0, 240)
              : null,
          code: 'INVALID_CASH',
          date: z.iso.date().safeParse(record.date).success
            ? record.date
            : null,
          amountMicros: null,
          sourceType:
            record.category === 'RECEIVABLE'
              ? 'RECEIVABLE'
              : ['INCOME', 'EXPENSE', 'SALARY'].includes(record.category)
                ? 'CASH'
                : null,
        });
      continue;
    }
    validRecords.push(record);
    if (nodes.has(snapshot.id)) continue;
    const stored = storedSources.get(snapshot.id);
    const changed =
      stored &&
      (!financeCashSourceMatches(stored.snapshot, snapshot) ||
        stored.currency !== snapshot.currency ||
        stored.amountMicros !== snapshot.amountMicros ||
        stored.kind !==
          (snapshot.category === 'RECEIVABLE' ? 'RECEIVABLE' : 'CASH'));
    const warnings = [
      ...(identities.get(snapshot.id) !== 1 ? ['INVALID_CASH'] : []),
      ...(snapshot.status === 'VOID'
        ? ['SOURCE_VOID']
        : [
            ...(state.businessDate === null ? ['REPORTING_DATE_NOT_SET'] : []),
            ...(state.businessDate !== null &&
            snapshot.date > state.businessDate
              ? ['FUTURE_CASH']
              : []),
            ...(changed ? ['SOURCE_CHANGED'] : []),
          ]),
    ];
    nodes.set(snapshot.id, {
      record,
      snapshot,
      createdAt: RECORD_CREATION_DATE.safeParse(record.createdAt).success
        ? record.createdAt
        : null,
      sourceToken: financeReviewToken([
        state.workspaceId,
        {
          ...snapshot,
          revision: 0,
          projectName: null,
          status: snapshot.status === 'VOID' ? 'VOID' : 'ACTIVE',
        },
        record.kind === 'FINANCE' ? record.externalReference : '',
      ]),
      eligible: !warnings.some((warning) => CASH_BLOCKERS.has(warning)),
      warnings,
    });
  }

  const settlementTotals = new Map<string, bigint>();
  const invoiceSettlements = new Map<string, ForecastSettlement[]>();
  for (const settlement of state.settlements) {
    const values = invoiceSettlements.get(settlement.receivableId) ?? [];
    values.push(settlement);
    invoiceSettlements.set(settlement.receivableId, values);
    if (financeCashAmountSchema.safeParse(settlement.amountMicros).success)
      settlementTotals.set(
        settlement.cashId,
        (settlementTotals.get(settlement.cashId) ?? BigInt(0)) +
          BigInt(settlement.amountMicros),
      );
  }
  const legacyByInvoice = new Map<string, BusinessRecord[]>();
  for (const record of financialRecords) {
    if (
      record.kind !== 'FINANCE' ||
      record.category !== 'INCOME' ||
      record.status === 'VOID' ||
      typeof record.externalReference !== 'string' ||
      !record.externalReference.startsWith(LEGACY_RECEIPT_PREFIX)
    )
      continue;
    const invoiceId = record.externalReference.slice(
      LEGACY_RECEIPT_PREFIX.length,
    );
    const values = legacyByInvoice.get(invoiceId) ?? [];
    values.push(record);
    legacyByInvoice.set(invoiceId, values);
    const node = nodes.get(record.id);
    if (!node) continue;
    if (!financeLegacyReceiptTarget(validRecords, record))
      node.warnings.push('LEGACY_RECEIPT_MISMATCH');
  }
  // Invoice allocation errors cannot erase an otherwise valid actual cash movement.
  for (const node of nodes.values()) {
    if (
      node.snapshot.category === 'RECEIVABLE' ||
      node.snapshot.status === 'VOID'
    )
      continue;
    const legacyAmount =
      node.record.kind === 'FINANCE' &&
      node.record.category === 'INCOME' &&
      node.record.externalReference.startsWith(LEGACY_RECEIPT_PREFIX)
        ? BigInt(node.snapshot.amountMicros)
        : BigInt(0);
    if (
      (settlementTotals.get(node.snapshot.id) ?? BigInt(0)) + legacyAmount >
      BigInt(node.snapshot.amountMicros)
    )
      node.warnings.push('OVER_SETTLED');
  }

  const cash: FinanceForecastCashSource[] = [];
  const receivables: FinanceForecastReceivableSource[] = [];
  for (const node of [...nodes.values()].sort((left, right) =>
    left.snapshot.id.localeCompare(right.snapshot.id),
  )) {
    const { record: _record, ...source } = node;
    if (source.snapshot.currency !== state.currency) continue;
    if (source.snapshot.category !== 'RECEIVABLE') {
      cash.push({ ...source, warnings: [...new Set(source.warnings)] });
      continue;
    }
    let settled = BigInt(0);
    const warnings = [...source.warnings];
    for (const settlement of invoiceSettlements.get(source.snapshot.id) ?? []) {
      const receipt = nodes.get(settlement.cashId);
      if (!receipt) {
        warnings.push('MISSING_CASH');
        continue;
      }
      if (!receipt.eligible) {
        warnings.push(
          ...receipt.warnings.filter((warning) => warning !== 'SOURCE_VOID'),
        );
        if (receipt.warnings.includes('SOURCE_VOID'))
          warnings.push('MISSING_CASH');
        continue;
      }
      if (receipt.warnings.length) {
        warnings.push(...receipt.warnings);
        continue;
      }
      if (
        !financeCashAmountSchema.safeParse(settlement.amountMicros).success ||
        receipt.snapshot.category !== 'INCOME' ||
        settlement.currency !== source.snapshot.currency ||
        receipt.snapshot.currency !== source.snapshot.currency ||
        (receipt.snapshot.projectId !== null &&
          receipt.snapshot.projectId !== source.snapshot.projectId)
      ) {
        warnings.push('LEGACY_RECEIPT_MISMATCH');
        continue;
      }
      settled += BigInt(settlement.amountMicros);
    }
    for (const record of legacyByInvoice.get(source.snapshot.id) ?? []) {
      const receipt = nodes.get(record.id);
      if (
        !receipt ||
        !receipt.eligible ||
        receipt.warnings.length ||
        financeLegacyReceiptTarget(validRecords, record)?.id !==
          source.snapshot.id
      ) {
        warnings.push(...(receipt?.warnings ?? []), 'LEGACY_RECEIPT_MISMATCH');
        continue;
      }
      settled += BigInt(receipt.snapshot.amountMicros);
    }
    if (source.snapshot.status === 'PAID' && settled === BigInt(0))
      warnings.push('LEGACY_PAID_WITHOUT_RECEIPT');
    else if (
      source.snapshot.status === 'PAID' &&
      settled < BigInt(source.snapshot.amountMicros)
    )
      warnings.push('PAID_BALANCE_MISMATCH');
    if (settled > BigInt(source.snapshot.amountMicros))
      warnings.push('OVER_SETTLED');
    const eligible = warnings.length === 0;
    receivables.push({
      ...source,
      warnings: [...new Set(warnings)],
      eligible,
      settledMicros: eligible ? settled.toString() : null,
      outstandingMicros: eligible
        ? (BigInt(source.snapshot.amountMicros) - settled).toString()
        : null,
    });
  }
  for (const source of [...cash, ...receivables])
    for (const code of source.warnings)
      if (!['SOURCE_VOID', 'REPORTING_DATE_NOT_SET'].includes(code))
        anomalies.push({
          id: source.snapshot.id,
          title: source.snapshot.title,
          code,
          date: source.snapshot.date,
          amountMicros: source.snapshot.amountMicros,
          sourceType:
            source.snapshot.category === 'RECEIVABLE' ? 'RECEIVABLE' : 'CASH',
        });
  for (const stored of state.storedSources) {
    if (stored.currency !== state.currency || nodes.has(stored.id)) continue;
    const snapshot = stored.snapshot;
    anomalies.push({
      id: stored.id,
      title:
        typeof snapshot?.title === 'string'
          ? snapshot.title.slice(0, 240)
          : null,
      code: 'MISSING_CASH',
      date: z.iso.date().safeParse(snapshot?.date).success
        ? snapshot.date
        : null,
      amountMicros: stored.amountMicros,
      sourceType: stored.kind,
    });
  }
  return { cash, receivables, anomalies };
};

export const readFinanceForecastCash = async (
  manager: EntityManager,
  workspaceId: string,
  currency: string,
  businessDate: string | null,
): Promise<FinanceForecastCashRead> => {
  const operations = await manager
    .getRepository(DeliveryOperationsEntity)
    .findOneBy({ workspaceId });
  const projects = await manager
    .getRepository(DeliveryProjectEntity)
    .findBy({ workspaceId });
  const storedSources = await manager
    .getRepository(DeliveryFinanceSourceEntity)
    .findBy({ workspaceId });
  const settlements = await manager
    .getRepository(DeliveryFinanceSettlementEntity)
    .findBy({ workspaceId, status: 'ACTIVE' });
  return projectFinanceForecastCash({
    workspaceId,
    currency,
    businessDate,
    records: operations?.state?.business?.records ?? [],
    projects,
    storedSources,
    settlements,
  });
};
