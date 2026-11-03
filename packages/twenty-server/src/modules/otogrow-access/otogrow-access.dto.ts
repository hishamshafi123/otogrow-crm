import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('OtogrowAccessGrant')
export class OtogrowAccessGrantDTO {
  @Field() capability: string;
  @Field() sourceId: string;
  @Field() sourceName: string;
  @Field() sourceType: string;
}

@ObjectType('OtogrowAccess')
export class OtogrowAccessDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => [ID]) roleIds: string[];
  @Field() nativeAdministrator: boolean;
  @Field(() => [String]) capabilities: string[];
  @Field(() => [OtogrowAccessGrantDTO]) grants: OtogrowAccessGrantDTO[];
}

@ObjectType('OtogrowRole')
export class OtogrowRoleDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() description: string;
  @Field(() => [String]) capabilities: string[];
  @Field(() => Int) revision: number;
}

@ObjectType('OtogrowProjectMembership')
export class OtogrowProjectMembershipDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}

@ObjectType('OtogrowRoleMember')
export class OtogrowRoleMemberDTO {
  @Field(() => ID) memberId: string;
  @Field() name: string;
  @Field(() => [ID]) roleIds: string[];
  @Field(() => Int) revision: number;
  @Field(() => OtogrowAccessDTO) access: OtogrowAccessDTO;
  @Field(() => [OtogrowProjectMembershipDTO])
  projectMemberships: OtogrowProjectMembershipDTO[];
}

@ObjectType('OtogrowRoleDirectory')
export class OtogrowRoleDirectoryDTO {
  @Field(() => OtogrowAccessDTO) actor: OtogrowAccessDTO;
  @Field(() => [OtogrowRoleDTO]) roles: OtogrowRoleDTO[];
  @Field(() => [OtogrowRoleMemberDTO]) members: OtogrowRoleMemberDTO[];
}

@InputType('OtogrowRoleInput')
export class OtogrowRoleInput {
  @Field(() => ID, { nullable: true }) id?: string;
  @Field(() => Int, { nullable: true }) revision?: number;
  @Field() name: string;
  @Field() description: string;
  @Field(() => [String]) capabilities: string[];
}

@InputType('OtogrowRoleRevisionInput')
export class OtogrowRoleRevisionInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
}

@InputType('OtogrowRoleAssignmentInput')
export class OtogrowRoleAssignmentInput {
  @Field(() => ID) memberId: string;
  @Field(() => [ID]) roleIds: string[];
  @Field(() => Int) revision: number;
  @Field(() => [OtogrowRoleRevisionInput])
  roleRevisions: OtogrowRoleRevisionInput[];
}
