import {
  type ClientSetupContext,
  type ClientSetupReceipt,
} from '@/delivery/onboarding/client-setup.types';
export const SETUP_COMPANY = '2e73f693-6eec-4c09-8547-5eb405f5871b';
export const SETUP_PROJECT = '554e1773-a544-40e5-88a7-2629d3141a10';
export const SETUP_PLAN = 'f0375313-48de-4a10-94f2-aad646c19c36';
export const SETUP_MANAGER = '5e5c6923-46d7-433b-9f1b-ab58c6b17dd9';
export const SETUP_EDITOR = 'ed93cf06-dd31-40d6-90aa-e73052ab8b9b';
export const SETUP_TASK = 'a7bf9c65-0490-490c-9ef9-a76ef2d54f64';
export const SETUP_REQUEST = 'b1674428-c218-4be2-bd49-e2fe369310dd';
export const clientSetupFixture = (): ClientSetupContext => ({
  workspaceId: 'workspace',
  memberId: SETUP_MANAGER,
  userWorkspaceId: 'membership',
  observedAt: '2026-10-30T08:00:00Z',
  companySearch: '',
  companies: [
    {
      id: SETUP_COMPANY,
      name: 'Current client company',
      sourceToken: 'a'.repeat(64),
    },
  ],
  companiesHasMore: false,
  selectedCompany: {
    id: SETUP_COMPANY,
    name: 'Current client company',
    sourceToken: 'a'.repeat(64),
  },
  projects: [
    {
      id: SETUP_PROJECT,
      name: 'Saved client project',
      revision: 2,
      memberIds: [SETUP_EDITOR],
    },
  ],
  members: [
    { id: SETUP_MANAGER, name: 'Independent manager', access: 'ADMIN' },
    { id: SETUP_EDITOR, name: 'Project editor', access: 'MEMBER' },
  ],
  servicePlans: [
    {
      id: SETUP_PLAN,
      revision: 3,
      projectId: SETUP_PROJECT,
      name: 'Saved exact service plan',
      services: ['Static ads'],
      billing: 'ONE_TIME',
      scope: 'Reviewed static product campaign',
      allowance: 'Quantity agreed separately',
      contact: 'Current client account owner',
      fields: [
        {
          id: '3cc56321-c293-4ce2-a581-e34bc4ac6142',
          label: 'Brand guidelines',
          required: true,
        },
      ],
      advertising: null,
    },
  ],
});
export const clientSetupReceiptFixture = (): ClientSetupReceipt => ({
  workspaceId: 'workspace',
  memberId: SETUP_MANAGER,
  userWorkspaceId: 'membership',
  requestId: SETUP_REQUEST,
  companyId: SETUP_COMPANY,
  projectId: SETUP_PROJECT,
  engagementId: SETUP_PLAN,
  taskId: null,
  createdAt: '2026-10-30T09:00:00Z',
  replayed: false,
  reusedProject: false,
  reusedEngagement: false,
});
