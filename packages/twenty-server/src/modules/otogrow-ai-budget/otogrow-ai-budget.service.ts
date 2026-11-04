import {
  type OtogrowAiSpendHistoryInput,
  type OtogrowAiSpendHistoryDTO,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-spend-history.dto';
import {
  parseOtogrowAiSpendHistoryInput,
  readOtogrowAiSpendHistory,
} from 'src/modules/otogrow-ai-budget/read-otogrow-ai-spend-history';
import {
  readOtogrowAiSpendPage,
  readOtogrowAiExposure,
} from 'src/modules/otogrow-ai-budget/read-otogrow-ai-spending';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, LessThan } from 'typeorm';
import { v4 } from 'uuid';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { OtogrowAiBudgetEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-budget.entity';
import { OtogrowAiPriceEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-price.entity';
import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { OtogrowAiSpendEventEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend-event.entity';
import {
  type OtogrowAiBudgetSnapshotDTO,
  type OtogrowAiBudgetSaveInput,
  type OtogrowAiPriceSaveInput,
  type OtogrowAiSpendReconcileInput,
  type OtogrowAiBudgetSnapshotInput,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.dto';
import {
  actualCharge,
  budgetSaveSchema,
  cursorSchema,
  maximumCharge,
  microToUsd,
  normalizeUsage,
  priceSaveSchema,
  assertVideoQaPricing,
  reconcileSchema,
  snapshotSchema,
  usdToMicro,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';
import {
  type OtogrowAiPriceKind,
  type OtogrowAiSpendQuote,
  type OtogrowAiSpendSource,
  type OtogrowAiUsage,
  type OtogrowAiMediaReservation,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';
import {
  assertOtogrowAiMediaQuoteFresh,
  validateOtogrowAiMediaReservation,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-media.policy';
import {
  OTOGROW_NATIVE_AI_RECOVERY_GRACE_MS,
  OTOGROW_NATIVE_AI_RECOVERY_PAGE_SIZE,
} from 'src/modules/otogrow-ai-budget/otogrow-native-ai.constants';

type SpendRequest = {
  workspaceId: string;
  actorId: string;
  sourceKind: OtogrowAiSpendSource;
  sourceRunId: string;
  projectId: string | null;
  taskId: string | null;
  modelId: string;
  kind: OtogrowAiPriceKind;
  maxOutputTokens: number;
  pricingRevision?: number;
};
type Source = {
  workspaceId: string;
  sourceKind: OtogrowAiSpendSource;
  sourceRunId: string;
};
const ZERO = BigInt(0);
const held = (spend: OtogrowAiSpendEntity) =>
  ['RESERVED', 'DISPATCHED', 'UNCERTAIN'].includes(spend.state)
    ? BigInt(spend.reservedMicroUsd)
    : ZERO;
const charged = (spend: OtogrowAiSpendEntity) =>
  spend.state === 'SETTLED' ? BigInt(spend.actualMicroUsd ?? '0') : ZERO;

@Injectable()
export class OtogrowAiBudgetService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: OtogrowAccessService,
  ) {}

  private async lock(
    manager: EntityManager,
    workspaceId: string,
    shared = false,
  ) {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('AI budget operations require the source transaction.');
    await manager.query(
      `SELECT pg_advisory_xact_lock${shared ? '_shared' : ''}(hashtextextended($1, 0))`,
      [`delivery:${workspaceId}`],
    );
  }
  private async admin(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
  ) {
    const actor = await this.access.accessForUser(
      workspaceId,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (!actor.capabilities.includes('workspace.admin'))
      throw new ForbiddenException(
        'Only administrators can manage OS production AI budgets.',
      );
  }
  private async workspace(manager: EntityManager, workspaceId: string) {
    const workspace = await manager
      .getRepository(WorkspaceEntity)
      .findOneByOrFail({ id: workspaceId });
    if (!workspace.databaseSchema || !/^\w+$/.test(workspace.databaseSchema))
      throw new BadRequestException('Workspace schema is unavailable.');
    return workspace;
  }
  private async context(
    manager: EntityManager,
    input: Pick<SpendRequest, 'workspaceId' | 'projectId' | 'taskId'>,
  ) {
    const workspace = await this.workspace(manager, input.workspaceId);
    const task = input.taskId
      ? await manager
          .getRepository(DeliveryTaskEntity)
          .findOneBy({ workspaceId: input.workspaceId, taskId: input.taskId })
      : null;
    if (input.taskId && (!task || task.projectId !== input.projectId))
      throw new BadRequestException('AI task and project do not match.');
    const project = input.projectId
      ? await manager
          .getRepository(DeliveryProjectEntity)
          .findOneBy({ workspaceId: input.workspaceId, id: input.projectId })
      : null;
    if (input.projectId && !project)
      throw new BadRequestException('AI project is unavailable.');
    const clients: { id: string; name: string }[] = project?.companyId
      ? await manager.query(
          `SELECT id,name FROM "${workspace.databaseSchema}".company WHERE id=$1 AND "deletedAt" IS NULL`,
          [project.companyId],
        )
      : [];
    if (project?.companyId && !clients[0])
      throw new BadRequestException('AI client is unavailable.');
    const tasks: { title: string }[] = task
      ? await manager.query(
          `SELECT title FROM "${workspace.databaseSchema}".task WHERE id=$1 AND "deletedAt" IS NULL`,
          [task.taskId],
        )
      : [];
    if (task && !tasks[0])
      throw new BadRequestException('AI task is unavailable.');
    return {
      clientId: clients[0]?.id ?? null,
      clientName: clients[0]?.name ?? null,
      taskName: tasks[0]?.title ?? null,
    };
  }
  private async event(
    manager: EntityManager,
    workspaceId: string,
    actorId: string | null,
    action: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    spendId: string | null = null,
    evidenceReference: string | null = null,
    reason: string | null = null,
  ) {
    await manager.getRepository(OtogrowAiSpendEventEntity).save({
      workspaceId,
      actorId,
      action,
      before,
      after,
      spendId,
      evidenceReference,
      reason,
    });
  }
  private financialState(spend: OtogrowAiSpendEntity) {
    return {
      state: spend.state,
      reservedMicroUsd: spend.reservedMicroUsd,
      actualMicroUsd: spend.actualMicroUsd,
      revision: spend.revision,
    };
  }
  private async reportedActuals(manager: EntityManager, workspaceId: string) {
    const events = await manager
      .getRepository(OtogrowAiSpendEventEntity)
      .findBy({ workspaceId, action: 'LATE_PROVIDER_USAGE' });
    const amounts = new Map<string, bigint>();
    for (const event of events) {
      const value = event.after.reportedActualMicroUsd;
      if (event.spendId && typeof value === 'string' && /^\d+$/.test(value)) {
        const amount = BigInt(value);
        if (!amounts.has(event.spendId) || amount > amounts.get(event.spendId)!)
          amounts.set(event.spendId, amount);
      }
    }
    return amounts;
  }
  private chargeWithEvidence(
    spend: OtogrowAiSpendEntity,
    reports: Map<string, bigint>,
  ) {
    const original = charged(spend);
    const reported = reports.get(spend.id) ?? ZERO;
    return original > reported ? original : reported;
  }
  private async assertCapacity(
    manager: EntityManager,
    workspaceId: string,
    clientId: string | null,
    taskId: string | null,
    amount: bigint,
    excludeSpendId?: string,
  ) {
    const budgets = await manager
      .getRepository(OtogrowAiBudgetEntity)
      .findBy({ workspaceId });
    const workspaceBudget = budgets.find(
      (budget) =>
        budget.scope === 'WORKSPACE' && budget.scopeId === workspaceId,
    );
    if (!workspaceBudget)
      throw new BadRequestException(
        'Ask an administrator to configure the OS production AI budget and confirm its opening spend before running paid AI.',
      );
    const applicable = budgets.filter(
      (budget) =>
        (budget.scope === 'WORKSPACE' && budget.scopeId === workspaceId) ||
        (budget.scope === 'CLIENT' && budget.scopeId === clientId) ||
        (budget.scope === 'TASK' && budget.scopeId === taskId),
    );
    const spends = await manager
      .getRepository(OtogrowAiSpendEntity)
      .findBy({ workspaceId });
    const reportedActuals = await this.reportedActuals(manager, workspaceId);
    for (const budget of applicable) {
      if (!budget.enabled)
        throw new BadRequestException(
          `Paid AI is disabled for ${budget.scopeName}. Ask an administrator to review the OS production AI budget.`,
        );
      const exposure = spends
        .filter(
          (spend) =>
            spend.id !== excludeSpendId &&
            (budget.scope === 'WORKSPACE' ||
              (budget.scope === 'CLIENT'
                ? spend.clientId === budget.scopeId
                : spend.taskId === budget.scopeId)),
        )
        .reduce(
          (total, spend) =>
            total +
            held(spend) +
            this.chargeWithEvidence(spend, reportedActuals),
          BigInt(budget.openingSpentMicroUsd),
        );
      if (exposure + amount > BigInt(budget.capMicroUsd))
        throw new BadRequestException(
          `The maximum AI reservation exceeds the remaining ${budget.scopeName} budget. Existing uncertain usage remains held until reconciled.`,
        );
    }
  }
  private async price(
    manager: EntityManager,
    workspaceId: string,
    modelId: string,
    kind: OtogrowAiPriceKind,
  ) {
    const profile = await manager
      .getRepository(OtogrowAiPriceEntity)
      .findOneBy({ workspaceId, modelId, kind, enabled: true });
    if (!profile && ['IMAGE', 'CLIP'].includes(kind))
      throw new BadRequestException(
        'Image and clip generation is paused until its billing units and reservation rules are supported. Local assembly and configured image inspection remain available.',
      );
    if (!profile)
      throw new BadRequestException(
        `Ask an administrator to verify ${kind.toLowerCase()} pricing and model bounds for ${modelId} before running paid AI.`,
      );
    if (kind === 'VIDEO_QA') {
      try {
        assertVideoQaPricing(profile);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'Verify supported video QA pricing before starting.',
        );
      }
    }
    return profile;
  }
  async quote(
    manager: EntityManager,
    input: SpendRequest,
  ): Promise<OtogrowAiSpendQuote> {
    try {
      await this.lock(manager, input.workspaceId);
      const profile = await this.price(
        manager,
        input.workspaceId,
        input.modelId,
        input.kind,
      );
      let maximum: bigint;
      try {
        maximum = maximumCharge(profile.pricing, input.maxOutputTokens);
      } catch {
        throw new BadRequestException(
          'Request output exceeds the admin-verified model bound. Update pricing setup before running paid AI.',
        );
      }
      const context = await this.context(manager, input);
      try {
        await this.assertCapacity(
          manager,
          input.workspaceId,
          context.clientId,
          input.taskId,
          maximum,
        );
        return {
          maximumCostUsd: microToUsd(maximum),
          pricingRevision: profile.revision,
          budgetReady: true,
          blockedReason: null,
          boundSource: 'MODEL_CONTEXT',
        };
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        return {
          maximumCostUsd: microToUsd(maximum),
          pricingRevision: profile.revision,
          budgetReady: false,
          blockedReason: error.message,
          boundSource: 'MODEL_CONTEXT',
        };
      }
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      return {
        maximumCostUsd: null,
        pricingRevision: null,
        budgetReady: false,
        blockedReason: error.message,
        boundSource: null,
      };
    }
  }
  async reserve(manager: EntityManager, input: SpendRequest) {
    await this.lock(manager, input.workspaceId);
    const repository = manager.getRepository(OtogrowAiSpendEntity);
    const prior = await repository.findOneBy({
      workspaceId: input.workspaceId,
      sourceKind: input.sourceKind,
      sourceRunId: input.sourceRunId,
    });
    if (prior) return prior;
    const profile = await this.price(
      manager,
      input.workspaceId,
      input.modelId,
      input.kind,
    );
    if (
      input.pricingRevision !== undefined &&
      input.pricingRevision !== profile.revision
    )
      throw new ConflictException(
        'AI pricing changed after preview. Preview the maximum reservation again before starting.',
      );
    let maximum: bigint;
    try {
      maximum = maximumCharge(profile.pricing, input.maxOutputTokens);
    } catch {
      throw new BadRequestException(
        'Request output exceeds the admin-verified model bound. Update pricing setup before running paid AI.',
      );
    }
    const context = await this.context(manager, input);
    await this.assertCapacity(
      manager,
      input.workspaceId,
      context.clientId,
      input.taskId,
      maximum,
    );
    const spend = await repository.save(
      repository.create({
        id: v4(),
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        sourceKind: input.sourceKind,
        sourceRunId: input.sourceRunId,
        projectId: input.projectId,
        taskId: input.taskId,
        ...context,
        state: 'RESERVED',
        reservedMicroUsd: maximum.toString(),
        actualMicroUsd: null,
        usage: null,
        attentionReason: null,
        dispatchedAt: null,
        settledAt: null,
        price: {
          profileId: profile.id,
          revision: profile.revision,
          modelId: profile.modelId,
          kind: profile.kind,
          source: profile.source,
          verifiedAt: profile.verifiedAt.toISOString(),
          pricing: profile.pricing,
          inputTokenBound: profile.pricing.maxInputTokens,
          outputTokenBound: input.maxOutputTokens,
          reasoningTokenBound: profile.pricing.maxReasoningTokens,
          boundSource: 'MODEL_CONTEXT',
        },
      }),
    );
    await this.event(
      manager,
      input.workspaceId,
      input.actorId,
      'RESERVED',
      {},
      this.financialState(spend),
      spend.id,
    );
    return spend;
  }

  async reserveNative(
    manager: EntityManager,
    input: Omit<
      SpendRequest,
      'kind' | 'sourceKind' | 'projectId' | 'taskId' | 'maxOutputTokens'
    > & {
      maxOutputTokens?: number;
      modelContextWindowTokens: number;
      modelMaxOutputTokens: number;
    },
  ) {
    await this.lock(manager, input.workspaceId);
    const profile = await this.price(
      manager,
      input.workspaceId,
      input.modelId,
      'TEXT',
    );
    if (
      !Number.isSafeInteger(input.modelContextWindowTokens) ||
      input.modelContextWindowTokens <= 0 ||
      profile.pricing.maxInputTokens < input.modelContextWindowTokens ||
      !Number.isSafeInteger(input.modelMaxOutputTokens) ||
      input.modelMaxOutputTokens <= 0 ||
      (input.maxOutputTokens !== undefined &&
        (!Number.isSafeInteger(input.maxOutputTokens) ||
          input.maxOutputTokens <= 0))
    ) {
      throw new BadRequestException(
        'Verify the full model context and output bounds in AI spending settings before using CRM AI.',
      );
    }
    const maxOutputTokens = Math.min(
      input.maxOutputTokens ?? profile.pricing.maxOutputTokens,
      profile.pricing.maxOutputTokens,
      input.modelMaxOutputTokens,
    );
    return this.reserve(manager, {
      ...input,
      sourceKind: 'NATIVE_CRM',
      kind: 'TEXT',
      projectId: null,
      taskId: null,
      maxOutputTokens,
      pricingRevision: profile.revision,
    });
  }
  async quoteMedia(
    manager: EntityManager,
    input: OtogrowAiMediaReservation,
  ): Promise<OtogrowAiSpendQuote> {
    try {
      const value = validateOtogrowAiMediaReservation(input);
      await this.lock(manager, value.workspaceId, true);
      const context = await this.context(manager, value);
      await this.assertCapacity(
        manager,
        value.workspaceId,
        context.clientId,
        value.taskId,
        usdToMicro(value.limit.maximumCostUsd),
      );
      return {
        maximumCostUsd: microToUsd(usdToMicro(value.limit.maximumCostUsd)),
        pricingRevision: value.limit.revision,
        budgetReady: true,
        blockedReason: null,
        boundSource: 'ADMIN_MEDIA_LIMIT',
      };
    } catch (failure) {
      return {
        maximumCostUsd: null,
        pricingRevision: null,
        budgetReady: false,
        blockedReason:
          failure instanceof BadRequestException ||
          failure instanceof ConflictException
            ? failure.message
            : 'Media budget access could not be verified. Retry before generating.',
        boundSource: null,
      };
    }
  }

  async reserveMedia(manager: EntityManager, input: OtogrowAiMediaReservation) {
    const value = validateOtogrowAiMediaReservation(input, new Date(), true);
    await this.lock(manager, value.workspaceId);
    const repository = manager.getRepository(OtogrowAiSpendEntity);
    const prior = await repository.findOneBy({
      workspaceId: value.workspaceId,
      sourceKind: 'MEDIA',
      sourceRunId: value.sourceRunId,
    });
    if (prior) {
      if (
        prior.price.billingType !== 'ATLAS_MEDIA' ||
        prior.price.requestHash !== value.requestHash ||
        prior.price.modelId !== value.modelId ||
        prior.price.kind !== value.kind ||
        prior.price.profileId !== value.limit.id ||
        prior.price.revision !== value.limit.revision ||
        prior.price.source !== value.limit.source ||
        prior.price.verifiedAt !== value.limit.verifiedAt ||
        prior.price.quotedAt !== value.quotedAt ||
        usdToMicro(prior.price.quotedCostUsd) !==
          usdToMicro(value.quotedCostUsd) ||
        prior.price.catalogSchemaRevision !== value.catalogSchemaRevision ||
        usdToMicro(prior.price.maximumCostUsd) !==
          usdToMicro(value.limit.maximumCostUsd) ||
        prior.actorId !== value.actorId ||
        prior.projectId !== value.projectId ||
        prior.taskId !== value.taskId
      )
        throw new ConflictException(
          'This media request identity already belongs to different inputs or pricing. Check its existing run.',
        );
      return prior;
    }
    validateOtogrowAiMediaReservation(value);
    const context = await this.context(manager, value);
    const maximum = usdToMicro(value.limit.maximumCostUsd);
    await this.assertCapacity(
      manager,
      value.workspaceId,
      context.clientId,
      value.taskId,
      maximum,
    );
    const spend = await repository.save(
      repository.create({
        id: v4(),
        workspaceId: value.workspaceId,
        actorId: value.actorId,
        sourceKind: 'MEDIA',
        sourceRunId: value.sourceRunId,
        projectId: value.projectId,
        taskId: value.taskId,
        ...context,
        state: 'RESERVED',
        reservedMicroUsd: maximum.toString(),
        actualMicroUsd: null,
        usage: null,
        attentionReason: null,
        dispatchedAt: null,
        settledAt: null,
        price: {
          billingType: 'ATLAS_MEDIA',
          profileId: value.limit.id,
          revision: value.limit.revision,
          modelId: value.modelId,
          kind: value.kind,
          source: value.limit.source,
          verifiedAt: value.limit.verifiedAt,
          boundSource: 'ADMIN_MEDIA_LIMIT',
          maximumCostUsd: microToUsd(maximum),
          quotedCostUsd: microToUsd(usdToMicro(value.quotedCostUsd)),
          quotedAt: value.quotedAt,
          requestHash: value.requestHash,
          catalogSchemaRevision: value.catalogSchemaRevision,
        },
      }),
    );
    await this.event(
      manager,
      value.workspaceId,
      value.actorId,
      'RESERVED',
      {},
      this.financialState(spend),
      spend.id,
    );
    return spend;
  }

  async authorizeMediaDispatch(
    manager: EntityManager,
    source: Source,
    userWorkspaceId: string,
    authorize: (manager: EntityManager) => Promise<void>,
  ) {
    await this.lock(manager, source.workspaceId);
    const repository = manager.getRepository(OtogrowAiSpendEntity);
    const spend = await repository.findOneBy(source);
    if (
      source.sourceKind !== 'MEDIA' ||
      !spend ||
      spend.price.billingType !== 'ATLAS_MEDIA' ||
      spend.state !== 'RESERVED'
    )
      throw new ConflictException(
        'This media reservation cannot be dispatched again. Check its existing job.',
      );
    assertOtogrowAiMediaQuoteFresh(spend.price.quotedAt);
    await this.access.accessForUser(
      source.workspaceId,
      spend.actorId,
      userWorkspaceId,
      manager,
    );
    await authorize(manager);
    const context = await this.context(manager, spend);
    if (context.clientId !== spend.clientId)
      throw new ConflictException(
        'The media task client changed. Check current inputs and budget before creating a new request.',
      );
    await this.assertCapacity(
      manager,
      source.workspaceId,
      spend.clientId,
      spend.taskId,
      BigInt(spend.reservedMicroUsd),
      spend.id,
    );
    const before = this.financialState(spend);
    spend.state = 'DISPATCHED';
    spend.dispatchedAt = new Date();
    spend.revision++;
    await repository.save(spend);
    await this.event(
      manager,
      source.workspaceId,
      spend.actorId,
      'DISPATCHED',
      before,
      this.financialState(spend),
      spend.id,
    );
    return spend;
  }

  async markMediaUncertain(
    manager: EntityManager,
    source: Source,
    reason: string,
  ) {
    await this.lock(manager, source.workspaceId);
    const repository = manager.getRepository(OtogrowAiSpendEntity);
    const spend = await repository.findOneBy(source);
    if (
      source.sourceKind !== 'MEDIA' ||
      !spend ||
      spend.price.billingType !== 'ATLAS_MEDIA'
    )
      throw new ConflictException(
        'The exact media reservation is unavailable.',
      );
    if (['SETTLED', 'RELEASED'].includes(spend.state)) return spend;
    if (spend.state === 'RESERVED')
      throw new ConflictException(
        'Undispatched media cannot have provider charges.',
      );
    const message =
      reason.trim().slice(0, 1000) ||
      'Provider charge is unconfirmed. The full reservation remains held.';
    if (spend.state === 'UNCERTAIN' && spend.attentionReason === message)
      return spend;
    const before = this.financialState(spend);
    spend.state = 'UNCERTAIN';
    spend.attentionReason = message;
    spend.revision++;
    await repository.save(spend);
    await this.event(
      manager,
      source.workspaceId,
      null,
      'UNCERTAIN',
      before,
      this.financialState(spend),
      spend.id,
    );
    return spend;
  }

  async recordMediaPrediction(
    manager: EntityManager,
    source: Source,
    providerPredictionId: string,
  ) {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(providerPredictionId))
      throw new BadRequestException(
        'A confirmed provider prediction identity is required.',
      );
    await this.lock(manager, source.workspaceId);
    const repository = manager.getRepository(OtogrowAiSpendEntity);
    const spend = await repository.findOneBy(source);
    if (
      source.sourceKind !== 'MEDIA' ||
      !spend ||
      spend.price.billingType !== 'ATLAS_MEDIA'
    )
      throw new ConflictException(
        'The exact media reservation is unavailable.',
      );
    if (['RESERVED', 'RELEASED'].includes(spend.state))
      throw new ConflictException(
        'Only a dispatched media request can accept a provider prediction.',
      );
    const previous = await manager
      .getRepository(OtogrowAiSpendEventEntity)
      .findBy({
        workspaceId: source.workspaceId,
        spendId: spend.id,
        action: 'MEDIA_PREDICTION_ACCEPTED',
      });
    if (previous.length) {
      if (
        previous.some(
          (event) => event.after.providerPredictionId !== providerPredictionId,
        )
      )
        throw new ConflictException(
          'This media reservation already belongs to another prediction.',
        );
      return spend;
    }
    const before = this.financialState(spend);
    spend.revision++;
    await repository.save(spend);
    await this.event(
      manager,
      source.workspaceId,
      null,
      'MEDIA_PREDICTION_ACCEPTED',
      before,
      {
        ...this.financialState(spend),
        providerPredictionId,
        requestHash: spend.price.requestHash,
      },
      spend.id,
    );
    return spend;
  }

  async confirmMediaFailure(
    manager: EntityManager,
    source: Source,
    providerPredictionId: string,
  ) {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(providerPredictionId))
      throw new BadRequestException(
        'A confirmed provider prediction identity is required.',
      );
    await this.lock(manager, source.workspaceId);
    const repository = manager.getRepository(OtogrowAiSpendEntity);
    const spend = await repository.findOneBy(source);
    if (
      source.sourceKind !== 'MEDIA' ||
      !spend ||
      spend.price.billingType !== 'ATLAS_MEDIA'
    )
      throw new ConflictException(
        'The exact media reservation is unavailable.',
      );
    const accepted = await manager
      .getRepository(OtogrowAiSpendEventEntity)
      .findBy({
        workspaceId: source.workspaceId,
        spendId: spend.id,
        action: 'MEDIA_PREDICTION_ACCEPTED',
      });
    if (
      accepted.length !== 1 ||
      accepted[0].after.providerPredictionId !== providerPredictionId
    )
      throw new ConflictException(
        'Failure evidence does not match the saved provider prediction.',
      );
    if (['SETTLED', 'RELEASED'].includes(spend.state)) return spend;
    if (spend.state === 'RESERVED')
      throw new ConflictException(
        'Provider failure cannot settle undispatched media.',
      );
    const before = this.financialState(spend);
    spend.state = 'SETTLED';
    spend.actualMicroUsd = '0';
    spend.settledAt = new Date();
    spend.attentionReason = null;
    spend.revision++;
    await repository.save(spend);
    await this.event(
      manager,
      source.workspaceId,
      null,
      'SETTLED',
      before,
      {
        ...this.financialState(spend),
        providerPredictionId,
        providerStatus: 'FAILED',
        evidenceSource:
          'Atlas terminal prediction failure; published failed-job refund policy.',
      },
      spend.id,
    );
    return spend;
  }

  async dispatch(
    source: Source,
    userWorkspaceId: string,
    authorize: (manager: EntityManager) => Promise<void>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, source.workspaceId);
      const repository = manager.getRepository(OtogrowAiSpendEntity);
      const spend = await repository.findOneBy(source);
      if (!spend || spend.state !== 'RESERVED')
        throw new ConflictException(
          'Paid AI reservation is unavailable. Create a new run; uncertain runs cannot be retried.',
        );
      if (spend.price.billingType === 'ATLAS_MEDIA')
        throw new BadRequestException(
          'Use the exact media dispatch protocol for this reservation.',
        );
      await this.access.accessForUser(
        source.workspaceId,
        spend.actorId,
        userWorkspaceId,
        manager,
      );
      await authorize(manager);
      const profile = await this.price(
        manager,
        source.workspaceId,
        spend.price.modelId,
        spend.price.kind,
      );
      if (
        profile.id !== spend.price.profileId ||
        profile.revision !== spend.price.revision
      )
        throw new ConflictException(
          'AI pricing changed after this request. Preview and start a new run.',
        );
      const currentContext = await this.context(manager, spend);
      if (currentContext.clientId !== spend.clientId)
        throw new ConflictException(
          'The task client changed. Start a new run with its current budget.',
        );
      await this.assertCapacity(
        manager,
        source.workspaceId,
        spend.clientId,
        spend.taskId,
        BigInt(spend.reservedMicroUsd),
        spend.id,
      );
      const before = this.financialState(spend);
      spend.state = 'DISPATCHED';
      spend.dispatchedAt = new Date();
      spend.revision++;
      await repository.save(spend);
      await this.event(
        manager,
        source.workspaceId,
        spend.actorId,
        'DISPATCHED',
        before,
        this.financialState(spend),
        spend.id,
      );
      return spend;
    });
  }
  async settle(source: Source, rawUsage: Partial<OtogrowAiUsage> | null) {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, source.workspaceId);
      const repository = manager.getRepository(OtogrowAiSpendEntity);
      const spend = await repository.findOneBy(source);
      if (!spend)
        throw new ConflictException('The paid AI reservation is missing.');
      if (spend.state === 'RELEASED') return spend;
      if (spend.price.billingType === 'ATLAS_MEDIA') {
        if (spend.state === 'SETTLED') return spend;
        return this.markMediaUncertain(
          manager,
          source,
          'The media output has no attributable confirmed charge. Its full reservation remains held until evidence-based reconciliation.',
        );
      }
      if (spend.state === 'SETTLED') {
        const lateUsage = normalizeUsage(spend.price.pricing, rawUsage);
        if (!lateUsage) return spend;
        let reported: bigint;
        try {
          reported = actualCharge(spend.price.pricing, lateUsage);
        } catch {
          return spend;
        }
        if (reported === BigInt(spend.actualMicroUsd ?? '0')) return spend;
        const evidence = await manager
          .getRepository(OtogrowAiSpendEventEntity)
          .findBy({
            workspaceId: source.workspaceId,
            spendId: spend.id,
            action: 'LATE_PROVIDER_USAGE',
          });
        if (
          evidence.some(
            (event) =>
              event.after.reportedActualMicroUsd === reported.toString(),
          )
        )
          return spend;
        const before = this.financialState(spend);
        spend.revision++;
        spend.attentionReason =
          'Provider evidence differs from the settled amount. The original settlement is retained; the higher amount counts against spending caps.';
        await repository.save(spend);
        await this.event(
          manager,
          source.workspaceId,
          null,
          'LATE_PROVIDER_USAGE',
          before,
          {
            ...this.financialState(spend),
            reportedActualMicroUsd: reported.toString(),
            usage: lateUsage,
          },
          spend.id,
        );
        return spend;
      }
      if (spend.state === 'RESERVED')
        throw new ConflictException('Undispatched AI usage cannot be settled.');
      const usage = normalizeUsage(spend.price.pricing, rawUsage);
      let actual: bigint | null = null;
      if (usage) {
        try {
          actual = actualCharge(spend.price.pricing, usage);
        } catch {
          actual = null;
        }
      }
      const before = this.financialState(spend);
      spend.state = actual === null ? 'UNCERTAIN' : 'SETTLED';
      spend.usage = usage;
      spend.actualMicroUsd = actual?.toString() ?? null;
      spend.settledAt = actual === null ? null : new Date();
      spend.revision++;
      spend.attentionReason =
        actual === null
          ? 'Provider usage is missing or incomplete. The full reservation remains held until evidence-based reconciliation.'
          : actual > BigInt(spend.reservedMicroUsd)
            ? 'Provider charge exceeded its reservation. The full actual charge is recorded; review verified model bounds.'
            : null;
      await repository.save(spend);
      await this.event(
        manager,
        source.workspaceId,
        null,
        spend.state,
        before,
        this.financialState(spend),
        spend.id,
      );
      return spend;
    });
  }
  async stop(manager: EntityManager, source: Source, cancelOnly = false) {
    await this.lock(manager, source.workspaceId);
    const repository = manager.getRepository(OtogrowAiSpendEntity);
    const spend = await repository.findOneBy(source);
    if (
      !spend ||
      (cancelOnly && spend.state !== 'RESERVED') ||
      ['SETTLED', 'RELEASED', 'UNCERTAIN'].includes(spend.state)
    )
      return;
    const before = this.financialState(spend);
    spend.state = spend.state === 'RESERVED' ? 'RELEASED' : 'UNCERTAIN';
    spend.revision++;
    spend.attentionReason =
      spend.state === 'UNCERTAIN'
        ? 'The run ended after dispatch without complete provider usage. Its reservation remains held.'
        : null;
    await repository.save(spend);
    await this.event(
      manager,
      source.workspaceId,
      null,
      spend.state,
      before,
      this.financialState(spend),
      spend.id,
    );
  }
  async fail(source: Source) {
    return this.dataSource.transaction((manager) => this.stop(manager, source));
  }

  async recoverNativeSpends() {
    const expiredBefore = new Date(
      Date.now() - OTOGROW_NATIVE_AI_RECOVERY_GRACE_MS,
    );
    const candidates = await this.dataSource
      .getRepository(OtogrowAiSpendEntity)
      .find({
        where: [
          {
            sourceKind: 'NATIVE_CRM',
            state: 'RESERVED',
            createdAt: LessThan(expiredBefore),
          },
          {
            sourceKind: 'NATIVE_CRM',
            state: 'DISPATCHED',
            dispatchedAt: LessThan(expiredBefore),
          },
        ],
        order: { createdAt: 'ASC', id: 'ASC' },
        take: OTOGROW_NATIVE_AI_RECOVERY_PAGE_SIZE,
      });
    for (const candidate of candidates) {
      await this.dataSource.transaction(async (manager) => {
        await this.lock(manager, candidate.workspaceId);
        const current = await manager
          .getRepository(OtogrowAiSpendEntity)
          .findOneBy({
            id: candidate.id,
            workspaceId: candidate.workspaceId,
            sourceKind: 'NATIVE_CRM',
          });
        if (!current) return;
        const expired =
          current.state === 'RESERVED'
            ? current.createdAt < expiredBefore
            : current.state === 'DISPATCHED' &&
              current.dispatchedAt !== null &&
              current.dispatchedAt < expiredBefore;
        if (expired)
          await this.stop(manager, {
            workspaceId: current.workspaceId,
            sourceKind: 'NATIVE_CRM',
            sourceRunId: current.sourceRunId,
          });
      });
    }
  }

  async saveBudget(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: OtogrowAiBudgetSaveInput,
  ) {
    const result = budgetSaveSchema.safeParse(input);
    if (!result.success)
      throw new BadRequestException(
        'Enter a valid budget amount, scope and revision.',
      );
    const value = result.data;
    await this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id);
      await this.admin(manager, workspace.id, memberId, userWorkspaceId);
      const schema = (await this.workspace(manager, workspace.id))
        .databaseSchema;
      const names: { name: string }[] =
        value.scope === 'WORKSPACE'
          ? value.scopeId === workspace.id
            ? [{ name: 'Workspace' }]
            : []
          : await manager.query(
              value.scope === 'CLIENT'
                ? `SELECT name FROM "${schema}".company WHERE id=$1 AND "deletedAt" IS NULL`
                : `SELECT native.title AS name FROM "${schema}".task native JOIN core."deliveryTask" task ON task."taskId"=native.id AND task."workspaceId"=$2 WHERE native.id=$1 AND native."deletedAt" IS NULL`,
              value.scope === 'CLIENT'
                ? [value.scopeId]
                : [value.scopeId, workspace.id],
            );
      if (!names[0])
        throw new BadRequestException(
          'Choose a budget scope in this workspace.',
        );
      const repository = manager.getRepository(OtogrowAiBudgetEntity);
      const prior = await repository.findOneBy({
        workspaceId: workspace.id,
        scope: value.scope,
        scopeId: value.scopeId,
      });
      if ((prior?.revision ?? 0) !== value.revision)
        throw new ConflictException('Budget changed. Refresh before saving.');
      if (
        !prior &&
        (!value.confirmOpeningBalance || value.openingSpentUsd === undefined)
      )
        throw new BadRequestException(
          'Confirm the known opening spend explicitly. Budget setup does not guess past provider charges.',
        );
      if (
        prior &&
        value.openingSpentUsd !== undefined &&
        usdToMicro(value.openingSpentUsd) !== BigInt(prior.openingSpentMicroUsd)
      )
        throw new BadRequestException(
          'Opening spend is immutable. It cannot be reset by changing a cap.',
        );
      const before = prior ? { ...prior } : {};
      const budget = repository.create({
        ...prior,
        id: prior?.id ?? v4(),
        workspaceId: workspace.id,
        scope: value.scope,
        scopeId: value.scopeId,
        scopeName: names[0].name,
        revision: value.revision + 1,
        enabled: value.enabled,
        capMicroUsd: usdToMicro(value.capUsd).toString(),
        openingSpentMicroUsd:
          prior?.openingSpentMicroUsd ??
          usdToMicro(value.openingSpentUsd!).toString(),
      });
      await repository.save(budget);
      await this.event(
        manager,
        workspace.id,
        memberId,
        'BUDGET_CONFIGURED',
        before,
        { ...budget },
      );
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'BUSINESS',
        action: 'AI_BUDGET_CONFIGURED',
        outcome: 'RECORDED',
        summary: 'Configured an OS production AI spending cap.',
        sourceType: 'finance',
        sourceId: budget.id,
        changes: [
          {
            field: 'revision',
            before: String(value.revision),
            after: String(budget.revision),
          },
          {
            field: 'enabled',
            before: prior ? String(prior.enabled) : null,
            after: String(value.enabled),
          },
        ],
      });
    });
    return this.snapshot(workspace, memberId, userWorkspaceId, {});
  }
  async savePrice(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: OtogrowAiPriceSaveInput,
  ) {
    const result = priceSaveSchema.safeParse(input);
    if (!result.success)
      throw new BadRequestException(
        'Provide every verified model price and bound, including complete long-context tiers when applicable.',
      );
    const value = result.data;
    if (['IMAGE', 'CLIP'].includes(value.kind))
      throw new BadRequestException(
        'Image and clip pricing units are not yet verified by this budget ledger. Paid generation remains blocked.',
      );
    if (value.kind === 'VIDEO_QA' && value.enabled) {
      try {
        assertVideoQaPricing(value);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'Verify the supported video QA tariff and bounds.',
        );
      }
    }
    if (Date.parse(value.verifiedAt) > Date.now())
      throw new BadRequestException(
        'Pricing verification cannot be in the future.',
      );
    await this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id);
      await this.admin(manager, workspace.id, memberId, userWorkspaceId);
      const repository = manager.getRepository(OtogrowAiPriceEntity);
      const prior = await repository.findOneBy(
        value.id
          ? { workspaceId: workspace.id, id: value.id }
          : {
              workspaceId: workspace.id,
              modelId: value.modelId,
              kind: value.kind,
            },
      );
      if ((value.id && !prior) || (prior?.revision ?? 0) !== value.revision)
        throw new ConflictException('Pricing changed. Refresh before saving.');
      if (
        prior &&
        (prior.modelId !== value.modelId || prior.kind !== value.kind)
      )
        throw new BadRequestException(
          'Create a separate profile for a different model or request kind.',
        );
      const before = prior ? { ...prior } : {};
      const profile = repository.create({
        ...prior,
        ...value,
        id: prior?.id ?? v4(),
        workspaceId: workspace.id,
        verifiedAt: new Date(value.verifiedAt),
        revision: value.revision + 1,
      });
      await repository.save(profile);
      await this.event(
        manager,
        workspace.id,
        memberId,
        'PRICE_CONFIGURED',
        before,
        { ...profile },
      );
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'BUSINESS',
        action: 'AI_PRICE_CONFIGURED',
        outcome: 'RECORDED',
        summary:
          'Recorded administrator-verified AI model pricing and request bounds.',
        sourceType: 'finance',
        sourceId: profile.id,
        changes: [
          {
            field: 'revision',
            before: String(value.revision),
            after: String(profile.revision),
          },
          {
            field: 'enabled',
            before: prior ? String(prior.enabled) : null,
            after: String(value.enabled),
          },
        ],
      });
    });
    return this.snapshot(workspace, memberId, userWorkspaceId, {});
  }
  async reconcile(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: OtogrowAiSpendReconcileInput,
  ) {
    const result = reconcileSchema.safeParse(input);
    if (!result.success)
      throw new BadRequestException(
        'Supply a valid actual charge, evidence reference, reason and current revision.',
      );
    const value = result.data;
    await this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id);
      await this.admin(manager, workspace.id, memberId, userWorkspaceId);
      const repository = manager.getRepository(OtogrowAiSpendEntity);
      const spend = await repository.findOneBy({
        workspaceId: workspace.id,
        id: value.spendId,
      });
      if (
        !spend ||
        spend.revision !== value.revision ||
        spend.state !== 'UNCERTAIN'
      )
        throw new ConflictException(
          'Only the current uncertain charge can be reconciled. Active or settled charges cannot be overwritten.',
        );
      const before = this.financialState(spend);
      spend.actualMicroUsd = usdToMicro(value.actualUsd).toString();
      spend.state = 'SETTLED';
      spend.revision++;
      spend.settledAt = new Date();
      spend.attentionReason =
        BigInt(spend.actualMicroUsd) > BigInt(spend.reservedMicroUsd)
          ? 'Evidence-based actual charge exceeded its original reservation.'
          : null;
      await repository.save(spend);
      await this.event(
        manager,
        workspace.id,
        memberId,
        'MANUALLY_RECONCILED',
        before,
        this.financialState(spend),
        spend.id,
        value.evidenceReference,
        value.reason,
      );
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'BUSINESS',
        action: 'AI_SPEND_RECONCILED',
        outcome: 'RECORDED',
        summary: 'Reconciled uncertain AI usage using provider evidence.',
        sourceType: 'finance',
        sourceId: spend.id,
        changes: [{ field: 'state', before: 'UNCERTAIN', after: 'SETTLED' }],
      });
    });
    return this.snapshot(workspace, memberId, userWorkspaceId, {});
  }
  async spendHistory(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: OtogrowAiSpendHistoryInput,
  ): Promise<OtogrowAiSpendHistoryDTO> {
    const value = parseOtogrowAiSpendHistoryInput(input, workspace.id);
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id, true);
      await this.admin(manager, workspace.id, memberId, userWorkspaceId);
      const current = await this.workspace(manager, workspace.id);
      return readOtogrowAiSpendHistory(
        manager,
        {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          schema: current.databaseSchema!,
        },
        value,
      );
    });
  }
  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: OtogrowAiBudgetSnapshotInput,
  ): Promise<OtogrowAiBudgetSnapshotDTO> {
    const result = snapshotSchema.safeParse(input);
    if (!result.success)
      throw new BadRequestException('Invalid AI budget page.');
    const value = result.data;
    let cursor: ReturnType<typeof cursorSchema.parse> | null = null;
    if (value.cursor) {
      try {
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(value.cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw new BadRequestException('Reload AI budgets to reset this page.');
      }
      if (
        cursor.workspaceId !== workspace.id ||
        cursor.needsAttention !== value.needsAttention
      )
        throw new BadRequestException(
          'Reload AI budgets after changing workspace.',
        );
    }
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, workspace.id, true);
      await this.admin(manager, workspace.id, memberId, userWorkspaceId);
      const current = await this.workspace(manager, workspace.id);
      const schema = current.databaseSchema;
      const policies = await manager.getRepository(OtogrowAiBudgetEntity).find({
        where: { workspaceId: workspace.id },
        order: { createdAt: 'ASC' },
      });
      const prices = await manager.getRepository(OtogrowAiPriceEntity).find({
        where: { workspaceId: workspace.id },
        order: { modelId: 'ASC', kind: 'ASC' },
      });
      const { page, more } = await readOtogrowAiSpendPage(
        manager,
        workspace.id,
        {
          needsAttention: value.needsAttention,
          limit: value.limit,
          cursor,
        },
      );
      const exposure = await readOtogrowAiExposure(manager, workspace.id, {
        clients: policies
          .filter((policy) => policy.scope === 'CLIENT')
          .map((policy) => policy.scopeId),
        tasks: policies
          .filter((policy) => policy.scope === 'TASK')
          .map((policy) => policy.scopeId),
      });
      const byScope = new Map(
        exposure.map((item) => [`${item.scope}:${item.scopeId}`, item]),
      );
      const workspaceExposure = byScope.get(`WORKSPACE:${workspace.id}`);
      const clients: { id: string; name: string }[] = await manager.query(
        `SELECT id,name FROM "${schema}".company WHERE "deletedAt" IS NULL ORDER BY name,id LIMIT 1000`,
      );
      const tasks: { id: string; name: string }[] = await manager.query(
        `SELECT native.id,native.title AS name FROM "${schema}".task native JOIN core."deliveryTask" task ON task."taskId"=native.id AND task."workspaceId"=$1 WHERE native."deletedAt" IS NULL ORDER BY native.title,native.id LIMIT 1000`,
        [workspace.id],
      );
      const workspacePolicy = policies.find(
        (policy) => policy.scope === 'WORKSPACE',
      );
      const latest = page[page.length - 1];
      const totalCharged =
        BigInt(workspaceExposure?.chargedMicroUsd ?? '0') +
        BigInt(workspacePolicy?.openingSpentMicroUsd ?? '0');
      return {
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        coverageStartedAt: policies[0]?.createdAt.toISOString() ?? null,
        configured: Boolean(workspacePolicy),
        chargedUsd: microToUsd(totalCharged),
        heldUsd: microToUsd(workspaceExposure?.heldMicroUsd ?? '0'),
        unresolvedCount: workspaceExposure?.attentionCount ?? 0,
        budgets: policies.map((policy) => {
          const totals = byScope.get(`${policy.scope}:${policy.scopeId}`);
          const spent =
            BigInt(totals?.chargedMicroUsd ?? '0') +
            BigInt(policy.openingSpentMicroUsd);
          const holds = BigInt(totals?.heldMicroUsd ?? '0');
          return {
            id: policy.id,
            scope: policy.scope,
            scopeId: policy.scopeId,
            scopeName: policy.scopeName,
            revision: policy.revision,
            enabled: policy.enabled,
            capUsd: microToUsd(policy.capMicroUsd),
            openingSpentUsd: microToUsd(policy.openingSpentMicroUsd),
            chargedUsd: microToUsd(spent),
            heldUsd: microToUsd(holds),
            remainingUsd: microToUsd(
              BigInt(policy.capMicroUsd) - spent - holds,
            ),
          };
        }),
        priceProfiles: prices.map((price) => ({
          id: price.id,
          modelId: price.modelId,
          kind: price.kind,
          revision: price.revision,
          enabled: price.enabled,
          source: price.source,
          verifiedAt: price.verifiedAt.toISOString(),
          pricing: price.pricing,
        })),
        recentSpend: page.map((spend) => ({
          id: spend.id,
          revision: spend.revision,
          sourceKind: spend.sourceKind,
          sourceRunId: spend.sourceRunId,
          state: spend.state,
          modelId: spend.price.modelId,
          kind: spend.price.kind,
          clientName: spend.clientName,
          taskName: spend.taskName,
          reservedUsd: microToUsd(spend.reservedMicroUsd),
          reportedActualUsd:
            spend.reportedActualMicroUsd === null
              ? null
              : microToUsd(spend.reportedActualMicroUsd),
          actualUsd:
            spend.actualMicroUsd === null
              ? null
              : microToUsd(spend.actualMicroUsd),
          heldUsd: microToUsd(held(spend)),
          boundSource: spend.price.boundSource,
          priceSource: spend.price.source,
          priceRevision: spend.price.revision,
          priceVerifiedAt: spend.price.verifiedAt,
          createdAt: spend.createdAt.toISOString(),
          dispatchedAt: spend.dispatchedAt?.toISOString() ?? null,
          settledAt: spend.settledAt?.toISOString() ?? null,
          attentionReason: spend.attentionReason,
        })),
        clients,
        tasks,
        nextCursor:
          more && latest
            ? Buffer.from(
                JSON.stringify({
                  workspaceId: workspace.id,
                  needsAttention: value.needsAttention,
                  at: latest.cursorAt,
                  id: latest.id,
                }),
              ).toString('base64url')
            : null,
      };
    });
  }
}
