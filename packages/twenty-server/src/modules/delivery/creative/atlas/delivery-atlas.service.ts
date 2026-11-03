import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, type EntityManager, In } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import { type OtogrowAiMediaReservation } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';
import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { microToUsd } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';
import { DeliveryAtlasJobEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-job.entity';
import { DeliveryAtlasConnectionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-connection.service';
import { DeliveryAtlasProductionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-production.service';
import {
  DeliveryAtlasAdapter,
  type AtlasPrediction,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.adapter';
import {
  ATLAS_MODEL_PREFIX,
  atlasProfile,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.catalog';
import {
  atlasHash,
  atlasQuoteSchema,
  atlasRunSchema,
  atlasRunsSchema,
  atlasStartSchema,
  parseAtlasInput,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.policy';
import {
  type DeliveryAtlasQuoteDTO,
  type DeliveryAtlasQuoteInput,
  type DeliveryAtlasRunDTO,
  type DeliveryAtlasRunInput,
  type DeliveryAtlasRunsDTO,
  type DeliveryAtlasRunsInput,
  type DeliveryAtlasStartInput,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.dto';

export const DELIVERY_ATLAS_JOB = 'delivery-atlas-run';
const LEASE_MS = 180000;
type AtlasSpend = Pick<
  OtogrowAiSpendEntity,
  'sourceRunId' | 'state' | 'actualMicroUsd'
>;
const source = (job: DeliveryAtlasJobEntity) => ({
  workspaceId: job.workspaceId,
  sourceKind: 'MEDIA' as const,
  sourceRunId: job.id,
});

@Injectable()
export class DeliveryAtlasService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly creative: DeliveryCreativeService,
    private readonly connections: DeliveryAtlasConnectionService,
    private readonly production: DeliveryAtlasProductionService,
    private readonly adapter: DeliveryAtlasAdapter,
    private readonly storage: FileStorageDriverFactory,
    private readonly budget: OtogrowAiBudgetService,
    @InjectMessageQueue(MessageQueue.aiQueue)
    private readonly queue: MessageQueueService,
  ) {}
  private reservation(job: DeliveryAtlasJobEntity): OtogrowAiMediaReservation {
    return {
      workspaceId: job.workspaceId,
      actorId: job.actorId,
      projectId: job.projectId,
      taskId: job.taskId,
      sourceRunId: job.id,
      modelId: `${ATLAS_MODEL_PREFIX}${job.request.profileId}`,
      kind: job.request.kind,
      limit: {
        id: job.reservationLimit.id,
        revision: job.reservationLimit.revision,
        maximumCostUsd: job.reservationLimit.maximumCostUsd,
        source: job.reservationLimit.source,
        verifiedAt: job.reservationLimit.verifiedAt,
      },
      quotedCostUsd: job.quotedCostUsd,
      quoteEstimated: job.quoteEstimated,
      quotedAt: job.quotedAt.toISOString(),
      requestHash: job.requestHash,
      catalogSchemaRevision: job.request.schemaRevision,
    };
  }
  private dto(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    job: DeliveryAtlasJobEntity,
    canControl: boolean,
    spend: AtlasSpend | null,
  ): DeliveryAtlasRunDTO {
    const parameters = job.request.parameters;
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      taskId: job.taskId,
      id: job.id,
      requestId: job.requestId,
      profileId: job.request.profileId,
      familyId: job.request.familyId,
      modelLabel: job.request.modelLabel,
      kind: job.request.kind,
      operation: job.request.operation,
      schemaRevision: job.request.schemaRevision,
      configurationRevision: job.configurationRevision,
      taskRevision: job.request.taskRevision,
      briefVersion: job.request.briefVersion,
      settingsVersion: job.request.settingsVersion,
      shotVersion: job.request.shotVersion,
      prompt: job.request.prompt,
      referenceAssetIds: job.request.referenceAssetIds,
      parameters: {
        resolution: parameters.resolution ?? null,
        size: parameters.size ?? null,
        aspectRatio: parameters.aspectRatio ?? null,
        duration: parameters.duration ?? null,
        generateAudio: parameters.generateAudio ?? null,
        quality: parameters.quality ?? null,
        seed: parameters.seed ?? null,
      },
      target: job.request.target,
      shotId: job.request.shotId,
      status: job.publicationCancelled ? 'CANCELLED' : job.status,
      publicationCancelled: job.publicationCancelled,
      providerPredictionId: job.providerPredictionId,
      providerStatus: job.providerStatus,
      assetId: job.status === 'SUCCEEDED' ? job.assetId : null,
      maximumCostUsd: job.reservationLimit.maximumCostUsd,
      quotedCostUsd: job.quotedCostUsd,
      actualCostUsd:
        spend?.state === 'SETTLED' && spend.actualMicroUsd !== null
          ? microToUsd(spend.actualMicroUsd)
          : null,
      costState: spend?.state ?? 'UNRESERVED',
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      canResume:
        canControl &&
        Boolean(job.providerPredictionId) &&
        job.status === 'UNCERTAIN',
      canCancel:
        canControl &&
        !job.publicationCancelled &&
        [
          'QUOTED',
          'QUEUED',
          'SUBMITTING',
          'POLLING',
          'DOWNLOADING',
          'UNCERTAIN',
        ].includes(job.status),
    };
  }
  private async spends(
    manager: EntityManager,
    workspaceId: string,
    taskId: string,
    runIds: string[],
  ) {
    if (!runIds.length) return new Map<string, AtlasSpend>();
    const rows = await manager.getRepository(OtogrowAiSpendEntity).find({
      select: { sourceRunId: true, state: true, actualMicroUsd: true },
      where: {
        workspaceId,
        taskId,
        sourceKind: 'MEDIA',
        sourceRunId: In(runIds),
      },
      take: runIds.length,
    });
    return new Map(rows.map((row) => [row.sourceRunId, row]));
  }
  private async receipt(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    job: DeliveryAtlasJobEntity,
    canControl: boolean,
  ) {
    const spends = await this.spends(manager, workspace.id, job.taskId, [
      job.id,
    ]);
    return this.dto(
      workspace,
      memberId,
      userWorkspaceId,
      job,
      canControl,
      spends.get(job.id) ?? null,
    );
  }
  private async get(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
    runId: string,
  ) {
    const scope = await this.creative.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
    );
    const job = await manager
      .getRepository(DeliveryAtlasJobEntity)
      .findOneBy({ workspaceId: workspace.id, taskId, id: runId });
    if (!job)
      throw new NotFoundException('This generation request is unavailable.');
    return {
      scope,
      job,
      canControl:
        scope.actor.isManager ||
        (scope.assigneeId === memberId && job.actorId === memberId),
    };
  }
  async run(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasRunInput,
  ): Promise<DeliveryAtlasRunDTO> {
    const command = parseAtlasInput(atlasRunSchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const { job, canControl } = await this.get(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command.taskId,
          command.runId,
        );
        return this.receipt(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          job,
          canControl,
        );
      },
    );
  }
  async runs(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasRunsInput,
  ): Promise<DeliveryAtlasRunsDTO> {
    const command = parseAtlasInput(atlasRunsSchema, input);
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
        );
        const repository = manager.getRepository(DeliveryAtlasJobEntity),
          query = repository
            .createQueryBuilder('job')
            .where('job."workspaceId"=:workspaceId', {
              workspaceId: workspace.id,
            })
            .andWhere('job."taskId"=:taskId', { taskId: command.taskId });
        if (command.beforeId) {
          const before = await repository.findOneBy({
            workspaceId: workspace.id,
            taskId: command.taskId,
            id: command.beforeId,
          });
          if (!before)
            throw new NotFoundException(
              'This generation history page is unavailable.',
            );
          query.andWhere('(job."createdAt",job.id)<(:createdAt,:id)', {
            createdAt: before.createdAt,
            id: before.id,
          });
        }
        const rows = await query
            .orderBy('job."createdAt"', 'DESC')
            .addOrderBy('job.id', 'DESC')
            .take(26)
            .getMany(),
          page = rows.slice(0, 25),
          spends = await this.spends(
            manager,
            workspace.id,
            command.taskId,
            page.map((job) => job.id),
          );
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          taskId: command.taskId,
          items: page.map((job) =>
            this.dto(
              workspace,
              memberId,
              userWorkspaceId,
              job,
              scope.actor.isManager ||
                (scope.assigneeId === memberId && job.actorId === memberId),
              spends.get(job.id) ?? null,
            ),
          ),
          nextBeforeId: rows.length > 25 ? page[page.length - 1].id : null,
        };
      },
    );
  }
  async quote(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasQuoteInput,
  ): Promise<DeliveryAtlasQuoteDTO> {
    const command = parseAtlasInput(atlasQuoteSchema, input);
    const initial = await readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const request = await this.production.freeze(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command,
        );
        const { scope, document, connection } = await this.production.validate(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command.taskId,
          request,
        );
        const limit = this.connections.limit(connection, request.profileId);
        return {
          request,
          projectId: scope.task.projectId,
          configurationId: connection.id,
          configurationRevision: connection.revision,
          credentialId: connection.credentialId!,
          limit,
          assets: request.referenceAssetIds.map(
            (id) => document.assets.find((asset) => asset.id === id)!,
          ),
          key: await this.connections.secret(
            manager,
            workspace.id,
            connection.credentialId!,
          ),
        };
      },
    );
    const requestHash = atlasHash({
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      taskId: command.taskId,
      requestId: command.requestId,
      request: initial.request,
    });
    const prior = await readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        await this.creative.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command.taskId,
        );
        return manager.getRepository(DeliveryAtlasJobEntity).findOneBy({
          workspaceId: workspace.id,
          requestId: command.requestId,
        });
      },
    );
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new ConflictException(
          'This request identity belongs to earlier inputs. Keep that request or explicitly create a new one.',
        );
      return this.quoteResult(workspace, memberId, userWorkspaceId, prior);
    }
    const references: string[] = [];
    for (const asset of initial.assets) {
      await readDeliverySnapshot(this.dataSource, workspace.id, (manager) =>
        this.production.validate(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command.taskId,
          initial.request,
        ),
      );
      const stream = await this.storage.getCurrentDriver().readFile({
        filePath: `${workspace.id}/delivery-creative/${command.taskId}/${asset.id}`,
      });
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > 6000000) {
          stream.destroy();
          throw new BadRequestException(
            'A selected reference exceeds six megabytes.',
          );
        }
        chunks.push(bytes);
      }
      references.push(
        await this.adapter.upload(
          initial.key,
          Buffer.concat(chunks),
          asset.mimeType,
        ),
      );
    }
    const profile = atlasProfile(initial.request.profileId),
      calculation = await this.adapter.calculate(
        initial.key,
        this.adapter.body(
          profile,
          initial.request.prompt,
          initial.request.parameters,
          references,
        ),
      );
    return this.dataSource.transaction(async (manager) => {
      await this.connections.lock(manager, workspace.id);
      const current = await this.production.freeze(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command,
        ),
        connection = await this.connections.current(manager, workspace.id);
      if (
        !connection ||
        connection.credentialId !== initial.credentialId ||
        atlasHash(this.connections.limit(connection, current.profileId)) !==
          atlasHash(initial.limit) ||
        atlasHash(current) !== atlasHash(initial.request)
      )
        throw new ConflictException(
          'Generation inputs or model permissions changed during the estimate. Review them again.',
        );
      const repository = manager.getRepository(DeliveryAtlasJobEntity),
        existing = await repository.findOneBy({
          workspaceId: workspace.id,
          requestId: command.requestId,
        });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException(
            'This request identity was used for other inputs.',
          );
        return this.quoteResult(
          workspace,
          memberId,
          userWorkspaceId,
          existing,
          manager,
        );
      }
      const quotedAt = new Date(),
        job = repository.create({
          id: randomUUID(),
          workspaceId: workspace.id,
          requestId: command.requestId,
          taskId: command.taskId,
          projectId: initial.projectId,
          actorId: memberId,
          userWorkspaceId,
          credentialId: initial.credentialId,
          configurationRevision: initial.configurationRevision,
          revision: 1,
          requestHash,
          quoteToken: atlasHash({
            requestHash,
            quotedAt: quotedAt.toISOString(),
            cost: calculation.costUsd,
          }),
          status: 'QUOTED',
          request: initial.request,
          referenceUrls: references,
          reservationLimit: initial.limit,
          quotedCostUsd: calculation.costUsd,
          quoteEstimated: profile.estimatedBilling || calculation.estimated,
          quotedAt,
          providerPredictionId: null,
          providerStatus: null,
          outputUrl: null,
          publicationCancelled: false,
          assetId: null,
          costState: 'UNRESERVED',
          error: null,
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: null,
          attempts: 0,
          submittedAt: null,
        });
      await repository.save(job);
      return this.quoteResult(
        workspace,
        memberId,
        userWorkspaceId,
        job,
        manager,
      );
    });
  }
  private async quoteResult(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    job: DeliveryAtlasJobEntity,
    manager?: EntityManager,
  ): Promise<DeliveryAtlasQuoteDTO> {
    const apply = async (currentManager: EntityManager) => {
      await this.creative.scope(
        currentManager,
        workspace,
        memberId,
        userWorkspaceId,
        job.taskId,
      );
      if (job.status === 'QUOTED') {
        const { connection } = await this.production.validate(
          currentManager,
          workspace,
          memberId,
          userWorkspaceId,
          job.taskId,
          job.request,
        );
        if (
          connection.credentialId !== job.credentialId ||
          atlasHash(
            this.connections.limit(connection, job.request.profileId),
          ) !== atlasHash(job.reservationLimit)
        )
          throw new ConflictException(
            'This request’s credential or model reservation limit changed. Review a new estimate.',
          );
      }
      const quote = await this.budget.quoteMedia(
        currentManager,
        this.reservation(job),
      );
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        taskId: job.taskId,
        runId: job.id,
        requestId: job.requestId,
        profileId: job.request.profileId,
        quoteToken: job.quoteToken,
        quotedCostUsd: job.quotedCostUsd,
        maximumCostUsd: job.reservationLimit.maximumCostUsd,
        expiresAt: new Date(job.quotedAt.getTime() + 300000).toISOString(),
        budgetReady:
          quote.budgetReady &&
          job.status === 'QUOTED' &&
          job.quotedAt.getTime() + 300000 > Date.now(),
        blockedReason:
          job.status !== 'QUOTED'
            ? 'This request already started. Open its existing run.'
            : job.quotedAt.getTime() + 300000 <= Date.now()
              ? 'This estimate expired. Create a new request after reviewing current inputs.'
              : quote.blockedReason,
      };
    };
    return manager
      ? apply(manager)
      : readDeliverySnapshot(this.dataSource, workspace.id, apply);
  }
  async start(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasStartInput,
  ): Promise<DeliveryAtlasRunDTO> {
    const command = parseAtlasInput(atlasStartSchema, input);
    const result = await this.dataSource.transaction(async (manager) => {
      await this.connections.lock(manager, workspace.id);
      const { job, canControl } = await this.get(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        command.taskId,
        command.runId,
      );
      if (
        !canControl ||
        job.actorId !== memberId ||
        job.userWorkspaceId !== userWorkspaceId
      )
        throw new ForbiddenException(
          'Only this request’s current authorized initiator can start it.',
        );
      if (
        job.requestId !== command.requestId ||
        job.quoteToken !== command.quoteToken
      )
        throw new ConflictException(
          'This estimate does not match the saved request.',
        );
      if (job.status !== 'QUOTED')
        return this.receipt(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          job,
          canControl,
        );
      const { scope, document, connection } = await this.production.validate(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        command.taskId,
        job.request,
      );
      if (
        scope.task.revision !== job.request.taskRevision ||
        scope.task.projectId !== job.projectId ||
        connection.credentialId !== job.credentialId ||
        atlasHash(this.connections.limit(connection, job.request.profileId)) !==
          atlasHash(job.reservationLimit)
      )
        throw new ConflictException(
          'The source, credential or model reservation changed. Review a new estimate.',
        );
      const today = new Date().toISOString().slice(0, 10),
        count = await manager
          .getRepository(OtogrowAiSpendEntity)
          .createQueryBuilder('spend')
          .innerJoin(
            DeliveryAtlasJobEntity,
            'job',
            'job."workspaceId"=spend."workspaceId" AND job.id=spend."sourceRunId"',
          )
          .where('spend."workspaceId"=:workspaceId', {
            workspaceId: workspace.id,
          })
          .andWhere('spend."taskId"=:taskId AND job."taskId"=:taskId', {
            taskId: job.taskId,
          })
          .andWhere('spend."sourceKind"=:sourceKind', { sourceKind: 'MEDIA' })
          .andWhere('spend."createdAt">=:day', {
            day: `${today}T00:00:00.000Z`,
          })
          .getCount();
      if (
        count +
          (document.mediaRuns ?? []).filter((run) =>
            run.createdAt.startsWith(today),
          ).length >=
        document.mediaSettings!.dailyRunLimit
      )
        throw new BadRequestException(
          'The production daily run limit has been reached. Failed and cancelled requests count.',
        );
      await this.budget.reserveMedia(manager, this.reservation(job));
      job.status = 'QUEUED';
      job.costState = 'RESERVED';
      job.nextAttemptAt = new Date();
      job.revision++;
      await manager.getRepository(DeliveryAtlasJobEntity).save(job);
      return this.receipt(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        job,
        canControl,
      );
    });
    try {
      if (result.status === 'QUEUED')
        await this.queue.add(DELIVERY_ATLAS_JOB, {
          workspaceId: workspace.id,
          runId: result.id,
        });
    } catch {
      // The durable due-job sweep recovers an unavailable queue.
    }
    return result;
  }
  async cancel(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasRunInput,
  ): Promise<DeliveryAtlasRunDTO> {
    const command = parseAtlasInput(atlasRunSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.connections.lock(manager, workspace.id);
      const { job, canControl } = await this.get(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        command.taskId,
        command.runId,
      );
      if (!canControl)
        throw new ForbiddenException(
          'Only the current production owner or manager can stop publication.',
        );
      if (
        !job.publicationCancelled &&
        !['SUCCEEDED', 'FAILED'].includes(job.status)
      ) {
        job.publicationCancelled = true;
        if (['QUOTED', 'QUEUED'].includes(job.status)) {
          if (job.status === 'QUEUED') {
            await this.budget.stop(manager, source(job), true);
            job.costState = 'RELEASED';
          }
          job.status = 'CANCELLED';
          job.nextAttemptAt = null;
        }
        job.error =
          'Publication stopped. Atlas may still finish or charge an accepted request.';
        job.revision++;
        await manager.getRepository(DeliveryAtlasJobEntity).save(job);
      }
      return this.receipt(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        job,
        canControl,
      );
    });
  }
  async resume(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryAtlasRunInput,
  ): Promise<DeliveryAtlasRunDTO> {
    const command = parseAtlasInput(atlasRunSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await this.connections.lock(manager, workspace.id);
      const { job, canControl } = await this.get(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        command.taskId,
        command.runId,
      );
      if (
        !canControl ||
        !job.providerPredictionId ||
        job.status !== 'UNCERTAIN'
      )
        throw new ConflictException(
          'Only a saved Atlas prediction can resume status polling. An uncertain submission must never be resubmitted automatically.',
        );
      await this.connections.secret(manager, workspace.id, job.credentialId);
      job.status = 'POLLING';
      job.nextAttemptAt = new Date();
      job.leaseToken = null;
      job.leaseUntil = null;
      job.attempts = 0;
      job.error = null;
      job.revision++;
      await manager.getRepository(DeliveryAtlasJobEntity).save(job);
      return this.receipt(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        job,
        canControl,
      );
    });
  }
  @Cron('*/10 * * * * *')
  async recover() {
    const due: { workspaceId: string; id: string }[] =
      await this.dataSource.query(
        'SELECT "workspaceId",id FROM core."deliveryAtlasJob" WHERE status=ANY($1::text[]) AND ("nextAttemptAt" IS NULL OR "nextAttemptAt"<=now()) AND ("leaseUntil" IS NULL OR "leaseUntil"<=now()) ORDER BY "nextAttemptAt" NULLS FIRST,"createdAt",id LIMIT 25',
        [['QUEUED', 'SUBMITTING', 'POLLING', 'DOWNLOADING']],
      );
    for (const job of due)
      await this.queue.add(DELIVERY_ATLAS_JOB, {
        workspaceId: job.workspaceId,
        runId: job.id,
      });
  }
  async execute(workspaceId: string, runId: string) {
    const claim = await this.dataSource
      .transaction(async (manager) => {
        await this.connections.lock(manager, workspaceId);
        const job = await manager
            .getRepository(DeliveryAtlasJobEntity)
            .findOneBy({ workspaceId, id: runId }),
          workspace = await manager
            .getRepository(WorkspaceEntity)
            .findOneBy({ id: workspaceId });
        if (
          !job ||
          !workspace ||
          !['QUEUED', 'SUBMITTING', 'POLLING', 'DOWNLOADING'].includes(
            job.status,
          ) ||
          (job.leaseUntil && job.leaseUntil > new Date()) ||
          (job.nextAttemptAt && job.nextAttemptAt > new Date())
        )
          return null;
        if (job.status === 'SUBMITTING') {
          await this.budget.markMediaUncertain(
            manager,
            source(job),
            'The worker stopped during submission. Atlas acceptance is unknown; do not resubmit this request.',
          );
          job.status = 'UNCERTAIN';
          job.costState = 'UNCERTAIN';
          job.error = 'SUBMISSION_UNCERTAIN';
          job.leaseToken = null;
          job.leaseUntil = null;
          await manager.getRepository(DeliveryAtlasJobEntity).save(job);
          return null;
        }
        const key = await this.connections.secret(
          manager,
          workspaceId,
          job.credentialId,
        );
        if (job.status === 'QUEUED') {
          await this.budget.authorizeMediaDispatch(
            manager,
            source(job),
            job.userWorkspaceId,
            async (authorizationManager) => {
              const { scope, connection } = await this.production.validate(
                authorizationManager,
                workspace,
                job.actorId,
                job.userWorkspaceId,
                job.taskId,
                job.request,
              );
              if (
                scope.task.projectId !== job.projectId ||
                connection.credentialId !== job.credentialId ||
                atlasHash(
                  this.connections.limit(connection, job.request.profileId),
                ) !== atlasHash(job.reservationLimit)
              )
                throw new ConflictException(
                  'This queued request’s source, credential or reservation limit changed.',
                );
            },
          );
          job.status = 'SUBMITTING';
          job.submittedAt = new Date();
          job.costState = 'DISPATCHED';
        }
        job.leaseToken = randomUUID();
        job.leaseUntil = new Date(Date.now() + LEASE_MS);
        job.nextAttemptAt = null;
        job.attempts++;
        job.revision++;
        await manager.getRepository(DeliveryAtlasJobEntity).save(job);
        return { job, workspace, key, leaseToken: job.leaseToken };
      })
      .catch(async () => {
        await this.failBeforeNetwork(workspaceId, runId);
        return null;
      });
    if (!claim) return;
    let observedPrediction: AtlasPrediction | null = null;
    try {
      const prediction =
        claim.job.status === 'SUBMITTING'
          ? await this.adapter.submit(
              claim.key,
              atlasProfile(claim.job.request.profileId),
              this.adapter.body(
                atlasProfile(claim.job.request.profileId),
                claim.job.request.prompt,
                claim.job.request.parameters,
                claim.job.referenceUrls,
              ),
            )
          : await this.adapter.poll(
              claim.key,
              claim.job.providerPredictionId!,
              claim.job.request.profileId,
            );
      observedPrediction = prediction;
      const ready = await this.accept(claim.job, claim.leaseToken, prediction);
      if (ready) await this.publish(claim.workspace, ready, claim.leaseToken);
    } catch {
      await this.dataSource.transaction(async (manager) => {
        await this.connections.lock(manager, workspaceId);
        const job = await manager
          .getRepository(DeliveryAtlasJobEntity)
          .findOneBy({ workspaceId, id: runId });
        if (!job || job.leaseToken !== claim.leaseToken) return;
        if (observedPrediction && !job.providerPredictionId) {
          await this.budget.recordMediaPrediction(
            manager,
            source(job),
            observedPrediction.id,
          );
          job.providerPredictionId = observedPrediction.id;
          job.providerStatus = observedPrediction.status;
        }
        await this.budget.markMediaUncertain(
          manager,
          source(job),
          job.providerPredictionId
            ? 'Atlas status or output could not be verified. The accepted prediction remains available for explicit polling recovery.'
            : 'Atlas submission outcome is unknown. Do not automatically resubmit.',
        );
        job.status = 'UNCERTAIN';
        job.costState = 'UNCERTAIN';
        job.error = job.providerPredictionId
          ? 'STATUS_OR_OUTPUT_UNCONFIRMED'
          : 'SUBMISSION_UNCERTAIN';
        job.leaseToken = null;
        job.leaseUntil = null;
        job.revision++;
        await manager.getRepository(DeliveryAtlasJobEntity).save(job);
      });
    }
  }
  private async failBeforeNetwork(workspaceId: string, runId: string) {
    await this.dataSource.transaction(async (manager) => {
      await this.connections.lock(manager, workspaceId);
      const job = await manager
        .getRepository(DeliveryAtlasJobEntity)
        .findOneBy({ workspaceId, id: runId });
      if (!job || (job.leaseUntil && job.leaseUntil > new Date())) return;
      if (job.status === 'QUEUED') {
        await this.budget.stop(manager, source(job), true);
        job.status = 'FAILED';
        job.costState = 'RELEASED';
      } else if (
        ['SUBMITTING', 'POLLING', 'DOWNLOADING'].includes(job.status)
      ) {
        await this.budget.markMediaUncertain(
          manager,
          source(job),
          'Current source or credentials could not be verified. Any provider charge remains held.',
        );
        job.status = 'UNCERTAIN';
        job.costState = 'UNCERTAIN';
      } else return;
      job.error = 'CURRENT_ACCESS_OR_CONFIGURATION_UNAVAILABLE';
      job.leaseToken = null;
      job.leaseUntil = null;
      job.nextAttemptAt = null;
      job.revision++;
      await manager.getRepository(DeliveryAtlasJobEntity).save(job);
    });
  }
  private async accept(
    claimed: DeliveryAtlasJobEntity,
    leaseToken: string,
    prediction: AtlasPrediction,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.connections.lock(manager, claimed.workspaceId);
      const job = await manager
        .getRepository(DeliveryAtlasJobEntity)
        .findOneBy({ workspaceId: claimed.workspaceId, id: claimed.id });
      if (!job) return null;
      if (job.leaseToken !== leaseToken) {
        if (
          !job.providerPredictionId &&
          claimed.status === 'SUBMITTING' &&
          job.requestHash === claimed.requestHash
        ) {
          await this.budget.recordMediaPrediction(
            manager,
            source(job),
            prediction.id,
          );
          await this.budget.markMediaUncertain(
            manager,
            source(job),
            'Atlas confirmed acceptance after the local submission lease ended. Only the saved prediction will be polled.',
          );
          job.providerPredictionId = prediction.id;
          job.providerStatus = prediction.status;
          job.status = 'POLLING';
          job.costState = 'UNCERTAIN';
          job.nextAttemptAt = new Date();
          job.leaseToken = null;
          job.leaseUntil = null;
          job.revision++;
          await manager.getRepository(DeliveryAtlasJobEntity).save(job);
        }
        return null;
      }
      if (!job.providerPredictionId) {
        await this.budget.recordMediaPrediction(
          manager,
          source(job),
          prediction.id,
        );
        job.providerPredictionId = prediction.id;
      } else if (job.providerPredictionId !== prediction.id)
        throw new ConflictException('Atlas prediction identity changed.');
      job.providerStatus = prediction.status;
      if (prediction.status === 'failed') {
        const spend = await this.budget.confirmMediaFailure(
          manager,
          source(job),
          prediction.id,
        );
        job.costState = spend.state;
        job.status = job.publicationCancelled ? 'CANCELLED' : 'FAILED';
        job.error = 'ATLAS_REPORTED_FAILURE';
        job.nextAttemptAt = null;
        job.leaseToken = null;
        job.leaseUntil = null;
      } else if (['completed', 'succeeded'].includes(prediction.status)) {
        await this.budget.markMediaUncertain(
          manager,
          source(job),
          'Atlas output completed, but its attributable actual charge is not confirmed. The full reservation remains held.',
        );
        job.costState = 'UNCERTAIN';
        if (job.publicationCancelled) {
          job.status = 'CANCELLED';
          job.leaseToken = null;
          job.leaseUntil = null;
          job.nextAttemptAt = null;
        } else if (
          prediction.has_nsfw_contents?.some(Boolean) ||
          !prediction.outputs?.length
        ) {
          job.status = 'UNCERTAIN';
          job.error = 'OUTPUT_UNAVAILABLE_OR_REJECTED';
          job.leaseToken = null;
          job.leaseUntil = null;
          job.nextAttemptAt = null;
        } else {
          job.status = 'DOWNLOADING';
          job.outputUrl = prediction.outputs[0];
          if (job.assetId) {
            const scope = await this.creative.scope(
              manager,
              await manager
                .getRepository(WorkspaceEntity)
                .findOneByOrFail({ id: job.workspaceId }),
              job.actorId,
              job.userWorkspaceId,
              job.taskId,
            );
            const priorAsset = scope.task.details.creative?.assets.find(
              (asset) => asset.id === job.assetId,
            );
            if (priorAsset?.storageState === 'FAILED') job.assetId = null;
            else if (priorAsset)
              throw new ConflictException(
                'The earlier import must finish or be marked failed before recovery.',
              );
          }
          job.assetId ??= randomUUID();
        }
      } else if (
        job.attempts >= 120 ||
        (job.submittedAt && Date.now() - job.submittedAt.getTime() > 3600000)
      ) {
        await this.budget.markMediaUncertain(
          manager,
          source(job),
          'Atlas has not completed within the local polling window. Resume only the saved prediction.',
        );
        job.status = 'UNCERTAIN';
        job.costState = 'UNCERTAIN';
        job.error = 'POLLING_WINDOW_ENDED';
        job.leaseToken = null;
        job.leaseUntil = null;
        job.nextAttemptAt = null;
      } else {
        job.status = 'POLLING';
        job.nextAttemptAt = new Date(Date.now() + 5000);
        job.leaseToken = null;
        job.leaseUntil = null;
      }
      job.revision++;
      await manager.getRepository(DeliveryAtlasJobEntity).save(job);
      return job.status === 'DOWNLOADING' ? job : null;
    });
  }
  private async publish(
    workspace: WorkspaceEntity,
    job: DeliveryAtlasJobEntity,
    leaseToken: string,
  ) {
    const prepared = await readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const current = await manager
          .getRepository(DeliveryAtlasJobEntity)
          .findOneBy({ workspaceId: workspace.id, id: job.id });
        if (
          !current ||
          current.leaseToken !== leaseToken ||
          current.publicationCancelled
        )
          throw new ConflictException(
            'This output can no longer be published.',
          );
        const validated = await this.production.validate(
          manager,
          workspace,
          job.actorId,
          job.userWorkspaceId,
          job.taskId,
          job.request,
        );
        if (validated.scope.task.projectId !== job.projectId)
          throw new ConflictException('The production project changed.');
        return validated;
      },
    );
    const output = await this.adapter.download(
      job.outputUrl!,
      job.request.kind,
    );
    if (prepared.document.assets.some((asset) => asset.id === job.assetId))
      throw new ConflictException(
        'An earlier import for this asset needs recovery before another import.',
      );
    const validate = async (
      _document: typeof prepared.document,
      _scope: Awaited<ReturnType<DeliveryCreativeService['scope']>>,
      manager: EntityManager,
    ) => {
      const current = await manager
        .getRepository(DeliveryAtlasJobEntity)
        .findOneBy({ workspaceId: workspace.id, id: job.id });
      if (
        !current ||
        current.leaseToken !== leaseToken ||
        current.publicationCancelled ||
        current.status !== 'DOWNLOADING'
      )
        throw new ConflictException(
          'Publication was stopped or its import lease changed.',
        );
      const verified = await this.production.validate(
        manager,
        workspace,
        job.actorId,
        job.userWorkspaceId,
        job.taskId,
        job.request,
      );
      if (verified.scope.task.projectId !== job.projectId)
        throw new ConflictException('The production project changed.');
    };
    await this.creative.addAsset(
      workspace,
      job.actorId,
      job.userWorkspaceId,
      job.taskId,
      prepared.scope.task.revision,
      {
        id: job.assetId!,
        name: `atlas-${job.request.kind.toLowerCase()}-${job.id}.${output.extension}`,
        kind: job.request.target === 'BRIEF' ? 'FINAL' : job.request.kind,
        shotId: job.request.shotId,
        mimeType: output.mimeType,
        size: output.bytes.length,
        createdAt: new Date().toISOString(),
        uploadedBy: job.actorId,
      },
      async () => {
        await this.storage.getCurrentDriver().writeFile({
          filePath: `${workspace.id}/delivery-creative/${job.taskId}/${job.assetId}`,
          sourceFile: output.bytes,
          mimeType: output.mimeType,
        });
      },
      {
        validate,
        complete: async (_document, _scope, manager) => {
          const current = await manager
            .getRepository(DeliveryAtlasJobEntity)
            .findOneBy({ workspaceId: workspace.id, id: job.id });
          if (
            !current ||
            current.leaseToken !== leaseToken ||
            current.publicationCancelled
          )
            throw new ConflictException('Publication was stopped.');
          current.status = 'SUCCEEDED';
          current.error = null;
          current.leaseToken = null;
          current.leaseUntil = null;
          current.nextAttemptAt = null;
          current.revision++;
          await manager.getRepository(DeliveryAtlasJobEntity).save(current);
        },
      },
    );
  }
}
