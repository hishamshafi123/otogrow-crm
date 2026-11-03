import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryTaskActorDTO } from 'src/modules/delivery/tasks/delivery-tasks.dto';

@ObjectType({ isAbstract: true })
export class DeliveryAdvertisingIdentityDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => DeliveryTaskActorDTO) actor: DeliveryTaskActorDTO;
}

@ObjectType('DeliveryAdvertisingRouting')
export class DeliveryAdvertisingRoutingDTO {
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => Int) projectRevision: number;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field(() => ID, { nullable: true }) engagementId: string | null;
  @Field(() => ID, { nullable: true }) managerId: string | null;
  @Field(() => ID, { nullable: true }) marketerId: string | null;
}

@ObjectType('DeliveryAdvertisingSourceSnapshot')
export class DeliveryAdvertisingSourceSnapshotDTO {
  @Field(() => String, { nullable: true }) accountId: string | null;
  @Field(() => String) kind: string;
  @Field(() => ID) id: string;
  @Field(() => String) fingerprint: string;
  @Field(() => String) evidenceFingerprint: string;
  @Field(() => Int, { nullable: true }) sourceRevision: number | null;
  @Field(() => ID, { nullable: true }) legacyTaskId: string | null;
  @Field(() => String) title: string;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field(() => ID, { nullable: true }) engagementId: string | null;
  @Field(() => String) clientProvenance: string;
  @Field(() => String) channel: string;
  @Field(() => String) currency: string;
  @Field(() => String, { nullable: true }) timezone: string | null;
  @Field(() => String) fromDate: string;
  @Field(() => String) throughDate: string;
  @Field(() => String, { nullable: true }) spendMicros: string | null;
  @Field(() => String) sourceStatus: string;
  @Field(() => DeliveryAdvertisingRoutingDTO)
  routing: DeliveryAdvertisingRoutingDTO;
}

@ObjectType('DeliveryAdvertisingGoal')
export class DeliveryAdvertisingGoalDTO {
  @Field(() => String) kind: string;
  @Field(() => String, { nullable: true }) metricKey: string | null;
  @Field(() => String, { nullable: true }) metricAdId: string | null;
  @Field(() => String) provenance: string;
  @Field(() => String, { nullable: true }) value: string | null;
  @Field(() => String) evidence: string;
  @Field(() => String, { nullable: true }) targetCostMicros: string | null;
  @Field(() => String, { nullable: true }) metricLabel: string | null;
  @Field(() => String) metricProvenance: string;
  @Field(() => String, { nullable: true }) metricReason: string | null;
  @Field(() => String) metricUnit: string;
  @Field(() => String) currency: string;
  @Field(() => String, { nullable: true }) timezone: string | null;
  @Field(() => String) fromDate: string;
  @Field(() => String) throughDate: string;
  @Field(() => String) sourceFingerprint: string;
}

@ObjectType('DeliveryAdvertisingEvidenceLink')
export class DeliveryAdvertisingEvidenceLinkDTO {
  @Field(() => String) url: string;
  @Field(() => String) label: string;
}

@ObjectType('DeliveryAdvertisingTask')
export class DeliveryAdvertisingTaskDTO {
  @Field(() => ID) id: string;
  @Field(() => String) title: string;
  @Field(() => Int) revision: number;
  @Field(() => String) state: string;
  @Field(() => ID, { nullable: true }) ownerId: string | null;
  @Field(() => String, { nullable: true }) ownerName: string | null;
  @Field(() => ID) reviewerId: string;
  @Field(() => String, { nullable: true }) reviewerName: string | null;
  @Field(() => String, { nullable: true }) dueAt: string | null;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => String, { nullable: true }) submissionState: string | null;
  @Field(() => [DeliveryAdvertisingEvidenceLinkDTO])
  evidence: DeliveryAdvertisingEvidenceLinkDTO[];
}

@ObjectType('DeliveryAdvertisingActionOrigin')
export class DeliveryAdvertisingActionOriginDTO {
  @Field(() => ID) runId: string;
  @Field(() => ID) suggestionId: string;
  @Field(() => Boolean) humanEdited: boolean;
}

