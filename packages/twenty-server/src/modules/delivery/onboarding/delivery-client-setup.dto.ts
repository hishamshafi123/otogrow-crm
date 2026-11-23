import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryClientSetupContextInput')
export class DeliveryClientSetupContextInput {
  @Field(() => String, { nullable: true }) companySearch?: string | null;
  @Field(() => ID, { nullable: true }) companyId?: string | null;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
}
@InputType('DeliveryClientSetupQuestionInput')
export class DeliveryClientSetupQuestionInput {
  @Field(() => ID) id: string;
  @Field() label: string;
  @Field() required: boolean;
}
@InputType('DeliveryClientSetupAdvertisingInput')
export class DeliveryClientSetupAdvertisingInput {
  @Field(() => ID) managerId: string;
  @Field(() => ID) marketerId: string;
  @Field() currency: string;
  @Field() channel: string;
  @Field() period: string;
}
@InputType('DeliveryClientSetupPlanInput')
export class DeliveryClientSetupPlanInput {
  @Field() name: string;
  @Field(() => [String]) services: string[];
  @Field() billing: string;
  @Field() scope: string;
  @Field() allowance: string;
  @Field() contact: string;
  @Field(() => [DeliveryClientSetupQuestionInput])
  fields: DeliveryClientSetupQuestionInput[];
  @Field(() => DeliveryClientSetupAdvertisingInput, { nullable: true })
  advertising: DeliveryClientSetupAdvertisingInput | null;
}
@InputType('DeliveryClientSetupTaskInput')
export class DeliveryClientSetupTaskInput {
  @Field() title: string;
  @Field() brief: string;
  @Field() service: string;
  @Field(() => ID) assigneeId: string;
  @Field(() => ID) reviewerId: string;
  @Field() priority: string;
  @Field(() => String, { nullable: true }) scheduledDate: string | null;
  @Field(() => String, { nullable: true }) dueAt: string | null;
  @Field(() => [String]) checklist: string[];
  @Field(() => [String]) evidence: string[];
}
@InputType('DeliveryClientSetupCreateInput')
export class DeliveryClientSetupCreateInput {
  @Field(() => ID) requestId: string;
  @Field(() => ID) companyId: string;
  @Field() companySourceToken: string;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => Int, { nullable: true }) projectRevision: number | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field(() => [ID]) memberIds: string[];
  @Field(() => ID, { nullable: true }) engagementId: string | null;
  @Field(() => Int, { nullable: true }) engagementRevision: number | null;
  @Field(() => DeliveryClientSetupPlanInput, { nullable: true })
  plan: DeliveryClientSetupPlanInput | null;
  @Field(() => DeliveryClientSetupTaskInput, { nullable: true })
  firstTask: DeliveryClientSetupTaskInput | null;
}
@InputType('DeliveryClientSetupReceiptInput')
export class DeliveryClientSetupReceiptInput {
  @Field(() => ID) requestId: string;
}
@ObjectType('DeliveryClientSetupCompany')
export class DeliveryClientSetupCompanyDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() sourceToken: string;
}
@ObjectType('DeliveryClientSetupProject')
export class DeliveryClientSetupProjectDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) revision: number;
  @Field(() => [ID]) memberIds: string[];
}
@ObjectType('DeliveryClientSetupMember')
export class DeliveryClientSetupMemberDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() access: string;
}
@ObjectType('DeliveryClientSetupQuestion')
export class DeliveryClientSetupQuestionDTO {
  @Field(() => ID) id: string;
  @Field() label: string;
  @Field() required: boolean;
}
@ObjectType('DeliveryClientSetupAdvertising')
export class DeliveryClientSetupAdvertisingDTO {
  @Field(() => ID) managerId: string;
  @Field(() => ID) marketerId: string;
  @Field() currency: string;
  @Field() channel: string;
  @Field() period: string;
}
@ObjectType('DeliveryClientSetupPlan')
export class DeliveryClientSetupPlanDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) projectId: string;
  @Field() name: string;
  @Field(() => [String]) services: string[];
  @Field() billing: string;
  @Field() scope: string;
  @Field() allowance: string;
  @Field() contact: string;
  @Field(() => [DeliveryClientSetupQuestionDTO])
  fields: DeliveryClientSetupQuestionDTO[];
  @Field(() => DeliveryClientSetupAdvertisingDTO, { nullable: true })
  advertising: DeliveryClientSetupAdvertisingDTO | null;
}
@ObjectType('DeliveryClientSetupContext')
export class DeliveryClientSetupContextDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field() companySearch: string;
  @Field(() => [DeliveryClientSetupCompanyDTO])
  companies: DeliveryClientSetupCompanyDTO[];
  @Field() companiesHasMore: boolean;
  @Field(() => DeliveryClientSetupCompanyDTO, { nullable: true })
  selectedCompany: DeliveryClientSetupCompanyDTO | null;
  @Field(() => [DeliveryClientSetupProjectDTO])
  projects: DeliveryClientSetupProjectDTO[];
  @Field(() => [DeliveryClientSetupMemberDTO])
  members: DeliveryClientSetupMemberDTO[];
  @Field(() => [DeliveryClientSetupPlanDTO])
  servicePlans: DeliveryClientSetupPlanDTO[];
}
@ObjectType('DeliveryClientSetupReceipt')
export class DeliveryClientSetupReceiptDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) companyId: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID) engagementId: string;
  @Field(() => ID, { nullable: true }) taskId: string | null;
  @Field() createdAt: string;
  @Field() replayed: boolean;
  @Field() reusedProject: boolean;
  @Field() reusedEngagement: boolean;
}

@ObjectType('DeliveryClientServiceCatalog')
export class DeliveryClientServiceCatalogDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => [String]) services: string[];
}
