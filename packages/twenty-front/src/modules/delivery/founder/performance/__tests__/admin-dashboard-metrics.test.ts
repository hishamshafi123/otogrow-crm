import {
  buildExecutiveCsv,
  buildForecastChartGeometry,
  buildSixMonthTrendGeometry,
  calculateCostSegments,
  calculateMonthDelta,
  classifyClientHealth,
  isNegativeMicros,
  isPositiveMicros,
  parseMicros,
  summarizeAiBudget,
  summarizeCapacity,
  summarizeMetaLeadIntake,
  summarizePendingHandoffs,
} from '@/delivery/founder/performance/admin-dashboard-metrics';

describe('admin dashboard metric helpers', () => {
  it('parses signed micros safely and evaluates signs', () => {
    expect(parseMicros('1500000')).toBe(1500000n);
    expect(parseMicros('-2500000')).toBe(-2500000n);
    expect(parseMicros('0')).toBe(0n);
    expect(parseMicros('12.34')).toBeNull();
    expect(parseMicros('')).toBeNull();
    expect(parseMicros(undefined)).toBeNull();

    expect(isPositiveMicros('1')).toBe(true);
    expect(isPositiveMicros('0')).toBe(false);
    expect(isPositiveMicros('-1')).toBe(false);
    expect(isPositiveMicros('invalid')).toBe(false);

    expect(isNegativeMicros('-1')).toBe(true);
    expect(isNegativeMicros('0')).toBe(false);
    expect(isNegativeMicros('1')).toBe(false);
    expect(isNegativeMicros('invalid')).toBe(false);
  });

  it('calculates month-over-month deltas honestly without dividing by zero', () => {
    expect(calculateMonthDelta('10000000000', '8000000000')).toEqual({
      direction: 'up',
      percentText: '+25.0%',
    });
    expect(calculateMonthDelta('6000000000', '8000000000')).toEqual({
      direction: 'down',
      percentText: '-25.0%',
    });
    expect(calculateMonthDelta('5000000000', '5000000000')).toEqual({
      direction: 'flat',
      percentText: '0%',
    });
    expect(calculateMonthDelta('5000000000', '0')).toBeNull();
    expect(calculateMonthDelta('bad', '5000000000')).toBeNull();
  });

  it('builds positive cost breakdown segments summing to 100%', () => {
    const segments = calculateCostSegments({
      salaryCostMicros: '4000000000',
      overheadCostMicros: '1000000000',
      aiCostMicros: '500000000',
      otherCostMicros: '0',
    });
    expect(segments.map((segment) => segment.key)).toEqual([
      'salary',
      'overhead',
      'ai',
    ]);
    expect(segments[0].sharePercent).toBeCloseTo(72.72, 1);
    expect(segments[1].sharePercent).toBeCloseTo(18.18, 1);
    expect(segments[2].sharePercent).toBeCloseTo(9.09, 1);
    expect(
      calculateCostSegments({
        salaryCostMicros: '0',
        overheadCostMicros: '0',
        aiCostMicros: '0',
        otherCostMicros: '0',
      }),
    ).toEqual([]);
  });

  it('builds 90-day forecast SVG geometry including zero crossing and shortfall flag', () => {
    const geometry = buildForecastChartGeometry([
      { date: '2026-11-18', closingMicros: '10000000000' },
      { date: '2026-11-28', closingMicros: '-2000000000' },
      { date: '2026-12-18', closingMicros: '5000000000' },
    ]);
    expect(geometry).not.toBeNull();
    expect(geometry?.hasNegative).toBe(true);
    expect(geometry?.zeroLineY).not.toBeNull();
    expect(geometry?.minPoint.date).toBe('2026-11-28');
    expect(geometry?.maxPoint.date).toBe('2026-11-18');
    expect(geometry?.linePath).toMatch(/^M.+ L.+ L.+$/);
    expect(geometry?.areaPath).toMatch(/Z$/);
    expect(buildForecastChartGeometry([])).toBeNull();
  });

  it('classifies client health into attention, watch and steady tiers', () => {
    expect(
      classifyClientHealth({
        operations: {
          overdueTaskCount: 1,
          blockedTaskCount: 0,
          openTaskCount: 2,
        },
        finance: [{ resultMicros: '1000000', receivablesMicros: '0' }],
      }),
    ).toBe('attention');
    expect(
      classifyClientHealth({
        operations: {
          overdueTaskCount: 0,
          blockedTaskCount: 0,
          openTaskCount: 2,
        },
        finance: [{ resultMicros: '-500000', receivablesMicros: '0' }],
      }),
    ).toBe('attention');
    expect(
      classifyClientHealth({
        operations: {
          overdueTaskCount: 0,
          blockedTaskCount: 0,
          openTaskCount: 2,
        },
        finance: [{ resultMicros: '1000000', receivablesMicros: '250000' }],
      }),
    ).toBe('watch');
    expect(
      classifyClientHealth({
        operations: {
          overdueTaskCount: 0,
          blockedTaskCount: 0,
          openTaskCount: 2,
        },
        finance: [{ resultMicros: '1000000', receivablesMicros: '0' }],
      }),
    ).toBe('steady');
  });

  it('summarizes 7-day team capacity, pending handoffs, Meta leads and AI budget', () => {
    const capacity = summarizeCapacity([
      {
        memberId: 'm1',
        name: 'Amna',
        overloadDays: 2,
        needsPlanningCount: 3,
        days: [
          { overloadMinutes: 120, reviewMinutes: 60, workMinutes: 480 },
          { overloadMinutes: 60, reviewMinutes: 30, workMinutes: 420 },
        ],
      },
      {
        memberId: 'm2',
        name: 'Bilal',
        overloadDays: 0,
        needsPlanningCount: 1,
        days: [{ overloadMinutes: 0, reviewMinutes: 30, workMinutes: 300 }],
      },
    ]);
    expect(capacity.overloadedMembers).toBe(1);
    expect(capacity.totalOverloadHours).toBe(3);
    expect(capacity.totalNeedsPlanning).toBe(4);
    expect(capacity.topOverloaded[0]).toEqual({
      memberId: 'm1',
      name: 'Amna',
      overloadDays: 2,
      overloadHours: 3,
    });

    const handoffs = summarizePendingHandoffs(
      [
        {
          id: 'opp-1',
          name: 'Deal One',
          hasCompany: true,
          quotes: [{ id: 'q1', name: 'Q1' }],
        },
        { id: 'opp-2', name: 'Deal Two', hasCompany: true, quotes: [] },
      ],
      [{ opportunityId: 'opp-1' }],
    );
    expect(handoffs.pendingCount).toBe(1);
    expect(handoffs.completedCount).toBe(1);
    expect(handoffs.pendingItems[0].id).toBe('opp-2');

    const leads = summarizeMetaLeadIntake(
      [
        { id: 'f1', name: 'UAE Form', isActive: true, lastError: null },
        {
          id: 'f2',
          name: 'QAR Form',
          isActive: false,
          lastError: 'Token expired',
        },
      ],
      [
        { formId: 'f1', totalCount: 14, unreadCount: 5 },
        { formId: 'f2', totalCount: 2, unreadCount: 1 },
      ],
    );
    expect(leads.activeFormCount).toBe(1);
    expect(leads.totalLeads).toBe(16);
    expect(leads.unreadLeads).toBe(6);
    expect(leads.erroredForms).toHaveLength(1);

    const ai = summarizeAiBudget({
      configured: true,
      chargedUsd: '42.50',
      heldUsd: '7.50',
      unresolvedCount: 2,
      budgets: [
        {
          id: 'b1',
          scope: 'WORKSPACE',
          scopeName: 'Workspace',
          enabled: true,
          capUsd: '100.00',
          chargedUsd: '42.50',
          heldUsd: '7.50',
          remainingUsd: '50.00',
        },
      ],
    });
    expect(ai.utilizationPercent).toBe(50);
    expect(ai.workspaceCapUsd).toBe('100.00');
    expect(ai.unresolvedCount).toBe(2);
  });

  it('builds 6-month grouped bar and net result line geometry', () => {
    expect(buildSixMonthTrendGeometry([])).toBeNull();
    const geometry = buildSixMonthTrendGeometry([
      {
        month: '2026-09',
        revenueMicros: '8000000000',
        costMicros: '5000000000',
        resultMicros: '3000000000',
      },
      {
        month: '2026-10',
        revenueMicros: '4000000000',
        costMicros: '6000000000',
        resultMicros: '-2000000000',
      },
      {
        month: '2026-11',
        revenueMicros: '10000000000',
        costMicros: '5500000000',
        resultMicros: '4500000000',
      },
    ]);
    expect(geometry).not.toBeNull();
    expect(geometry?.bars).toHaveLength(3);
    expect(geometry?.bars[0].resultNegative).toBe(false);
    expect(geometry?.bars[1].resultNegative).toBe(true);
    expect(geometry?.bars[1].resultY).toBeGreaterThan(geometry!.baselineY);
    expect(geometry?.bars[2].revenueBar.height).toBeGreaterThan(
      geometry!.bars[2].costBar.height,
    );
    expect(geometry?.resultLinePath).toMatch(/^M.+ L.+ L.+$/);
  });

  it('generates formula-injection-safe CSV and omits finance rows when restricted', () => {
    const baseInput = {
      month: '2026-11',
      timezone: 'Asia/Qatar',
      observedAt: '2026-11-18T10:00:00.000Z',
      canReadFinance: true,
      currencies: [
        {
          currency: 'QAR',
          revenueMicros: '12500500000',
          costMicros: '5000000000',
          resultMicros: '7500500000',
          cashCollectedMicros: '10000000000',
          receivablesMicros: '2500500000',
          overdueReceivablesMicros: '500000000',
          periodStatus: 'OPEN',
        },
      ],
      operations: {
        openTaskCount: 12,
        overdueTaskCount: 2,
        blockedTaskCount: 1,
        waitingReviewCount: 3,
        approvedTaskCount: 15,
        revisionCount: 4,
        internalRevisionCount: 1,
      },
      clients: [
        {
          projectName: '=SUM(A1:A2), "Quote"',
          teamCount: 3,
          operations: {
            openTaskCount: 4,
            overdueTaskCount: 1,
            blockedTaskCount: 0,
          },
          finance: [
            {
              currency: 'QAR',
              revenueMicros: '12500500000',
              costMicros: '5000000000',
              resultMicros: '7500500000',
              receivablesMicros: '2500500000',
            },
          ],
        },
      ],
    };

    const fullCsv = buildExecutiveCsv(baseInput);
    expect(fullCsv).toContain(
      'Company Finance,Recognized Revenue,QAR,Amount,12500.50,OPEN',
    );
    expect(fullCsv).toContain(
      'Client Finance,"\'=SUM(A1:A2), ""Quote""",QAR,Contribution,7500.50',
    );
    expect(fullCsv).not.toContain(',=SUM(');

    const restrictedCsv = buildExecutiveCsv({
      ...baseInput,
      canReadFinance: false,
    });
    expect(restrictedCsv).toContain(
      'Operations,Delivery Summary,,Open Tasks,12',
    );
    expect(restrictedCsv).toContain(
      'Client Health,"\'=SUM(A1:A2), ""Quote""",',
    );
    expect(restrictedCsv).not.toContain('Company Finance');
    expect(restrictedCsv).not.toContain('Client Finance');
    expect(restrictedCsv).not.toContain('12500.50');
  });
});