@ObjectType('DeliveryAdvertisingAction')
export class DeliveryAdvertisingActionDTO {
  @Field(() => ID) id: string;
  @Field(() => String) title: string;
  @Field(() => String) rationale: string;
  @Field(() => String) expectedResult: string;
  @Field(() => String) evidence: string;
  @Field(() => ID) ownerId: string;
  @Field(() => String) ownerName: string;
  @Field(() => ID) reviewerId: string;
  @Field(() => String) reviewerName: string;
  @Field(() => String) dueDate: string;
  @Field(() => ID, { nullable: true }) assistantId: string | null;
  @Field(() => ID, { nullable: true }) adoptTaskId: string | null;
  @Field(() => ID, { nullable: true }) taskId: string | null;
  @Field(() => Int, { nullable: true }) assistantVersion: number | null;
  @Field(() => String, { nullable: true }) assistantName: string | null;
  @Field(() => DeliveryAdvertisingActionOriginDTO, { nullable: true })
  origin: DeliveryAdvertisingActionOriginDTO | null;
  @Field(() => DeliveryAdvertisingTaskDTO, { nullable: true })
  task: DeliveryAdvertisingTaskDTO | null;
}

@ObjectType('DeliveryAdvertisingLegacyHandling')
export class DeliveryAdvertisingLegacyHandlingDTO {
  @Field() mode: string;
  @Field(() => ID, { nullable: true }) taskId: string | null;
  @Field(() => Int, { nullable: true }) taskRevision: number | null;
  @Field(() => String, { nullable: true }) taskState: string | null;
  @Field() reason: string;
}
@ObjectType('DeliveryAdvertisingReview')
export class DeliveryAdvertisingReviewDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field(() => String) state: string;
  @Field(() => DeliveryAdvertisingSourceSnapshotDTO)
  source: DeliveryAdvertisingSourceSnapshotDTO;
  @Field(() => DeliveryAdvertisingGoalDTO) goal: DeliveryAdvertisingGoalDTO;
  @Field(() => String) note: string;
  @Field() noChangeReason: string;
  @Field(() => DeliveryAdvertisingLegacyHandlingDTO)
  legacyHandling: DeliveryAdvertisingLegacyHandlingDTO;
  @Field(() => ID) createdBy: string;
  @Field(() => ID, { nullable: true }) assignedBy: string | null;
  @Field(() => String, { nullable: true }) assignedAt: string | null;
  @Field(() => String) createdAt: string;
  @Field(() => [DeliveryAdvertisingActionDTO])
  actions: DeliveryAdvertisingActionDTO[];
}

@ObjectType('DeliveryAdvertisingReviewDetail')
export class DeliveryAdvertisingReviewDetailDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryAdvertisingReviewDTO, { nullable: true })
  review: DeliveryAdvertisingReviewDTO | null;
  @Field(() => Boolean) canEdit: boolean;
  @Field(() => Boolean) canAssign: boolean;
  @Field(() => [String]) blockingReasons: string[];
  @Field(() => String, { nullable: true }) currentSourceFingerprint:
    | string
    | null;
  @Field(() => DeliveryAdvertisingTaskDTO, { nullable: true })
  legacyTask: DeliveryAdvertisingTaskDTO | null;
  @Field(() => ID, { nullable: true }) legacyAdoptedReviewId: string | null;
}

@ObjectType('DeliveryAdvertisingActionTask')
export class DeliveryAdvertisingActionTaskDTO {
  @Field(() => ID) actionId: string;
  @Field(() => ID) taskId: string;
}
@ObjectType('DeliveryAdvertisingReviewStatus')
export class DeliveryAdvertisingReviewStatusDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() state: string;
  @Field() sourceKind: string;
  @Field(() => ID) sourceId: string;
}
@ObjectType('DeliveryAdvertisingTaskState')
export class DeliveryAdvertisingTaskStateDTO {
  @Field(() => ID) actionId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int, { nullable: true }) revision: number | null;
  @Field() state: string;
}
@ObjectType('DeliveryAdvertisingReviewState')
export class DeliveryAdvertisingReviewStateDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryAdvertisingReviewStatusDTO, { nullable: true })
  review: DeliveryAdvertisingReviewStatusDTO | null;
  @Field(() => String, { nullable: true }) currentSourceFingerprint:
    | string
    | null;
  @Field() canEdit: boolean;
  @Field() canAssign: boolean;
  @Field(() => [String]) blockingReasons: string[];
  @Field(() => [DeliveryAdvertisingTaskStateDTO])
  tasks: DeliveryAdvertisingTaskStateDTO[];
}

@ObjectType('DeliveryAdvertisingCommandReceipt')
export class DeliveryAdvertisingCommandReceiptDTO {
  @Field(() => ID) requestId: string;
  @Field(() => ID) reviewId: string;
  @Field(() => String) action: string;
  @Field(() => ID) actorId: string;
  @Field(() => String) createdAt: string;
  @Field(() => Int) revision: number;
  @Field(() => String) state: string;
  @Field(() => [DeliveryAdvertisingActionTaskDTO])
  actionTasks: DeliveryAdvertisingActionTaskDTO[];
  @Field(() => ID, { nullable: true }) observationId: string | null;
}

