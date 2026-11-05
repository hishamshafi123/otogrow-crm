import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryKnowledgeAssetBindingInput')
export class DeliveryKnowledgeAssetBindingInput {
  @Field(() => ID) id: string;
  @Field() sha256: string;
}
@ObjectType('DeliveryKnowledgeAsset')
export class DeliveryKnowledgeAssetDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() mimeType: string;
  @Field(() => Int) size: number;
  @Field() sha256: string;
  @Field(() => ID) uploadedBy: string;
  @Field() createdAt: string;
}
@InputType('DeliveryKnowledgeUploadInput')
export class DeliveryKnowledgeUploadInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field(() => ID) requestId: string;
  @Field() sha256: string;
}
@ObjectType('DeliveryKnowledgeUploadReceipt')
export class DeliveryKnowledgeUploadReceiptDTO extends DeliveryKnowledgeAssetDTO {
  @Field(() => ID) requestId: string;
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field(() => Int) sourceRevision: number;
  @Field(() => ID) uploaderUserWorkspaceId: string;
  @Field() state: string;
  @Field(() => String, { nullable: true }) failureReason: string | null;
  @Field() availability: string;
  @Field() canAttach: boolean;
  @Field() canRecover: boolean;
  @Field() canDiscard: boolean;
  @Field() cleanupPending: boolean;
}
@ObjectType('DeliveryKnowledgeUploadResult')
export class DeliveryKnowledgeUploadResultDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field(() => DeliveryKnowledgeUploadReceiptDTO, { nullable: true })
  receipt: DeliveryKnowledgeUploadReceiptDTO | null;
}

@InputType('DeliveryKnowledgeUploadsInput')
export class DeliveryKnowledgeUploadsInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) sourceId?: string | null;
  @Field(() => ID, { nullable: true }) afterId?: string | null;
}
@ObjectType('DeliveryKnowledgeUploads')
export class DeliveryKnowledgeUploadsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) projectId: string;
  @Field(() => [DeliveryKnowledgeUploadReceiptDTO])
  items: DeliveryKnowledgeUploadReceiptDTO[];
  @Field(() => ID, { nullable: true }) nextCursor: string | null;
}
