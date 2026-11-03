import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryReleaseWorkInput')
@ObjectType('DeliveryReleaseWork')
export class DeliveryReleaseWorkDTO {
  @Field(() => ID) taskId: string;
  @Field(() => Int) revision: number;
  @Field() issueUrl: string;
  @Field() pullRequestUrl: string;
  @Field(() => [ID]) blockedByTaskIds: string[];
}
@InputType('DeliveryReleaseCheckInput')
@ObjectType('DeliveryReleaseCheck')
export class DeliveryReleaseCheckDTO {
  @Field(() => ID) id: string;
  @Field() kind: string;
  @Field() label: string;
  @Field() status: string;
  @Field() evidenceUrl: string;
  @Field() note: string;
}
@InputType('DeliveryReleaseBodyInput')
@ObjectType('DeliveryReleaseBody')
export class DeliveryReleaseBodyDTO {
  @Field() title: string;
  @Field(() => ID) ownerId: string;
  @Field() targetDate: string;
  @Field() repositoryUrl: string;
  @Field() commitSha: string;
  @Field() summary: string;
  @Field() acceptanceCriteria: string;
  @Field() rollbackPlan: string;
  @Field(() => [DeliveryReleaseWorkDTO]) work: DeliveryReleaseWorkDTO[];
  @Field(() => [DeliveryReleaseCheckDTO]) checks: DeliveryReleaseCheckDTO[];
}
@ObjectType('DeliveryReleaseTask')
export class DeliveryReleaseTaskDTO {
  @Field(() => ID) taskId: string;
  @Field(() => Int) revision: number;
  @Field() title: string;
  @Field(() => ID, { nullable: true }) assigneeId: string | null;
  @Field() state: string;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => ID, { nullable: true }) submittedBy: string | null;
  @Field(() => ID, { nullable: true }) reviewedBy: string | null;
  @Field(() => String, { nullable: true }) reviewedAt: string | null;
  @Field() approved: boolean;
  @Field() sourceHash: string;
}
@ObjectType('DeliveryReleaseSavedBody')
export class DeliveryReleaseSavedBodyDTO extends DeliveryReleaseBodyDTO {
  @Field(() => [DeliveryReleaseTaskDTO]) tasks: DeliveryReleaseTaskDTO[];
  @Field() sourceFingerprint: string;
}
@InputType('DeliveryReleaseProjectsInput')
export class DeliveryReleaseProjectsInput {
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
}
@InputType('DeliveryReleaseListInput')
export class DeliveryReleaseListInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => String, { nullable: true }) status?: string | null;
}
@InputType('DeliveryReleaseSelectionInput')
export class DeliveryReleaseSelectionInput {
  @Field(() => ID) id: string;
  @Field(() => Int, { nullable: true }) version?: number | null;
  @Field(() => ID, { nullable: true }) afterEventId?: string | null;
}
@InputType('DeliveryReleaseChoicesInput')
export class DeliveryReleaseChoicesInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) afterTaskId?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
  @Field(() => [ID], { nullable: true }) selectedTaskIds?: string[] | null;
}
@InputType('DeliveryReleaseSaveInput')
export class DeliveryReleaseSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) projectId: string;
  @Field(() => Int) projectRevision: number;
  @Field(() => ID, { nullable: true }) expectedCompanyId: string | null;
  @Field(() => DeliveryReleaseBodyDTO) body: DeliveryReleaseBodyDTO;
}
@InputType('DeliveryReleaseDecisionInput')
export class DeliveryReleaseDecisionInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field() action: string;
  @Field() sourceFingerprint: string;
  @Field() note: string;
  @Field() evidenceUrl: string;
  @Field() commitSha: string;
  @Field() environment: string;
}
@InputType('DeliveryReleaseReceiptInput')
export class DeliveryReleaseReceiptInput {
  @Field(() => ID) requestId: string;
}
@ObjectType('DeliveryReleaseIdentity')
export class DeliveryReleaseIdentityDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() scope: string;
  @Field() observedAt: string;
  @Field() isManager: boolean;
}
@ObjectType('DeliveryReleaseProject')
export class DeliveryReleaseProjectDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) revision: number;
  @Field(() => ID, { nullable: true }) companyId: string | null;
}
@ObjectType('DeliveryReleaseProjects')
export class DeliveryReleaseProjectsDTO extends DeliveryReleaseIdentityDTO {
  @Field(() => [DeliveryReleaseProjectDTO]) items: DeliveryReleaseProjectDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextId: string | null;
}
@ObjectType('DeliveryReleaseSummary')
export class DeliveryReleaseSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field() title: string;
  @Field() ownerName: string;
  @Field(() => ID) ownerId: string;
  @Field(() => ID) createdBy: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) currentVersion: number;
  @Field() status: string;
  @Field() targetDate: string;
}
@ObjectType('DeliveryReleaseList')
export class DeliveryReleaseListDTO extends DeliveryReleaseIdentityDTO {
  @Field(() => DeliveryReleaseProjectDTO) project: DeliveryReleaseProjectDTO;
  @Field(() => [DeliveryReleaseSummaryDTO]) items: DeliveryReleaseSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextId: string | null;
}
@ObjectType('DeliveryReleaseReceipt')
export class DeliveryReleaseReceiptDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) actorId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) releaseId: string;
  @Field() inputHash: string;
  @Field() action: string;
  @Field() note: string;
  @Field() evidenceUrl: string;
  @Field() environment: string;
  @Field() commitSha: string;
  @Field() actorName: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) version: number;
  @Field() status: string;
  @Field() createdAt: string;
}
@ObjectType('DeliveryReleaseReceiptResult')
export class DeliveryReleaseReceiptResultDTO extends DeliveryReleaseIdentityDTO {
  @Field(() => DeliveryReleaseReceiptDTO, { nullable: true })
  receipt: DeliveryReleaseReceiptDTO | null;
}
@ObjectType('DeliveryReleaseDetail')
export class DeliveryReleaseDetailDTO extends DeliveryReleaseIdentityDTO {
  @Field(() => DeliveryReleaseSummaryDTO) release: DeliveryReleaseSummaryDTO;
  @Field(() => DeliveryReleaseProjectDTO) project: DeliveryReleaseProjectDTO;
  @Field(() => Int) selectedVersion: number;
  @Field(() => DeliveryReleaseSavedBodyDTO) body: DeliveryReleaseSavedBodyDTO;
  @Field(() => [DeliveryReleaseReceiptDTO])
  history: DeliveryReleaseReceiptDTO[];
  @Field(() => ID, { nullable: true }) nextEventId: string | null;
  @Field() currentSourceFingerprint: string;
  @Field() sourceChanged: boolean;
  @Field() canEdit: boolean;
  @Field() canSubmit: boolean;
  @Field() canReview: boolean;
  @Field() canRecordDeployment: boolean;
  @Field() canRecordHandover: boolean;
  @Field() canRecordAcceptance: boolean;
  @Field(() => String, { nullable: true }) reviewBlockedReason: string | null;
}
@ObjectType('DeliveryReleasePreview')
export class DeliveryReleasePreviewDTO extends DeliveryReleaseIdentityDTO {
  @Field(() => ID) releaseId: string;
  @Field(() => ID) requestId: string;
  @Field() inputHash: string;
  @Field() ownerName: string;
  @Field(() => DeliveryReleaseSavedBodyDTO) body: DeliveryReleaseSavedBodyDTO;
  @Field(() => String, { nullable: true }) reviewBlockedReason: string | null;
}
@ObjectType('DeliveryReleaseOwner')
export class DeliveryReleaseOwnerDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}
@ObjectType('DeliveryReleaseChoices')
export class DeliveryReleaseChoicesDTO extends DeliveryReleaseIdentityDTO {
  @Field(() => DeliveryReleaseProjectDTO) project: DeliveryReleaseProjectDTO;
  @Field(() => [DeliveryReleaseOwnerDTO]) owners: DeliveryReleaseOwnerDTO[];
  @Field(() => [DeliveryReleaseTaskDTO]) tasks: DeliveryReleaseTaskDTO[];
  @Field(() => [DeliveryReleaseTaskDTO])
  selectedTasks: DeliveryReleaseTaskDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextTaskId: string | null;
}
