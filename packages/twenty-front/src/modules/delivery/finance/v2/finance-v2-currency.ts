import {
  FINANCE_V2_CURRENCIES,
  type FinanceV2Currency,
} from '@/delivery/finance/v2/finance-v2.types';

const MICROS_SCALE = 1_000_000n;
const HALF_MICROS = 500_000n;

export const FINANCE_V2_FALLBACK_FX_RATES: Record<FinanceV2Currency, string> = {
  AED: '1',
  USD: '3.6725',
  INR: '0.0435',
  QAR: '1.008',
  EUR: '3.98',
  GBP: '4.66',
  SGD: '2.73',
  AUD: '2.40',
  CAD: '2.65',
};

const DECIMAL_PATTERN = /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/;
const CANONICAL_UNSIGNED_MICROS = /^(?:0|[1-9]\d*)$/;

export const MAX_FINANCE_V2_ENTRY_MICROS = 9_000_000_000_000_000_000n;

export const isFinanceV2AmountMicrosWithinLimit = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 19 &&
  CANONICAL_UNSIGNED_MICROS.test(value) &&
  BigInt(value) <= MAX_FINANCE_V2_ENTRY_MICROS;

export const isFinanceV2Currency = (
  value: string | null | undefined,
): value is FinanceV2Currency =>
  Boolean(value) && FINANCE_V2_CURRENCIES.includes(value as FinanceV2Currency);

const parsePositiveRateMicros = (raw: string | undefined): bigint | null => {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!DECIMAL_PATTERN.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  const micros =
    BigInt(whole || '0') * MICROS_SCALE + BigInt(fraction.padEnd(6, '0'));
  return micros > 0n ? micros : null;
};

export const resolveRateToAedMicros = (
  currency: FinanceV2Currency,
  exchangeRates: Record<string, string>,
): bigint => {
  if (currency === 'AED') return MICROS_SCALE;
  return (
    parsePositiveRateMicros(exchangeRates[currency]) ??
    parsePositiveRateMicros(FINANCE_V2_FALLBACK_FX_RATES[currency]) ??
    MICROS_SCALE
  );
};

export const resolveRateToAedLabel = (
  currency: FinanceV2Currency,
  exchangeRates: Record<string, string>,
): string => {
  if (currency === 'AED') return '1';
  const raw = exchangeRates[currency]?.trim();
  if (parsePositiveRateMicros(raw) !== null && raw) return raw;
  return FINANCE_V2_FALLBACK_FX_RATES[currency];
};

const roundHalfUpDiv = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator <= 0n) return 0n;
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = (abs + denominator / 2n) / denominator;
  return negative ? -quotient : quotient;
};

export const roundMicrosToCents = (micros: string | bigint): string => {
  const value = typeof micros === 'bigint' ? micros : BigInt(micros);
  const roundedCents = roundHalfUpDiv(value, 10_000n);
  return (roundedCents * 10_000n).toString();
};

export const convertCurrencyMicros = (
  amountMicros: string | bigint,
  fromCurrency: FinanceV2Currency,
  toCurrency: FinanceV2Currency,
  exchangeRates: Record<string, string>,
): string => {
  const amount =
    typeof amountMicros === 'bigint' ? amountMicros : BigInt(amountMicros);
  if (amount === 0n || fromCurrency === toCurrency) {
    return amount.toString();
  }
  const fromRate = resolveRateToAedMicros(fromCurrency, exchangeRates);
  const toRate = resolveRateToAedMicros(toCurrency, exchangeRates);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  // Direct exact ratio: abs * fromRate / toRate (avoids double rounding through AED)
  const converted =
    toCurrency === 'AED'
      ? (abs * fromRate + HALF_MICROS) / MICROS_SCALE
      : roundHalfUpDiv(abs * fromRate, toRate);
  return (negative ? -converted : converted).toString();
};

