import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DeepPartial, type EntityManager, type Repository } from 'typeorm';

import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { type TelegramConfigEntity } from 'src/modules/lead-assignment/entities/telegram-config.entity';
import { type TelegramConfigEncryptionService } from 'src/modules/lead-assignment/services/telegram-config-encryption.service';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';

const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const REPLACEMENT_TOKEN = 'synthetic-replacement-token';
const configuration = (): TelegramConfigEntity =>
  ({
    id: '87e9aa58-14b1-4ad6-bed8-7caa96b50109',
    workspaceId: WORKSPACE_ID,
    botToken: 'enc:v2:original-fixture' as EncryptedString,
    botUsername: 'previous_fixture_bot',
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2020-01-01T00:00:00.123Z'),
    updatedAt: new Date('2020-01-01T00:00:00.123Z'),
  }) as TelegramConfigEntity;

const setup = (existing: TelegramConfigEntity | null = configuration()) => {
  const repository = {
    findOne: jest.fn().mockResolvedValue(existing),
    save: jest
      .fn()
      .mockImplementation(
        async (input: DeepPartial<TelegramConfigEntity>) =>
          ({ ...configuration(), ...input }) as TelegramConfigEntity,
      ),
    softRemove: jest
      .fn()
      .mockImplementation(async (input: TelegramConfigEntity) => ({
        ...input,
        deletedAt: new Date('2020-02-01T00:00:00Z'),
      })),
  };
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn().mockReturnValue(repository),
  } as unknown as EntityManager;
  const transaction = jest.fn(
    async (
      change: (
        transactionManager: EntityManager,
      ) => Promise<TelegramConfigEntity>,
    ) => change(manager),
  );
  const rootRepository = {
    ...repository,
    manager: { transaction },
  } as unknown as Repository<TelegramConfigEntity>;
  const encryption = {
    encrypt: jest
      .fn()
      .mockReturnValue('enc:v2:replacement-fixture' as EncryptedString),
    decrypt: jest.fn().mockImplementation(() => {
      throw new Error('Configuration changes must not decrypt a credential.');
    }),
  };
  return {
    service: new TelegramConfigService(
      rootRepository,
      encryption as unknown as TelegramConfigEncryptionService,
    ),
    repository,
    transaction,
    encryption,
  };
};

