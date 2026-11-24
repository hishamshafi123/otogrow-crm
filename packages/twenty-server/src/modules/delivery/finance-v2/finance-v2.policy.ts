import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  FINANCE_V2_BASE_CURRENCY,
  FINANCE_V2_CURRENCIES,
  type FinanceV2BalanceSheet,
  type FinanceV2CashCurrencyBalance,
  type FinanceV2Currency,
  type FinanceV2DocumentLineItem,
  type FinanceV2JournalLineDraft,
  type FinanceV2LedgerLineRecord,
  type FinanceV2PayrollEntryKind,
  type FinanceV2PayrollMonthSummary,
  type FinanceV2PersonLiabilityBalance,
  type FinanceV2ProfitAndLoss,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

const MICROS_SCALE = BigInt('1000000');
const HALF_MICROS = BigInt('500000');
const MAX_AMOUNT_MICROS = BigInt('9000000000000000000');
const DECIMAL_UP_TO_6 = /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/;
const DECIMAL_UP_TO_2 = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const YEAR_MONTH = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;

export const financeV2CurrencySchema = z.enum(FINANCE_V2_CURRENCIES);

export const financeV2IsoDateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE, 'Use a valid YYYY-MM-DD date.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, 'Use a real calendar date.');

export const financeV2MonthSchema = z
  .string()
  .trim()
  .regex(YEAR_MONTH, 'Use a valid YYYY-MM month.');

export const financeV2PositiveMicrosSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/, 'Amount must be greater than zero.')
  .refine(
    (value) => BigInt(value) <= MAX_AMOUNT_MICROS,
    'Amount exceeds the supported maximum.',
  );

export const financeV2NonNegativeMicrosSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)$/, 'Amount must be zero or greater.')
  .refine(
    (value) => BigInt(value) <= MAX_AMOUNT_MICROS,
    'Amount exceeds the supported maximum.',
  );

export const financeV2FxRateSchema = z
  .string()
  .trim()
  .regex(
    DECIMAL_UP_TO_6,
    'Exchange rate must be a positive number with up to 6 decimals.',
  )
  .refine(
    (value) => parseDecimalToMicros(value) > BigInt('0'),
    'Exchange rate must be greater than zero.',
  );

export const financeV2DaysSchema = z
  .string()
  .trim()
  .regex(
    DECIMAL_UP_TO_2,
    'Days must be a positive number with up to 2 decimals.',
  )
  .refine((value) => {
    const hundredths = parseDecimalToHundredths(value);
    return hundredths > BigInt('0') && hundredths <= BigInt('3100');
  }, 'Days must be between 0.01 and 31.');

export const parseDecimalToMicros = (value: string): bigint => {
  const cleaned = value.trim();
  if (!DECIMAL_UP_TO_6.test(cleaned)) {
    throw new BadRequestException(`Invalid decimal amount: ${value}`);
  }
  const [wholePart = '0', fractionPart = ''] = cleaned.split('.');
  const micros =
    BigInt(wholePart || '0') * MICROS_SCALE +
    BigInt(fractionPart.padEnd(6, '0'));
  if (micros > MAX_AMOUNT_MICROS) {
    throw new BadRequestException('Amount exceeds the supported maximum.');
  }
  return micros;
};

export const parseDecimalToHundredths = (value: string): bigint => {
  const cleaned = value.trim();
  if (!DECIMAL_UP_TO_2.test(cleaned)) {
    throw new BadRequestException(`Invalid day quantity: ${value}`);
  }
  const [wholePart = '0', fractionPart = ''] = cleaned.split('.');
  return (
    BigInt(wholePart || '0') * BigInt('100') +
    BigInt(fractionPart.padEnd(2, '0'))
  );
};

export const formatHundredthsToDecimal = (hundredths: bigint): string => {
  const negative = hundredths < BigInt('0');
  const abs = negative ? -hundredths : hundredths;
  const whole = abs / BigInt('100');
  const fraction = (abs % BigInt('100'))
    .toString()
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
};

