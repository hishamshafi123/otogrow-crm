import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliverySeoMetricInput')
@ObjectType('DeliverySeoMetric')
export class DeliverySeoMetricDTO {
  @Field(() => ID) id: string;
  @Field() key: string;
  @Field() label: string;
  @Field() unit: string;
  @Field(() => String, { nullable: true }) value: string | null;
  @Field() unknownReason: string;
  @Field() source: string;
  @Field() sourceUrl: string;
  @Field() property: string;
  @Field() segment: string;
  @Field() definition: string;
  @Field() observedAt: string;
}
@InputType('DeliverySeoTaskReferenceInput')
@ObjectType('DeliverySeoTaskReference')
export class DeliverySeoTaskReferenceDTO {
  @Field(() => ID) taskId: string;
  @Field(() => Int) revision: number;
}
@InputType('DeliverySeoEvidenceInput')
@ObjectType('DeliverySeoEvidence')
export class DeliverySeoEvidenceDTO {
  @Field() label: string;
  @Field() url: string;
  @Field() note: string;
}
@InputType('DeliverySeoBodyInput')
@ObjectType('DeliverySeoBody')
export class DeliverySeoBodyDTO {
  @Field() title: string;
  @Field(() => ID) ownerId: string;
  @Field() period: string;
  @Field() periodStart: string;
  @Field() periodEnd: string;
  @Field() timezone: string;
  @Field() summary: string;
  @Field() workNotes: string;
  @Field(() => [DeliverySeoTaskReferenceDTO])
  tasks: DeliverySeoTaskReferenceDTO[];
  @Field(() => [DeliverySeoEvidenceDTO]) evidence: DeliverySeoEvidenceDTO[];
  @Field(() => [DeliverySeoMetricDTO]) metrics: DeliverySeoMetricDTO[];
  @Field(() => ID, { nullable: true }) comparisonId: string | null;
  @Field(() => Int, { nullable: true }) comparisonVersion: number | null;
}
@InputType('DeliverySeoProjectsInput')
export class DeliverySeoProjectsInput {
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
}
@InputType('DeliverySeoReportsInput')
export class DeliverySeoReportsInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => String, { nullable: true }) status?: string | null;
}
@InputType('DeliverySeoSelectionInput')
export class DeliverySeoSelectionInput {
  @Field(() => ID) id: string;
  @Field(() => Int, { nullable: true }) version?: number | null;
  @Field(() => ID, { nullable: true }) afterEventId?: string | null;
}
@InputType('DeliverySeoChoicesInput')
export class DeliverySeoChoicesInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) afterTaskId?: string | null;
  @Field(() => ID, { nullable: true }) afterMemberId?: string | null;
}
@InputType('DeliverySeoSaveInput')
export class DeliverySeoSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) projectId: string;
  @Field(() => Int) projectRevision: number;
  @Field(() => ID, { nullable: true }) expectedCompanyId: string | null;
  @Field(() => DeliverySeoBodyDTO) body: DeliverySeoBodyDTO;
}
@InputType('DeliverySeoDecisionInput')
export class DeliverySeoDecisionInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
  @Field() action: string;
  @Field() note: string;
}
@InputType('DeliverySeoReceiptInput')
export class DeliverySeoReceiptInput {
  @Field(() => ID) requestId: string;
}
@ObjectType('DeliverySeoActor')
export class DeliverySeoActorDTO {
  @Field(() => ID) memberId: string;
  @Field() isManager: boolean;
  @Field() isAdmin: boolean;
}
@ObjectType({ isAbstract: true })
export class DeliverySeoIdentityDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() scope: string;
  @Field() observedAt: string;
  @Field(() => DeliverySeoActorDTO) actor: DeliverySeoActorDTO;
}
@ObjectType('DeliverySeoProject')
export class DeliverySeoProjectDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) revision: number;
  @Field(() => ID, { nullable: true }) companyId: string | null;
}
@ObjectType('DeliverySeoProjects')
export class DeliverySeoProjectsDTO extends DeliverySeoIdentityDTO {
  @Field(() => [DeliverySeoProjectDTO]) items: DeliverySeoProjectDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextId: string | null;
}
@ObjectType('DeliverySeoReportSummary')
export class DeliverySeoReportSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) projectId: string;
  @Field() title: string;
  @Field() status: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) currentVersion: number;
  @Field(() => Int, { nullable: true }) approvedVersion: number | null;
  @Field() periodStart: string;
  @Field() periodEnd: string;
  @Field(() => ID) createdBy: string;
  @Field(() => ID) ownerId: string;
  @Field() ownerName: string;
  @Field() createdByName: string;
}
@ObjectType('DeliverySeoReports')
export class DeliverySeoReportsDTO extends DeliverySeoIdentityDTO {
  @Field(() => DeliverySeoProjectDTO) project: DeliverySeoProjectDTO;
  @Field(() => [DeliverySeoReportSummaryDTO])
  items: DeliverySeoReportSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => ID, { nullable: true }) nextId: string | null;
}
@ObjectType('DeliverySeoTask')
export class DeliverySeoTaskDTO {
  @Field(() => ID) taskId: string;
  @Field() title: string;
  @Field(() => Int) revision: number;
  @Field() state: string;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => String, { nullable: true }) verificationSummary: string | null;
  @Field(() => ID, { nullable: true }) verificationRunId: string | null;
}
@ObjectType('DeliverySeoMember')
export class DeliverySeoMemberDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}
@ObjectType('DeliverySeoChoices')
export class DeliverySeoChoicesDTO extends DeliverySeoIdentityDTO {
  @Field(() => [DeliverySeoMemberDTO]) members: DeliverySeoMemberDTO[];
  @Field(() => [DeliverySeoTaskDTO]) tasks: DeliverySeoTaskDTO[];
  @Field(() => Int) totalTaskCount: number;
  @Field(() => ID, { nullable: true }) nextTaskId: string | null;
  @Field(() => ID, { nullable: true }) nextMemberId: string | null;
}
@ObjectType('DeliverySeoReceipt')
export class DeliverySeoReceiptDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) actorId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() inputHash: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) reportId: string;
  @Field() action: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) version: number;
  @Field() status: string;
  @Field() actorName: string;
  @Field() note: string;
  @Field() createdAt: string;
}
@ObjectType('DeliverySeoComparison')
export class DeliverySeoComparisonDTO {
  @Field(() => ID) metricId: string;
  @Field() label: string;
  @Field(() => String, { nullable: true }) currentValue: string | null;
  @Field(() => String, { nullable: true }) previousValue: string | null;
  @Field(() => String, { nullable: true }) delta: string | null;
  @Field(() => String, { nullable: true }) reason: string | null;
}
@ObjectType('DeliverySeoReport')
export class DeliverySeoReportDTO extends DeliverySeoIdentityDTO {
  @Field(() => DeliverySeoProjectDTO) project: DeliverySeoProjectDTO;
  @Field(() => DeliverySeoReportSummaryDTO) report: DeliverySeoReportSummaryDTO;
  @Field(() => Int) version: number;
  @Field(() => DeliverySeoBodyDTO) body: DeliverySeoBodyDTO;
  @Field(() => [DeliverySeoTaskDTO]) taskSnapshots: DeliverySeoTaskDTO[];
  @Field(() => [DeliverySeoComparisonDTO])
  comparison: DeliverySeoComparisonDTO[];
  @Field(() => String, { nullable: true }) comparisonTitle: string | null;
  @Field(() => String, { nullable: true }) comparisonPeriodStart: string | null;
  @Field(() => String, { nullable: true }) comparisonPeriodEnd: string | null;
  @Field(() => String, { nullable: true }) comparisonTimezone: string | null;
  @Field(() => [DeliverySeoReceiptDTO]) history: DeliverySeoReceiptDTO[];
  @Field(() => ID, { nullable: true }) nextEventId: string | null;
  @Field() canEdit: boolean;
  @Field() canSubmit: boolean;
  @Field() canReview: boolean;
  @Field() clientAnchorChanged: boolean;
}
@ObjectType('DeliverySeoReportState')
export class DeliverySeoReportStateDTO extends DeliverySeoIdentityDTO {
  @Field(() => DeliverySeoProjectDTO) project: DeliverySeoProjectDTO;
  @Field(() => DeliverySeoReportSummaryDTO) report: DeliverySeoReportSummaryDTO;
  @Field() canEdit: boolean;
  @Field() canSubmit: boolean;
  @Field() canReview: boolean;
  @Field() clientAnchorChanged: boolean;
}
