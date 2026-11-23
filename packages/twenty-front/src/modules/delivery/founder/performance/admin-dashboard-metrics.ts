import { isNonEmptyString } from '@sniptt/guards';

const ZERO = 0n;
const BASIS_POINTS_SCALE = 10_000n;
const SIGNED_MICROS = /^-?\d+$/;

export const parseMicros = (
  value: string | null | undefined,
): bigint | null => {
  if (!isNonEmptyString(value) || !SIGNED_MICROS.test(value)) return null;
  return BigInt(value);
};

export const isPositiveMicros = (value: string | null | undefined): boolean => {
  const parsed = parseMicros(value);
  return parsed !== null && parsed > ZERO;
};

export const isNegativeMicros = (value: string | null | undefined): boolean => {
  const parsed = parseMicros(value);
  return parsed !== null && parsed < ZERO;
};

export type MonthDelta = {
  direction: 'up' | 'down' | 'flat';
  percentText: string;
};

export const calculateMonthDelta = (
  currentMicros: string | null | undefined,
  previousMicros: string | null | undefined,
): MonthDelta | null => {
  const current = parseMicros(currentMicros);
  const previous = parseMicros(previousMicros);
  if (current === null || previous === null || previous === ZERO) return null;
  const diff = current - previous;
  if (diff === ZERO) return { direction: 'flat', percentText: '0%' };
  const denom = previous < ZERO ? -previous : previous;
  const absDiff = diff < ZERO ? -diff : diff;
  const tenths = Number((absDiff * 1000n) / denom) / 10;
  const rounded =
    tenths >= 100 ? Math.round(tenths).toString() : tenths.toFixed(1);
  return {
    direction: diff > ZERO ? 'up' : 'down',
    percentText: `${diff > ZERO ? '+' : '-'}${rounded}%`,
  };
};

export type CostSegmentKey =
  | 'salary'
  | 'overhead'
  | 'ai'
  | 'other'
  | 'unassigned';

export type CostSegment = {
  key: CostSegmentKey;
  amountMicros: string;
  sharePercent: number;
};

export const calculateCostSegments = (input: {
  salaryCostMicros: string;
  overheadCostMicros: string;
  aiCostMicros: string;
  otherCostMicros: string;
}): CostSegment[] => {
  const raw: { key: CostSegmentKey; amount: bigint; amountMicros: string }[] = [
    {
      key: 'salary',
      amount: parseMicros(input.salaryCostMicros) ?? ZERO,
      amountMicros: input.salaryCostMicros,
    },
    {
      key: 'overhead',
      amount: parseMicros(input.overheadCostMicros) ?? ZERO,
      amountMicros: input.overheadCostMicros,
    },
    {
      key: 'ai',
      amount: parseMicros(input.aiCostMicros) ?? ZERO,
      amountMicros: input.aiCostMicros,
    },
    {
      key: 'other',
      amount: parseMicros(input.otherCostMicros) ?? ZERO,
      amountMicros: input.otherCostMicros,
    },
  ];
  const positive = raw.filter((item) => item.amount > ZERO);
  const total = positive.reduce((sum, item) => sum + item.amount, ZERO);
  if (total <= ZERO) return [];
  return positive.map((item) => ({
    key: item.key,
    amountMicros: item.amountMicros,
    sharePercent: Number((item.amount * BASIS_POINTS_SCALE) / total) / 100,
  }));
};

export type ForecastDayPoint = {
  date: string;
  closingMicros: string;
};

export type ForecastChartGeometry = {
  linePath: string;
  areaPath: string;
  zeroLineY: number | null;
  minPoint: { date: string; closingMicros: string; x: number; y: number };
  maxPoint: { date: string; closingMicros: string; x: number; y: number };
  startPoint: { date: string; closingMicros: string; x: number; y: number };
  endPoint: { date: string; closingMicros: string; x: number; y: number };
  hasNegative: boolean;
};

