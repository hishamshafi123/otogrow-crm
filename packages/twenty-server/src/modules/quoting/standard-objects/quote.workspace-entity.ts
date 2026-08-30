import { type ActorMetadata, type CurrencyMetadata } from 'twenty-shared/types';

import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';
import { type OpportunityWorkspaceEntity } from 'src/modules/opportunity/standard-objects/opportunity.workspace-entity';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { type QuoteLineItemWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote-line-item.workspace-entity';

export class QuoteWorkspaceEntity extends BaseWorkspaceEntity {
  quoteNumber: string | null;
  status: string;
  taxPercent: number;
  validUntil: string | null;
  subtotal: CurrencyMetadata | null;
  taxAmount: CurrencyMetadata | null;
  total: CurrencyMetadata | null;
  terms: string | null;
  company: EntityRelation<CompanyWorkspaceEntity> | null;
  companyId: string | null;
  person: EntityRelation<PersonWorkspaceEntity> | null;
  personId: string | null;
  opportunity: EntityRelation<OpportunityWorkspaceEntity> | null;
  opportunityId: string | null;
  lineItems: EntityRelation<QuoteLineItemWorkspaceEntity[]>;
  position: number;
  createdBy: ActorMetadata;
  updatedBy: ActorMetadata;
  searchVector: string;
}
