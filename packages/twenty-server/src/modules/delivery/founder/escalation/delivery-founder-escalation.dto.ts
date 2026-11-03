import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  DeliveryFounderExceptionDTO,
  DeliveryFounderOptionDTO,
  DeliveryFounderCoverageDTO,
} from 'src/modules/delivery/founder/delivery-founder.dto';

@InputType('DeliveryFounderEscalationRuleDraftInput')
export class DeliveryFounderEscalationRuleDraftInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() name: string;
  @Field() condition: string;
  @Field(() => Int, { nullable: true }) minimumReviewWaitHours?: number | null;
  @Field(() => ID) recipientId: string;
  @Field() priority: string;
  @Field() projectScope: string;
  @Field(() => [ID]) projectIds: string[];
  @Field() includeCompany: boolean;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field(() => String, { nullable: true }) serviceMonth: string | null;
  @Field() repeatMode: string;
  @Field(() => Int, { nullable: true }) repeatHours: number | null;
  @Field(() => Int) maxSends: number;
}
@InputType('DeliveryFounderEscalationRuleSaveInput')
export class DeliveryFounderEscalationRuleSaveInput extends DeliveryFounderEscalationRuleDraftInput {
  @Field(() => ID) commandId: string;
  @Field() reason: string;
}
@InputType('DeliveryFounderEscalationRuleStateInput')
export class DeliveryFounderEscalationRuleStateInput {
  @Field(() => ID) commandId: string;
  @Field(() => ID) ruleId: string;
  @Field(() => Int) revision: number;
  @Field() enabled: boolean;
  @Field(() => String, { nullable: true }) previewToken: string | null;
  @Field() adoptLegacyRouting: boolean;
  @Field() reason: string;
}
@InputType('DeliveryFounderEscalationAcknowledgeInput')
export class DeliveryFounderEscalationAcknowledgeInput {
  @Field(() => ID) commandId: string;
  @Field(() => ID) episodeId: string;
  @Field(() => Int) revision: number;
  @Field() reason: string;
}
@InputType('DeliveryFounderEscalationsInput')
export class DeliveryFounderEscalationsInput {
  @Field(() => ID, { nullable: true }) ruleId?: string;
  @Field(() => ID, { nullable: true }) episodeId?: string;
  @Field(() => ID, { nullable: true }) afterRuleId?: string;
  @Field(() => ID, { nullable: true }) afterEpisodeId?: string;
  @Field(() => ID, { nullable: true }) afterNoticeId?: string;
}
@ObjectType('DeliveryFounderEscalationCondition')
export class DeliveryFounderEscalationConditionDTO {
  @Field() code: string;
  @Field() domain: string;
  @Field() requiresServiceMonth: boolean;
}
@ObjectType('DeliveryFounderEscalationConfiguration')
export class DeliveryFounderEscalationConfigurationDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() name: string;
  @Field() condition: string;
  @Field(() => Int, { nullable: true }) minimumReviewWaitHours: number | null;
  @Field(() => ID) recipientId: string;
  @Field() priority: string;
  @Field() projectScope: string;
  @Field(() => [ID]) projectIds: string[];
  @Field() includeCompany: boolean;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field(() => String, { nullable: true }) serviceMonth: string | null;
  @Field() repeatMode: string;
  @Field(() => Int, { nullable: true }) repeatHours: number | null;
  @Field(() => Int) maxSends: number;
}