@ObjectType('DeliveryAdvertisingReceipt')
export class DeliveryAdvertisingReceiptDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryAdvertisingCommandReceiptDTO, { nullable: true })
  receipt: DeliveryAdvertisingCommandReceiptDTO | null;
}

@ObjectType('DeliveryAdvertisingWriteResult')
export class DeliveryAdvertisingWriteResultDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryAdvertisingCommandReceiptDTO)
  receipt: DeliveryAdvertisingCommandReceiptDTO;
}

@ObjectType('DeliveryAdvertisingReviewSummary')
export class DeliveryAdvertisingReviewSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field(() => String) state: string;
  @Field(() => String) createdAt: string;
  @Field(() => String, { nullable: true }) assignedAt: string | null;
  @Field(() => Int) actionCount: number;
  @Field(() => String) goalKind: string;
}

@ObjectType('DeliveryAdvertisingReviews')
export class DeliveryAdvertisingReviewsDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => [DeliveryAdvertisingReviewSummaryDTO])
  items: DeliveryAdvertisingReviewSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field(() => String) scope: string;
  @Field(() => ID, { nullable: true }) currentDraftId: string | null;
}

@ObjectType('DeliveryAdvertisingMetric')
export class DeliveryAdvertisingMetricDTO {
  @Field() key: string;
  @Field() label: string;
  @Field() unit: string;
  @Field(() => [String]) goalKinds: string[];
  @Field(() => String, { nullable: true }) value: string | null;
  @Field() provenance: string;
  @Field(() => String, { nullable: true }) reason: string | null;
}
@ObjectType('DeliveryAdvertisingObservation')
export class DeliveryAdvertisingObservationDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) reviewId: string;
  @Field(() => ID) actionId: string;
  @Field(() => ID, { nullable: true }) correctsId: string | null;
  @Field(() => ID, { nullable: true }) correctedById: string | null;
  @Field(() => ID) actorId: string;
  @Field(() => String) createdAt: string;
  @Field(() => String) assessment: string;
  @Field(() => String, { nullable: true }) sourceKind: string | null;
  @Field(() => ID, { nullable: true }) sourceId: string | null;
  @Field(() => String, { nullable: true }) metricKey: string | null;
  @Field(() => String, { nullable: true }) metricAdId: string | null;
  @Field(() => String, { nullable: true }) value: string | null;
  @Field(() => String) fromDate: string;
  @Field(() => String) throughDate: string;
  @Field(() => String) evidence: string;
  @Field(() => String) note: string;
  @Field(() => DeliveryAdvertisingSourceSnapshotDTO, { nullable: true })
  source: DeliveryAdvertisingSourceSnapshotDTO | null;
  @Field(() => DeliveryAdvertisingMetricDTO, { nullable: true })
  metric: DeliveryAdvertisingMetricDTO | null;
  @Field(() => DeliveryAdvertisingTaskDTO) task: DeliveryAdvertisingTaskDTO;
}

@ObjectType('DeliveryAdvertisingObservations')
export class DeliveryAdvertisingObservationsDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => [DeliveryAdvertisingObservationDTO])
  items: DeliveryAdvertisingObservationDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field(() => String) scope: string;
}

@ObjectType('DeliveryAdvertisingChoice')
export class DeliveryAdvertisingChoiceDTO {
  @Field(() => ID) id: string;
  @Field(() => String) name: string;
  @Field(() => Int, { nullable: true }) version: number | null;
}

@ObjectType('DeliveryAdvertisingChoices')
export class DeliveryAdvertisingChoicesDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => [DeliveryAdvertisingChoiceDTO])
  items: DeliveryAdvertisingChoiceDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field(() => String) scope: string;
}

@ObjectType('DeliveryAdvertisingContext')
export class DeliveryAdvertisingContextDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => Boolean) canManage: boolean;
}

@InputType('DeliveryAdvertisingPacketSourceInput')
export class DeliveryAdvertisingPacketSourceInput {
  @Field(() => String) sourceKind: string;
  @Field(() => ID) sourceId: string;
}

@InputType('DeliveryAdvertisingPageInput')
export class DeliveryAdvertisingPageInput {
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}

@InputType('DeliveryAdvertisingReviewsInput')
export class DeliveryAdvertisingReviewsInput extends DeliveryAdvertisingPacketSourceInput {
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}

@InputType('DeliveryAdvertisingReviewInput')
export class DeliveryAdvertisingReviewInput {
  @Field(() => ID) id: string;
}

