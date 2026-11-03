import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  DeliveryAdvertisingGoalDTO,
  DeliveryAdvertisingGoalInput,
  DeliveryAdvertisingIdentityDTO,
  DeliveryAdvertisingSourceSnapshotDTO,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.dto';
import { DeliveryCreativeReviewTargetDTO } from 'src/modules/delivery/creative/review/delivery-creative-review.dto';

@InputType('DeliveryCreativeDeclaredComponentInput')
export class DeliveryCreativeDeclaredComponentInput {
  @Field() role: string;
  @Field(() => ID) assetId: string;
}
@InputType('DeliveryCreativeAdLinkPreviewInput')
export class DeliveryCreativeAdLinkPreviewInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field() adId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) submissionVersion: number;
  @Field(() => ID) assetId: string;
  @Field(() => DeliveryAdvertisingGoalInput) goal: DeliveryAdvertisingGoalInput;
  @Field(() => [DeliveryCreativeDeclaredComponentInput])
  declaredComponents: DeliveryCreativeDeclaredComponentInput[];
  @Field(() => String, { nullable: true }) declaredCopy: string | null;
  @Field() associationEvidence: string;
  @Field() evidenceUrl: string;
  @Field() note: string;
  @Field(() => ID, { nullable: true }) correctsId: string | null;
}
@InputType('DeliveryCreativeAdLinkSaveInput')
export class DeliveryCreativeAdLinkSaveInput extends DeliveryCreativeAdLinkPreviewInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field() previewFingerprint: string;
}
@InputType('DeliveryCreativeAdLinkDecisionInput')
export class DeliveryCreativeAdLinkDecisionInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field() action: string;
  @Field() previewFingerprint: string;
  @Field() note: string;
}
@InputType('DeliveryCreativeAdLinkSelectionInput')
export class DeliveryCreativeAdLinkSelectionInput {
  @Field(() => ID) id: string;
  @Field(() => Int, { nullable: true }) version?: number | null;
  @Field(() => ID, { nullable: true }) afterEventId?: string | null;
}
@InputType('DeliveryCreativeAdLinkStateInput')
export class DeliveryCreativeAdLinkStateInput {
  @Field(() => ID) id: string;
}
@InputType('DeliveryCreativeAdLinksInput')
export class DeliveryCreativeAdLinksInput {
  @Field(() => ID) projectId: string;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => ID, { nullable: true }) assetId?: string | null;
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => ID, { nullable: true }) sourceId?: string | null;
  @Field(() => String, { nullable: true }) adId?: string | null;
}
@InputType('DeliveryCreativeAdLinkChoicesInput')
export class DeliveryCreativeAdLinkChoicesInput {
  @Field(() => ID) sourceId: string;
  @Field() adId: string;
  @Field(() => ID) projectId: string;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => ID, { nullable: true }) selectedTaskId?: string | null;
  @Field(() => Int, { nullable: true }) selectedSubmissionVersion?:
    | number
    | null;
  @Field(() => ID, { nullable: true }) selectedAssetId?: string | null;
}
@InputType('DeliveryCreativeLearningReceiptInput')
export class DeliveryCreativeLearningReceiptInput {
  @Field(() => ID) requestId: string;
}
@InputType('DeliveryCreativeLessonSaveInput')
export class DeliveryCreativeLessonSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) projectId: string;
  @Field(() => [ID]) linkIds: string[];
  @Field(() => [String]) linkFingerprints: string[];
  @Field() title: string;
  @Field() assessment: string;
  @Field() lesson: string;
  @Field() limitations: string;
  @Field() nextTest: string;
  @Field(() => ID, { nullable: true }) correctsId: string | null;
}
@InputType('DeliveryCreativeLessonsInput')
export class DeliveryCreativeLessonsInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => ID, { nullable: true }) selectedId?: string | null;
}
@ObjectType('DeliveryCreativeLearningComponent')
export class DeliveryCreativeLearningComponentDTO {
  @Field() role: string;
  @Field(() => ID) assetId: string;
  @Field() name: string;
  @Field(() => Int) briefVersion: number;
  @Field(() => Int) productionVersion: number;
  @Field(() => Int) assemblyVersion: number;
  @Field(() => ID, { nullable: true }) shotId: string | null;
  @Field(() => Int, { nullable: true }) shotVersion: number | null;
  @Field(() => String, { nullable: true }) provenance?: string | null;
}
@ObjectType('DeliveryCreativeSubmittedLearning')
export class DeliveryCreativeSubmittedLearningDTO {
  @Field(() => Int) version: number;
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field(() => Int) creativeVersion: number;
  @Field(() => ID) finalAssetId: string;
  @Field(() => Int) briefVersion: number;
  @Field() concept: string;
  @Field() angle: string;
  @Field() plannedHook: string;
  @Field() plannedCta: string;
  @Field(() => String, { nullable: true }) copyText: string | null;
  @Field(() => ID, { nullable: true }) assemblyRunId: string | null;
  @Field(() => [DeliveryCreativeLearningComponentDTO])
  components: DeliveryCreativeLearningComponentDTO[];
}
@ObjectType('DeliveryCreativeAdLinkBody')
export class DeliveryCreativeAdLinkBodyDTO {
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field() adId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) submissionVersion: number;
  @Field(() => ID) assetId: string;
  @Field(() => DeliveryAdvertisingGoalDTO)
  goalSnapshot: DeliveryAdvertisingGoalDTO;
  @Field(() => [DeliveryCreativeDeclaredComponentDTO])
  declaredComponents: DeliveryCreativeDeclaredComponentDTO[];
  @Field(() => String, { nullable: true }) declaredCopy: string | null;
  @Field() associationEvidence: string;
  @Field() evidenceUrl: string;
  @Field() note: string;
  @Field(() => ID, { nullable: true }) correctsId: string | null;
  @Field(() => DeliveryAdvertisingSourceSnapshotDTO)
  source: DeliveryAdvertisingSourceSnapshotDTO;
  @Field() adName: string;
  @Field(() => String, { nullable: true }) adSpendMicros: string | null;
  @Field(() => DeliveryCreativeReviewTargetDTO)
  creativeTarget: DeliveryCreativeReviewTargetDTO;
  @Field() assetSha256: string;
  @Field() assetHashCapturedAt: string;
  @Field(() => ID) submittedBy: string;
  @Field() submittedByName: string;
  @Field(() => ID) approvedBy: string;
  @Field() approvedByName: string;
  @Field(() => String, { nullable: true }) approvedAt: string | null;
  @Field(() => DeliveryCreativeSubmittedLearningDTO, { nullable: true })
  submittedLearning: DeliveryCreativeSubmittedLearningDTO | null;
  @Field(() => [DeliveryCreativeLearningComponentDTO])
  components: DeliveryCreativeLearningComponentDTO[];
  @Field(() => String, { nullable: true }) copyText: string | null;
  @Field() copyProvenance: string;
  @Field(() => [String]) warnings: string[];
  @Field() previewFingerprint: string;
}
@ObjectType('DeliveryCreativeDeclaredComponent')
export class DeliveryCreativeDeclaredComponentDTO {
  @Field() role: string;
  @Field(() => ID) assetId: string;
}
@ObjectType('DeliveryCreativeAdLinkPreview')
export class DeliveryCreativeAdLinkPreviewDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryCreativeAdLinkBodyDTO)
  body: DeliveryCreativeAdLinkBodyDTO;
}
@ObjectType('DeliveryCreativeAdLinkSummary')
export class DeliveryCreativeAdLinkSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field() adId: string;
  @Field() adName: string;
  @Field() taskTitle: string;
  @Field(() => String, { nullable: true }) accountId: string | null;
  @Field() fromDate: string;
  @Field() throughDate: string;
  @Field(() => String, { nullable: true }) concept: string | null;
  @Field(() => String, { nullable: true }) goalLabel: string | null;
  @Field(() => ID) taskId: string;
  @Field(() => ID) assetId: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) currentVersion: number;
  @Field() state: string;
  @Field() createdByName: string;
  @Field() createdAt: string;
  @Field(() => Int, { nullable: true }) reviewedVersion: number | null;
  @Field(() => String, { nullable: true }) reviewedByName: string | null;
  @Field(() => ID, { nullable: true }) correctsId: string | null;
  @Field(() => ID, { nullable: true }) correctedById: string | null;
  @Field() fingerprint: string;
}
@ObjectType('DeliveryCreativeAdLinkState')
export class DeliveryCreativeAdLinkStateDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryCreativeAdLinkSummaryDTO)
  link: DeliveryCreativeAdLinkSummaryDTO;
  @Field() canEdit: boolean;
  @Field() canSubmit: boolean;
  @Field() canReview: boolean;
  @Field() canRequestChanges: boolean;
  @Field() canRetract: boolean;
  @Field() sourceCurrent: boolean;
  @Field(() => [String]) warnings: string[];
}
@ObjectType('DeliveryCreativeLearningEvent')
export class DeliveryCreativeLearningEventDTO {
  @Field(() => ID) requestId: string;
  @Field(() => ID) linkId: string;
  @Field(() => ID, { nullable: true }) lessonId: string | null;
  @Field() action: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) version: number;
  @Field() state: string;
  @Field() actorName: string;
  @Field() note: string;
  @Field() createdAt: string;
}
@ObjectType('DeliveryCreativeLearningReceipt')
export class DeliveryCreativeLearningReceiptDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryCreativeLearningEventDTO)
  receipt: DeliveryCreativeLearningEventDTO;
  @Field() inputHash: string;
}
@ObjectType('DeliveryCreativeAdLinks')
export class DeliveryCreativeAdLinksDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => [DeliveryCreativeAdLinkSummaryDTO])
  items: DeliveryCreativeAdLinkSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryCreativeAdLink')
