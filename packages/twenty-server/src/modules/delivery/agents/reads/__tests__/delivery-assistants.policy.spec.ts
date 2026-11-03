import { BadRequestException } from '@nestjs/common';
import {
  deliveryAssistantCatalogSchema,
  deliveryAssistantCursor,
  deliveryAssistantRunsSchema,
  deliveryAssistantSaveSchema,
  parseDeliveryAssistantInput,
  readDeliveryAssistantCursor,
  sameDeliveryAssistantConfiguration,
} from 'src/modules/delivery/agents/reads/delivery-assistants.policy';

const id = '10000000-0000-4000-8000-000000000001';
const configuration = {
  name: 'Brand checker',
  purpose: 'Check supplied claims',
  kind: 'BRIEF',
  enabled: false,
  instructions: 'Use supplied facts.',
  requiredInputs: ['brief'],
  outputFormat: 'findings',
  tools: [],
  modelId: null,
  projectIds: [id],
  roles: ['ADMIN'],
  roleIds: null,
  dailyRunLimit: 10,
  maxOutputTokens: 1024,
  humanConfirmation: true,
};
describe('assistant read and creation inputs', () => {
  it('requires a stable new identity and forbids mixing create with update versions', () => {
    expect(
      deliveryAssistantSaveSchema.safeParse({ configuration }).success,
    ).toBe(false);
    expect(
      deliveryAssistantSaveSchema.safeParse({ configuration, createId: id })
        .success,
    ).toBe(true);
    expect(
      deliveryAssistantSaveSchema.safeParse({
        configuration,
        createId: id,
        version: 1,
      }).success,
    ).toBe(false);
    expect(
      deliveryAssistantSaveSchema.safeParse({ configuration, createId: id, id })
        .success,
    ).toBe(false);
    expect(
      deliveryAssistantSaveSchema.safeParse({ configuration, id, version: 1 })
        .success,
    ).toBe(true);
    expect(
      deliveryAssistantSaveSchema.safeParse({ configuration, id }).success,
    ).toBe(false);
  });
  it('normalizes configured text before comparing a version-one retry', () => {
    expect(
      sameDeliveryAssistantConfiguration(configuration, {
        ...configuration,
        name: ' Brand checker ',
        roleIds: undefined,
      }),
    ).toBe(true);
    expect(
      sameDeliveryAssistantConfiguration(configuration, {
        ...configuration,
        instructions: 'Different instructions',
      }),
    ).toBe(false);
    expect(
      sameDeliveryAssistantConfiguration(configuration, {
        ...configuration,
        roleIds: [id],
      }),
    ).toBe(false);
    expect(
      sameDeliveryAssistantConfiguration(configuration, {
        ...configuration,
        unexpected: 'ignored',
      }),
    ).toBe(false);
  });
  it('bounds every page and rejects unknown filters rather than truncating silently', () => {
    expect(() =>
      parseDeliveryAssistantInput(deliveryAssistantCatalogSchema, {
        limit: 51,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseDeliveryAssistantInput(deliveryAssistantRunsSchema, {
        status: 'DONE',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseDeliveryAssistantInput(deliveryAssistantCatalogSchema, {
        kind: 'IMAGE',
      }),
    ).toThrow(BadRequestException);
    expect(
      parseDeliveryAssistantInput(deliveryAssistantCatalogSchema, {
        search: ' Brand ',
        limit: 25,
      }).search,
    ).toBe('Brand');
  });
  it('retains the exact PostgreSQL microsecond key and current identity scope', () => {
    const scope = 'a'.repeat(64);
    const cursor = deliveryAssistantCursor(
      scope,
      '2026-10-30T01:00:01.000Z',
      '2026-10-30T01:00:00.123456Z',
      id,
    );
    expect(readDeliveryAssistantCursor(cursor, scope)?.createdAt).toBe(
      '2026-10-30T01:00:00.123456Z',
    );
    expect(() => readDeliveryAssistantCursor(cursor, 'b'.repeat(64))).toThrow(
      'Open the first page',
    );
    expect(() => readDeliveryAssistantCursor('untrusted', scope)).toThrow(
      BadRequestException,
    );
  });
});
