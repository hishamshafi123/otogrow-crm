import {
  computeQuoteLineTotalAmountMicros,
  resolveEffectiveUnitPriceAmountMicros,
} from 'src/modules/quoting/services/quote-totals.service';

describe('computeQuoteLineTotalAmountMicros', () => {
  it('multiplies quantity by unit price without discount', () => {
    expect(
      computeQuoteLineTotalAmountMicros({
        quantity: 2,
        unitPriceAmountMicros: 2500000000,
        discountPercent: 0,
      }),
    ).toBe(5000000000);
  });

  it('applies the discount percentage', () => {
    expect(
      computeQuoteLineTotalAmountMicros({
        quantity: 3,
        unitPriceAmountMicros: 1200000000,
        discountPercent: 10,
      }),
    ).toBe(3240000000);
  });

  it('rounds fractional micros from percentage discounts', () => {
    expect(
      computeQuoteLineTotalAmountMicros({
        quantity: 1,
        unitPriceAmountMicros: 99999999,
        discountPercent: 33,
      }),
    ).toBe(Math.round(99999999 * 0.67));
  });
});

describe('resolveEffectiveUnitPriceAmountMicros', () => {
  const bulkPriceBookItem = {
    bulkMinQuantity: 5,
    bulkUnitPrice: { amountMicros: 40000000, currencyCode: 'USD' },
  };

  it('uses the line item unit price below the bulk threshold', () => {
    expect(
      resolveEffectiveUnitPriceAmountMicros({
        lineItem: {
          quantity: 4,
          unitPrice: { amountMicros: 50000000, currencyCode: 'USD' },
        },
        priceBookItem: bulkPriceBookItem,
      }),
    ).toBe(50000000);
  });

  it('uses the bulk unit price at the bulk threshold', () => {
    expect(
      resolveEffectiveUnitPriceAmountMicros({
        lineItem: {
          quantity: 5,
          unitPrice: { amountMicros: 50000000, currencyCode: 'USD' },
        },
        priceBookItem: bulkPriceBookItem,
      }),
    ).toBe(40000000);
  });

  it('falls back to the line item unit price without a price book item', () => {
    expect(
      resolveEffectiveUnitPriceAmountMicros({
        lineItem: {
          quantity: 10,
          unitPrice: { amountMicros: 50000000, currencyCode: 'USD' },
        },
        priceBookItem: undefined,
      }),
    ).toBe(50000000);
  });

  it('falls back to the line item unit price when no bulk price is set', () => {
    expect(
      resolveEffectiveUnitPriceAmountMicros({
        lineItem: {
          quantity: 10,
          unitPrice: { amountMicros: 50000000, currencyCode: 'USD' },
        },
        priceBookItem: { bulkMinQuantity: 5, bulkUnitPrice: null },
      }),
    ).toBe(50000000);
  });
});
