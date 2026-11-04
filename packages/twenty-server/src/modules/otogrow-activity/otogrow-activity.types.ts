export const OTOGROW_ACTIVITY_CATEGORIES = [
  'ACCESS',
  'DELIVERY',
  'AGENT',
  'BUSINESS',
  'CLIENT',
  'CREATIVE',
  'ADVERTISING',
] as const;
export const OTOGROW_ACTIVITY_OUTCOMES = [
  'RECORDED',
  'APPROVED',
  'CHANGES_REQUESTED',
  'FAILED',
  'CANCELLED',
  'SUCCEEDED',
  'QUEUED',
  'RUNNING',
  'ACCEPTED',
  'REJECTED',
  'FULFILLED',
] as const;

export type OtogrowActivityChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type OtogrowActivityInput = {
  workspaceId: string;
  actorId: string | null;
  actorType?: 'HUMAN' | 'AGENT' | 'SYSTEM' | 'CLIENT';
  subjectMemberId?: string | null;
  category: (typeof OTOGROW_ACTIVITY_CATEGORIES)[number];
  action: string;
  outcome: (typeof OTOGROW_ACTIVITY_OUTCOMES)[number];
  summary: string;
  projectId?: string | null;
  taskId?: string | null;
  sourceType:
    | 'capacity'
    | 'brand-knowledge'
    | 'task'
    | 'project'
    | 'roles'
    | 'agent-run'
    | 'delivery'
    | 'agent'
    | 'recurrence'
    | 'workflow-template'
    | 'delivery-batch'
    | 'settings'
    | 'notice'
    | 'team-chat'
    | 'alert'
    | 'connection'
    | 'creative'
    | 'creative-review'
    | 'meta-connection'
    | 'meta-report'
    | 'conversation'
    | 'ad-report'
    | 'advertising-draft'
    | 'activity-analysis'
    | 'seo-report'
    | 'development-release'
    | 'competitor-source'
    | 'creative-learning'
    | 'budget'
    | 'finance'
    | 'finance-payment'
    | 'finance-plan'
    | 'finance-entry'
    | 'finance-period'
    | 'finance-forecast'
    | 'finance-export'
    | 'founder-alert'
    | 'content'
    | 'competitor'
    | 'release'
    | 'client-engagement'
    | 'client-share';
  sourceId: string;
  changes?: OtogrowActivityChange[];
  occurredAt?: Date;
};
