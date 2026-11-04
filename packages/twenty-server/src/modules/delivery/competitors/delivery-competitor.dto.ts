import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryCompetitorSourceBodyInput')
@ObjectType('DeliveryCompetitorSourceBody')
export class DeliveryCompetitorSourceBodyDTO {
  @Field(() => ID) projectId: string;
  @Field() label: string;
  @Field() platform: string;
  @Field() accountReference: string;
  @Field(() => ID) ownerId: string;
  @Field(() => ID) reviewerId: string;
  @Field(() => Int) cadenceHours: number;
  @Field(() => Int) lookbackDays: number;
  @Field() purpose: string;
}
@ObjectType('DeliveryCompetitorSourceSavedBody')
export class DeliveryCompetitorSourceSavedBodyDTO extends DeliveryCompetitorSourceBodyDTO {
  @Field() canonicalReference: string;
  @Field() canonicalKey: string;
  @Field() ownerName: string;
  @Field() reviewerName: string;
}
@InputType('DeliveryCompetitorProjectsInput')
export class DeliveryCompetitorProjectsInput {
  @Field(() => String, { nullable: true }) search?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
}
@InputType('DeliveryCompetitorSourcesInput')
export class DeliveryCompetitorSourcesInput {
  @Field(() => ID) projectId: string;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
}
@InputType('DeliveryCompetitorSourceChoicesInput')
export class DeliveryCompetitorSourceChoicesInput {
  @Field(() => ID) projectId: string;
}
@InputType('DeliveryCompetitorSourceSelectionInput')
export class DeliveryCompetitorSourceSelectionInput {
  @Field(() => ID) id: string;
  @Field(() => Int, { nullable: true }) version?: number | null;
  @Field(() => String, { nullable: true }) after?: string | null;
}
@InputType('DeliveryCompetitorSourceSaveInput')
export class DeliveryCompetitorSourceSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) projectId: string;
  @Field(() => Int) projectRevision: number;
  @Field(() => ID, { nullable: true }) expectedCompanyId: string | null;
  @Field(() => DeliveryCompetitorSourceBodyDTO)
  body: DeliveryCompetitorSourceBodyDTO;
}
@InputType('DeliveryCompetitorSourceChangeInput')
export class DeliveryCompetitorSourceChangeInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) projectId: string;
  @Field(() => Int) projectRevision: number;
  @Field(() => ID, { nullable: true }) expectedCompanyId: string | null;
  @Field() action: string;
  @Field() note: string;
}
@InputType('DeliveryCompetitorSourceReceiptInput')
export class DeliveryCompetitorSourceReceiptInput {
  @Field(() => ID) requestId: string;
  @Field(() => ID) sourceId: string;
  @Field(() => ID) projectId: string;
}
@ObjectType('DeliveryCompetitorIdentity')
export class DeliveryCompetitorIdentityDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() isManager: boolean;
  @Field() scope: string;
  @Field() observedAt: string;
}
@ObjectType('DeliveryCompetitorProject')
export class DeliveryCompetitorProjectDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) revision: number;
  @Field(() => ID, { nullable: true }) companyId: string | null;
}
@ObjectType('DeliveryCompetitorProjects')
export class DeliveryCompetitorProjectsDTO extends DeliveryCompetitorIdentityDTO {
  @Field(() => [DeliveryCompetitorProjectDTO])
  items: DeliveryCompetitorProjectDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryCompetitorSourceSummary')
export class DeliveryCompetitorSourceSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field() label: string;
  @Field() platform: string;
  @Field() canonicalReference: string;
  @Field(() => ID) ownerId: string;
  @Field() ownerName: string;
  @Field(() => ID) reviewerId: string;
  @Field() reviewerName: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) currentVersion: number;
  @Field() status: string;
  @Field(() => Int) cadenceHours: number;
  @Field(() => Int) lookbackDays: number;
}
@ObjectType('DeliveryCompetitorSources')
export class DeliveryCompetitorSourcesDTO extends DeliveryCompetitorIdentityDTO {
  @Field(() => DeliveryCompetitorProjectDTO)
  project: DeliveryCompetitorProjectDTO;
  @Field(() => [DeliveryCompetitorSourceSummaryDTO])
  items: DeliveryCompetitorSourceSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryCompetitorSourceMember')
export class DeliveryCompetitorSourceMemberDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}
@ObjectType('DeliveryCompetitorSourceChoices')
export class DeliveryCompetitorSourceChoicesDTO extends DeliveryCompetitorIdentityDTO {
  @Field(() => DeliveryCompetitorProjectDTO)
  project: DeliveryCompetitorProjectDTO;
  @Field(() => [DeliveryCompetitorSourceMemberDTO])
  owners: DeliveryCompetitorSourceMemberDTO[];
  @Field(() => [DeliveryCompetitorSourceMemberDTO])
  reviewers: DeliveryCompetitorSourceMemberDTO[];
}
@ObjectType('DeliveryCompetitorSourceReceipt')
export class DeliveryCompetitorSourceReceiptDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) actorId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) sourceId: string;
  @Field() inputHash: string;
  @Field() action: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) version: number;
  @Field() status: string;
  @Field() note: string;
  @Field() actorName: string;
  @Field() createdAt: string;
}
@ObjectType('DeliveryCompetitorSourceReceiptResult')
export class DeliveryCompetitorSourceReceiptResultDTO extends DeliveryCompetitorIdentityDTO {
  @Field(() => DeliveryCompetitorSourceReceiptDTO, { nullable: true })
  receipt: DeliveryCompetitorSourceReceiptDTO | null;
}
@ObjectType('DeliveryCompetitorSource')
export class DeliveryCompetitorSourceDTO extends DeliveryCompetitorIdentityDTO {
  @Field(() => DeliveryCompetitorProjectDTO)
  project: DeliveryCompetitorProjectDTO;
  @Field(() => DeliveryCompetitorSourceSummaryDTO)
  source: DeliveryCompetitorSourceSummaryDTO;
  @Field(() => Int) selectedVersion: number;
  @Field(() => DeliveryCompetitorSourceSavedBodyDTO)
  body: DeliveryCompetitorSourceSavedBodyDTO;
  @Field(() => [DeliveryCompetitorSourceReceiptDTO])
  history: DeliveryCompetitorSourceReceiptDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field() canEdit: boolean;
  @Field() canPause: boolean;
  @Field() canArchive: boolean;
  @Field() canRestore: boolean;
  @Field() collectionEnabled: boolean;
  @Field() collectionState: string;
}
@ObjectType('DeliveryCompetitorSourcePreview')
export class DeliveryCompetitorSourcePreviewDTO extends DeliveryCompetitorIdentityDTO {
  @Field(() => DeliveryCompetitorProjectDTO)
  project: DeliveryCompetitorProjectDTO;
  @Field(() => ID) sourceId: string;
  @Field(() => ID) requestId: string;
  @Field() inputHash: string;
  @Field(() => DeliveryCompetitorSourceSavedBodyDTO)
  body: DeliveryCompetitorSourceSavedBodyDTO;
  @Field() collectionEnabled: boolean;
  @Field() collectionState: string;
}
