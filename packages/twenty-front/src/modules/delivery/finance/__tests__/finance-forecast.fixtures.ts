import {
  type FinanceForecastAnchor,
  type FinanceForecastHistorySnapshot,
  type FinanceForecastItem,
  type FinanceForecastSnapshot,
  type FinanceForecastSource,
  type FinanceForecastSources,
} from '@/delivery/finance/finance-forecast.types';

export const FORECAST_ANCHOR_ID = '0a49763b-66ad-4938-9a8c-4b60adc36e84';
export const FORECAST_ITEM_ID = '8315ded3-afd1-4aa6-8f7c-00fa613f79b7';
export const FORECAST_COLLECTION_ID = '471883a4-6cf5-4b8f-aeba-6fc7bb8b70a3';
export const FORECAST_CASH_ID = '18ee0b89-9d1b-4f94-9085-b59135a540c7';
export const FORECAST_INVOICE_ID = '5a1fba2f-0559-457f-bf13-9a957ae2f565';
export const FORECAST_PLAN_ID = 'd7112f3e-b5dd-48c4-9d34-e3cf1866c901';
export const FORECAST_OWNER_ID = '50c3c657-e3c5-45c7-a4e9-a49596fd145d';
export const FORECAST_EVENT_ID = '6d1dd3f2-afec-4385-bd92-3503ae36ef40';
export const FORECAST_REALIZATION_ID = '9416e6a8-8837-4a77-bef1-34d37cb08b5d';

