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
  IsNull,
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
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { canUseDeliveryAgent } from 'src/modules/delivery/agents/delivery-agent-access';
import { countDeliveryAgentRunsForUtcDay } from 'src/modules/delivery/agents/count-delivery-agent-runs-for-utc-day';
import { readDeliveryKnowledgeContext } from 'src/modules/delivery/knowledge/delivery-knowledge-context';
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
import { DeliveryAdvertisingSourcesService } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.service';
import { type AdvertisingSourceEnvelope } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.types';
import {
  advertisingCursor,
  advertisingHash,
  advertisingTimestampSql,
  parseAdvertisingInput,
  readAdvertisingCursor,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { DeliveryAdvertisingDraftRunEntity } from 'src/modules/delivery/advertising/drafts/entities/delivery-advertising-draft-run.entity';
import {
  advertisingDraftOutputSchema,
  advertisingDraftPreviewSchema,
  advertisingDraftRequestSchema,
  advertisingDraftRunsSchema,
  advertisingDraftSelectionSchema,
  cancelAdvertisingDraftSchema,
  startAdvertisingDraftSchema,
  type AdvertisingDraftPreviewInput,
  type AdvertisingDraftContext,
  type AdvertisingDraftReceipt,
  type AdvertisingDraftStatus,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.types';
import {
  ADVERTISING_DRAFT_SYSTEM_PROMPT,
  advertisingDraftBody,
  advertisingDraftContextFingerprint,
  advertisingDraftPrompt,
  assertAdvertisingDraftFingerprint,
  buildAdvertisingDraftContext,
  validateAdvertisingDraftOutput,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.policy';
import {
  ADVERTISING_DRAFT_METADATA_FIELDS,
  advertisingDraftBlockingReasons,
} from 'src/modules/delivery/advertising/drafts/read-advertising-draft-basis';

export const DELIVERY_ADVERTISING_DRAFT_JOB = 'delivery-advertising-draft';
const asDate = (value: Date | string | null) =>
  value instanceof Date ? value.toISOString() : value;
const paidSource = (
  run: Pick<DeliveryAdvertisingDraftRunEntity, 'workspaceId' | 'id'>,
) => ({
  workspaceId: run.workspaceId,
  sourceKind: 'ADVERTISING_DRAFT' as const,
  sourceRunId: run.id,
});

@Injectable()
export class DeliveryAdvertisingDraftService {
  private readonly logger = new Logger(DeliveryAdvertisingDraftService.name);
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly sources: DeliveryAdvertisingSourcesService,
    private readonly models: AiModelRegistryService,
    @InjectMessageQueue(MessageQueue.aiQueue)
    private readonly queue: MessageQueueService,
    private readonly budget: OtogrowAiBudgetService,
    private readonly access: OtogrowAccessService,
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
      throw new Error('Advertising drafting requires an active transaction.');
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
          'This drafting request identity already exists. Check its exact saved request before continuing.',
        );
      throw error;
    }
  }
  private identity(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    actor: AdvertisingSourceEnvelope['actor'],
  ) {
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      actor,
      observedAt: new Date().toISOString(),
    };
  }
  private summary(run: DeliveryAdvertisingDraftRunEntity) {
    return {
      id: run.id,
      requestId: run.requestId,
      initiatorId: run.initiatorId,
      initiatorName: run.initiatorName,
      sourceKind: run.sourceKind,
      sourceId: run.sourceId,
      projectId: run.projectId,
      status: run.status,
      revision: run.revision,
      agent: run.agent,
      createdAt: asDate(run.createdAt)!,
      startedAt: asDate(run.startedAt),
      finishedAt: asDate(run.finishedAt),
      error: run.error,
    };
  }
  private publicContext(context: AdvertisingDraftContext, isAdmin: boolean) {
    return {
      ...context,
      assistantInstructions: isAdmin ? context.assistantInstructions : null,
    };
  }
  private async source(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    ref: { sourceKind: 'META' | 'MANUAL'; sourceId: string },
    metadataOnly = true,
  ) {
    const source = await this.sources.read(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      { kind: ref.sourceKind, id: ref.sourceId },
      0,
      null,
      metadataOnly,
    );
    if (!source.actor.isManager || !source.canManageDraft || !source.project)
      throw new ForbiddenException(
        'Current manager access to this advertising source is required.',
      );
    return source;
  }
  private model(
    agent: DeliveryAgentEntity,
    source: AdvertisingSourceEnvelope,
    workspace: WorkspaceEntity,
  ) {
    const configuration = agent.configuration;
    if (
      !configuration.enabled ||
      configuration.kind !== 'ADVERTISING' ||
      configuration.tools.length ||
      !configuration.humanConfirmation ||
      !configuration.projectIds.includes(source.project!.id) ||
      !canUseDeliveryAgent(configuration, source.actor)
    )
      throw new ForbiddenException(
        'Choose an enabled advertising assistant permitted for your current role and this project.',
      );
    const model = configuration.modelId
      ? this.models.getModel(configuration.modelId)
      : null;
    if (!model || !configuration.modelId)
      throw new BadRequestException(
        'Connect an available model before preparing paid advertising suggestions.',
      );
    this.models.validateModelAvailability(configuration.modelId, workspace);
    return model;
  }
  private async prepare(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: AdvertisingDraftPreviewInput,
  ) {
    const source = await this.source(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      input,
      false,
    );
    assertAdvertisingDraftFingerprint(
      source.fingerprint,
      input.sourceFingerprint,
      'The report or routing',
    );
    const agent = await manager
      .getRepository(DeliveryAgentEntity)
      .findOneBy({ workspaceId: workspace.id, id: input.agentId });
    if (!agent)
      throw new NotFoundException('This advertising assistant is unavailable.');
    this.model(agent, source, workspace);
    if (
      agent.configuration.requiredInputs.includes('requirements') &&
      !input.instructions
    )
      throw new BadRequestException(
        'This assistant requires instructions for the report review.',
      );
    const goal = this.sources.validateGoal(source, input.goal);
    const knowledge = await readDeliveryKnowledgeContext(
      manager,
      workspace.id,
      source.project!.id,
    );
    const context = buildAdvertisingDraftContext(
      input,
      source,
      goal,
      agent,
      knowledge,
    );
    return {
      source,
      agent,
      context,
      bodyFingerprint: advertisingHash(advertisingDraftBody(input)),
      contextFingerprint: advertisingDraftContextFingerprint(context, agent),
      knowledgeFingerprint: knowledge.fingerprint,
      agentSnapshot: {
        id: agent.id,
        name: agent.configuration.name,
        version: agent.version,
        modelId: agent.configuration.modelId!,
        maxOutputTokens: agent.configuration.maxOutputTokens,
      },
    };
  }
  private record(
    manager: EntityManager,
    run: DeliveryAdvertisingDraftRunEntity,
    action: string,
    outcome: OtogrowActivityInput['outcome'],
    actorId: string | null,
    actorType: 'HUMAN' | 'AGENT' | 'SYSTEM',
    before: AdvertisingDraftStatus | null,
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
        'Recorded an advertising suggestion run for human review; no delivery approval, task assignment or advertising change occurred.',
      projectId: run.projectId,
      sourceType: 'advertising-draft',
      sourceId: run.id,
      changes: [
        { field: 'runStatus', before, after: run.status },
        { field: 'advertisingSourceKind', before: null, after: run.sourceKind },
        { field: 'advertisingSourceId', before: null, after: run.sourceId },
        ...(count === undefined
          ? []
          : [{ field: 'suggestionCount', before: null, after: String(count) }]),
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
    const input = parseAdvertisingInput(advertisingDraftPreviewSchema, raw);
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
        let budget = await this.budget.quote(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          sourceKind: 'ADVERTISING_DRAFT',
          sourceRunId: randomUUID(),
          projectId: prepared.source.project!.id,
          taskId: null,
          modelId: prepared.agent.configuration.modelId!,
          kind: 'TEXT',
          maxOutputTokens: prepared.agent.configuration.maxOutputTokens,
        });
        if (
          (await countDeliveryAgentRunsForUtcDay(
            manager,
            workspace.id,
            prepared.agent.id,
          )) >= prepared.agent.configuration.dailyRunLimit
        )
          budget = {
            ...budget,
            budgetReady: false,
            blockedReason:
              'This assistant reached its UTC daily run limit. Failed and cancelled runs count.',
          };
        return {
          ...this.identity(
            workspace,
            memberId,
            userWorkspaceId,
            prepared.source.actor,
          ),
          bodyFingerprint: prepared.bodyFingerprint,
          contextFingerprint: prepared.contextFingerprint,
          sourceFingerprint: prepared.source.fingerprint,
          knowledgeFingerprint: prepared.knowledgeFingerprint,
          agent: prepared.agentSnapshot,
          context: this.publicContext(
            prepared.context,
            prepared.source.actor.isAdmin,
          ),
          budget,
        };
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
    const input = parseAdvertisingInput(startAdvertisingDraftSchema, raw);
    const inputHash = advertisingHash(input);
    const response = await this.write(
      workspace.id,
      async (manager) => {
        const source = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input,
        );
        const repository = manager.getRepository(
          DeliveryAdvertisingDraftRunEntity,
        );
        const prior = await repository.findOneBy({
          workspaceId: workspace.id,
          requestId: input.requestId,
        });
        if (prior) {
          if (
            prior.initiatorId !== memberId ||
            prior.userWorkspaceId !== userWorkspaceId ||
            prior.inputHash !== inputHash ||
            prior.id !== input.id
          )
            throw new ConflictException(
              'This request belongs to different preparation. Check the original request rather than changing its body.',
            );
          if (
            prior.projectId !== source.project!.id ||
            prior.companyId !== source.source.companyId
          )
            throw new ForbiddenException('The report client project changed.');
          return {
            ...this.identity(
              workspace,
              memberId,
              userWorkspaceId,
              source.actor,
            ),
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
        );
        assertAdvertisingDraftFingerprint(
          prepared.bodyFingerprint,
          input.bodyFingerprint,
          'The prepared request',
        );
        assertAdvertisingDraftFingerprint(
          prepared.contextFingerprint,
          input.contextFingerprint,
          'The preview context',
        );
        if (
          prepared.agent.version !== input.agentVersion ||
          prepared.knowledgeFingerprint !== input.knowledgeFingerprint
        )
          throw new ConflictException(
            'The assistant or published knowledge changed. Preview again.',
          );
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
        const receipt: AdvertisingDraftReceipt = {
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
          projectId: source.project!.id,
          companyId: source.source.companyId,
          sourceKind: input.sourceKind,
          sourceId: input.sourceId,
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
            sourceFingerprint: source.fingerprint,
            evidenceFingerprint: source.evidenceFingerprint,
            goalFingerprint: advertisingHash(prepared.context.goal),
            knowledgeFingerprint: prepared.knowledgeFingerprint,
            promptVersion: prepared.context.promptVersion,
            outputVersion: prepared.context.outputVersion,
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
          projectId: run.projectId,
          taskId: null,
          modelId: prepared.agent.configuration.modelId!,
          kind: 'TEXT',
          maxOutputTokens: prepared.agent.configuration.maxOutputTokens,
          pricingRevision: input.pricingRevision,
        });
        await this.record(
          manager,
          run,
          'ADVERTISING_DRAFT_QUEUED',
          'QUEUED',
          memberId,
          'HUMAN',
          null,
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          receipt,
          run: this.summary(run),
        };
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
    const input = parseAdvertisingInput(cancelAdvertisingDraftSchema, raw);
    const inputHash = advertisingHash(input);
    return this.write(
      workspace.id,
      async (manager) => {
        const repository = manager.getRepository(
          DeliveryAdvertisingDraftRunEntity,
        );
        const run = await repository.findOne({
          where: { workspaceId: workspace.id, id: input.id },
          select: ADVERTISING_DRAFT_METADATA_FIELDS,
        });
        if (!run)
          throw new NotFoundException(
            'This advertising suggestion run is unavailable.',
          );
        const source = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          run,
        );
        if (
          run.projectId !== source.project!.id ||
          run.companyId !== source.source.companyId
        )
          throw new ForbiddenException('The report client project changed.');
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
            ...this.identity(
              workspace,
              memberId,
              userWorkspaceId,
              source.actor,
            ),
            receipt: run.cancelReceipt,
            run: this.summary(run),
          };
        }
        if (
          run.revision !== input.revision ||
          !['QUEUED', 'RUNNING'].includes(run.status)
        )
          throw new ConflictException(
            'This run changed or already ended. Refresh its current state before cancelling.',
          );
        const before = run.status;
        const now = new Date();
        await this.budget.stop(manager, paidSource(run), true);
        run.status = 'CANCELLED';
        run.revision += 1;
        run.finishedAt = now;
        const receipt: AdvertisingDraftReceipt = {
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
          'ADVERTISING_DRAFT_CANCELLED',
          'CANCELLED',
          memberId,
          'HUMAN',
          before,
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          receipt,
          run: this.summary(run),
        };
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
    const input = parseAdvertisingInput(advertisingDraftRequestSchema, raw);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const actor = await this.delivery.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        if (!actor.isManager)
          throw new ForbiddenException('Current manager access is required.');
        const run = await manager
          .getRepository(DeliveryAdvertisingDraftRunEntity)
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
            select: ADVERTISING_DRAFT_METADATA_FIELDS,
          });
        const receipt =
          input.action === 'STARTED' ? run?.startReceipt : run?.cancelReceipt;
        if (
          !run ||
          !receipt ||
          receipt.actorId !== memberId ||
          receipt.userWorkspaceId !== userWorkspaceId
        )
          return {
            ...this.identity(workspace, memberId, userWorkspaceId, actor),
            receipt: null,
            run: null,
          };
        const source = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          run,
        );
        if (
          run.projectId !== source.project!.id ||
          run.companyId !== source.source.companyId
        )
          throw new ForbiddenException('The report client project changed.');
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          receipt,
          run: this.summary(run),
        };
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
    const input = parseAdvertisingInput(advertisingDraftSelectionSchema, raw);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const actor = await this.delivery.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        if (!actor.isManager)
          throw new ForbiddenException('Current manager access is required.');
        const run = await manager
          .getRepository(DeliveryAdvertisingDraftRunEntity)
          .findOne({
            where: { workspaceId: workspace.id, id: input.id },
            select: [
              ...ADVERTISING_DRAFT_METADATA_FIELDS,
              ...(detail ? (['context', 'result', 'usage'] as const) : []),
            ],
          });
        if (!run)
          throw new NotFoundException(
            'This advertising suggestion run is unavailable.',
          );
        const source = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          run,
        );
        const blockingReasons = await advertisingDraftBlockingReasons(
          manager,
          run,
          source,
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          run: {
            ...this.summary(run),
            ...(detail
              ? {
                  bodyFingerprint: run.bodyFingerprint,
                  contextFingerprint: run.contextFingerprint,
                  context: this.publicContext(
                    run.context,
                    source.actor.isAdmin,
                  ),
                  result: run.result,
                  usage: run.usage,
                }
              : {}),
          },
          currentSourceFingerprint: source.fingerprint,
          canUseResult:
            run.status === 'SUCCEEDED' && blockingReasons.length === 0,
          canCancel: ['QUEUED', 'RUNNING'].includes(run.status),
          blockingReasons,
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
    const input = parseAdvertisingInput(advertisingDraftRunsSchema, raw);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const source = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input,
        );
        const scope = advertisingHash([
          workspace.id,
          memberId,
          userWorkspaceId,
          source.fingerprint,
          source.actor,
        ]);
        const cursor = readAdvertisingCursor(input.after, scope);
        const repository = manager.getRepository(
          DeliveryAdvertisingDraftRunEntity,
        );
        const where = {
          workspaceId: workspace.id,
          sourceKind: input.sourceKind,
          sourceId: input.sourceId,
          projectId: source.project!.id,
        };
        const totalCount = await repository.countBy({
          ...where,
          companyId: source.source.companyId ?? IsNull(),
        });
        const query = repository
          .createQueryBuilder('run')
          .select(
            ADVERTISING_DRAFT_METADATA_FIELDS.map((field) => `run.${field}`),
          )
          .where(
            'run.workspaceId=:workspaceId AND run.sourceKind=:sourceKind AND run.sourceId=:sourceId AND run.projectId=:projectId AND run.companyId IS NOT DISTINCT FROM :companyId',
            { ...where, companyId: source.source.companyId },
          );
        if (cursor)
          query.andWhere('(run.createdAt,run.id)<(:at,:id)', {
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
        const nextCursor =
          entities.length > input.limit && last
            ? advertisingCursor(
                scope,
                rows.find((row) => row.cursorId === last.id)!.cursorAt,
                last.id,
              )
            : null;
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          items: items.map((run) => this.summary(run)),
          totalCount,
          nextCursor,
          scope,
        };
      },
      transactionManager,
    );
  }
  private async enqueue(runId: string) {
    try {
      await this.queue.add(
        DELIVERY_ADVERTISING_DRAFT_JOB,
        { runId },
        { id: `advertising-draft-${runId}`, retryLimit: 2 },
      );
    } catch {
      this.logger.warn(
        'Advertising drafting enqueue deferred; recovery will retry the queued claim.',
      );
    }
  }
  private async fail(
    run: Pick<DeliveryAdvertisingDraftRunEntity, 'id' | 'workspaceId'>,
    message: string,
    system = false,
    expiredBefore?: Date,
  ) {
    await this.write(run.workspaceId, async (manager) => {
      const repository = manager.getRepository(
        DeliveryAdvertisingDraftRunEntity,
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
        system ? 'ADVERTISING_DRAFT_INTERRUPTED' : 'ADVERTISING_DRAFT_FAILED',
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
      DeliveryAdvertisingDraftRunEntity,
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
      .getRepository(DeliveryAdvertisingDraftRunEntity)
      .findOne({
        where: { id: runId, status: 'QUEUED' },
        select: ['id', 'workspaceId'],
      });
    if (!initial) return;
    const run = await this.write(initial.workspaceId, async (manager) => {
      const repository = manager.getRepository(
        DeliveryAdvertisingDraftRunEntity,
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
        'ADVERTISING_DRAFT_STARTED',
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
            .getRepository(DeliveryAdvertisingDraftRunEntity)
            .findOneBy({ id: run.id, workspaceId: run.workspaceId });
          if (
            !current ||
            current.status !== 'RUNNING' ||
            current.revision !== run.revision
          )
            throw new ConflictException(
              'This advertising drafting run changed before dispatch.',
            );
          const prepared = await this.prepare(
            manager,
            workspace,
            run.initiatorId,
            run.userWorkspaceId,
            run.input,
          );
          assertAdvertisingDraftFingerprint(
            prepared.contextFingerprint,
            run.contextFingerprint,
            'The report context',
          );
        },
      );
      const response = await generateText({
        model: model.model,
        system: ADVERTISING_DRAFT_SYSTEM_PROMPT,
        prompt: advertisingDraftPrompt(run.context),
        output: Output.object({ schema: advertisingDraftOutputSchema }),
        maxOutputTokens: run.agent.maxOutputTokens,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(120000),
      });
      const spend = await this.budget.settle(
        paidSource(run),
        usageFromAiSdk(response.usage),
      );
      const result = validateAdvertisingDraftOutput(
        response.output,
        run.context,
      );
      await this.write(run.workspaceId, async (manager) => {
        const repository = manager.getRepository(
          DeliveryAdvertisingDraftRunEntity,
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
        const prepared = await this.prepare(
          manager,
          workspace,
          run.initiatorId,
          run.userWorkspaceId,
          run.input,
        );
        assertAdvertisingDraftFingerprint(
          prepared.contextFingerprint,
          run.contextFingerprint,
          'The report context',
        );
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
          'ADVERTISING_DRAFT_COMPLETED',
          'SUCCEEDED',
          run.initiatorId,
          'AGENT',
          'RUNNING',
          result.suggestions.length,
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
          : 'Advertising drafting failed or timed out. Provider usage may be unknown. Review this run before explicitly preparing a new request.';
      await this.fail(run, message);
    }
  }
}