@ObjectType('DeliveryFounderEscalationRule')
export class DeliveryFounderEscalationRuleDTO extends DeliveryFounderEscalationConfigurationDTO {
  @Field() enabled: boolean;
  @Field() recipientName: string;
  @Field() recipientEligible: boolean;
  @Field() grantingAdminEligible: boolean;
  @Field() changedAt: string;
  @Field() changedByName: string;
  @Field(() => String, { nullable: true }) lastEvaluatedAt: string | null;
  @Field(() => String, { nullable: true }) evaluationError: string | null;
}
@ObjectType('DeliveryFounderEscalationEpisode')
export class DeliveryFounderEscalationEpisodeDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) ruleId: string;
  @Field(() => Int) revision: number;
  @Field() sourceKey: string;
  @Field() condition: string;
  @Field() title: string;
  @Field() status: string;
  @Field() firstSeenAt: string;
  @Field() lastSeenAt: string;
  @Field(() => String, { nullable: true }) resolvedAt: string | null;
  @Field(() => String, { nullable: true }) acknowledgedAt: string | null;
  @Field(() => String, { nullable: true }) acknowledgedByName: string | null;
  @Field(() => String, { nullable: true }) acknowledgementReason: string | null;
  @Field(() => DeliveryFounderExceptionDTO) source: DeliveryFounderExceptionDTO;
}
@ObjectType('DeliveryFounderEscalationNotice')
export class DeliveryFounderEscalationNoticeDTO {
  @Field(() => DeliveryFounderEscalationConfigurationDTO, { nullable: true })
  configuration: DeliveryFounderEscalationConfigurationDTO | null;
  @Field(() => ID) id: string;
  @Field(() => ID) ruleId: string;
  @Field(() => ID, { nullable: true }) episodeId: string | null;
  @Field() kind: string;
  @Field(() => Int) sequence: number;
  @Field(() => Int) ruleRevision: number;
  @Field() priority: string;
  @Field() recipientName: string;
  @Field() createdAt: string;
  @Field() actorName: string;
  @Field(() => String, { nullable: true }) reason: string | null;
  @Field() transportStatus: string;
  @Field(() => String, { nullable: true }) attemptedAt: string | null;
  @Field(() => String, { nullable: true }) finishedAt: string | null;
  @Field(() => String, { nullable: true }) error: string | null;
}
@ObjectType('DeliveryFounderEscalationsSnapshot')
export class DeliveryFounderEscalationsSnapshotDTO {
  @Field() canReadFinance: boolean;
  @Field() observedAt: string;
  @Field(() => String, { nullable: true }) workerObservedAt: string | null;
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() routingAdopted: boolean;
  @Field(() => Int) routingRevision: number;
  @Field() telegramEnabled: boolean;
  @Field() botConfigured: boolean;
  @Field(() => [ID]) linkedRecipientIds: string[];
  @Field(() => [DeliveryFounderOptionDTO])
  recipients: DeliveryFounderOptionDTO[];
  @Field(() => [DeliveryFounderOptionDTO]) projects: DeliveryFounderOptionDTO[];
  @Field(() => [DeliveryFounderEscalationConditionDTO])
  conditions: DeliveryFounderEscalationConditionDTO[];
  @Field(() => [DeliveryFounderEscalationRuleDTO])
  rules: DeliveryFounderEscalationRuleDTO[];
  @Field(() => ID, { nullable: true }) nextRuleId: string | null;
  @Field(() => [DeliveryFounderEscalationEpisodeDTO])
  episodes: DeliveryFounderEscalationEpisodeDTO[];
  @Field(() => ID, { nullable: true }) nextEpisodeId: string | null;
  @Field(() => [DeliveryFounderEscalationNoticeDTO])
  notices: DeliveryFounderEscalationNoticeDTO[];
  @Field(() => ID, { nullable: true }) nextNoticeId: string | null;
}
@ObjectType('DeliveryFounderEscalationPreview')
export class DeliveryFounderEscalationPreviewDTO {
  @Field() canReadFinance: boolean;
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() previewToken: string;
  @Field() observedAt: string;
  @Field(() => Int) matchCount: number;
  @Field(() => [DeliveryFounderExceptionDTO])
  items: DeliveryFounderExceptionDTO[];
  @Field(() => [DeliveryFounderCoverageDTO])
  coverage: DeliveryFounderCoverageDTO[];
  @Field(() => [String]) warnings: string[];
  @Field() canEnable: boolean;
}
@ObjectType('DeliveryFounderEscalationRuleResult')
export class DeliveryFounderEscalationRuleResultDTO {
  @Field(() => DeliveryFounderEscalationRuleDTO)
  rule: DeliveryFounderEscalationRuleDTO;
  @Field() replayed: boolean;
}
@ObjectType('DeliveryFounderEscalationEpisodeResult')
export class DeliveryFounderEscalationEpisodeResultDTO {
  @Field(() => DeliveryFounderEscalationEpisodeDTO)
  episode: DeliveryFounderEscalationEpisodeDTO;
  @Field() replayed: boolean;
}
