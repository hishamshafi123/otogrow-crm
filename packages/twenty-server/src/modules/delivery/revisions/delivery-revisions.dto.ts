import { Field, ID, InputType, Int, Float, ObjectType } from '@nestjs/graphql';
@InputType('DeliveryRevisionsInput')
export class DeliveryRevisionsInput {
  @Field(() => ID) taskId: string;
  @Field(() => Int, { nullable: true }) beforeRound?: number;
}
@InputType('DeliveryRevisionSaveInput')
export class DeliveryRevisionSaveInput {
  @Field(() => ID) taskId: string;
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() cause: string;
  @Field(() => Int, { nullable: true }) effortMinutes: number | null;
  @Field(() => Float, { nullable: true }) internalCost?: number | null;
  @Field(() => Float, { nullable: true }) proposedCharge?: number | null;
  @Field(() => String, { nullable: true }) currency?: string | null;
}
@ObjectType('DeliveryRevision')
export class DeliveryRevisionDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) round: number;
  @Field(() => Int) revision: number;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field() source: string;
  @Field() reason: string;
  @Field() cause: string;
  @Field() createdAt: string;
  @Field(() => Int, { nullable: true }) effortMinutes: number | null;
  @Field(() => Float, { nullable: true }) internalCost: number | null;
  @Field(() => Float, { nullable: true }) proposedCharge: number | null;
  @Field(() => String, { nullable: true }) currency: string | null;
}
@ObjectType('DeliveryRevisions')
export class DeliveryRevisionsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field() canManage: boolean;
  @Field() canReadFinance: boolean;
  @Field() canManageFinance: boolean;
  @Field(() => Int) total: number;
  @Field(() => Int, { nullable: true }) nextBeforeRound: number | null;
  @Field(() => [DeliveryRevisionDTO]) rounds: DeliveryRevisionDTO[];
}
@InputType('DeliveryRevisionCostsInput')
export class DeliveryRevisionCostsInput {
  @Field() startDate: string;
  @Field() endDate: string;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
}
@ObjectType('DeliveryRevisionCostGroup')
export class DeliveryRevisionCostGroupDTO {
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field() cause: string;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field(() => Int) rounds: number;
  @Field(() => Int) missingCostCount: number;
  @Field(() => Int) missingEffortCount: number;
  @Field(() => Float) recordedCost: number;
  @Field(() => Float) proposedCharges: number;
  @Field(() => Float) recordedEffortMinutes: number;
}
@ObjectType('DeliveryRevisionCosts')
export class DeliveryRevisionCostsDTO {
  @Field() startDate: string;
  @Field() endDate: string;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => [DeliveryRevisionCostGroupDTO])
  groups: DeliveryRevisionCostGroupDTO[];
}
