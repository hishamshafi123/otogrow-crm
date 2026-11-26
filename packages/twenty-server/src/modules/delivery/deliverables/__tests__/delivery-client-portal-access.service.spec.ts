import { randomUUID } from 'node:crypto';
import { type DataSource } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { type SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryClientPortalAccessService } from 'src/modules/delivery/deliverables/delivery-client-portal-access.service';
import { type DeliveryClientPortalAccessEntity } from 'src/modules/delivery/deliverables/entities/delivery-client-portal-access.entity';
import { type DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(async () => undefined),
}));

const setup = () => {
  const workspaceId = randomUUID();
  const memberId = randomUUID();
  const userWorkspaceId = randomUUID();
  const companyId = randomUUID();

  let stored: DeliveryClientPortalAccessEntity | null = null;

  const accessRepo = {
    createQueryBuilder: jest.fn(() => {
      type MockQb = {
        addSelect: jest.Mock<MockQb>;
        where: jest.Mock<MockQb>;
        orderBy: jest.Mock<MockQb>;
        getOne: jest.Mock<Promise<DeliveryClientPortalAccessEntity | null>>;
        getMany: jest.Mock<Promise<DeliveryClientPortalAccessEntity[]>>;
      };
      const qb: MockQb = {
        addSelect: jest.fn(() => qb),
        where: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        getOne: jest.fn(async () => stored),
        getMany: jest.fn(async () => (stored ? [stored] : [])),
      };
      return qb;
    }),
    findOne: jest.fn(async ({ where }: { where: { slug?: string } }) =>
      stored && stored.slug === where.slug ? stored : null,
    ),
    find: jest.fn(async ({ where }: { where: { codeHash?: string } }) =>
      stored && stored.codeHash === where.codeHash ? [stored] : [],
    ),
    create: jest.fn((data: Partial<DeliveryClientPortalAccessEntity>) => ({
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    })),
    save: jest.fn(async (entity: DeliveryClientPortalAccessEntity) => {
      stored = entity;
      return entity;
    }),
    update: jest.fn(async () => undefined),
  };

  const workspaceRepo = {
    findOneByOrFail: jest.fn(async () => ({ id: workspaceId })),
  };

  const manager = {
    query: jest.fn(async () => []),
    getRepository: jest.fn((entity: { name?: string }) =>
      entity?.name === 'WorkspaceEntity' ? workspaceRepo : accessRepo,
    ),
  };

  const dataSource = {
    transaction: jest.fn(async (work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
    getRepository: jest.fn(() => accessRepo),
  } as unknown as DataSource;

  const delivery = {
    actor: jest.fn(async () => ({ isManager: true })),
  } as unknown as DeliveryService;

  const encryption = {
    encryptVersioned: jest.fn(
      (value: string) => `enc:v2:test:${value}` as EncryptedString,
    ),
    decryptVersionedOrThrow: jest.fn((value: string) =>
      value.replace(/^enc:v2:test:/, ''),
    ),
  } as unknown as SecretEncryptionService;

  const companies = {
    listByIds: jest.fn(async () => [
      { id: companyId, name: 'Belfort Entity Hokuro' },
    ]),
  } as unknown as DeliveryClientSetupSourceService;

  const auth = {
    type: 'user',
    workspace: { id: workspaceId },
    workspaceMemberId: memberId,
    userWorkspaceId,
  } as WorkspaceAuthContext;

  const service = new DeliveryClientPortalAccessService(
    dataSource,
    delivery,
    encryption,
    companies,
  );

  return { service, auth, companyId, delivery, encryption, accessRepo };
};

describe('DeliveryClientPortalAccessService', () => {
  it('generates, reveals decrypted code, sets custom code, verifies login, and revokes cleanly', async () => {
    const { service, auth, companyId } = setup();

    const generated = await service.manage(auth, {
      action: 'generate',
      companyId,
    });
    expect(generated.slug).toBe('belfort-entity-hokuro');
    expect(generated.accessCode).toMatch(/^OTO-/);
    expect(generated.isActive).toBe(true);

    // Managers can view the active code again if client forgets
    const revealed = await service.getForCompany(auth, companyId);
    expect(revealed?.accessCode).toBe(generated.accessCode);

    // Set a custom code
    const customized = await service.manage(auth, {
      action: 'setCustom',
      companyId,
      code: 'belfort-2026',
    });
    expect(customized.accessCode).toBe('BELFORT-2026');

    // Public verification succeeds for custom code and fails for old/wrong code
    const ok = await service.verifyPortalLogin(
      'belfort-entity-hokuro',
      'belfort-2026',
    );
    expect(ok?.companyId).toBe(companyId);

    const wrong = await service.verifyPortalLogin(
      'belfort-entity-hokuro',
      'WRONG-CODE',
    );
    expect(wrong).toBeNull();

    // Revoking immediately blocks login
    await service.manage(auth, { action: 'revoke', companyId });
    const afterRevoke = await service.verifyPortalLogin(
      'belfort-entity-hokuro',
      'BELFORT-2026',
    );
    expect(afterRevoke).toBeNull();
  });

  it('forbids non-managers from viewing or changing portal access codes', async () => {
    const { service, auth, companyId, delivery } = setup();
    jest
      .mocked(delivery.actor)
      .mockResolvedValue({ isManager: false } as Awaited<
        ReturnType<DeliveryService['actor']>
      >);
    await expect(service.getForCompany(auth, companyId)).rejects.toThrow(
      'Delivery management access',
    );
  });
});
