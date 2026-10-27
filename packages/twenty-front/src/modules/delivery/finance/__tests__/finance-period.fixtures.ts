import { type DeliveryFinancePeriodHistoryQuery } from '~/generated-metadata/graphql';
import {
  type FinancePeriodSnapshot,
  type FinancePeriodState,
} from '@/delivery/finance/finance-period.types';

export const PERIOD_ID = '07fc48c5-d897-43a4-9abc-abf05cf4a40b';
export const PERIOD_ENTRY_ID = '1922c5f6-0d10-4014-b1db-a04cbca766c7';
export const PERIOD_EVENT_ID = 'e8294072-5a6e-4395-a1fe-92a8a11c9de1';
export const financePeriodStateFixture = (
  month = '2026-10',
): FinancePeriodState => ({
  id: null,
  month,
  status: 'OPEN',
  revision: 0,
  changedBy: null,
  changedByName: null,
  changedAt: null,
  reason: null,
});
export const financePeriodLockedFixture = (
  month = '2026-10',
): FinancePeriodState => ({
  id: PERIOD_ID,
  month,
  status: 'LOCKED',
  revision: 1,
  changedBy: 'finance-member',
  changedByName: 'Finance operator',
  changedAt: '2026-10-28T10:00:00Z',
  reason: 'Recorded results reviewed',
});
export const financePeriodSnapshotFixture = (
  month = '2026-10',
): FinancePeriodSnapshot => ({
  workspaceId: 'workspace',
  memberId: 'finance-member',
  userWorkspaceId: 'membership',
  canManage: true,
  period: financePeriodStateFixture(month),
  recognitionHash: 'b'.repeat(64),
  previewToken: 'a'.repeat(64),
  blockerCount: 0,
  blockers: [],
  nextBlockerId: null,
  limitations: [
    'ALL_CURRENCIES',
    'MANAGEMENT_RESULTS_ONLY',
    'COST_COMPLETENESS_NOT_VERIFIED',
    'CASH_AND_EVIDENCE_REMAIN_OPEN',
  ],
  canLock: true,
  canReopen: false,
  summaries: [
    {
      currency: 'USD',
      revenueMicros: '2500000',
      costMicros: '1000000',
      resultMicros: '1500000',
      draftCount: 0,
      postedCount: 2,
      voidCount: 0,
      projects: [
        {
          projectId: null,
          projectName: null,
          revenueMicros: '2500000',
          costMicros: '1000000',
          resultMicros: '1500000',
          postedCount: 2,
        },
      ],
    },
    {
      currency: 'EUR',
      revenueMicros: '0',
      costMicros: '1000000',
      resultMicros: '-1000000',
      draftCount: 0,
      postedCount: 1,
      voidCount: 0,
      projects: [],
    },
  ],
});
export const financePeriodHistoryFixture = (
  month = '2026-10',
): DeliveryFinancePeriodHistoryQuery['deliveryFinancePeriodHistory'] => ({
  workspaceId: 'workspace',
  memberId: 'finance-member',
  userWorkspaceId: 'membership',
  month,
  nextBeforeId: null,
  events: [
    {
      id: PERIOD_EVENT_ID,
      action: 'FINANCE_PERIOD_LOCKED',
      beforeStatus: 'OPEN',
      afterStatus: 'LOCKED',
      revision: 1,
      reason: 'Recorded results reviewed',
      actorId: 'finance-member',
      actorName: 'Finance operator',
      createdAt: '2026-10-28T10:00:00Z',
      recognitionHash: 'b'.repeat(64),
      summaries: financePeriodSnapshotFixture(month).summaries,
    },
  ],
});
