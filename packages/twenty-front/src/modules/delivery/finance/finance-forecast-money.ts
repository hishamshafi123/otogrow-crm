import { isNonEmptyString } from '@sniptt/guards';
import {
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';

export const isFinanceAnchorAmountMicrosWithinLimit = (
  value: string,
): boolean => {
  if (!isNonEmptyString(value)) return false;
  if (!value.startsWith('-')) return isFinanceAmountMicrosWithinLimit(value);
  const magnitude = value.slice(1);
  return (
    magnitude === '9223372036854775808' ||
    (magnitude !== '0' && isFinanceAmountMicrosWithinLimit(magnitude))
  );
};

export const parseFinanceSignedAmountMicros = (
  value: string,
): string | null => {
  if (!isNonEmptyString(value)) return null;
  const amount = value.trim();
  if (!amount.startsWith('-')) return parseFinanceAmountMicros(amount);
  const magnitude = amount.slice(1);
  if (magnitude.trim() !== magnitude) return null;
  const micros = parseFinanceAmountMicros(magnitude);
  return micros === null ? null : micros === '0' ? '0' : `-${micros}`;
};