export const financeForecastAnchorFixture = (): FinanceForecastAnchor => ({
  id: FORECAST_ANCHOR_ID,
  revision: 1,
  currency: 'USD',
  amountMicros: '1000000000',
  closingDate: '2026-10-27',
  timezone: 'Asia/Makassar',
  note: 'Closing balance checked against cash records.',
  evidenceUrl: null,
  changedBy: FORECAST_OWNER_ID,
  changedByName: 'Finance operator',
  changedAt: '2026-10-28T01:00:00Z',
});
export const financeForecastItemFixture = (): FinanceForecastItem => ({
  id: FORECAST_ITEM_ID,
  revision: 2,
  status: 'ACTIVE',
  kind: 'OUTFLOW',
  sourceType: 'MANUAL',
  sourceId: null,
  planMonth: null,
  title: 'November supplier payment',
  currency: 'USD',
  amountMicros: '1000000000',
  remainingMicros: '600000000',
  appliedMicros: '400000000',
  expectedDate: '2026-11-01',
  contractualDueDate: null,
  ownerId: FORECAST_OWNER_ID,
  ownerName: 'Finance operator',
  ownerEligible: true,
  nextActionDate: '2026-10-29',
  note: 'Confirm supplier transfer details.',
  sourceReviewToken: null,
  reviewToken: 'b'.repeat(64),
  eligible: true,
  warnings: [],
  changedAt: '2026-10-28T02:00:00Z',
  changedByName: 'Finance operator',
});
export const financeForecastCollectionFixture = (): FinanceForecastItem => ({
  ...financeForecastItemFixture(),
  id: FORECAST_COLLECTION_ID,
  kind: 'COLLECTION',
  sourceType: 'RECEIVABLE',
  sourceId: FORECAST_INVOICE_ID,
  title: 'October client invoice collection',
  amountMicros: '1000000000',
  remainingMicros: '600000000',
  appliedMicros: '0',
  expectedDate: '2026-11-02',
  contractualDueDate: '2026-11-05',
  sourceReviewToken: 'c'.repeat(64),
  reviewToken: 'd'.repeat(64),
  note: 'Confirm client payment date.',
});
export const financeForecastSourceFixture = (
  kind = 'RECEIVABLE',
): FinanceForecastSource => ({
  id:
    kind === 'CASH'
      ? FORECAST_CASH_ID
      : kind === 'PLAN'
        ? FORECAST_PLAN_ID
        : FORECAST_INVOICE_ID,
  sourceType: kind,
  title:
    kind === 'CASH'
      ? 'Recorded supplier transfer'
      : kind === 'PLAN'
        ? 'Editor monthly salary'
        : 'October client invoice',
  category:
    kind === 'CASH' ? 'EXPENSE' : kind === 'PLAN' ? 'SALARY' : 'RECEIVABLE',
  currency: 'USD',
  date: kind === 'PLAN' ? null : '2026-10-28',
  dueDate: kind === 'RECEIVABLE' ? '2026-11-05' : null,
  projectId: null,
  projectName: null,
  amountMicros: kind === 'CASH' ? '400000000' : '1000000000',
  remainingMicros:
    kind === 'CASH'
      ? '400000000'
      : kind === 'PLAN'
        ? '1000000000'
        : '600000000',
  planMonth: kind === 'PLAN' ? '2026-11' : null,
  suggestedDate: kind === 'PLAN' ? '2026-11-30' : null,
  occurrenceItemId: null,
  sourceReviewToken: kind === 'RECEIVABLE' ? 'c'.repeat(64) : 'e'.repeat(64),
  eligible: true,
  warnings: [],
});
export const financeForecastSourcesFixture = (
  kind = 'RECEIVABLE',
): FinanceForecastSources => ({
  workspaceId: 'workspace',
  memberId: FORECAST_OWNER_ID,
  userWorkspaceId: 'membership',
  canManage: true,
  currency: 'USD',
  kind,
  sources: [financeForecastSourceFixture(kind)],
  nextId: null,
  selectedSource: null,
});
export const financeForecastSnapshotFixture = (): FinanceForecastSnapshot => ({
  workspaceId: 'workspace',
  memberId: FORECAST_OWNER_ID,
  userWorkspaceId: 'membership',
  canManage: true,
  currency: 'USD',
  horizonDays: 30,
  businessDate: '2026-10-28',
  timezone: 'Asia/Makassar',
  anchor: financeForecastAnchorFixture(),
  actualInflowMicros: '400000000',
  actualOutflowMicros: '0',
  currentCashMicros: '1400000000',
  expectedInflowMicros: '600000000',
  expectedOutflowMicros: '600000000',
  endingCashMicros: '1400000000',
  firstNegativeDate: null,
  knownUnscheduledInflowMicros: '0',
  knownUnscheduledOutflowMicros: '0',
  unknownCollectionCount: 0,
  unappliedActualOutflowMicros: '0',
  projectionComplete: true,
  warnings: [],
  owners: [{ id: FORECAST_OWNER_ID, name: 'Finance operator' }],
  items: [financeForecastItemFixture(), financeForecastCollectionFixture()],
  itemCount: 2,
  nextItemId: null,
  selectedItem: null,
  realizations: [],
  nextRealizationId: null,
  exceptions: [],
  exceptionCount: 0,
  nextExceptionKey: null,
  timeline: [
    {
      date: '2026-10-28',
      inflowMicros: '0',
      outflowMicros: '0',
      closingMicros: '1400000000',
      itemIds: [],
    },
    {
      date: '2026-11-01',
      inflowMicros: '0',
      outflowMicros: '600000000',
      closingMicros: '800000000',
      itemIds: [FORECAST_ITEM_ID],
    },
  ],
});
export const financeForecastHistoryFixture =
  (): FinanceForecastHistorySnapshot => ({
    workspaceId: 'workspace',
    memberId: FORECAST_OWNER_ID,
    userWorkspaceId: 'membership',
    events: [
      {
        id: FORECAST_EVENT_ID,
        sourceType: 'ITEM',
        sourceId: FORECAST_ITEM_ID,
        action: 'FINANCE_FORECAST_ITEM_REVIEWED',
        revision: 2,
        actorName: 'Finance operator',
        actorId: FORECAST_OWNER_ID,
        createdAt: '2026-10-28T02:00:00Z',
        reason: 'Reviewed supplier expectation.',
        beforeStatus: 'ACTIVE',
        afterStatus: 'ACTIVE',
        currency: 'USD',
        amountMicros: '1000000000',
        date: '2026-11-01',
        title: 'November supplier payment',
        ownerName: 'Finance operator',
        note: 'Confirm supplier transfer details.',
        timezone: null,
        evidenceUrl: null,
        originSourceType: null,
        originSourceId: null,
        planMonth: null,
        sourceRevision: null,
        sourceAmountMicros: null,
        cashId: null,
        itemId: null,
        cashDate: null,
        reversedAt: null,
      },
    ],
    nextBeforeId: null,
  });