export const roundHalfUpDiv = (
  numerator: bigint,
  denominator: bigint,
): bigint => {
  if (denominator <= BigInt('0')) {
    throw new BadRequestException('Division denominator must be positive.');
  }
  const negative = numerator < BigInt('0');
  const abs = negative ? -numerator : numerator;
  const quotient = (abs + denominator / BigInt('2')) / denominator;
  return negative ? -quotient : quotient;
};

export const convertToAedMicros = (
  amountMicros: bigint,
  currency: FinanceV2Currency,
  fxRateToAed: string,
): bigint => {
  if (currency === FINANCE_V2_BASE_CURRENCY) {
    return amountMicros;
  }
  const rateMicros = parseDecimalToMicros(fxRateToAed);
  if (rateMicros <= BigInt('0')) {
    throw new BadRequestException('Exchange rate to AED must be positive.');
  }
  const negative = amountMicros < BigInt('0');
  const abs = negative ? -amountMicros : amountMicros;
  const converted = (abs * rateMicros + HALF_MICROS) / MICROS_SCALE;
  return negative ? -converted : converted;
};

// Enforces G1-DOUBLE-ENTRY invariant before any journal hits PostgreSQL.
export const assertBalancedJournalLines = (
  lines: FinanceV2JournalLineDraft[],
): void => {
  if (lines.length < 2) {
    throw new BadRequestException(
      'Every accounting journal must contain at least two lines.',
    );
  }
  let totalDebits = BigInt('0');
  let totalCredits = BigInt('0');
  for (const line of lines) {
    if (
      line.debitAedMicros < BigInt('0') ||
      line.creditAedMicros < BigInt('0')
    ) {
      throw new BadRequestException('Journal line amounts cannot be negative.');
    }
    const hasDebit = line.debitAedMicros > BigInt('0');
    const hasCredit = line.creditAedMicros > BigInt('0');
    if (hasDebit === hasCredit) {
      throw new BadRequestException(
        'Each journal line must have either a positive debit or a positive credit.',
      );
    }
    totalDebits += line.debitAedMicros;
    totalCredits += line.creditAedMicros;
  }
  if (totalDebits !== totalCredits) {
    throw new BadRequestException(
      `Unbalanced journal rejected: debits (${totalDebits}) !== credits (${totalCredits}).`,
    );
  }
};

export const resolveScheduledDateForMonth = (
  month: string,
  dayOfMonth: number,
): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const clampedDay = Math.max(1, Math.min(dayOfMonth, lastDay));
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
};

export const nextYearMonth = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
};