export const convertAedMicrosToDisplay = (
  aedMicros: string | bigint,
  displayCurrency: FinanceV2Currency,
  exchangeRates: Record<string, string>,
): string => {
  const converted = convertCurrencyMicros(
    aedMicros,
    'AED',
    displayCurrency,
    exchangeRates,
  );
  return displayCurrency === 'AED' ? converted : roundMicrosToCents(converted);
};

const formatHundredths = (hundredths: bigint): string => {
  const negative = hundredths < 0n;
  const abs = negative ? -hundredths : hundredths;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
};

export const formatPercentDelta = (
  currentMicros: string | bigint,
  previousMicros: string | bigint,
): { label: string; direction: 'up' | 'down' | 'flat' } | null => {
  const current =
    typeof currentMicros === 'bigint' ? currentMicros : BigInt(currentMicros);
  const previous =
    typeof previousMicros === 'bigint'
      ? previousMicros
      : BigInt(previousMicros);
  if (previous === 0n) {
    if (current === 0n) return { label: '0%', direction: 'flat' };
    return null;
  }
  const diff = current - previous;
  if (diff === 0n) return { label: '0%', direction: 'flat' };
  const absPrevious = previous < 0n ? -previous : previous;
  const pctHundredths = roundHalfUpDiv(diff * 10_000n, absPrevious);
  const formatted = formatHundredths(pctHundredths);
  return {
    label: pctHundredths > 0n ? `+${formatted}%` : `${formatted}%`,
    direction: pctHundredths > 0n ? 'up' : pctHundredths < 0n ? 'down' : 'flat',
  };
};

const YEAR_MONTH_REGEX = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const isValidYearMonth = (value: string): boolean =>
  YEAR_MONTH_REGEX.test(value.trim());

export const isValidIsoDate = (value: string): boolean => {
  const cleaned = value.trim();
  if (!ISO_DATE_REGEX.test(cleaned)) return false;
  const [year, month, day] = cleaned.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

export const formatRatioPercent = (
  numeratorMicros: string | bigint,
  denominatorMicros: string | bigint,
): string | null => {
  const numerator =
    typeof numeratorMicros === 'bigint'
      ? numeratorMicros
      : BigInt(numeratorMicros);
  const denominator =
    typeof denominatorMicros === 'bigint'
      ? denominatorMicros
      : BigInt(denominatorMicros);
  if (denominator <= 0n) return null;
  const pctHundredths = roundHalfUpDiv(numerator * 10_000n, denominator);
  return formatHundredths(pctHundredths);
};

export const buildExchangeRateNote = (
  sourceCurrencies: FinanceV2Currency[],
  displayCurrency: FinanceV2Currency,
  exchangeRates: Record<string, string>,
): string => {
  const unique = [...new Set([...sourceCurrencies, displayCurrency])].filter(
    (code) => code !== 'AED',
  );
  if (unique.length === 0) return '';
  return unique
    .map(
      (code) => `1 ${code} = ${resolveRateToAedLabel(code, exchangeRates)} AED`,
    )
    .join(' · ');
};

export const getMonthLastDate = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

export const getMonthRange = (
  month: string,
): { fromDate: string; toDate: string } => ({
  fromDate: `${month}-01`,
  toDate: getMonthLastDate(month),
});

export const shiftYearMonth = (month: string, deltaMonths: number): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + deltaMonths, 1));
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const addDaysIso = (isoDate: string, deltaDays: number): string => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${String(next.getUTCFullYear()).padStart(4, '0')}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
};

export const computeDefaultReversalDate = (
  today: string,
  entryDate: string,
  lockedThroughDate?: string | null,
): string => {
  let candidate = today >= entryDate ? today : entryDate;
  if (
    lockedThroughDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(lockedThroughDate) &&
    candidate <= lockedThroughDate
  ) {
    candidate = addDaysIso(lockedThroughDate, 1);
  }
  return candidate;
};

export const getQuarterRange = (
  today: string,
): { fromDate: string; toDate: string } => {
  const [year, month] = today.split('-').map(Number);
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return {
    fromDate: `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`,
    toDate: today,
  };
};

export type FinanceV2PeriodPreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'last30Days'
  | 'thisQuarter'
  | 'ytd'
  | 'allTime'
  | 'month'
  | 'custom';

