import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryClientPortalAccessEntity } from 'src/modules/delivery/deliverables/entities/delivery-client-portal-access.entity';
import {
  buildPortalSlug,
  generateClientAccessCode,
  hashClientAccessCode,
  isUuidString,
  managePortalAccessSchema,
  maskClientAccessCode,
  validateCustomAccessCode,
  validatePortalSlug,
  verifyClientAccessCodeHash,
} from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
import { DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

export type ClientPortalAccessDTO = {
  id: string;
  companyId: string;
  slug: string;
  portalPath: string;
  accessCode: string;
  activeCode: string;
  codeHint: string;
  isActive: boolean;
  isExpired: boolean;
  codeSetAt: string;
  codeRotatedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  brandLogoAssetId: string | null;
  brandAccentColor: string | null;
  welcomeNote: string;
  showDriveLinks: boolean;
  visibleServiceOverrides: Record<string, boolean>;
};

@Injectable()
export class DeliveryClientPortalAccessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly encryption: SecretEncryptionService,
    private readonly companies: DeliveryClientSetupSourceService,
    private readonly twentyConfigService?: TwentyConfigService,
  ) {}

  private codePepper(): string {
    return this.twentyConfigService?.get('APP_SECRET') || '';
  }

  private identity(auth: WorkspaceAuthContext) {
    if (auth.type !== 'user') {
      throw new ForbiddenException('Sign in to manage client portal access.');
    }
    return {
      workspaceId: auth.workspace.id,
      memberId: auth.workspaceMemberId,
      userWorkspaceId: auth.userWorkspaceId,
    };
  }

  private async authorizeManager(
    auth: WorkspaceAuthContext,
    manager: EntityManager,
  ) {
    const identity = this.identity(auth);
    const workspace = await manager
      .getRepository(WorkspaceEntity)
      .findOneByOrFail({ id: identity.workspaceId });
    const actor = await this.delivery.actor(
      workspace,
      identity.memberId,
      identity.userWorkspaceId,
      manager,
    );
    if (!actor.isManager) {
      throw new ForbiddenException(
        'Delivery management access is required to view or change client portal access codes.',
      );
    }
    return { identity, workspace, actor };
  }

  private toDto(
    row: DeliveryClientPortalAccessEntity,
    decryptedCode: string,
  ): ClientPortalAccessDTO {
    const now = Date.now();
    const isExpired = row.expiresAt ? row.expiresAt.getTime() <= now : false;
    const codeTimestamp = row.codeSetAt.toISOString();
    return {
      id: row.id,
      companyId: row.companyId,
      slug: row.slug,
      portalPath: `/client/${row.slug}`,
      accessCode: decryptedCode,
      activeCode: decryptedCode,
      codeHint: maskClientAccessCode(decryptedCode),
      isActive: !row.revokedAt && !isExpired,
      isExpired,
      codeSetAt: codeTimestamp,
      codeRotatedAt: codeTimestamp,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      lastAccessedAt: row.lastAccessedAt
        ? row.lastAccessedAt.toISOString()
        : null,
      brandLogoAssetId: row.brandLogoAssetId,
      brandAccentColor: row.brandAccentColor,
      welcomeNote: row.welcomeNote,
      showDriveLinks: row.showDriveLinks,
      visibleServiceOverrides: row.visibleServiceOverrides ?? {},
    };
  }

  private async allocateUniqueSlug(
    manager: EntityManager,
    preferredName: string,
    companyId: string,
  ): Promise<string> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['delivery-portal-slug-allocation'],
    );
    const base = buildPortalSlug(preferredName, companyId);
    const repo = manager.getRepository(DeliveryClientPortalAccessEntity);
    let candidate = base;
    for (let suffix = 0; suffix < 20; suffix += 1) {
      const existing = await repo.findOne({ where: { slug: candidate } });
      if (!existing || existing.companyId === companyId) {
        return candidate;
      }
      candidate = `${base.slice(0, 56)}-${suffix + 2}`;
    }
    return `${base.slice(0, 50)}-${companyId.slice(0, 8)}`;
  }

  async getForCompany(
    auth: WorkspaceAuthContext,
    companyId: string,
  ): Promise<ClientPortalAccessDTO | null> {
    if (!isUuidString(companyId)) {
      throw new BadRequestException('Invalid company ID.');
    }
    const identity = this.identity(auth);
    return this.dataSource.transaction(async (manager) => {
      await this.authorizeManager(auth, manager);
      const row = await manager
        .getRepository(DeliveryClientPortalAccessEntity)
        .createQueryBuilder('access')
        .addSelect('access.encryptedCode')
        .where(
          'access.workspaceId = :workspaceId AND access.companyId = :companyId',
          { workspaceId: identity.workspaceId, companyId },
        )
        .getOne();
      if (!row) return null;
      const decrypted = this.encryption.decryptVersionedOrThrow(
        row.encryptedCode,
        { workspaceId: identity.workspaceId },
      );
      return this.toDto(row, decrypted);
    });
  }

  async listForWorkspace(
    auth: WorkspaceAuthContext,
  ): Promise<ClientPortalAccessDTO[]> {
    const identity = this.identity(auth);
    return this.dataSource.transaction(async (manager) => {
      await this.authorizeManager(auth, manager);
      const rows = await manager
        .getRepository(DeliveryClientPortalAccessEntity)
        .createQueryBuilder('access')
        .addSelect('access.encryptedCode')
        .where('access.workspaceId = :workspaceId', {
          workspaceId: identity.workspaceId,
        })
        .orderBy('access.updatedAt', 'DESC')
        .getMany();
      return rows.map((row) =>
        this.toDto(
          row,
          this.encryption.decryptVersionedOrThrow(row.encryptedCode, {
            workspaceId: identity.workspaceId,
          }),
        ),
      );
    });
  }

  async manage(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<ClientPortalAccessDTO> {
    const parsed = managePortalAccessSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid portal access command.',
      );
    }
    const command = parsed.data;
    const identity = this.identity(auth);

    // Authorize manager BEFORE querying CRM companies to prevent 404 vs 403 existence oracle.
    await this.dataSource.transaction(async (manager) => {
      await this.authorizeManager(auth, manager);
    });

    let resolvedCompanyName =
      'companyName' in command ? command.companyName : undefined;
    if (command.action === 'generate' || command.action === 'setCustom') {
      const companies = await this.companies.listByIds(auth, [
        command.companyId,
      ]);
      if (!companies.length) {
        throw new NotFoundException(
          'Client company was not found with your current CRM access.',
        );
      }
      resolvedCompanyName = resolvedCompanyName || companies[0].name;
    }

    return this.dataSource.transaction(async (manager) => {
      await this.authorizeManager(auth, manager);
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery-portal-access:${identity.workspaceId}:${command.companyId}`],
      );
      const repo = manager.getRepository(DeliveryClientPortalAccessEntity);

      const existing = await repo
        .createQueryBuilder('access')
        .addSelect('access.encryptedCode')
        .where(
          'access.workspaceId = :workspaceId AND access.companyId = :companyId',
          { workspaceId: identity.workspaceId, companyId: command.companyId },
        )
        .getOne();

      if (command.action === 'generate' || command.action === 'setCustom') {
        let plainCode: string;
        try {
          plainCode =
            command.action === 'generate'
              ? generateClientAccessCode()
              : validateCustomAccessCode(command.code);
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }
        const encryptedCode = this.encryption.encryptVersioned(
          plainCode as PlaintextString,
          { workspaceId: identity.workspaceId },
        );
        const codeHash = hashClientAccessCode(plainCode, this.codePepper());
        const expiresAt =
          command.expiresAt === undefined
            ? (existing?.expiresAt ?? null)
            : command.expiresAt
              ? new Date(command.expiresAt)
              : null;

        let saved: DeliveryClientPortalAccessEntity;
        if (existing) {
          existing.codeHash = codeHash;
          existing.encryptedCode = encryptedCode;
          existing.codeSetBy = identity.memberId;
          existing.codeSetAt = new Date();
          existing.expiresAt = expiresAt;
          existing.revokedAt = null;
          saved = await repo.save(existing);
        } else {
          const slug = await this.allocateUniqueSlug(
            manager,
            resolvedCompanyName ?? 'client',
            command.companyId,
          );
          saved = await repo.save(
            repo.create({
              workspaceId: identity.workspaceId,
              companyId: command.companyId,
              slug,
              codeHash,
              encryptedCode,
              codeSetBy: identity.memberId,
              codeSetAt: new Date(),
              expiresAt,
              revokedAt: null,
              welcomeNote: '',
              showDriveLinks: true,
              visibleServiceOverrides: {},
            }),
          );
        }

        await recordOtogrowActivity(manager, {
          workspaceId: identity.workspaceId,
          actorId: identity.memberId,
          category: 'CLIENT',
          action:
            command.action === 'generate'
              ? 'CLIENT_PORTAL_CODE_GENERATED'
              : 'CLIENT_PORTAL_CODE_SET',
          outcome: 'RECORDED',
          summary:
            command.action === 'generate'
              ? 'Generated a new client dashboard access code.'
              : 'Set a custom client dashboard access code.',
          sourceType: 'client-portal-access',
          sourceId: command.companyId,
          changes: [{ field: 'portalSlug', before: null, after: saved.slug }],
        });

        return this.toDto(saved, plainCode);
      }

      if (!existing) {
        throw new NotFoundException(
          'Generate or set a portal access code for this client first.',
        );
      }

      if (command.action === 'revoke') {
        existing.revokedAt = new Date();
        const saved = await repo.save(existing);
        await recordOtogrowActivity(manager, {
          workspaceId: identity.workspaceId,
          actorId: identity.memberId,
          category: 'CLIENT',
          action: 'CLIENT_PORTAL_CODE_REVOKED',
          outcome: 'RECORDED',
          summary: 'Revoked client dashboard access code.',
          sourceType: 'client-portal-access',
          sourceId: command.companyId,
          changes: [{ field: 'revokedAt', before: null, after: 'revoked' }],
        });
        const decrypted = this.encryption.decryptVersionedOrThrow(
          existing.encryptedCode,
          { workspaceId: identity.workspaceId },
        );
        return this.toDto(saved, decrypted);
      }

      if (command.action === 'restore') {
        existing.revokedAt = null;
        existing.codeSetAt = new Date();
        if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
          existing.expiresAt = null;
        }
        const saved = await repo.save(existing);
        const decrypted = this.encryption.decryptVersionedOrThrow(
          existing.encryptedCode,
          { workspaceId: identity.workspaceId },
        );
        return this.toDto(saved, decrypted);
      }

      // updateSettings
      if (command.slug !== undefined) {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          ['delivery-portal-slug-allocation'],
        );
        let normalizedSlug: string;
        try {
          normalizedSlug = validatePortalSlug(command.slug);
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }
        const collision = await repo.findOne({
          where: { slug: normalizedSlug },
        });
        if (collision && collision.id !== existing.id) {
          throw new ConflictException(
            'That portal URL slug is already in use by another client.',
          );
        }
        existing.slug = normalizedSlug;
      }
      if (command.expiresAt !== undefined) {
        existing.expiresAt = command.expiresAt
          ? new Date(command.expiresAt)
          : null;
      }
      if (command.welcomeNote !== undefined) {
        existing.welcomeNote = command.welcomeNote;
      }
      if (command.brandAccentColor !== undefined) {
        existing.brandAccentColor = command.brandAccentColor;
      }
      if (command.showDriveLinks !== undefined) {
        existing.showDriveLinks = command.showDriveLinks;
      }
      if (command.visibleServiceOverrides !== undefined) {
        existing.visibleServiceOverrides = command.visibleServiceOverrides;
      }

      const saved = await repo.save(existing);
      const decrypted = this.encryption.decryptVersionedOrThrow(
        existing.encryptedCode,
        { workspaceId: identity.workspaceId },
      );
      return this.toDto(saved, decrypted);
    });
  }

  async verifyPortalLogin(
    slug: string,
    providedCode: string,
  ): Promise<DeliveryClientPortalAccessEntity | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug || !providedCode.trim()) return null;

    const repo = this.dataSource.getRepository(
      DeliveryClientPortalAccessEntity,
    );
    const record = await repo.findOne({ where: { slug: normalizedSlug } });
    if (!record) return null;
    if (record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    if (
      !verifyClientAccessCodeHash(
        providedCode,
        record.codeHash,
        this.codePepper(),
      )
    ) {
      return null;
    }
    await repo.update({ id: record.id }, { lastAccessedAt: new Date() });
    return record;
  }

  async verifyByAccessCodeOnly(
    providedCode: string,
  ): Promise<DeliveryClientPortalAccessEntity | null> {
    if (!providedCode.trim()) return null;
    const pepper = this.codePepper();
    const codeHash = hashClientAccessCode(providedCode, pepper);
    const repo = this.dataSource.getRepository(
      DeliveryClientPortalAccessEntity,
    );
    const candidates = await repo.find({
      where: { codeHash, revokedAt: IsNull() },
      take: 5,
    });
    const now = Date.now();
    const valid = candidates.filter(
      (row) =>
        !row.revokedAt &&
        (!row.expiresAt || row.expiresAt.getTime() > now) &&
        verifyClientAccessCodeHash(providedCode, row.codeHash, pepper),
    );
    // Only allow direct code-only login when it uniquely identifies one active client portal.
    if (valid.length !== 1) return null;
    const match = valid[0];
    await repo.update({ id: match.id }, { lastAccessedAt: new Date() });
    return match;
  }
}
