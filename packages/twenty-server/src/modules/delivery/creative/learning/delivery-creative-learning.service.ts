import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import { v4 } from 'uuid';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import {
  creativeReviewTarget,
  CREATIVE_REVIEW_SOURCE_LIMIT,
} from 'src/modules/delivery/creative/review/delivery-creative-review.policy';
import { type AdvertisingSourceEnvelope } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.types';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import {
  DeliveryAdvertisingSourcesService,
  SOURCE_CTE,
  type SourceScope,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.service';
import {
  META_REPORTS_SQL,
  META_REPORT_SCOPE_SQL,
  metaReportScopeValues,
} from 'src/modules/delivery/advertising/delivery-meta-report-store';
import { type MetaInsightRow } from 'src/modules/delivery/advertising/delivery-meta.types';
import {
  advertisingMoneyMicros,
  metaAdvertisingBaseMetric,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-metrics';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { videoQaBytesHash } from 'src/modules/delivery/creative/video-qa/delivery-video-qa.policy';
import { DeliveryCreativeAdLinkEntity } from './entities/delivery-creative-ad-link.entity';
import { DeliveryCreativeAdVersionEntity } from './entities/delivery-creative-ad-version.entity';
import { DeliveryCreativeLearningEventEntity } from './entities/delivery-creative-learning-event.entity';
import { DeliveryCreativeLessonEntity } from './entities/delivery-creative-lesson.entity';
import {
  type CreativeAdLinkBody,
  type CreativeAdLinkPreview,
  creativeAdLinkChoicesSchema,
  creativeAdLinkDecisionSchema,
  creativeAdLinkPreviewSchema,
  creativeAdLinkSaveSchema,
  creativeAdLinkSelectionSchema,
  creativeAdLinkStateSchema,
  creativeAdLinksSchema,
  creativeLearningReceiptSchema,
  creativeLessonSaveSchema,
  creativeLessonsSchema,
} from './delivery-creative-learning.types';
import {
  assertCreativeLearningClient,
  CREATIVE_LEARNING_PAGE_SIZE,
  creativeAdEditableBody,
  creativeAdPreviewFingerprint,
  creativeLessonEvidenceComparable,
  eligibleCreativeLearningComponents,
  creativeLearningChoiceCursor,
  parseCreativeLearning,
  readCreativeLearningChoiceCursor,
} from './delivery-creative-learning.policy';
import {
  type DeliveryCreativeAdChoiceDTO,
  type DeliveryCreativeAdSelectedChoiceDTO,
} from './delivery-creative-learning.dto';

type LearningActor = Awaited<ReturnType<DeliveryService['actor']>>;
type LinkRow = DeliveryCreativeAdLinkEntity & {
  bodyFingerprint: string;
  lastEditorId: string;
  correctedById: string | null;
  adName: string;
  taskTitle: string;
  accountId: string | null;
  fromDate: string;
  throughDate: string;
  concept: string | null;
  goalLabel: string | null;
};
const CHANGEABLE = ['DRAFT', 'CHANGES_REQUESTED'];
@Injectable()
export class DeliveryCreativeLearningService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly creative: DeliveryCreativeService,
    private readonly sources: DeliveryAdvertisingSourcesService,
    private readonly storage: FileStorageDriverFactory,
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
      throw new Error('Learning writes require an active transaction.');
    try {
      return transactionManager
        ? await execute(transactionManager)
        : await this.dataSource.transaction(execute);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: unknown }).code === '23505'
      )
        throw new ConflictException(
          'This identity or correction already belongs to another learning command. Check its committed receipt.',
        );
      throw error;
    }
  }
  private identity(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    actor: LearningActor,
  ) {
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      actor,
      observedAt: new Date().toISOString(),
    };
  }
  private schema(workspace: WorkspaceEntity) {
    if (
      !workspace.databaseSchema ||
      !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
    )
      throw new NotFoundException();
    return `"${workspace.databaseSchema}"`;
  }
  private async name(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
  ) {
    const rows: { name: string }[] = await manager.query(
      `SELECT trim(concat_ws(' ',"nameFirstName","nameLastName")) AS name FROM ${this.schema(workspace)}."workspaceMember" WHERE id=$1`,
      [memberId],
    );
    return rows[0]?.name || 'Former teammate';
  }
  private async project(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    actor: LearningActor,
    projectId: string,
  ) {
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: projectId });
    if (
      !project ||
      (!actor.isManager && !project.memberIds.includes(actor.memberId))
    )
      throw new NotFoundException('This creative project is unavailable.');
    return project;
  }
  private async assertOriginalSource(
    manager: EntityManager,
    workspaceId: string,
    source: { id: string; projectId: string | null; companyId: string | null },
  ) {
    const conflicts: { id: string }[] = await manager.query(
      `SELECT id FROM core."deliveryCreativeAdLink" WHERE "workspaceId"=$1 AND "sourceId"=$2 AND state IN ('REVIEWED','RETRACTED') AND ("companyId" IS DISTINCT FROM $3::uuid OR "sourceProjectId" IS DISTINCT FROM $4::uuid) LIMIT 1`,
      [workspaceId, source.id, source.companyId, source.projectId],
    );
    if (conflicts.length)
      throw new ForbiddenException(
        'A reviewed association pins this report to another original client/project. Its evidence cannot be reassigned to the current client.',
      );
  }
  private visibleSql(workspace: WorkspaceEntity) {
    return `${SOURCE_CTE}, visible_link_base AS NOT MATERIALIZED (
      SELECT link.*,version."createdBy" AS "lastEditorId",version.body->>'previewFingerprint' AS "bodyFingerprint",
        COALESCE(version.body->>'adName','') AS "adName",native.title AS "taskTitle",version.body->'source'->>'accountId' AS "accountId",
        version.body->'source'->>'fromDate' AS "fromDate",version.body->'source'->>'throughDate' AS "throughDate",
        version.body->'submittedLearning'->>'concept' AS concept,version.body->'goalSnapshot'->>'metricLabel' AS "goalLabel"
      FROM core."deliveryCreativeAdLink" link
      JOIN core."deliveryCreativeAdVersion" version ON version."workspaceId"=$1 AND version."linkId"=link.id AND version.version=link."currentVersion"
      JOIN core."deliveryProject" project ON project."workspaceId"=$1 AND project.id=link."projectId"
      JOIN core."deliveryTask" task ON task."workspaceId"=$1 AND task."taskId"=link."taskId"
      JOIN ${this.schema(workspace)}.task native ON native.id=link."taskId" AND native."deletedAt" IS NULL
      JOIN visible_sources source ON source.kind='META' AND source.id=link."sourceId" AND source."projectId"=link."sourceProjectId"
      JOIN core."deliveryProject" source_project ON source_project."workspaceId"=$1 AND source_project.id=link."sourceProjectId"
      WHERE link."workspaceId"=$1 AND ($3::boolean OR project."memberIds" ? $4::text)
        AND ($2::boolean OR (task."projectId"=link."projectId" AND project."companyId" IS NOT DISTINCT FROM link."companyId" AND source_project."companyId" IS NOT DISTINCT FROM link."companyId"))
        AND (link.state IN ('REVIEWED','RETRACTED') OR $3::boolean OR link."createdBy"=$4::uuid)
    ), visible_links AS NOT MATERIALIZED (SELECT base.*,(SELECT correction.id FROM visible_link_base correction WHERE correction."correctsId"=base.id AND correction.state='REVIEWED') AS "correctedById" FROM visible_link_base base)`;
  }
  private summary(link: LinkRow) {
    return {
      id: link.id,
      projectId: link.projectId,
      sourceId: link.sourceId,
      adId: link.adId,
      adName: link.adName,
      taskTitle: link.taskTitle,
      accountId: link.accountId,
      fromDate: link.fromDate,
      throughDate: link.throughDate,
      concept: link.concept,
      goalLabel: link.goalLabel,
      taskId: link.taskId,
      assetId: link.assetId,
      revision: link.revision,
      currentVersion: link.currentVersion,
      state: link.state,
      createdByName: link.createdByName,
      createdAt: new Date(link.createdAt).toISOString(),
      reviewedVersion: link.reviewedVersion,
      reviewedByName: link.reviewedByName,
      correctsId: link.correctsId,
      correctedById: link.correctedById,
      fingerprint: advertisingHash([
        link.id,
        link.revision,
        link.state,
        link.currentVersion,
        link.bodyFingerprint,
        link.reviewedBy,
        link.reviewedAt ? new Date(link.reviewedAt).toISOString() : null,
        link.correctedById,
      ]),
    };
  }
  private async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return this.sources.scope(manager, workspace, memberId, userWorkspaceId);
  }
  private async selected(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    id: string,
  ) {
    const scope = await this.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
    );
    const rows: LinkRow[] = await manager.query(
      `${this.visibleSql(workspace)} SELECT * FROM visible_links WHERE id=$6`,
      [...metaReportScopeValues(scope.meta), id],
    );
    if (!rows[0])
      throw new NotFoundException(
        'This association is unavailable under your current source access.',
      );
    const link = rows[0];
    const version = await manager
      .getRepository(DeliveryCreativeAdVersionEntity)
      .findOneByOrFail({
        workspaceId: workspace.id,
        linkId: id,
        version: link.currentVersion,
      });
    return { scope, link, version };
  }
  private async approvedChoice(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    source: Pick<AdvertisingSourceEnvelope, 'source' | 'actor'>,
    input: Pick<
      CreativeAdLinkPreview,
      'projectId' | 'taskId' | 'submissionVersion' | 'assetId'
    >,
  ) {
    const creative = await this.creative.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      input.taskId,
    );
    const project = await this.project(
      manager,
      workspace,
      source.actor,
      input.projectId,
    );
    if (creative.task.projectId !== project.id)
      throw new ForbiddenException(
        'Choose creative from the selected project.',
      );
    assertCreativeLearningClient(
      project.id,
      project.companyId,
      source.source.projectId,
      source.source.companyId,
    );
    if (
      (creative.task.details.creative?.assets.length ?? 0) > 200 ||
      creative.task.details.submissions.length > CREATIVE_REVIEW_SOURCE_LIMIT
    )
      throw new BadRequestException(
        'This selected production exceeds the complete approved creative evidence limits.',
      );
    const submissions = creative.task.details.submissions.filter(
      (submission) => submission.version === input.submissionVersion,
    );
    const submission = submissions.length === 1 ? submissions[0] : null;
    if (
      !submission ||
      submission.decision !== 'APPROVED' ||
      !submission.reviewedBy ||
      submission.reviewedBy === submission.submittedBy ||
      submission.finalAssetId !== input.assetId
    )
      throw new BadRequestException(
        'Choose one exact independently approved submitted creative version.',
      );
    const target = creativeReviewTarget(input.taskId, creative.task.details, {
      targetKind: 'SUBMISSION',
      submissionVersion: input.submissionVersion,
      assetId: input.assetId,
    });
    if (
      target.availability !== 'AVAILABLE' ||
      !target.asset ||
      !target.targetToken
    )
      throw new ConflictException(
        'The exact approved final media is unavailable.',
      );
    const submittedLearning = submission.creativeLearning ?? null;
    if (!submittedLearning && project.id !== source.source.projectId)
      throw new ForbiddenException(
        'Legacy creative lacks a frozen client anchor and can only be associated within its same project.',
      );
    if (
      submittedLearning &&
      (submittedLearning.finalAssetId !== input.assetId ||
        submittedLearning.creativeVersion !== submission.creativeVersion)
    )
      throw new ConflictException(
        'The frozen submission learning identity is inconsistent.',
      );
    if (
      submittedLearning &&
      (submittedLearning.projectId !== project.id ||
        submittedLearning.companyId !== project.companyId)
    )
      throw new ForbiddenException(
        'The approved creative belongs to its original submitted client/project context. It cannot be reused as evidence for a newly linked client.',
      );
    return {
      creative,
      project,
      submission: { ...submission, reviewedBy: submission.reviewedBy },
      submittedLearning,
      target: {
        ...target,
        asset: target.asset,
        targetToken: target.targetToken,
      },
    };
  }
  private async factual(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: CreativeAdLinkPreview,
  ) {
    const source = await this.sources.read(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      { kind: 'META', id: input.sourceId },
      0,
      input.adId,
    );
    await this.assertOriginalSource(manager, workspace.id, source.source);
    const { creative, project, submission, target, submittedLearning } =
      await this.approvedChoice(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        source,
        input,
      );
    if (
      input.goal.provenance === 'REPORT' &&
      input.goal.metricAdId !== input.adId
    )
      throw new BadRequestException(
        'A provider outcome must belong to this exact imported ad, not account totals or another ad.',
      );
    const goalSnapshot = this.sources.validateGoal(source, input.goal);
    const rows: { row: MetaInsightRow }[] = await manager.query(
      `${META_REPORTS_SQL} SELECT item.value AS row FROM reports r,jsonb_array_elements(r.report->'ads') item(value) WHERE ${META_REPORT_SCOPE_SQL} AND r.id=$6 AND item.value->>'ad_id'=$7 LIMIT 2`,
      [
        ...metaReportScopeValues(
          (await this.scope(manager, workspace, memberId, userWorkspaceId))
            .meta,
        ),
        input.sourceId,
        input.adId,
      ],
    );
    if (rows.length !== 1)
      throw new ConflictException(
        'The exact imported ad is missing or ambiguous.',
      );
    const components: CreativeAdLinkBody['components'] = (
      submittedLearning?.components ?? []
    ).map((component) => ({ ...component, provenance: 'ASSEMBLY_RUN' }));
    const eligible = eligibleCreativeLearningComponents(
      creative.task.details.creative!,
      target.asset,
      components,
    );
    for (const declaration of input.declaredComponents) {
      if (components.some((component) => component.role === declaration.role))
        throw new BadRequestException(
          'Do not replace a proven component with a human declaration.',
        );
      const asset = creative.task.details.creative?.assets.find(
        (asset) => asset.id === declaration.assetId,
      );
      if (
        !asset ||
        asset.kind !== declaration.role ||
        asset.storageState !== 'READY' ||
        asset.briefVersion !== target.asset.briefVersion ||
        asset.productionVersion !== target.asset.productionVersion ||
        !eligible.some(
          (candidate) =>
            candidate.assetId === asset.id &&
            candidate.role === declaration.role,
        )
      )
        throw new BadRequestException(
          'Declared components need an approved matching-role asset from this production and brief.',
        );
      components.push({
        role: declaration.role,
        assetId: asset.id,
        name: asset.name,
        briefVersion: asset.briefVersion,
        productionVersion: asset.productionVersion,
        assemblyVersion: asset.assemblyVersion,
        shotId: asset.shotId,
        shotVersion: asset.shotVersion,
        provenance: 'HUMAN_DECLARED',
      });
    }
    if (
      input.declaredCopy !== null &&
      submittedLearning?.copyText !== null &&
      submittedLearning?.copyText !== undefined
    )
      throw new BadRequestException(
        'Keep the submitted copy snapshot; a different copy needs explicit new creative submission evidence.',
      );
    if (input.correctsId) {
      const previous = await this.selected(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.correctsId,
      );
      if (
        previous.link.state !== 'REVIEWED' ||
        previous.link.correctedById ||
        previous.link.projectId !== input.projectId ||
        previous.link.sourceId !== input.sourceId ||
        previous.link.adId !== input.adId
      )
        throw new ConflictException(
          'Correct the current reviewed association for this exact report/ad and creative project.',
        );
    }
    const body = {
      ...input,
      source: source.source,
      goalSnapshot,
      adName: rows[0].row.ad_name ?? '',
      adSpendMicros: advertisingMoneyMicros(
        metaAdvertisingBaseMetric(rows[0].row, 'spend').value,
      ),
      creativeTarget: target,
      submittedBy: submission.submittedBy,
      submittedByName: await this.name(
        manager,
        workspace,
        submission.submittedBy,
      ),
      approvedBy: submission.reviewedBy,
      approvedByName: await this.name(
        manager,
        workspace,
        submission.reviewedBy,
      ),
      approvedAt: submission.reviewedAt ?? null,
      submittedLearning,
      components,
      copyText: submittedLearning?.copyText ?? input.declaredCopy,
      copyProvenance:
        submittedLearning?.copyText !== null &&
        submittedLearning?.copyText !== undefined
          ? ('SUBMITTED_COPY' as const)
          : input.declaredCopy !== null
            ? ('HUMAN_DECLARED' as const)
            : ('UNKNOWN' as const),
      warnings: [
        ...(!submittedLearning
          ? [
              'LEGACY_SUBMISSION_LEARNING_MISSING',
              'LEGACY_HISTORICAL_CLIENT_UNKNOWN',
            ]
          : []),
        ...(!components.length ? ['COMPONENTS_UNKNOWN'] : []),
        ...(components.some(
          (component) => component.provenance === 'HUMAN_DECLARED',
        )
          ? ['COMPONENTS_HUMAN_DECLARED']
          : []),
        'HUMAN_ASSOCIATION_NOT_PROVIDER_VERIFIED',
        'EXACT_REPORT_WINDOW_ONLY',
        ...(source.source.sourceStatus !== 'APPROVED'
          ? ['SOURCE_REPORT_REVIEW_REQUIRED']
          : []),
      ],
    };
    return { scope: source, project, body };
  }
  private async prepare(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: CreativeAdLinkPreview,
    transactionManager?: EntityManager,
  ): Promise<CreativeAdLinkBody> {
    const captured = await this.read(
      workspace,
      (manager) =>
        this.factual(manager, workspace, memberId, userWorkspaceId, input),
      transactionManager,
    );
    const asset = captured.body.creativeTarget.asset!;
    const assetSha256 = await this.hashAsset(
      workspace,
      input.taskId,
      input.assetId,
      asset.size,
    );
    const latest = await this.read(
      workspace,
      (manager) =>
        this.factual(manager, workspace, memberId, userWorkspaceId, input),
      transactionManager,
    );
    if (advertisingHash(captured.body) !== advertisingHash(latest.body))
      throw new ConflictException(
        'Creative/ad evidence changed while checking the final media. Preview again.',
      );
    const body = {
      ...latest.body,
      assetSha256,
      assetHashCapturedAt: new Date().toISOString(),
    };
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 128000)
      throw new BadRequestException(
        'The complete association evidence exceeds128 kB. Use a bounded submitted copy/evidence source; nothing was silently shortened.',
      );
    return { ...body, previewFingerprint: creativeAdPreviewFingerprint(body) };
  }
  private async hashAsset(
    workspace: WorkspaceEntity,
    taskId: string,
    assetId: string,
    expectedSize: number,
  ) {
    const stream = await this.storage.getCurrentDriver().readFile({
      filePath: `${workspace.id}/delivery-creative/${taskId}/${assetId}`,
    });
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > 100 * 1024 * 1024) {
        stream.destroy();
        throw new BadRequestException(
          'Final asset exceeds the100 MiB association evidence bound.',
        );
      }
      chunks.push(bytes);
    }
    if (total !== expectedSize)
      throw new ConflictException(
        'Final media bytes changed or are unavailable.',
      );
    return videoQaBytesHash(Buffer.concat(chunks));
  }
  async preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    manager?: EntityManager,
  ) {
    const input = parseCreativeLearning(creativeAdLinkPreviewSchema, raw);
    const body = await this.prepare(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      manager,
    );
    return this.read(
      workspace,
      async (manager) => ({
        ...this.identity(
          workspace,
          memberId,
          userWorkspaceId,
          (await this.scope(manager, workspace, memberId, userWorkspaceId))
            .actor,
        ),
        body,
      }),
      manager,
    );
  }
  async choices(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCreativeLearning(creativeAdLinkChoicesSchema, raw);
    return this.read(
      workspace,
      async (manager) => {
        const source = await this.sources.read(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          { kind: 'META', id: input.sourceId },
          0,
          input.adId,
        );
        await this.assertOriginalSource(manager, workspace.id, source.source);
        const project = await this.project(
          manager,
          workspace,
          source.actor,
          input.projectId,
        );
        assertCreativeLearningClient(
          project.id,
          project.companyId,
          source.source.projectId,
          source.source.companyId,
        );
        let selected: DeliveryCreativeAdSelectedChoiceDTO | null = null;
        const selectionWarnings: string[] = [];
        if (
          input.selectedTaskId &&
          input.selectedSubmissionVersion &&
          input.selectedAssetId
        ) {
          try {
            const choice = await this.approvedChoice(
              manager,
              workspace,
              memberId,
              userWorkspaceId,
              source,
              {
                projectId: input.projectId,
                taskId: input.selectedTaskId,
                submissionVersion: input.selectedSubmissionVersion,
                assetId: input.selectedAssetId,
              },
            );
            const provenComponents = (
              choice.submittedLearning?.components ?? []
            ).map((component) => ({
              ...component,
              provenance: 'ASSEMBLY_RUN',
            }));
            selected = {
              taskId: input.selectedTaskId,
              submissionVersion: input.selectedSubmissionVersion,
              assetId: input.selectedAssetId,
              components: eligibleCreativeLearningComponents(
                choice.creative.task.details.creative!,
                choice.target.asset,
                provenComponents,
              ),
              provenComponents,
              hasSubmittedCopy:
                choice.submittedLearning?.copyText !== null &&
                choice.submittedLearning?.copyText !== undefined,
            };
          } catch (error) {
            if (
              !(error instanceof BadRequestException) &&
              !(error instanceof ConflictException)
            )
              throw error;
            selectionWarnings.push('SELECTED_CREATIVE_UNAVAILABLE');
          }
        }
        const values: unknown[] = [
          workspace.id,
          input.projectId,
          source.source.projectId,
        ];
        const candidates = `WITH candidates AS (
        SELECT task."taskId",native.title,(submission.value->>'version')::int AS "submissionVersion",submission.value->>'finalAssetId' AS "assetId",asset.value->>'name' AS "assetName",(submission.value->>'creativeVersion')::int AS "creativeVersion"
        FROM core."deliveryTask" task JOIN ${this.schema(workspace)}.task native ON native.id=task."taskId" AND native."deletedAt" IS NULL JOIN core."deliveryProject" project ON project."workspaceId"=$1 AND project.id=task."projectId",
          jsonb_array_elements(COALESCE(task.details->'submissions','[]'::jsonb)) submission(value),jsonb_array_elements(COALESCE(task.details->'creative'->'assets','[]'::jsonb)) asset(value)
        WHERE task."workspaceId"=$1 AND task."projectId"=$2 AND submission.value->>'decision'='APPROVED'
          AND submission.value->>'reviewedBy' IS NOT NULL AND submission.value->>'reviewedBy'<>submission.value->>'submittedBy'
          AND submission.value->>'version' ~ '^[1-9][0-9]{0,8}$' AND submission.value->>'creativeVersion' ~ '^[1-9][0-9]{0,8}$'
          AND submission.value->>'finalAssetId' ~ '^[a-fA-F0-9-]{36}$' AND asset.value->>'id'=submission.value->>'finalAssetId'
          AND asset.value->>'kind'='FINAL' AND asset.value->>'storageState'='READY'
          AND (submission.value->'creativeLearning' IS NULL OR (submission.value->'creativeLearning'->>'projectId'=task."projectId"::text AND submission.value->'creativeLearning'->>'companyId' IS NOT DISTINCT FROM project."companyId"::text))
          AND (task."projectId"=$3::uuid OR submission.value->'creativeLearning' IS NOT NULL)
      )`;
        const [count]: { totalCount: number; fingerprint: string }[] =
          await manager.query(
            `${candidates} SELECT count(*)::int AS "totalCount",md5(COALESCE(string_agg("taskId"::text||':'||"submissionVersion"::text||':'||"assetId",'|' ORDER BY "taskId","submissionVersion"),'')) AS fingerprint FROM candidates`,
            values,
          );
        const scope = advertisingHash([
          workspace.id,
          memberId,
          userWorkspaceId,
          source.actor.roleIds.slice().sort(),
          source.actor.capabilities.slice().sort(),
          input.sourceId,
          input.adId,
          source.fingerprint,
          project.id,
          project.revision,
          count.fingerprint,
        ]);
        const after = readCreativeLearningChoiceCursor(input.after, scope);
        const items: DeliveryCreativeAdChoiceDTO[] = await manager.query(
          `${candidates} SELECT * FROM candidates WHERE ($4::uuid IS NULL OR ("taskId","submissionVersion")>($4::uuid,$5::int)) ORDER BY "taskId","submissionVersion" LIMIT $6`,
          [
            ...values,
            after?.taskId ?? null,
            after?.submissionVersion ?? null,
            CREATIVE_LEARNING_PAGE_SIZE + 1,
          ],
        );
        const page = items.slice(0, CREATIVE_LEARNING_PAGE_SIZE);
        const last = page[page.length - 1];
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, source.actor),
          items: page,
          selected,
          selectionWarnings,
          totalCount: count.totalCount,
          nextCursor:
            items.length > CREATIVE_LEARNING_PAGE_SIZE && last
              ? creativeLearningChoiceCursor(
                  scope,
                  last.taskId,
                  last.submissionVersion,
                )
              : null,
        };
      },
      transactionManager,
    );
  }
  async list(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCreativeLearning(creativeAdLinksSchema, raw);
    return this.read(
      workspace,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        await this.project(manager, workspace, scope.actor, input.projectId);
        const values = [
          ...metaReportScopeValues(scope.meta),
          input.projectId,
          input.status ?? null,
          input.assetId ?? null,
          input.sourceId ?? null,
          input.adId ?? null,
        ];
        const where = `"projectId"=$6 AND ($7::text IS NULL OR state=$7) AND ($8::uuid IS NULL OR "assetId"=$8) AND ($9::uuid IS NULL OR "sourceId"=$9) AND ($10::text IS NULL OR "adId"=$10)`;
        const [totals]: { count: number }[] = await manager.query(
          `${this.visibleSql(workspace)} SELECT count(*)::int AS count FROM visible_links WHERE ${where}`,
          values,
        );
        const rows: LinkRow[] = await manager.query(
          `${this.visibleSql(workspace)} SELECT * FROM visible_links WHERE ${where} AND ($11::uuid IS NULL OR id>$11) ORDER BY id LIMIT $12`,
          [...values, input.afterId ?? null, CREATIVE_LEARNING_PAGE_SIZE + 1],
        );
        const page = rows.slice(0, CREATIVE_LEARNING_PAGE_SIZE);
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, scope.actor),
          items: page.map((link) => this.summary(link)),
          totalCount: totals.count,
          nextCursor:
            rows.length > CREATIVE_LEARNING_PAGE_SIZE
              ? page[page.length - 1].id
              : null,
        };
      },
      transactionManager,
    );
  }
  private async stateValue(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    selected: Awaited<ReturnType<DeliveryCreativeLearningService['selected']>>,
  ) {
    const { scope, link, version } = selected;
    let sourceCurrent = false;
    let anchorsCurrent = false;
    const warnings = [...version.body.warnings];
    try {
      const source = await this.sources.read(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        { kind: 'META', id: link.sourceId },
        0,
        null,
        true,
      );
      const creative = await this.creative.scope(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        link.taskId,
      );
      const target = creativeReviewTarget(link.taskId, creative.task.details, {
        targetKind: 'SUBMISSION',
        submissionVersion: version.body.submissionVersion,
        assetId: link.assetId,
      });
      const project = await manager
        .getRepository(DeliveryProjectEntity)
        .findOneBy({ workspaceId: workspace.id, id: creative.task.projectId });
      anchorsCurrent =
        source.source.companyId === link.companyId &&
        source.source.projectId === link.sourceProjectId &&
        creative.task.projectId === link.projectId &&
        project?.companyId === link.companyId;
      sourceCurrent =
        anchorsCurrent &&
        source.fingerprint === version.body.source.fingerprint &&
        target.targetToken === version.body.creativeTarget.targetToken;
    } catch {
      sourceCurrent = false;
    }
    const canEdit =
      anchorsCurrent &&
      CHANGEABLE.includes(link.state) &&
      (scope.actor.isManager || link.createdBy === memberId);
    const independent =
      scope.actor.isManager &&
      link.createdBy !== memberId &&
      version.createdBy !== memberId;
    if (!sourceCurrent) warnings.push('SOURCE_METADATA_CHANGED');
    if (link.correctedById) warnings.push('ASSOCIATION_CORRECTED');
    return {
      ...this.identity(workspace, memberId, userWorkspaceId, scope.actor),
      link: this.summary(link),
      canEdit,
      canSubmit: canEdit && sourceCurrent,
      canReview:
        independent &&
        link.state === 'SUBMITTED' &&
        sourceCurrent &&
        version.body.source.sourceStatus === 'APPROVED',
      canRequestChanges: independent && link.state === 'SUBMITTED',
      canRetract: scope.actor.isManager && link.state === 'REVIEWED',
      sourceCurrent,
      warnings,
    };
  }
  async state(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCreativeLearning(creativeAdLinkStateSchema, raw);
    return this.read(
      workspace,
      async (manager) =>
        this.stateValue(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          await this.selected(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            input.id,
          ),
        ),
      transactionManager,
    );
  }
  private eventValue(event: DeliveryCreativeLearningEventEntity) {
    return {
      requestId: event.requestId,
      linkId: event.linkId,
      lessonId: event.lessonId,
      action: event.action,
      revision: event.revision,
      version: event.version,
      state: event.state,
      actorName: event.actorName,
      note: event.note,
      createdAt: new Date(event.createdAt).toISOString(),
    };
  }
  async detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCreativeLearning(creativeAdLinkSelectionSchema, raw);
    return this.read(
      workspace,
      async (manager) => {
        const selected = await this.selected(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.id,
        );
        const versionNumber = input.version ?? selected.link.currentVersion;
        const privateHistory =
          selected.scope.actor.isManager ||
          selected.link.createdBy === memberId;
        if (!privateHistory && versionNumber !== selected.link.reviewedVersion)
          throw new NotFoundException('This draft version is private.');
        const version =
          versionNumber === selected.link.currentVersion
            ? selected.version
            : await manager
                .getRepository(DeliveryCreativeAdVersionEntity)
                .findOneBy({
                  workspaceId: workspace.id,
                  linkId: input.id,
                  version: versionNumber,
                });
        if (!version)
          throw new NotFoundException(
            'Exact association version was not found.',
          );
        if (input.afterEventId) {
          const [anchor]: { allowed: boolean }[] = await manager.query(
            `SELECT EXISTS(SELECT 1 FROM core."deliveryCreativeLearningEvent" WHERE "workspaceId"=$1 AND "linkId"=$2 AND id=$3 AND ($4::boolean OR action IN ('REVIEW','RETRACT','LESSON'))) AS allowed`,
            [workspace.id, input.id, input.afterEventId, privateHistory],
          );
          if (!anchor.allowed)
            throw new BadRequestException(
              'Open the first history page for this association and current access.',
            );
        }
        const events: DeliveryCreativeLearningEventEntity[] =
          await manager.query(
            `SELECT event.* FROM core."deliveryCreativeLearningEvent" event WHERE event."workspaceId"=$1 AND event."linkId"=$2 AND ($3::boolean OR event.action IN ('REVIEW','RETRACT','LESSON')) AND ($4::uuid IS NULL OR (event."createdAt",event.id)<(SELECT anchor."createdAt",anchor.id FROM core."deliveryCreativeLearningEvent" anchor WHERE anchor."workspaceId"=$1 AND anchor."linkId"=$2 AND anchor.id=$4)) ORDER BY event."createdAt" DESC,event.id DESC LIMIT $5`,
            [
              workspace.id,
              input.id,
              privateHistory,
              input.afterEventId ?? null,
              CREATIVE_LEARNING_PAGE_SIZE + 1,
            ],
          );
        const page = events.slice(0, CREATIVE_LEARNING_PAGE_SIZE);
        return {
          ...(await this.stateValue(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            selected,
          )),
          selectedVersion: version.version,
          body: version.body,
          events: page.map((event) => this.eventValue(event)),
          nextEventCursor:
            events.length > CREATIVE_LEARNING_PAGE_SIZE
              ? page[page.length - 1].id
              : null,
        };
      },
      transactionManager,
    );
  }
  private async replay(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    requestId: string,
    input: unknown,
    action: DeliveryCreativeLearningEventEntity['action'],
  ) {
    const event = await manager
      .getRepository(DeliveryCreativeLearningEventEntity)
      .findOneBy({ workspaceId: workspace.id, requestId });
    if (!event) return null;
    if (
      event.actorId !== memberId ||
      event.userWorkspaceId !== userWorkspaceId ||
      event.action !== action ||
      event.inputHash !== advertisingHash(input)
    )
      throw new ConflictException(
        'This request belongs to a different learning command or requester.',
      );
    const selected = await this.selected(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      event.linkId,
    );
    if (event.lessonId)
      await this.lessonSelection(
        manager,
        workspace,
        selected.scope,
        event.lessonId,
      );
    return {
      ...this.identity(
        workspace,
        memberId,
        userWorkspaceId,
        selected.scope.actor,
      ),
      receipt: this.eventValue(event),
      inputHash: event.inputHash,
    };
  }
  private async record(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    link: DeliveryCreativeAdLinkEntity,
    requestId: string,
    input: unknown,
    action: DeliveryCreativeLearningEventEntity['action'],
    note: string,
    lessonId: string | null = null,
  ) {
    const event = manager
      .getRepository(DeliveryCreativeLearningEventEntity)
      .create({
        id: v4(),
        workspaceId: workspace.id,
        linkId: link.id,
        requestId,
        inputHash: advertisingHash(input),
        actorId: memberId,
        userWorkspaceId,
        actorName: await this.name(manager, workspace, memberId),
        action,
        revision: link.revision,
        version: link.currentVersion,
        state: link.state,
        note,
        lessonId,
        createdAt: new Date(),
      });
    await manager.getRepository(DeliveryCreativeLearningEventEntity).insert({
      id: event.id,
      workspaceId: workspace.id,
      linkId: event.linkId,
      requestId,
      inputHash: event.inputHash,
      actorId: memberId,
      userWorkspaceId,
      actorName: event.actorName,
      action,
      revision: event.revision,
      version: event.version,
      state: event.state,
      note,
      lessonId,
      createdAt: event.createdAt,
    });
    await recordOtogrowActivity(manager, {
      workspaceId: workspace.id,
      actorId: memberId,
      category: 'CREATIVE',
      sourceType: 'creative-learning',
      sourceId: link.id,
      projectId: link.projectId,
      taskId: link.taskId,
      action: `CREATIVE_LEARNING_${action}`,
      outcome: action === 'REVIEW' ? 'APPROVED' : 'RECORDED',
      summary:
        action === 'LESSON'
          ? 'Recorded a human creative learning lesson with exact campaign evidence and limitations.'
          : 'Updated an exact creative-to-ad human association; provider verification and causation are not implied.',
      changes: [
        { field: 'state', before: null, after: link.state },
        { field: 'revision', before: null, after: String(link.revision) },
        { field: 'assetId', before: null, after: link.assetId },
      ],
    });
    return event;
  }
  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCreativeLearning(creativeAdLinkSaveSchema, raw);
    const prior = await this.read(
      workspace,
      (manager) =>
        this.replay(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.requestId,
          input,
          'SAVE',
        ),
      transactionManager,
    );
    if (prior) return prior;
    const {
      id: _id,
      requestId: _requestId,
      revision: _revision,
      previewFingerprint: _previewFingerprint,
      ...editable
    } = input;
    const body = await this.prepare(
      workspace,
      memberId,
      userWorkspaceId,
      editable,
      transactionManager,
    );
    if (body.previewFingerprint !== input.previewFingerprint)
      throw new ConflictException(
        'Association evidence changed after preview. Prepare and review the exact sources again.',
      );
    return this.write(
      workspace.id,
      async (manager) => {
        const prior = await this.replay(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.requestId,
          input,
          'SAVE',
        );
        if (prior) return prior;
        const factual = await this.factual(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          editable,
        );
        if (
          creativeAdPreviewFingerprint({
            ...factual.body,
            assetSha256: body.assetSha256,
            assetHashCapturedAt: body.assetHashCapturedAt,
          }) !== body.previewFingerprint
        )
          throw new ConflictException('Source evidence changed before saving.');
        const repository = manager.getRepository(DeliveryCreativeAdLinkEntity);
        let link = await repository.findOneBy({
          workspaceId: workspace.id,
          id: input.id,
        });
        if (link) {
          const selected = await this.selected(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            link.id,
          );
          if (
            link.revision !== input.revision ||
            !CHANGEABLE.includes(link.state) ||
            (!selected.scope.actor.isManager && link.createdBy !== memberId)
          )
            throw new ConflictException(
              'This association changed or is locked for review.',
            );
          if (
            link.projectId !== input.projectId ||
            link.sourceId !== input.sourceId ||
            link.adId !== input.adId ||
            link.companyId !== factual.project.companyId ||
            link.sourceProjectId !== factual.scope.source.projectId
          )
            throw new ConflictException(
              'Existing association source/client anchors cannot be changed. Create a new association.',
            );
          link.revision++;
          link.currentVersion++;
          link.state = 'DRAFT';
          link.taskId = input.taskId;
          link.assetId = input.assetId;
          await repository.update(
            { workspaceId: workspace.id, id: link.id },
            {
              revision: link.revision,
              currentVersion: link.currentVersion,
              state: link.state,
              taskId: link.taskId,
              assetId: link.assetId,
            },
          );
        } else {
          if (input.revision !== 0)
            throw new ConflictException('Association was not found.');
          link = repository.create({
            id: input.id,
            workspaceId: workspace.id,
            projectId: input.projectId,
            sourceProjectId: factual.scope.source.projectId!,
            companyId: factual.project.companyId,
            sourceId: input.sourceId,
            adId: input.adId,
            taskId: input.taskId,
            assetId: input.assetId,
            createdBy: memberId,
            createdByName: await this.name(manager, workspace, memberId),
            revision: 1,
            currentVersion: 1,
            state: 'DRAFT',
            reviewedVersion: null,
            reviewedBy: null,
            reviewedByName: null,
            reviewedAt: null,
            correctsId: null,
            createdAt: new Date(),
          });
          await repository.insert({
            id: link.id,
            workspaceId: workspace.id,
            projectId: link.projectId,
            sourceProjectId: link.sourceProjectId,
            companyId: link.companyId,
            sourceId: link.sourceId,
            adId: link.adId,
            taskId: link.taskId,
            assetId: link.assetId,
            createdBy: memberId,
            createdByName: link.createdByName,
            revision: 1,
            currentVersion: 1,
            state: 'DRAFT',
            reviewedVersion: null,
            reviewedBy: null,
            reviewedByName: null,
            reviewedAt: null,
            correctsId: null,
            createdAt: link.createdAt,
          });
        }
        await manager.getRepository(DeliveryCreativeAdVersionEntity).insert({
          workspaceId: workspace.id,
          linkId: link.id,
          version: link.currentVersion,
          body,
          createdBy: memberId,
          createdByName: await this.name(manager, workspace, memberId),
        });
        const event = await this.record(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          link,
          input.requestId,
          input,
          'SAVE',
          input.note,
        );
        return {
          ...this.identity(
            workspace,
            memberId,
            userWorkspaceId,
            factual.scope.actor,
          ),
          receipt: this.eventValue(event),
          inputHash: event.inputHash,
        };
      },
      transactionManager,
    );
  }
  async decide(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCreativeLearning(creativeAdLinkDecisionSchema, raw);
    const captured = await this.read(
      workspace,
      async (manager) => ({
        prior: await this.replay(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.requestId,
          input,
          input.action,
        ),
        selected: await this.selected(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.id,
        ),
      }),
      transactionManager,
    );
    if (captured.prior) return captured.prior;
    const needsFreshEvidence =
      input.action === 'SUBMIT' || input.action === 'REVIEW';
    const prepared = needsFreshEvidence
      ? await this.prepare(
          workspace,
          memberId,
          userWorkspaceId,
          creativeAdEditableBody(captured.selected.version.body),
          transactionManager,
        )
      : null;
    return this.write(
      workspace.id,
      async (manager) => {
        const prior = await this.replay(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.requestId,
          input,
          input.action,
        );
        if (prior) return prior;
        const selected = await this.selected(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.id,
        );
        const { link, version, scope } = selected;
        const state = await this.stateValue(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          selected,
        );
        if (link.revision !== input.revision)
          throw new ConflictException(
            'Association changed after it was opened.',
          );
        if (
          needsFreshEvidence &&
          (!prepared ||
            prepared.previewFingerprint !== input.previewFingerprint ||
            prepared.previewFingerprint !== version.body.previewFingerprint ||
            !state.sourceCurrent)
        )
          throw new ConflictException(
            'Review the current exact source evidence and save its association before continuing.',
          );
        if (needsFreshEvidence && prepared) {
          const factual = await this.factual(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            creativeAdEditableBody(version.body),
          );
          if (
            creativeAdPreviewFingerprint({
              ...factual.body,
              assetSha256: prepared.assetSha256,
              assetHashCapturedAt: prepared.assetHashCapturedAt,
            }) !== version.body.previewFingerprint
          )
            throw new ConflictException(
              'Association evidence changed before the decision.',
            );
        }
        if (input.action === 'SUBMIT') {
          if (!state.canSubmit)
            throw new ForbiddenException(
              'Only the current proposal author or a manager can submit this editable association.',
            );
          link.state = 'SUBMITTED';
        }
        if (input.action === 'REVIEW') {
          if (!state.canReview)
            throw new ForbiddenException(
              'An independent manager must review the association after the source report is approved.',
            );
          link.state = 'REVIEWED';
          link.reviewedVersion = link.currentVersion;
          link.reviewedBy = memberId;
          link.reviewedByName = await this.name(manager, workspace, memberId);
          link.reviewedAt = new Date();
          if (version.body.correctsId) {
            const previous = await this.selected(
              manager,
              workspace,
              memberId,
              userWorkspaceId,
              version.body.correctsId,
            );
            if (
              previous.link.state !== 'REVIEWED' ||
              previous.link.correctedById
            )
              throw new ConflictException(
                'The association being corrected changed.',
              );
            link.correctsId = previous.link.id;
          }
        }
        if (input.action === 'REQUEST_CHANGES') {
          if (!state.canRequestChanges || !input.note)
            throw new ForbiddenException(
              'An independent manager must explain requested changes on a submitted proposal.',
            );
          if (input.previewFingerprint !== version.body.previewFingerprint)
            throw new ConflictException(
              'Confirm the exact saved proposal being returned.',
            );
          link.state = 'CHANGES_REQUESTED';
        }
        if (input.action === 'RETRACT') {
          if (!state.canRetract || !input.note)
            throw new ForbiddenException(
              'A manager must explain withdrawing a reviewed association.',
            );
          if (input.previewFingerprint !== version.body.previewFingerprint)
            throw new ConflictException(
              'Confirm the exact saved association being withdrawn.',
            );
          link.state = 'RETRACTED';
        }
        link.revision++;
        await manager.getRepository(DeliveryCreativeAdLinkEntity).update(
          { workspaceId: workspace.id, id: link.id },
          {
            state: link.state,
            revision: link.revision,
            reviewedVersion: link.reviewedVersion,
            reviewedBy: link.reviewedBy,
            reviewedByName: link.reviewedByName,
            reviewedAt: link.reviewedAt,
            correctsId: link.correctsId,
          },
        );
        const event = await this.record(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          link,
          input.requestId,
          input,
          input.action,
          input.note,
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, scope.actor),
          receipt: this.eventValue(event),
          inputHash: event.inputHash,
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
  ) {
    const input = parseCreativeLearning(creativeLearningReceiptSchema, raw);
    return this.read(
      workspace,
      async (manager) => {
        const event = await manager
          .getRepository(DeliveryCreativeLearningEventEntity)
          .findOneBy({
            workspaceId: workspace.id,
            requestId: input.requestId,
            actorId: memberId,
            userWorkspaceId,
          });
        if (!event)
          throw new NotFoundException(
            'No committed learning command was found for this requester.',
          );
        const selected = await this.selected(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          event.linkId,
        );
        if (event.lessonId)
          await this.lessonSelection(
            manager,
            workspace,
            selected.scope,
            event.lessonId,
          );
        return {
          ...this.identity(
            workspace,
            memberId,
            userWorkspaceId,
            selected.scope.actor,
          ),
          receipt: this.eventValue(event),
          inputHash: event.inputHash,
        };
      },
      transactionManager,
    );
  }
  private lessonSql(workspace: WorkspaceEntity) {
    return `${this.visibleSql(workspace)}, visible_lesson_base AS NOT MATERIALIZED (SELECT lesson.* FROM core."deliveryCreativeLesson" lesson WHERE lesson."workspaceId"=$1 AND NOT EXISTS (SELECT 1 FROM unnest(lesson."linkIds") linked(id) WHERE NOT EXISTS (SELECT 1 FROM visible_links link WHERE link.id=linked.id))), visible_lessons AS NOT MATERIALIZED (SELECT lesson.*,(SELECT correction.id FROM visible_lesson_base correction WHERE correction."correctsId"=lesson.id) AS "correctedById" FROM visible_lesson_base lesson)`;
  }
  private async lessonSelection(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    scope: SourceScope,
    id: string,
  ) {
    const rows: (DeliveryCreativeLessonEntity & {
      correctedById: string | null;
    })[] = await manager.query(
      `${this.lessonSql(workspace)} SELECT * FROM visible_lessons WHERE id=$6`,
      [...metaReportScopeValues(scope.meta), id],
    );
    if (!rows[0])
      throw new NotFoundException(
        'This exact lesson is outside your current evidence scope.',
      );
    return rows[0];
  }
  async recordLesson(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCreativeLearning(creativeLessonSaveSchema, raw);
    const prior = await this.read(
      workspace,
      (manager) =>
        this.replay(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.requestId,
          input,
          'LESSON',
        ),
      transactionManager,
    );
    if (prior) return prior;
    for (const id of input.linkIds) {
      const selected = await this.read(
        workspace,
        async (manager) => {
          const selected = await this.selected(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            id,
          );
          if (!selected.scope.actor.isManager)
            throw new ForbiddenException(
              'A current manager must review lesson evidence.',
            );
          return selected;
        },
        transactionManager,
      );
      if (
        (await this.hashAsset(
          workspace,
          selected.link.taskId,
          selected.link.assetId,
          selected.version.body.creativeTarget.asset!.size,
        )) !== selected.version.body.assetSha256
      )
        throw new ConflictException(
          'Final media no longer matches the reviewed association. Record a corrected association before learning from it.',
        );
    }
    return this.write(
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        if (!scope.actor.isManager)
          throw new ForbiddenException(
            'A current manager must write a reviewed creative lesson.',
          );
        const prior = await this.replay(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          input.requestId,
          input,
          'LESSON',
        );
        if (prior) return prior;
        await this.project(manager, workspace, scope.actor, input.projectId);
        const evidence = [];
        for (const [index, id] of input.linkIds.entries()) {
          const selected = await this.selected(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            id,
          );
          if (
            selected.link.projectId !== input.projectId ||
            selected.link.state !== 'REVIEWED' ||
            selected.link.correctedById ||
            this.summary(selected.link).fingerprint !==
              input.linkFingerprints[index]
          )
            throw new ConflictException(
              'A selected reviewed association changed, was corrected or belongs to another creative project.',
            );
          if (
            !(
              await this.stateValue(
                manager,
                workspace,
                memberId,
                userWorkspaceId,
                selected,
              )
            ).sourceCurrent
          )
            throw new ConflictException(
              'A lesson requires reviewed associations whose current source metadata still matches the saved evidence.',
            );
          evidence.push({
            linkId: id,
            version: selected.version.version,
            fingerprint: input.linkFingerprints[index],
            body: selected.version.body,
          });
        }
        const first = evidence[0];
        const comparable = creativeLessonEvidenceComparable(
          evidence.map((item) => item.body),
        );
        if (input.assessment !== 'INCONCLUSIVE' && !comparable)
          throw new BadRequestException(
            'Unknown or unlike outcome evidence must remain inconclusive. Each window remains separate; no causal or aggregate claim is verified.',
          );
        if (input.correctsId) {
          const previous = await this.lessonSelection(
            manager,
            workspace,
            scope,
            input.correctsId,
          );
          if (previous.projectId !== input.projectId || previous.correctedById)
            throw new ConflictException(
              'Correct the latest lesson in this project.',
            );
        }
        const {
          id,
          requestId: _requestId,
          projectId,
          linkFingerprints: _linkFingerprints,
          ...text
        } = input;
        await manager.getRepository(DeliveryCreativeLessonEntity).insert({
          id,
          workspaceId: workspace.id,
          projectId,
          companyId: first.body.source.companyId,
          anchorLinkId: first.linkId,
          linkIds: input.linkIds,
          body: { ...text, evidence },
          createdBy: memberId,
          createdByName: await this.name(manager, workspace, memberId),
          correctsId: input.correctsId,
          createdAt: new Date(),
        });
        const anchor = await manager
          .getRepository(DeliveryCreativeAdLinkEntity)
          .findOneByOrFail({ workspaceId: workspace.id, id: first.linkId });
        const event = await this.record(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          anchor,
          input.requestId,
          input,
          'LESSON',
          input.title,
          input.id,
        );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, scope.actor),
          receipt: this.eventValue(event),
          inputHash: event.inputHash,
        };
      },
      transactionManager,
    );
  }
  async lessons(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseCreativeLearning(creativeLessonsSchema, raw);
    return this.read(
      workspace,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
        );
        await this.project(manager, workspace, scope.actor, input.projectId);
        const [totals]: { count: number }[] = await manager.query(
          `${this.lessonSql(workspace)} SELECT count(*)::int AS count FROM visible_lessons WHERE "projectId"=$6`,
          [...metaReportScopeValues(scope.meta), input.projectId],
        );
        const rows: {
          id: string;
          title: string;
          assessment: string;
          createdByName: string;
          createdAt: Date;
          correctedById: string | null;
        }[] = await manager.query(
          `${this.lessonSql(workspace)} SELECT id,body->>'title' AS title,body->>'assessment' AS assessment,"createdByName","createdAt","correctedById" FROM visible_lessons WHERE "projectId"=$6 AND ($7::uuid IS NULL OR id>$7) ORDER BY id LIMIT $8`,
          [
            ...metaReportScopeValues(scope.meta),
            input.projectId,
            input.afterId ?? null,
            CREATIVE_LEARNING_PAGE_SIZE + 1,
          ],
        );
        const page = rows.slice(0, CREATIVE_LEARNING_PAGE_SIZE);
        const selected = input.selectedId
          ? await this.lessonSelection(
              manager,
              workspace,
              scope,
              input.selectedId,
            )
          : null;
        if (selected && selected.projectId !== input.projectId)
          throw new NotFoundException(
            'Select the lesson in its original project.',
          );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, scope.actor),
          items: page.map((row) => ({
            ...row,
            createdAt: new Date(row.createdAt).toISOString(),
          })),
          totalCount: totals.count,
          nextCursor:
            rows.length > CREATIVE_LEARNING_PAGE_SIZE
              ? page[page.length - 1].id
              : null,
          selected: selected
            ? {
                id: selected.id,
                projectId: selected.projectId,
                ...selected.body,
                correctedById: selected.correctedById,
                createdByName: selected.createdByName,
                createdAt: new Date(selected.createdAt).toISOString(),
                warnings: [
                  'HUMAN_LESSON_NOT_CAUSAL_PROOF',
                  'WINDOWS_ARE_NOT_AGGREGATED',
                  ...(selected.correctedById ? ['LESSON_CORRECTED'] : []),
                ],
              }
            : null,
        };
      },
      transactionManager,
    );
  }
}
