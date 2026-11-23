import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { getValidTimeZoneOrUndefined, isDefined } from 'twenty-shared/utils';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import {
  deliveryFinanceAmountSchema,
  deliveryFinanceMonthSchema,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import { previousPerformanceMonth } from 'src/modules/delivery/founder/performance/delivery-founder-performance.policy';
import {
  type DeliveryFounderCurrencyTrendDTO,
  type DeliveryFounderExpiringQuoteDTO,
  type DeliveryFounderFunnelStageDTO,
  type DeliveryFounderInboxSlaDTO,
  type DeliveryFounderRenewalAlertDTO,
  type DeliveryFounderSalesFunnelDTO,
} from 'src/modules/delivery/founder/performance/delivery-founder-executive-insights.dto';

const ZERO = BigInt(0);
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const EXECUTIVE_INSIGHTS_DEFAULT_MONTHS = 6;
export const EXECUTIVE_INSIGHTS_RENEWAL_HORIZON_DAYS = 30;
export const EXECUTIVE_INSIGHTS_RENEWAL_GRACE_DAYS = 14;
export const EXECUTIVE_INSIGHTS_QUOTE_EXPIRY_DAYS = 7;

const CURRENCY_ORDER = [
  'INR',
  'USD',
  'QAR',
  'AED',
  'EUR',
  'GBP',
  'SGD',
  'AUD',
  'CAD',
];

const compareCurrencies = (left: string, right: string) => {
  const leftIndex = CURRENCY_ORDER.indexOf(left);
  const rightIndex = CURRENCY_ORDER.indexOf(right);
  if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
  if (leftIndex !== -1) return -1;
  if (rightIndex !== -1) return 1;
  return left.localeCompare(right);
};

export const executiveInsightsSchema = z
  .object({
    month: deliveryFinanceMonthSchema,
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => getValidTimeZoneOrUndefined(value) !== undefined),
    currency: deliveryCurrencySchema
      .nullish()
      .transform((value) => value ?? null),
    months: z
      .number()
      .int()
      .min(3)
      .max(12)
      .nullish()
      .transform((value) => value ?? EXECUTIVE_INSIGHTS_DEFAULT_MONTHS),
  })
  .strict();

export type ExecutiveInsightsQuery = z.infer<typeof executiveInsightsSchema>;

export const parseExecutiveInsights = (input: unknown) => {
  const parsed = executiveInsightsSchema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Choose a valid executive insights month, timezone, currency and window.',
    );
  return parsed.data;
};

export const recentPerformanceMonths = (endMonth: string, count: number) => {
  const months: string[] = [endMonth];
  let cursor = endMonth;
  for (let index = 1; index < count; index++) {
    cursor = previousPerformanceMonth(cursor);
    months.push(cursor);
  }
  return months.reverse();
};

export type TrendSourceEntry = {
  month: string;
  currency: string;
  kind: string;
  status: string;
  amountMicros: string;
};

export const aggregateCurrencyTrends = ({
  months,
  currencyFilter,
  entries,
}: {
  months: string[];
  currencyFilter: string | null;
  entries: TrendSourceEntry[];
}): {
  trends: DeliveryFounderCurrencyTrendDTO[];
  warnings: string[];
} => {
  const monthSet = new Set(months);
  const warnings = new Set<string>();
  const byCurrency = new Map<
    string,
    Map<
      string,
      {
        revenue: bigint;
        cost: bigint;
        postedEntryCount: number;
        draftEntryCount: number;
      }
    >
  >();

  const ensureBucket = (currency: string, month: string) => {
    let monthMap = byCurrency.get(currency);
    if (!monthMap) {
      monthMap = new Map(
        months.map((value) => [
          value,
          {
            revenue: ZERO,
            cost: ZERO,
            postedEntryCount: 0,
            draftEntryCount: 0,
          },
        ]),
      );
      byCurrency.set(currency, monthMap);
    }
    return monthMap.get(month);
  };

  for (const entry of entries) {
    if (!monthSet.has(entry.month)) continue;
    if (currencyFilter && entry.currency !== currencyFilter) continue;
    if (!deliveryCurrencySchema.safeParse(entry.currency).success) {
      warnings.add('INVALID_FINANCE_CURRENCY');
      continue;
    }
    const amount = deliveryFinanceAmountSchema.safeParse(entry.amountMicros);
    if (!amount.success) {
      warnings.add('INVALID_MONTHLY_SOURCE');
      continue;
    }
    const bucket = ensureBucket(entry.currency, entry.month);
    if (!bucket) continue;

    if (entry.status === 'DRAFT') {
      bucket.draftEntryCount += 1;
      warnings.add('MONTHLY_DRAFTS_EXCLUDED');
      continue;
    }
    if (entry.status !== 'POSTED') continue;

    const micros = BigInt(amount.data);
    if (entry.kind === 'REVENUE') {
      bucket.revenue += micros;
      bucket.postedEntryCount += 1;
    } else if (entry.kind === 'COST') {
      bucket.cost += micros;
      bucket.postedEntryCount += 1;
    }
  }

  const trends: DeliveryFounderCurrencyTrendDTO[] = [...byCurrency.keys()]
    .sort(compareCurrencies)
    .map((currency) => {
      const monthMap = byCurrency.get(currency)!;
      return {
        currency,
        points: months.map((month) => {
          const bucket = monthMap.get(month)!;
          return {
            month,
            revenueMicros: bucket.revenue.toString(),
            costMicros: bucket.cost.toString(),
            resultMicros: (bucket.revenue - bucket.cost).toString(),
            postedEntryCount: bucket.postedEntryCount,
            draftEntryCount: bucket.draftEntryCount,
          };
        }),
      };
    });

  return { trends, warnings: [...warnings] };
};

