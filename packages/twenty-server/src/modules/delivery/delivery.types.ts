import { type CreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
export const DELIVERY_STATES = [
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];
export type DeliveryChecklistItem = { id: string; text: string; done: boolean };
export type DeliverySubmission = {
  version: number;
  creativeVersion?: number;
  finalAssetId?: string;
  description: string;
  evidence: string[];
  submittedBy: string;
  submittedAt: string;
  decision?: 'APPROVED' | 'CHANGES_REQUESTED';
  feedback?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};
export type DeliveryEvent = {
  id: string;
  actorId: string;
  action: string;
  text: string;
  at: string;
};
export type DeliveryDetails = {
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
  events: DeliveryEvent[];
};
