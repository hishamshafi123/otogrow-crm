import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('DeliveryContentIdentity')
export class DeliveryContentIdentityDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() scope: string;
  @Field() observedAt: string;
  @Field() isManager: boolean;
}
@ObjectType('DeliveryContentProject')
export class DeliveryContentProjectDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) revision: number;
  @Field(() => ID, { nullable: true }) companyId: string | null;
}
@InputType('DeliveryContentProjectsInput')
export class DeliveryContentProjectsInput {
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
}
@ObjectType('DeliveryContentProjects')
export class DeliveryContentProjectsDTO extends DeliveryContentIdentityDTO {
  @Field(() => [DeliveryContentProjectDTO]) items: DeliveryContentProjectDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextId: string | null;
}
@InputType('DeliveryContentProjectInput')
export class DeliveryContentProjectInput {
  @Field(() => ID) projectId: string;
}
@InputType('DeliveryContentProjectChoicesInput')
export class DeliveryContentProjectChoicesInput extends DeliveryContentProjectInput {
  @Field(() => ID, { nullable: true }) afterAccountId?: string | null;
  @Field(() => ID, { nullable: true }) afterMemberId?: string | null;
  @Field(() => ID, { nullable: true }) afterEngagementId?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
  @Field(() => [ID], { nullable: true }) selectedAccountIds?: string[] | null;
  @Field(() => [ID], { nullable: true }) selectedMemberIds?: string[] | null;
  @Field(() => [ID], { nullable: true }) selectedEngagementIds?:
    | string[]
    | null;
}
@ObjectType('DeliveryContentAccount')
export class DeliveryContentAccountDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field(() => Int) revision: number;
  @Field() platform: string;
  @Field() name: string;
  @Field() handle: string;
  @Field() profileUrl: string;
  @Field() archived: boolean;
}
@InputType('DeliveryContentAccountSaveInput')
export class DeliveryContentAccountSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) projectId: string;
  @Field(() => Int) projectRevision: number;
  @Field(() => ID, { nullable: true }) expectedCompanyId: string | null;
  @Field() platform: string;
  @Field() name: string;
  @Field() handle: string;
  @Field() profileUrl: string;
  @Field() archived: boolean;
}
@ObjectType('DeliveryContentMember')
export class DeliveryContentMemberDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() canReview: boolean;
}
@ObjectType('DeliveryContentEngagement')
export class DeliveryContentEngagementDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => [String]) services: string[];
}
@ObjectType('DeliveryContentProjectChoices')
export class DeliveryContentProjectChoicesDTO extends DeliveryContentIdentityDTO {
  @Field(() => DeliveryContentProjectDTO) project: DeliveryContentProjectDTO;
  @Field(() => [DeliveryContentAccountDTO])
  accounts: DeliveryContentAccountDTO[];
  @Field(() => [DeliveryContentMemberDTO]) members: DeliveryContentMemberDTO[];
  @Field(() => [DeliveryContentEngagementDTO])
  engagements: DeliveryContentEngagementDTO[];
  @Field(() => ID, { nullable: true }) nextAccountId: string | null;
  @Field(() => ID, { nullable: true }) nextMemberId: string | null;
  @Field(() => ID, { nullable: true }) nextEngagementId: string | null;
  @Field(() => [DeliveryContentAccountDTO])
  selectedAccounts: DeliveryContentAccountDTO[];
  @Field(() => [DeliveryContentMemberDTO])
  selectedMembers: DeliveryContentMemberDTO[];
  @Field(() => [DeliveryContentEngagementDTO])
  selectedEngagements: DeliveryContentEngagementDTO[];
  @Field(() => [ID]) unavailableSelectedIds: string[];
}
@InputType('DeliveryContentPlanSaveInput')
export class DeliveryContentPlanSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) projectId: string;
  @Field(() => Int) projectRevision: number;
  @Field(() => ID, { nullable: true }) expectedCompanyId: string | null;
  @Field() title: string;
  @Field() purpose: string;
  @Field(() => ID, { nullable: true }) engagementId: string | null;
  @Field(() => String, { nullable: true }) service: string | null;
}
@ObjectType('DeliveryContentPlan')
export class DeliveryContentPlanDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field(() => Int) revision: number;
  @Field() title: string;
  @Field() purpose: string;
  @Field(() => ID, { nullable: true }) engagementId: string | null;
  @Field(() => String, { nullable: true }) service: string | null;
  @Field(() => ID) createdBy: string;
  @Field() canEdit: boolean;
}
@InputType('DeliveryContentPlansInput')
export class DeliveryContentPlansInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => ID, { nullable: true }) planId?: string | null;
}
@ObjectType('DeliveryContentPlans')
export class DeliveryContentPlansDTO extends DeliveryContentIdentityDTO {
  @Field(() => [DeliveryContentPlanDTO]) items: DeliveryContentPlanDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextId: string | null;
}
@InputType('DeliveryContentAssetInput')
@ObjectType('DeliveryContentAsset')
export class DeliveryContentAssetDTO {
  @Field(() => ID) taskId: string;
  @Field(() => Int) submissionVersion: number;
  @Field(() => ID) assetId: string;
}
@ObjectType('DeliveryContentAssetSnapshot')
export class DeliveryContentAssetSnapshotDTO extends DeliveryContentAssetDTO {
  @Field() title: string;
  @Field() name: string;
  @Field() mimeType: string;
  @Field(() => Int) creativeVersion: number;
  @Field(() => ID) reviewedBy: string;
  @Field() reviewedAt: string;
  @Field() sourceHash: string;
}
@InputType('DeliveryContentAssetChoicesInput')
export class DeliveryContentAssetChoicesInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) afterTaskId?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
}
@ObjectType('DeliveryContentAssetChoices')
export class DeliveryContentAssetChoicesDTO extends DeliveryContentIdentityDTO {
  @Field(() => [DeliveryContentAssetSnapshotDTO])
  items: DeliveryContentAssetSnapshotDTO[];
  @Field(() => ID, { nullable: true }) nextTaskId: string | null;
}
@InputType('DeliveryContentBodyInput')
@ObjectType('DeliveryContentBody')
export class DeliveryContentBodyDTO {
  @Field(() => ID) accountId: string;
  @Field(() => Int) accountRevision: number;
  @Field(() => ID) ownerId: string;
  @Field(() => ID) reviewerId: string;
  @Field() format: string;
  @Field() caption: string;
  @Field() plannedAt: string;
  @Field() plannedLocal: string;
  @Field() timezone: string;
  @Field(() => DeliveryContentAssetDTO, { nullable: true })
  asset: DeliveryContentAssetDTO | null;
  @Field() notes: string;
}
@ObjectType('DeliveryContentSavedBody')
export class DeliveryContentSavedBodyDTO extends DeliveryContentBodyDTO {
  @Field(() => DeliveryContentAccountDTO) account: DeliveryContentAccountDTO;
  @Field(() => DeliveryContentAssetSnapshotDTO, { nullable: true })
  assetSnapshot: DeliveryContentAssetSnapshotDTO | null;
  @Field() ownerName: string;
  @Field() reviewerName: string;
  @Field(() => [ID]) contributorIds: string[];
  @Field() sourceFingerprint: string;
}
@InputType('DeliveryContentSaveInput')
export class DeliveryContentSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) planId: string;
  @Field(() => Int) planRevision: number;
  @Field(() => DeliveryContentBodyDTO) body: DeliveryContentBodyDTO;
  @Field(() => String, { nullable: true }) expectedSourceFingerprint:
    | string
    | null;
}
@InputType('DeliveryContentSelectionInput')
export class DeliveryContentSelectionInput {
  @Field(() => ID) id: string;
  @Field(() => Int, { nullable: true }) version?: number | null;
  @Field(() => ID, { nullable: true }) afterEventId?: string | null;
}
@InputType('DeliveryContentListInput')
export class DeliveryContentListInput extends DeliveryContentProjectInput {
  @Field(() => ID, { nullable: true }) planId?: string | null;
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => String, { nullable: true }) from?: string | null;
  @Field(() => String, { nullable: true }) to?: string | null;
  @Field(() => ID, { nullable: true }) ownerId?: string | null;
  @Field(() => ID, { nullable: true }) accountId?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
}
@InputType('DeliveryContentCalendarInput')
export class DeliveryContentCalendarInput extends DeliveryContentProjectInput {
  @Field() timezone: string;
  @Field() from: string;
  @Field() to: string;
  @Field(() => ID, { nullable: true }) planId?: string | null;
  @Field(() => ID, { nullable: true }) ownerId?: string | null;
  @Field(() => ID, { nullable: true }) accountId?: string | null;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
}
@ObjectType('DeliveryContentDay')
export class DeliveryContentDayDTO {
  @Field() date: string;
  @Field(() => Int) count: number;
}
@ObjectType('DeliveryContentCalendar')
export class DeliveryContentCalendarDTO extends DeliveryContentIdentityDTO {
  @Field() timezone: string;
  @Field() from: string;
  @Field() to: string;
  @Field(() => [DeliveryContentDayDTO]) days: DeliveryContentDayDTO[];
  @Field(() => Int) totalCount: number;
}
@ObjectType('DeliveryContentSummary')
export class DeliveryContentSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) planId: string;
  @Field() planTitle: string;
  @Field(() => ID) projectId: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) currentVersion: number;
  @Field() status: string;
  @Field(() => ID) ownerId: string;
  @Field() ownerName: string;
  @Field(() => ID) reviewerId: string;
  @Field() reviewerName: string;
  @Field() platform: string;
  @Field() accountName: string;
  @Field() plannedAt: string;
  @Field() plannedLocal: string;
  @Field() timezone: string;
  @Field() format: string;
  @Field(() => String, { nullable: true }) lastAttemptAction: string | null;
  @Field(() => String, { nullable: true }) lastAttemptAt: string | null;
}
@ObjectType('DeliveryContentPlatformCount')
export class DeliveryContentPlatformCountDTO {
  @Field() platform: string;
  @Field(() => Int) count: number;
  @Field(() => Int) publishedCount: number;
  @Field(() => Int) reviewCount: number;
}
@ObjectType('DeliveryContentList')
export class DeliveryContentListDTO extends DeliveryContentIdentityDTO {
  @Field(() => [DeliveryContentSummaryDTO]) items: DeliveryContentSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextId: string | null;
  @Field(() => [DeliveryContentPlatformCountDTO])
  platformCounts: DeliveryContentPlatformCountDTO[];
}
@InputType('DeliveryContentDecisionInput')
export class DeliveryContentDecisionInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field() action: string;
  @Field() sourceFingerprint: string;
  @Field() note: string;
  @Field() evidenceUrl: string;
  @Field(() => String, { nullable: true }) publishedAt: string | null;
  @Field(() => ID, { nullable: true }) correctsEventId: string | null;
}
@InputType('DeliveryContentReceiptInput')
export class DeliveryContentReceiptInput {
  @Field(() => ID) requestId: string;
}
@ObjectType('DeliveryContentReceipt')
export class DeliveryContentReceiptDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) actorId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) requestId: string;
  @Field() targetKind: string;
  @Field(() => ID) targetId: string;
  @Field(() => ID, { nullable: true }) planId: string | null;
  @Field(() => Int, { nullable: true }) version: number | null;
  @Field() inputHash: string;
  @Field() action: string;
  @Field() status: string;
  @Field(() => Int) revision: number;
  @Field() note: string;
  @Field() evidenceUrl: string;
  @Field(() => String, { nullable: true }) publishedAt: string | null;
  @Field(() => ID, { nullable: true }) correctsEventId: string | null;
  @Field() actorName: string;
  @Field() createdAt: string;
}
@ObjectType('DeliveryContentReceiptResult')
export class DeliveryContentReceiptResultDTO extends DeliveryContentIdentityDTO {
  @Field(() => DeliveryContentReceiptDTO, { nullable: true })
  receipt: DeliveryContentReceiptDTO | null;
}
@ObjectType('DeliveryContentDetail')
export class DeliveryContentDetailDTO extends DeliveryContentIdentityDTO {
  @Field(() => DeliveryContentSummaryDTO) variant: DeliveryContentSummaryDTO;
  @Field(() => DeliveryContentPlanDTO) plan: DeliveryContentPlanDTO;
  @Field(() => DeliveryContentProjectDTO) project: DeliveryContentProjectDTO;
  @Field(() => Int) selectedVersion: number;
  @Field(() => DeliveryContentSavedBodyDTO) body: DeliveryContentSavedBodyDTO;
  @Field(() => [DeliveryContentReceiptDTO])
  history: DeliveryContentReceiptDTO[];
  @Field(() => DeliveryContentReceiptDTO, { nullable: true })
  latestPublication: DeliveryContentReceiptDTO | null;
  @Field(() => ID, { nullable: true }) nextEventId: string | null;
  @Field() currentSourceFingerprint: string;
  @Field() sourceChanged: boolean;
  @Field() canEdit: boolean;
  @Field(() => [String]) allowedActions: string[];
  @Field(() => String, { nullable: true }) blockedReason: string | null;
}
@ObjectType('DeliveryContentPreview')
export class DeliveryContentPreviewDTO extends DeliveryContentIdentityDTO {
  @Field(() => ID) variantId: string;
  @Field(() => ID) requestId: string;
  @Field() inputHash: string;
  @Field(() => DeliveryContentSavedBodyDTO) body: DeliveryContentSavedBodyDTO;
}
