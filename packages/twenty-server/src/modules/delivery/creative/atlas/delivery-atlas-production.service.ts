import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { isCreativeAssetApproved } from 'src/modules/delivery/creative/delivery-creative.policy';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { DeliveryAtlasConnectionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-connection.service';
import {
  ATLAS_IMAGE_FAMILIES,
  ATLAS_MODEL_PREFIX,
  ATLAS_SCHEMA_REVISION,
  atlasProfile,
  normalizeAtlasParameters,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.catalog';
import {
  atlasProductionAccessSchema,
  atlasProductionSchema,
  parseAtlasInput,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.policy';
import { type AtlasFrozenRequest } from 'src/modules/delivery/creative/atlas/delivery-atlas.types';
import {
  type DeliveryAtlasProductionDTO,
  type DeliveryAtlasProductionAccessInput,
  type DeliveryAtlasProductionInput,
  type DeliveryAtlasQuoteInput,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.dto';

@Injectable()
export class DeliveryAtlasProductionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly creative: DeliveryCreativeService,
    private readonly connections: DeliveryAtlasConnectionService,
  ) {}
  async read(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasProductionInput,
  ): Promise<DeliveryAtlasProductionDTO> {
    const command = parseAtlasInput(atlasProductionSchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.creative.scope(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            command.taskId,
          ),
          document = scope.task.details.creative;
        const connection = await this.connections.current(
            manager,
            workspace.id,
          ),
          settings = document?.mediaSettings;
        const role = scope.actor.isAdmin
          ? 'ADMIN'
          : scope.actor.isManager
            ? 'MANAGER'
            : 'MEMBER';
        const blockedReasons = [
          ...(!document ? ['PRODUCTION_MISSING'] : []),
          ...(!settings?.enabled ? ['PRODUCTION_DISABLED'] : []),
          ...(!settings?.roles.includes(role)
            ? ['PRODUCTION_ROLE_DISABLED']
            : []),
          ...(!scope.actor.isManager && scope.assigneeId !== memberId
            ? ['NOT_PRODUCTION_ASSIGNEE']
            : []),
          ...(['IN_REVIEW', 'APPROVED'].includes(scope.task.details.state)
            ? ['PRODUCTION_LOCKED']
            : []),
        ];
        const profiles = this.connections
          .profiles(connection)
          .map((profile) => {
            const reasons = [
              ...profile.blockedReasons,
              ...blockedReasons,
              ...(!settings?.modelIds.includes(
                `${ATLAS_MODEL_PREFIX}${profile.id}`,
              )
                ? ['PRODUCTION_MODEL_DISABLED']
                : []),
            ];
            return {
              ...profile,
              available: reasons.length === 0,
              blockedReasons: reasons,
            };
          });
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          taskId: command.taskId,
          taskRevision: scope.task.revision,
          briefVersion: document?.briefVersion ?? 0,
          settingsVersion: settings?.version ?? 0,
          configurationRevision: connection?.revision ?? 0,
          outputKind: document?.brief.outputKind ?? 'VIDEO',
          briefApproved: Boolean(
            document && document.approvedBriefVersion === document.briefVersion,
          ),
          canManageAccess: scope.actor.isAdmin,
          enabled: settings?.enabled ?? false,
          roles: settings?.roles ?? [],
          allowedProfileIds: (settings?.modelIds ?? [])
            .filter((id) => id.startsWith(ATLAS_MODEL_PREFIX))
            .map((id) => id.slice(ATLAS_MODEL_PREFIX.length)),
          dailyRunLimit: settings?.dailyRunLimit ?? 1,
          defaultImageFamilyId: connection?.defaultImageFamilyId ?? null,
          defaultClipProfileId: connection?.defaultClipProfileId ?? null,
          profiles,
          families: ATLAS_IMAGE_FAMILIES,
          assets: (document?.assets ?? [])
            .filter(
              (asset) =>
                asset.mimeType.startsWith('image/') &&
                asset.size <= 6000000 &&
                isCreativeAssetApproved(document!, asset),
            )
            .map(({ id, name, mimeType, size }) => ({
              id,
              name,
              mimeType,
              size,
            })),
          shots: (document?.shots ?? []).map(
            ({
              id,
              version,
              title,
              imagePrompt,
              animationPrompt,
              imageId,
            }) => ({
              id,
              version,
              title,
              imagePrompt,
              animationPrompt,
              imageId,
            }),
          ),
          blockedReasons,
        };
      },
    );
  }
  async configure(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasProductionAccessInput,
  ): Promise<DeliveryAtlasProductionDTO> {
    const command = parseAtlasInput(atlasProductionAccessSchema, input);
    command.profileIds.forEach(atlasProfile);
    if (
      new Set(command.profileIds).size !== command.profileIds.length ||
      new Set(command.roles).size !== command.roles.length
    )
      throw new BadRequestException('Choose each role and model once.');
    await this.creative.modify(
      workspace,
      memberId,
      userWorkspaceId,
      command.taskId,
      command.taskRevision,
      async (document, scope) => {
        if (!scope.actor.isAdmin)
          throw new ForbiddenException(
            'Only an administrator can change production model access.',
          );
        document.mediaSettings = {
          version: (document.mediaSettings?.version ?? 0) + 1,
          enabled: command.enabled,
          roles: command.roles,
          modelIds: [
            ...(document.mediaSettings?.modelIds ?? []).filter(
              (id) => !id.startsWith(ATLAS_MODEL_PREFIX),
            ),
            ...command.profileIds.map((id) => `${ATLAS_MODEL_PREFIX}${id}`),
          ],
          dailyRunLimit: command.dailyRunLimit,
          allowUnknownCost: false,
        };
      },
      'Updated explicit production model access',
    );
    return this.read(workspace, memberId, userWorkspaceId, {
      taskId: command.taskId,
    });
  }
  async freeze(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasQuoteInput,
  ): Promise<AtlasFrozenRequest> {
    const scope = await this.creative.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      input.taskId,
    );
    if (scope.task.revision !== input.taskRevision)
      throw new ConflictException(
        'The task changed. Reload before estimating generation.',
      );
    const document = scope.task.details.creative;
    if (!document || document.approvedBriefVersion !== document.briefVersion)
      throw new BadRequestException(
        'Approve the current creative brief first.',
      );
    const profile = atlasProfile(input.profileId),
      parameters = normalizeAtlasParameters(profile, input.parameters);
    if (profile.estimatedBilling)
      throw new BadRequestException(
        'This model has unbounded estimated billing. It is unavailable until a verifiable reservation ceiling is supported.',
      );
    const shot = input.shotId
      ? document.shots.find((candidate) => candidate.id === input.shotId)
      : null;
    if (
      input.target === 'BRIEF'
        ? document.brief.outputKind !== 'IMAGE' ||
          profile.kind !== 'IMAGE' ||
          input.shotId !== null
        : !shot || document.brief.outputKind === 'IMAGE'
    )
      throw new BadRequestException(
        'Use the approved static image brief or an existing video shot.',
      );
    const referenceAssetIds = [...input.referenceAssetIds];
    if (
      new Set(referenceAssetIds).size !== referenceAssetIds.length ||
      referenceAssetIds.length < profile.minimumReferences ||
      referenceAssetIds.length > profile.maximumReferences
    )
      throw new BadRequestException(
        'Select the supported number of approved reference images for this exact operation.',
      );
    if (
      profile.kind === 'CLIP' &&
      (!shot?.imageId ||
        referenceAssetIds.length !== 1 ||
        referenceAssetIds[0] !== shot.imageId)
    )
      throw new BadRequestException(
        'Select the shot’s exact current approved source image.',
      );
    const request: AtlasFrozenRequest = {
      profileId: profile.id,
      familyId: profile.familyId,
      modelLabel: profile.label,
      kind: profile.kind,
      operation: profile.operation,
      schemaRevision: ATLAS_SCHEMA_REVISION,
      taskRevision: input.taskRevision,
      briefVersion: document.briefVersion,
      productionVersion: document.productionVersion,
      assemblyVersion: document.assemblyVersion,
      settingsVersion: document.mediaSettings?.version ?? 0,
      target: input.target as 'BRIEF' | 'SHOT',
      shotId: shot?.id ?? null,
      shotVersion: shot?.version ?? null,
      prompt: `${input.prompt}\nApproved brief: ${JSON.stringify(document.brief)}`,
      referenceAssetIds,
      parameters,
    };
    if (
      request.prompt.length >
      (profile.familyId === 'kling-3-pro' ? 2500 : 20000)
    )
      throw new BadRequestException(
        'The prompt and approved brief exceed this model’s supported prompt length. Shorten the approved inputs before estimating.',
      );
    await this.validate(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      input.taskId,
      request,
    );
    return request;
  }
  async validate(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
    request: AtlasFrozenRequest,
  ) {
    const scope = await this.creative.scope(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        taskId,
      ),
      document = scope.task.details.creative,
      connection = await this.connections.current(manager, workspace.id);
    if (!scope.actor.isManager && scope.assigneeId !== memberId)
      throw new ForbiddenException(
        'Only the production assignee or manager can generate media.',
      );
    const role = scope.actor.isAdmin
      ? 'ADMIN'
      : scope.actor.isManager
        ? 'MANAGER'
        : 'MEMBER';
    if (
      !document ||
      ['IN_REVIEW', 'APPROVED'].includes(scope.task.details.state) ||
      !document.mediaSettings?.enabled ||
      !document.mediaSettings.roles.includes(role) ||
      !document.mediaSettings.modelIds.includes(
        `${ATLAS_MODEL_PREFIX}${request.profileId}`,
      )
    )
      throw new ForbiddenException(
        'Current production access does not permit this model and role.',
      );
    if (
      !connection?.enabled ||
      !connection.credentialId ||
      !connection.verifiedAt ||
      !connection.enabledProfileIds.includes(request.profileId)
    )
      throw new ForbiddenException(
        'This Atlas connection or model is currently unavailable.',
      );
    if (
      document.briefVersion !== request.briefVersion ||
      document.approvedBriefVersion !== request.briefVersion ||
      document.productionVersion !== request.productionVersion ||
      document.assemblyVersion !== request.assemblyVersion ||
      request.schemaRevision !== ATLAS_SCHEMA_REVISION
    )
      throw new ConflictException(
        'The approved production inputs changed. The earlier generation cannot replace them.',
      );
    const shot = request.shotId
      ? document.shots.find((candidate) => candidate.id === request.shotId)
      : null;
    if (
      request.target === 'BRIEF'
        ? document.brief.outputKind !== 'IMAGE'
        : !shot ||
          shot.version !== request.shotVersion ||
          (request.kind === 'CLIP' &&
            shot.imageId !== request.referenceAssetIds[0])
    )
      throw new ConflictException(
        'This generation’s exact brief or shot source changed.',
      );
    for (const id of request.referenceAssetIds) {
      const asset = document.assets.find((candidate) => candidate.id === id);
      if (
        !asset ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType) ||
        asset.size > 6000000 ||
        !isCreativeAssetApproved(document, asset)
      )
        throw new ConflictException(
          'A selected approved reference is no longer current or supported.',
        );
    }
    return { scope, document, connection };
  }
}