export const buildForecastChartGeometry = (
  timeline: ForecastDayPoint[],
  width = 560,
  height = 148,
  paddingX = 8,
  paddingY = 14,
): ForecastChartGeometry | null => {
  const valid = timeline
    .map((day) => {
      const value = parseMicros(day.closingMicros);
      return value === null
        ? null
        : {
            date: day.date,
            closingMicros: day.closingMicros,
            numeric: Number(value) / 1_000_000,
          };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (!valid.length) return null;

  let minNumeric = valid[0].numeric;
  let maxNumeric = valid[0].numeric;
  let minIndex = 0;
  let maxIndex = 0;

  for (let index = 1; index < valid.length; index++) {
    if (valid[index].numeric < minNumeric) {
      minNumeric = valid[index].numeric;
      minIndex = index;
    }
    if (valid[index].numeric > maxNumeric) {
      maxNumeric = valid[index].numeric;
      maxIndex = index;
    }
  }

  const domainMin = Math.min(minNumeric, 0);
  const domainMax = Math.max(maxNumeric, 0);
  const span = domainMax - domainMin || 1;
  const usableWidth = Math.max(1, width - paddingX * 2);
  const usableHeight = Math.max(1, height - paddingY * 2);

  const toX = (index: number) =>
    valid.length === 1
      ? paddingX + usableWidth / 2
      : paddingX + (index / (valid.length - 1)) * usableWidth;
  const toY = (numeric: number) =>
    paddingY + ((domainMax - numeric) / span) * usableHeight;

  const coords = valid.map((point, index) => ({
    ...point,
    x: Number(toX(index).toFixed(2)),
    y: Number(toY(point.numeric).toFixed(2)),
  }));

  const linePath = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');
  const baselineY = Number((height - paddingY).toFixed(2));
  const areaPath = `${linePath} L${coords[coords.length - 1].x} ${baselineY} L${coords[0].x} ${baselineY} Z`;
  const zeroLineY =
    minNumeric < 0 && maxNumeric > 0
      ? Number(toY(0).toFixed(2))
      : minNumeric === 0
        ? Number(toY(0).toFixed(2))
        : null;

  const pick = (index: number) => ({
    date: coords[index].date,
    closingMicros: coords[index].closingMicros,
    x: coords[index].x,
    y: coords[index].y,
  });

  return {
    linePath,
    areaPath,
    zeroLineY,
    minPoint: pick(minIndex),
    maxPoint: pick(maxIndex),
    startPoint: pick(0),
    endPoint: pick(coords.length - 1),
    hasNegative: minNumeric < 0,
  };
};

export type ClientHealthTier = 'attention' | 'watch' | 'steady';

export const classifyClientHealth = (client: {
  operations: {
    overdueTaskCount: number;
    blockedTaskCount: number;
    openTaskCount: number;
  };
  finance: {
    resultMicros: string;
    receivablesMicros: string;
  }[];
}): ClientHealthTier => {
  const hasNegativeContribution = client.finance.some((item) => {
    const result = parseMicros(item.resultMicros);
    return result !== null && result < ZERO;
  });
  if (
    client.operations.overdueTaskCount > 0 ||
    client.operations.blockedTaskCount > 0 ||
    hasNegativeContribution
  )
    return 'attention';

  const hasOpenReceivables = client.finance.some((item) => {
    const receivables = parseMicros(item.receivablesMicros);
    return receivables !== null && receivables > ZERO;
  });
  if (hasOpenReceivables) return 'watch';
  return 'steady';
};

export const summarizeCapacity = (
  members: {
    memberId: string;
    name: string;
    overloadDays: number;
    needsPlanningCount: number;
    days: {
      overloadMinutes: number;
      reviewMinutes: number;
      workMinutes: number;
    }[];
  }[],
) => {
  let overloadedMembers = 0;
  let totalOverloadMinutes = 0;
  let totalNeedsPlanning = 0;
  let totalReviewMinutes = 0;
  const topOverloaded: {
    memberId: string;
    name: string;
    overloadDays: number;
    overloadHours: number;
  }[] = [];

  for (const member of members) {
    const memberOverloadMinutes = member.days.reduce(
      (sum, day) => sum + Math.max(0, day.overloadMinutes),
      0,
    );
    const memberReviewMinutes = member.days.reduce(
      (sum, day) => sum + Math.max(0, day.reviewMinutes),
      0,
    );
    totalOverloadMinutes += memberOverloadMinutes;
    totalReviewMinutes += memberReviewMinutes;
    totalNeedsPlanning += member.needsPlanningCount;
    if (member.overloadDays > 0 || memberOverloadMinutes > 0) {
      overloadedMembers++;
      topOverloaded.push({
        memberId: member.memberId,
        name: member.name,
        overloadDays: member.overloadDays,
        overloadHours: Math.round((memberOverloadMinutes / 60) * 10) / 10,
      });
    }
  }

  topOverloaded.sort((left, right) => right.overloadHours - left.overloadHours);

  return {
    overloadedMembers,
    totalOverloadHours: Math.round((totalOverloadMinutes / 60) * 10) / 10,
    totalNeedsPlanning,
    totalReviewHours: Math.round((totalReviewMinutes / 60) * 10) / 10,
    topOverloaded: topOverloaded.slice(0, 3),
  };
};

export const summarizePendingHandoffs = (
  opportunities: {
    id: string;
    name: string;
    hasCompany: boolean;
    quotes: { id: string; name: string }[];
  }[],
  handoffs: { opportunityId: string }[],
) => {
  const handedOffIds = new Set(
    handoffs.map((handoff) => handoff.opportunityId),
  );
  const pending = opportunities.filter(
    (opportunity) => !handedOffIds.has(opportunity.id),
  );
  return {
    pendingCount: pending.length,
    completedCount: handoffs.length,
    pendingItems: pending.slice(0, 4),
  };
};

export const summarizeMetaLeadIntake = (
  forms: {
    id: string;
    name: string;
    isActive: boolean;
    lastError?: string | null;
    lastSyncedAt?: string | null;
  }[],
  activity: { formId: string; totalCount: number; unreadCount: number }[],
) => {
  const activeForms = forms.filter((form) => form.isActive);
  const erroredForms = forms.filter((form) => isNonEmptyString(form.lastError));
  const totalLeads = activity.reduce((sum, item) => sum + item.totalCount, 0);
  const unreadLeads = activity.reduce((sum, item) => sum + item.unreadCount, 0);
  return {
    activeFormCount: activeForms.length,
    totalFormCount: forms.length,
    totalLeads,
    unreadLeads,
    erroredForms,
  };
};

export const summarizeAiBudget = (snapshot: {
  configured: boolean;
  chargedUsd: string;
  heldUsd: string;
  unresolvedCount: number;
  budgets: {
    id: string;
    scope: string;
    scopeName: string;
    enabled: boolean;
    capUsd: string;
    chargedUsd: string;
    heldUsd: string;
    remainingUsd: string;
  }[];
}) => {
  const workspaceBudget = snapshot.budgets.find(
    (budget) => budget.scope === 'WORKSPACE' && budget.enabled,
  );
  const charged = Number.parseFloat(snapshot.chargedUsd) || 0;
  const held = Number.parseFloat(snapshot.heldUsd) || 0;
  const cap = workspaceBudget
    ? Number.parseFloat(workspaceBudget.capUsd) || 0
    : null;
  const used = charged + held;
  const utilizationPercent =
    cap && cap > 0 ? Math.min(100, Math.round((used / cap) * 1000) / 10) : null;

  return {
    configured: snapshot.configured,
    chargedUsd: snapshot.chargedUsd,
    heldUsd: snapshot.heldUsd,
    unresolvedCount: snapshot.unresolvedCount,
    workspaceCapUsd: workspaceBudget?.capUsd ?? null,
    workspaceRemainingUsd: workspaceBudget?.remainingUsd ?? null,
    utilizationPercent,
    activeBudgetCount: snapshot.budgets.filter((budget) => budget.enabled)
      .length,
  };
};

export type TrendPointInput = {
  month: string;
  revenueMicros: string;
  costMicros: string;
  resultMicros: string;
};

export type SixMonthTrendBar = {
  month: string;
  shortLabel: string;
  centerX: number;
  revenueBar: { x: number; y: number; width: number; height: number };
  costBar: { x: number; y: number; width: number; height: number };
  resultY: number;
  resultNegative: boolean;
  revenueMicros: string;
  costMicros: string;
  resultMicros: string;
};

export type SixMonthTrendGeometry = {
  baselineY: number;
  bars: SixMonthTrendBar[];
  resultLinePath: string;
};

export const buildSixMonthTrendGeometry = (
  points: TrendPointInput[],
  width = 560,
  height = 160,
  paddingX = 16,
  paddingTop = 16,
  paddingBottom = 20,
): SixMonthTrendGeometry | null => {
  if (!points.length) return null;
  const parsed = points.map((point) => {
    const rev = Number(parseMicros(point.revenueMicros) ?? ZERO) / 1_000_000;
    const cost = Number(parseMicros(point.costMicros) ?? ZERO) / 1_000_000;
    const res = Number(parseMicros(point.resultMicros) ?? ZERO) / 1_000_000;
    return { ...point, rev, cost, res };
  });

  const maxMagnitude = Math.max(
    1,
    ...parsed.flatMap((item) => [item.rev, item.cost, Math.abs(item.res)]),
  );
  const minVal = Math.min(0, ...parsed.map((item) => item.res));
  const domainSpan = maxMagnitude - minVal || 1;
  const usableWidth = Math.max(1, width - paddingX * 2);
  const usableHeight = Math.max(1, height - paddingTop - paddingBottom);
  const toY = (value: number) =>
    paddingTop + ((maxMagnitude - value) / domainSpan) * usableHeight;
  const baselineY = Number(toY(0).toFixed(2));
  const groupWidth = usableWidth / parsed.length;
  const barWidth = Math.max(8, Math.min(22, groupWidth * 0.28));
  const barGap = 4;

  const bars: SixMonthTrendBar[] = parsed.map((item, index) => {
    const centerX = Number(
      (paddingX + groupWidth * index + groupWidth / 2).toFixed(2),
    );
    const revY = Number(toY(item.rev).toFixed(2));
    const costY = Number(toY(item.cost).toFixed(2));
    const resultY = Number(toY(item.res).toFixed(2));
    return {
      month: item.month,
      shortLabel: item.month.slice(5),
      centerX,
      revenueBar: {
        x: Number((centerX - barWidth - barGap / 2).toFixed(2)),
        y: Math.min(revY, baselineY),
        width: Number(barWidth.toFixed(2)),
        height: Number(Math.max(2, Math.abs(baselineY - revY)).toFixed(2)),
      },
      costBar: {
        x: Number((centerX + barGap / 2).toFixed(2)),
        y: Math.min(costY, baselineY),
        width: Number(barWidth.toFixed(2)),
        height: Number(Math.max(2, Math.abs(baselineY - costY)).toFixed(2)),
      },
      resultY,
      resultNegative: item.res < 0,
      revenueMicros: item.revenueMicros,
      costMicros: item.costMicros,
      resultMicros: item.resultMicros,
    };
  });

  const resultLinePath = bars
    .map(
      (bar, index) => `${index === 0 ? 'M' : 'L'}${bar.centerX} ${bar.resultY}`,
    )
    .join(' ');

  return { baselineY, bars, resultLinePath };
};

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const escapeCsvCell = (value: string | number | null | undefined): string => {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

const formatMicrosDecimal = (micros: string): string => {
  const parsed = parseMicros(micros);
  if (parsed === null) return '';
  const sign = parsed < ZERO ? '-' : '';
  const abs = parsed < ZERO ? -parsed : parsed;
  const whole = abs / 1_000_000n;
  const cents = ((abs % 1_000_000n) / 10_000n).toString().padStart(2, '0');
  return `${sign}${whole}.${cents}`;
};

export const buildExecutiveCsv = (input: {
  month: string;
  timezone: string;
  observedAt: string;
  canReadFinance: boolean;
  currencies: {
    currency: string;
    revenueMicros: string;
    costMicros: string;
    resultMicros: string;
    cashCollectedMicros: string;
    receivablesMicros: string;
    overdueReceivablesMicros: string;
    periodStatus: string;
  }[];
  operations: {
    openTaskCount: number;
    overdueTaskCount: number;
    blockedTaskCount: number;
    waitingReviewCount: number;
    approvedTaskCount: number;
    revisionCount: number;
    internalRevisionCount: number;
  };
  clients: {
    projectName: string;
    teamCount: number;
    operations: {
      openTaskCount: number;
      overdueTaskCount: number;
      blockedTaskCount: number;
    };
    finance: {
      currency: string;
      revenueMicros: string;
      costMicros: string;
      resultMicros: string;
      receivablesMicros: string;
    }[];
  }[];
}): string => {
  const rows: (string | number)[][] = [
    ['Section', 'Name', 'Currency', 'Metric', 'Value', 'Notes'],
    ['Metadata', 'Service Month', '', 'Month', input.month, input.timezone],
    ['Metadata', 'Observed At', '', 'Timestamp', input.observedAt, ''],
    [
      'Operations',
      'Delivery Summary',
      '',
      'Open Tasks',
      input.operations.openTaskCount,
      `Overdue: ${input.operations.overdueTaskCount}; Blocked: ${input.operations.blockedTaskCount}; Waiting review: ${input.operations.waitingReviewCount}`,
    ],
    [
      'Operations',
      'Quality',
      '',
      'Revisions',
      input.operations.revisionCount,
      `Internal defect revisions: ${input.operations.internalRevisionCount}`,
    ],
  ];

  if (input.canReadFinance) {
    for (const summary of input.currencies) {
      rows.push(
        [
          'Company Finance',
          'Recognized Revenue',
          summary.currency,
          'Amount',
          formatMicrosDecimal(summary.revenueMicros),
          summary.periodStatus,
        ],
        [
          'Company Finance',
          'Recognized Costs',
          summary.currency,
          'Amount',
          formatMicrosDecimal(summary.costMicros),
          summary.periodStatus,
        ],
        [
          'Company Finance',
          'Net Recorded Result',
          summary.currency,
          'Amount',
          formatMicrosDecimal(summary.resultMicros),
          summary.periodStatus,
        ],
        [
          'Company Finance',
          'Cash Collected (MTD)',
          summary.currency,
          'Amount',
          formatMicrosDecimal(summary.cashCollectedMicros),
          '',
        ],
        [
          'Company Finance',
          'Receivables',
          summary.currency,
          'Amount',
          formatMicrosDecimal(summary.receivablesMicros),
          `Overdue: ${formatMicrosDecimal(summary.overdueReceivablesMicros)}`,
        ],
      );
    }
  }

  for (const client of input.clients) {
    rows.push([
      'Client Health',
      client.projectName,
      '',
      'Open Tasks',
      client.operations.openTaskCount,
      `Overdue: ${client.operations.overdueTaskCount}; Blocked: ${client.operations.blockedTaskCount}; Team: ${client.teamCount}`,
    ]);
    if (input.canReadFinance) {
      for (const fin of client.finance) {
        rows.push([
          'Client Finance',
          client.projectName,
          fin.currency,
          'Contribution',
          formatMicrosDecimal(fin.resultMicros),
          `Revenue: ${formatMicrosDecimal(fin.revenueMicros)}; Cost: ${formatMicrosDecimal(fin.costMicros)}; Receivables: ${formatMicrosDecimal(fin.receivablesMicros)}`,
        ]);
      }
    }
  }

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
};
