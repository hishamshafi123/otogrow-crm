import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { type Repository } from 'typeorm';

import { PortalAccessEntity } from 'src/modules/portal/entities/portal-access.entity';
import { PortalAccessService } from 'src/modules/portal/services/portal-access.service';
import { hashPortalToken } from 'src/modules/portal/utils/hash-portal-token.util';

const WORKSPACE_ID = 'workspace-id';
const COMPANY_ID = 'company-id';

const buildPortalAccess = (
  overrides: Partial<PortalAccessEntity> = {},
): PortalAccessEntity =>
  ({
    id: 'portal-access-id',
    workspaceId: WORKSPACE_ID,
    companyId: COMPANY_ID,
    tokenHash: 'stored-hash',
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  }) as PortalAccessEntity;

describe('PortalAccessService', () => {
  let service: PortalAccessService;
  let portalAccessRepository: jest.Mocked<Repository<PortalAccessEntity>>;

  beforeEach(async () => {
    portalAccessRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<Repository<PortalAccessEntity>>;

    portalAccessRepository.create.mockImplementation(
      (entity) =>
        ({ ...entity }) as ReturnType<Repository<PortalAccessEntity>['create']>,
    );
    let saveCounter = 0;

    portalAccessRepository.save.mockImplementation((entity) =>
      Promise.resolve({
        ...buildPortalAccess({ id: `saved-id-${++saveCounter}` }),
        ...entity,
      } as PortalAccessEntity),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalAccessService,
        {
          provide: getRepositoryToken(PortalAccessEntity),
          useValue: portalAccessRepository,
        },
      ],
    }).compile();

    service = module.get<PortalAccessService>(PortalAccessService);
  });

  describe('generate', () => {
    it('stores only the sha256 hash of the token', async () => {
      portalAccessRepository.findOne.mockResolvedValue(null);

      const { portalAccess, token } = await service.generate({
        workspaceId: WORKSPACE_ID,
        companyId: COMPANY_ID,
      });

      expect(token).toHaveLength(43);
      expect(portalAccess.tokenHash).toBe(hashPortalToken(token));
      expect(portalAccess.tokenHash).not.toBe(token);
      expect(portalAccessRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: hashPortalToken(token) }),
      );
    });

    it('refuses to generate when an active portal access exists', async () => {
      portalAccessRepository.findOne.mockResolvedValue(buildPortalAccess());

      await expect(
        service.generate({
          workspaceId: WORKSPACE_ID,
          companyId: COMPANY_ID,
        }),
      ).rejects.toThrow('Portal access already exists');
    });
  });

  describe('findActiveByToken', () => {
    it('looks up the portal access by hashed token', async () => {
      portalAccessRepository.findOne.mockResolvedValue(buildPortalAccess());

      const result = await service.findActiveByToken('raw-token');

      expect(portalAccessRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tokenHash: hashPortalToken('raw-token'),
          }),
        }),
      );
      expect(result).not.toBeNull();
    });

    it('returns null for a revoked portal access', async () => {
      portalAccessRepository.findOne.mockResolvedValue(null);

      expect(await service.findActiveByToken('raw-token')).toBeNull();
    });

    it('returns null for an expired portal access', async () => {
      portalAccessRepository.findOne.mockResolvedValue(
        buildPortalAccess({ expiresAt: new Date(Date.now() - 1000) }),
      );

      expect(await service.findActiveByToken('raw-token')).toBeNull();
    });
  });

  describe('revoke', () => {
    it('sets revokedAt', async () => {
      const portalAccess = buildPortalAccess();

      portalAccessRepository.findOne.mockResolvedValue(portalAccess);

      const revoked = await service.revoke({
        id: portalAccess.id,
        workspaceId: WORKSPACE_ID,
      });

      expect(revoked.revokedAt).not.toBeNull();
      expect(portalAccessRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('throws when the portal access does not exist in the workspace', async () => {
      portalAccessRepository.findOne.mockResolvedValue(null);

      await expect(
        service.revoke({ id: 'unknown-id', workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('regenerate', () => {
    it('revokes the predecessor and issues a new hashed token', async () => {
      const predecessor = buildPortalAccess();

      portalAccessRepository.findOne.mockResolvedValue(predecessor);

      const { portalAccess, token } = await service.regenerate({
        id: predecessor.id,
        workspaceId: WORKSPACE_ID,
      });

      expect(predecessor.revokedAt).not.toBeNull();
      expect(portalAccess.id).not.toBe(predecessor.id);
      expect(portalAccess.companyId).toBe(predecessor.companyId);
      expect(portalAccess.tokenHash).toBe(hashPortalToken(token));
    });
  });
});
