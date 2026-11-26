import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';
import {
  CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX,
  CLIENT_BUSINESS_PAYMENT_REF_TYPE,
  deterministicClientReceivableInvoiceId,
  microsToMinorUnits,
  minorUnitsToMicros,
} from 'src/modules/delivery/finance-v2/finance-v2-client-sync.util';
import {
  convertToAedMicros,
  parseDecimalToMicros,
  roundHalfUpDiv,
  todayIsoDateInTimezone,
} from 'src/modules/delivery/finance-v2/finance-v2.policy';
import {
  FINANCE_V2_BASE_CURRENCY,
  FINANCE_V2_CURRENCIES,
  FINANCE_V2_DEFAULT_FX_RATES,
  FINANCE_V2_DEFAULT_TIMEZONE,
  type FinanceV2Currency,
} from 'src/modules/delivery/finance-v2/finance-v2.types';
import { type ClientFeeSetting } from 'src/modules/delivery/operations/delivery-operations.types';

const FINANCE_V2_CURRENCY_SET = new Set<string>(FINANCE_V2_CURRENCIES);

const isFinanceV2Currency = (value: string): value is FinanceV2Currency =>
  FINANCE_V2_CURRENCY_SET.has(value);

export type ProjectedMrrStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'ONE_TIME';

export type ProjectedMrrCurrencyBreakdown = {
  currency: FinanceV2Currency;
  projectedMrrMinor: number;
  projectedMrrMicros: string;
  projectedMrrAedMicros: string;
  clientCount: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
};

export type ProjectedMrrOneTimeCurrencyBreakdown = {
  currency: FinanceV2Currency;
  amountMinor: number;
  amountMicros: string;
  aedMicros: string;
  clientCount: number;
};

export type ProjectedMrrClientRow = {
  companyId: string;
  companyName: string;
  cadence: 'MONTHLY' | 'QUARTERLY' | 'ONE_TIME';
  currency: FinanceV2Currency;
  agreedFeeMinor: number;
  agreedFeeMicros: string;
  monthlyEquivalentMinor: number;
  monthlyEquivalentMicros: string;
  monthlyEquivalentAedMicros: string;
  collectedThisMonthAedMicros: string;
  collectedInFeeCurrencyMinor: number;
  collectedInFeeCurrencyMicros: string;
  collectedTowardMrrAedMicros: string;
  remainingAedMicros: string;
  collectionPercent: number;
  status: ProjectedMrrStatus;
  notes: string;
};

export type ProjectedMrrSnapshot = {
  month: string;
  baseCurrency: FinanceV2Currency;
  exchangeRates: Record<string, string>;
  projectedMrrAedMicros: string;
  collectedTowardMrrAedMicros: string;
  totalCollectedThisMonthAedMicros: string;
  remainingAedMicros: string;
  collectionPercent: number;
  mrrClientCount: number;
  paidClientCount: number;
  partialClientCount: number;
  unpaidClientCount: number;
  byCurrency: ProjectedMrrCurrencyBreakdown[];
  oneTime: {
    clientCount: number;
    totalAedMicros: string;
    byCurrency: ProjectedMrrOneTimeCurrencyBreakdown[];
    clients: ProjectedMrrClientRow[];
  };
  clients: ProjectedMrrClientRow[];
};

export type ProjectedMrrInvoiceSource = {
  id: string;
  clientName: string;
  projectId: string | null;
  currency: string;
  status: string;
};

export type ProjectedMrrPaymentJournalSource = {
  id: string;
  entryDate: string;
  currency: string;
  amountMicros: string;
  aedAmountMicros?: string | null;
  projectId: string | null;
  sourceRefType: string | null;
  sourceRefId: string | null;
  status: string;
  reversed?: boolean;
};

export const normalizeFinanceExchangeRates = (
  rates?: Record<string, string> | null,
): Record<string, string> => {
  const merged: Record<string, string> = { ...FINANCE_V2_DEFAULT_FX_RATES };
  if (!rates) return merged;
  for (const currency of FINANCE_V2_CURRENCIES) {
    if (currency === FINANCE_V2_BASE_CURRENCY) {
      merged[currency] = '1';
      continue;
    }
    const candidate = rates[currency];
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      if (parseDecimalToMicros(candidate) > BigInt('0')) {
        merged[currency] = candidate.trim();
      }
    } catch {
      // Keep default FX rate if stored value is invalid.
    }
  }
  return merged;
};

