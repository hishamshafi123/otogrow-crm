import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryFathomProvenanceDTO } from 'src/modules/delivery/knowledge/fathom/delivery-fathom-provenance.dto';

@InputType('DeliveryKnowledgeInput')
export class DeliveryKnowledgeInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) sourceId?: string;
  @Field(() => ID, { nullable: true }) after?: string;
  @Field(() => Int, { nullable: true }) version?: number;
  @Field(() => String, { nullable: true }) category?: string;
  @Field(() => String, { nullable: true }) search?: string;
}
@InputType('DeliveryKnowledgeSaveInput')
export class DeliveryKnowledgeSaveInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() title: string;
  @Field(() => String, { nullable: true }) category?: string;
  @Field() meetingDate: string;
  @Field() sourceUrl: string;
  @Field() transcript: string;
  @Field() knowledge: string;
  @Field(() => String, { nullable: true }) fathomImportProof?: string | null;
  @Field(() => String, { nullable: true }) fathomImportHash?: string | null;
}
@InputType('DeliveryKnowledgePublishInput')
export class DeliveryKnowledgePublishInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() publish: boolean;
}
@ObjectType('DeliveryKnowledgeItem')
export class DeliveryKnowledgeItemDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() title: string;
  @Field() category: string;
  @Field() meetingDate: string;
  @Field(() => Int) version: number;
  @Field(() => Int, { nullable: true }) publishedVersion: number | null;
  @Field(() => String, { nullable: true }) publishedAt: string | null;
  @Field(() => ID) createdBy: string;
  @Field() canEdit: boolean;
}
@ObjectType('DeliveryKnowledgeDetail')
export class DeliveryKnowledgeDetailDTO extends DeliveryKnowledgeItemDTO {
  @Field() sourceUrl: string;
  @Field(() => String, { nullable: true }) transcript: string | null;
  @Field() knowledge: string;
  @Field(() => Int) currentVersion: number;
  @Field(() => DeliveryFathomProvenanceDTO, { nullable: true })
  fathomProvenance?: DeliveryFathomProvenanceDTO | null;
}
@ObjectType('DeliveryKnowledgeSnapshot')
export class DeliveryKnowledgeSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() canPublish: boolean;
  @Field(() => [DeliveryKnowledgeItemDTO]) items: DeliveryKnowledgeItemDTO[];
  @Field(() => ID, { nullable: true }) nextCursor: string | null;
  @Field(() => DeliveryKnowledgeDetailDTO, { nullable: true })
  detail: DeliveryKnowledgeDetailDTO | null;
}
