import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  FINANCE_V2_BASE_CURRENCY,
  FINANCE_V2_CURRENCIES,
  FINANCE_V2_DEFAULT_TIMEZONE,
  type FinanceV2BalanceSheet,
  type FinanceV2CashCurrencyBalance,
  type FinanceV2Currency,
  type FinanceV2DocumentLineItem,
  type FinanceV2JournalLineDraft,
  type FinanceV2LedgerLineRecord,
  type FinanceV2MonthlyTrendPoint,
  type FinanceV2PayrollEntryKind,
  type FinanceV2PayrollMonthSummary,
  type FinanceV2PayrollPayTiming,
  type FinanceV2PersonLiabilityBalance,
  type FinanceV2ProfitAndLoss,
  type FinanceV2ProjectProfitabilityRow,
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
  .refine((value) => {
    try {
      return parseDecimalToMicros(value) > BigInt('0');
    } catch {
      return false;
    }
  }, 'Exchange rate must be greater than zero.');

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

export const assertWithinMaxMicros = (
  value: bigint,
  label = 'Amount',
): bigint => {
  const abs = value < BigInt('0') ? -value : value;
  if (abs > MAX_AMOUNT_MICROS) {
    throw new BadRequestException(`${label} exceeds the supported maximum.`);
  }
  return value;
};

export const validateLogoDataUrl = (value: string): string => {
  const match =
    /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) {
    throw new BadRequestException('Logo must be a valid PNG or JPG image.');
  }
  const declaredType = match[1];
  const rawBase64 = match[2];
  const buffer = Buffer.from(rawBase64, 'base64');
  if (buffer.length < 33 || buffer.length > 1_100_000) {
    throw new BadRequestException('Logo image is invalid or exceeds 1 MB.');
  }

  const MAX_LOGO_DIMENSION = 4096;

  if (declaredType === 'png') {
    const isPngHeader =
      buffer.length >= 45 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a &&
      buffer.readUInt32BE(8) === 13 &&
      buffer.subarray(12, 16).toString('ascii') === 'IHDR';
    if (!isPngHeader) {
      throw new BadRequestException(
        'Uploaded PNG logo is corrupted or invalid.',
      );
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (
      width < 1 ||
      height < 1 ||
      width > MAX_LOGO_DIMENSION ||
      height > MAX_LOGO_DIMENSION
    ) {
      throw new BadRequestException(
        `Logo dimensions must be between 1×1 and ${MAX_LOGO_DIMENSION}×${MAX_LOGO_DIMENSION} pixels.`,
      );
    }
    let offset = 8;
    let hasIdat = false;
    let hasIend = false;
    while (offset + 12 <= buffer.length) {
      const chunkLength = buffer.readUInt32BE(offset);
      const chunkType = buffer
        .subarray(offset + 4, offset + 8)
        .toString('ascii');
      const nextOffset = offset + 12 + chunkLength;
      if (nextOffset > buffer.length) {
        throw new BadRequestException(
          'Uploaded PNG logo is truncated or corrupted.',
        );
      }
      if (chunkType === 'IDAT') hasIdat = true;
      if (chunkType === 'IEND') {
        hasIend = true;
        break;
      }
      offset = nextOffset;
    }
    if (!hasIdat || !hasIend) {
      throw new BadRequestException(
        'Uploaded PNG logo is incomplete or corrupted.',
      );
    }
    return value;
  }

  // JPEG magic bytes: FF D8 FF and must end with EOI (FF D9)
  if (
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[2] !== 0xff ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    throw new BadRequestException('Uploaded JPG logo is corrupted or invalid.');
  }
  let offset = 2;
  let width = 0;
  let height = 0;
  let foundSos = false;
  while (offset + 2 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      throw new BadRequestException(
        'Uploaded JPG logo has corrupted marker framing.',
      );
    }
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9) break; // EOI
    if (marker === 0xda) {
      foundSos = true;
      break; // SOS — entropy-coded scan follows until EOI
    }
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 2 > buffer.length) {
      throw new BadRequestException('Uploaded JPG logo is truncated.');
    }
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new BadRequestException('Uploaded JPG logo is truncated.');
    }
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof && segmentLength >= 7 && offset + 7 <= buffer.length) {
      height = buffer.readUInt16BE(offset + 3);
      width = buffer.readUInt16BE(offset + 5);
    }
    offset += segmentLength;
  }
  if (!foundSos) {
    throw new BadRequestException('Uploaded JPG logo is incomplete.');
  }
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_LOGO_DIMENSION ||
    height > MAX_LOGO_DIMENSION
  ) {
    throw new BadRequestException(
      `Logo dimensions must be between 1×1 and ${MAX_LOGO_DIMENSION}×${MAX_LOGO_DIMENSION} pixels.`,
    );
  }
  return value;
};

