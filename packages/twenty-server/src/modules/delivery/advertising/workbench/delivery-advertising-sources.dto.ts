import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  DeliveryAdvertisingIdentityDTO,
  DeliveryAdvertisingMetricDTO,
  DeliveryAdvertisingSourceSnapshotDTO,
  DeliveryAdvertisingTaskDTO,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.dto';

@InputType('DeliveryAdvertisingSourcesInput')
export class DeliveryAdvertisingSourcesInput {
  @Field(() => String, { nullable: true }) sourceKind?: string | null;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field(() => String, { nullable: true }) channel?: string | null;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => String, { nullable: true }) fromDate?: string | null;
  @Field(() => String, { nullable: true }) throughDate?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
}
@InputType('DeliveryAdvertisingSourceInput')
export class DeliveryAdvertisingSourceInput {
  @Field() kind: string;
  @Field(() => ID) id: string;
  @Field(() => Int, { nullable: true }) adOffset?: number | null;
  @Field(() => String, { nullable: true }) metricAdId?: string | null;
  @Field(() => Boolean, { nullable: true }) metadataOnly?: boolean | null;
}
@ObjectType('DeliveryAdvertisingNamedRouting')
export class DeliveryAdvertisingNamedRoutingDTO {
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field(() => ID, { nullable: true }) engagementId: string | null;
  @Field(() => ID, { nullable: true }) managerId: string | null;
  @Field(() => String, { nullable: true }) managerName: string | null;
  @Field(() => ID, { nullable: true }) marketerId: string | null;
  @Field(() => String, { nullable: true }) marketerName: string | null;
}
@ObjectType('DeliveryAdvertisingSourceAd')
export class DeliveryAdvertisingSourceAdDTO {
  @Field() id: string;
  @Field() name: string;
  @Field(() => String, { nullable: true }) campaignId: string | null;
  @Field(() => String, { nullable: true }) campaignName: string | null;
  @Field(() => String, { nullable: true }) adsetId: string | null;
  @Field(() => String, { nullable: true }) adsetName: string | null;
  @Field(() => String, { nullable: true }) spendMicros: string | null;
  @Field(() => String, { nullable: true }) impressions: string | null;
  @Field(() => String, { nullable: true }) clicks: string | null;
}
@ObjectType('DeliveryAdvertisingSourceSummary')
export class DeliveryAdvertisingSourceSummaryDTO {
  @Field(() => String, { nullable: true }) accountId: string | null;
  @Field() hasNewerVersion: boolean;
  @Field() archived: boolean;
  @Field() kind: string;
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field() channel: string;
  @Field() currency: string;
  @Field() fromDate: string;
  @Field() throughDate: string;
  @Field() sourceStatus: string;
  @Field(() => String, { nullable: true }) recordedAt: string | null;
  @Field(() => ID, { nullable: true }) legacyTaskId: string | null;
  @Field(() => ID, { nullable: true }) currentDraftId: string | null;
  @Field(() => ID, { nullable: true }) latestAssignedId: string | null;
}
@ObjectType('DeliveryAdvertisingSources')
export class DeliveryAdvertisingSourcesDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => [DeliveryAdvertisingSourceSummaryDTO])
  items: DeliveryAdvertisingSourceSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field() scope: string;
}
@ObjectType('DeliveryAdvertisingSource')
export class DeliveryAdvertisingSourceDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryAdvertisingSourceSnapshotDTO)
  source: DeliveryAdvertisingSourceSnapshotDTO;
  @Field() fingerprint: string;
  @Field() evidenceFingerprint: string;
  @Field() canManageDraft: boolean;
  @Field() canReview: boolean;
  @Field() requiresSourceApproval: boolean;
  @Field() evidenceLoaded: boolean;
  @Field(() => String, { nullable: true }) recordedAt: string | null;
  @Field(() => String, { nullable: true }) lastCheckedAt: string | null;
  @Field() hasNewerVersion: boolean;
  @Field(() => [String]) reasonCodes: string[];
  @Field(() => ID, { nullable: true }) legacyTaskId: string | null;
  @Field(() => DeliveryAdvertisingTaskDTO, { nullable: true })
  legacyTask: DeliveryAdvertisingTaskDTO | null;
  @Field(() => ID, { nullable: true }) legacyAdoptedReviewId: string | null;
  @Field() legacyReviewNote: string;
  @Field(() => String, { nullable: true }) reportedGoalKind: string | null;
  @Field(() => String, { nullable: true }) reportedTargetCostMicros:
    | string
    | null;
  @Field(() => [DeliveryAdvertisingMetricDTO])
  metrics: DeliveryAdvertisingMetricDTO[];
  @Field(() => DeliveryAdvertisingNamedRoutingDTO)
  originalRouting: DeliveryAdvertisingNamedRoutingDTO;
  @Field(() => DeliveryAdvertisingNamedRoutingDTO, { nullable: true })
  currentRouting: DeliveryAdvertisingNamedRoutingDTO | null;
  @Field(() => String, { nullable: true }) sourceUrl: string | null;
  @Field(() => String, { nullable: true }) metricAdId: string | null;
  @Field(() => [DeliveryAdvertisingSourceAdDTO])
  ads: DeliveryAdvertisingSourceAdDTO[];
  @Field(() => Int) adTotalCount: number;
  @Field(() => Int) adOffset: number;
  @Field(() => Int, { nullable: true }) nextAdOffset: number | null;
  @Field(() => ID, { nullable: true }) currentDraftId: string | null;
  @Field(() => ID, { nullable: true }) latestAssignedId: string | null;
}