describe('Telegram configuration reconnect', () => {
  it('creates the initial workspace configuration with encrypted replacement input', async () => {
    const { service, repository, encryption } = setup(null);
    const result = await service.upsert(
      { botToken: REPLACEMENT_TOKEN, botUsername: 'replacement_fixture_bot' },
      WORKSPACE_ID,
    );
    expect(result).toMatchObject({
      workspaceId: WORKSPACE_ID,
      botToken: 'enc:v2:replacement-fixture',
      botUsername: 'replacement_fixture_bot',
      isActive: true,
      deletedAt: null,
    });
    expect(encryption.encrypt).toHaveBeenCalledWith({
      plaintext: REPLACEMENT_TOKEN,
      workspaceId: WORKSPACE_ID,
    });
    expect(repository.save.mock.calls[0][0].botToken).not.toBe(
      REPLACEMENT_TOKEN,
    );
    expect(encryption.decrypt).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '   '])(
    'requires a nonblank credential for initial configuration: %p',
    async (botToken) => {
      const { service, repository, encryption } = setup(null);
      await expect(service.upsert({ botToken }, WORKSPACE_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.save).not.toHaveBeenCalled();
      expect(encryption.encrypt).not.toHaveBeenCalled();
    },
  );

  it('reconnects the same deleted identity with a new encrypted credential and fresh defaults', async () => {
    const old = {
      ...configuration(),
      deletedAt: new Date('2020-01-02T00:00:00Z'),
      isActive: false,
    };
    const { service, repository, encryption } = setup(old);
    const result = await service.upsert(
      { botToken: REPLACEMENT_TOKEN },
      WORKSPACE_ID,
    );
    expect(result).toMatchObject({
      id: old.id,
      workspaceId: WORKSPACE_ID,
      createdAt: old.createdAt,
      botToken: 'enc:v2:replacement-fixture',
      botUsername: null,
      isActive: true,
      deletedAt: null,
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(old.deletedAt).not.toBeNull();
    expect(old.botUsername).toBe('previous_fixture_bot');
    expect(encryption.decrypt).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { botToken: '' },
    { botToken: '   ' },
    { botUsername: 'metadata_only', isActive: true },
  ])(
    'never restores a deleted row from tokenless or metadata-only input: %p',
    async (input) => {
      const old = {
        ...configuration(),
        deletedAt: new Date('2020-01-02T00:00:00Z'),
      };
      const { service, repository, encryption } = setup(old);
      await expect(service.upsert(input, WORKSPACE_ID)).rejects.toThrow(
        'A new bot token is required to reconnect Telegram',
      );
      expect(repository.save).not.toHaveBeenCalled();
      expect(encryption.encrypt).not.toHaveBeenCalled();
      expect(encryption.decrypt).not.toHaveBeenCalled();
      expect(old.botToken).toBe('enc:v2:original-fixture');
    },
  );

  it('uses explicitly supplied replacement username and paused activation state', async () => {
    const old = {
      ...configuration(),
      deletedAt: new Date('2020-01-02T00:00:00Z'),
    };
    const { service } = setup(old);
    const result = await service.upsert(
      {
        botToken: REPLACEMENT_TOKEN,
        botUsername: 'new_fixture_bot',
        isActive: false,
      },
      WORKSPACE_ID,
    );
    expect(result).toMatchObject({
      id: old.id,
      botUsername: 'new_fixture_bot',
      isActive: false,
      deletedAt: null,
    });
  });

  it('preserves an active encrypted token during ordinary tokenless metadata edits', async () => {
    const old = configuration();
    const { service, encryption } = setup(old);
    const result = await service.upsert(
      { botUsername: 'renamed_fixture_bot', isActive: false },
      WORKSPACE_ID,
    );
    expect(result).toMatchObject({
      id: old.id,
      botToken: old.botToken,
      botUsername: 'renamed_fixture_bot',
      isActive: false,
      deletedAt: null,
    });
    expect(encryption.encrypt).not.toHaveBeenCalled();
    expect(encryption.decrypt).not.toHaveBeenCalled();
  });

  it('keeps paused active-row defaults when no replacement values are supplied', async () => {
    const old = { ...configuration(), isActive: false };
    const { service } = setup(old);
    expect(await service.upsert({}, WORKSPACE_ID)).toMatchObject({
      id: old.id,
      botToken: old.botToken,
      botUsername: old.botUsername,
      isActive: false,
    });
  });

  it('leaves the deleted identity unchanged when encryption fails', async () => {
    const old = {
      ...configuration(),
      deletedAt: new Date('2020-01-02T00:00:00Z'),
    };
    const { service, repository, encryption } = setup(old);
    encryption.encrypt.mockImplementation(() => {
      throw new Error('Synthetic encryption failure');
    });
    await expect(
      service.upsert({ botToken: REPLACEMENT_TOKEN }, WORKSPACE_ID),
    ).rejects.toThrow('Synthetic encryption failure');
    expect(repository.save).not.toHaveBeenCalled();
    expect(old.deletedAt).not.toBeNull();
  });

  it('soft-deletes the current configuration through the same serialized transaction', async () => {
    const old = configuration();
    const { service, repository, transaction, encryption } = setup(old);
    expect(await service.delete(WORKSPACE_ID)).toMatchObject({
      id: old.id,
      botToken: old.botToken,
      deletedAt: expect.any(Date),
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(repository.softRemove).toHaveBeenCalledWith(old);
    expect(encryption.decrypt).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...configuration(), deletedAt: new Date('2020-01-02T00:00:00Z') },
  ])(
    'does not delete or restore an unavailable configuration: %p',
    async (existing) => {
      const { service, repository } = setup(existing);
      await expect(service.delete(WORKSPACE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.softRemove).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    },
  );
});
