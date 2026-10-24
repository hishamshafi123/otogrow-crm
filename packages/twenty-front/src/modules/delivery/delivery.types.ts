import { type CreativeDocument } from '@/delivery/delivery-creative.types';
export type DeliveryState =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED';
export type DeliveryChecklistItem = { id: string; text: string; done: boolean };
export type DeliverySubmission = {
  version: number;
  description: string;
  evidence: string[];
  submittedBy: string;
  submittedAt: string;
  decision?: string;
  feedback?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};
export type DeliveryTask = {
  id: string;
  title: string;
  assigneeId: string;
  dueAt: string | null;
  projectId: string;
  revision: number;
  details: {
    assignmentAt?: string;
    creative?: CreativeDocument;
    draftCopy?: string;
    brief: string;
    service: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH';
    scheduledDate: string | null;
    reviewerId: string;
    state: DeliveryState;
    blocker: string;
    checklist: DeliveryChecklistItem[];
    evidence: string[];
    submissions: DeliverySubmission[];
    events: {
      id: string;
      actorId: string;
      action: string;
      text: string;
      at: string;
    }[];
  };
};
export type DeliveryProject = {
  id: string;
  name: string;
  companyId: string | null;
  memberIds: string[];
};
export type DeliveryMember = {
  id: string;
  name: string;
  access: 'ADMIN' | 'MANAGER' | 'MEMBER';
  roleLabel: string;
};
export type DeliveryWorkspace = {
  actor: { memberId: string; isAdmin: boolean; isManager: boolean };
  projects: DeliveryProject[];
  tasks: DeliveryTask[];
  members: DeliveryMember[];
  companies: { id: string; name: string }[];
};
export type DeliveryCommandRunner = (
  input: Record<string, unknown>,
) => Promise<boolean>;
