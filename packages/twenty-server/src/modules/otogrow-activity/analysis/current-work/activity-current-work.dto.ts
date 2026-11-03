import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { OtogrowActivityIdentityDTO } from 'src/modules/otogrow-activity/otogrow-activity.dto';

@InputType('OtogrowActivityCurrentWorkScopeInput')
export class OtogrowActivityCurrentWorkScopeInput {
  @Field(() => ID, { nullable: true }) personId?: string | null;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field(() => ID, { nullable: true }) clientId?: string | null;
}
@InputType('OtogrowActivityCurrentTaskInput')
export class OtogrowActivityCurrentTaskInput {
  @Field(() => ID) taskId: string;
  @Field(() => OtogrowActivityCurrentWorkScopeInput, { nullable: true })
  scope?: OtogrowActivityCurrentWorkScopeInput | null;
}
@ObjectType('OtogrowActivityCurrentWorkScope')
export class OtogrowActivityCurrentWorkScopeDTO {
  @Field(() => ID, { nullable: true }) personId: string | null;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => ID, { nullable: true }) clientId: string | null;
}
@ObjectType('OtogrowActivityCurrentTaskFacts')
export class OtogrowActivityCurrentTaskFactsDTO {
  @Field(() => ID) taskId: string;
  @Field() title: string;
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field(() => ID, { nullable: true }) clientId: string | null;
  @Field(() => String, { nullable: true }) clientName: string | null;
  @Field(() => Int) taskRevision: number;
  @Field() state: string;
  @Field(() => String, { nullable: true }) blocker: string | null;
  @Field(() => ID, { nullable: true }) ownerId: string | null;
  @Field(() => String, { nullable: true }) ownerName: string | null;
  @Field(() => String, { nullable: true }) dueAt: string | null;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => String, { nullable: true }) submittedAt: string | null;
  @Field(() => ID, { nullable: true }) primaryReviewerId: string | null;
  @Field(() => String, { nullable: true }) primaryReviewerName: string | null;
  @Field(() => ID, { nullable: true }) effectiveReviewerId: string | null;
  @Field(() => String, { nullable: true }) effectiveReviewerName: string | null;
  @Field() reviewerState: string;
  @Field() assignmentMode: string;
  @Field(() => Int) assignmentRevision: number;
  @Field(() => [String]) warnings: string[];
  @Field() detailsTruncated: boolean;
  @Field() href: string;
}
@ObjectType('OtogrowActivityCurrentWorkSnapshot')
export class OtogrowActivityCurrentWorkSnapshotDTO {
  @Field() capturedAt: string;
  @Field(() => OtogrowActivityCurrentWorkScopeDTO)
  scope: OtogrowActivityCurrentWorkScopeDTO;
  @Field(() => Int) totalCount: number;
  @Field(() => Int) includedCount: number;
  @Field(() => Int) omittedCount: number;
  @Field(() => Int) truncatedFieldCount: number;
  @Field(() => Int) omittedBytes: number;
  @Field() complete: boolean;
  @Field(() => [OtogrowActivityCurrentTaskFactsDTO])
  items: OtogrowActivityCurrentTaskFactsDTO[];
  @Field(() => [String]) limitations: string[];
  @Field() fingerprint: string;
  @Field() nativeVisibilityFingerprint: string;
}
@ObjectType('OtogrowActivityCurrentTask')
export class OtogrowActivityCurrentTaskDTO extends OtogrowActivityIdentityDTO {
  @Field() capturedAt: string;
  @Field(() => OtogrowActivityCurrentWorkScopeDTO)
  scopeSelection: OtogrowActivityCurrentWorkScopeDTO;
  @Field(() => OtogrowActivityCurrentTaskFactsDTO, { nullable: true })
  task: OtogrowActivityCurrentTaskFactsDTO | null;
  @Field(() => String, { nullable: true }) unavailableReason: string | null;
}
