import { randomUUID } from 'node:crypto';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryAtlasConnectionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-connection.service';
import { DeliveryAtlasConnectionEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-connection.entity';
import { DeliveryAtlasCredentialEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-credential.entity';
import { type DeliveryAtlasAdapter } from 'src/modules/delivery/creative/atlas/delivery-atlas.adapter';
import { type DeliveryAtlasSettingsInput } from 'src/modules/delivery/creative/atlas/delivery-atlas.dto';

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(),
}));
const WORKSPACE_ID = randomUUID(),
  MEMBER_ID = randomUUID(),
  MEMBERSHIP_ID = randomUUID();
const PROFILE = 'google/nano-banana-pro/text-to-image';
const workspace = { id: WORKSPACE_ID } as WorkspaceEntity;
const setup = () => {
  let current: DeliveryAtlasConnectionEntity | null = null;
  const credentials: DeliveryAtlasCredentialEntity[] = [];
  const query = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => {
      credentials.forEach((credential) => (credential.revokedAt = new Date()));
    }),
    getOne: jest.fn(async () => credentials[0] ?? null),
  };
  const connectionRepository = {
    findOneBy: jest.fn(async () => current),
    save: jest.fn(async (input: Partial<DeliveryAtlasConnectionEntity>) => {
      current = Object.assign(new DeliveryAtlasConnectionEntity(), input, {
        updatedAt: new Date(),
      });
      return current;
    }),
  };
  const credentialRepository = {
    createQueryBuilder: () => query,
    save: jest.fn(async (input: Partial<DeliveryAtlasCredentialEntity>) => {
      const credential = Object.assign(
        new DeliveryAtlasCredentialEntity(),
        input,
        { id: randomUUID(), createdAt: new Date() },
      );
      credentials.push(credential);
      return credential;
    }),
  };
  const manager = {
    query: jest.fn(async () => []),
    getRepository: (entity: unknown) =>
      entity === DeliveryAtlasConnectionEntity
        ? connectionRepository
        : credentialRepository,
  } as unknown as EntityManager;
  const source = {
    transaction: async (work: (manager: EntityManager) => Promise<unknown>) =>
      work(manager),
  } as DataSource;
  const actor = jest.fn(async () => ({ isAdmin: true }));
  const encrypt = jest.fn((value: string) => `enc:v2:synthetic:${value}`);
  const decrypt = jest.fn(() => 'test-only-secret');
  const calculate = jest.fn(async () => ({
    costUsd: '0.100000',
    estimated: false,
  }));
  const adapter = {
    calculate,
    body: jest.fn(() => ({ model: PROFILE })),
  } as unknown as DeliveryAtlasAdapter;
  const service = new DeliveryAtlasConnectionService(
    source,
    { actor } as unknown as DeliveryService,
    {
      encryptVersioned: encrypt,
      decryptVersionedOrThrow: decrypt,
    } as unknown as SecretEncryptionService,
    adapter,
  );
  const input: DeliveryAtlasSettingsInput = {
    revision: 0,
    apiKey: 'test-only-key',
    enabled: true,
    enabledProfileIds: [PROFILE],
    defaultImageFamilyId: null,
    defaultClipProfileId: null,
    reservationLimits: [
      {
        profileId: PROFILE,
        maximumCostUsd: '0.5',
        source: 'Reviewed test bound',
        verifiedAt: '2026-10-28T00:00:00+03:00',
      },
    ],
  };
  return {
    service,
    input,
    credentials,
    actor,
    encrypt,
    decrypt,
    calculate,
    manager,
    current: () => current!,
    save: (command = input) =>
      service.save(workspace, MEMBER_ID, MEMBERSHIP_ID, command),
  };
};
describe('Atlas administrator connection and defaults', () => {
  it('starts with unset defaults, encrypts the key and never returns it', async () => {
    const test = setup();
    const saved = await test.save();
    expect(saved).toEqual(
      expect.objectContaining({
        keyConfigured: true,
        verificationStatus: 'UNVERIFIED',
        defaultImageFamilyId: null,
        defaultClipProfileId: null,
      }),
    );
    expect(JSON.stringify(saved)).not.toContain('test-only-key');
    expect(test.credentials[0].apiKey).toMatch(/^enc:v2:/);
    expect(test.encrypt).toHaveBeenCalledWith('test-only-key', {
      workspaceId: WORKSPACE_ID,
    });
    expect(test.current().reservationLimits[0]).toEqual(
      expect.objectContaining({
        maximumCostUsd: '0.500000',
        verifiedAt: '2026-10-27T21:00:00.000Z',
        revision: 1,
      }),
    );
  });
  it('preserves exact model pricing evidence across default-only and equivalent-offset saves', async () => {
    const test = setup();
    await test.save();
    const original = { ...test.current().reservationLimits[0] };
    await test.save({
      ...test.input,
      revision: 1,
      apiKey: null,
      defaultImageFamilyId: 'nano-banana-pro',
      reservationLimits: [
        {
          ...test.input.reservationLimits[0],
          maximumCostUsd: '0.500000',
          verifiedAt: '2026-10-27T21:00:00Z',
        },
      ],
    });
    expect(test.current().reservationLimits[0]).toEqual(original);
    expect(test.credentials).toHaveLength(1);
    expect(test.current().revision).toBe(2);
    await test.save({
      ...test.input,
      revision: 2,
      apiKey: null,
      reservationLimits: [
        { ...test.input.reservationLimits[0], maximumCostUsd: '0.6' },
      ],
    });
    expect(test.current().reservationLimits[0]).toEqual(
      expect.objectContaining({
        id: original.id,
        revision: 2,
        maximumCostUsd: '0.600000',
      }),
    );
  });
  it('retains an old accepted-job credential on rotation but explicitly revokes all versions on removal', async () => {
    const test = setup();
    await test.save();
    const original = test.current().credentialId;
    await test.save({
      ...test.input,
      revision: 1,
      apiKey: 'second-test-only-key',
    });
    expect(test.current().credentialId).not.toBe(original);
    expect(test.credentials).toHaveLength(2);
    expect(
      test.credentials.every((credential) => credential.revokedAt === null),
    ).toBe(true);
    await test.service.remove(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      revision: 2,
    });
    expect(
      test.credentials.every(
        (credential) => credential.revokedAt instanceof Date,
      ),
    ).toBe(true);
    await expect(
      test.service.secret(test.manager, WORKSPACE_ID, original!),
    ).rejects.toThrow('removed');
    expect(test.decrypt).not.toHaveBeenCalled();
  });
  it('only verifies the exact saved current credential through a non-generation request', async () => {
    const test = setup();
    await test.save();
    const result = await test.service.verify(
      workspace,
      MEMBER_ID,
      MEMBERSHIP_ID,
      { revision: 1 },
    );
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(test.calculate).toHaveBeenCalledTimes(1);
  });
  it('rejects nonadministrator access and stale setting writes before encrypting', async () => {
    const test = setup();
    test.actor.mockResolvedValue({ isAdmin: false });
    await expect(test.save()).rejects.toThrow('Only an administrator');
    expect(test.encrypt).not.toHaveBeenCalled();
    test.actor.mockResolvedValue({ isAdmin: true });
    await test.save();
    await expect(test.save()).rejects.toThrow('settings changed');
    expect(test.credentials).toHaveLength(1);
  });
});
