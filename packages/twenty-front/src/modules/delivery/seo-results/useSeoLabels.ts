import { useLingui } from '@lingui/react/macro';
export const useSeoLabels = () => {
  const { t } = useLingui();
  const statuses: Record<string, string> = {
    DRAFT: t`Draft`,
    SUBMITTED: t`Awaiting independent review`,
    APPROVED: t`Approved`,
    CHANGES_REQUESTED: t`Changes requested`,
  };
  const actions: Record<string, string> = {
    SAVE: t`Draft saved`,
    SUBMIT: t`Submitted for review`,
    APPROVE: t`Approved independently`,
    REQUEST_CHANGES: t`Changes requested`,
  };
  const metrics: Record<string, string> = {
    CLICKS: t`Clicks`,
    IMPRESSIONS: t`Impressions`,
    ORGANIC_SESSIONS: t`Organic sessions`,
    CONVERSIONS: t`Conversions`,
    AVERAGE_POSITION: t`Average position`,
    CUSTOM: t`Custom measurement`,
  };
  const sources: Record<string, string> = {
    SEARCH_CONSOLE: t`Google Search Console`,
    ANALYTICS: t`Analytics`,
    RANK_TRACKER: t`Rank tracker`,
    OTHER: t`Other documented source`,
  };
  const units: Record<string, string> = {
    COUNT: t`Count`,
    POSITION: t`Position`,
    PERCENT: t`Percent`,
  };
  return {
    status: (status: string) => statuses[status] ?? status,
    action: (action: string) => actions[action] ?? action,
    metric: (metric: string) => metrics[metric] ?? metric,
    source: (source: string) => sources[source] ?? source,
    unit: (unit: string) => units[unit] ?? unit,
  };
};
