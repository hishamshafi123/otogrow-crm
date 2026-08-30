import { type ActorMetadata, type CurrencyMetadata } from 'twenty-shared/types';

import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type PriceBookItemWorkspaceEntity } from 'src/modules/quoting/standard-objects/price-book-item.workspace-entity';
import { type QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';

export class QuoteLineItemWorkspaceEntity extends BaseWorkspaceEntity {
  label: string;
  description: string | null;
  quantity: number;
  unitPrice: CurrencyMetadata;
  discountPercent: number;
  lineTotal: CurrencyMetadata | null;
  quote: EntityRelation<QuoteWorkspaceEntity>;
  quoteId: string;
  priceBookItem: EntityRelation<PriceBookItemWorkspaceEntity> | null;
  priceBookItemId: string | null;
  position: number;
  createdBy: ActorMetadata;
  updatedBy: ActorMetadata;
  searchVector: string;
}
