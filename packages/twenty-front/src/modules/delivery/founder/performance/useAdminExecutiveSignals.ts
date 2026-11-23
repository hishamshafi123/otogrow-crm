import { useQuery } from '@apollo/client/react';
import { isNonEmptyString } from '@sniptt/guards';
import {
  type DeliveryCapacitySummaryQuery,
  type DeliveryFinanceForecastQuery,
  type DeliveryFounderExceptionsQuery,
  type DeliveryHandoffsQuery,
  type DeliveryReadinessQuery,
  type MetaLeadFormsQuery,
  type OtogrowAiBudgetSnapshotQuery,
} from '~/generated-metadata/graphql';
import { GET_DELIVERY_FINANCE_FORECAST } from '@/delivery/finance/delivery-finance-forecast.graphql';
import { GET_DELIVERY_FOUNDER_EXCEPTIONS } from '@/delivery/founder/delivery-founder.graphql';
import { GET_DELIVERY_READINESS } from '@/delivery/readiness/delivery-readiness.graphql';
import { GET_CAPACITY_SUMMARY } from '@/delivery/capacity/read/delivery-capacity-read.graphql';
import { capacityCalendarDate } from '@/delivery/capacity/read/capacity-read-navigation';
import { GET_HANDOFFS } from '@/delivery/handoffs/delivery-handoffs.graphql';
import { GET_META_LEAD_FORMS } from '@/meta-lead-forms/metaLeadFormsGraphql';
import { GET_AI_BUDGET } from '@/otogrow-ai-budget/otogrow-ai-budget.graphql';
import {
  GET_DELIVERY_FOUNDER_EXECUTIVE_INSIGHTS,
  type DeliveryFounderExecutiveInsightsQuery,
} from '@/delivery/founder/performance/delivery-founder-executive-insights.graphql';
import { type useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';

type AdminExecutiveSignalsInput = {
  authorized: boolean;
  permission: ReturnType<typeof useWorkflowAccess>;
  month: string;
  timezone: string;
  selectedCurrency?: string;
  forecastCurrency: string | null;
  observedAt?: string;
};

export const useAdminExecutiveSignals = ({
  authorized,
  permission,
  month,
  timezone,
  selectedCurrency,
  forecastCurrency,
  observedAt,
}: AdminExecutiveSignalsInput) => {
  const canQueryForecast =
    authorized &&
    permission.canReadFinance &&
    isNonEmptyString(forecastCurrency);

  const forecastQuery = useQuery<DeliveryFinanceForecastQuery>(
    GET_DELIVERY_FINANCE_FORECAST,
    {
      variables: {
        input: {
          currency: forecastCurrency ?? 'USD',
          horizonDays: 90,
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !canQueryForecast,
    },
  );

  const exceptionsQuery = useQuery<DeliveryFounderExceptionsQuery>(
    GET_DELIVERY_FOUNDER_EXCEPTIONS,
    {
      variables: {
        input: {
          domain: 'ALL',
          currency: selectedCurrency,
          serviceMonth: month,
          limit: 6,
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !authorized,
    },
  );

  const readinessQuery = useQuery<DeliveryReadinessQuery>(
    GET_DELIVERY_READINESS,
    {
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !authorized,
    },
  );

  const capacityStartDate = observedAt
    ? capacityCalendarDate(observedAt, timezone)
    : '';
  const capacityQuery = useQuery<DeliveryCapacitySummaryQuery>(
    GET_CAPACITY_SUMMARY,
    {
      variables: {
        input: {
          startDate: capacityStartDate,
          timezone,
          limit: 25,
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !authorized || !isNonEmptyString(capacityStartDate),
    },
  );

  const handoffsQuery = useQuery<DeliveryHandoffsQuery>(GET_HANDOFFS, {
    variables: { search: '' },
    fetchPolicy: 'no-cache',
    pollInterval: 60000,
    skip: !authorized,
  });

  const metaLeadsQuery = useQuery<MetaLeadFormsQuery>(GET_META_LEAD_FORMS, {
    fetchPolicy: 'no-cache',
    pollInterval: 60000,
    skip: !authorized,
  });

  const aiBudgetQuery = useQuery<OtogrowAiBudgetSnapshotQuery>(GET_AI_BUDGET, {
    variables: {
      input: { limit: 10, needsAttention: false },
      identity: permission.scope,
    },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !authorized,
  });

  const insightsQuery = useQuery<DeliveryFounderExecutiveInsightsQuery>(
    GET_DELIVERY_FOUNDER_EXECUTIVE_INSIGHTS,
    {
      variables: {
        input: {
          month,
          timezone,
          currency: selectedCurrency ?? null,
          months: 6,
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 60000,
      skip: !authorized,
    },
  );

  const forecastCandidate = forecastQuery.data?.deliveryFinanceForecast;
  const forecast =
    canQueryForecast &&
    !forecastQuery.error &&
    forecastCandidate &&
    forecastCandidate.currency === forecastCurrency &&
    permission.matches(forecastCandidate)
      ? forecastCandidate
      : null;

  const exceptionsCandidate = exceptionsQuery.data?.deliveryFounderExceptions;
  const exceptions =
    authorized &&
    !exceptionsQuery.error &&
    exceptionsCandidate &&
    permission.matches(exceptionsCandidate) &&
    exceptionsCandidate.canReadFinance === permission.canReadFinance
      ? exceptionsCandidate
      : null;

  const readinessCandidate = readinessQuery.data?.deliveryReadiness;
  const readiness =
    authorized &&
    !readinessQuery.error &&
    readinessCandidate &&
    permission.matches(readinessCandidate)
      ? readinessCandidate
      : null;

  const degradedConnections = (readiness?.items ?? []).filter((item) =>
    ['NEEDS_ATTENTION', 'PAUSED'].includes(item.status),
  );

  const capacityCandidate = capacityQuery.data?.deliveryCapacitySummary;
  const capacity =
    authorized &&
    !capacityQuery.error &&
    capacityCandidate &&
    permission.matches(capacityCandidate)
      ? capacityCandidate
      : null;

  const handoffsCandidate = handoffsQuery.data?.deliveryHandoffs;
  const handoffs =
    authorized &&
    !handoffsQuery.error &&
    handoffsCandidate &&
    permission.matches(handoffsCandidate)
      ? handoffsCandidate
      : null;

  const metaLeads =
    authorized && !metaLeadsQuery.error && metaLeadsQuery.data
      ? {
          metaLeadForms: metaLeadsQuery.data.metaLeadForms ?? [],
          metaLeadFormActivity: metaLeadsQuery.data.metaLeadFormActivity ?? [],
        }
      : null;

  const aiBudgetCandidate = aiBudgetQuery.data?.otogrowAiBudgetSnapshot;
  const aiBudget =
    authorized &&
    !aiBudgetQuery.error &&
    aiBudgetCandidate &&
    permission.matches(aiBudgetCandidate)
      ? aiBudgetCandidate
      : null;

  const insightsCandidate =
    insightsQuery.data?.deliveryFounderExecutiveInsights;
  const executiveInsights =
    authorized &&
    !insightsQuery.error &&
    insightsCandidate &&
    permission.matches(insightsCandidate) &&
    insightsCandidate.canReadFinance === permission.canReadFinance &&
    insightsCandidate.month === month &&
    insightsCandidate.currency === (selectedCurrency ?? null)
      ? insightsCandidate
      : null;

  return {
    forecast,
    forecastLoading: forecastQuery.loading,
    forecastError: Boolean(forecastQuery.error),
    exceptions,
    readiness,
    degradedConnections,
    capacity,
    handoffs,
    metaLeads,
    aiBudget,
    executiveInsights,
  };
};
