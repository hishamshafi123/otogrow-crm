import { type ActorMetadata, type CurrencyMetadata } from 'twenty-shared/types';

import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type QuoteLineItemWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote-line-item.workspace-entity';

export class PriceBookItemWorkspaceEntity extends BaseWorkspaceEntity {
  name: string;
  description: string | null;
  sku: string | null;
  unitPrice: CurrencyMetadata;
  bulkMinQuantity: number | null;
  bulkUnitPrice: CurrencyMetadata | null;
  isActive: boolean;
  quoteLineItems: EntityRelation<QuoteLineItemWorkspaceEntity[]>;
  position: number;
  createdBy: ActorMetadata;
  updatedBy: ActorMetadata;
  searchVector: string;
}
