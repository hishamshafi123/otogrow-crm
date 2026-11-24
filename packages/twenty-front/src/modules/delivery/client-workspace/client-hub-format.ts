import {
  type ClientFeeCadence,
  type ClientHubCurrencyTotal,
} from '@/delivery/client-workspace/client-hub.types';

export const clientInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'CL';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

export const formatMoneyMinor = (
  amountMinor: number,
  currency: string,
): string => {
  const major = amountMinor / 100;
  const hasDecimals = amountMinor % 100 !== 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(major);
  } catch {
    return `${currency} ${major.toLocaleString(undefined, {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    })}`;
  }
};

export const formatCurrencyTotals = (
  totals: ClientHubCurrencyTotal[],
): string => {
  if (!totals.length) return '';
  return totals
    .map((entry) => formatMoneyMinor(entry.amount, entry.currency))
    .join(' · ');
};

export const formatFeeCadenceShort = (cadence: ClientFeeCadence): string => {
  switch (cadence) {
    case 'MONTHLY':
      return '/mo';
    case 'QUARTERLY':
      return '/qtr';
    case 'ONE_TIME':
      return 'one-time';
  }
};

export const formatFeeCadenceLabel = (cadence: ClientFeeCadence): string => {
  switch (cadence) {
    case 'MONTHLY':
      return 'Monthly retainer';
    case 'QUARTERLY':
      return 'Quarterly retainer';
    case 'ONE_TIME':
      return 'One-time fee';
  }
};

export const formatDueLabel = (dueAt: string | null): string => {
  if (!dueAt) return 'No due date';
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return 'No due date';
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

export const formatIsoDateShort = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatTaskStatus = (status: string): string => {
  switch (status) {
    case 'PLANNED':
      return 'Planned';
    case 'IN_PROGRESS':
      return 'In progress';
    case 'BLOCKED':
      return 'Blocked';
    case 'IN_REVIEW':
      return 'In review';
    case 'CHANGES_REQUESTED':
      return 'Changes requested';
    case 'APPROVED':
      return 'Approved';
    default:
      return status;
  }
};

export const formatBillingMode = (mode: string): string => {
  if (mode === 'RETAINER') return 'Retainer';
  if (mode === 'ONE_TIME') return 'One-time';
  return mode;
};
