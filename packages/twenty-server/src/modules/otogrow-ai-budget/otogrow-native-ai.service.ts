import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import {
  type LanguageModelV3CallOptions,
  type LanguageModelV3StreamPart,
  type LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { type LanguageModel, wrapLanguageModel } from 'ai';
import { PermissionFlagType } from 'twenty-shared/constants';
import { isValidUuid } from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { DataSource, type EntityManager } from 'typeorm';
import { v4 } from 'uuid';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type AiModelConfig } from 'src/engine/metadata-modules/ai/ai-models/types/ai-model-config.type';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import {
  assertNativeAiRequest,
  nativeAiUsage,
} from 'src/modules/otogrow-ai-budget/otogrow-native-ai.policy';
import { OTOGROW_NATIVE_AI_REQUEST_TIMEOUT_MS } from 'src/modules/otogrow-ai-budget/otogrow-native-ai.constants';

type NativeAiContext = {
  workspaceId: string;
  userWorkspaceId: string | null | undefined;
  modelId: string;
  modelConfig: Pick<
    AiModelConfig,
    'modelId' | 'contextWindowTokens' | 'maxOutputTokens'
  >;
};
type NativeAiSource = {
  workspaceId: string;
  sourceKind: 'NATIVE_CRM';
  sourceRunId: string;
};

@Injectable()
export class OtogrowNativeAiService {
  private readonly logger = new Logger(OtogrowNativeAiService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly budget: OtogrowAiBudgetService,
    private readonly permissions: PermissionsService,
    private readonly models: AiModelRegistryService,
  ) {}

  @Cron('*/30 * * * * *')
  async recover() {
    await this.budget.recoverNativeSpends();
  }

  private async actor(manager: EntityManager, context: NativeAiContext) {
    if (
      !isValidUuid(context.workspaceId) ||
      typeof context.userWorkspaceId !== 'string' ||
      !isValidUuid(context.userWorkspaceId)
    )
      throw new ForbiddenException(
        'An active person with AI access must own this CRM AI request.',
      );
    const workspace = await manager.getRepository(WorkspaceEntity).findOne({
      where: { id: context.workspaceId },
      lock: { mode: 'pessimistic_read' },
    });
    if (
      !workspace ||
      workspace.activationStatus !== WorkspaceActivationStatus.ACTIVE ||
      !workspace.databaseSchema ||
      !/^\w+$/.test(workspace.databaseSchema)
    )
      throw new ForbiddenException(
        'An active workspace is required for CRM AI.',
      );
    this.models.validateModelAvailability(context.modelId, workspace);
    const rows: { memberId: string; roleId: string }[] = await manager.query(
      `SELECT m.id AS "memberId", r.id AS "roleId"
       FROM core."userWorkspace" u
       JOIN core."user" account ON account.id=u."userId"
       JOIN "${workspace.databaseSchema}"."workspaceMember" m ON m."userId"=u."userId"
       JOIN core."roleTarget" target ON target."userWorkspaceId"=u.id AND target."workspaceId"=u."workspaceId"
       JOIN core.role r ON r.id=target."roleId" AND r."workspaceId"=u."workspaceId"
       WHERE u.id=$1 AND u."workspaceId"=$2 AND u."deletedAt" IS NULL
         AND account."deletedAt" IS NULL AND account.disabled=false AND m."deletedAt" IS NULL
       FOR SHARE OF u,account,m,target,r`,
      [context.userWorkspaceId, context.workspaceId],
    );
    if (rows.length !== 1)
      throw new ForbiddenException(
        'Your active CRM AI membership could not be verified.',
      );
    await manager.query(
      `SELECT id FROM core."rolePermissionFlag" WHERE "workspaceId"=$1 AND "roleId"=$2 FOR SHARE`,
      [context.workspaceId, rows[0].roleId],
    );
    const role = await manager.getRepository(RoleEntity).findOne({
      where: { id: rows[0].roleId, workspaceId: context.workspaceId },
      select: {
        id: true,
        canAccessAllTools: true,
        canUpdateAllSettings: true,
        rolePermissionFlags: {
          id: true,
          permissionFlag: { id: true, universalIdentifier: true },
        },
      },
      relations: { rolePermissionFlags: { permissionFlag: true } },
    });
    if (
      !role ||
      !this.permissions.checkRolePermissions(role, PermissionFlagType.AI)
    )
      throw new ForbiddenException('Your current role does not allow CRM AI.');
    return rows[0].memberId;
  }