export const convertToAedMicros = (
  amountMicros: bigint,
  currency: FinanceV2Currency,
  fxRateToAed: string,
): bigint => {
  assertWithinMaxMicros(amountMicros, 'Amount');
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
  assertWithinMaxMicros(converted, 'Converted AED amount');
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
    assertWithinMaxMicros(line.debitAedMicros, 'Journal debit');
    assertWithinMaxMicros(line.creditAedMicros, 'Journal credit');
    assertWithinMaxMicros(line.originalSignedMicros, 'Journal line amount');
    const hasDebit = line.debitAedMicros > BigInt('0');
    const hasCredit = line.creditAedMicros > BigInt('0');
    if (hasDebit === hasCredit) {
      throw new BadRequestException(
        'Each journal line must have either a positive debit or a positive credit.',
      );
    }
    totalDebits += line.debitAedMicros;
    totalCredits += line.creditAedMicros;
    assertWithinMaxMicros(totalDebits, 'Journal total');
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

export const isValidIanaTimezone = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
};

export const todayIsoDateInTimezone = (
  now = new Date(),
  timeZone: string = FINANCE_V2_DEFAULT_TIMEZONE,
): string => {
  const safeZone = isValidIanaTimezone(timeZone)
    ? timeZone.trim()
    : FINANCE_V2_DEFAULT_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback to UTC ISO date below.
  }
  return now.toISOString().slice(0, 10);
};

export const resolvePayrollSettlementMonth = (
  serviceMonth: string,
  payDayOfMonth: number,
  payTiming?: FinanceV2PayrollPayTiming | null,
): string => {
  if (payTiming === 'FOLLOWING_MONTH') {
    return nextYearMonth(serviceMonth);
  }
  if (payTiming === 'SAME_MONTH') {
    return serviceMonth;
  }
  return payDayOfMonth <= 10 ? nextYearMonth(serviceMonth) : serviceMonth;
};

// Builds an ordered, bounded catch-up month list from earliestStartMonth..currentMonth
// (at minimum [previousMonth, currentMonth], capped at maxMonthsBack inclusive months).
export const buildAutomationCandidateMonths = (
  earliestStartMonth: string | null,
  currentMonth: string,
  maxMonthsBack = 12,
): string[] => {
  const boundedBack = Math.max(2, Math.min(24, maxMonthsBack));
  let floorMonth = currentMonth;
  for (let idx = 0; idx < boundedBack - 1; idx += 1) {
    floorMonth = previousYearMonth(floorMonth);
  }
  const prevMonth = previousYearMonth(currentMonth);
  let start =
    earliestStartMonth && earliestStartMonth < prevMonth
      ? earliestStartMonth
      : prevMonth;
  if (start < floorMonth) {
    start = floorMonth;
  }
  const months: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= currentMonth && guard < 36) {
    months.push(cursor);
    cursor = nextYearMonth(cursor);
    guard += 1;
  }
  return months;
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
  // Overdraft split: extinguish all positive carrying AED, then book only the overdraft excess at spot.
  if (outflowOriginalMicros > currentOriginalMicros) {
    const overdraftOrig = outflowOriginalMicros - currentOriginalMicros;
    const overdraftSpotAed = roundHalfUpDiv(
      fallbackAedMicros * overdraftOrig,
      outflowOriginalMicros,
    );
    return assertWithinMaxMicros(
      currentAedMicros + overdraftSpotAed,
      'Outflow carrying AED',
    );
  }
  return roundHalfUpDiv(
    currentAedMicros * outflowOriginalMicros,
    currentOriginalMicros,
  );
};

