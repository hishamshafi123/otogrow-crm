import { isNonEmptyString } from '@sniptt/guards';

const FINANCE_MICROS_PER_UNIT = 1_000_000n;
const FINANCE_MICRO_DECIMALS = 6;
const DECIMAL_AMOUNT = /^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/;
const UNSIGNED_MICROS = /^\d+$/;
const SIGNED_MICROS = /^-?\d+$/;
const CANONICAL_UNSIGNED_MICROS = /^(?:0|[1-9]\d*)$/;
const MAX_FINANCE_ENTRY_MICROS = 9_223_372_036_854_775_807n;

export const isFinanceAmountMicrosWithinLimit = (value: string): boolean =>
  isNonEmptyString(value) &&
  value.length <= 19 &&
  CANONICAL_UNSIGNED_MICROS.test(value) &&
  BigInt(value) <= MAX_FINANCE_ENTRY_MICROS;

const financeMicrosParts = (value: string) => {
  if (!isNonEmptyString(value) || !SIGNED_MICROS.test(value)) return null;
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  return {
    negative,
    whole: absolute / FINANCE_MICROS_PER_UNIT,
    fraction: (absolute % FINANCE_MICROS_PER_UNIT)
      .toString()
      .padStart(FINANCE_MICRO_DECIMALS, '0')
      .replace(/0+$/, ''),
  };
};

export const parseFinanceAmountMicros = (value: string): string | null => {
  if (!isNonEmptyString(value)) return null;
  const amount = value.trim();
  if (!DECIMAL_AMOUNT.test(amount)) return null;
  const [whole, fraction = ''] = amount.split('.');
  return (
    BigInt(whole || '0') * FINANCE_MICROS_PER_UNIT +
    BigInt(fraction.padEnd(FINANCE_MICRO_DECIMALS, '0'))
  ).toString();
};

export const financeAmountMicrosToDecimal = (value: string): string => {
  const parts = financeMicrosParts(value);
  if (!parts) return '';
  return `${parts.negative ? '-' : ''}${parts.whole}${parts.fraction ? `.${parts.fraction}` : ''}`;
};

export const formatFinanceAmountMicros = (
  value: string,
  currency: string,
  locale?: string,
): string => {
  if (!isNonEmptyString(currency)) return '—';
  try {
    const parts = financeMicrosParts(value);
    if (!parts) return '—';
    const { negative, whole, fraction } = parts;
    const currencyOptions = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).resolvedOptions();
    const fractionDigits = Math.max(
      currencyOptions.minimumFractionDigits ?? 2,
      fraction.length,
    );
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    const localizedFraction =
      fractionDigits > 0
        ? new Intl.NumberFormat(locale, {
            useGrouping: false,
            minimumIntegerDigits: fractionDigits,
            maximumFractionDigits: 0,
          }).format(BigInt(fraction.padEnd(fractionDigits, '0')))
        : '';
    // A negative sub-unit amount needs the locale's negative-zero sign layout.
    const wholeWithSign = negative ? (whole === 0n ? -0 : -whole) : whole;
    return formatter
      .formatToParts(wholeWithSign)
      .map((part) =>
        part.type === 'fraction' ? localizedFraction : part.value,
      )
      .join('');
  } catch {
    return '—';
  }
};

export type FinanceAllocationRemainder = {
  allocatedMicros: string;
  remainingMicros: string;
  overallocated: boolean;
  complete: boolean;
};

export const financeAllocationRemainder = (
  totalMicros: string,
  allocations: readonly string[],
): FinanceAllocationRemainder | null => {
  if (
    !isNonEmptyString(totalMicros) ||
    !UNSIGNED_MICROS.test(totalMicros) ||
    allocations.some(
      (amount) => !isNonEmptyString(amount) || !UNSIGNED_MICROS.test(amount),
    )
  )
    return null;
  const total = BigInt(totalMicros);
  const allocated = allocations.reduce(
    (sum, amount) => sum + BigInt(amount),
    0n,
  );
  const remaining = total - allocated;
  return {
    allocatedMicros: allocated.toString(),
    remainingMicros: remaining.toString(),
    overallocated: remaining < 0n,
    complete: remaining === 0n,
  };
};
