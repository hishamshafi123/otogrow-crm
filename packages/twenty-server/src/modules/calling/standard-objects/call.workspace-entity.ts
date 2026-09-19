import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

export class CallWorkspaceEntity extends BaseWorkspaceEntity {
  direction: string;
  status: string;
  fromNumber: string;
  toNumber: string;
  durationSeconds: number | null;
  startedAt: Date | null;
  answeredAt: Date | null;
  endedAt: Date | null;
  externalId: string | null;
  recordingSid: string | null;
  errorMessage: string | null;
  person: EntityRelation<PersonWorkspaceEntity> | null;
  personId: string | null;
  company: EntityRelation<CompanyWorkspaceEntity> | null;
  companyId: string | null;
  searchVector: string;
}