export const previousYearMonth = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(monthNumber - 1).padStart(2, '0')}`;
};

export const computeWeightedCarryingAed = (
  outflowOriginalMicros: bigint,
  currentOriginalMicros: bigint,
  currentAedMicros: bigint,
  fallbackAedMicros: bigint,
): bigint => {
  if (currentOriginalMicros <= BigInt('0') || currentAedMicros <= BigInt('0')) {
    return fallbackAedMicros;
  }
  // Exact carrying extinction when closing out the full remaining foreign balance.
  if (outflowOriginalMicros === currentOriginalMicros) {
    return currentAedMicros;
  }
  return roundHalfUpDiv(
    currentAedMicros * outflowOriginalMicros,
    currentOriginalMicros,
  );
};

export const resolveRecurringInvoiceDates = (
  month: string,
  billingDayOfMonth: number,
  dueDayOfMonth: number,
): { issueDate: string; dueDate: string } => {
  const issueDate = resolveScheduledDateForMonth(month, billingDayOfMonth);
  const dueMonth =
    dueDayOfMonth >= billingDayOfMonth ? month : nextYearMonth(month);
  const dueDate = resolveScheduledDateForMonth(dueMonth, dueDayOfMonth);
  return { issueDate, dueDate };
};

export const calculateOverdueDays = (
  dueDate: string,
  todayIso: string,
  status: string,
  totalMicros: bigint,
  paidMicros: bigint,
): number => {
  if (status === 'PAID' || status === 'VOID' || paidMicros >= totalMicros) {
    return 0;
  }
  const [dueYear, dueMonth, dueDay] = dueDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayIso.split('-').map(Number);
  const dueMs = Date.UTC(dueYear, dueMonth - 1, dueDay);
  const todayMs = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const diffDays = Math.floor((todayMs - dueMs) / 86_400_000);
  return diffDays > 0 ? diffDays : 0;
};

export const calculateDocumentLineTotals = (
  rawItems: {
    id: string;
    label: string;
    description?: string;
    quantity: string;
    unitPriceMicros: string;
    discountPercent?: string;
  }[],
): {
  lineItems: FinanceV2DocumentLineItem[];
  subtotalMicros: string;
  discountTotalMicros: string;
  totalMicros: string;
} => {
  if (rawItems.length === 0) {
    throw new BadRequestException('Add at least one line item.');
  }
  let subtotal = BigInt('0');
  let discountTotal = BigInt('0');
  const lineItems: FinanceV2DocumentLineItem[] = rawItems.map((item) => {
    const quantityMicros = parseDecimalToMicros(item.quantity);
    if (quantityMicros <= BigInt('0')) {
      throw new BadRequestException('Line item quantity must be positive.');
    }
    const unitPrice = BigInt(item.unitPriceMicros);
    if (unitPrice < BigInt('0')) {
      throw new BadRequestException('Unit price cannot be negative.');
    }
    const discountRate = item.discountPercent?.trim()
      ? parseDecimalToHundredths(item.discountPercent)
      : BigInt('0');
    if (discountRate < BigInt('0') || discountRate > BigInt('10000')) {
      throw new BadRequestException(
        'Discount percentage must be between 0 and 100.',
      );
    }
    const grossLine = roundHalfUpDiv(quantityMicros * unitPrice, MICROS_SCALE);
    const lineDiscount = roundHalfUpDiv(
      grossLine * discountRate,
      BigInt('10000'),
    );
    const lineTotal = grossLine - lineDiscount;
    subtotal += grossLine;
    discountTotal += lineDiscount;
    return {
      id: item.id,
      label: item.label.trim(),
      description: (item.description ?? '').trim(),
      quantity: item.quantity.trim(),
      unitPriceMicros: unitPrice.toString(),
      discountPercent: item.discountPercent?.trim() || '0',
      lineTotalMicros: lineTotal.toString(),
    };
  });
  const total = subtotal - discountTotal;
  return {
    lineItems,
    subtotalMicros: subtotal.toString(),
    discountTotalMicros: discountTotal.toString(),
    totalMicros: total.toString(),
  };
};

// Enforces G4-PAYROLL-POLICY: workingDays divisor (default 26), internal 2-day monthly paid leave
// allowance (resets monthly), Sunday/day swap cancels 1 leave day without burning paid leave or adding OT.
export const calculateMonthlyPayroll = (params: {
  profileId: string;
  employeeName: string;
  month: string;
  currency: FinanceV2Currency;
  baseSalaryMicros: bigint;
  workingDaysPerMonth: number;
  paidLeavesPerMonth: number;
  entries: {
    entryKind: FinanceV2PayrollEntryKind;
    days: string | null;
    bonusAmountMicros: string | null;
  }[];
}): FinanceV2PayrollMonthSummary => {
  const workingDays = BigInt(params.workingDaysPerMonth);
  if (workingDays <= BigInt('0')) {
    throw new BadRequestException('Working days per month must be positive.');
  }
  const perDayMicros = roundHalfUpDiv(params.baseSalaryMicros, workingDays);
  let leavesHundredths = BigInt('0');
  let swapsHundredths = BigInt('0');
  let overtimeHundredths = BigInt('0');
  let bonusTotal = BigInt('0');

  for (const entry of params.entries) {
    if (entry.entryKind === 'LEAVE' && entry.days) {
      leavesHundredths += parseDecimalToHundredths(entry.days);
    } else if (entry.entryKind === 'SWAP_COMP_OFF' && entry.days) {
      swapsHundredths += parseDecimalToHundredths(entry.days);
    } else if (entry.entryKind === 'OVERTIME' && entry.days) {
      overtimeHundredths += parseDecimalToHundredths(entry.days);
    } else if (entry.entryKind === 'BONUS' && entry.bonusAmountMicros) {
      bonusTotal += BigInt(entry.bonusAmountMicros);
    }
  }

  const netLeaveHundredths =
    leavesHundredths > swapsHundredths
      ? leavesHundredths - swapsHundredths
      : BigInt('0');
  const allowanceHundredths =
    BigInt(Math.max(0, params.paidLeavesPerMonth)) * BigInt('100');
  const paidUsedHundredths =
    netLeaveHundredths < allowanceHundredths
      ? netLeaveHundredths
      : allowanceHundredths;
  const paidRemainingHundredths = allowanceHundredths - paidUsedHundredths;
  const unpaidLeaveHundredths =
    netLeaveHundredths > allowanceHundredths
      ? netLeaveHundredths - allowanceHundredths
      : BigInt('0');

  const divisorHundredths = workingDays * BigInt('100');
  const rawDeductionMicros =
    unpaidLeaveHundredths > BigInt('0')
      ? roundHalfUpDiv(
          params.baseSalaryMicros * unpaidLeaveHundredths,
          divisorHundredths,
        )
      : BigInt('0');
  // G4-PAYROLL-POLICY: unpaid leave reduction can never exceed base salary (prevents negative net pay / phantom cash).
  const unpaidLeaveDeductionMicros =
    rawDeductionMicros > params.baseSalaryMicros
      ? params.baseSalaryMicros
      : rawDeductionMicros;
  const overtimePayMicros =
    overtimeHundredths > BigInt('0')
      ? roundHalfUpDiv(
          params.baseSalaryMicros * overtimeHundredths,
          divisorHundredths,
        )
      : BigInt('0');
  const netPayableMicros =
    params.baseSalaryMicros +
    overtimePayMicros +
    bonusTotal -
    unpaidLeaveDeductionMicros;

  return {
    profileId: params.profileId,
    employeeName: params.employeeName,
    month: params.month,
    currency: params.currency,
    baseSalaryMicros: params.baseSalaryMicros.toString(),
    workingDaysPerMonth: params.workingDaysPerMonth,
    paidLeavesPerMonth: params.paidLeavesPerMonth,
    perDayMicros: perDayMicros.toString(),
    leavesTakenDays: formatHundredthsToDecimal(leavesHundredths),
    swapsDays: formatHundredthsToDecimal(swapsHundredths),
    netLeaveDays: formatHundredthsToDecimal(netLeaveHundredths),
    paidLeavesUsedDays: formatHundredthsToDecimal(paidUsedHundredths),
    paidLeavesRemainingDays: formatHundredthsToDecimal(paidRemainingHundredths),
    unpaidLeaveDays: formatHundredthsToDecimal(unpaidLeaveHundredths),
    unpaidLeaveDeductionMicros: unpaidLeaveDeductionMicros.toString(),
    overtimeDays: formatHundredthsToDecimal(overtimeHundredths),
    overtimePayMicros: overtimePayMicros.toString(),
    bonusTotalMicros: bonusTotal.toString(),
    netPayableMicros: netPayableMicros.toString(),
  };
};

const formatMarginPercent = (
  numerator: bigint,
  revenue: bigint,
): string | null => {
  if (revenue <= BigInt('0')) return null;
  const scaled = roundHalfUpDiv(numerator * BigInt('10000'), revenue);
  return formatHundredthsToDecimal(scaled);
};

export const calculateProfitAndLoss = (
  lines: FinanceV2LedgerLineRecord[],
  fromDate: string,
  toDate: string,
): FinanceV2ProfitAndLoss => {
  let revenue = BigInt('0');
  let directExpense = BigInt('0');
  let indirectExpense = BigInt('0');
  let fxGainLoss = BigInt('0');
  const directByCategory = new Map<string, bigint>();
  const indirectByCategory = new Map<string, bigint>();

  for (const line of lines) {
    if (line.status !== 'POSTED') continue;
    if (line.entryDate < fromDate || line.entryDate > toDate) continue;
    const debit = BigInt(line.debitAedMicros);
    const credit = BigInt(line.creditAedMicros);

    if (line.accountSubType === 'FX_GAIN_LOSS') {
      fxGainLoss += credit - debit;
    } else if (line.accountType === 'REVENUE') {
      revenue += credit - debit;
    } else if (line.accountType === 'DIRECT_EXPENSE') {
      const delta = debit - credit;
      directExpense += delta;
      directByCategory.set(
        line.category,
        (directByCategory.get(line.category) ?? BigInt('0')) + delta,
      );
    } else if (line.accountType === 'INDIRECT_EXPENSE') {
      const delta = debit - credit;
      indirectExpense += delta;
      indirectByCategory.set(
        line.category,
        (indirectByCategory.get(line.category) ?? BigInt('0')) + delta,
      );
    }
  }

  const grossProfit = revenue - directExpense;
  const netProfit = grossProfit - indirectExpense + fxGainLoss;

  return {
    fromDate,
    toDate,
    revenueAedMicros: revenue.toString(),
    directExpenseAedMicros: directExpense.toString(),
    grossProfitAedMicros: grossProfit.toString(),
    grossMarginPercent: formatMarginPercent(grossProfit, revenue),
    indirectExpenseAedMicros: indirectExpense.toString(),
    fxGainLossAedMicros: fxGainLoss.toString(),
    netProfitAedMicros: netProfit.toString(),
    netMarginPercent: formatMarginPercent(netProfit, revenue),
    directBreakdown: [...directByCategory.entries()]
      .filter(([, amount]) => amount !== BigInt('0'))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, amount]) => ({
        category,
        aedMicros: amount.toString(),
      })),
    indirectBreakdown: [...indirectByCategory.entries()]
      .filter(([, amount]) => amount !== BigInt('0'))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, amount]) => ({
        category,
        aedMicros: amount.toString(),
      })),
  };
};

// Enforces G2-BALANCE-SHEET: computes cumulative AED Assets, Liabilities, and Equity as of `asOfDate`.
export const calculateBalanceSheet = (
  lines: FinanceV2LedgerLineRecord[],
  asOfDate: string,
  personEmailsByAccountId: Map<string, string | null> = new Map(),
): FinanceV2BalanceSheet => {
  const cashMap = new Map<
    string,
    {
      accountId: string;
      currency: FinanceV2Currency;
      original: bigint;
      aed: bigint;
    }
  >();
  let fixedAssets = BigInt('0');
  const personMap = new Map<
    string,
    {
      accountId: string;
      personName: string;
      personEmail: string | null;
      borrowedAed: bigint;
      repaidAed: bigint;
      byCurrency: Map<FinanceV2Currency, { borrowed: bigint; repaid: bigint }>;
    }
  >();
  let openingEquity = BigInt('0');
  let cumulativeRevenue = BigInt('0');
  let cumulativeDirectExpense = BigInt('0');
  let cumulativeIndirectExpense = BigInt('0');
  let cumulativeFxGainLoss = BigInt('0');

  for (const line of lines) {
    if (line.status !== 'POSTED') continue;
    if (line.entryDate > asOfDate) continue;
    const debit = BigInt(line.debitAedMicros);
    const credit = BigInt(line.creditAedMicros);
    const originalSigned = BigInt(line.originalSignedMicros);

    if (line.accountSubType === 'CASH_CURRENCY') {
      const currency = line.accountCurrency ?? line.currency;
      const existing = cashMap.get(line.accountId) ?? {
        accountId: line.accountId,
        currency,
        original: BigInt('0'),
        aed: BigInt('0'),
      };
      existing.original += originalSigned;
      existing.aed += debit - credit;
      cashMap.set(line.accountId, existing);
    } else if (line.accountSubType === 'FIXED_ASSET') {
      fixedAssets += debit - credit;
    } else if (line.accountSubType === 'PERSON_LIABILITY') {
      const existing = personMap.get(line.accountId) ?? {
        accountId: line.accountId,
        personName: line.personName ?? line.accountName,
        personEmail: personEmailsByAccountId.get(line.accountId) ?? null,
        borrowedAed: BigInt('0'),
        repaidAed: BigInt('0'),
        byCurrency: new Map(),
      };
      existing.borrowedAed += credit;
      existing.repaidAed += debit;
      const currencyEntry = existing.byCurrency.get(line.currency) ?? {
        borrowed: BigInt('0'),
        repaid: BigInt('0'),
      };
      // For liability accounts, credit increases owed (originalSigned < 0), debit reduces owed (originalSigned > 0).
      if (credit > BigInt('0')) {
        currencyEntry.borrowed +=
          originalSigned < BigInt('0') ? -originalSigned : originalSigned;
      } else if (debit > BigInt('0')) {
        currencyEntry.repaid +=
          originalSigned < BigInt('0') ? -originalSigned : originalSigned;
      }
      existing.byCurrency.set(line.currency, currencyEntry);
      personMap.set(line.accountId, existing);
    } else if (line.accountType === 'EQUITY') {
      openingEquity += credit - debit;
    } else if (line.accountSubType === 'FX_GAIN_LOSS') {
      cumulativeFxGainLoss += credit - debit;
    } else if (line.accountType === 'REVENUE') {
      cumulativeRevenue += credit - debit;
    } else if (line.accountType === 'DIRECT_EXPENSE') {
      cumulativeDirectExpense += debit - credit;
    } else if (line.accountType === 'INDIRECT_EXPENSE') {
      cumulativeIndirectExpense += debit - credit;
    }
  }

  const cashByCurrency: FinanceV2CashCurrencyBalance[] = [...cashMap.values()]
    .sort((left, right) => left.currency.localeCompare(right.currency))
    .map((item) => ({
      accountId: item.accountId,
      currency: item.currency,
      originalMicros: item.original.toString(),
      aedMicros: item.aed.toString(),
    }));
  const totalCash = [...cashMap.values()].reduce(
    (sum, item) => sum + item.aed,
    BigInt('0'),
  );
  const totalAssets = totalCash + fixedAssets;

  const liabilitiesByPerson: FinanceV2PersonLiabilityBalance[] = [
    ...personMap.values(),
  ]
    .sort((left, right) => left.personName.localeCompare(right.personName))
    .map((person) => ({
      accountId: person.accountId,
      personName: person.personName,
      personEmail: person.personEmail,
      totalBorrowedAedMicros: person.borrowedAed.toString(),
      totalRepaidAedMicros: person.repaidAed.toString(),
      balanceOwedAedMicros: (person.borrowedAed - person.repaidAed).toString(),
      byCurrency: [...person.byCurrency.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, values]) => ({
          currency,
          borrowedMicros: values.borrowed.toString(),
          repaidMicros: values.repaid.toString(),
          balanceOwedMicros: (values.borrowed - values.repaid).toString(),
        })),
    }));
  const totalLiabilities = [...personMap.values()].reduce(
    (sum, item) => sum + (item.borrowedAed - item.repaidAed),
    BigInt('0'),
  );

  const accumulatedNetProfit =
    cumulativeRevenue -
    cumulativeDirectExpense -
    cumulativeIndirectExpense +
    cumulativeFxGainLoss;
  const totalEquity = openingEquity + accumulatedNetProfit;
  const imbalance = totalAssets - (totalLiabilities + totalEquity);

  return {
    asOfDate,
    cashByCurrency,
    totalCashAedMicros: totalCash.toString(),
    fixedAssetsAedMicros: fixedAssets.toString(),
    totalAssetsAedMicros: totalAssets.toString(),
    liabilitiesByPerson,
    totalLiabilitiesAedMicros: totalLiabilities.toString(),
    openingEquityAedMicros: openingEquity.toString(),
    accumulatedNetProfitAedMicros: accumulatedNetProfit.toString(),
    totalEquityAedMicros: totalEquity.toString(),
    isBalanced: imbalance === BigInt('0'),
    imbalanceAedMicros: imbalance.toString(),
  };
};
