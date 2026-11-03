import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { v5 } from 'uuid';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import {
  microToUsd,
  usdToMicro,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryAtlasConnectionEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-connection.entity';
import { DeliveryAtlasCredentialEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-credential.entity';
import { DeliveryAtlasAdapter } from 'src/modules/delivery/creative/atlas/delivery-atlas.adapter';
import {
  ATLAS_IMAGE_FAMILIES,
  ATLAS_PROFILES,
  ATLAS_SCHEMA_REVISION,
  atlasProfile,
  normalizeAtlasParameters,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.catalog';
import {
  atlasRevisionSchema,
  atlasSettingsSchema,
  parseAtlasInput,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.policy';
import {
  type DeliveryAtlasProfileDTO,
  type DeliveryAtlasRevisionInput,
  type DeliveryAtlasSettingsDTO,
  type DeliveryAtlasSettingsInput,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.dto';

@Injectable()
export class DeliveryAtlasConnectionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly encryption: SecretEncryptionService,
    private readonly adapter: DeliveryAtlasAdapter,
  ) {}
  async lock(manager: EntityManager, workspaceId: string) {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`delivery:${workspaceId}`],
    );
  }
  async current(manager: EntityManager, workspaceId: string) {
    return manager
      .getRepository(DeliveryAtlasConnectionEntity)
      .findOneBy({ workspaceId });
  }
  limit(connection: DeliveryAtlasConnectionEntity, profileId: string) {
    const limit = connection.reservationLimits.find(
      (candidate) => candidate.profileId === profileId,
    );
    if (!limit)
      throw new BadRequestException(
        'Ask an administrator to verify this model’s maximum reservation.',
      );
    return {
      ...limit,
      id: limit.id ?? v5(`atlas-price:${profileId}`, connection.id),
      revision: limit.revision ?? 1,
    };
  }
  async secret(
    manager: EntityManager,
    workspaceId: string,
    credentialId: string,
  ): Promise<string> {
    const credential = await manager
      .getRepository(DeliveryAtlasCredentialEntity)
      .createQueryBuilder('credential')
      .addSelect('credential.apiKey')
      .where('credential."workspaceId"=:workspaceId', { workspaceId })
      .andWhere('credential.id=:credentialId', { credentialId })
      .getOne();
    if (!credential || credential.revokedAt)
      throw new ForbiddenException(
        'This Atlas credential was removed. Its accepted jobs require reconciliation.',
      );
    return this.encryption.decryptVersionedOrThrow(credential.apiKey, {
      workspaceId,
    });
  }
  private async administrator(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (!actor.isAdmin)
      throw new ForbiddenException(
        'Only an administrator can configure Atlas models and credentials.',
      );
    return actor;
  }
  profiles(
    connection: DeliveryAtlasConnectionEntity | null,
  ): DeliveryAtlasProfileDTO[] {
    return ATLAS_PROFILES.map((profile) => {
      const enabled =
        connection?.enabledProfileIds.includes(profile.id) === true;
      const blockedReasons = [
        ...(!connection?.credentialId ? ['CONNECTION_MISSING'] : []),
        ...(!connection?.enabled ? ['CONNECTION_PAUSED'] : []),
        ...(!connection?.verifiedAt ? ['CONNECTION_UNVERIFIED'] : []),
        ...(!enabled ? ['MODEL_DISABLED'] : []),
        ...(!connection?.reservationLimits.some(
          (limit) => limit.profileId === profile.id,
        )
          ? ['RESERVATION_LIMIT_MISSING']
          : []),
        ...(profile.estimatedBilling ? ['UNBOUNDED_ESTIMATED_BILLING'] : []),
      ];
      return {
        id: profile.id,
        familyId: profile.familyId,
        label: profile.label,
        kind: profile.kind,
        operation: profile.operation,
        schemaRevision: ATLAS_SCHEMA_REVISION,
        enabled,
        available: blockedReasons.length === 0,
        blockedReasons,
        minimumReferences: profile.minimumReferences,
        maximumReferences: profile.maximumReferences,
        parameters: profile.parameters,
      };
    });
  }
  private result(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    connection: DeliveryAtlasConnectionEntity | null,
  ): DeliveryAtlasSettingsDTO {
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      revision: connection?.revision ?? 0,
      enabled: connection?.enabled ?? false,
      keyConfigured: Boolean(connection?.credentialId),
      verificationStatus: !connection?.credentialId
        ? 'MISSING'
        : connection.verifiedAt
          ? 'VERIFIED'
          : 'UNVERIFIED',
      verifiedAt: connection?.verifiedAt?.toISOString() ?? null,
      defaultImageFamilyId: connection?.defaultImageFamilyId ?? null,
      defaultClipProfileId: connection?.defaultClipProfileId ?? null,
      enabledProfileIds: connection?.enabledProfileIds ?? [],
      reservationLimits: connection?.reservationLimits ?? [],
      families: ATLAS_IMAGE_FAMILIES,
      profiles: this.profiles(connection),
    };
  }
  async settings(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ): Promise<DeliveryAtlasSettingsDTO> {
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        await this.administrator(manager, workspace, memberId, userWorkspaceId);
        return this.result(
          workspace,
          memberId,
          userWorkspaceId,
          await this.current(manager, workspace.id),
        );
      },
    );
  }
  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasSettingsInput,
  ): Promise<DeliveryAtlasSettingsDTO> {
    const command = parseAtlasInput(atlasSettingsSchema, input);
    command.enabledProfileIds.forEach(atlasProfile);
    if (
      new Set(command.enabledProfileIds).size !==
        command.enabledProfileIds.length ||
      new Set(command.reservationLimits.map((limit) => limit.profileId))
        .size !== command.reservationLimits.length
    )
      throw new BadRequestException(
        'Select each model and reservation limit once.',
      );
    command.reservationLimits.forEach((limit) => {
      atlasProfile(limit.profileId);
      if (Date.parse(limit.verifiedAt) > Date.now())
        throw new BadRequestException(
          'Reservation verification cannot be in the future.',
        );
      limit.verifiedAt = new Date(limit.verifiedAt).toISOString();
      limit.maximumCostUsd = microToUsd(usdToMicro(limit.maximumCostUsd));
    });
    if (
      command.defaultImageFamilyId &&
      !ATLAS_IMAGE_FAMILIES.some(
        (family) =>
          family.id === command.defaultImageFamilyId &&
          command.enabledProfileIds.some(
            (id) => atlasProfile(id).familyId === family.id,
          ),
      )
    )
      throw new BadRequestException(
        'Choose an enabled image family for the default.',
      );
    if (
      command.defaultClipProfileId &&
      (!command.enabledProfileIds.includes(command.defaultClipProfileId) ||
        atlasProfile(command.defaultClipProfileId).kind !== 'CLIP')
    )
      throw new BadRequestException(
        'Choose an enabled image-to-video default.',
      );
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id);
      await this.administrator(manager, workspace, memberId, userWorkspaceId);
      const repository = manager.getRepository(DeliveryAtlasConnectionEntity),
        current = await this.current(manager, workspace.id);
      if ((current?.revision ?? 0) !== command.revision)
        throw new ConflictException(
          'Atlas settings changed. Reload before saving.',
        );
      let credentialId = current?.credentialId ?? null;
      if (command.apiKey) {
        if (command.apiKey.startsWith('enc:'))
          throw new BadRequestException(
            'Enter a new plaintext Atlas API key in the secure settings field.',
          );
        const credential = await manager
          .getRepository(DeliveryAtlasCredentialEntity)
          .save({
            workspaceId: workspace.id,
            apiKey: this.encryption.encryptVersioned(
              command.apiKey as PlaintextString,
              { workspaceId: workspace.id },
            ),
            createdBy: memberId,
            revokedAt: null,
          });
        credentialId = credential.id;
      }
      if (command.enabled && !credentialId)
        throw new BadRequestException(
          'Save an Atlas API key before enabling generation.',
        );
      const connectionId = current?.id ?? randomUUID();
      const reservationLimits = command.reservationLimits.map((limit) => {
        const prior = current?.reservationLimits.find(
          (candidate) => candidate.profileId === limit.profileId,
        );
        const unchanged =
          prior &&
          prior.maximumCostUsd === limit.maximumCostUsd &&
          prior.source === limit.source &&
          prior.verifiedAt === limit.verifiedAt;
        return {
          ...limit,
          id: prior?.id ?? v5(`atlas-price:${limit.profileId}`, connectionId),
          revision: prior ? (prior.revision ?? 1) + (unchanged ? 0 : 1) : 1,
        };
      });
      const saved = await repository.save({
        ...current,
        id: connectionId,
        workspaceId: workspace.id,
        revision: command.revision + 1,
        enabled: command.enabled,
        credentialId,
        enabledProfileIds: command.enabledProfileIds,
        defaultImageFamilyId: command.defaultImageFamilyId,
        defaultClipProfileId: command.defaultClipProfileId,
        reservationLimits,
        verifiedAt: command.apiKey ? null : (current?.verifiedAt ?? null),
      });
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'DELIVERY',
        action: 'ATLAS_SETTINGS_UPDATED',
        outcome: 'RECORDED',
        summary: 'Updated Atlas model access, reservation limits and defaults.',
        sourceType: 'connection',
        sourceId: saved.id,
        changes: [
          {
            field: 'revision',
            before: String(command.revision),
            after: String(saved.revision),
          },
        ],
      });
      return this.result(workspace, memberId, userWorkspaceId, saved);
    });
  }
  async verify(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasRevisionInput,
  ): Promise<DeliveryAtlasSettingsDTO> {
    const command = parseAtlasInput(atlasRevisionSchema, input);
    const connection = await readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        await this.administrator(manager, workspace, memberId, userWorkspaceId);
        const current = await this.current(manager, workspace.id);
        if (!current?.credentialId || current.revision !== command.revision)
          throw new ConflictException(
            'Reload the saved Atlas connection before verifying it.',
          );
        return {
          revision: current.revision,
          credentialId: current.credentialId,
          key: await this.secret(manager, workspace.id, current.credentialId),
        };
      },
    );
    const profile = atlasProfile('google/nano-banana-pro/text-to-image');
    await this.adapter.calculate(
      connection.key,
      this.adapter.body(
        profile,
        'Connection verification only. No generation request.',
        normalizeAtlasParameters(profile, {}),
        [],
      ),
    );
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id);
      await this.administrator(manager, workspace, memberId, userWorkspaceId);
      const current = await this.current(manager, workspace.id);
      if (
        !current ||
        current.revision !== connection.revision ||
        current.credentialId !== connection.credentialId
      )
        throw new ConflictException(
          'The connection changed during verification. Verify its current version.',
        );
      current.verifiedAt = new Date();
      await manager.getRepository(DeliveryAtlasConnectionEntity).save(current);
      return this.result(workspace, memberId, userWorkspaceId, current);
    });
  }
  async remove(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasRevisionInput,
  ): Promise<DeliveryAtlasSettingsDTO> {
    const command = parseAtlasInput(atlasRevisionSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id);
      await this.administrator(manager, workspace, memberId, userWorkspaceId);
      const current = await this.current(manager, workspace.id);
      if ((current?.revision ?? 0) !== command.revision)
        throw new ConflictException(
          'Reload current Atlas settings before removal.',
        );
      if (!current)
        return this.result(workspace, memberId, userWorkspaceId, null);
      await manager
        .getRepository(DeliveryAtlasCredentialEntity)
        .createQueryBuilder()
        .update()
        .set({ revokedAt: new Date() })
        .where('"workspaceId"=:workspaceId', { workspaceId: workspace.id })
        .andWhere('"revokedAt" IS NULL')
        .execute();
      current.credentialId = null;
      current.enabled = false;
      current.verifiedAt = null;
      current.revision++;
      await manager.getRepository(DeliveryAtlasConnectionEntity).save(current);
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'DELIVERY',
        action: 'ATLAS_CONNECTION_REMOVED',
        outcome: 'RECORDED',
        summary:
          'Removed Atlas credentials and paused new generation. Existing cost evidence remains.',
        sourceType: 'connection',
        sourceId: current.id,
      });
      return this.result(workspace, memberId, userWorkspaceId, current);
    });
  }
}
