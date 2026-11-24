import { type ClientHubCurrencyTotal } from '@/delivery/client-workspace/client-hub.types';

export const clientInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'CL';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

export const formatCurrencyTotals = (
  totals: ClientHubCurrencyTotal[],
): string => {
  if (!totals.length) return '';
  return totals
    .map((entry) => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: entry.currency,
          maximumFractionDigits: 0,
        }).format(entry.amount);
      } catch {
        return `${entry.currency} ${entry.amount.toLocaleString()}`;
      }
    })
    .join(' · ');
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
