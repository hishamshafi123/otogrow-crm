import { Field, ID, InputType, ObjectType } from '@nestjs/graphql';
@InputType('DeliveryHandoffPreviewInput')
export class DeliveryHandoffPreviewInput {
  @Field(() => ID) opportunityId: string;
  @Field(() => ID) quoteId: string;
}
@InputType('DeliveryHandoffCreateInput')
export class DeliveryHandoffCreateInput extends DeliveryHandoffPreviewInput {
  @Field() fingerprint: string;
  @Field() projectName: string;
  @Field(() => ID) managerId: string;
  @Field(() => ID) reviewerId: string;
  @Field(() => [ID]) memberIds: string[];
  @Field(() => [String]) services: string[];
  @Field() billing: string;
  @Field() contact: string;
  @Field(() => String, { nullable: true }) scheduledDate?: string | null;
}
@ObjectType('DeliveryHandoffQuote')
export class DeliveryHandoffQuoteDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}
@ObjectType('DeliveryHandoffCandidate')
export class DeliveryHandoffCandidateDTO extends DeliveryHandoffQuoteDTO {
  @Field() hasCompany: boolean;
  @Field(() => [DeliveryHandoffQuoteDTO]) quotes: DeliveryHandoffQuoteDTO[];
}
@ObjectType('DeliveryHandoffSource')
export class DeliveryHandoffSourceDTO {
  @Field(() => ID) opportunityId: string;
  @Field() opportunityName: string;
  @Field(() => ID) companyId: string;
  @Field() companyName: string;
  @Field(() => ID) quoteId: string;
  @Field() quoteNumber: string;
  @Field() scope: string;
  @Field() fingerprint: string;
  @Field(() => String, { nullable: true }) totalAmountMicros: string | null;
  @Field(() => String, { nullable: true }) currency: string | null;
}
@ObjectType('DeliveryHandoff')
export class DeliveryHandoffDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) opportunityId: string;
  @Field(() => ID) projectId: string;
  @Field(() => ID) engagementId: string;
  @Field(() => ID) managerId: string;
  @Field(() => ID) reviewerId: string;
  @Field(() => [ID]) setupTaskIds: string[];
  @Field() createdAt: string;
}
@ObjectType('DeliveryHandoffDirectory')
export class DeliveryHandoffDirectoryDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() search: string;
  @Field() hasMore: boolean;
  @Field(() => [DeliveryHandoffCandidateDTO])
  opportunities: DeliveryHandoffCandidateDTO[];
  @Field(() => [DeliveryHandoffDTO]) handoffs: DeliveryHandoffDTO[];
}
@ObjectType('DeliveryHandoffPreview')
export class DeliveryHandoffPreviewDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => DeliveryHandoffSourceDTO) source: DeliveryHandoffSourceDTO;
}