// When cash flows INTO an overdrawn foreign cash account (negative balance), extinguish the negative
// carrying AED proportionally (or fully) so returning to 0.00 foreign cash leaves 0.00 AED.
export const computeWeightedInflowAed = (
  inflowOriginalMicros: bigint,
  currentOriginalMicros: bigint,
  currentAedMicros: bigint,
  spotAedMicros: bigint,
): bigint => {
  if (currentOriginalMicros >= BigInt('0') || currentAedMicros >= BigInt('0')) {
    return spotAedMicros;
  }
  const overdraftOrig = -currentOriginalMicros;
  const overdraftAed = -currentAedMicros;
  if (inflowOriginalMicros === overdraftOrig) {
    return overdraftAed;
  }
  if (inflowOriginalMicros < overdraftOrig) {
    return roundHalfUpDiv(overdraftAed * inflowOriginalMicros, overdraftOrig);
  }
  const positiveRemainder = inflowOriginalMicros - overdraftOrig;
  const remainderSpotAed = roundHalfUpDiv(
    spotAedMicros * positiveRemainder,
    inflowOriginalMicros,
  );
  return assertWithinMaxMicros(
    overdraftAed + remainderSpotAed,
    'Inflow carrying AED',
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
  if (
    status === 'READY' ||
    status === 'PAID' ||
    status === 'VOID' ||
    paidMicros >= totalMicros
  ) {
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
    const grossLine = assertWithinMaxMicros(
      roundHalfUpDiv(quantityMicros * unitPrice, MICROS_SCALE),
      'Line item total',
    );
    const lineDiscount = roundHalfUpDiv(
      grossLine * discountRate,
      BigInt('10000'),
    );
    const lineTotal = grossLine - lineDiscount;
    subtotal = assertWithinMaxMicros(subtotal + grossLine, 'Document subtotal');
    discountTotal = assertWithinMaxMicros(
      discountTotal + lineDiscount,
      'Document discount',
    );
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
  const total = assertWithinMaxMicros(
    subtotal - discountTotal,
    'Document total',
  );
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
  assertWithinMaxMicros(params.baseSalaryMicros, 'Base salary');
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
      bonusTotal = assertWithinMaxMicros(
        bonusTotal + BigInt(entry.bonusAmountMicros),
        'Bonus total',
      );
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
  const overtimePayMicros = assertWithinMaxMicros(
    overtimeHundredths > BigInt('0')
      ? roundHalfUpDiv(
          params.baseSalaryMicros * overtimeHundredths,
          divisorHundredths,
        )
      : BigInt('0'),
    'Overtime pay',
  );
  const netPayableMicros = assertWithinMaxMicros(
    params.baseSalaryMicros +
      overtimePayMicros +
      bonusTotal -
      unpaidLeaveDeductionMicros,
    'Net payable payroll',
  );

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

const PAYROLL_SENSITIVE_ENTRY_TYPES = new Set([
  'PAYROLL_BASE',
  'PAYROLL_OVERTIME',
  'PAYROLL_LEAVE_REDUCTION',
  'PAYROLL_BONUS',
]);

export const isPayrollSensitiveCategory = (category: string): boolean => {
  const upper = (category ?? '').trim().toUpperCase();
  return upper === 'DIRECT_SALARY' || upper.startsWith('PAYROLL_');
};

const isPayrollSensitiveLine = (line: FinanceV2LedgerLineRecord): boolean =>
  PAYROLL_SENSITIVE_ENTRY_TYPES.has(line.entryType) ||
  isPayrollSensitiveCategory(line.category);

export const calculateProfitAndLoss = (
  lines: FinanceV2LedgerLineRecord[],
  fromDate: string,
  toDate: string,
  options?: { redactPayrollBreakdown?: boolean },
): FinanceV2ProfitAndLoss => {
  const redactPayroll = options?.redactPayrollBreakdown === true;
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
      const bucketCategory =
        redactPayroll && isPayrollSensitiveLine(line)
          ? 'DIRECT_OTHER'
          : line.category;
      directByCategory.set(
        bucketCategory,
        (directByCategory.get(bucketCategory) ?? BigInt('0')) + delta,
      );
    } else if (line.accountType === 'INDIRECT_EXPENSE') {
      const delta = debit - credit;
      indirectExpense += delta;
      const bucketCategory =
        redactPayroll && isPayrollSensitiveLine(line)
          ? 'INDIRECT_OTHER'
          : line.category;
      indirectByCategory.set(
        bucketCategory,
        (indirectByCategory.get(bucketCategory) ?? BigInt('0')) + delta,
      );
    }
  }

  const grossProfit = revenue - directExpense;
  const totalExpense = directExpense + indirectExpense;
  const netProfit = grossProfit - indirectExpense + fxGainLoss;

  return {
    fromDate,
    toDate,
    revenueAedMicros: revenue.toString(),
    directExpenseAedMicros: directExpense.toString(),
    grossProfitAedMicros: grossProfit.toString(),
    grossMarginPercent: formatMarginPercent(grossProfit, revenue),
    indirectExpenseAedMicros: indirectExpense.toString(),
    totalExpenseAedMicros: totalExpense.toString(),
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
      const isPayrollLeaveReduction =
        line.entryType === 'PAYROLL_LEAVE_REDUCTION';
      const isReversal = line.entryType === 'REVERSAL';
      const isLoanRepaymentReversal =
        isReversal && line.reversalOfEntryType === 'LOAN_REPAYMENT';
      const isLeaveReductionReversal =
        isReversal && line.reversalOfEntryType === 'PAYROLL_LEAVE_REDUCTION';
      if (
        (isPayrollLeaveReduction || (isReversal && !isLoanRepaymentReversal)) &&
        debit > BigInt('0')
      ) {
        existing.borrowedAed -= debit;
      } else if (isLoanRepaymentReversal && credit > BigInt('0')) {
        existing.repaidAed -= credit;
      } else if (isLeaveReductionReversal && credit > BigInt('0')) {
        existing.borrowedAed += credit;
      } else {
        existing.borrowedAed += credit;
        existing.repaidAed += debit;
      }
      const currencyEntry = existing.byCurrency.get(line.currency) ?? {
        borrowed: BigInt('0'),
        repaid: BigInt('0'),
      };
      // For liability accounts, credit increases owed (originalSigned < 0), debit reduces owed (originalSigned > 0).
      const origAbs =
        originalSigned < BigInt('0') ? -originalSigned : originalSigned;
      if (credit > BigInt('0')) {
        if (isLoanRepaymentReversal) {
          currencyEntry.repaid -= origAbs;
        } else {
          currencyEntry.borrowed += origAbs;
        }
      } else if (debit > BigInt('0')) {
        if (
          isPayrollLeaveReduction ||
          (isReversal && !isLoanRepaymentReversal)
        ) {
          currencyEntry.borrowed -= origAbs;
        } else {
          currencyEntry.repaid += origAbs;
        }
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

export const resolveMonthLastDate = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

export const addDaysToIsoDate = (
  isoDate: string,
  deltaDays: number,
): string => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day + deltaDays);
  const next = new Date(utc);
  return `${String(next.getUTCFullYear()).padStart(4, '0')}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
};

export const calculatePreviousPeriodRange = (
  fromDate: string,
  toDate: string,
): { fromDate: string; toDate: string } => {
  const fromMonth = fromDate.slice(0, 7);
  const toMonth = toDate.slice(0, 7);
  if (
    fromMonth === toMonth &&
    fromDate === `${fromMonth}-01` &&
    toDate === resolveMonthLastDate(fromMonth)
  ) {
    const prevMonth = previousYearMonth(fromMonth);
    return {
      fromDate: `${prevMonth}-01`,
      toDate: resolveMonthLastDate(prevMonth),
    };
  }
  const [fromYear, fromM, fromD] = fromDate.split('-').map(Number);
  const [toYear, toM, toD] = toDate.split('-').map(Number);
  const fromMs = Date.UTC(fromYear, fromM - 1, fromD);
  const toMs = Date.UTC(toYear, toM - 1, toD);
  const spanDays = Math.max(1, Math.floor((toMs - fromMs) / 86_400_000) + 1);
  return {
    fromDate: addDaysToIsoDate(fromDate, -spanDays),
    toDate: addDaysToIsoDate(fromDate, -1),
  };
};

export const calculateMonthlyTrend = (
  lines: FinanceV2LedgerLineRecord[],
  endMonth: string,
  monthsCount = 6,
): FinanceV2MonthlyTrendPoint[] => {
  const months: string[] = [];
  let cursor = endMonth;
  for (let i = 0; i < monthsCount; i += 1) {
    months.unshift(cursor);
    cursor = previousYearMonth(cursor);
  }
  return months.map((month) => {
    const pnl = calculateProfitAndLoss(
      lines,
      `${month}-01`,
      resolveMonthLastDate(month),
    );
    return {
      month,
      revenueAedMicros: pnl.revenueAedMicros,
      directExpenseAedMicros: pnl.directExpenseAedMicros,
      indirectExpenseAedMicros: pnl.indirectExpenseAedMicros,
      totalExpenseAedMicros: pnl.totalExpenseAedMicros,
      netProfitAedMicros: pnl.netProfitAedMicros,
      netMarginPercent: pnl.netMarginPercent,
    };
  });
};

export const calculateBurnAndRunway = (
  lines: FinanceV2LedgerLineRecord[],
  fromDate: string,
  toDate: string,
  asOfDate: string,
  totalCashAedMicros: bigint,
): {
  periodNetCashFlowAedMicros: string;
  avgMonthlyExpense3mAedMicros: string;
  avgMonthlyNetBurn3mAedMicros: string;
  estimatedRunwayMonths: string | null;
} => {
  let periodNetCashFlow = BigInt('0');
  for (const line of lines) {
    if (line.status !== 'POSTED') continue;
    if (line.accountSubType !== 'CASH_CURRENCY') continue;
    if (
      line.entryType === 'OPENING_BALANCE' ||
      (line.entryType === 'REVERSAL' &&
        line.reversalOfEntryType === 'OPENING_BALANCE')
    ) {
      continue;
    }
    if (line.entryDate < fromDate || line.entryDate > toDate) continue;
    periodNetCashFlow +=
      BigInt(line.debitAedMicros) - BigInt(line.creditAedMicros);
  }

  const asOfMonth = asOfDate.slice(0, 7);
  const trailingMonths = [
    previousYearMonth(previousYearMonth(asOfMonth)),
    previousYearMonth(asOfMonth),
    asOfMonth,
  ];
  let totalExpense3m = BigInt('0');
  let totalNetProfit3m = BigInt('0');
  for (const month of trailingMonths) {
    const monthEnd =
      month === asOfMonth ? asOfDate : resolveMonthLastDate(month);
    const point = calculateProfitAndLoss(lines, `${month}-01`, monthEnd);
    totalExpense3m += BigInt(point.totalExpenseAedMicros);
    totalNetProfit3m += BigInt(point.netProfitAedMicros);
  }

  const avgMonthlyExpense3m = roundHalfUpDiv(totalExpense3m, BigInt('3'));
  const avgMonthlyNetBurn3m =
    totalNetProfit3m < BigInt('0')
      ? roundHalfUpDiv(-totalNetProfit3m, BigInt('3'))
      : BigInt('0');

  let estimatedRunwayMonths: string | null = null;
  if (avgMonthlyNetBurn3m > BigInt('0')) {
    if (totalCashAedMicros <= BigInt('0')) {
      estimatedRunwayMonths = '0';
    } else {
      const scaled = roundHalfUpDiv(
        totalCashAedMicros * BigInt('100'),
        avgMonthlyNetBurn3m,
      );
      estimatedRunwayMonths = formatHundredthsToDecimal(scaled);
    }
  }

  return {
    periodNetCashFlowAedMicros: periodNetCashFlow.toString(),
    avgMonthlyExpense3mAedMicros: avgMonthlyExpense3m.toString(),
    avgMonthlyNetBurn3mAedMicros: avgMonthlyNetBurn3m.toString(),
    estimatedRunwayMonths,
  };
};

export const calculateProjectProfitability = (
  lines: FinanceV2LedgerLineRecord[],
  fromDate: string,
  toDate: string,
  projectNamesById: Map<string, string>,
  includePayroll: boolean,
): FinanceV2ProjectProfitabilityRow[] => {
  const buckets = new Map<
    string,
    {
      projectId: string | null;
      projectName: string;
      revenue: bigint;
      directExpense: bigint;
    }
  >();

  for (const line of lines) {
    if (line.status !== 'POSTED') continue;
    if (line.entryDate < fromDate || line.entryDate > toDate) continue;
    // Exclude FX gain/loss lines (which carry accountType === 'REVENUE') from client service revenue.
    if (line.accountSubType === 'FX_GAIN_LOSS') continue;
    if (!includePayroll && isPayrollSensitiveLine(line)) {
      continue;
    }
    if (
      line.accountType !== 'REVENUE' &&
      line.accountType !== 'DIRECT_EXPENSE'
    ) {
      continue;
    }

    const projectId = line.projectId ?? null;
    // For non-admins, omit unassigned rows so subtracting sum(projectProfitability) from P&L cannot leak payroll spend.
    if (!includePayroll && projectId === null) {
      continue;
    }

    const key = projectId ?? '__unassigned__';
    const existing = buckets.get(key) ?? {
      projectId,
      projectName: projectId
        ? (projectNamesById.get(projectId) ?? 'Archived Project')
        : 'Unassigned / General',
      revenue: BigInt('0'),
      directExpense: BigInt('0'),
    };
    const debit = BigInt(line.debitAedMicros);
    const credit = BigInt(line.creditAedMicros);
    if (line.accountType === 'REVENUE') {
      existing.revenue += credit - debit;
    } else if (line.accountType === 'DIRECT_EXPENSE') {
      existing.directExpense += debit - credit;
    }
    buckets.set(key, existing);
  }

  return [...buckets.values()]
    .filter(
      (item) =>
        item.revenue !== BigInt('0') || item.directExpense !== BigInt('0'),
    )
    .sort((left, right) => {
      if (left.projectId === null && right.projectId !== null) return 1;
      if (left.projectId !== null && right.projectId === null) return -1;
      if (right.revenue !== left.revenue) {
        return right.revenue > left.revenue ? 1 : -1;
      }
      return left.projectName.localeCompare(right.projectName);
    })
    .map((item) => {
      const grossProfit = item.revenue - item.directExpense;
      return {
        projectId: item.projectId,
        projectName: item.projectName,
        revenueAedMicros: item.revenue.toString(),
        directExpenseAedMicros: item.directExpense.toString(),
        grossProfitAedMicros: grossProfit.toString(),
        grossMarginPercent: formatMarginPercent(grossProfit, item.revenue),
      };
    });
};
