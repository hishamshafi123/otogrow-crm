import { BadRequestException } from '@nestjs/common';
import {
  aggregateCurrencyTrends,
  aggregateInboxSla,
  aggregateRenewalAlerts,
  aggregateSalesFunnel,
  parseExecutiveInsights,
  recentPerformanceMonths,
} from 'src/modules/delivery/founder/performance/delivery-founder-executive-insights.policy';

describe('delivery founder executive insights policy', () => {
  it('validates input and builds chronological multi-month windows across year boundaries', () => {
    expect(
      parseExecutiveInsights({
        month: '2026-02',
        timezone: 'Asia/Qatar',
        currency: 'QAR',
      }),
    ).toEqual({
      month: '2026-02',
      timezone: 'Asia/Qatar',
      currency: 'QAR',
      months: 6,
    });
    expect(recentPerformanceMonths('2026-02', 6)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(() =>
      parseExecutiveInsights({
        month: '2026-13',
        timezone: 'UTC',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseExecutiveInsights({
        month: '2026-11',
        timezone: 'UTC',
        currency: 'XYZ',
      }),
    ).toThrow(BadRequestException);
  });

  it('aggregates 6-month trends strictly separated by currency and excludes drafts from totals', () => {
    const months = recentPerformanceMonths('2026-11', 3);
    const { trends, warnings } = aggregateCurrencyTrends({
      months,
      currencyFilter: null,
      entries: [
        {
          month: '2026-09',
          currency: 'QAR',
          kind: 'REVENUE',
          status: 'POSTED',
          amountMicros: '5000000000',
        },
        {
          month: '2026-11',
          currency: 'QAR',
          kind: 'COST',
          status: 'POSTED',
          amountMicros: '2000000000',
        },
        {
          month: '2026-11',
          currency: 'QAR',
          kind: 'REVENUE',
          status: 'DRAFT',
          amountMicros: '9000000000',
        },
        {
          month: '2026-11',
          currency: 'INR',
          kind: 'REVENUE',
          status: 'POSTED',
          amountMicros: '120000000000',
        },
      ],
    });

    expect(trends.map((trend) => trend.currency)).toEqual(['INR', 'QAR']);
    expect(warnings).toContain('MONTHLY_DRAFTS_EXCLUDED');

    const qar = trends.find((item) => item.currency === 'QAR')!;
    expect(qar.points).toEqual([
      {
        month: '2026-09',
        revenueMicros: '5000000000',
        costMicros: '0',
        resultMicros: '5000000000',
        postedEntryCount: 1,
        draftEntryCount: 0,
      },
      {
        month: '2026-10',
        revenueMicros: '0',
        costMicros: '0',
        resultMicros: '0',
        postedEntryCount: 0,
        draftEntryCount: 0,
      },
      {
        month: '2026-11',
        revenueMicros: '0',
        costMicros: '2000000000',
        resultMicros: '-2000000000',
        postedEntryCount: 1,
        draftEntryCount: 1,
      },
    ]);
  });

  it('aggregates sales funnel stages per currency and flags quotes expiring within 7 days', () => {
    const now = new Date('2026-11-18T12:00:00.000Z');
    const funnel = aggregateSalesFunnel({
      now,
      currencyFilter: null,
      opportunities: [
        {
          id: 'o1',
          stage: 'PROPOSAL',
          amountMicros: '10000000000',
          currencyCode: 'AED',
        },
        {
          id: 'o2',
          stage: 'PROPOSAL',
          amountMicros: '5000000000',
          currencyCode: 'USD',
        },
        {
          id: 'o3',
          stage: 'CUSTOMER',
          amountMicros: '8000000000',
          currencyCode: 'QAR',
        },
      ],
      quotes: [
        {
          id: 'q1',
          quoteNumber: 'QT-101',
          status: 'SENT',
          validUntil: '2026-11-21',
          totalAmountMicros: '10000000000',
          currencyCode: 'AED',
        },
        {
          id: 'q2',
          quoteNumber: 'QT-102',
          status: 'SENT',
          validUntil: '2026-12-20',
          totalAmountMicros: '4000000000',
          currencyCode: 'USD',
        },
        {
          id: 'q3',
          quoteNumber: 'QT-103',
          status: 'ACCEPTED',
          validUntil: '2026-11-19',
          totalAmountMicros: '4000000000',
          currencyCode: 'USD',
        },
      ],
    });

    expect(funnel.totalOpenDeals).toBe(2);
    expect(funnel.wonDealsCount).toBe(1);
    expect(funnel.openValuesByCurrency).toEqual([
      { currency: 'USD', amountMicros: '5000000000', dealCount: 1 },
      { currency: 'AED', amountMicros: '10000000000', dealCount: 1 },
    ]);
    expect(funnel.expiringQuotesCount).toBe(1);
    expect(funnel.expiringQuotes[0]).toEqual(
      expect.objectContaining({
        quoteNumber: 'QT-101',
        daysRemaining: 3,
        currency: 'AED',
      }),
    );
  });

  it('identifies active commitment periods renewing within 30 days and prioritizes inbox SLA failures', () => {
    const now = new Date('2026-11-18T12:00:00.000Z');
    const renewals = aggregateRenewalAlerts({
      now,
      periods: [
        {
          periodId: 'p1',
          projectId: 'proj-1',
          projectName: 'Client Beta',
          companyId: null,
          label: 'Nov Retainer',
          billing: 'RETAINER',
          endDateExclusive: '2026-11-25',
          state: 'ACTIVE',
        },
        {
          periodId: 'p2',
          projectId: 'proj-2',
          projectName: 'Client Far',
          companyId: null,
          label: 'Feb Retainer',
          billing: 'RETAINER',
          endDateExclusive: '2027-02-01',
          state: 'ACTIVE',
        },
        {
          periodId: 'p3',
          projectId: 'proj-3',
          projectName: 'Archived Client',
          companyId: null,
          label: 'Old Retainer',
          billing: 'RETAINER',
          endDateExclusive: '2026-11-20',
          state: 'ARCHIVED',
        },
      ],
    });
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toEqual(
      expect.objectContaining({
        projectName: 'Client Beta',
        daysRemaining: 7,
      }),
    );

    const inbox = aggregateInboxSla({
      connectedThreadsCount: 5,
      now,
      replies: [
        {
          replyId: 'r1',
          conversationId: 'c1',
          projectId: 'proj-1',
          projectName: 'Client Beta',
          status: 'DRAFT',
          createdAt: '2026-11-17T06:00:00.000Z',
          problem: null,
        },
        {
          replyId: 'r2',
          conversationId: 'c2',
          projectId: 'proj-2',
          projectName: 'Client Alpha',
          status: 'FAILED',
          createdAt: '2026-11-18T08:00:00.000Z',
          problem: 'Mailbox disconnected',
        },
      ],
    });
    expect(inbox.connectedThreadsCount).toBe(5);
    expect(inbox.pendingRepliesCount).toBe(1);
    expect(inbox.failedRepliesCount).toBe(1);
    expect(inbox.oldestPendingHours).toBe(30);
    expect(inbox.items[0].replyId).toBe('r2');
  });
});
