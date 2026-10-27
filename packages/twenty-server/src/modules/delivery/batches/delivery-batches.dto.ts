import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryCommitmentChangeDTO } from 'src/modules/delivery/commitments/delivery-commitments.dto';
@InputType('DeliveryBatchesInput')
export class DeliveryBatchesInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) batchId?: string;
  @Field(() => Boolean, { nullable: true }) includeClosed?: boolean;
  @Field(() => String, { nullable: true }) cursor?: string;
  @Field(() => String, { nullable: true }) taskCursor?: string;
  @Field(() => String, { nullable: true }) historyCursor?: string;
  @Field(() => String, { nullable: true }) search?: string;
  @Field(() => Int, { nullable: true }) limit?: number;
}
@InputType('DeliveryBatchSaveInput')
export class DeliveryBatchSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID, { nullable: true }) periodId: string | null;
  @Field(() => Int) revision: number;
  @Field() label: string;
  @Field(() => String, { nullable: true }) startDate: string | null;
  @Field(() => String, { nullable: true }) endDate: string | null;
  @Field() timezone: string;
  @Field() reason: string;
}
@InputType('DeliveryBatchStateInput')
export class DeliveryBatchStateInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID) batchId: string;
  @Field(() => Int) revision: number;
  @Field() closed: boolean;
  @Field() reason: string;
}
@InputType('DeliveryBatchItemInput')
export class DeliveryBatchItemInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID) batchId: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) taskId: string;
  @Field(() => Int, { nullable: true }) taskRevision: number | null;
  @Field() active: boolean;
  @Field() concept: string;
  @Field() reason: string;
}
@ObjectType('DeliveryBatch')
export class DeliveryBatchDTO {
  @Field(() => ID) id: string;
  @Field() label: string;
  @Field(() => ID, { nullable: true }) periodId: string | null;
  @Field(() => String, { nullable: true }) startDate: string | null;
  @Field(() => String, { nullable: true }) endDate: string | null;
  @Field() timezone: string;
  @Field() closed: boolean;
  @Field(() => Int) revision: number;
}
@ObjectType('DeliveryBatchTask')
export class DeliveryBatchTaskDTO {
  @Field(() => ID) taskId: string;
  @Field() title: string;
  @Field() concept: string;
  @Field() available: boolean;
  @Field(() => String, { nullable: true }) state: string | null;
  @Field(() => Int, { nullable: true }) taskRevision: number | null;
  @Field(() => String, { nullable: true }) assigneeName: string | null;
  @Field(() => String, { nullable: true }) reviewerName: string | null;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field() unit: string;
  @Field() approved: boolean;
  @Field() fulfilled: boolean;
}
@ObjectType('DeliveryBatchCount')
export class DeliveryBatchCountDTO {
  @Field() key: string;
  @Field(() => Int) total: number;
  @Field(() => Int) approved: number;
  @Field(() => Int) fulfilled: number;
}
@ObjectType('DeliveryBatchEvent')
export class DeliveryBatchEventDTO {
  @Field(() => ID) id: string;
  @Field() actorName: string;
  @Field() action: string;
  @Field() occurredAt: string;
  @Field(() => ID, { nullable: true }) taskId: string | null;
  @Field(() => String, { nullable: true }) taskName: string | null;
  @Field() reason: string;
  @Field(() => [DeliveryCommitmentChangeDTO])
  changes: DeliveryCommitmentChangeDTO[];
}
@ObjectType('DeliveryBatchTaskOption')
export class DeliveryBatchTaskOptionDTO {
  @Field(() => ID) taskId: string;
  @Field() title: string;
  @Field(() => Int) taskRevision: number;
}
@ObjectType('DeliveryBatchPeriodOption')
export class DeliveryBatchPeriodOptionDTO {
  @Field(() => ID) id: string;
  @Field() label: string;
}
@ObjectType('DeliveryBatches')
export class DeliveryBatchesDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) projectId: string;
  @Field() canManage: boolean;
  @Field(() => [DeliveryBatchDTO]) batches: DeliveryBatchDTO[];
  @Field(() => DeliveryBatchDTO, { nullable: true })
  selected: DeliveryBatchDTO | null;
  @Field(() => [DeliveryBatchTaskDTO]) tasks: DeliveryBatchTaskDTO[];
  @Field(() => [DeliveryBatchCountDTO]) counts: DeliveryBatchCountDTO[];
  @Field(() => [DeliveryBatchEventDTO]) history: DeliveryBatchEventDTO[];
  @Field(() => [DeliveryBatchTaskOptionDTO])
  taskOptions: DeliveryBatchTaskOptionDTO[];
  @Field() moreTaskOptions: boolean;
  @Field(() => [DeliveryBatchPeriodOptionDTO])
  periods: DeliveryBatchPeriodOptionDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field(() => String, { nullable: true }) nextTaskCursor: string | null;
  @Field(() => String, { nullable: true }) nextHistoryCursor: string | null;
}
