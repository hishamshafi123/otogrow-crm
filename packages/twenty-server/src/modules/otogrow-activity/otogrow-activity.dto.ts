import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('OtogrowActivityChange')
export class OtogrowActivityChangeDTO {
  @Field() field: string;
  @Field(() => String, { nullable: true }) before: string | null;
  @Field(() => String, { nullable: true }) after: string | null;
}

@ObjectType('OtogrowActivityEvent')
export class OtogrowActivityEventDTO {
  @Field(() => ID) id: string;
  @Field() occurredAt: string;
  @Field(() => ID, { nullable: true }) actorId: string | null;
  @Field() actorName: string;
  @Field() actorType: string;
  @Field(() => ID, { nullable: true }) subjectMemberId: string | null;
  @Field(() => String, { nullable: true }) subjectName: string | null;
  @Field() action: string;
  @Field() category: string;
  @Field() outcome: string;
  @Field() summary: string;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field(() => ID, { nullable: true }) clientId: string | null;
  @Field(() => String, { nullable: true }) clientName: string | null;
  @Field(() => ID, { nullable: true }) taskId: string | null;
  @Field(() => String, { nullable: true }) taskName: string | null;
  @Field(() => String, { nullable: true }) agentName: string | null;
  @Field() sourceType: string;
  @Field(() => ID) sourceId: string;
  @Field(() => [OtogrowActivityChangeDTO]) changes: OtogrowActivityChangeDTO[];
}

@ObjectType('OtogrowActivityOption')
export class OtogrowActivityOptionDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}

@ObjectType('OtogrowActivityFeed')
export class OtogrowActivityFeedDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => [OtogrowActivityEventDTO]) events: OtogrowActivityEventDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field(() => [OtogrowActivityOptionDTO]) people: OtogrowActivityOptionDTO[];
  @Field(() => [OtogrowActivityOptionDTO]) projects: OtogrowActivityOptionDTO[];
  @Field(() => [OtogrowActivityOptionDTO]) clients: OtogrowActivityOptionDTO[];
  @Field(() => String, { nullable: true }) coverageStartedAt: string | null;
}

@InputType('OtogrowActivityInput')
export class OtogrowActivityFilterInput {
  @Field(() => ID, { nullable: true }) personId?: string;
  @Field(() => ID, { nullable: true }) projectId?: string;
  @Field(() => ID, { nullable: true }) clientId?: string;
  @Field(() => String, { nullable: true }) category?: string;
  @Field(() => String, { nullable: true }) action?: string;
  @Field(() => String, { nullable: true }) outcome?: string;
  @Field(() => String, { nullable: true }) from?: string;
  @Field(() => String, { nullable: true }) through?: string;
  @Field(() => String, { nullable: true }) cursor?: string;
  @Field(() => Int, { nullable: true }) limit?: number;
}
