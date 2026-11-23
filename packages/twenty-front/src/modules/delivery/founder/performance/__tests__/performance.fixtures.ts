import { type DeliveryFounderPerformanceQuery } from '~/generated-metadata/graphql';

export const PERFORMANCE_PROJECT_ID = '22cb9daf-4cdd-461d-bc1d-1a81f8b502b6';
export const PERFORMANCE_COMPANY_ID = 'c34409de-ab3d-4a13-85f1-2bba40cf5e20';
export const PERFORMANCE_MEMBER_ID = 'a3d6cbb0-95ad-4f2a-85cd-f342ff471c81';

export type PerformanceFixture =
  DeliveryFounderPerformanceQuery['deliveryFounderPerformance'];

const operations: PerformanceFixture['operations'] = {
  openTaskCount: 3,
  overdueTaskCount: 2,
  blockedTaskCount: 1,
  waitingReviewCount: 1,
  approvedTaskCount: 1,
  dueTaskCount: 3,
  onTimeApprovedTaskCount: 1,
  reviewedTaskCount: 2,
  firstPassApprovedTaskCount: 1,
  revisionCount: 2,
  internalRevisionCount: 1,
};

export const performanceFixture = (): PerformanceFixture => ({
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  observedAt: '2026-11-18T12:00:00.000Z',
  month: '2026-11',
  previousMonth: '2026-10',
  timezone: 'Asia/Qatar',
  currency: null,
  canReadFinance: true,
  projects: [{ id: PERFORMANCE_PROJECT_ID, name: 'Client Alpha' }],
  operations,
  currencies: [
    {
      currency: 'USD',
      revenueMicros: '10000000000',
      costMicros: '5500000000',
      resultMicros: '4500000000',
      previousRevenueMicros: '8000000000',
      previousCostMicros: '2000000000',
      previousResultMicros: '6000000000',
      salaryCostMicros: '4000000000',
      overheadCostMicros: '1000000000',
      aiCostMicros: '500000000',
      otherCostMicros: '0',
      unassignedRevenueMicros: '0',
      unassignedCostMicros: '300000000',
      cashCollectedMicros: '6000000000',
      receivablesMicros: '2000000000',
      overdueReceivablesMicros: '2000000000',
      draftEntryCount: 1,
      postedEntryCount: 4,
      periodStatus: 'OPEN',
      financeComplete: true,
      cashReportingConfirmed: true,
      cashComplete: true,
    },
  ],
  clients: [
    {
      projectId: PERFORMANCE_PROJECT_ID,
      projectName: 'Client Alpha',
      companyId: PERFORMANCE_COMPANY_ID,
      teamCount: 1,
      operations: { ...operations, openTaskCount: 1, overdueTaskCount: 1 },
      finance: [
        {
          currency: 'USD',
          revenueMicros: '10000000000',
          costMicros: '5200000000',
          resultMicros: '4800000000',
          previousRevenueMicros: '8000000000',
          previousCostMicros: '2000000000',
          previousResultMicros: '6000000000',
          salaryCostMicros: '4000000000',
          cashCollectedMicros: '6000000000',
          receivablesMicros: '2000000000',
        },
      ],
    },
  ],
  clientTotal: 1,
  nextProjectId: null,
  employees: [
    {
      memberId: PERFORMANCE_MEMBER_ID,
      name: 'Amna',
      roleLabel: 'Project manager',
      clientCount: 1,
      operations: { ...operations, openTaskCount: 1, overdueTaskCount: 1 },
      salaryCosts: [{ currency: 'USD', amountMicros: '4000000000' }],
    },
  ],
  employeeTotal: 1,
  nextMemberId: null,
  warnings: [
    'COST_COMPLETENESS_NOT_VERIFIED',
    'CURRENT_ASSIGNMENT_HISTORY',
    'MONTHLY_DRAFTS_EXCLUDED',
    'UNASSIGNED_FINANCE',
  ],
});