export class DeliveryCreativeAdLinkDTO extends DeliveryCreativeAdLinkStateDTO {
  @Field(() => Int) selectedVersion: number;
  @Field(() => DeliveryCreativeAdLinkBodyDTO)
  body: DeliveryCreativeAdLinkBodyDTO;
  @Field(() => [DeliveryCreativeLearningEventDTO])
  events: DeliveryCreativeLearningEventDTO[];
  @Field(() => ID, { nullable: true }) nextEventCursor: string | null;
}
@ObjectType('DeliveryCreativeAdChoice')
export class DeliveryCreativeAdChoiceDTO {
  @Field(() => ID) taskId: string;
  @Field() title: string;
  @Field(() => Int) submissionVersion: number;
  @Field(() => ID) assetId: string;
  @Field() assetName: string;
  @Field(() => Int) creativeVersion: number;
}
@ObjectType('DeliveryCreativeAdLinkChoices')
export class DeliveryCreativeAdLinkChoicesDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => [DeliveryCreativeAdChoiceDTO])
  items: DeliveryCreativeAdChoiceDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field(() => DeliveryCreativeAdSelectedChoiceDTO, { nullable: true })
  selected: DeliveryCreativeAdSelectedChoiceDTO | null;
  @Field(() => [String]) selectionWarnings: string[];
}
@ObjectType('DeliveryCreativeAdSelectedChoice')
export class DeliveryCreativeAdSelectedChoiceDTO {
  @Field(() => ID) taskId: string;
  @Field(() => Int) submissionVersion: number;
  @Field(() => ID) assetId: string;
  @Field(() => [DeliveryCreativeLearningComponentDTO])
  components: DeliveryCreativeLearningComponentDTO[];
  @Field(() => [DeliveryCreativeLearningComponentDTO])
  provenComponents: DeliveryCreativeLearningComponentDTO[];
  @Field() hasSubmittedCopy: boolean;
}
@ObjectType('DeliveryCreativeLessonEvidence')
export class DeliveryCreativeLessonEvidenceDTO {
  @Field(() => ID) linkId: string;
  @Field(() => Int) version: number;
  @Field() fingerprint: string;
  @Field(() => DeliveryCreativeAdLinkBodyDTO)
  body: DeliveryCreativeAdLinkBodyDTO;
}
@ObjectType('DeliveryCreativeLesson')
export class DeliveryCreativeLessonDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) projectId: string;
  @Field() title: string;
  @Field() assessment: string;
  @Field() lesson: string;
  @Field() limitations: string;
  @Field() nextTest: string;
  @Field(() => [DeliveryCreativeLessonEvidenceDTO])
  evidence: DeliveryCreativeLessonEvidenceDTO[];
  @Field(() => ID, { nullable: true }) correctsId: string | null;
  @Field(() => ID, { nullable: true }) correctedById: string | null;
  @Field() createdByName: string;
  @Field() createdAt: string;
  @Field(() => [String]) warnings: string[];
}
@ObjectType('DeliveryCreativeLessonSummary')
export class DeliveryCreativeLessonSummaryDTO {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() assessment: string;
  @Field() createdByName: string;
  @Field() createdAt: string;
  @Field(() => ID, { nullable: true }) correctedById: string | null;
}
@ObjectType('DeliveryCreativeLessons')
export class DeliveryCreativeLessonsDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => [DeliveryCreativeLessonSummaryDTO])
  items: DeliveryCreativeLessonSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextCursor: string | null;
  @Field(() => DeliveryCreativeLessonDTO, { nullable: true })
  selected: DeliveryCreativeLessonDTO | null;
}
