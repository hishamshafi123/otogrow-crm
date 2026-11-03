import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import {
  DataSource,
  LessThan,
  QueryFailedError,
  type EntityManager,
} from 'typeorm';
import { randomUUID } from 'node:crypto';
import { generateText, Output } from 'ai';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { canUseDeliveryAgent } from 'src/modules/delivery/agents/delivery-agent-access';
import { countDeliveryAgentRunsForUtcDay } from 'src/modules/delivery/agents/count-delivery-agent-runs-for-utc-day';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { type OtogrowActivityInput } from 'src/modules/otogrow-activity/otogrow-activity.types';
import { OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import { microToUsd } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';
import {
  usageFromAiError,
  usageFromAiSdk,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-usage';
import {
  advertisingCursor,
  advertisingHash,
  advertisingTimestampSql,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { OtogrowActivityAnalysisRunEntity } from 'src/modules/otogrow-activity/analysis/entities/otogrow-activity-analysis-run.entity';
import {
  activityAnalysisPreviewSchema,
  activityAnalysisRequestSchema,
  activityAnalysisRunsSchema,
  activityAnalysisSelectionSchema,
  cancelActivityAnalysisSchema,
  startActivityAnalysisSchema,
  type ActivityAnalysisPreviewInput,
  type ActivityAnalysisReceipt,
  type ActivityAnalysisStatus,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.types';
import {
  activityAnalysisSystemPrompt,
  activityAnalysisResponseSchema,
  activityAnalysisBody,
  activityAnalysisContextFingerprint,
  activityAnalysisPrompt,
  assertActivityAnalysisFingerprint,
  buildActivityAnalysisContext,
  validateActivityAnalysisOutput,
  assertActivityAnalysisPrivacy,
  activityAnalysisBlockedReasons,
  activityAnalysisEvidenceFingerprint,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.policy';
import { OtogrowActivityService } from 'src/modules/otogrow-activity/otogrow-activity.service';
import { OtogrowActivityCurrentWorkService } from 'src/modules/otogrow-activity/analysis/current-work/otogrow-activity-current-work.service';
import { currentTaskSelectionSchema } from 'src/modules/otogrow-activity/analysis/current-work/activity-current-work.policy';
import {
  type ActivityIdentity,
  activityHasFinance,
  parseActivityInput,
  readActivityCursor,
} from 'src/modules/otogrow-activity/otogrow-activity.reads';

export const OTOGROW_ACTIVITY_ANALYSIS_JOB = 'otogrow-activity-analysis';
export const ACTIVITY_ANALYSIS_METADATA_FIELDS = [
  'id',
  'workspaceId',
  'requestId',
  'initiatorId',
  'initiatorName',
  'userWorkspaceId',
  'agentId',
  'agentVersion',
  'revision',
  'status',
  'inputHash',
  'bodyFingerprint',
  'contextFingerprint',
  'agent',
  'basis',
  'startReceipt',
  'error',
  'cancelRequestId',
  'cancelInputHash',
  'cancelReceipt',
  'createdAt',
  'updatedAt',
  'startedAt',
  'finishedAt',
] as const;
const asDate = (value: Date | string | null) =>
  value instanceof Date ? value.toISOString() : value;
const paidSource = (
  run: Pick<OtogrowActivityAnalysisRunEntity, 'workspaceId' | 'id'>,
) => ({
  workspaceId: run.workspaceId,
  sourceKind: 'ACTIVITY_ANALYSIS' as const,
  sourceRunId: run.id,
});

@Injectable()
export class OtogrowActivityAnalysisService {
  private readonly logger = new Logger(OtogrowActivityAnalysisService.name);
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: OtogrowAccessService,
    private readonly activity: OtogrowActivityService,
    private readonly models: AiModelRegistryService,
    @InjectMessageQueue(MessageQueue.aiQueue)
    private readonly queue: MessageQueueService,
    private readonly budget: OtogrowAiBudgetService,
    private readonly currentWork: OtogrowActivityCurrentWorkService,
  ) {}

  private async write<TData>(
    workspaceId: string,
    action: (manager: EntityManager) => Promise<TData>,
    transactionManager?: EntityManager,
  ) {
    if (
      transactionManager &&
      !transactionManager.queryRunner?.isTransactionActive
    )
      throw new Error('Activity analysis requires an active transaction.');
    const apply = async (manager: EntityManager) => {
      // Budget reservation takes this same exclusive lock; do not upgrade after another domain lock.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspaceId}`],
      );
      return action(manager);
    };
    try {
      return await (transactionManager
        ? apply(transactionManager)
        : this.dataSource.transaction(apply));
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        'code' in error.driverError &&
        error.driverError.code === '23505'
      )
        throw new ConflictException(
          'This analysis request identity already exists. Check its exact saved request before continuing.',
        );
      throw error;
    }
  }
  private identity(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return this.activity.authority(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
    );
  }
  private summary(run: OtogrowActivityAnalysisRunEntity) {
    return {
      id: run.id,
      requestId: run.requestId,
      initiatorId: run.initiatorId,
      initiatorName: run.initiatorName,
      status: run.status,
      revision: run.revision,
      agent: run.agent,
      bodyFingerprint: run.bodyFingerprint,
      contextFingerprint: run.contextFingerprint,
      createdAt: asDate(run.createdAt)!,
      updatedAt: asDate(run.updatedAt)!,
      startedAt: asDate(run.startedAt),
      finishedAt: asDate(run.finishedAt),
      error: run.error,
      resultAvailable: run.status === 'SUCCEEDED',
      includedCount: run.basis.includedCount,
      omittedCount: run.basis.omittedCount,
    };
  }
  private currentWorkHistoryCondition(taskIdsSql: string) {
    return `(run."basis"->'currentWork' IS NULL OR (
      NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(run."basis"->'currentWork'->'taskIds') captured(value)
        WHERE NOT EXISTS (SELECT 1 FROM (${taskIdsSql}) visible WHERE visible."taskId"::text=captured.value)
      )
    ))`;
  }
  private async assertRunPrivacy(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    run: OtogrowActivityAnalysisRunEntity,
    identity: ActivityIdentity,
  ) {
    assertActivityAnalysisPrivacy(run.basis, identity);
    if (!run.basis.currentWork) return;
    const visibility = await this.currentWork.nativeHistoryVisibility(
      manager,
      workspace,
      identity.memberId,
      identity.userWorkspaceId,
      identity,
    );
    const visible = await manager
      .getRepository(OtogrowActivityAnalysisRunEntity)
      .createQueryBuilder('run')
      .where('run."workspaceId" = :workspaceId AND run.id = :runId', {
        workspaceId: workspace.id,
        runId: run.id,
      })
      .andWhere(this.currentWorkHistoryCondition(visibility.taskIdsSql), {
        ...visibility.parameters,
        activityNativeFingerprint: visibility.fingerprint,
      })
      .getCount();
    if (!visible)
      throw new ForbiddenException(
        'Current native task visibility is required for this saved analysis.',
      );
    const after = await this.currentWork.nativeHistoryVisibility(
      manager,
      workspace,
      identity.memberId,
      identity.userWorkspaceId,
      identity,
    );
    assertActivityAnalysisFingerprint(
      after.fingerprint,
      visibility.fingerprint,
    );
  }
  private model(
    agent: DeliveryAgentEntity,
    identity: ActivityIdentity,
    workspace: WorkspaceEntity,
  ) {
    const configuration = agent.configuration;
    if (
      !configuration.enabled ||
      configuration.kind !== 'ACTIVITY' ||
      configuration.projectIds.length ||
      configuration.tools.length ||
      !configuration.humanConfirmation ||
      !canUseDeliveryAgent(configuration, identity.actor)
    )
      throw new ForbiddenException(
        'Choose an enabled workspace activity assistant permitted for your current role.',
      );
    const model = configuration.modelId
      ? this.models.getModel(configuration.modelId)
      : null;
    if (!model || !configuration.modelId)
      throw new BadRequestException(
        'Connect an available model before preparing an activity analysis.',
      );
    this.models.validateModelAvailability(configuration.modelId, workspace);
    return model;
  }
  private async prepare(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: ActivityAnalysisPreviewInput,
    capturedAt?: string,
  ) {
    const evidence = await this.activity.evidence(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      input.filters,
      capturedAt,
    );
    const agent = await manager
      .getRepository(DeliveryAgentEntity)
      .findOneBy({ workspaceId: workspace.id, id: input.agentId });
    if (!agent)
      throw new NotFoundException('This activity assistant is unavailable.');
    this.model(agent, evidence.identity, workspace);
    const currentWork = input.includeCurrentWork
      ? await this.currentWork.snapshot(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          {
            personId: input.filters.personId,
            projectId: input.filters.projectId,
            clientId: input.filters.clientId,
          },
          evidence.capturedAt,
          evidence.identity,
        )
      : undefined;
    const context = buildActivityAnalysisContext(
      input,
      agent,
      evidence,
      currentWork,
    );
    return {
      identity: evidence.identity,
      agent,
      context,
      bodyFingerprint: advertisingHash(activityAnalysisBody(input)),
      contextFingerprint: activityAnalysisContextFingerprint(context, agent),
      evidenceFingerprint: activityAnalysisEvidenceFingerprint(context),
      agentSnapshot: {
        id: agent.id,
        name: agent.configuration.name,
        version: agent.version,
        modelId: agent.configuration.modelId!,
        maxOutputTokens: agent.configuration.maxOutputTokens,
      },
    };
  }
  private async validateRun(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    run: OtogrowActivityAnalysisRunEntity,
  ) {
    const identity = await this.identity(
      manager,
      workspace,
      run.initiatorId,
      run.userWorkspaceId,
    );
    await this.assertRunPrivacy(manager, workspace, run, identity);
    const agent = await manager
      .getRepository(DeliveryAgentEntity)
      .findOneBy({ workspaceId: workspace.id, id: run.agentId });
    if (
      !agent ||
      agent.version !== run.agentVersion ||
      advertisingHash(agent.configuration) !==
        advertisingHash(run.configuration)
    )
      throw new ConflictException(
        'The activity assistant configuration changed. Prepare a new analysis.',
      );
    this.model(agent, identity, workspace);
    assertActivityAnalysisFingerprint(
      activityAnalysisContextFingerprint(run.context, agent),
      run.contextFingerprint,
    );
    // Captured events are immutable historical evidence. New activity must not invalidate an already queued analysis.
    if (run.context.currentWork) {
      const currentWork = await this.currentWork.snapshot(
        manager,
        workspace,
        run.initiatorId,
        run.userWorkspaceId,
        run.context.currentWork.scope,
        undefined,
        identity,
      );
      assertActivityAnalysisFingerprint(
        currentWork.fingerprint,
        run.context.currentWork.fingerprint,
      );
      if (!currentWork.complete)
        throw new ConflictException(
          'Current work evidence is incomplete. Prepare a new analysis.',
        );
    }
    return identity;
  }
  private record(
    manager: EntityManager,
    run: OtogrowActivityAnalysisRunEntity,
    action: string,
    outcome: OtogrowActivityInput['outcome'],
    actorId: string | null,
    actorType: 'HUMAN' | 'AGENT' | 'SYSTEM',
    before: ActivityAnalysisStatus | null,
    count?: number,
  ) {
    return recordOtogrowActivity(manager, {
      workspaceId: run.workspaceId,
      actorId,
      actorType,
      category: 'AGENT',
      action,
      outcome,
      summary:
        'Recorded an evidence-based activity analysis for human review; no work assignment or employee assessment occurred.',
      sourceType: 'activity-analysis',
      sourceId: run.id,
      changes: [
        { field: 'runStatus', before, after: run.status },
        {
          field: 'includedEventCount',
          before: null,
          after: String(run.basis.includedCount),
        },
        {
          field: 'omittedEventCount',
          before: null,
          after: String(run.basis.omittedCount),
        },
        ...(count === undefined
          ? []
          : [{ field: 'findingCount', before: null, after: String(count) }]),
      ],
    });
  }
  async preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(activityAnalysisPreviewSchema, raw);
    return this.write(
      workspace.id,
      async (manager) => {
        const prepared = await this.prepare(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input,
        );
        const budget = await this.budget.quote(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          sourceKind: 'ACTIVITY_ANALYSIS',
          sourceRunId: randomUUID(),
          projectId: null,
          taskId: null,
          modelId: prepared.agentSnapshot.modelId,
          kind: 'TEXT',
          maxOutputTokens: prepared.agentSnapshot.maxOutputTokens,
        });
        const blockedReasons = activityAnalysisBlockedReasons(prepared.context);
        if (
          (await countDeliveryAgentRunsForUtcDay(
            manager,
            workspace.id,
            input.agentId,
          )) >= prepared.agent.configuration.dailyRunLimit
        )
          blockedReasons.push(
            'This assistant reached its UTC daily run limit. Failed and cancelled runs count.',
          );
        if (!budget.budgetReady)
          blockedReasons.push(
            budget.blockedReason ??
              'An approved price and available budget are required.',
          );
        return {
          ...prepared.identity,
          bodyFingerprint: prepared.bodyFingerprint,
          contextFingerprint: prepared.contextFingerprint,
          evidenceFingerprint: prepared.evidenceFingerprint,
          agent: prepared.agentSnapshot,
          context: prepared.context,
          budget,
          canStart: blockedReasons.length === 0,
          blockedReasons,
        };
      },
      transactionManager,
    );
  }
  async currentTask(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(currentTaskSelectionSchema, raw);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const identity = await this.identity(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const { scope, ...reading } = await this.currentWork.task(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input,
          identity,
        );
        return { ...identity, ...reading, scopeSelection: scope };
      },
      transactionManager,
    );
  }
  async start(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(startActivityAnalysisSchema, raw);
    const inputHash = advertisingHash(input);
    const response = await this.write(
      workspace.id,
      async (manager) => {
        const identity = await this.identity(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const repository = manager.getRepository(
          OtogrowActivityAnalysisRunEntity,
        );
        const prior = await repository.findOne({
          where: { workspaceId: workspace.id, requestId: input.requestId },
          select: [...ACTIVITY_ANALYSIS_METADATA_FIELDS],
        });
        if (prior) {
          await this.assertRunPrivacy(manager, workspace, prior, identity);
          if (
            prior.initiatorId !== memberId ||
            prior.userWorkspaceId !== userWorkspaceId ||
            prior.inputHash !== inputHash ||
            prior.id !== input.id
          )
            throw new ConflictException(
              'This request belongs to different preparation. Check the original request rather than changing its body.',
            );
          return {
            ...identity,
            receipt: prior.startReceipt,
            run: this.summary(prior),
          };
        }
        const prepared = await this.prepare(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input,
          input.capturedAt,
        );
        assertActivityAnalysisFingerprint(
          prepared.bodyFingerprint,
          input.bodyFingerprint,
        );
        assertActivityAnalysisFingerprint(
          prepared.contextFingerprint,
          input.contextFingerprint,
        );
        assertActivityAnalysisFingerprint(
          prepared.evidenceFingerprint,
          input.evidenceFingerprint,
        );
        if (prepared.agent.version !== input.agentVersion)
          throw new ConflictException('The assistant changed. Preview again.');
        const blocked = activityAnalysisBlockedReasons(prepared.context);
        if (blocked.length) throw new BadRequestException(blocked[0]);
        if (
          (await countDeliveryAgentRunsForUtcDay(
            manager,
            workspace.id,
            input.agentId,
          )) >= prepared.agent.configuration.dailyRunLimit
        )
          throw new BadRequestException(
            'This assistant reached its UTC daily run limit. Failed and cancelled runs count.',
          );
        const person = (
          await this.access.listActiveMembers(workspace.id, manager)
        ).find((member) => member.memberId === memberId);
        if (!person)
          throw new ForbiddenException(
            'Current workspace membership is required.',
          );
        const now = new Date();
        const receipt: ActivityAnalysisReceipt = {
          action: 'STARTED',
          requestId: input.requestId,
          runId: input.id,
          actorId: memberId,
          userWorkspaceId,
          inputHash,
          bodyFingerprint: prepared.bodyFingerprint,
          createdAt: now.toISOString(),
          revision: 1,
          status: 'QUEUED',
        };
        const values = {
          id: input.id,
          workspaceId: workspace.id,
          requestId: input.requestId,
          initiatorId: memberId,
          initiatorName: person.name,
          userWorkspaceId,
          agentId: prepared.agent.id,
          agentVersion: prepared.agent.version,
          agent: prepared.agentSnapshot,
          configuration: prepared.agent.configuration,
          input,
          inputHash,
          bodyFingerprint: prepared.bodyFingerprint,
          contextFingerprint: prepared.contextFingerprint,
          basis: {
            evidenceFingerprint: prepared.evidenceFingerprint,
            containsFinance: prepared.context.containsFinance,
            includedCount: prepared.context.includedCount,
            omittedCount: prepared.context.omittedCount,
            promptVersion: prepared.context.promptVersion,
            outputContractVersion: prepared.context.outputContractVersion,
            ...(prepared.context.currentWork
              ? {
                  currentWork: {
                    nativeVisibilityFingerprint:
                      prepared.context.currentWork.nativeVisibilityFingerprint,
                    taskIds: prepared.context.currentWork.items.map(
                      (task) => task.taskId,
                    ),
                  },
                }
              : {}),
          },
          context: prepared.context,
          startReceipt: receipt,
          status: 'QUEUED' as const,
          revision: 1,
          result: null,
          usage: null,
          error: null,
          cancelRequestId: null,
          cancelInputHash: null,
          cancelReceipt: null,
          createdAt: now,
          updatedAt: now,
          startedAt: null,
          finishedAt: null,
        };
        const run = repository.create(values);
        await repository.insert(values);
        await this.budget.reserve(manager, {
          ...paidSource(run),
          actorId: memberId,
          projectId: null,
          taskId: null,
          modelId: prepared.agentSnapshot.modelId,
          kind: 'TEXT',
          maxOutputTokens: prepared.agentSnapshot.maxOutputTokens,
          pricingRevision: input.pricingRevision,
        });
        await this.record(
          manager,
          run,
          'ACTIVITY_ANALYSIS_QUEUED',
          'QUEUED',
          memberId,
          'HUMAN',
          null,
        );
        return { ...identity, receipt, run: this.summary(run) };
      },
      transactionManager,
    );
    if (!transactionManager && response.run.status === 'QUEUED')
      await this.enqueue(response.run.id);
    return response;
  }
  async cancel(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(cancelActivityAnalysisSchema, raw);
    const inputHash = advertisingHash(input);
    return this.write(
      workspace.id,
      async (manager) => {
        const identity = await this.identity(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const repository = manager.getRepository(
          OtogrowActivityAnalysisRunEntity,
        );
        const run = await repository.findOne({
          where: { workspaceId: workspace.id, id: input.id },
          select: [...ACTIVITY_ANALYSIS_METADATA_FIELDS],
        });
        if (!run)
          throw new NotFoundException('This activity analysis is unavailable.');
        await this.assertRunPrivacy(manager, workspace, run, identity);
        if (run.cancelReceipt) {
          if (
            run.cancelRequestId !== input.requestId ||
            run.cancelInputHash !== inputHash ||
            run.cancelReceipt.actorId !== memberId ||
            run.cancelReceipt.userWorkspaceId !== userWorkspaceId
          )
            throw new ConflictException(
              'This run already has a different cancellation. Check the original saved request.',
            );
          return {
            ...identity,
            receipt: run.cancelReceipt,
            run: this.summary(run),
          };
        }
        if (
          run.revision !== input.revision ||
          !['QUEUED', 'RUNNING'].includes(run.status)
        )
          throw new ConflictException(
            'This run changed or ended. Refresh before cancelling.',
          );
        const before = run.status;
        const now = new Date();
        await this.budget.stop(manager, paidSource(run), true);
        run.status = 'CANCELLED';
        run.revision++;
        run.finishedAt = now;
        run.updatedAt = now;
        const receipt: ActivityAnalysisReceipt = {
          action: 'CANCELLED',
          requestId: input.requestId,
          runId: run.id,
          actorId: memberId,
          userWorkspaceId,
          inputHash,
          bodyFingerprint: run.bodyFingerprint,
          createdAt: now.toISOString(),
          revision: run.revision,
          status: run.status,
        };
        await repository.update(
          { workspaceId: workspace.id, id: run.id },
          {
            status: run.status,
            revision: run.revision,
            finishedAt: now,
            cancelRequestId: input.requestId,
            cancelInputHash: inputHash,
            cancelReceipt: receipt,
          },
        );
        await this.record(
          manager,
          run,
          'ACTIVITY_ANALYSIS_CANCELLED',
          'CANCELLED',
          memberId,
          'HUMAN',
          before,
        );
        return { ...identity, receipt, run: this.summary(run) };
      },
      transactionManager,
    );
  }
  async request(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(activityAnalysisRequestSchema, raw);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const identity = await this.identity(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const run = await manager
          .getRepository(OtogrowActivityAnalysisRunEntity)
          .findOne({
            where:
              input.action === 'STARTED'
                ? {
                    workspaceId: workspace.id,
                    requestId: input.requestId,
                    initiatorId: memberId,
                    userWorkspaceId,
                  }
                : {
                    workspaceId: workspace.id,
                    cancelRequestId: input.requestId,
                  },
            select: [...ACTIVITY_ANALYSIS_METADATA_FIELDS],
          });
        const receipt =
          input.action === 'STARTED' ? run?.startReceipt : run?.cancelReceipt;
        if (
          !run ||
          !receipt ||
          receipt.actorId !== memberId ||
          receipt.userWorkspaceId !== userWorkspaceId
        )
          return { ...identity, receipt: null, run: null };
        await this.assertRunPrivacy(manager, workspace, run, identity);
        return { ...identity, receipt, run: this.summary(run) };
      },
      transactionManager,
    );
  }
  private async readRun(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    detail: boolean,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(activityAnalysisSelectionSchema, raw);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const identity = await this.identity(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const run = await manager
          .getRepository(OtogrowActivityAnalysisRunEntity)
          .findOne({
            where: { workspaceId: workspace.id, id: input.id },
            select: [
              ...ACTIVITY_ANALYSIS_METADATA_FIELDS,
              ...(detail ? (['context', 'result', 'usage'] as const) : []),
            ],
          });
        if (!run)
          throw new NotFoundException('This activity analysis is unavailable.');
        await this.assertRunPrivacy(manager, workspace, run, identity);
        return {
          ...identity,
          run: this.summary(run),
          canCancel: ['QUEUED', 'RUNNING'].includes(run.status),
          ...(detail
            ? { context: run.context, result: run.result, usage: run.usage }
            : {}),
        };
      },
      transactionManager,
    );
  }
  detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    return this.readRun(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      true,
      transactionManager,
    );
  }
  state(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
  ) {
    return this.readRun(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      false,
      transactionManager,
    );
  }
  async runs(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseActivityInput(activityAnalysisRunsSchema, raw);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const identity = await this.identity(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        const query = manager
          .getRepository(OtogrowActivityAnalysisRunEntity)
          .createQueryBuilder('run')
          .select(
            ACTIVITY_ANALYSIS_METADATA_FIELDS.map((field) => `run.${field}`),
          )
          .where('run."workspaceId" = :workspaceId', {
            workspaceId: workspace.id,
          });
        if (!activityHasFinance(identity))
          query.andWhere(
            `COALESCE((run.basis->>'containsFinance')::boolean,false)=false`,
          );
        const hasCurrentWork = await query
          .clone()
          .andWhere(`run."basis"->'currentWork' IS NOT NULL`)
          .getCount();
        let nativeHistoryScope: string | undefined;
        if (hasCurrentWork) {
          try {
            const visibility = await this.currentWork.nativeHistoryVisibility(
              manager,
              workspace,
              memberId,
              userWorkspaceId,
              identity,
            );
            nativeHistoryScope = visibility.fingerprint;
            query.andWhere(
              this.currentWorkHistoryCondition(visibility.taskIdsSql),
              {
                ...visibility.parameters,
                activityNativeFingerprint: visibility.fingerprint,
              },
            );
          } catch (error) {
            if (
              !(
                error instanceof ForbiddenException ||
                error instanceof ConflictException
              )
            )
              throw error;
            nativeHistoryScope = 'unavailable';
            query.andWhere(`run."basis"->'currentWork' IS NULL`);
          }
        }
        const scope = advertisingHash([
          identity.scope,
          'activity-analysis-runs',
          ...(nativeHistoryScope ? [nativeHistoryScope] : []),
        ]);
        const cursor = readActivityCursor(input.after, scope);
        const totalCount = await query.clone().getCount();
        if (cursor)
          query.andWhere('(run."createdAt",run.id) < (:at,:id)', {
            at: cursor.key,
            id: cursor.id,
          });
        const { entities, raw: rows } = await query
          .addSelect(advertisingTimestampSql('run."createdAt"'), 'cursorAt')
          .addSelect('CAST(run.id AS text)', 'cursorId')
          .orderBy('run.createdAt', 'DESC')
          .addOrderBy('run.id', 'DESC')
          .take(input.limit + 1)
          .getRawAndEntities<{ cursorAt: string; cursorId: string }>();
        const items = entities.slice(0, input.limit);
        const last = items[items.length - 1];
        if (nativeHistoryScope && nativeHistoryScope !== 'unavailable') {
          const after = await this.currentWork.nativeHistoryVisibility(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            identity,
          );
          assertActivityAnalysisFingerprint(
            after.fingerprint,
            nativeHistoryScope,
          );
        }
        return {
          ...identity,
          items: items.map((run) => this.summary(run)),
          totalCount,
          nextCursor:
            entities.length > input.limit && last
              ? advertisingCursor(
                  scope,
                  rows.find((row) => row.cursorId === last.id)!.cursorAt,
                  last.id,
                )
              : null,
        };
      },
      transactionManager,
    );
  }
  private async enqueue(runId: string) {
    try {
      await this.queue.add(
        OTOGROW_ACTIVITY_ANALYSIS_JOB,
        { runId },
        { id: `activity-analysis-${runId}`, retryLimit: 2 },
      );
    } catch {
      this.logger.warn(
        'Activity analysis enqueue deferred; recovery will retry the queued claim.',
      );
    }
  }
  private async fail(
    run: Pick<OtogrowActivityAnalysisRunEntity, 'id' | 'workspaceId'>,
    message: string,
    system = false,
    expiredBefore?: Date,
  ) {
    await this.write(run.workspaceId, async (manager) => {
      const repository = manager.getRepository(
        OtogrowActivityAnalysisRunEntity,
      );
      const current = await repository.findOneBy({
        workspaceId: run.workspaceId,
        id: run.id,
        status: 'RUNNING',
      });
      if (!current || (expiredBefore && current.updatedAt >= expiredBefore))
        return;
      await this.budget.stop(manager, paidSource(current));
      current.status = 'FAILED';
      current.revision += 1;
      current.error = message;
      current.finishedAt = new Date();
      await repository.update(
        { id: current.id, workspaceId: current.workspaceId },
        {
          status: current.status,
          revision: current.revision,
          error: message,
          finishedAt: current.finishedAt,
        },
      );
      await this.record(
        manager,
        current,
        system ? 'ACTIVITY_ANALYSIS_INTERRUPTED' : 'ACTIVITY_ANALYSIS_FAILED',
        'FAILED',
        system ? null : current.initiatorId,
        system ? 'SYSTEM' : 'AGENT',
        'RUNNING',
      );
    });
  }
  @Cron('*/30 * * * * *')
  async recover() {
    const repository = this.dataSource.getRepository(
      OtogrowActivityAnalysisRunEntity,
    );
    const queued = await repository.find({
      where: { status: 'QUEUED' },
      order: { createdAt: 'ASC' },
      take: 100,
      select: ['id'],
    });
    for (const run of queued) await this.enqueue(run.id);
    const expiredBefore = new Date(Date.now() - 5 * 60 * 1000);
    const interrupted = await repository.find({
      where: { status: 'RUNNING', updatedAt: LessThan(expiredBefore) },
      take: 100,
      order: { updatedAt: 'ASC' },
      select: ['id', 'workspaceId'],
    });
    for (const run of interrupted)
      await this.fail(
        run,
        'Worker interrupted or timed out. Provider usage may be unknown; this request will not be automatically dispatched again.',
        true,
        expiredBefore,
      );
  }
  async execute(runId: string) {
    const initial = await this.dataSource
      .getRepository(OtogrowActivityAnalysisRunEntity)
      .findOne({
        where: { id: runId, status: 'QUEUED' },
        select: ['id', 'workspaceId'],
      });
    if (!initial) return;
    const run = await this.write(initial.workspaceId, async (manager) => {
      const repository = manager.getRepository(
        OtogrowActivityAnalysisRunEntity,
      );
      const current = await repository.findOneBy({
        id: runId,
        workspaceId: initial.workspaceId,
        status: 'QUEUED',
      });
      if (!current) return null;
      current.status = 'RUNNING';
      current.revision += 1;
      current.startedAt = new Date();
      await repository.update(
        { id: current.id, workspaceId: current.workspaceId },
        {
          status: current.status,
          revision: current.revision,
          startedAt: current.startedAt,
        },
      );
      await this.record(
        manager,
        current,
        'ACTIVITY_ANALYSIS_STARTED',
        'RUNNING',
        current.initiatorId,
        'AGENT',
        'QUEUED',
      );
      return current;
    });
    if (!run) return;
    try {
      const workspace = await this.dataSource
        .getRepository(WorkspaceEntity)
        .findOneByOrFail({ id: run.workspaceId });
      const model = this.models.getModel(run.agent.modelId);
      if (!model)
        throw new BadRequestException('The configured model is unavailable.');
      await this.budget.dispatch(
        paidSource(run),
        run.userWorkspaceId,
        async (manager) => {
          const current = await manager
            .getRepository(OtogrowActivityAnalysisRunEntity)
            .findOneBy({ id: run.id, workspaceId: run.workspaceId });
          if (
            !current ||
            current.status !== 'RUNNING' ||
            current.revision !== run.revision
          )
            throw new ConflictException(
              'This activity analysis run changed before dispatch.',
            );
          await this.validateRun(manager, workspace, current);
        },
      );
      const response = await generateText({
        model: model.model,
        system: activityAnalysisSystemPrompt(run.context),
        prompt: activityAnalysisPrompt(run.context),
        output: Output.object({
          schema: activityAnalysisResponseSchema(run.context),
        }),
        maxOutputTokens: run.agent.maxOutputTokens,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(120000),
      });
      const spend = await this.budget.settle(
        paidSource(run),
        usageFromAiSdk(response.usage),
      );
      const result = validateActivityAnalysisOutput(
        response.output,
        run.context,
      );
      await this.write(run.workspaceId, async (manager) => {
        const repository = manager.getRepository(
          OtogrowActivityAnalysisRunEntity,
        );
        const current = await repository.findOneBy({
          id: run.id,
          workspaceId: run.workspaceId,
        });
        if (
          !current ||
          current.status !== 'RUNNING' ||
          current.revision !== run.revision
        )
          return;
        await this.validateRun(manager, workspace, current);
        current.status = 'SUCCEEDED';
        current.revision += 1;
        current.finishedAt = new Date();
        await repository.update(
          { id: run.id, workspaceId: run.workspaceId },
          {
            status: current.status,
            revision: current.revision,
            finishedAt: current.finishedAt,
            result,
            usage: {
              inputTokens: response.usage.inputTokens ?? null,
              outputTokens: response.usage.outputTokens ?? null,
              costUsd:
                spend.actualMicroUsd === null
                  ? null
                  : microToUsd(BigInt(spend.actualMicroUsd)),
            },
          },
        );
        await this.record(
          manager,
          current,
          'ACTIVITY_ANALYSIS_COMPLETED',
          'SUCCEEDED',
          run.initiatorId,
          'AGENT',
          'RUNNING',
          result.findings.length,
        );
      });
    } catch (error) {
      const usage = usageFromAiError(error);
      if (usage) await this.budget.settle(paidSource(run), usage);
      await this.budget.fail(paidSource(run));
      const message =
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException
          ? error.message
          : 'Activity analysis failed or timed out. Provider usage may be unknown. Review this run before explicitly preparing a new request.';
      await this.fail(run, message);
    }
  }
}
