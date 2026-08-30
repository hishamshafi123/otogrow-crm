import { Injectable, NotFoundException } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import { In } from 'typeorm';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { PriceBookItemWorkspaceEntity } from 'src/modules/quoting/standard-objects/price-book-item.workspace-entity';
import { QuoteLineItemWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote-line-item.workspace-entity';
import { QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';

export const computeQuoteLineTotalAmountMicros = ({
  quantity,
  unitPriceAmountMicros,
  discountPercent,
}: {
  quantity: number;
  unitPriceAmountMicros: number;
  discountPercent: number;
}): number =>
  Math.round(unitPriceAmountMicros * quantity * (1 - discountPercent / 100));

export const resolveEffectiveUnitPriceAmountMicros = ({
  lineItem,
  priceBookItem,
}: {
  lineItem: Pick<QuoteLineItemWorkspaceEntity, 'quantity' | 'unitPrice'>;
  priceBookItem:
    | Pick<PriceBookItemWorkspaceEntity, 'bulkMinQuantity' | 'bulkUnitPrice'>
    | undefined;
}): number => {
  if (
    isDefined(priceBookItem) &&
    isDefined(priceBookItem.bulkMinQuantity) &&
    lineItem.quantity >= priceBookItem.bulkMinQuantity &&
    isDefined(priceBookItem.bulkUnitPrice?.amountMicros)
  ) {
    return priceBookItem.bulkUnitPrice.amountMicros;
  }

  return lineItem.unitPrice?.amountMicros ?? 0;
};

@Injectable()
export class QuoteTotalsService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async recalculate({
    workspaceId,
    quoteId,
  }: {
    workspaceId: string;
    quoteId: string;
  }): Promise<void> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const quoteRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            QuoteWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );
        const lineItemRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            QuoteLineItemWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const quote = await quoteRepository.findOne({
          where: { id: quoteId },
        });

        if (!isDefined(quote)) {
          throw new NotFoundException(`Quote ${quoteId} not found`);
        }

        const lineItems = await lineItemRepository.find({
          where: { quoteId },
          order: { position: 'ASC' },
        });

        const priceBookItemIds = lineItems
          .map((lineItem) => lineItem.priceBookItemId)
          .filter(isDefined);

        const priceBookItemRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            PriceBookItemWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const priceBookItems =
          priceBookItemIds.length > 0
            ? await priceBookItemRepository.find({
                where: { id: In(priceBookItemIds) },
              })
            : [];

        const priceBookItemById = new Map(
          priceBookItems.map((priceBookItem) => [
            priceBookItem.id,
            priceBookItem,
          ]),
        );

        let subtotalAmountMicros = 0;
        let currencyCode = quote.total?.currencyCode ?? 'USD';

        for (const lineItem of lineItems) {
          const priceBookItem = isDefined(lineItem.priceBookItemId)
            ? priceBookItemById.get(lineItem.priceBookItemId)
            : undefined;

          const effectiveUnitPriceAmountMicros =
            resolveEffectiveUnitPriceAmountMicros({ lineItem, priceBookItem });

          currencyCode = lineItem.unitPrice?.currencyCode ?? currencyCode;

          const lineTotalAmountMicros = computeQuoteLineTotalAmountMicros({
            quantity: lineItem.quantity,
            unitPriceAmountMicros: effectiveUnitPriceAmountMicros,
            discountPercent: lineItem.discountPercent,
          });

          subtotalAmountMicros += lineTotalAmountMicros;

          if (
            lineItem.lineTotal?.amountMicros !== lineTotalAmountMicros ||
            lineItem.unitPrice?.amountMicros !== effectiveUnitPriceAmountMicros
          ) {
            await lineItemRepository.update(lineItem.id, {
              unitPrice: {
                amountMicros: effectiveUnitPriceAmountMicros,
                currencyCode,
              },
              lineTotal: {
                amountMicros: lineTotalAmountMicros,
                currencyCode,
              },
            });
          }
        }

        const taxAmountMicros = Math.round(
          (subtotalAmountMicros * quote.taxPercent) / 100,
        );

        await quoteRepository.update(quote.id, {
          subtotal: { amountMicros: subtotalAmountMicros, currencyCode },
          taxAmount: { amountMicros: taxAmountMicros, currencyCode },
          total: {
            amountMicros: subtotalAmountMicros + taxAmountMicros,
            currencyCode,
          },
        });
      },
      buildSystemAuthContext(workspaceId),
    );
  }
}
