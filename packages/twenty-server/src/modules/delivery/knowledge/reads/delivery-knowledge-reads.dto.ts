import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  DeliveryKnowledgeDetailDTO,
  DeliveryKnowledgeItemDTO,
} from 'src/modules/delivery/knowledge/delivery-knowledge.dto';

@InputType('DeliveryKnowledgeContextInput')
export class DeliveryKnowledgeContextInput {
  @Field(() => ID, { nullable: true }) projectId?: string | null;
}
@InputType('DeliveryKnowledgeProjectsInput')
export class DeliveryKnowledgeProjectsInput {
  @Field(() => String, { nullable: true }) search?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@InputType('DeliveryKnowledgeListInput')
export class DeliveryKnowledgeListInput extends DeliveryKnowledgeProjectsInput {
  @Field(() => ID) projectId: string;
  @Field(() => String, { nullable: true }) category?: string | null;
}
@InputType('DeliveryKnowledgeSelectionInput')
export class DeliveryKnowledgeSelectionInput {
  @Field(() => ID) projectId: string;
  @Field(() => ID) sourceId: string;
  @Field(() => Int, { nullable: true }) version?: number | null;
}
@ObjectType('DeliveryKnowledgeReadActor')
export class DeliveryKnowledgeActorDTO {
  @Field(() => ID) memberId: string;
  @Field() isAdmin: boolean;
  @Field() isManager: boolean;
  @Field(() => [ID]) roleIds: string[];
  @Field(() => [String]) capabilities: string[];
}
@ObjectType({ isAbstract: true })
export class DeliveryKnowledgeReadIdentityDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => DeliveryKnowledgeActorDTO) actor: DeliveryKnowledgeActorDTO;
}
@ObjectType('DeliveryKnowledgeProject')
export class DeliveryKnowledgeProjectDTO {
  @Field(() => ID) id: string;
  @Field(() => ID, { nullable: true }) companyId?: string | null;
  @Field() name: string;
  @Field(() => Int) revision: number;
}
@ObjectType('DeliveryKnowledgeContext')
export class DeliveryKnowledgeContextDTO extends DeliveryKnowledgeReadIdentityDTO {
  @Field(() => DeliveryKnowledgeProjectDTO, { nullable: true })
  selectedProject: DeliveryKnowledgeProjectDTO | null;
  @Field() canPublish: boolean;
}
@ObjectType('DeliveryKnowledgeProjects')
export class DeliveryKnowledgeProjectsDTO extends DeliveryKnowledgeReadIdentityDTO {
  @Field(() => [DeliveryKnowledgeProjectDTO])
  items: DeliveryKnowledgeProjectDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field() scope: string;
}
@ObjectType('DeliveryKnowledgeList')
export class DeliveryKnowledgeListDTO extends DeliveryKnowledgeReadIdentityDTO {
  @Field(() => DeliveryKnowledgeProjectDTO)
  project: DeliveryKnowledgeProjectDTO;
  @Field(() => [DeliveryKnowledgeItemDTO]) items: DeliveryKnowledgeItemDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field() scope: string;
}
@ObjectType('DeliveryKnowledgeSourceState')
export class DeliveryKnowledgeSourceStateDTO extends DeliveryKnowledgeItemDTO {
  @Field(() => Int) currentVersion: number;
}
@ObjectType('DeliveryKnowledgeState')
export class DeliveryKnowledgeStateDTO extends DeliveryKnowledgeReadIdentityDTO {
  @Field(() => DeliveryKnowledgeProjectDTO)
  project: DeliveryKnowledgeProjectDTO;
  @Field() canPublish: boolean;
  @Field(() => DeliveryKnowledgeSourceStateDTO, { nullable: true })
  source: DeliveryKnowledgeSourceStateDTO | null;
}
@ObjectType('DeliveryKnowledgeExactDetail')
export class DeliveryKnowledgeExactDetailDTO extends DeliveryKnowledgeReadIdentityDTO {
  @Field(() => DeliveryKnowledgeProjectDTO)
  project: DeliveryKnowledgeProjectDTO;
  @Field() canPublish: boolean;
  @Field(() => DeliveryKnowledgeDetailDTO, { nullable: true })
  detail: DeliveryKnowledgeDetailDTO | null;
}
@ObjectType('DeliveryKnowledgeWriteResult')
export class DeliveryKnowledgeWriteResultDTO extends DeliveryKnowledgeReadIdentityDTO {
  @Field(() => DeliveryKnowledgeProjectDTO)
  project: DeliveryKnowledgeProjectDTO;
  @Field() canPublish: boolean;
  @Field(() => DeliveryKnowledgeSourceStateDTO)
  source: DeliveryKnowledgeSourceStateDTO;
}
