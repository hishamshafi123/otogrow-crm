import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryKnowledgeReadIdentityDTO } from 'src/modules/delivery/knowledge/reads/delivery-knowledge-reads.dto';

@InputType('DeliveryFathomSettingsInput')
export class DeliveryFathomSettingsInput {
  @Field(() => Int) revision: number;
  @Field() enabled: boolean;
  @Field(() => String, { nullable: true }) apiKey?: string | null;
  @Field(() => Boolean, { nullable: true }) removeCredential?: boolean;
}
@InputType('DeliveryFathomMeetingsInput')
export class DeliveryFathomMeetingsInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field() createdAfter: string;
  @Field() createdBefore: string;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => String, { nullable: true }) exactUrl?: string | null;
}
@InputType('DeliveryFathomPreviewInput')
export class DeliveryFathomPreviewInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field() recordingId: string;
  @Field(() => String, { nullable: true }) meetingProof?: string | null;
}
@ObjectType('DeliveryFathomSettings')
export class DeliveryFathomSettingsDTO extends DeliveryKnowledgeReadIdentityDTO {
  @Field(() => Int) revision: number;
  @Field() enabled: boolean;
  @Field() credentialConfigured: boolean;
}
@ObjectType('DeliveryFathomMeeting')
export class DeliveryFathomMeetingDTO {
  @Field() recordingId: string;
  @Field(() => String, { nullable: true }) title: string | null;
  @Field(() => String, { nullable: true }) recordedAt: string | null;
  @Field(() => String, { nullable: true }) sourceUrl: string | null;
  @Field() proof: string;
}
@ObjectType('DeliveryFathomMeetings')
export class DeliveryFathomMeetingsDTO extends DeliveryKnowledgeReadIdentityDTO {
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field(() => Int) connectionRevision: number;
  @Field(() => [DeliveryFathomMeetingDTO]) items: DeliveryFathomMeetingDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field(() => Int) scannedCount: number;
}
@ObjectType('DeliveryFathomPreview')
export class DeliveryFathomPreviewDTO extends DeliveryKnowledgeReadIdentityDTO {
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field(() => Int) connectionRevision: number;
  @Field(() => DeliveryFathomMeetingDTO) meeting: DeliveryFathomMeetingDTO;
  @Field() transcript: string;
  @Field(() => Int) segmentCount: number;
  @Field() proof: string;
  @Field() proofHash: string;
  @Field() expiresAt: string;
  @Field(() => ID, { nullable: true }) existingSourceId: string | null;
}
