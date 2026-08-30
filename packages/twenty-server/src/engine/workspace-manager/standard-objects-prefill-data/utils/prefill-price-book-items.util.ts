import { type EntityManager } from 'typeorm';
import { FieldActorSource } from 'twenty-shared/types';

export const DEFAULT_PRICE_BOOK_ITEMS = [
  {
    id: '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d01',
    name: 'Website Design',
    description: 'Custom marketing website design and build',
    sku: 'WEB-DESIGN',
    unitPriceAmountMicros: 2500000000,
    bulkMinQuantity: null,
    bulkUnitPriceAmountMicros: null,
    position: 1,
  },
  {
    id: '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d02',
    name: 'Monthly SEO Retainer',
    description: 'Ongoing search engine optimization, billed monthly',
    sku: 'SEO-RET',
    unitPriceAmountMicros: 1200000000,
    bulkMinQuantity: null,
    bulkUnitPriceAmountMicros: null,
    position: 2,
  },
  {
    id: '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d03',
    name: 'Google Ads Management',
    description: 'Monthly Google Ads campaign management',
    sku: 'ADS-MGMT',
    unitPriceAmountMicros: 900000000,
    bulkMinQuantity: null,
    bulkUnitPriceAmountMicros: null,
    position: 3,
  },
  {
    id: '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d04',
    name: 'Social Media Management',
    description: 'Monthly social media content and community management',
    sku: 'SMM',
    unitPriceAmountMicros: 750000000,
    bulkMinQuantity: null,
    bulkUnitPriceAmountMicros: null,
    position: 4,
  },
  {
    id: '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d05',
    name: 'Brand Identity Package',
    description: 'Logo, color palette, typography and brand guidelines',
    sku: 'BRAND-ID',
    unitPriceAmountMicros: 1800000000,
    bulkMinQuantity: null,
    bulkUnitPriceAmountMicros: null,
    position: 5,
  },
  {
    id: '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d06',
    name: 'Landing Page',
    description: 'Single conversion-focused landing page',
    sku: 'LANDING',
    unitPriceAmountMicros: 800000000,
    bulkMinQuantity: null,
    bulkUnitPriceAmountMicros: null,
    position: 6,
  },
  {
    id: '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d07',
    name: 'Email Marketing Setup',
    description: 'Email platform setup with welcome automation',
    sku: 'EMAIL-SETUP',
    unitPriceAmountMicros: 600000000,
    bulkMinQuantity: null,
    bulkUnitPriceAmountMicros: null,
    position: 7,
  },
  {
    id: '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d08',
    name: 'CRM Implementation',
    description: 'CRM configuration, data migration and team training',
    sku: 'CRM-IMPL',
    unitPriceAmountMicros: 3500000000,
    bulkMinQuantity: null,
    bulkUnitPriceAmountMicros: null,
    position: 8,
  },
  {
    id: '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d09',
    name: 'Business Cards (per 100)',
    description: 'Design and print of business cards, priced per 100 units',
    sku: 'BIZ-CARDS',
    unitPriceAmountMicros: 50000000,
    bulkMinQuantity: 5,
    bulkUnitPriceAmountMicros: 40000000,
    position: 9,
  },
] as const;

export const prefillPriceBookItems = async (
  entityManager: EntityManager,
  schemaName: string,
) => {
  await entityManager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.priceBookItem`, [
      'id',
      'name',
      'description',
      'sku',
      'unitPriceAmountMicros',
      'unitPriceCurrencyCode',
      'bulkMinQuantity',
      'bulkUnitPriceAmountMicros',
      'bulkUnitPriceCurrencyCode',
      'isActive',
      'position',
      'createdBySource',
      'createdByWorkspaceMemberId',
      'createdByName',
      'updatedBySource',
      'updatedByWorkspaceMemberId',
      'updatedByName',
    ])
    .orIgnore()
    .values(
      // Key order must match the column list above: TypeORM's insert builder
      // aligns object values positionally, not by key name
      DEFAULT_PRICE_BOOK_ITEMS.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        sku: item.sku,
        unitPriceAmountMicros: item.unitPriceAmountMicros,
        unitPriceCurrencyCode: 'USD',
        bulkMinQuantity: item.bulkMinQuantity,
        bulkUnitPriceAmountMicros: item.bulkUnitPriceAmountMicros,
        bulkUnitPriceCurrencyCode:
          item.bulkUnitPriceAmountMicros !== null ? 'USD' : null,
        isActive: true,
        position: item.position,
        createdBySource: FieldActorSource.SYSTEM,
        createdByWorkspaceMemberId: null,
        createdByName: 'System',
        updatedBySource: FieldActorSource.SYSTEM,
        updatedByWorkspaceMemberId: null,
        updatedByName: 'System',
      })),
    )
    .execute();
};
