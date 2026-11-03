import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
@InputType('DeliveryCreativeReviewInput')
export class DeliveryCreativeReviewInput {
  @Field(() => ID) taskId: string;
  @Field() targetKind: string;
  @Field(() => Int, { nullable: true }) submissionVersion?: number | null;
  @Field(() => ID, { nullable: true }) assetId?: string | null;
  @Field(() => Int, { nullable: true }) compareSubmissionVersion?:
    | number
    | null;
  @Field(() => ID, { nullable: true }) compareAssetId?: string | null;
  @Field(() => Int, { nullable: true }) beforeSubmissionVersion?: number | null;
  @Field(() => ID, { nullable: true }) afterFeedbackId?: string | null;
  @Field(() => ID, { nullable: true }) selectedFeedbackId?: string | null;
}
@InputType('DeliveryCreativeFeedbackCreateInput')
export class DeliveryCreativeFeedbackCreateInput {
  @Field(() => ID) commandId: string;
  @Field(() => ID) taskId: string;
  @Field() targetKind: string;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => ID) assetId: string;
  @Field() targetToken: string;
  @Field() body: string;
  @Field() anchorKind: string;
  @Field(() => Int, { nullable: true }) startMs: number | null;
  @Field(() => Int, { nullable: true }) endMs: number | null;
}
@InputType('DeliveryCreativeFeedbackChangeInput')
export class DeliveryCreativeFeedbackChangeInput {
  @Field(() => ID) commandId: string;
  @Field(() => ID) taskId: string;
  @Field(() => ID) feedbackId: string;
  @Field(() => Int) revision: number;
  @Field() action: string;
  @Field() body: string;
  @Field(() => String, { nullable: true }) evidenceTargetKind: string | null;
  @Field(() => Int, { nullable: true }) evidenceSubmissionVersion:
    | number
    | null;
  @Field(() => ID, { nullable: true }) evidenceAssetId: string | null;
  @Field(() => String, { nullable: true }) evidenceTargetToken: string | null;
}
@InputType('DeliveryCreativeFeedbackHistoryInput')
export class DeliveryCreativeFeedbackHistoryInput {
  @Field(() => ID) taskId: string;
  @Field(() => ID) feedbackId: string;
  @Field(() => ID, { nullable: true }) beforeId?: string | null;
}
@ObjectType('DeliveryCreativeReviewAsset')
export class DeliveryCreativeReviewAssetDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() kind: string;
  @Field() mimeType: string;
  @Field(() => Int) size: number;
  @Field() createdAt: string;
  @Field(() => Int) briefVersion: number;
  @Field(() => Int) productionVersion: number;
  @Field(() => Int) assemblyVersion: number;
  @Field(() => ID, { nullable: true }) shotId: string | null;
  @Field(() => Int, { nullable: true }) shotVersion: number | null;
  @Field(() => ID, { nullable: true }) parentAssetId: string | null;
  @Field() storageState: string;
  @Field() current: boolean;
}
@ObjectType('DeliveryCreativeReviewTarget')
export class DeliveryCreativeReviewTargetDTO {
  @Field() targetKind: string;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => Int, { nullable: true }) creativeVersion: number | null;
  @Field(() => ID, { nullable: true }) assetId: string | null;
  @Field(() => DeliveryCreativeReviewAssetDTO, { nullable: true })
  asset: DeliveryCreativeReviewAssetDTO | null;
  @Field() availability: string;
  @Field(() => String, { nullable: true }) targetToken: string | null;
  @Field(() => [String]) warnings: string[];
}
@ObjectType('DeliveryCreativeReviewSubmission')
export class DeliveryCreativeReviewSubmissionDTO {
  @Field(() => Int) version: number;
  @Field(() => Int, { nullable: true }) creativeVersion: number | null;
  @Field(() => ID, { nullable: true }) finalAssetId: string | null;
  @Field() submittedAt: string;
  @Field() submittedByName: string;
  @Field(() => String, { nullable: true }) decision: string | null;
}
@ObjectType('DeliveryCreativeFeedback')
export class DeliveryCreativeFeedbackDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() targetKind: string;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => ID) assetId: string;
  @Field(() => DeliveryCreativeReviewTargetDTO)
  target: DeliveryCreativeReviewTargetDTO;
  @Field() body: string;
  @Field() anchorKind: string;
  @Field(() => Int, { nullable: true }) startMs: number | null;
  @Field(() => Int, { nullable: true }) endMs: number | null;
  @Field() status: string;
  @Field() createdAt: string;
  @Field() createdByName: string;
  @Field() updatedAt: string;
  @Field(() => DeliveryCreativeReviewTargetDTO, { nullable: true })
  correction: DeliveryCreativeReviewTargetDTO | null;
}
@ObjectType('DeliveryCreativeFeedbackEvent')
export class DeliveryCreativeFeedbackEventDTO {
  @Field(() => ID) id: string;
  @Field() action: string;
  @Field(() => Int) revision: number;
  @Field() body: string;
  @Field() actorName: string;
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) beforeStatus: string | null;
  @Field() afterStatus: string;
  @Field(() => DeliveryCreativeReviewTargetDTO, { nullable: true })
  correction: DeliveryCreativeReviewTargetDTO | null;
}
@ObjectType('DeliveryCreativeReviewSnapshot')
export class DeliveryCreativeReviewSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field() state: string;
  @Field(() => Int, { nullable: true }) currentSubmissionVersion: number | null;
  @Field() reviewerName: string;
  @Field() assigneeName: string;
  @Field() canComment: boolean;
  @Field() canAddress: boolean;
  @Field() canResolve: boolean;
  @Field() canReviewFinal: boolean;
  @Field(() => DeliveryCreativeReviewTargetDTO)
  selected: DeliveryCreativeReviewTargetDTO;
  @Field(() => DeliveryCreativeReviewTargetDTO, { nullable: true })
  comparison: DeliveryCreativeReviewTargetDTO | null;
  @Field(() => [DeliveryCreativeReviewSubmissionDTO])
  submissions: DeliveryCreativeReviewSubmissionDTO[];
  @Field(() => Int, { nullable: true }) nextBeforeSubmissionVersion:
    | number
    | null;
  @Field(() => [DeliveryCreativeReviewAssetDTO])
  assets: DeliveryCreativeReviewAssetDTO[];
  @Field(() => [DeliveryCreativeFeedbackDTO])
  feedback: DeliveryCreativeFeedbackDTO[];
  @Field(() => Int) feedbackCount: number;
  @Field(() => Int) unresolvedCount: number;
  @Field(() => Int) earlierUnresolvedCount: number;
  @Field(() => ID, { nullable: true }) nextFeedbackId: string | null;
  @Field(() => DeliveryCreativeFeedbackDTO, { nullable: true })
  selectedFeedback: DeliveryCreativeFeedbackDTO | null;
}
@ObjectType('DeliveryCreativeFeedbackHistory')
export class DeliveryCreativeFeedbackHistoryDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => ID) feedbackId: string;
  @Field(() => [DeliveryCreativeFeedbackEventDTO])
  events: DeliveryCreativeFeedbackEventDTO[];
  @Field(() => ID, { nullable: true }) nextBeforeId: string | null;
}
@ObjectType('DeliveryCreativeFeedbackResult')
export class DeliveryCreativeFeedbackResultDTO {
  @Field(() => DeliveryCreativeFeedbackDTO)
  feedback: DeliveryCreativeFeedbackDTO;
  @Field() replayed: boolean;
}