export type FunnelOpportunitySource = {
  id: string;
  stage: string;
  amountMicros: string | null;
  currencyCode: string | null;
};

export type FunnelQuoteSource = {
  id: string;
  quoteNumber: string | null;
  status: string;
  validUntil: string | null;
  totalAmountMicros: string | null;
  currencyCode: string | null;
};

const STAGE_ORDER = ['NEW', 'SCREENING', 'MEETING', 'PROPOSAL', 'CUSTOMER'];
const CLOSED_STAGES = new Set([
  'CUSTOMER',
  'LOST',
  'CLOSED_WON',
  'CLOSED_LOST',
]);
const WON_STAGES = new Set(['CUSTOMER', 'CLOSED_WON']);

const parseCalendarDateUtcMs = (value: string | null | undefined) => {
  if (!value) return null;
  const isoDay = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return null;
  const parsed = Date.parse(`${isoDay}T00:00:00.000Z`);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeCurrency = (code: string | null | undefined) => {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  return deliveryCurrencySchema.safeParse(trimmed).success ? trimmed : null;
};

const parseNonNegativeMicros = (value: string | null | undefined) => {
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
};

export const aggregateSalesFunnel = ({
  opportunities,
  quotes,
  currencyFilter,
  now,
}: {
  opportunities: FunnelOpportunitySource[];
  quotes: FunnelQuoteSource[];
  currencyFilter: string | null;
  now: Date;
}): DeliveryFounderSalesFunnelDTO => {
  const stageMap = new Map<
    string,
    {
      dealCount: number;
      byCurrency: Map<string, { amount: bigint; dealCount: number }>;
    }
  >();
  const openCurrencyMap = new Map<
    string,
    { amount: bigint; dealCount: number }
  >();
  let totalOpenDeals = 0;
  let wonDealsCount = 0;

  for (const deal of opportunities) {
    const stage = (deal.stage || 'UNASSIGNED').toUpperCase();
    const currency = normalizeCurrency(deal.currencyCode);
    const micros = parseNonNegativeMicros(deal.amountMicros);

    if (currencyFilter && currency && currency !== currencyFilter) continue;

    if (WON_STAGES.has(stage)) {
      wonDealsCount += 1;
    } else if (!CLOSED_STAGES.has(stage)) {
      totalOpenDeals += 1;
      if (currency && micros !== null) {
        const current = openCurrencyMap.get(currency) ?? {
          amount: ZERO,
          dealCount: 0,
        };
        current.amount += micros;
        current.dealCount += 1;
        openCurrencyMap.set(currency, current);
      }
    }

    const entry = stageMap.get(stage) ?? {
      dealCount: 0,
      byCurrency: new Map<string, { amount: bigint; dealCount: number }>(),
    };
    entry.dealCount += 1;
    if (currency && micros !== null) {
      const currencyEntry = entry.byCurrency.get(currency) ?? {
        amount: ZERO,
        dealCount: 0,
      };
      currencyEntry.amount += micros;
      currencyEntry.dealCount += 1;
      entry.byCurrency.set(currency, currencyEntry);
    }
    stageMap.set(stage, entry);
  }

  const toCurrencyList = (
    map: Map<string, { amount: bigint; dealCount: number }>,
  ) =>
    [...map.entries()]
      .sort(([left], [right]) => compareCurrencies(left, right))
      .map(([currency, bucket]) => ({
        currency,
        amountMicros: bucket.amount.toString(),
        dealCount: bucket.dealCount,
      }));

  const stages: DeliveryFounderFunnelStageDTO[] = [...stageMap.entries()]
    .sort(([left], [right]) => {
      const leftIdx = STAGE_ORDER.indexOf(left);
      const rightIdx = STAGE_ORDER.indexOf(right);
      if (leftIdx !== -1 && rightIdx !== -1) return leftIdx - rightIdx;
      if (leftIdx !== -1) return -1;
      if (rightIdx !== -1) return 1;
      return left.localeCompare(right);
    })
    .map(([stage, bucket]) => ({
      stage,
      dealCount: bucket.dealCount,
      valuesByCurrency: toCurrencyList(bucket.byCurrency),
    }));

  const todayUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const expiring: DeliveryFounderExpiringQuoteDTO[] = [];

  for (const quote of quotes) {
    const status = (quote.status || '').toUpperCase();
    if (!['DRAFT', 'SENT'].includes(status)) continue;
    const validMs = parseCalendarDateUtcMs(quote.validUntil);
    if (validMs === null) continue;
    const daysRemaining = Math.round((validMs - todayUtcMs) / DAY_MS);
    if (
      daysRemaining > EXECUTIVE_INSIGHTS_QUOTE_EXPIRY_DAYS ||
      daysRemaining < -EXECUTIVE_INSIGHTS_RENEWAL_GRACE_DAYS
    )
      continue;
    const currency = normalizeCurrency(quote.currencyCode);
    if (currencyFilter && currency && currency !== currencyFilter) continue;
    const micros = parseNonNegativeMicros(quote.totalAmountMicros);

    expiring.push({
      id: quote.id,
      quoteNumber: quote.quoteNumber?.trim() || quote.id.slice(0, 8),
      status,
      validUntil: quote.validUntil!.slice(0, 10),
      daysRemaining,
      currency,
      totalAmountMicros: micros !== null ? micros.toString() : null,
    });
  }

  expiring.sort((left, right) => left.daysRemaining - right.daysRemaining);

  return {
    restricted: false,
    totalOpenDeals,
    wonDealsCount,
    openValuesByCurrency: toCurrencyList(openCurrencyMap),
    stages,
    expiringQuotesCount: expiring.length,
    expiringQuotes: expiring.slice(0, 6),
  };
};

export type RenewalSourcePeriod = {
  periodId: string;
  projectId: string;
  projectName: string;
  companyId: string | null;
  label: string;
  billing: string;
  endDateExclusive: string | null;
  state: string;
};

export const aggregateRenewalAlerts = ({
  periods,
  now,
}: {
  periods: RenewalSourcePeriod[];
  now: Date;
}): DeliveryFounderRenewalAlertDTO[] => {
  const todayUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const alerts: DeliveryFounderRenewalAlertDTO[] = [];

  for (const period of periods) {
    if (period.state === 'ARCHIVED' || !period.endDateExclusive) continue;
    const endMs = parseCalendarDateUtcMs(period.endDateExclusive);
    if (endMs === null) continue;
    const daysRemaining = Math.round((endMs - todayUtcMs) / DAY_MS);
    if (
      daysRemaining > EXECUTIVE_INSIGHTS_RENEWAL_HORIZON_DAYS ||
      daysRemaining < -EXECUTIVE_INSIGHTS_RENEWAL_GRACE_DAYS
    )
      continue;
    alerts.push({
      periodId: period.periodId,
      projectId: period.projectId,
      projectName: period.projectName,
      companyId: period.companyId,
      label: period.label,
      billing: period.billing,
      endDateExclusive: period.endDateExclusive.slice(0, 10),
      daysRemaining,
      state: period.state,
    });
  }

  alerts.sort(
    (left, right) =>
      left.daysRemaining - right.daysRemaining ||
      left.projectName.localeCompare(right.projectName),
  );
  return alerts.slice(0, 8);
};

export type InboxReplySource = {
  replyId: string;
  conversationId: string;
  projectId: string;
  projectName: string;
  status: string;
  createdAt: string;
  problem: string | null;
};

const PENDING_REPLY_STATUSES = new Set([
  'GENERATING',
  'DRAFT',
  'QUEUED',
  'SENDING',
]);
const FAILED_REPLY_STATUSES = new Set(['FAILED', 'UNCERTAIN']);

export const aggregateInboxSla = ({
  connectedThreadsCount,
  replies,
  now,
}: {
  connectedThreadsCount: number;
  replies: InboxReplySource[];
  now: Date;
}): DeliveryFounderInboxSlaDTO => {
  const nowMs = now.getTime();
  let pendingRepliesCount = 0;
  let failedRepliesCount = 0;
  let oldestPendingHours: number | null = null;
  const items: DeliveryFounderInboxSlaDTO['items'] = [];

  for (const reply of replies) {
    const isPending = PENDING_REPLY_STATUSES.has(reply.status);
    const isFailed = FAILED_REPLY_STATUSES.has(reply.status);
    if (!isPending && !isFailed) continue;

    const createdMs = Date.parse(reply.createdAt);
    const ageHours = Number.isNaN(createdMs)
      ? 0
      : Math.max(0, Math.floor((nowMs - createdMs) / HOUR_MS));

    if (isPending) {
      pendingRepliesCount += 1;
      if (!isDefined(oldestPendingHours) || ageHours > oldestPendingHours) {
        oldestPendingHours = ageHours;
      }
    }
    if (isFailed) {
      failedRepliesCount += 1;
    }

    items.push({
      replyId: reply.replyId,
      conversationId: reply.conversationId,
      projectId: reply.projectId,
      projectName: reply.projectName,
      status: reply.status,
      ageHours,
      problem: reply.problem,
    });
  }

  items.sort((left, right) => {
    const leftFailed = FAILED_REPLY_STATUSES.has(left.status) ? 0 : 1;
    const rightFailed = FAILED_REPLY_STATUSES.has(right.status) ? 0 : 1;
    return leftFailed - rightFailed || right.ageHours - left.ageHours;
  });

  return {
    connectedThreadsCount,
    pendingRepliesCount,
    failedRepliesCount,
    oldestPendingHours,
    items: items.slice(0, 6),
  };
};