export const detectPeriodPreset = (
  fromDate: string,
  toDate: string,
  today: string,
): FinanceV2PeriodPreset => {
  const currentMonth = today.slice(0, 7);
  const thisMonthFull = getMonthRange(currentMonth);
  if (
    fromDate === thisMonthFull.fromDate &&
    (toDate === today || toDate === thisMonthFull.toDate)
  ) {
    return 'thisMonth';
  }
  const lastMonth = shiftYearMonth(currentMonth, -1);
  const lastMonthRange = getMonthRange(lastMonth);
  if (
    fromDate === lastMonthRange.fromDate &&
    toDate === lastMonthRange.toDate
  ) {
    return 'lastMonth';
  }
  if (fromDate === addDaysIso(today, -29) && toDate === today) {
    return 'last30Days';
  }
  const quarterRange = getQuarterRange(today);
  if (fromDate === quarterRange.fromDate && toDate === quarterRange.toDate) {
    return 'thisQuarter';
  }
  if (fromDate === `${today.slice(0, 4)}-01-01` && toDate === today) {
    return 'ytd';
  }
  if (fromDate === '2000-01-01' && toDate === today) {
    return 'allTime';
  }
  if (
    fromDate.slice(0, 7) === toDate.slice(0, 7) &&
    fromDate === `${fromDate.slice(0, 7)}-01` &&
    toDate === getMonthLastDate(fromDate.slice(0, 7))
  ) {
    return 'month';
  }
  return 'custom';
};

const MAX_FX_RATE_MICROS = 1_000_000_000_000n;

export const isValidPositiveFxRate = (raw: string): boolean => {
  const micros = parsePositiveRateMicros(raw);
  return micros !== null && micros <= MAX_FX_RATE_MICROS;
};

export const sanitizeExternalUrl = (
  raw: string | null | undefined,
): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      Boolean(parsed.hostname)
    ) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
};

export const isValidHttpUrl = (raw: string): boolean =>
  sanitizeExternalUrl(raw) !== null;

export const createFinanceV2RequestId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const DISCOUNT_PATTERN = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;

export const isValidPositiveQuantity = (raw: string): boolean =>
  parsePositiveRateMicros(raw) !== null;

const parseDiscountHundredths = (raw: string): bigint | null => {
  const cleaned = raw.trim();
  if (!cleaned) return 0n;
  if (!DISCOUNT_PATTERN.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  const hundredths =
    BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'));
  return hundredths >= 0n && hundredths <= 10_000n ? hundredths : null;
};

export const isValidDiscountPercent = (raw: string): boolean =>
  parseDiscountHundredths(raw) !== null;

export const calculateDraftDocumentTotals = (
  lines: {
    label: string;
    quantity: string;
    unitPriceMicros: string | null;
    discountPercent: string;
  }[],
): {
  subtotalMicros: string;
  discountTotalMicros: string;
  totalMicros: string;
  lineTotalsMicros: (string | null)[];
} => {
  let subtotal = 0n;
  let discountTotal = 0n;
  const lineTotalsMicros = lines.map((line) => {
    if (!line.label.trim() || !line.unitPriceMicros) return null;
    const qtyMicros = parsePositiveRateMicros(line.quantity.trim() || '1');
    const discountHundredths = parseDiscountHundredths(line.discountPercent);
    if (qtyMicros === null || discountHundredths === null) return null;
    const unitPrice = BigInt(line.unitPriceMicros);
    if (unitPrice < 0n) return null;
    const gross = roundHalfUpDiv(qtyMicros * unitPrice, MICROS_SCALE);
    const discount = roundHalfUpDiv(gross * discountHundredths, 10_000n);
    const net = gross - discount;
    subtotal += gross;
    discountTotal += discount;
    return net.toString();
  });

  return {
    subtotalMicros: subtotal.toString(),
    discountTotalMicros: discountTotal.toString(),
    totalMicros: (subtotal - discountTotal).toString(),
    lineTotalsMicros,
  };
};
