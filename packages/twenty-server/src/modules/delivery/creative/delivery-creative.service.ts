import { Cron } from '@nestjs/schedule';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { v4 } from 'uuid';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import {
  creativeCommandSchema,
  newCreativeDocument,
  type CreativeAsset,
  type CreativeDocument,
} from 'src/modules/delivery/creative/delivery-creative.types';
import {
  invalidateCreativeAssembly,
  isCreativeAssetApproved,
  isCreativeAssetCurrent,
} from 'src/modules/delivery/creative/delivery-creative.policy';

@Injectable()
export class DeliveryCreativeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly storage: FileStorageDriverFactory,
  ) {}

  async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
  ) {
    if (!z.string().uuid().safeParse(taskId).success)
      throw new NotFoundException();
    const active: { id: string }[] = await manager.query(
      `SELECT m.id FROM ${this.delivery.schema(workspace)}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" WHERE m.id=$1 AND u.id=$2 AND u."workspaceId"=$3 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL`,
      [memberId, userWorkspaceId, workspace.id],
    );
    if (!active.length) throw new ForbiddenException();
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    const task = await manager
      .getRepository(DeliveryTaskEntity)
      .findOneBy({ workspaceId: workspace.id, taskId });
    const project =
      task &&
      (await manager
        .getRepository(DeliveryProjectEntity)
        .findOneBy({ workspaceId: workspace.id, id: task.projectId }));
    const native: { assigneeId: string }[] = await manager.query(
      `SELECT "assigneeId" FROM ${this.delivery.schema(workspace)}.task WHERE id=$1 AND "deletedAt" IS NULL`,
      [taskId],
    );
    if (
      !task ||
      !project ||
      !native[0] ||
      !canAccessDeliveryProject(actor.isManager, memberId, project.memberIds)
    )
      throw new NotFoundException();
    return { actor, task, assigneeId: native[0].assigneeId };
  }

  async read(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
  ) {
    const { task } = await this.scope(
      this.dataSource.manager,
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
    );
    return { document: task.details.creative ?? null, revision: task.revision };
  }

  async modify(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
    revision: number,
    apply: (
      document: CreativeDocument,
      scope: Awaited<ReturnType<DeliveryCreativeService['scope']>>,
      manager: EntityManager,
    ) => Promise<void> | void,
    action: string,
    allowLocked = false,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${workspace.id}`],
      );
      const scope = await this.scope(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        taskId,
      );
      if (scope.task.revision !== revision)
        throw new ConflictException(
          'Task changed. Refresh before saving creative work.',
        );
      if (!scope.actor.isManager && scope.assigneeId !== memberId)
        throw new ForbiddenException(
          'Only the assignee or a manager can change production.',
        );
      if (
        !allowLocked &&
        ['APPROVED', 'IN_REVIEW'].includes(scope.task.details.state)
      )
        throw new ConflictException(
          'Creative work is locked for final review. Request a revision first.',
        );
      const document = scope.task.details.creative ?? newCreativeDocument();
      await apply(document, scope, manager);
      if (JSON.stringify(document).length > 2000000)
        throw new BadRequestException(
          'Creative history is too large. Start a new production task.',
        );
      document.version++;
      scope.task.details.creative = document;
      scope.task.revision++;
      scope.task.details.events.push({
        id: v4(),
        actorId: memberId,
        action: 'CREATIVE_UPDATED',
        text: action,
        at: new Date().toISOString(),
      });
      await manager.getRepository(DeliveryTaskEntity).save(scope.task);
      return { document, revision: scope.task.revision };
    });
  }

  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = creativeCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Check creative fields and selected versions.',
      );
    const command = parsed.data;
    return this.modify(
      workspace,
      memberId,
      userWorkspaceId,
      command.taskId,
      command.revision,
      async (document, scope, manager) => {
        const requireManager = () => {
          if (!scope.actor.isManager)
            throw new ForbiddenException('Manager approval is required.');
        };
        const asset = (id: string) => {
          const item = document.assets.find((candidate) => candidate.id === id);
          if (!item || item.storageState !== 'READY')
            throw new BadRequestException(
              'Asset is unavailable in this production.',
            );
          return item;
        };
        const approvedAsset = (id: string) => {
          const item = asset(id);
          if (!isCreativeAssetApproved(document, item))
            throw new BadRequestException('Use an approved, current asset.');
          return item;
        };
        switch (command.action) {
          case 'initialize':
            break;
          case 'brief':
            requireManager();
            command.brief.brandAssets.forEach(asset);
            document.briefHistory.push({
              version: document.briefVersion,
              brief: document.brief,
              approved: document.approvedBriefVersion === document.briefVersion,
            });
            document.brief = command.brief;
            document.briefVersion++;
            document.approvedBriefVersion = null;
            document.shots.forEach((shot) => {
              shot.imageId = null;
              shot.clipId = null;
            });
            invalidateCreativeAssembly(document);
            break;
          case 'approveBrief':
            requireManager();
            if (
              !document.brief.concept.trim() ||
              !document.brief.productFacts.trim()
            )
              throw new BadRequestException(
                'Supply a concept and product facts before approval.',
              );
            document.approvedBriefVersion = document.briefVersion;
            break;
          case 'reference':
            if (document.references.length >= 100)
              throw new BadRequestException(
                'This production has reached its reference limit.',
              );
            if (command.fields.assetId) asset(command.fields.assetId);
            document.references.push({
              ...command.fields,
              id: v4(),
              version: 1,
              reviews: [],
            });
            break;
          case 'reviewReferences':
            requireManager();
            for (const id of new Set(command.ids)) {
              const reference = document.references.find(
                (item) => item.id === id,
              );
              if (!reference)
                throw new BadRequestException('Reference is unavailable.');
              reference.reviews.push({
                memberId,
                at: new Date().toISOString(),
                decision: command.decision,
                notes: command.notes,
              });
              if (command.decision === 'REJECTED') {
                document.shots
                  .filter((shot) => shot.referenceId === id)
                  .forEach((shot) => {
                    shot.version++;
                    shot.imageId = null;
                    shot.clipId = null;
                  });
                invalidateCreativeAssembly(document);
              }
            }
            break;
          case 'reuseReference': {
            const source = await this.scope(
              manager,
              workspace,
              memberId,
              userWorkspaceId,
              command.sourceTaskId,
            );
            const reference = source.task.details.creative?.references.find(
              (item) => item.id === command.referenceId,
            );
            if (
              source.task.projectId !== scope.task.projectId ||
              !reference ||
              reference.reviews[reference.reviews.length - 1]?.decision !==
                'APPROVED'
            )
              throw new BadRequestException(
                'Choose an approved reference in this project.',
              );
            if (!reference.url)
              throw new BadRequestException(
                'Download and upload the source asset to reuse a file reference.',
              );
            if (document.references.length >= 100)
              throw new BadRequestException('Reference limit reached.');
            document.references.push({
              ...reference,
              assetId: null,
              id: v4(),
              sourceReferenceId: reference.id,
              reviews: [],
              version: 1,
            });
            break;
          }
          case 'shot': {
            if (
              command.fields.referenceId &&
              !document.references.some(
                (item) =>
                  item.id === command.fields.referenceId &&
                  item.reviews[item.reviews.length - 1]?.decision ===
                    'APPROVED',
              )
            )
              throw new BadRequestException('Choose an approved reference.');
            const existing = command.id
              ? document.shots.find((item) => item.id === command.id)
              : null;
            if (command.id && !existing) throw new NotFoundException();
            if (existing) {
              const {
                history: _history,
                imageId: _imageId,
                clipId: _clipId,
                ...previous
              } = existing;
              existing.history.push(previous);
              Object.assign(existing, command.fields, {
                version: existing.version + 1,
                imageId: null,
                clipId: null,
              });
            } else {
              if (document.shots.length >= 50)
                throw new BadRequestException(
                  'Maximum 50 shots per production.',
                );
              document.shots.push({
                ...command.fields,
                id: v4(),
                version: 1,
                history: [],
                imageId: null,
                clipId: null,
              });
            }
            invalidateCreativeAssembly(document);
            break;
          }
          case 'order':
            if (
              new Set(command.ids).size !== document.shots.length ||
              command.ids.length !== document.shots.length ||
              command.ids.some(
                (id) => !document.shots.some((shot) => shot.id === id),
              )
            )
              throw new BadRequestException('Include each shot exactly once.');
            document.shots = command.ids.map(
              (id) => document.shots.find((shot) => shot.id === id)!,
            );
            invalidateCreativeAssembly(document);
            break;
          case 'reviewAsset': {
            const item = asset(command.assetId);
            if (item.kind === 'FINAL')
              throw new BadRequestException(
                'Final edits use the delivery submission and manager review.',
              );
            if (item.reviews[item.reviews.length - 1]?.decision === 'ESCALATED')
              requireManager();
            if (!isCreativeAssetCurrent(document, item))
              throw new ConflictException(
                'Asset is based on an older brief or shot.',
              );
            item.reviews.push({
              memberId,
              at: new Date().toISOString(),
              decision: command.decision,
              notes: command.notes,
            });
            if (command.decision !== 'APPROVED') {
              for (const shot of document.shots) {
                if (shot.imageId === item.id) {
                  shot.imageId = null;
                  shot.clipId = null;
                }
                if (shot.clipId === item.id) shot.clipId = null;
              }
              invalidateCreativeAssembly(document);
            }
            break;
          }
          case 'selectAsset': {
            const item = asset(command.assetId);
            if (item.kind === 'FINAL') {
              if (!isCreativeAssetCurrent(document, item))
                throw new ConflictException(
                  'Upload a final edit for the current production.',
                );
              document.finalAssetId = item.id;
            } else {
              approvedAsset(item.id);
              const shot = document.shots.find(
                (candidate) => candidate.id === item.shotId,
              );
              if (!shot || !['IMAGE', 'CLIP'].includes(item.kind))
                throw new BadRequestException(
                  'Select an image or clip for a shot.',
                );
              if (item.kind === 'IMAGE') {
                shot.imageId = item.id;
                shot.clipId = null;
              } else shot.clipId = item.id;
              invalidateCreativeAssembly(document);
            }
            break;
          }
          case 'assembly':
            command.assetIds.forEach((id) => {
              if (
                !['CLIP', 'BASE', 'HOOK', 'CTA'].includes(
                  approvedAsset(id).kind,
                )
              )
                throw new BadRequestException(
                  'Assembly requires approved video assets.',
                );
            });
            if (
              command.audioId &&
              approvedAsset(command.audioId).kind !== 'AUDIO'
            )
              throw new BadRequestException('Choose an approved audio asset.');
            document.assembly = {
              assetIds: command.assetIds,
              overlayText: command.overlayText,
              audioId: command.audioId,
              notes: command.notes,
            };
            document.finalAssetId = null;
            document.assemblyVersion++;
            break;
          case 'variants':
            if (approvedAsset(command.baseId).kind !== 'BASE')
              throw new BadRequestException('Choose an approved base video.');
            command.hookIds.forEach((id) => {
              if (approvedAsset(id).kind !== 'HOOK')
                throw new BadRequestException('Choose approved hooks.');
            });
            command.ctaIds.forEach((id) => {
              if (approvedAsset(id).kind !== 'CTA')
                throw new BadRequestException('Choose approved CTAs.');
            });
            document.variants = [...new Set(command.hookIds)].flatMap(
              (hookId) =>
                [...new Set(command.ctaIds)].map((ctaId) => ({
                  id: v4(),
                  baseId: command.baseId,
                  hookId,
                  ctaId,
                  selected: true,
                })),
            );
            break;
          case 'selectVariants':
            if (
              command.ids.some(
                (id) => !document.variants.some((item) => item.id === id),
              )
            )
              throw new BadRequestException('Variant is unavailable.');
            document.variants.forEach((item) => {
              item.selected = command.ids.includes(item.id);
            });
            break;
          case 'reopen':
            requireManager();
            if (!['APPROVED', 'IN_REVIEW'].includes(scope.task.details.state))
              throw new BadRequestException(
                'This task is already open for production.',
              );
            scope.task.details.state = 'CHANGES_REQUESTED';
            document.revisionCharge = command.revisionCharge;
            scope.task.details.events.push({
              id: v4(),
              actorId: memberId,
              action: 'CHANGES_REQUESTED',
              text: command.notes,
              at: new Date().toISOString(),
            });
            await manager.query(
              `UPDATE ${this.delivery.schema(workspace)}.task SET status='IN_PROGRESS', "updatedAt"=now() WHERE id=$1`,
              [command.taskId],
            );
            document.finalAssetId = null;
            break;
        }
        if (JSON.stringify(document).length > 2000000)
          throw new BadRequestException(
            'Creative history is too large. Start a new production task.',
          );
      },
      command.action,
      command.action === 'reopen',
    );
  }

  private async discardPending(
    workspaceId: string,
    taskId: string,
    assetId: string,
  ) {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${workspaceId}`],
      );
      const task = await manager
        .getRepository(DeliveryTaskEntity)
        .findOneBy({ workspaceId, taskId });
      const asset = task?.details.creative?.assets.find(
        (item) => item.id === assetId,
      );
      if (!task || !asset || asset.storageState !== 'PENDING') return;
      const driver = this.storage.getCurrentDriver();
      const folderPath = `${workspaceId}/delivery-creative/${taskId}`;
      if (
        await driver.checkFileExists({ filePath: `${folderPath}/${assetId}` })
      )
        await driver.delete({ folderPath, filename: assetId });
      asset.storageState = 'FAILED';
      task.revision++;
      await manager.getRepository(DeliveryTaskEntity).save(task);
    });
  }

  @Cron('0 */10 * * * *')
  async cleanupUploads() {
    const rows: {
      workspaceId: string;
      taskId: string;
      details: DeliveryTaskEntity['details'];
    }[] = await this.dataSource.query(
      `SELECT "workspaceId", "taskId", details FROM core."deliveryTask" WHERE details->'creative'->'assets' @> '[{"storageState":"PENDING"}]'::jsonb LIMIT 100`,
    );
    for (const task of rows)
      for (const asset of task.details.creative?.assets ?? []) {
        if (
          asset.storageState === 'PENDING' &&
          Date.parse(asset.createdAt) < Date.now() - 3600000
        )
          await this.discardPending(task.workspaceId, task.taskId, asset.id);
      }
  }

  async addAsset(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
    revision: number,
    metadata: Omit<
      CreativeAsset,
      | 'briefVersion'
      | 'productionVersion'
      | 'assemblyVersion'
      | 'shotVersion'
      | 'reviews'
      | 'parentAssetId'
      | 'storageState'
    >,
    writeFile: () => Promise<void>,
    lifecycle?: {
      validate: (
        document: CreativeDocument,
        scope: Awaited<ReturnType<DeliveryCreativeService['scope']>>,
      ) => void;
      complete: (document: CreativeDocument) => void;
    },
  ) {
    const reserved = await this.modify(
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
      revision,
      async (document, scope) => {
        lifecycle?.validate(document, scope);
        if (document.assets.length >= 200)
          throw new BadRequestException('Maximum 200 assets per production.');
        const shot = metadata.shotId
          ? document.shots.find((item) => item.id === metadata.shotId)
          : null;
        if (['IMAGE', 'CLIP'].includes(metadata.kind) && !shot)
          throw new BadRequestException('Select a shot for this asset.');
        if (
          metadata.kind === 'CLIP' &&
          (!shot?.imageId ||
            !document.assets.some(
              (item) =>
                item.id === shot.imageId &&
                isCreativeAssetApproved(document, item),
            ))
        )
          throw new BadRequestException(
            'Approve and select the source image first.',
          );
        if (
          metadata.kind === 'IMAGE' &&
          !metadata.mimeType.startsWith('image/')
        )
          throw new BadRequestException('An image is required.');
        if (
          ['CLIP', 'BASE', 'HOOK', 'CTA', 'FINAL'].includes(metadata.kind) &&
          !metadata.mimeType.startsWith('video/')
        )
          throw new BadRequestException('A video is required.');
        if (
          metadata.kind === 'AUDIO' &&
          !metadata.mimeType.startsWith('audio/')
        )
          throw new BadRequestException('An audio file is required.');
        document.assets.push({
          ...metadata,
          storageState: 'PENDING',
          briefVersion: document.briefVersion,
          productionVersion: document.productionVersion,
          assemblyVersion: document.assemblyVersion,
          shotVersion: shot?.version ?? null,
          parentAssetId:
            metadata.kind === 'CLIP' ? (shot?.imageId ?? null) : null,
          reviews: [],
        });
      },
      'Reserved creative upload',
    );
    try {
      await writeFile();
      return await this.modify(
        workspace,
        memberId,
        userWorkspaceId,
        taskId,
        reserved.revision,
        (document, scope) => {
          lifecycle?.validate(document, scope);
          const asset = document.assets.find((item) => item.id === metadata.id);
          if (!asset || asset.storageState !== 'PENDING')
            throw new ConflictException('Upload is no longer pending.');
          asset.storageState = 'READY';
          lifecycle?.complete(document);
        },
        'Completed creative upload',
      );
    } catch (error) {
      await this.discardPending(workspace.id, taskId, metadata.id);
      throw error;
    }
  }
}
