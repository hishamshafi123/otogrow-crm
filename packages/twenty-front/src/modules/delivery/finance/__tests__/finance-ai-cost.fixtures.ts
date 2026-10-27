import { type DeliveryFinanceQuery } from '~/generated-metadata/graphql';
import {
  type FinanceAiCostSnapshot,
  type FinanceAiCostSource,
} from '@/delivery/finance/finance-ai-cost.types';

export const AI_SPEND_ID = 'ade3b31e-e03b-4354-a959-ef39e78ef439';
export const AI_EVIDENCE_ID = 'c933cf83-e14e-466f-b3ba-7666bba5c3c8';
export const AI_LATER_EVIDENCE_ID = '2858a862-c510-421b-8b5b-7053c81b1ad2';
export const AI_ENTRY_ID = '9c32915c-12e5-4996-a14f-40f6dde6aba2';
export const AI_PRIOR_ENTRY_ID = '544a35c8-8c62-435a-8be3-295eb8b106e0';
export const AI_PROJECT_ID = '956eea05-9164-4e05-bc3d-8cd185b80fa7';
export const AI_MEMBER_ID = '035a135b-9bf0-4372-9d1a-be5d49a53544';

export const financeAiCostSourceFixture = (): FinanceAiCostSource => ({
  id: AI_SPEND_ID,
  revision: 3,
  state: 'SETTLED',
  sourceKind: 'TASK_AGENT',
  modelId: 'reviewed-model',
  currency: 'USD',
  settledAmountMicros: '10125678',
  createdAt: '2026-10-01T10:00:00Z',
  dispatchedAt: '2026-10-01T10:00:01Z',
  settledAt: '2026-10-01T10:00:02Z',
  projectId: AI_PROJECT_ID,
  projectName: 'Client Alpha',
  eligible: true,
  sourceWarnings: [],
  sourceReviewToken: 'a'.repeat(64),
  claim: { revision: 0, currentEntry: null, replacementEntry: null },
  evidenceOptions: [
    {
      id: AI_EVIDENCE_ID,
      basis: 'PRICED_USAGE',
      amountMicros: '10125678',
      recordedAt: '2026-10-01T10:00:02Z',
    },
  ],
  nextEvidenceId: null,
});
export const financeAiCostSnapshotFixture = (): FinanceAiCostSnapshot => ({
  workspaceId: 'workspace',
  memberId: AI_MEMBER_ID,
  userWorkspaceId: 'membership',
  canManage: true,
  canReadBudget: false,
  filter: 'NEEDS_REVIEW',
  sources: [financeAiCostSourceFixture()],
  selectedSource: null,
  nextSpendId: null,
  projects: [{ id: AI_PROJECT_ID, name: 'Client Alpha' }],
});
export const financeAiCostEntryFixture =
  (): DeliveryFinanceQuery['deliveryFinance']['entries'][number] => ({
    id: AI_ENTRY_ID,
    revision: 1,
    month: '2026-09',
    kind: 'COST',
    category: 'OS production AI',
    title: 'Reviewed AI cost',
    currency: 'USD',
    amountMicros: '10125678',
    note: '',
    evidenceUrl: null,
    status: 'DRAFT',
    sourceType: 'AI_SPEND',
    sourcePlan: null,
    sourceAiSpend: {
      spendId: AI_SPEND_ID,
      spendRevision: 3,
      evidenceEventId: AI_EVIDENCE_ID,
      basis: 'PRICED_USAGE',
      amountMicros: '10125678',
      currency: 'USD',
      modelId: 'reviewed-model',
      sourceKind: 'TASK_AGENT',
      recordedAt: '2026-10-01T10:00:02Z',
      projectId: AI_PROJECT_ID,
      projectName: 'Client Alpha',
      replacesEntryId: null,
      correctionReason: null,
    },
    sourceWarnings: [],
    lockedMonths: [],
    sourceReviewToken: 'a'.repeat(64),
    dueDate: null,
    remainingAllocationMicros: '0',
    allocations: [
      {
        projectId: AI_PROJECT_ID,
        projectName: 'Client Alpha',
        amountMicros: '10125678',
      },
    ],
    createdBy: AI_MEMBER_ID,
    createdAt: '2026-10-02T10:00:00Z',
    updatedAt: '2026-10-02T10:00:00Z',
    postedAt: null,
    voidedAt: null,
    voidReason: null,
  });
