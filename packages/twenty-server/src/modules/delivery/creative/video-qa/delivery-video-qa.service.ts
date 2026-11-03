import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { generateText, Output } from 'ai';
import { DataSource, type EntityManager } from 'typeorm';
import { v4 } from 'uuid';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { ProviderConfigService } from 'src/engine/metadata-modules/ai/ai-models/services/provider-config.service';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { type CreativeAsset } from 'src/modules/delivery/creative/delivery-creative.types';
import { type DeliveryMediaRun } from 'src/modules/delivery/creative/delivery-media.types';
import {
  isCreativeAssetApproved,
  isCreativeAssetCurrent,
} from 'src/modules/delivery/creative/delivery-creative.policy';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import {
  usageFromAiError,
  usageFromAiSdk,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-usage';
import { DeliveryVideoQaAdapter } from './delivery-video-qa.adapter';
import { DeliveryVideoQaReportEntity } from './entities/delivery-video-qa-report.entity';
import {
  assertVideoQaRequestSize,
  parseVideoQa,
  validateVideoQaOutput,
  videoQaBytesHash,
  videoQaHash,
  videoQaPrompt,
  VIDEO_QA_SYSTEM,
} from './delivery-video-qa.policy';
import {
  type VideoQaAsset,
  type VideoQaInputSnapshot,
  type VideoQaPreviewInput,
  videoQaCancelSchema,
  videoQaOutputSchema,
  videoQaPreviewSchema,
  videoQaReceiptSchema,
  videoQaSelectionSchema,
  videoQaStartSchema,
  VIDEO_QA_MAX_OUTPUT_TOKENS,
  VIDEO_QA_MAX_SOURCE_BYTES,
  VIDEO_QA_MODEL,
  VIDEO_QA_PIPELINE_VERSION,
} from './delivery-video-qa.types';
import {
  type DeliveryVideoQaPreviewDTO,
  type DeliveryVideoQaReceiptDTO,
  type DeliveryVideoQaStateDTO,
  type DeliveryVideoQaRunDTO,
} from './delivery-video-qa.dto';

type QaScope = Awaited<ReturnType<DeliveryVideoQaService['source']>>;
const snapshotAsset = (asset: CreativeAsset, sha256: string): VideoQaAsset => ({
  id: asset.id,
  name: asset.name,
  mimeType: asset.mimeType,
  size: asset.size,
  sha256,
  briefVersion: asset.briefVersion,
  productionVersion: asset.productionVersion,
  assemblyVersion: asset.assemblyVersion,
  shotId: asset.shotId,
  shotVersion: asset.shotVersion,
});

@Injectable()
export class DeliveryVideoQaService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly creative: DeliveryCreativeService,
    private readonly registry: AiModelRegistryService,
    private readonly storage: FileStorageDriverFactory,
    private readonly adapter: DeliveryVideoQaAdapter,
    private readonly budget: OtogrowAiBudgetService,
    private readonly providers: ProviderConfigService,
  ) {}

  private read<TResult>(
    workspace: WorkspaceEntity,
    apply: (manager: EntityManager) => Promise<TResult>,
    manager?: EntityManager,
  ) {
    return readDeliverySnapshot(this.dataSource, workspace.id, apply, manager);
  }
  private async write<TResult>(
    workspaceId: string,
    apply: (manager: EntityManager) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    const execute = async (manager: EntityManager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspaceId}`],
      );
      return apply(manager);
    };
    if (
      transactionManager &&
      !transactionManager.queryRunner?.isTransactionActive
    )
      throw new Error('Video QA writes require an active transaction.');
    return transactionManager
      ? execute(transactionManager)
      : this.dataSource.transaction(execute);
  }
  private identity(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    scope: QaScope,
  ) {
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      observedAt: new Date().toISOString(),
      actor: scope.actor,
      scope: videoQaHash([
        workspace.id,
        memberId,
        userWorkspaceId,
        scope.actor.isAdmin,
        [...scope.actor.roleIds].sort(),
        [...scope.actor.capabilities].sort(),
        scope.project.id,
        scope.project.revision,
      ]),
    };
  }
  async source(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
  ) {
    const source = await this.creative.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
    );
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneByOrFail({
        workspaceId: workspace.id,
        id: source.task.projectId,
      });
    const document = source.task.details.creative;
    if (!document)
      throw new NotFoundException('Creative production is unavailable.');
    return { ...source, project, document };
  }
  private assertRunAccess(scope: QaScope, report: DeliveryVideoQaReportEntity) {
    if (
      scope.task.projectId !== report.projectId ||
      scope.project.companyId !== report.companyId
    ) {
      if (!scope.actor.isAdmin)
        throw new NotFoundException(
          'This QA report belongs to a previous client context.',
        );
      return false;
    }
    return true;
  }
  private assertCanStart(
    scope: QaScope,
    modelId: string,
    workspace: WorkspaceEntity,
  ) {
    if (!scope.actor.isManager && scope.assigneeId !== scope.actor.memberId)
      throw new ForbiddenException(
        'Only the current assignee or a manager can check production video.',
      );
    if (scope.task.details.state === 'APPROVED')
      throw new ConflictException(
        'Final work is already approved. Open a revision before starting another check.',
      );
    const settings = scope.document.mediaSettings;
    const role = scope.actor.isAdmin
      ? 'ADMIN'
      : scope.actor.isManager
        ? 'MANAGER'
        : 'MEMBER';
    if (
      !settings?.enabled ||
      !settings.modelIds.includes(modelId) ||
      !settings.roles.includes(role)
    )
      throw new ForbiddenException(
        'Video QA is not enabled for this production, role and model.',
      );
    if (scope.document.approvedBriefVersion !== scope.document.briefVersion)
      throw new ConflictException(
        'Approve the current brief before checking video.',
      );
    this.registry.validateModelAvailability(modelId, workspace);
    const model = this.registry.getModel(modelId);
    const provider = model?.providerName
      ? this.providers.getResolvedProviders()[model.providerName]
      : null;
    if (
      modelId !== VIDEO_QA_MODEL ||
      model?.sdkPackage !== '@ai-sdk/google' ||
      model.providerName !== 'google' ||
      !provider?.apiKey ||
      provider.baseUrl
    )
      throw new BadRequestException(
        'Video QA currently requires the direct Google Gemini3.5 Flash-Lite connection. Other models/endpoints have not been verified for this billing and media path.',
      );
  }
  private structural(scope: QaScope, input: VideoQaPreviewInput) {
    const document = scope.document;
    const asset = document.assets.find((item) => item.id === input.assetId);
    if (
      !asset ||
      asset.storageState !== 'READY' ||
      !asset.mimeType.startsWith('video/') ||
      asset.size > VIDEO_QA_MAX_SOURCE_BYTES ||
      !isCreativeAssetCurrent(document, asset)
    )
      throw new BadRequestException(
        'Choose one current, ready video under100 MiB.',
      );
    const references = input.referenceAssetIds.map((id) => {
      const reference = document.assets.find((item) => item.id === id);
      if (
        !reference ||
        reference.storageState !== 'READY' ||
        !reference.mimeType.startsWith('image/') ||
        reference.size > 6000000 ||
        !isCreativeAssetApproved(document, reference)
      )
        throw new BadRequestException(
          'Choose current approved product images under6 MB.',
        );
      return reference;
    });
    return {
      projectId: scope.task.projectId,
      companyId: scope.project.companyId,
      productionVersion: document.productionVersion,
      assemblyVersion: document.assemblyVersion,
      briefVersion: document.briefVersion,
      settingsVersion: document.mediaSettings!.version,
      assigneeId: scope.assigneeId ?? null,
      brief: document.brief,
      asset: snapshotAsset(asset, ''),
      references: references.map((reference) => snapshotAsset(reference, '')),
      modelId: input.modelId,
      manualTranscript: input.manualTranscript ?? null,
    };
  }
  private current(scope: QaScope, snapshot: VideoQaInputSnapshot) {
    if (
      scope.project.id !== snapshot.projectId ||
      scope.project.companyId !== snapshot.companyId ||
      scope.document.approvedBriefVersion !== snapshot.briefVersion
    )
      return false;
    try {
      const current = this.structural(scope, {
        taskId: scope.task.taskId,
        revision: scope.task.revision,
        assetId: snapshot.asset.id,
        referenceAssetIds: snapshot.references.map((asset) => asset.id),
        modelId: VIDEO_QA_MODEL,
        manualTranscript: snapshot.manualTranscript,
      });
      const {
        asset,
        references,
        projectId,
        companyId,
        productionVersion,
        assemblyVersion,
        briefVersion,
        settingsVersion,
        assigneeId,
        brief,
        modelId,
        manualTranscript,
      } = snapshot;
      return (
        videoQaHash(current) ===
        videoQaHash({
          projectId,
          companyId,
          productionVersion,
          assemblyVersion,
          briefVersion,
          settingsVersion,
          assigneeId,
          brief,
          asset: { ...asset, sha256: '' },
          references: references.map((reference) => ({
            ...reference,
            sha256: '',
          })),
          modelId,
          manualTranscript,
        })
      );
    } catch {
      return false;
    }
  }
  private async bytes(filePath: string, maximum: number) {
    const stream = await this.storage.getCurrentDriver().readFile({ filePath });
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > maximum) {
        stream.destroy();
        throw new BadRequestException(
          'Media bytes exceed the supported evidence limit.',
        );
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  private assetPath(workspaceId: string, taskId: string, assetId: string) {
    return `${workspaceId}/delivery-creative/${taskId}/${assetId}`;
  }
  private evidencePath(
    workspaceId: string,
    taskId: string,
    runId: string,
    file: string,
  ) {
    return `${workspaceId}/delivery-creative/${taskId}/video-qa/${runId}/${file}`;
  }
  private async assertSourceBytes(
    workspaceId: string,
    snapshot: VideoQaInputSnapshot,
  ) {
    for (const asset of [snapshot.asset, ...snapshot.references]) {
      const bytes = await this.bytes(
        this.assetPath(workspaceId, snapshot.taskId, asset.id),
        asset.id === snapshot.asset.id ? VIDEO_QA_MAX_SOURCE_BYTES : 6000000,
      );
      if (
        bytes.length !== asset.size ||
        videoQaBytesHash(bytes) !== asset.sha256
      )
        throw new ConflictException(
          'Source bytes no longer match the frozen video QA evidence.',
        );
    }
  }
  private async prepare(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: VideoQaPreviewInput,
    transactionManager?: EntityManager,
  ) {
    const captured = await this.read(
      workspace,
      async (manager) => {
        const scope = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.taskId,
        );
        if (scope.task.revision !== input.revision)
          throw new ConflictException(
            'Production changed. Refresh before preparing video QA.',
          );
        this.assertCanStart(scope, input.modelId, workspace);
        return { scope, structural: this.structural(scope, input) };
      },
      transactionManager,
    );
    const video = await this.bytes(
      this.assetPath(workspace.id, input.taskId, input.assetId),
      VIDEO_QA_MAX_SOURCE_BYTES,
    );
    if (video.length !== captured.structural.asset.size)
      throw new ConflictException(
        'Video bytes no longer match the selected asset.',
      );
    const prepared = await this.adapter.prepare(video);
    const references: Buffer[] = [];
    const sourceReferences: VideoQaAsset[] = [];
    for (const reference of captured.structural.references) {
      const bytes = await this.bytes(
        this.assetPath(workspace.id, input.taskId, reference.id),
        6000000,
      );
      if (bytes.length !== reference.size)
        throw new ConflictException('Reference bytes changed.');
      references.push(await this.adapter.reference(bytes));
      sourceReferences.push({ ...reference, sha256: videoQaBytesHash(bytes) });
    }
    const source = {
      ...captured.structural,
      asset: { ...captured.structural.asset, sha256: videoQaBytesHash(video) },
      references: sourceReferences,
    };
    const sourceFingerprint = videoQaHash(source);
    const preparationFingerprint = videoQaHash({
      preparation: prepared.preparation,
      references: references.map(videoQaBytesHash),
    });
    const snapshot: VideoQaInputSnapshot = {
      ...source,
      pipelineVersion: VIDEO_QA_PIPELINE_VERSION,
      taskId: input.taskId,
      creativeVersion: captured.scope.document.version,
      sourceFingerprint,
      preparationFingerprint,
      preparation: prepared.preparation,
    };
    assertVideoQaRequestSize(
      prepared.proxy,
      references,
      videoQaPrompt(snapshot),
    );
    return {
      ...prepared,
      references,
      snapshot,
      structural: captured.structural,
    };
  }
  private quote(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    scope: QaScope,
    modelId: string,
  ) {
    return this.budget.quote(manager, {
      workspaceId: workspace.id,
      actorId: memberId,
      sourceKind: 'MEDIA',
      sourceRunId: v4(),
      projectId: scope.project.id,
      taskId: scope.task.taskId,
      modelId,
      kind: 'VIDEO_QA',
      maxOutputTokens: VIDEO_QA_MAX_OUTPUT_TOKENS,
    });
  }
  async preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryVideoQaPreviewDTO> {
    const input = parseVideoQa(videoQaPreviewSchema, raw);
    const prepared = await this.prepare(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      transactionManager,
    );
    return this.write(
      workspace.id,
      async (manager) => {
        const scope = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.taskId,
        );
        this.assertCanStart(scope, input.modelId, workspace);
        if (
          scope.task.revision !== input.revision ||
          !this.current(scope, prepared.snapshot)
        )
          throw new ConflictException(
            'Production changed during preparation. Preview again.',
          );
        const quote = await this.quote(
          manager,
          workspace,
          memberId,
          scope,
          input.modelId,
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, scope),
          taskId: input.taskId,
          taskRevision: scope.task.revision,
          projectId: scope.project.id,
          creativeVersion: prepared.snapshot.creativeVersion,
          briefVersion: prepared.snapshot.briefVersion,
          brief: prepared.snapshot.brief,
          asset: prepared.snapshot.asset,
          references: prepared.snapshot.references,
          modelId: input.modelId,
          manualTranscript: input.manualTranscript ?? null,
          sourceFingerprint: prepared.snapshot.sourceFingerprint,
          preparationFingerprint: prepared.snapshot.preparationFingerprint,
          preparation: prepared.preparation,
          maximumCostUsd: quote.maximumCostUsd,
          pricingRevision: quote.pricingRevision,
          budgetReady: quote.budgetReady,
          blockedReason: quote.blockedReason,
        };
      },
      transactionManager,
    );
  }
  private receiptValue(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    scope: QaScope,
    report: DeliveryVideoQaReportEntity,
    run: DeliveryMediaRun,
    action = 'STARTED',
  ): DeliveryVideoQaReceiptDTO {
    return {
      ...this.identity(workspace, memberId, userWorkspaceId, scope),
      taskId: report.taskId,
      runId: report.id,
      requestId:
        action === 'CANCELLED'
          ? report.cancellation!.requestId
          : report.requestId,
      inputHash:
        action === 'CANCELLED'
          ? report.cancellation!.inputHash
          : report.inputHash,
      action,
      status: run.status,
      createdAt:
        action === 'CANCELLED'
          ? report.cancellation!.at
          : report.createdAt.toISOString(),
    };
  }
  private run(scope: QaScope, report: DeliveryVideoQaReportEntity) {
    const run = scope.document.mediaRuns?.find(
      (candidate) =>
        candidate.id === report.id && candidate.kind === 'VIDEO_QA',
    );
    if (!run) throw new NotFoundException('Video QA run is unavailable.');
    return run;
  }
  async start(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryVideoQaReceiptDTO> {
    const input = parseVideoQa(videoQaStartSchema, raw);
    const inputHash = videoQaHash(input);
    const previous = await this.read(
      workspace,
      async (manager) => {
        const scope = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.taskId,
        );
        const report = await manager
          .getRepository(DeliveryVideoQaReportEntity)
          .findOneBy({ workspaceId: workspace.id, requestId: input.requestId });
        if (!report) {
          if (
            await manager.getRepository(DeliveryVideoQaReportEntity).findOneBy({
              workspaceId: workspace.id,
              cancelRequestId: input.requestId,
            })
          )
            throw new ConflictException(
              'This request identity belongs to a cancellation command.',
            );
          return null;
        }
        this.assertRunAccess(scope, report);
        if (
          report.taskId !== input.taskId ||
          report.initiatorId !== memberId ||
          report.userWorkspaceId !== userWorkspaceId ||
          report.inputHash !== inputHash
        )
          throw new ConflictException(
            'This request identity belongs to a different video QA command.',
          );
        return this.receiptValue(
          workspace,
          memberId,
          userWorkspaceId,
          scope,
          report,
          this.run(scope, report),
        );
      },
      transactionManager,
    );
    if (previous) return previous;
    const {
      requestId: _requestId,
      sourceFingerprint: _sourceFingerprint,
      preparationFingerprint: _preparationFingerprint,
      pricingRevision: _pricingRevision,
      confirm: _confirm,
      ...previewInput
    } = input;
    const prepared = await this.prepare(
      workspace,
      memberId,
      userWorkspaceId,
      previewInput,
      transactionManager,
    );
    if (
      prepared.snapshot.sourceFingerprint !== input.sourceFingerprint ||
      prepared.snapshot.preparationFingerprint !== input.preparationFingerprint
    )
      throw new ConflictException(
        'Video evidence changed after preview. Prepare and confirm the new evidence.',
      );
    return this.write(
      workspace.id,
      async (manager) => {
        const scope = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.taskId,
        );
        const repository = manager.getRepository(DeliveryVideoQaReportEntity);
        const duplicate = await repository.findOneBy({
          workspaceId: workspace.id,
          requestId: input.requestId,
        });
        if (duplicate) {
          this.assertRunAccess(scope, duplicate);
          if (
            duplicate.taskId !== input.taskId ||
            duplicate.initiatorId !== memberId ||
            duplicate.userWorkspaceId !== userWorkspaceId ||
            duplicate.inputHash !== inputHash
          )
            throw new ConflictException(
              'This request identity belongs to a different command.',
            );
          return this.receiptValue(
            workspace,
            memberId,
            userWorkspaceId,
            scope,
            duplicate,
            this.run(scope, duplicate),
          );
        }
        if (
          await repository.findOneBy({
            workspaceId: workspace.id,
            cancelRequestId: input.requestId,
          })
        )
          throw new ConflictException(
            'This request identity belongs to a cancellation command.',
          );
        this.assertCanStart(scope, input.modelId, workspace);
        if (
          scope.task.revision !== input.revision ||
          !this.current(scope, prepared.snapshot)
        )
          throw new ConflictException('Production changed after preview.');
        const runs = scope.document.mediaRuns ?? [];
        if (
          runs.length >= 200 ||
          runs.some((run) => ['QUEUED', 'RUNNING'].includes(run.status))
        )
          throw new ConflictException(
            'Wait for the current production run, or create another production when history is full.',
          );
        if (
          runs.filter((run) =>
            run.createdAt.startsWith(new Date().toISOString().slice(0, 10)),
          ).length >= scope.document.mediaSettings!.dailyRunLimit
        )
          throw new BadRequestException(
            'Daily production run limit reached (UTC). Failed and cancelled runs count.',
          );
        const id = v4();
        await this.budget.reserve(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          sourceKind: 'MEDIA',
          sourceRunId: id,
          projectId: scope.project.id,
          taskId: input.taskId,
          modelId: input.modelId,
          kind: 'VIDEO_QA',
          maxOutputTokens: VIDEO_QA_MAX_OUTPUT_TOKENS,
          pricingRevision: input.pricingRevision,
        });
        const createdAt = new Date();
        await repository.insert({
          id,
          workspaceId: workspace.id,
          taskId: input.taskId,
          projectId: scope.project.id,
          companyId: scope.project.companyId,
          initiatorId: memberId,
          userWorkspaceId,
          requestId: input.requestId,
          cancelRequestId: null,
          inputHash,
          pricingRevision: input.pricingRevision,
          artifactsReady: false,
          input: prepared.snapshot,
          result: null,
          cancellation: null,
          completedAt: null,
          createdAt,
        });
        const run: DeliveryMediaRun = {
          id,
          requestId: input.requestId,
          modelId: input.modelId,
          kind: 'VIDEO_QA',
          shotId: '',
          shotVersion: scope.document.productionVersion,
          briefVersion: scope.document.briefVersion,
          settingsVersion: scope.document.mediaSettings!.version,
          prompt:
            'Check the exact video, actual audio and selected product references against the approved brief.',
          referenceAssetIds: [input.assetId, ...input.referenceAssetIds],
          initiatorId: memberId,
          userWorkspaceId,
          status: 'QUEUED',
          createdAt: createdAt.toISOString(),
          updatedAt: createdAt.toISOString(),
          error: null,
          providerJobId: null,
          assetId: input.assetId,
          cost: null,
        };
        scope.document.mediaRuns = [...runs, run];
        scope.task.revision++;
        await manager.getRepository(DeliveryTaskEntity).save(scope.task);
        await this.activity(manager, workspace.id, scope, run, 'QUEUED', null);
        const report = await repository.findOneByOrFail({
          workspaceId: workspace.id,
          id,
        });
        return this.receiptValue(
          workspace,
          memberId,
          userWorkspaceId,
          scope,
          report,
          run,
        );
      },
      transactionManager,
    );
  }
  private async activity(
    manager: EntityManager,
    workspaceId: string,
    scope: QaScope,
    run: DeliveryMediaRun,
    status: DeliveryMediaRun['status'],
    before: string | null,
  ) {
    await recordOtogrowActivity(manager, {
      workspaceId,
      actorId: run.initiatorId,
      actorType: ['QUEUED', 'CANCELLED'].includes(status) ? 'HUMAN' : 'AGENT',
      subjectMemberId: scope.assigneeId,
      category: 'CREATIVE',
      sourceType: 'creative',
      sourceId: scope.task.taskId,
      taskId: scope.task.taskId,
      projectId: scope.task.projectId,
      action: `MEDIA_${status}`,
      outcome: status,
      summary:
        status === 'SUCCEEDED'
          ? 'Recorded video QA evidence and suggestions for human review.'
          : 'Updated a video QA request; human approval remains separate.',
      changes: [
        { field: 'mediaRunId', before: null, after: run.id },
        { field: 'mediaKind', before: null, after: 'VIDEO_QA' },
        { field: 'runStatus', before, after: status },
      ],
    });
  }
  private async selected(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
    runId: string,
    includeResult = false,
  ) {
    const scope = await this.source(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
    );
    const report = await manager
      .getRepository(DeliveryVideoQaReportEntity)
      .findOne({
        where: { workspaceId: workspace.id, taskId, id: runId },
        select: {
          id: true,
          workspaceId: true,
          taskId: true,
          projectId: true,
          companyId: true,
          initiatorId: true,
          userWorkspaceId: true,
          requestId: true,
          cancelRequestId: true,
          inputHash: true,
          pricingRevision: true,
          artifactsReady: true,
          input: true,
          cancellation: true,
          createdAt: true,
          completedAt: true,
          result: includeResult,
        },
      });
    if (!report) throw new NotFoundException('Video QA report was not found.');
    this.assertRunAccess(scope, report);
    return { scope, report, run: this.run(scope, report) };
  }
  private stateValue(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    selected: Awaited<ReturnType<DeliveryVideoQaService['selected']>>,
  ): DeliveryVideoQaStateDTO {
    const { scope, report, run } = selected;
    return {
      ...this.identity(workspace, memberId, userWorkspaceId, scope),
      taskId: report.taskId,
      taskRevision: scope.task.revision,
      runId: run.id,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      error: run.error,
      sourceCurrent: this.current(scope, report.input),
      canCancel:
        ['QUEUED', 'RUNNING'].includes(run.status) &&
        (scope.actor.isManager ||
          (report.initiatorId === memberId &&
            report.userWorkspaceId === userWorkspaceId)) &&
        scope.project.companyId === report.companyId &&
        scope.project.id === report.projectId,
      assetId: report.input.asset.id,
      briefVersion: report.input.briefVersion,
    };
  }
  async state(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    manager?: EntityManager,
  ): Promise<DeliveryVideoQaStateDTO> {
    const input = parseVideoQa(videoQaSelectionSchema, raw);
    return this.read(
      workspace,
      async (manager) =>
        this.stateValue(
          workspace,
          memberId,
          userWorkspaceId,
          await this.selected(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            input.taskId,
            input.runId,
          ),
        ),
      manager,
    );
  }
  async detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryVideoQaRunDTO> {
    const input = parseVideoQa(videoQaSelectionSchema, raw);
    return this.read(
      workspace,
      async (manager) => {
        const selected = await this.selected(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.taskId,
          input.runId,
          true,
        );
        const state = this.stateValue(
          workspace,
          memberId,
          userWorkspaceId,
          selected,
        );
        const { report } = selected;
        return {
          ...state,
          input: {
            ...this.identity(
              workspace,
              memberId,
              userWorkspaceId,
              selected.scope,
            ),
            taskId: input.taskId,
            taskRevision: state.taskRevision,
            projectId: report.projectId,
            creativeVersion: report.input.creativeVersion,
            briefVersion: report.input.briefVersion,
            brief: report.input.brief,
            asset: report.input.asset,
            references: report.input.references,
            modelId: report.input.modelId,
            manualTranscript: report.input.manualTranscript,
            sourceFingerprint: report.input.sourceFingerprint,
            preparationFingerprint: report.input.preparationFingerprint,
            preparation: report.input.preparation,
            maximumCostUsd: null,
            pricingRevision: report.pricingRevision,
            budgetReady: false,
            blockedReason:
              'Saved evidence is historical. Preview a new check to verify current access and spending.',
          },
          result: report.result,
          completedAt: report.completedAt?.toISOString() ?? null,
        };
      },
      transactionManager,
    );
  }
  async receipt(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryVideoQaReceiptDTO> {
    const input = parseVideoQa(videoQaReceiptSchema, raw);
    return this.read(
      workspace,
      async (manager) => {
        const scope = await this.source(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.taskId,
        );
        const report = await manager
          .getRepository(DeliveryVideoQaReportEntity)
          .createQueryBuilder('report')
          .where(
            'report."workspaceId"=:workspaceId AND report."taskId"=:taskId AND (report."requestId"=:requestId OR report."cancelRequestId"=:requestId)',
            {
              workspaceId: workspace.id,
              taskId: input.taskId,
              requestId: input.requestId,
            },
          )
          .getOne();
        if (!report)
          throw new NotFoundException(
            'No committed video QA command was found for this request.',
          );
        this.assertRunAccess(scope, report);
        const cancellation = report.cancellation?.requestId === input.requestId;
        const actorId = cancellation
          ? report.cancellation!.actorId
          : report.initiatorId;
        const membership = cancellation
          ? report.cancellation!.userWorkspaceId
          : report.userWorkspaceId;
        if (actorId !== memberId || membership !== userWorkspaceId)
          throw new NotFoundException(
            'This command belongs to another requester.',
          );
        return this.receiptValue(
          workspace,
          memberId,
          userWorkspaceId,
          scope,
          report,
          this.run(scope, report),
          cancellation ? 'CANCELLED' : 'STARTED',
        );
      },
      transactionManager,
    );
  }
  async cancel(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ): Promise<DeliveryVideoQaReceiptDTO> {
    const input = parseVideoQa(videoQaCancelSchema, raw);
    const inputHash = videoQaHash(input);
    return this.write(
      workspace.id,
      async (manager) => {
        const selected = await this.selected(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.taskId,
          input.runId,
        );
        const { scope, report, run } = selected;
        if (report.cancellation) {
          if (
            report.cancellation.requestId !== input.requestId ||
            report.cancellation.actorId !== memberId ||
            report.cancellation.userWorkspaceId !== userWorkspaceId ||
            report.cancellation.inputHash !== inputHash
          )
            throw new ConflictException(
              'The run already has a different cancellation command.',
            );
          return this.receiptValue(
            workspace,
            memberId,
            userWorkspaceId,
            scope,
            report,
            run,
            'CANCELLED',
          );
        }
        if (
          !this.stateValue(workspace, memberId, userWorkspaceId, selected)
            .canCancel
        )
          throw new ConflictException('The run ended or you cannot cancel it.');
        if (
          await manager.getRepository(DeliveryVideoQaReportEntity).findOneBy({
            workspaceId: workspace.id,
            requestId: input.requestId,
          })
        )
          throw new ConflictException(
            'Request identity already belongs to a start command.',
          );
        if (
          await manager.getRepository(DeliveryVideoQaReportEntity).findOneBy({
            workspaceId: workspace.id,
            cancelRequestId: input.requestId,
          })
        )
          throw new ConflictException(
            'Request identity already belongs to a cancellation.',
          );
        const previousStatus = run.status;
        await this.budget.stop(
          manager,
          {
            workspaceId: workspace.id,
            sourceKind: 'MEDIA',
            sourceRunId: run.id,
          },
          true,
        );
        run.status = 'CANCELLED';
        run.updatedAt = new Date().toISOString();
        run.error =
          'Cancelled. An in-flight provider request may still be charged; its result will be discarded.';
        report.cancellation = {
          requestId: input.requestId,
          inputHash,
          actorId: memberId,
          userWorkspaceId,
          at: run.updatedAt,
        };
        await manager.getRepository(DeliveryVideoQaReportEntity).update(
          { workspaceId: workspace.id, id: report.id },
          {
            cancelRequestId: input.requestId,
            cancellation: report.cancellation,
          },
        );
        scope.task.revision++;
        await manager.getRepository(DeliveryTaskEntity).save(scope.task);
        await this.activity(
          manager,
          workspace.id,
          scope,
          { ...run, initiatorId: memberId },
          'CANCELLED',
          previousStatus,
        );
        return this.receiptValue(
          workspace,
          memberId,
          userWorkspaceId,
          scope,
          report,
          run,
          'CANCELLED',
        );
      },
      transactionManager,
    );
  }

  async executeClaimed(
    workspace: WorkspaceEntity,
    taskId: string,
    claimed: DeliveryMediaRun,
  ) {
    const reference = {
      workspaceId: workspace.id,
      sourceKind: 'MEDIA' as const,
      sourceRunId: claimed.id,
    };
    let artifactsWritten = false;
    const verify = async (manager: EntityManager) => {
      const selected = await this.selected(
        manager,
        workspace,
        claimed.initiatorId,
        claimed.userWorkspaceId,
        taskId,
        claimed.id,
      );
      this.assertCanStart(selected.scope, claimed.modelId, workspace);
      if (
        selected.run.status !== 'RUNNING' ||
        !this.current(selected.scope, selected.report.input)
      )
        throw new ConflictException(
          'Video evidence, access or production changed.',
        );
      return selected;
    };
    try {
      const initial = await this.read(workspace, verify);
      const snapshot = initial.report.input;
      const video = await this.bytes(
        this.assetPath(workspace.id, taskId, snapshot.asset.id),
        VIDEO_QA_MAX_SOURCE_BYTES,
      );
      if (videoQaBytesHash(video) !== snapshot.asset.sha256)
        throw new ConflictException('Video bytes changed.');
      const prepared = await this.adapter.prepare(video);
      const references: Buffer[] = [];
      for (const reference of snapshot.references) {
        const bytes = await this.bytes(
          this.assetPath(workspace.id, taskId, reference.id),
          6000000,
        );
        if (videoQaBytesHash(bytes) !== reference.sha256)
          throw new ConflictException('Product reference bytes changed.');
        references.push(await this.adapter.reference(bytes));
      }
      if (
        videoQaHash({
          preparation: prepared.preparation,
          references: references.map(videoQaBytesHash),
        }) !== snapshot.preparationFingerprint
      )
        throw new ConflictException(
          'Prepared evidence changed. Prepare a fresh request.',
        );
      const prompt = videoQaPrompt(snapshot);
      assertVideoQaRequestSize(prepared.proxy, references, prompt);
      await this.assertSourceBytes(workspace.id, snapshot);
      await this.read(workspace, verify);
      const driver = this.storage.getCurrentDriver();
      artifactsWritten = true;
      for (const frame of prepared.frames)
        await driver.writeFile({
          filePath: this.evidencePath(
            workspace.id,
            taskId,
            claimed.id,
            `frame-${frame.index}.jpg`,
          ),
          sourceFile: frame.bytes,
          mimeType: 'image/jpeg',
        });
      await driver.writeFile({
        filePath: this.evidencePath(
          workspace.id,
          taskId,
          claimed.id,
          'proxy.mp4',
        ),
        sourceFile: prepared.proxy,
        mimeType: 'video/mp4',
      });
      await this.write(workspace.id, async (manager) => {
        await verify(manager);
        await manager
          .getRepository(DeliveryVideoQaReportEntity)
          .update(
            { workspaceId: workspace.id, id: claimed.id },
            { artifactsReady: true },
          );
      });
      await this.budget.dispatch(
        reference,
        claimed.userWorkspaceId,
        async (manager) => {
          await verify(manager);
        },
      );
      const model = this.registry.getModel(claimed.modelId);
      if (!model)
        throw new ConflictException('The selected model is unavailable.');
      const response = await generateText({
        model: model.model,
        system: VIDEO_QA_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'file', data: prepared.proxy, mediaType: 'video/mp4' },
              ...references.map((bytes) => ({
                type: 'image' as const,
                image: bytes,
                mediaType: 'image/jpeg',
              })),
              { type: 'text', text: prompt },
            ],
          },
        ],
        output: Output.object({ schema: videoQaOutputSchema }),
        maxOutputTokens: VIDEO_QA_MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(180000),
        providerOptions: {
          google: {
            audioTimestamp: true,
            mediaResolution: 'MEDIA_RESOLUTION_HIGH',
          },
        },
      });
      const usage = usageFromAiSdk(response.usage);
      // This request creates no cache; implicit cache reads remain provider-reported.
      await this.budget.settle(
        reference,
        usage
          ? { ...usage, cacheWriteTokens: usage.cacheWriteTokens ?? 0 }
          : null,
      );
      await this.assertSourceBytes(workspace.id, snapshot);
      const result = validateVideoQaOutput(response.output, snapshot);
      await this.write(workspace.id, async (manager) => {
        const selected = await verify(manager);
        if (selected.report.completedAt !== null)
          throw new ConflictException('Video QA result was already recorded.');
        await manager
          .getRepository(DeliveryVideoQaReportEntity)
          .update(
            { workspaceId: workspace.id, id: claimed.id },
            { result, completedAt: new Date() },
          );
        selected.run.status = 'SUCCEEDED';
        selected.run.updatedAt = new Date().toISOString();
        selected.scope.task.revision++;
        await manager
          .getRepository(DeliveryTaskEntity)
          .save(selected.scope.task);
        await this.activity(
          manager,
          workspace.id,
          selected.scope,
          selected.run,
          'SUCCEEDED',
          'RUNNING',
        );
      });
    } catch (error) {
      const usage = usageFromAiError(error);
      if (usage)
        await this.budget.settle(reference, {
          ...usage,
          cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        });
      await this.budget.fail(reference);
      await this.write(workspace.id, async (manager) => {
        const task = await manager
          .getRepository(DeliveryTaskEntity)
          .findOneBy({ workspaceId: workspace.id, taskId });
        const run = task?.details.creative?.mediaRuns?.find(
          (run) => run.id === claimed.id,
        );
        if (!task || !run || run.status !== 'RUNNING') return;
        run.status = 'FAILED';
        run.updatedAt = new Date().toISOString();
        run.error =
          'Video QA could not publish a usable result. Source/access changes, invalid output or provider failures require a new reviewed request; uncertain usage remains held.';
        task.revision++;
        await manager.getRepository(DeliveryTaskEntity).save(task);
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: claimed.initiatorId,
          actorType: 'AGENT',
          category: 'CREATIVE',
          sourceType: 'creative',
          sourceId: taskId,
          taskId,
          projectId: task.projectId,
          action: 'MEDIA_FAILED',
          outcome: 'FAILED',
          summary:
            'Video QA ended without a usable result. Human final review remains required.',
          changes: [
            { field: 'mediaRunId', before: null, after: claimed.id },
            { field: 'mediaKind', before: null, after: 'VIDEO_QA' },
            { field: 'runStatus', before: 'RUNNING', after: 'FAILED' },
          ],
        });
      });
      if (artifactsWritten) {
        const report = await this.dataSource
          .getRepository(DeliveryVideoQaReportEntity)
          .findOneBy({ workspaceId: workspace.id, id: claimed.id });
        if (!report?.artifactsReady)
          await this.storage.getCurrentDriver().delete({
            folderPath: this.evidencePath(workspace.id, taskId, claimed.id, ''),
          });
      }
    }
  }
  async evidence(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
    runId: string,
    file: string,
  ) {
    parseVideoQa(videoQaSelectionSchema, { taskId, runId });
    if (file !== 'proxy.mp4' && !/^frame-(0|[1-9]\d{0,2})\.jpg$/.test(file))
      throw new NotFoundException();
    const captured = await this.read(workspace, async (manager) => {
      const selected = await this.selected(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        taskId,
        runId,
      );
      if (!selected.report.artifactsReady)
        throw new NotFoundException('Evidence is not available.');
      const frame = selected.report.input.preparation.frames.find(
        (frame) => file === `frame-${frame.index}.jpg`,
      );
      if (file !== 'proxy.mp4' && !frame) throw new NotFoundException();
      return {
        hash: frame?.sha256 ?? selected.report.input.preparation.proxySha256,
        size: frame?.size ?? selected.report.input.preparation.proxyBytes,
      };
    });
    const bytes = await this.bytes(
      this.evidencePath(workspace.id, taskId, runId, file),
      captured.size,
    );
    if (
      bytes.length !== captured.size ||
      videoQaBytesHash(bytes) !== captured.hash
    )
      throw new ConflictException(
        'Stored QA evidence no longer matches its recorded fingerprint.',
      );
    await this.read(workspace, async (manager) => {
      await this.selected(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        taskId,
        runId,
      );
    });
    return {
      bytes,
      mimeType: file === 'proxy.mp4' ? 'video/mp4' : 'image/jpeg',
    };
  }
}