const resolveFxRate = (
  exchangeRates: Record<string, string>,
  currency: FinanceV2Currency,
): string => {
  if (currency === FINANCE_V2_BASE_CURRENCY) return '1';
  return exchangeRates[currency] ?? FINANCE_V2_DEFAULT_FX_RATES[currency] ?? '1';
};

export const computeProjectedMrrSnapshot = ({
  workspaceId,
  activeClients,
  clientFees,
  projects,
  businessRecords,
  financeV2Invoices = [],
  financeV2PaymentJournals = [],
  exchangeRates,
  timeZone = FINANCE_V2_DEFAULT_TIMEZONE,
  month,
  now = new Date(),
}: {
  workspaceId?: string;
  activeClients: { id: string; name: string }[];
  clientFees?: Record<string, ClientFeeSetting> | null;
  projects: { id: string; companyId: string | null }[];
  businessRecords: BusinessRecord[];
  financeV2Invoices?: ProjectedMrrInvoiceSource[];
  financeV2PaymentJournals?: ProjectedMrrPaymentJournalSource[];
  exchangeRates?: Record<string, string> | null;
  timeZone?: string | null;
  month?: string;
  now?: Date;
}): ProjectedMrrSnapshot => {
  const resolvedMonth =
    month ??
    todayIsoDateInTimezone(now, timeZone || FINANCE_V2_DEFAULT_TIMEZONE).slice(
      0,
      7,
    );
  const resolvedRates = normalizeFinanceExchangeRates(exchangeRates);

  const activeClientIdSet = new Set(activeClients.map((client) => client.id));
  const projectCompanyById = new Map<string, string>();
  for (const project of projects) {
    if (project.companyId) {
      projectCompanyById.set(project.id, project.companyId);
    }
  }

  // Unique normalized company name map for matching native Finance V2 invoices without a projectId.
  const companyNameCounts = new Map<string, number>();
  for (const client of activeClients) {
    const normalized = client.name.trim().toLocaleLowerCase();
    if (!normalized) continue;
    companyNameCounts.set(
      normalized,
      (companyNameCounts.get(normalized) ?? 0) + 1,
    );
  }
  const companyIdByUniqueName = new Map<string, string>();
  for (const client of activeClients) {
    const normalized = client.name.trim().toLocaleLowerCase();
    if (normalized && companyNameCounts.get(normalized) === 1) {
      companyIdByUniqueName.set(normalized, client.id);
    }
  }

  const financeRecords = businessRecords.filter(
    (record): record is Extract<BusinessRecord, { kind: 'FINANCE' }> =>
      record.kind === 'FINANCE',
  );
  const businessRecordById = new Map(
    financeRecords.map((record) => [record.id, record]),
  );

  const resolveBusinessRecordCompanyId = (
    record: Extract<BusinessRecord, { kind: 'FINANCE' }>,
  ): string | null =>
    (record.projectId ? projectCompanyById.get(record.projectId) : null) ??
    record.companyId ??
    null;

  const syncedReceivableCompanyByInvoiceId = new Map<string, string>();
  if (workspaceId) {
    for (const record of financeRecords) {
      if (record.category !== 'RECEIVABLE') continue;
      const companyId = resolveBusinessRecordCompanyId(record);
      if (!companyId) continue;
      const invoiceId = deterministicClientReceivableInvoiceId(
        workspaceId,
        record.id,
      );
      syncedReceivableCompanyByInvoiceId.set(invoiceId, companyId);
    }
  }

  const financeV2InvoiceById = new Map(
    financeV2Invoices.map((invoice) => [invoice.id, invoice]),
  );

  // Track Finance V2 sync keys across all dates so we never double-count or resurrect reversed records.
  const activeV2SyncKeys = new Set<string>();
  const inactiveV2SyncKeys = new Set<string>();
  const v2InvoicesWithPaymentJournals = new Set<string>();
  for (const journal of financeV2PaymentJournals) {
    if (journal.sourceRefType && journal.sourceRefId) {
      const key = `${journal.sourceRefType}::${journal.sourceRefId}`;
      if (journal.status === 'POSTED' && !journal.reversed) {
        activeV2SyncKeys.add(key);
      } else {
        inactiveV2SyncKeys.add(key);
      }
      if (journal.sourceRefType === 'INVOICE_PAYMENT') {
        const [invoiceId] = journal.sourceRefId.split(':');
        if (invoiceId) {
          v2InvoicesWithPaymentJournals.add(invoiceId);
        }
      }
    }
  }

  const collectedByCompany = new Map<
    string,
    {
      aedMicros: bigint;
      byCurrencyMicros: Map<FinanceV2Currency, bigint>;
    }
  >();

  const addCollected = (
    companyId: string,
    currency: FinanceV2Currency,
    amountMicros: bigint,
    aedMicros: bigint,
  ) => {
    if (amountMicros <= BigInt('0') && aedMicros <= BigInt('0')) return;
    if (!activeClientIdSet.has(companyId)) return;
    let bucket = collectedByCompany.get(companyId);
    if (!bucket) {
      bucket = { aedMicros: BigInt('0'), byCurrencyMicros: new Map() };
      collectedByCompany.set(companyId, bucket);
    }
    bucket.aedMicros += aedMicros;
    bucket.byCurrencyMicros.set(
      currency,
      (bucket.byCurrencyMicros.get(currency) ?? BigInt('0')) + amountMicros,
    );
  };

  // Pass 1: Posted, non-reversed Finance V2 payment journals dated in the target month.
  for (const journal of financeV2PaymentJournals) {
    if (journal.status !== 'POSTED' || journal.reversed) continue;
    if (journal.entryDate.slice(0, 7) !== resolvedMonth) continue;
    if (!isFinanceV2Currency(journal.currency)) continue;

    const amountMicros = BigInt(journal.amountMicros);
    if (amountMicros <= BigInt('0')) continue;

    let targetCompanyId: string | null = null;
    if (
      journal.sourceRefType === CLIENT_BUSINESS_PAYMENT_REF_TYPE &&
      journal.sourceRefId
    ) {
      const rec = businessRecordById.get(journal.sourceRefId);
      targetCompanyId =
        (rec ? resolveBusinessRecordCompanyId(rec) : null) ??
        (journal.projectId
          ? (projectCompanyById.get(journal.projectId) ?? null)
          : null);
    } else if (
      journal.sourceRefType === 'INVOICE_PAYMENT' &&
      journal.sourceRefId
    ) {
      const [invoiceId] = journal.sourceRefId.split(':');
      targetCompanyId = invoiceId
        ? (syncedReceivableCompanyByInvoiceId.get(invoiceId) ?? null)
        : null;
      if (!targetCompanyId && invoiceId) {
        const invoice = financeV2InvoiceById.get(invoiceId);
        if (invoice) {
          const projectCompany = invoice.projectId
            ? (projectCompanyById.get(invoice.projectId) ?? null)
            : null;
          targetCompanyId =
            projectCompany ??
            companyIdByUniqueName.get(
              invoice.clientName.trim().toLocaleLowerCase(),
            ) ??
            null;
        }
      }
      if (!targetCompanyId && journal.projectId) {
        targetCompanyId = projectCompanyById.get(journal.projectId) ?? null;
      }
    } else if (journal.projectId) {
      targetCompanyId = projectCompanyById.get(journal.projectId) ?? null;
    }

    if (!targetCompanyId) continue;
    const aedMicros =
      journal.aedAmountMicros && BigInt(journal.aedAmountMicros) > BigInt('0')
        ? BigInt(journal.aedAmountMicros)
        : convertToAedMicros(
            amountMicros,
            journal.currency,
            resolveFxRate(resolvedRates, journal.currency),
          );
    addCollected(targetCompanyId, journal.currency, amountMicros, aedMicros);
  }

  // Pass 2: Unsynced active business records dated in the target month (pre-backfill or unit-test fallback).
  const activeFinanceRecords = financeRecords.filter(
    (record) => record.status !== 'VOID',
  );
  const linkedReceiptReceivableIds = new Set<string>();
  for (const record of activeFinanceRecords) {
    if (
      record.category === 'INCOME' &&
      record.externalReference.startsWith('receivable:')
    ) {
      linkedReceiptReceivableIds.add(
        record.externalReference.slice('receivable:'.length),
      );
    }
  }

  for (const record of activeFinanceRecords) {
    if (record.date.slice(0, 7) !== resolvedMonth) continue;
    if (!isFinanceV2Currency(record.currency)) continue;
    const targetCompanyId = resolveBusinessRecordCompanyId(record);
    if (!targetCompanyId || !activeClientIdSet.has(targetCompanyId)) continue;

    if (record.category === 'INCOME') {
      let syncKey: string;
      if (record.externalReference.startsWith('receivable:') && workspaceId) {
        const receivableId = record.externalReference.slice(
          'receivable:'.length,
        );
        const linkedInvoiceId = deterministicClientReceivableInvoiceId(
          workspaceId,
          receivableId,
        );
        syncKey = `INVOICE_PAYMENT::${linkedInvoiceId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${record.id}`;
      } else {
        syncKey = `${CLIENT_BUSINESS_PAYMENT_REF_TYPE}::${record.id}`;
      }
      if (activeV2SyncKeys.has(syncKey) || inactiveV2SyncKeys.has(syncKey)) {
        continue;
      }
      const amountMicros = minorUnitsToMicros(record.amount);
      const aedMicros = convertToAedMicros(
        amountMicros,
        record.currency,
        resolveFxRate(resolvedRates, record.currency),
      );
      addCollected(targetCompanyId, record.currency, amountMicros, aedMicros);
    } else if (
      record.category === 'RECEIVABLE' &&
      record.status === 'PAID' &&
      !linkedReceiptReceivableIds.has(record.id)
    ) {
      if (workspaceId) {
        const linkedInvoiceId = deterministicClientReceivableInvoiceId(
          workspaceId,
          record.id,
        );
        if (v2InvoicesWithPaymentJournals.has(linkedInvoiceId)) {
          continue;
        }
      }
      const amountMicros = minorUnitsToMicros(record.amount);
      const aedMicros = convertToAedMicros(
        amountMicros,
        record.currency,
        resolveFxRate(resolvedRates, record.currency),
      );
      addCollected(targetCompanyId, record.currency, amountMicros, aedMicros);
    }
  }

  let projectedMrrAed = BigInt('0');
  let collectedTowardMrrAed = BigInt('0');
  let totalCollectedThisMonthAed = BigInt('0');
  let remainingAed = BigInt('0');
  let paidClientCount = 0;
  let partialClientCount = 0;
  let unpaidClientCount = 0;

  const byCurrencyMap = new Map<
    FinanceV2Currency,
    {
      projectedMrrMicros: bigint;
      projectedMrrAedMicros: bigint;
      clientCount: number;
      paidCount: number;
      partialCount: number;
      unpaidCount: number;
    }
  >();

  let oneTimeTotalAed = BigInt('0');
  const oneTimeByCurrencyMap = new Map<
    FinanceV2Currency,
    {
      amountMicros: bigint;
      aedMicros: bigint;
      clientCount: number;
    }
  >();

  const mrrClients: ProjectedMrrClientRow[] = [];
  const oneTimeClients: ProjectedMrrClientRow[] = [];

  for (const client of activeClients) {
    const fee = clientFees?.[client.id];
    if (!fee || fee.amount <= 0) continue;
    if (!isFinanceV2Currency(fee.currency)) continue;

    const currency = fee.currency;
    const fxRate = resolveFxRate(resolvedRates, currency);
    const agreedFeeMicros = minorUnitsToMicros(fee.amount);
    const collectedBucket = collectedByCompany.get(client.id);
    const collectedAed = collectedBucket?.aedMicros ?? BigInt('0');
    const collectedInFeeCurrencyMicros =
      collectedBucket?.byCurrencyMicros.get(currency) ?? BigInt('0');
    const collectedInFeeCurrencyMinor = microsToMinorUnits(
      collectedInFeeCurrencyMicros,
    );

    if (fee.cadence === 'ONE_TIME') {
      const agreedFeeAed = convertToAedMicros(
        agreedFeeMicros,
        currency,
        fxRate,
      );
      oneTimeTotalAed += agreedFeeAed;
      const existing = oneTimeByCurrencyMap.get(currency) ?? {
        amountMicros: BigInt('0'),
        aedMicros: BigInt('0'),
        clientCount: 0,
      };
      existing.amountMicros += agreedFeeMicros;
      existing.aedMicros += agreedFeeAed;
      existing.clientCount += 1;
      oneTimeByCurrencyMap.set(currency, existing);

      oneTimeClients.push({
        companyId: client.id,
        companyName: client.name,
        cadence: 'ONE_TIME',
        currency,
        agreedFeeMinor: fee.amount,
        agreedFeeMicros: agreedFeeMicros.toString(),
        monthlyEquivalentMinor: 0,
        monthlyEquivalentMicros: '0',
        monthlyEquivalentAedMicros: '0',
        collectedThisMonthAedMicros: collectedAed.toString(),
        collectedInFeeCurrencyMinor,
        collectedInFeeCurrencyMicros: collectedInFeeCurrencyMicros.toString(),
        collectedTowardMrrAedMicros: '0',
        remainingAedMicros: '0',
        collectionPercent: 0,
        status: 'ONE_TIME',
        notes: fee.notes ?? '',
      });
      continue;
    }

    const monthlyEquivalentMicros =
      fee.cadence === 'QUARTERLY'
        ? roundHalfUpDiv(agreedFeeMicros, BigInt('3'))
        : agreedFeeMicros;
    const monthlyEquivalentMinor = microsToMinorUnits(monthlyEquivalentMicros);
    const monthlyEquivalentAed = convertToAedMicros(
      monthlyEquivalentMicros,
      currency,
      fxRate,
    );

    const paidInSameCurrency =
      collectedInFeeCurrencyMicros >= monthlyEquivalentMicros;
    const clientCollectedTowardMrrAed =
      paidInSameCurrency || collectedAed >= monthlyEquivalentAed
        ? monthlyEquivalentAed
        : collectedAed;
    const clientRemainingAed =
      monthlyEquivalentAed > clientCollectedTowardMrrAed
        ? monthlyEquivalentAed - clientCollectedTowardMrrAed
        : BigInt('0');
    const status: ProjectedMrrStatus =
      clientRemainingAed === BigInt('0')
        ? 'PAID'
        : collectedAed > BigInt('0')
          ? 'PARTIAL'
          : 'UNPAID';
    const collectionPercent =
      monthlyEquivalentAed > BigInt('0')
        ? Math.min(
            100,
            Number(
              roundHalfUpDiv(
                clientCollectedTowardMrrAed * BigInt('100'),
                monthlyEquivalentAed,
              ),
            ),
          )
        : 0;

    projectedMrrAed += monthlyEquivalentAed;
    collectedTowardMrrAed += clientCollectedTowardMrrAed;
    totalCollectedThisMonthAed += collectedAed;
    remainingAed += clientRemainingAed;

    if (status === 'PAID') paidClientCount += 1;
    else if (status === 'PARTIAL') partialClientCount += 1;
    else unpaidClientCount += 1;

    const currencyBucket = byCurrencyMap.get(currency) ?? {
      projectedMrrMicros: BigInt('0'),
      projectedMrrAedMicros: BigInt('0'),
      clientCount: 0,
      paidCount: 0,
      partialCount: 0,
      unpaidCount: 0,
    };
    currencyBucket.projectedMrrMicros += monthlyEquivalentMicros;
    currencyBucket.projectedMrrAedMicros += monthlyEquivalentAed;
    currencyBucket.clientCount += 1;
    if (status === 'PAID') currencyBucket.paidCount += 1;
    else if (status === 'PARTIAL') currencyBucket.partialCount += 1;
    else currencyBucket.unpaidCount += 1;
    byCurrencyMap.set(currency, currencyBucket);

    mrrClients.push({
      companyId: client.id,
      companyName: client.name,
      cadence: fee.cadence,
      currency,
      agreedFeeMinor: fee.amount,
      agreedFeeMicros: agreedFeeMicros.toString(),
      monthlyEquivalentMinor,
      monthlyEquivalentMicros: monthlyEquivalentMicros.toString(),
      monthlyEquivalentAedMicros: monthlyEquivalentAed.toString(),
      collectedThisMonthAedMicros: collectedAed.toString(),
      collectedInFeeCurrencyMinor,
      collectedInFeeCurrencyMicros: collectedInFeeCurrencyMicros.toString(),
      collectedTowardMrrAedMicros: clientCollectedTowardMrrAed.toString(),
      remainingAedMicros: clientRemainingAed.toString(),
      collectionPercent,
      status,
      notes: fee.notes ?? '',
    });
  }

  const statusRank: Record<ProjectedMrrStatus, number> = {
    UNPAID: 0,
    PARTIAL: 1,
    PAID: 2,
    ONE_TIME: 3,
  };
  mrrClients.sort((left, right) => {
    const rankDiff = statusRank[left.status] - statusRank[right.status];
    if (rankDiff !== 0) return rankDiff;
    const leftVal = BigInt(left.monthlyEquivalentAedMicros);
    const rightVal = BigInt(right.monthlyEquivalentAedMicros);
    if (rightVal !== leftVal) return rightVal > leftVal ? 1 : -1;
    return left.companyName.localeCompare(right.companyName);
  });

  oneTimeClients.sort((left, right) =>
    left.companyName.localeCompare(right.companyName),
  );

  const byCurrency: ProjectedMrrCurrencyBreakdown[] = [
    ...byCurrencyMap.entries(),
  ]
    .map(([currency, totals]) => ({
      currency,
      projectedMrrMinor: microsToMinorUnits(totals.projectedMrrMicros),
      projectedMrrMicros: totals.projectedMrrMicros.toString(),
      projectedMrrAedMicros: totals.projectedMrrAedMicros.toString(),
      clientCount: totals.clientCount,
      paidCount: totals.paidCount,
      partialCount: totals.partialCount,
      unpaidCount: totals.unpaidCount,
    }))
    .sort((left, right) => {
      const leftAed = BigInt(left.projectedMrrAedMicros);
      const rightAed = BigInt(right.projectedMrrAedMicros);
      if (rightAed !== leftAed) return rightAed > leftAed ? 1 : -1;
      return left.currency.localeCompare(right.currency);
    });

  const oneTimeByCurrency: ProjectedMrrOneTimeCurrencyBreakdown[] = [
    ...oneTimeByCurrencyMap.entries(),
  ]
    .map(([currency, totals]) => ({
      currency,
      amountMinor: microsToMinorUnits(totals.amountMicros),
      amountMicros: totals.amountMicros.toString(),
      aedMicros: totals.aedMicros.toString(),
      clientCount: totals.clientCount,
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));

  const collectionPercent =
    projectedMrrAed > BigInt('0')
      ? Math.min(
          100,
          Number(
            roundHalfUpDiv(
              collectedTowardMrrAed * BigInt('100'),
              projectedMrrAed,
            ),
          ),
        )
      : 0;

  return {
    month: resolvedMonth,
    baseCurrency: FINANCE_V2_BASE_CURRENCY,
    exchangeRates: resolvedRates,
    projectedMrrAedMicros: projectedMrrAed.toString(),
    collectedTowardMrrAedMicros: collectedTowardMrrAed.toString(),
    totalCollectedThisMonthAedMicros: totalCollectedThisMonthAed.toString(),
    remainingAedMicros: remainingAed.toString(),
    collectionPercent,
    mrrClientCount: mrrClients.length,
    paidClientCount,
    partialClientCount,
    unpaidClientCount,
    byCurrency,
    oneTime: {
      clientCount: oneTimeClients.length,
      totalAedMicros: oneTimeTotalAed.toString(),
      byCurrency: oneTimeByCurrency,
      clients: oneTimeClients,
    },
    clients: mrrClients,
  };
};
