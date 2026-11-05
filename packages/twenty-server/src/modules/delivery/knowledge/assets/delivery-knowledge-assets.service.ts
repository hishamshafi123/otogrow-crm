import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In } from 'typeorm';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryKnowledgeSourceEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-source.entity';
import { DeliveryKnowledgeVersionEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-version.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { DeliveryKnowledgeAssetEntity } from './entities/delivery-knowledge-asset.entity';
import {
  inspectKnowledgeAsset,
  KNOWLEDGE_ASSET_MAX_BYTES,
  KNOWLEDGE_ASSET_MAX_PROJECT_BYTES,
  KNOWLEDGE_ASSET_MAX_PROJECT_FILES,
  knowledgeUploadSchema,
  knowledgeUploadSelectionSchema,
  parseKnowledgeAssetInput,
  type KnowledgeUploadSelection,
} from './delivery-knowledge-assets.policy';
import {
  knowledgeAssetDescriptor,
  readKnowledgeAssetBindings,
} from './delivery-knowledge-assets.binding';

const UPLOAD_LIST = z
  .object({
    projectId: z.uuid(),
    sourceId: z.uuid().nullish(),
    afterId: z.uuid().nullish(),
  })
  .strict();
const IS_BOUND = `EXISTS (SELECT 1 FROM core."deliveryKnowledgeVersion" bound WHERE bound."workspaceId"=asset."workspaceId" AND bound."sourceId"=asset."sourceId" AND bound.attachments @> jsonb_build_array(jsonb_build_object('id',asset.id::text,'sha256',asset.sha256)))`;

@Injectable()
export class DeliveryKnowledgeAssetsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly storage: FileStorageDriverFactory,
  ) {}

  private async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    projectId: string,
    sourceId?: string,
    editable = true,
  ) {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: projectId });
    if (
      !project ||
      !canAccessDeliveryProject(actor.isManager, memberId, project.memberIds)
    )
      throw new ForbiddenException('This brand file project is unavailable.');
    await manager.query(
      'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
      [`knowledge:${workspace.id}:${project.id}`],
    );
    const source = sourceId
      ? await manager
          .getRepository(DeliveryKnowledgeSourceEntity)
          .findOneBy({ id: sourceId })
      : null;
    if (
      source &&
      (source.workspaceId !== workspace.id ||
        source.projectId !== projectId ||
        (editable && !actor.isManager && source.createdBy !== memberId))
    )
      throw new ForbiddenException('This knowledge source is unavailable.');
    return { actor, project, source };
  }

  private async read<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: { projectId: string; sourceId?: string },
    operation: (
      manager: EntityManager,
      scope: Awaited<ReturnType<DeliveryKnowledgeAssetsService['scope']>>,
    ) => Promise<TResult>,
    editable = true,
  ) {
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) =>
        operation(
          manager,
          await this.scope(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            input.projectId,
            input.sourceId,
            editable,
          ),
        ),
    );
  }

  private async uploadLock<TResult>(
    workspaceId: string,
    id: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult | null> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    const key = `knowledge-file:${workspaceId}:${id}`;
    let acquired = false;
    try {
      const [row]: { acquired: boolean }[] = await runner.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',
        [key],
      );
      acquired = row.acquired;
      return acquired ? await operation() : null;
    } finally {
      if (acquired)
        await runner.query(
          'SELECT pg_advisory_unlock(hashtextextended($1,0))',
          [key],
        );
      await runner.release();
    }
  }

  private path(
    asset: Pick<DeliveryKnowledgeAssetEntity, 'workspaceId' | 'id'>,
  ) {
    return `${asset.workspaceId}/delivery-knowledge/${asset.id}`;
  }
  private async bound(
    manager: EntityManager,
    asset: DeliveryKnowledgeAssetEntity,
  ) {
    const [row]: { bound: boolean }[] = await manager.query(
      `SELECT ${IS_BOUND} AS bound FROM core."deliveryKnowledgeAsset" asset WHERE asset."workspaceId"=$1 AND asset.id=$2`,
      [asset.workspaceId, asset.id],
    );
    return row?.bound === true;
  }
  private async receipt(
    manager: EntityManager,
    asset: DeliveryKnowledgeAssetEntity,
    canRecover: boolean,
    currentCompanyId: string | null,
    canEditSource: boolean,
  ) {
    const previousCompany = asset.companyId !== currentCompanyId;
    const bound = await this.bound(manager, asset);
    return {
      ...knowledgeAssetDescriptor(asset),
      name: previousCompany
        ? 'Unused upload from an earlier brand'
        : asset.name,
      availability: previousCompany ? 'PREVIOUS_COMPANY' : 'CURRENT',
      canAttach: canEditSource && !previousCompany && asset.state === 'READY',
      requestId: asset.id,
      workspaceId: asset.workspaceId,
      projectId: asset.projectId,
      sourceId: asset.sourceId,
      companyId: asset.companyId,
      sourceRevision: asset.sourceRevision,
      uploaderUserWorkspaceId: asset.uploaderUserWorkspaceId,
      state: asset.state,
      failureReason: asset.failureReason,
      canRecover:
        canEditSource &&
        !previousCompany &&
        asset.state === 'PENDING' &&
        canRecover,
      canDiscard: !bound && canRecover,
      cleanupPending: asset.state === 'FAILED' && !asset.cleanedAt,
    };
  }
  private async selected(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: KnowledgeUploadSelection,
    scope: Awaited<ReturnType<DeliveryKnowledgeAssetsService['scope']>>,
    allowOwnedEarlierBrand = false,
  ) {
    const asset = await manager
      .getRepository(DeliveryKnowledgeAssetEntity)
      .findOneBy({ workspaceId: workspace.id, id: input.requestId });
    if (!asset) return null;
    if (
      asset.projectId !== input.projectId ||
      asset.sourceId !== input.sourceId ||
      (asset.companyId !== scope.project.companyId &&
        !(
          allowOwnedEarlierBrand &&
          asset.uploadedBy === memberId &&
          asset.uploaderUserWorkspaceId === userWorkspaceId
        )) ||
      (!scope.actor.isManager &&
        (asset.uploadedBy !== memberId ||
          asset.uploaderUserWorkspaceId !== userWorkspaceId))
    )
      throw new ForbiddenException(
        'This private upload is unavailable under your current access.',
      );
    if (asset.sha256 !== input.sha256)
      throw new ConflictException(
        'This request belongs to different file bytes. Keep the original upload identity.',
      );
    return asset;
  }
  async status(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseKnowledgeAssetInput(knowledgeUploadSelectionSchema, raw);
    const unlocked =
      (await this.uploadLock(
        workspace.id,
        input.requestId,
        async () => true,
      )) === true;
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      async (manager, scope) => {
        const asset = await this.selected(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input,
          scope,
          true,
        );
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          projectId: input.projectId,
          sourceId: input.sourceId,
          receipt: asset
            ? await this.receipt(
                manager,
                asset,
                unlocked,
                scope.project.companyId,
                scope.actor.isManager ||
                  !scope.source ||
                  scope.source.createdBy === memberId,
              )
            : null,
        };
      },
      false,
    );
  }
  async list(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseKnowledgeAssetInput(UPLOAD_LIST, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      { projectId: input.projectId, sourceId: input.sourceId ?? undefined },
      async (manager, scope) => {
        const query = manager
          .getRepository(DeliveryKnowledgeAssetEntity)
          .createQueryBuilder('asset')
          .where(
            'asset."workspaceId"=:workspaceId AND asset."projectId"=:projectId AND asset."uploadedBy"=:memberId AND asset."uploaderUserWorkspaceId"=:userWorkspaceId AND (asset.state<>\'FAILED\' OR asset."cleanedAt" IS NULL)',
            {
              workspaceId: workspace.id,
              projectId: input.projectId,
              memberId,
              userWorkspaceId,
            },
          )
          .andWhere(`NOT ${IS_BOUND}`);
        if (input.sourceId)
          query.andWhere('asset."sourceId"=:sourceId', {
            sourceId: input.sourceId,
          });
        if (input.afterId) {
          if (
            !(await query
              .clone()
              .andWhere('asset.id=:afterId', { afterId: input.afterId })
              .getOne())
          )
            throw new ConflictException(
              'Private uploads changed. Return to the first page.',
            );
          query.andWhere('asset.id>:afterId', { afterId: input.afterId });
        }
        const rows = await query.orderBy('asset.id', 'ASC').take(26).getMany();
        const sources = rows.length
          ? await manager.getRepository(DeliveryKnowledgeSourceEntity).findBy({
              id: In([
                ...new Set(rows.slice(0, 25).map((asset) => asset.sourceId)),
              ]),
            })
          : [];
        const items = [];
        for (const asset of rows.slice(0, 25)) {
          const source = sources.find(
            (candidate) => candidate.id === asset.sourceId,
          );
          items.push(
            await this.receipt(
              manager,
              asset,
              (await this.uploadLock(
                workspace.id,
                asset.id,
                async () => true,
              )) === true,
              scope.project.companyId,
              !source ||
                (source.workspaceId === workspace.id &&
                  source.projectId === input.projectId &&
                  (scope.actor.isManager || source.createdBy === memberId)),
            ),
          );
        }
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          projectId: input.projectId,
          items,
          nextCursor: rows.length > 25 ? rows[24].id : null,
        };
      },
      false,
    );
  }
  private async bytes(asset: DeliveryKnowledgeAssetEntity) {
    const driver = this.storage.getCurrentDriver();
    const metadata = await driver.getFileMetadata({
      filePath: this.path(asset),
    });
    if (
      !metadata ||
      metadata.size !== asset.size ||
      metadata.size > KNOWLEDGE_ASSET_MAX_BYTES
    )
      throw new ConflictException(
        'The exact stored file is unavailable or incomplete.',
      );
    const stream = await driver.readFile({ filePath: this.path(asset) });
    const timeout = setTimeout(
      () => stream.destroy(new Error('Brand file read timed out.')),
      30000,
    );
    timeout.unref();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > asset.size || size > KNOWLEDGE_ASSET_MAX_BYTES)
          throw new ConflictException(
            'The stored file exceeds its recorded size.',
          );
        chunks.push(bytes);
      }
    } finally {
      clearTimeout(timeout);
      stream.destroy();
    }
    const bytes = Buffer.concat(chunks);
    const mime = await inspectKnowledgeAsset(asset, bytes);
    if (mime !== asset.mimeType)
      throw new ConflictException('The stored file format changed.');
    return bytes;
  }
  async upload(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    file: { buffer: Buffer; originalname: string },
  ) {
    const input = parseKnowledgeAssetInput(knowledgeUploadSchema, raw);
    if (
      !file?.buffer ||
      (file.originalname.trim() !== input.name &&
        Buffer.from(file.originalname, 'latin1').toString('utf8').trim() !==
          input.name)
    )
      throw new BadRequestException(
        'Select the exact named file before uploading.',
      );
    const mimeType = await inspectKnowledgeAsset(input, file.buffer);
    const inputHash = advertisingHash(input);
    const result = await this.uploadLock(
      workspace.id,
      input.requestId,
      async () => {
        const claimed = await this.read(
          workspace,
          memberId,
          userWorkspaceId,
          input,
          async (manager, scope) => {
            const existing = await this.selected(
              manager,
              workspace,
              memberId,
              userWorkspaceId,
              input,
              scope,
            );
            if (existing) {
              if (
                existing.inputHash !== inputHash ||
                existing.uploadedBy !== memberId ||
                existing.uploaderUserWorkspaceId !== userWorkspaceId
              )
                throw new ConflictException(
                  'This upload request belongs to a different body or uploader.',
                );
              return { asset: existing, created: false };
            }
            if (
              scope.project.companyId !== input.expectedCompanyId ||
              (scope.source?.revision ?? 0) !== input.sourceRevision
            )
              throw new ConflictException(
                'This source or client changed. Refresh before uploading a file.',
              );
            await manager.query(
              'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
              [
                `knowledge-file-project-quota:${workspace.id}:${input.projectId}`,
              ],
            );
            const [retained]: { files: number; bytes: string }[] =
              await manager.query(
                `SELECT count(*)::int AS files,COALESCE(sum(asset.size),0)::text AS bytes FROM core."deliveryKnowledgeAsset" asset WHERE asset."workspaceId"=$1 AND asset."projectId"=$2 AND asset."cleanedAt" IS NULL`,
                [workspace.id, input.projectId],
              );
            if (
              retained.files >= KNOWLEDGE_ASSET_MAX_PROJECT_FILES ||
              Number(retained.bytes) + input.size >
                KNOWLEDGE_ASSET_MAX_PROJECT_BYTES
            )
              throw new BadRequestException(
                'This project has reached its brand-file storage limit (1 GiB or 500 files, including retained history and pending uploads). Discard unused private uploads if available; approved version history stays protected.',
              );
            await manager.query(
              'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
              [`knowledge-file-quota:${workspace.id}:${memberId}`],
            );
            const [counts]: { total: number; source: number }[] =
              await manager.query(
                `SELECT count(*)::int AS total,count(*) FILTER (WHERE asset."sourceId"=$3)::int AS source FROM core."deliveryKnowledgeAsset" asset WHERE asset."workspaceId"=$1 AND asset."uploadedBy"=$2 AND (asset.state<>'FAILED' OR asset."cleanedAt" IS NULL) AND NOT ${IS_BOUND}`,
                [workspace.id, memberId, input.sourceId],
              );
            if (counts.total >= 100 || counts.source >= 20)
              throw new BadRequestException(
                'Remove unused private uploads before adding more files (20 per source, 100 per person).',
              );
            const asset = await manager
              .getRepository(DeliveryKnowledgeAssetEntity)
              .save({
                id: input.requestId,
                workspaceId: workspace.id,
                projectId: input.projectId,
                sourceId: input.sourceId,
                sourceRevision: input.sourceRevision,
                companyId: input.expectedCompanyId,
                name: input.name,
                size: input.size,
                sha256: input.sha256,
                mimeType,
                uploadedBy: memberId,
                uploaderUserWorkspaceId: userWorkspaceId,
                inputHash,
                state: 'PENDING',
                readyAt: null,
                failureReason: null,
                cleanedAt: null,
              });
            await this.activity(
              manager,
              asset,
              memberId,
              'KNOWLEDGE_FILE_UPLOAD_STARTED',
              null,
              'PENDING',
            );
            return { asset, created: true };
          },
        );
        if (!claimed.created) return;
        try {
          await this.storage.getCurrentDriver().writeFile({
            filePath: this.path(claimed.asset),
            sourceFile: file.buffer,
            mimeType,
          });
          await this.bytes(claimed.asset);
        } catch {
          await this.fail(
            claimed.asset,
            'The file could not be stored and verified. Select it again with a new upload request.',
          );
          return;
        }
        await this.read(
          workspace,
          memberId,
          userWorkspaceId,
          input,
          async (manager, scope) => {
            const current = await this.selected(
              manager,
              workspace,
              memberId,
              userWorkspaceId,
              input,
              scope,
            );
            if (current?.state === 'PENDING')
              await this.ready(manager, current, memberId);
          },
        );
      },
    );
    const status = await this.status(workspace, memberId, userWorkspaceId, {
      projectId: input.projectId,
      sourceId: input.sourceId,
      requestId: input.requestId,
      sha256: input.sha256,
    });
    if (!status.receipt)
      throw new ConflictException(
        result === null
          ? 'This upload is starting. Check the same request before retrying.'
          : 'The upload could not be recovered.',
      );
    return status;
  }
  private async fail(
    asset: DeliveryKnowledgeAssetEntity,
    reason: string,
    authorize?: (manager: EntityManager) => Promise<void>,
    memberId: string | null = null,
  ) {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
        [`delivery:${asset.workspaceId}`],
      );
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`knowledge:${asset.workspaceId}:${asset.projectId}`],
      );
      if (authorize) await authorize(manager);
      if (await this.bound(manager, asset))
        throw new ConflictException(
          'A retained knowledge version still uses this file.',
        );
      const current = await manager
        .getRepository(DeliveryKnowledgeAssetEntity)
        .findOneByOrFail({ workspaceId: asset.workspaceId, id: asset.id });
      if (current.state !== 'FAILED' || current.failureReason !== reason) {
        await manager
          .getRepository(DeliveryKnowledgeAssetEntity)
          .update(
            { workspaceId: asset.workspaceId, id: asset.id },
            { state: 'FAILED', readyAt: null, failureReason: reason },
          );
        await this.activity(
          manager,
          current,
          memberId,
          memberId
            ? 'KNOWLEDGE_FILE_DISCARDED'
            : 'KNOWLEDGE_FILE_UPLOAD_FAILED',
          current.state,
          'FAILED',
        );
      }
    });
    try {
      await this.storage.getCurrentDriver().delete({
        folderPath: `${asset.workspaceId}/delivery-knowledge`,
        filename: asset.id,
      });
      if (
        await this.storage
          .getCurrentDriver()
          .checkFileExists({ filePath: this.path(asset) })
      )
        throw new ConflictException('File cleanup has not finished.');
      await this.dataSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',
          [`delivery:${asset.workspaceId}`],
        );
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`knowledge:${asset.workspaceId}:${asset.projectId}`],
        );
        const current = await manager
          .getRepository(DeliveryKnowledgeAssetEntity)
          .findOneByOrFail({ workspaceId: asset.workspaceId, id: asset.id });
        if (current.state !== 'FAILED' || (await this.bound(manager, current)))
          throw new ConflictException(
            'Only the failed unbound upload can finish cleanup.',
          );
        if (!current.cleanedAt) {
          await manager
            .getRepository(DeliveryKnowledgeAssetEntity)
            .update(
              { workspaceId: asset.workspaceId, id: asset.id, state: 'FAILED' },
              { cleanedAt: new Date() },
            );
          await this.activity(
            manager,
            current,
            null,
            'KNOWLEDGE_FILE_CLEANED',
            'CLEANUP_PENDING',
            'CLEANED',
          );
        }
      });
    } catch {
      // The receipt keeps cleanup pending; explicit discard can retry only this failed path.
    }
  }
  async recover(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    discard = false,
  ) {
    const input = parseKnowledgeAssetInput(knowledgeUploadSelectionSchema, raw);
    await this.uploadLock(workspace.id, input.requestId, async () => {
      const asset = await this.read(
        workspace,
        memberId,
        userWorkspaceId,
        input,
        async (manager, scope) => {
          const selected = await this.selected(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            input,
            scope,
            discard,
          );
          if (selected && discard && (await this.bound(manager, selected)))
            throw new ConflictException(
              'This file is retained by a knowledge version. Remove it only from a new draft; history stays intact.',
            );
          return selected;
        },
        !discard,
      );
      if (!asset) return;
      const authorize = async (manager: EntityManager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.projectId,
          input.sourceId,
          !discard,
        );
        await this.selected(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input,
          scope,
          discard,
        );
      };
      if (discard) {
        await this.fail(
          asset,
          'This unused private upload was discarded.',
          authorize,
          memberId,
        );
        return;
      }
      if (asset.state !== 'PENDING') return;
      try {
        await this.bytes(asset);
      } catch {
        await this.fail(
          asset,
          'The interrupted upload has no complete verified file. Select it again with a new request.',
          authorize,
        );
        return;
      }
      await this.read(
        workspace,
        memberId,
        userWorkspaceId,
        input,
        async (manager, scope) => {
          const current = await this.selected(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            input,
            scope,
          );
          if (current?.state === 'PENDING')
            await this.ready(manager, current, memberId);
        },
      );
    });
    return this.status(workspace, memberId, userWorkspaceId, input);
  }
  async download(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    id: string,
    sourceId?: string,
    version?: number,
  ) {
    parseKnowledgeAssetInput(z.uuid(), id);
    if (sourceId) parseKnowledgeAssetInput(z.uuid(), sourceId);
    if (sourceId)
      parseKnowledgeAssetInput(z.number().int().positive(), version);
    const authorize = async () =>
      readDeliverySnapshot(this.dataSource, workspace.id, async (manager) => {
        const asset = await manager
          .getRepository(DeliveryKnowledgeAssetEntity)
          .findOneBy({ workspaceId: workspace.id, id });
        if (!asset)
          throw new NotFoundException('This brand file is unavailable.');
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          asset.projectId,
          asset.sourceId,
          !sourceId,
        );
        if (
          asset.companyId !== scope.project.companyId ||
          asset.state !== 'READY'
        )
          throw new ForbiddenException('This exact brand file is unavailable.');
        if (!sourceId) {
          if (
            !scope.actor.isManager &&
            (asset.uploadedBy !== memberId ||
              asset.uploaderUserWorkspaceId !== userWorkspaceId)
          )
            throw new ForbiddenException('This private upload is unavailable.');
        } else {
          if (
            asset.sourceId !== sourceId ||
            !scope.source ||
            (!scope.actor.isManager &&
              scope.source.createdBy !== memberId &&
              scope.source.publishedVersion !== version)
          )
            throw new ForbiddenException(
              'Only the currently published file version is available to project staff.',
            );
          const content = await manager
            .getRepository(DeliveryKnowledgeVersionEntity)
            .findOneBy({ workspaceId: workspace.id, sourceId, version });
          if (
            !content ||
            !(content.attachments ?? []).some(
              (binding) => binding.id === id && binding.sha256 === asset.sha256,
            )
          )
            throw new NotFoundException(
              'This file is not attached to that exact knowledge version.',
            );
          await readKnowledgeAssetBindings(
            manager,
            workspace.id,
            asset.projectId,
            sourceId,
            content.attachments,
          );
        }
        return asset;
      });
    const asset = await authorize();
    const bytes = await this.bytes(asset);
    await authorize();
    return { asset: knowledgeAssetDescriptor(asset), bytes };
  }
  private async ready(
    manager: EntityManager,
    asset: DeliveryKnowledgeAssetEntity,
    memberId: string,
  ) {
    await manager
      .getRepository(DeliveryKnowledgeAssetEntity)
      .update(
        { workspaceId: asset.workspaceId, id: asset.id, state: 'PENDING' },
        { state: 'READY', readyAt: new Date() },
      );
    await this.activity(
      manager,
      asset,
      memberId,
      'KNOWLEDGE_FILE_READY',
      'PENDING',
      'READY',
    );
  }

  private async activity(
    manager: EntityManager,
    asset: DeliveryKnowledgeAssetEntity,
    memberId: string | null,
    action:
      | 'KNOWLEDGE_FILE_UPLOAD_STARTED'
      | 'KNOWLEDGE_FILE_READY'
      | 'KNOWLEDGE_FILE_UPLOAD_FAILED'
      | 'KNOWLEDGE_FILE_DISCARDED'
      | 'KNOWLEDGE_FILE_CLEANED',
    before: string | null,
    after: string,
  ) {
    const source = await manager
      .getRepository(DeliveryKnowledgeSourceEntity)
      .findOneBy({
        workspaceId: asset.workspaceId,
        projectId: asset.projectId,
        id: asset.sourceId,
      });
    const summaries = {
      KNOWLEDGE_FILE_UPLOAD_STARTED:
        'Started a private brand-file upload; it is not published.',
      KNOWLEDGE_FILE_READY:
        'Verified an uploaded brand file; publication remains a separate review.',
      KNOWLEDGE_FILE_UPLOAD_FAILED:
        'Brand-file storage verification failed; the upload is unavailable.',
      KNOWLEDGE_FILE_CLEANED:
        'Removed the exact unused file bytes; retained knowledge history is unchanged.',
      KNOWLEDGE_FILE_DISCARDED:
        'Discarded an unused private brand upload; retained knowledge history is unchanged.',
    };
    await recordOtogrowActivity(manager, {
      workspaceId: asset.workspaceId,
      actorId: memberId,
      actorType: memberId ? 'HUMAN' : 'SYSTEM',
      subjectMemberId: asset.uploadedBy,
      category: 'CLIENT',
      projectId: asset.projectId,
      sourceType: source ? 'brand-knowledge' : 'knowledge-upload',
      sourceId: source?.id ?? asset.id,
      action,
      summary: summaries[action],
      outcome:
        after === 'FAILED' ? (memberId ? 'CANCELLED' : 'FAILED') : 'RECORDED',
      changes: [
        { field: 'assetId', before: null, after: asset.id },
        { field: 'state', before, after },
      ],
    });
  }
}
