import { gql } from '@apollo/client';

export type DeliveryFounderTrendPoint = {
  month: string;
  revenueMicros: string;
  costMicros: string;
  resultMicros: string;
  postedEntryCount: number;
  draftEntryCount: number;
};

export type DeliveryFounderCurrencyTrend = {
  currency: string;
  points: DeliveryFounderTrendPoint[];
};

export type DeliveryFounderCurrencyAmount = {
  currency: string;
  amountMicros: string;
  dealCount: number;
};

export type DeliveryFounderFunnelStage = {
  stage: string;
  dealCount: number;
  valuesByCurrency: DeliveryFounderCurrencyAmount[];
};

export type DeliveryFounderExpiringQuote = {
  id: string;
  quoteNumber: string;
  status: string;
  validUntil: string;
  daysRemaining: number;
  currency: string | null;
  totalAmountMicros: string | null;
};

export type DeliveryFounderSalesFunnel = {
  restricted: boolean;
  totalOpenDeals: number;
  wonDealsCount: number;
  openValuesByCurrency: DeliveryFounderCurrencyAmount[];
  stages: DeliveryFounderFunnelStage[];
  expiringQuotesCount: number;
  expiringQuotes: DeliveryFounderExpiringQuote[];
};

export type DeliveryFounderRenewalAlert = {
  periodId: string;
  projectId: string;
  projectName: string;
  companyId: string | null;
  label: string;
  billing: string;
  endDateExclusive: string;
  daysRemaining: number;
  state: string;
};

export type DeliveryFounderInboxSlaItem = {
  replyId: string;
  conversationId: string;
  projectId: string;
  projectName: string;
  status: string;
  ageHours: number;
  problem: string | null;
};

export type DeliveryFounderInboxSla = {
  connectedThreadsCount: number;
  pendingRepliesCount: number;
  failedRepliesCount: number;
  oldestPendingHours: number | null;
  items: DeliveryFounderInboxSlaItem[];
};

export type DeliveryFounderExecutiveInsightsSnapshot = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  observedAt: string;
  month: string;
  timezone: string;
  currency: string | null;
  canReadFinance: boolean;
  trendMonths: string[];
  trends: DeliveryFounderCurrencyTrend[];
  salesFunnel: DeliveryFounderSalesFunnel;
  renewals: DeliveryFounderRenewalAlert[];
  inboxSla: DeliveryFounderInboxSla;
  warnings: string[];
};

export type DeliveryFounderExecutiveInsightsQuery = {
  deliveryFounderExecutiveInsights: DeliveryFounderExecutiveInsightsSnapshot;
};

export const GET_DELIVERY_FOUNDER_EXECUTIVE_INSIGHTS = gql`
  query DeliveryFounderExecutiveInsights(
    $input: DeliveryFounderExecutiveInsightsInput!
  ) {
    deliveryFounderExecutiveInsights(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      observedAt
      month
      timezone
      currency
      canReadFinance
      trendMonths
      trends {
        currency
        points {
          month
          revenueMicros
          costMicros
          resultMicros
          postedEntryCount
          draftEntryCount
        }
      }
      salesFunnel {
        restricted
        totalOpenDeals
        wonDealsCount
        openValuesByCurrency {
          currency
          amountMicros
          dealCount
        }
        stages {
          stage
          dealCount
          valuesByCurrency {
            currency
            amountMicros
            dealCount
          }
        }
        expiringQuotesCount
        expiringQuotes {
          id
          quoteNumber
          status
          validUntil
          daysRemaining
          currency
          totalAmountMicros
        }
      }
      renewals {
        periodId
        projectId
        projectName
        companyId
        label
        billing
        endDateExclusive
        daysRemaining
        state
      }
      inboxSla {
        connectedThreadsCount
        pendingRepliesCount
        failedRepliesCount
        oldestPendingHours
        items {
          replyId
          conversationId
          projectId
          projectName
          status
          ageHours
          problem
        }
      }
      warnings
    }
  }
`;