@InputType('DeliveryAdvertisingReceiptInput')
export class DeliveryAdvertisingReceiptInput {
  @Field(() => ID) requestId: string;
}

@InputType('DeliveryAdvertisingChoicesInput')
export class DeliveryAdvertisingChoicesInput extends DeliveryAdvertisingPacketSourceInput {
  @Field(() => String) kind: string;
  @Field(() => ID, { nullable: true }) ownerId?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}

@InputType('DeliveryAdvertisingGoalInput')
export class DeliveryAdvertisingGoalInput {
  @Field(() => String) kind: string;
  @Field(() => String, { nullable: true }) metricKey?: string | null;
  @Field(() => String, { nullable: true }) metricAdId?: string | null;
  @Field(() => String) provenance: string;
  @Field(() => String, { nullable: true }) value?: string | null;
  @Field(() => String) evidence: string;
  @Field(() => String, { nullable: true }) targetCostMicros?: string | null;
}

@InputType('DeliveryAdvertisingActionOriginInput')
export class DeliveryAdvertisingActionOriginInput {
  @Field(() => ID) runId: string;
  @Field(() => ID) suggestionId: string;
}

@InputType('DeliveryAdvertisingActionInput')
export class DeliveryAdvertisingActionInput {
  @Field(() => ID) id: string;
  @Field(() => String) title: string;
  @Field(() => String) rationale: string;
  @Field(() => String) expectedResult: string;
  @Field(() => String) evidence: string;
  @Field(() => ID) ownerId: string;
  @Field(() => ID) reviewerId: string;
  @Field(() => String) dueDate: string;
  @Field(() => ID, { nullable: true }) assistantId?: string | null;
  @Field(() => ID, { nullable: true }) adoptTaskId?: string | null;
  @Field(() => DeliveryAdvertisingActionOriginInput, { nullable: true })
  origin?: DeliveryAdvertisingActionOriginInput | null;
}

@InputType('DeliveryAdvertisingLegacyHandlingInput')
export class DeliveryAdvertisingLegacyHandlingInput {
  @Field() mode: string;
  @Field(() => ID, { nullable: true }) taskId?: string | null;
  @Field(() => Int, { nullable: true }) taskRevision?: number | null;
  @Field(() => String, { nullable: true }) taskState?: string | null;
  @Field() reason: string;
}
@InputType('SaveDeliveryAdvertisingReviewInput')
export class SaveDeliveryAdvertisingReviewInput {
  @Field(() => ID) requestId: string;
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field(() => String) sourceKind: string;
  @Field(() => ID) sourceId: string;
  @Field(() => String) sourceFingerprint: string;
  @Field(() => DeliveryAdvertisingGoalInput) goal: DeliveryAdvertisingGoalInput;
  @Field(() => String) note: string;
  @Field() noChangeReason: string;
  @Field(() => DeliveryAdvertisingLegacyHandlingInput)
  legacyHandling: DeliveryAdvertisingLegacyHandlingInput;
  @Field(() => [DeliveryAdvertisingActionInput])
  actions: DeliveryAdvertisingActionInput[];
}

@InputType('AssignDeliveryAdvertisingReviewInput')
export class AssignDeliveryAdvertisingReviewInput {
  @Field(() => ID) requestId: string;
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field(() => String) sourceFingerprint: string;
}

@InputType('DeliveryAdvertisingObservationsInput')
export class DeliveryAdvertisingObservationsInput {
  @Field(() => ID) reviewId: string;
  @Field(() => ID, { nullable: true }) actionId?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}

@InputType('ObserveDeliveryAdvertisingActionInput')
export class ObserveDeliveryAdvertisingActionInput {
  @Field(() => ID) requestId: string;
  @Field(() => ID) id: string;
  @Field(() => ID) reviewId: string;
  @Field(() => ID) actionId: string;
  @Field(() => ID, { nullable: true }) correctsId?: string | null;
  @Field(() => String) assessment: string;
  @Field(() => String, { nullable: true }) sourceKind?: string | null;
  @Field(() => ID, { nullable: true }) sourceId?: string | null;
  @Field(() => String, { nullable: true }) sourceFingerprint?: string | null;
  @Field(() => String, { nullable: true }) metricKey?: string | null;
  @Field(() => String, { nullable: true }) metricAdId?: string | null;
  @Field(() => String, { nullable: true }) value?: string | null;
  @Field(() => String) fromDate: string;
  @Field(() => String) throughDate: string;
  @Field(() => String) evidence: string;
  @Field(() => String) note: string;
}
