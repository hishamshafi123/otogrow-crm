import { type DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import {
  type AdvertisingMetric,
  type AdvertisingSourceKind,
  type AdvertisingSourceSnapshot,
  type AdvertisingTaskEvidence,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';

export type AdvertisingSourceReference = {
  kind: AdvertisingSourceKind;
  id: string;
};
export type AdvertisingSourceActor = Awaited<
  ReturnType<DeliveryService['actor']>
>;
export type AdvertisingNamedRouting = {
  projectId: string | null;
  projectName: string | null;
  companyId: string | null;
  engagementId: string | null;
  managerId: string | null;
  managerName: string | null;
  marketerId: string | null;
  marketerName: string | null;
};
export type AdvertisingSourceAd = {
  id: string;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  spendMicros: string | null;
  impressions: string | null;
  clicks: string | null;
};
export type AdvertisingSourceEnvelope = {
  actor: AdvertisingSourceActor;
  source: AdvertisingSourceSnapshot;
  fingerprint: string;
  evidenceFingerprint: string;
  canManageDraft: boolean;
  canReview: boolean;
  requiresSourceApproval: boolean;
  evidenceLoaded: boolean;
  recordedAt: string | null;
  lastCheckedAt: string | null;
  hasNewerVersion: boolean;
  reasonCodes: string[];
  legacyTaskId: string | null;
  legacyTask: AdvertisingTaskEvidence | null;
  legacyAdoptedReviewId: string | null;
  legacyReviewNote: string;
  reportedGoalKind: string | null;
  reportedTargetCostMicros: string | null;
  metrics: AdvertisingMetric[];
  originalRouting: AdvertisingNamedRouting;
  currentRouting: AdvertisingNamedRouting | null;
  project: DeliveryProjectEntity | null;
  sourceUrl: string | null;
  metricAdId: string | null;
  ads: AdvertisingSourceAd[];
  adTotalCount: number;
  adOffset: number;
  nextAdOffset: number | null;
  currentDraftId: string | null;
  latestAssignedId: string | null;
};
export type AdvertisingSourceSummary = {
  accountId: string | null;
  hasNewerVersion: boolean;
  archived: boolean;
  kind: AdvertisingSourceKind;
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  channel: string;
  currency: string;
  fromDate: string;
  throughDate: string;
  sourceStatus: string;
  recordedAt: string | null;
  legacyTaskId: string | null;
  currentDraftId: string | null;
  latestAssignedId: string | null;
};
export type AdvertisingSourcesPage = {
  items: AdvertisingSourceSummary[];
  totalCount: number;
  nextCursor: string | null;
  scope: string;
};
