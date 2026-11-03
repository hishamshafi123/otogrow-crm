import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryCreativeContextDTO } from 'src/modules/delivery/creative/reads/delivery-creative-reads.dto';
import { DeliveryCreativeBriefDTO } from 'src/modules/delivery/creative/reads/delivery-creative-document.dto';

@InputType('DeliveryVideoQaPreviewInput')
export class DeliveryVideoQaPreviewInput {
  @Field(() => ID) taskId: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) assetId: string;
  @Field(() => [ID]) referenceAssetIds: string[];
  @Field() modelId: string;
  @Field(() => String, { nullable: true }) manualTranscript?: string | null;
}
@InputType('DeliveryVideoQaStartInput')
export class DeliveryVideoQaStartInput extends DeliveryVideoQaPreviewInput {
  @Field(() => ID) requestId: string;
  @Field() sourceFingerprint: string;
  @Field() preparationFingerprint: string;
  @Field(() => Int) pricingRevision: number;
  @Field() confirm: boolean;
}
@InputType('DeliveryVideoQaSelectionInput')
export class DeliveryVideoQaSelectionInput {
  @Field(() => ID) taskId: string;
  @Field(() => ID) runId: string;
}
@InputType('DeliveryVideoQaReceiptInput')
export class DeliveryVideoQaReceiptInput {
  @Field(() => ID) taskId: string;
  @Field(() => ID) requestId: string;
}
@InputType('DeliveryVideoQaCancelInput')
export class DeliveryVideoQaCancelInput extends DeliveryVideoQaSelectionInput {
  @Field(() => ID) requestId: string;
}
@ObjectType('DeliveryVideoQaAsset')
export class DeliveryVideoQaAssetDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() mimeType: string;
  @Field(() => Int) size: number;
  @Field() sha256: string;
  @Field(() => Int) briefVersion: number;
  @Field(() => Int) productionVersion: number;
  @Field(() => Int) assemblyVersion: number;
  @Field(() => ID, { nullable: true }) shotId: string | null;
  @Field(() => Int, { nullable: true }) shotVersion: number | null;
}
@ObjectType('DeliveryVideoQaFrame')
export class DeliveryVideoQaFrameDTO {
  @Field(() => Int) index: number;
  @Field(() => Int) atMs: number;
  @Field() sha256: string;
  @Field(() => Int) size: number;
}
@ObjectType('DeliveryVideoQaTechnicalFinding')
export class DeliveryVideoQaTechnicalFindingDTO {
  @Field() code: string;
  @Field(() => Int) startMs: number;
  @Field(() => Int) endMs: number;
  @Field() evidence: string;
}
@ObjectType('DeliveryVideoQaPreparation')
export class DeliveryVideoQaPreparationDTO {
  @Field(() => Int) pipelineVersion: number;
  @Field(() => Int) durationMs: number;
  @Field(() => Int) width: number;
  @Field(() => Int) height: number;
  @Field() hasAudio: boolean;
  @Field(() => Int, { nullable: true }) audioChannels: number | null;
  @Field() proxySha256: string;
  @Field(() => Int) proxyBytes: number;
  @Field(() => [DeliveryVideoQaFrameDTO]) frames: DeliveryVideoQaFrameDTO[];
  @Field(() => [DeliveryVideoQaTechnicalFindingDTO])
  technicalFindings: DeliveryVideoQaTechnicalFindingDTO[];
  @Field(() => Int) samplingIntervalMs: number;
  @Field(() => [String]) limitations: string[];
}
@ObjectType('DeliveryVideoQaTranscriptSegment')
export class DeliveryVideoQaTranscriptSegmentDTO {
  @Field(() => Int) startMs: number;
  @Field(() => Int) endMs: number;
  @Field() text: string;
}
@ObjectType('DeliveryVideoQaFinding')
export class DeliveryVideoQaFindingDTO {
  @Field() category: string;
  @Field() severity: string;
  @Field(() => Int) startMs: number;
  @Field(() => Int) endMs: number;
  @Field(() => [Int]) frameIndexes: number[];
  @Field(() => [ID]) referenceAssetIds: string[];
  @Field() evidence: string;
  @Field() correction: string;
  @Field() uncertainty: string;
}
@ObjectType('DeliveryVideoQaResult')
export class DeliveryVideoQaResultDTO {
  @Field() summary: string;
  @Field(() => [DeliveryVideoQaTranscriptSegmentDTO])
  transcript: DeliveryVideoQaTranscriptSegmentDTO[];
  @Field(() => [DeliveryVideoQaTranscriptSegmentDTO])
  visibleText: DeliveryVideoQaTranscriptSegmentDTO[];
  @Field(() => [DeliveryVideoQaFindingDTO])
  findings: DeliveryVideoQaFindingDTO[];
  @Field() limitations: string;
}
@ObjectType('DeliveryVideoQaPreview')
export class DeliveryVideoQaPreviewDTO extends DeliveryCreativeContextDTO {
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => ID) projectId: string;
  @Field(() => Int) creativeVersion: number;
  @Field(() => Int) briefVersion: number;
  @Field(() => DeliveryCreativeBriefDTO) brief: DeliveryCreativeBriefDTO;
  @Field(() => DeliveryVideoQaAssetDTO) asset: DeliveryVideoQaAssetDTO;
  @Field(() => [DeliveryVideoQaAssetDTO]) references: DeliveryVideoQaAssetDTO[];
  @Field() modelId: string;
  @Field(() => String, { nullable: true }) manualTranscript: string | null;
  @Field() sourceFingerprint: string;
  @Field() preparationFingerprint: string;
  @Field(() => DeliveryVideoQaPreparationDTO)
  preparation: DeliveryVideoQaPreparationDTO;
  @Field(() => String, { nullable: true }) maximumCostUsd: string | null;
  @Field(() => Int, { nullable: true }) pricingRevision: number | null;
  @Field() budgetReady: boolean;
  @Field(() => String, { nullable: true }) blockedReason: string | null;
}
@ObjectType('DeliveryVideoQaReceipt')
export class DeliveryVideoQaReceiptDTO extends DeliveryCreativeContextDTO {
  @Field(() => ID) taskId: string;
  @Field(() => ID) runId: string;
  @Field(() => ID) requestId: string;
  @Field() inputHash: string;
  @Field() action: string;
  @Field() status: string;
  @Field() createdAt: string;
}
@ObjectType('DeliveryVideoQaState')
export class DeliveryVideoQaStateDTO extends DeliveryCreativeContextDTO {
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => ID) runId: string;
  @Field() status: string;
  @Field() createdAt: string;
  @Field() updatedAt: string;
  @Field(() => String, { nullable: true }) error: string | null;
  @Field() sourceCurrent: boolean;
  @Field() canCancel: boolean;
  @Field(() => ID) assetId: string;
  @Field(() => Int) briefVersion: number;
}
@ObjectType('DeliveryVideoQaRun')
export class DeliveryVideoQaRunDTO extends DeliveryVideoQaStateDTO {
  @Field(() => DeliveryVideoQaPreviewDTO) input: DeliveryVideoQaPreviewDTO;
  @Field(() => DeliveryVideoQaResultDTO, { nullable: true })
  result: DeliveryVideoQaResultDTO | null;
  @Field(() => String, { nullable: true }) completedAt: string | null;
}