  private async verifyOutputAccess(context: NativeAiContext) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))',
        [`delivery:${context.workspaceId}`],
      );
      return this.actor(manager, context);
    });
  }

  private async start(
    context: NativeAiContext,
    params: LanguageModelV3CallOptions,
  ) {
    params = {
      ...params,
      abortSignal: AbortSignal.any([
        ...(params.abortSignal ? [params.abortSignal] : []),
        AbortSignal.timeout(OTOGROW_NATIVE_AI_REQUEST_TIMEOUT_MS),
      ]),
    };
    assertNativeAiRequest(params);
    params.abortSignal?.throwIfAborted();
    if (context.modelId !== context.modelConfig.modelId)
      throw new BadRequestException(
        'CRM AI model and spending configuration do not match.',
      );
    const source: NativeAiSource = {
      workspaceId: context.workspaceId,
      sourceKind: 'NATIVE_CRM',
      sourceRunId: v4(),
    };
    const spend = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${context.workspaceId}`],
      );
      const actorId = await this.actor(manager, context);
      return this.budget.reserveNative(manager, {
        ...source,
        actorId,
        modelId: context.modelId,
        maxOutputTokens: params.maxOutputTokens,
        modelContextWindowTokens: context.modelConfig.contextWindowTokens,
        modelMaxOutputTokens: context.modelConfig.maxOutputTokens,
      });
    });
    try {
      if (spend.price.billingType === 'ATLAS_MEDIA')
        throw new BadRequestException(
          'CRM AI requires verified token pricing.',
        );
      assertNativeAiRequest(params, spend.price.reasoningTokenBound);
      params.abortSignal?.throwIfAborted();
      await this.budget.dispatch(
        source,
        context.userWorkspaceId!,
        async (manager) => {
          const actorId = await this.actor(manager, context);
          if (actorId !== spend.actorId)
            throw new ForbiddenException('The CRM AI request owner changed.');
          params.abortSignal?.throwIfAborted();
        },
      );
      return {
        source,
        params: { ...params, maxOutputTokens: spend.price.outputTokenBound },
      };
    } catch (error) {
      await this.budget.fail(source);
      throw error;
    }
  }

  wrap(model: LanguageModel, context: NativeAiContext): LanguageModel {
    if (typeof model === 'string' || model.specificationVersion !== 'v3')
      throw new BadRequestException(
        'This CRM AI model does not support verified request-level spending controls.',
      );
    return wrapLanguageModel({
      model,
      middleware: {
        specificationVersion: 'v3',
        wrapGenerate: async ({ model: currentModel, params }) => {
          const attempt = await this.start(context, params);
          try {
            const result = await currentModel.doGenerate(attempt.params);
            await this.budget.settle(
              attempt.source,
              nativeAiUsage(result.usage),
            );
            attempt.params.abortSignal?.throwIfAborted();
            await this.verifyOutputAccess(context);
            return result;
          } catch (error) {
            await this.budget.fail(attempt.source);
            throw error;
          }
        },
        wrapStream: async ({ model: currentModel, params }) => {
          const attempt = await this.start(context, params);
          try {
            const result = await currentModel.doStream(attempt.params);
            return {
              ...result,
              stream: this.guardStream(
                result.stream,
                attempt.source,
                context,
                attempt.params.abortSignal,
              ),
            };
          } catch (error) {
            await this.budget.fail(attempt.source);
            throw error;
          }
        },
      },
    });
  }

  private guardStream(
    stream: ReadableStream<LanguageModelV3StreamPart>,
    source: NativeAiSource,
    context: NativeAiContext,
    signal?: AbortSignal,
  ) {
    const reader = stream.getReader();
    let usage: LanguageModelV3Usage | null = null;
    let uncertain = false;
    let finalized = false;
    const fail = async () => {
      uncertain = true;
      await this.budget.fail(source);
    };
    const abort = () => {
      void fail().catch(() =>
        this.logger.error(
          'CRM AI interrupted; its durable dispatched reservation remains held.',
        ),
      );
      void reader.cancel().catch(() => undefined);
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const detach = () => signal?.removeEventListener('abort', abort);
    return new ReadableStream<LanguageModelV3StreamPart>({
      pull: async (controller) => {
        try {
          const next = await reader.read();
          signal?.throwIfAborted();
          if (next.done) {
            if (!uncertain && usage)
              await this.budget.settle(source, nativeAiUsage(usage));
            else await fail();
            await this.verifyOutputAccess(context);
            finalized = true;
            detach();
            controller.close();
            return;
          }
          if (next.value.type === 'error') await fail();
          if (next.value.type === 'finish') {
            if (usage) await fail();
            usage = next.value.usage;
          }
          await this.verifyOutputAccess(context);
          controller.enqueue(next.value);
        } catch (error) {
          detach();
          try {
            await fail();
          } finally {
            controller.error(error);
            await reader.cancel().catch(() => undefined);
          }
        }
      },
      cancel: async (reason) => {
        detach();
        try {
          if (!finalized) await fail();
        } finally {
          await reader.cancel(reason);
        }
      },
    });
  }
}
