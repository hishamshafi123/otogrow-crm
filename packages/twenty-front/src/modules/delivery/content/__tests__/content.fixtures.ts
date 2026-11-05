import {
  type ContentChoices,
  type ContentSavedBody,
  type ContentSummary,
} from '@/delivery/content/content.types';

export const CONTENT_PROJECT_ID = '10000000-0000-4000-8000-000000000001';
export const CONTENT_PLAN_ID = '10000000-0000-4000-8000-000000000002';
export const CONTENT_POST_ID = '10000000-0000-4000-8000-000000000003';
export const CONTENT_ACCOUNT_ID = '10000000-0000-4000-8000-000000000004';
export const CONTENT_OWNER_ID = '10000000-0000-4000-8000-000000000005';
export const CONTENT_REVIEWER_ID = '10000000-0000-4000-8000-000000000006';
export const CONTENT_REQUEST_ID = '10000000-0000-4000-8000-000000000007';
export const contentChoices: ContentChoices = {
  workspaceId: CONTENT_PROJECT_ID,
  memberId: CONTENT_OWNER_ID,
  userWorkspaceId: CONTENT_OWNER_ID,
  scope: 'a'.repeat(64),
  observedAt: '2026-11-05T00:00:00Z',
  isManager: true,
  project: {
    id: CONTENT_PROJECT_ID,
    name: 'Otogrow internal',
    revision: 1,
    companyId: null,
  },
  accounts: [
    {
      id: CONTENT_ACCOUNT_ID,
      projectId: CONTENT_PROJECT_ID,
      companyId: null,
      revision: 1,
      platform: 'X',
      name: 'Otogrow X',
      handle: '@otogrow',
      profileUrl: 'https://x.com/otogrow',
      archived: false,
    },
  ],
  members: [
    { id: CONTENT_OWNER_ID, name: 'Content producer', canReview: true },
    { id: CONTENT_REVIEWER_ID, name: 'Amna', canReview: true },
  ],
  engagements: [],
  selectedAccounts: [],
  selectedMembers: [],
  selectedEngagements: [],
  nextAccountId: null,
  nextMemberId: null,
  nextEngagementId: null,
  unavailableSelectedIds: [],
};
export const contentBody: ContentSavedBody = {
  accountId: CONTENT_ACCOUNT_ID,
  accountRevision: 1,
  ownerId: CONTENT_OWNER_ID,
  reviewerId: CONTENT_REVIEWER_ID,
  format: 'TEXT',
  caption: 'A thoughtful organic post.',
  plannedAt: '2026-11-05T03:00:00Z',
  plannedLocal: '2026-11-05T06:00',
  timezone: 'Asia/Qatar',
  asset: null,
  notes: '',
  account: contentChoices.accounts[0],
  assetSnapshot: null,
  ownerName: 'Content producer',
  reviewerName: 'Amna',
  contributorIds: [CONTENT_OWNER_ID],
  sourceFingerprint: 'b'.repeat(64),
};
export const contentSummary: ContentSummary = {
  id: CONTENT_POST_ID,
  planId: CONTENT_PLAN_ID,
  planTitle: 'Launch week',
  projectId: CONTENT_PROJECT_ID,
  revision: 1,
  currentVersion: 1,
  lastAttemptAction: null,
  lastAttemptAt: null,
  status: 'DRAFT',
  ownerId: CONTENT_OWNER_ID,
  ownerName: 'Content producer',
  reviewerId: CONTENT_REVIEWER_ID,
  reviewerName: 'Amna',
  platform: 'X',
  accountName: 'Otogrow X',
  plannedAt: contentBody.plannedAt,
  plannedLocal: contentBody.plannedLocal,
  timezone: contentBody.timezone,
  format: 'TEXT',
};
