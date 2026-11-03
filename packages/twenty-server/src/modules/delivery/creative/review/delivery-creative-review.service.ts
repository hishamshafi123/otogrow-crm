import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  deliveryReviewAuthority,
  readCurrentDeliveryReviewAssignments,
} from 'src/modules/delivery/reviews/delivery-review-authority';
import { DeliveryCreativeFeedbackEntity } from 'src/modules/delivery/creative/review/entities/delivery-creative-feedback.entity';
import { DeliveryCreativeFeedbackEventEntity } from 'src/modules/delivery/creative/review/entities/delivery-creative-feedback-event.entity';
import {
  type DeliveryCreativeFeedbackChangeInput,
  type DeliveryCreativeFeedbackCreateInput,
  type DeliveryCreativeFeedbackDTO,
  type DeliveryCreativeFeedbackHistoryDTO,
  type DeliveryCreativeFeedbackHistoryInput,
  type DeliveryCreativeFeedbackResultDTO,
  type DeliveryCreativeReviewInput,
  type DeliveryCreativeReviewSnapshotDTO,
  type DeliveryCreativeReviewTargetDTO,
} from 'src/modules/delivery/creative/review/delivery-creative-review.dto';
import {
  assertCreativeReviewAnchor,
  assertCreativeReviewTarget,
  CREATIVE_REVIEW_PAGE_SIZE,
  CREATIVE_REVIEW_SOURCE_LIMIT,
  creativeFeedbackChangeSchema,
  creativeFeedbackCreateSchema,
  creativeFeedbackHistorySchema,
  creativeReviewAsset,
  creativeReviewPermissions,
  creativeReviewQuerySchema,
  creativeReviewSameTarget,
  creativeReviewTarget,
  parseCreativeReview,
} from 'src/modules/delivery/creative/review/delivery-creative-review.policy';

type ReviewScope = Awaited<ReturnType<DeliveryCreativeService['scope']>>;

@Injectable()
export class DeliveryCreativeReviewService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly creative: DeliveryCreativeService,
    private readonly access: OtogrowAccessService,
  ) {}

  private async reviewAuthority(
    manager: EntityManager,
    workspaceId: string,
    scope: ReviewScope,
    memberId: string,
  ) {
    const latest =
      scope.task.details.submissions[scope.task.details.submissions.length - 1];
    const assignment = latest
      ? (
          await readCurrentDeliveryReviewAssignments(manager, workspaceId, [
            { taskId: scope.task.taskId, submissionVersion: latest.version },
          ])
        ).get(scope.task.taskId)
      : undefined;
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId, id: scope.task.projectId });
    return deliveryReviewAuthority({
      primaryReviewerId: scope.task.details.reviewerId,
      assigneeId: scope.assigneeId,
      assignment,
      projectMemberIds: project?.memberIds ?? [],
      access: [
        {
          memberId,
          capabilities: scope.actor.isManager
            ? [...scope.actor.capabilities, 'delivery.manage']
            : scope.actor.capabilities,
        },
      ],
      actorId: memberId,
    });
  }

  private async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
  ) {
    const scope = await this.creative.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
    );
    if (
      scope.task.details.submissions.length > CREATIVE_REVIEW_SOURCE_LIMIT ||
      (scope.task.details.creative?.assets.length ?? 0) > 200
    )
      throw new BadRequestException(
        'This task exceeds the complete creative review source limit.',
      );
    return scope;
  }

  private feedbackQuery(
    manager: EntityManager,
    workspaceId: string,
    taskId: string,
  ) {
    return manager
      .getRepository(DeliveryCreativeFeedbackEntity)
      .createQueryBuilder('feedback')
      .where(
        'feedback."workspaceId"=:workspaceId AND feedback."taskId"=:taskId',
        { workspaceId, taskId },
      );
  }

  private targetQuery(
    query: SelectQueryBuilder<DeliveryCreativeFeedbackEntity>,
    target: DeliveryCreativeReviewTargetDTO,
  ) {
    if (target.assetId !== null)
      return query.andWhere('feedback."assetId"=:assetId', {
        assetId: target.assetId,
      });
    return query.andWhere(
      'feedback."targetKind"=:targetKind AND feedback."assetId" IS NULL AND feedback."submissionVersion" IS NOT DISTINCT FROM :submissionVersion::integer',
      {
        targetKind: target.targetKind,
        submissionVersion: target.submissionVersion,
      },
    );
  }

  private viewedTarget(
    taskId: string,
    details: DeliveryDetails,
    recorded: DeliveryCreativeReviewTargetDTO,
  ): DeliveryCreativeReviewTargetDTO {
    let live: DeliveryCreativeReviewTargetDTO;
    try {
      if (
        recorded.targetKind !== 'ASSET' &&
        recorded.targetKind !== 'SUBMISSION'
      )
        throw new NotFoundException();
      live = creativeReviewTarget(taskId, details, {
        targetKind: recorded.targetKind,
        submissionVersion: recorded.submissionVersion,
        assetId: recorded.assetId,
      });
    } catch {
      return {
        ...recorded,
        availability: 'ASSET_MISSING',
        targetToken: null,
        asset: recorded.asset ? { ...recorded.asset, current: false } : null,
        warnings: [
          ...new Set([...recorded.warnings, 'TARGET_CHANGED_SINCE_FEEDBACK']),
        ],
      };
    }
    // Retain the recorded lineage while exposing whether those exact bytes remain usable now.
    return {
      ...recorded,
      availability: live.availability,
      targetToken:
        live.targetToken === recorded.targetToken ? live.targetToken : null,
      asset: recorded.asset
        ? { ...recorded.asset, current: live.asset?.current ?? false }
        : null,
      warnings: [
        ...new Set([
          ...live.warnings,
          ...(live.targetToken !== recorded.targetToken
            ? ['TARGET_CHANGED_SINCE_FEEDBACK']
            : []),
        ]),
      ],
    };
  }

  private feedback(
    row: DeliveryCreativeFeedbackEntity,
    details: DeliveryDetails,
  ): DeliveryCreativeFeedbackDTO {
    return {
      id: row.id,
      revision: row.revision,
      targetKind: row.targetKind,
      submissionVersion: row.submissionVersion,
      assetId: row.assetId,
      target: this.viewedTarget(row.taskId, details, row.target),
      body: row.body,
      anchorKind: row.anchorKind,
      startMs: row.startMs,
      endMs: row.endMs,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByName,
      updatedAt: row.updatedAt.toISOString(),
      correction: row.correction
        ? this.viewedTarget(row.taskId, details, row.correction)
        : null,
    };
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryCreativeReviewInput,
  ): Promise<DeliveryCreativeReviewSnapshotDTO> {
    const query = parseCreativeReview(creativeReviewQuerySchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          query.taskId,
        );
        const { actor, task, assigneeId } = scope;
        const reviewAuthority = await this.reviewAuthority(
          manager,
          workspace.id,
          scope,
          memberId,
        );
        const selected = creativeReviewTarget(task.taskId, task.details, query);
        const comparison =
          query.compareSubmissionVersion !== null
            ? creativeReviewTarget(task.taskId, task.details, {
                targetKind: 'SUBMISSION',
                submissionVersion: query.compareSubmissionVersion,
                assetId: query.compareAssetId,
              })
            : query.compareAssetId !== null
              ? creativeReviewTarget(task.taskId, task.details, {
                  targetKind: 'ASSET',
                  submissionVersion: null,
                  assetId: query.compareAssetId,
                })
              : null;
        if (comparison && creativeReviewSameTarget(selected, comparison))
          throw new BadRequestException(
            'Choose a different target to compare.',
          );
        const members = await this.access.listActiveMembers(
          workspace.id,
          manager,
        );
        const name = (id: string | null) =>
          members.find((member) => member.memberId === id)?.name ||
          'Former team member';
        const allSubmissions = [...task.details.submissions].sort(
          (left, right) => right.version - left.version,
        );
        if (
          query.beforeSubmissionVersion !== null &&
          !allSubmissions.some(
            (submission) =>
              submission.version === query.beforeSubmissionVersion,
          )
        )
          throw new NotFoundException('This submission cursor is unavailable.');
        const submissions = allSubmissions
          .filter(
            (submission) =>
              query.beforeSubmissionVersion === null ||
              submission.version < query.beforeSubmissionVersion,
          )
          .slice(0, CREATIVE_REVIEW_PAGE_SIZE + 1);
        const base = this.targetQuery(
          this.feedbackQuery(manager, workspace.id, task.taskId),
          selected,
        );
        const feedbackCount = await base.clone().getCount();
        const unresolvedCount = await base
          .clone()
          .andWhere('feedback.status != :resolved', { resolved: 'RESOLVED' })
          .getCount();
        const earlierUnresolvedCount =
          selected.targetKind === 'SUBMISSION' &&
          selected.submissionVersion !== null
            ? await this.feedbackQuery(manager, workspace.id, task.taskId)
                .andWhere(
                  'feedback."targetKind"=\'SUBMISSION\' AND feedback."submissionVersion"<:version AND feedback.status != \'RESOLVED\' AND feedback."assetId" IS DISTINCT FROM CAST(:selectedAssetId AS uuid)',
                  {
                    version: selected.submissionVersion,
                    selectedAssetId: selected.assetId,
                  },
                )
                .getCount()
            : 0;
        let selectedFeedback: DeliveryCreativeFeedbackEntity | null = null;
        if (query.selectedFeedbackId !== null) {
          selectedFeedback = await base
            .clone()
            .andWhere('feedback.id=:selectedId', {
              selectedId: query.selectedFeedbackId,
            })
            .getOne();
          if (!selectedFeedback)
            throw new NotFoundException(
              'This feedback does not belong to the selected file.',
            );
        }
        if (query.afterFeedbackId !== null) {
          const cursor = await base
            .clone()
            .andWhere('feedback.id=:cursorId', {
              cursorId: query.afterFeedbackId,
            })
            .getOne();
          if (!cursor)
            throw new NotFoundException('This feedback cursor is unavailable.');
          base.andWhere(
            '(feedback."createdAt",feedback.id) < (SELECT "createdAt",id FROM core."deliveryCreativeFeedback" WHERE "workspaceId"=:workspaceId AND "taskId"=:taskId AND id=:cursorId)',
            { cursorId: cursor.id },
          );
        }
        const rows = await base
          .orderBy('feedback.createdAt', 'DESC')
          .addOrderBy('feedback.id', 'DESC')
          .take(CREATIVE_REVIEW_PAGE_SIZE + 1)
          .getMany();
        const page = rows.slice(0, CREATIVE_REVIEW_PAGE_SIZE);
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          taskId: task.taskId,
          taskRevision: task.revision,
          state: task.details.state,
          currentSubmissionVersion: allSubmissions[0]?.version ?? null,
          reviewerName: reviewAuthority.effectiveReviewerId
            ? name(reviewAuthority.effectiveReviewerId)
            : 'Unassigned',
          assigneeName: assigneeId ? name(assigneeId) : 'Unassigned',
          ...creativeReviewPermissions(
            task.details,
            memberId,
            actor.isManager,
            assigneeId,
            selected,
            reviewAuthority.canReview,
          ),
          selected,
          comparison,
          submissions: submissions
            .slice(0, CREATIVE_REVIEW_PAGE_SIZE)
            .map((submission) => ({
              version: submission.version,
              creativeVersion: submission.creativeVersion ?? null,
              finalAssetId: submission.finalAssetId ?? null,
              submittedAt: submission.submittedAt,
              submittedByName: name(submission.submittedBy),
              decision: submission.decision ?? null,
            })),
          nextBeforeSubmissionVersion:
            submissions.length > CREATIVE_REVIEW_PAGE_SIZE
              ? submissions[CREATIVE_REVIEW_PAGE_SIZE - 1].version
              : null,
          assets: (task.details.creative?.assets ?? []).map((asset) =>
            creativeReviewAsset(task.details, asset),
          ),
          feedback: page.map((row) => this.feedback(row, task.details)),
          feedbackCount,
          unresolvedCount,
          earlierUnresolvedCount,
          nextFeedbackId:
            rows.length > CREATIVE_REVIEW_PAGE_SIZE
              ? page[page.length - 1].id
              : null,
          selectedFeedback: selectedFeedback
            ? this.feedback(selectedFeedback, task.details)
            : null,
        };
      },
    );
  }

  async history(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryCreativeFeedbackHistoryInput,
  ): Promise<DeliveryCreativeFeedbackHistoryDTO> {
    const query = parseCreativeReview(creativeFeedbackHistorySchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          query.taskId,
        );
        const feedback = await manager
          .getRepository(DeliveryCreativeFeedbackEntity)
          .findOneBy({
            workspaceId: workspace.id,
            taskId: query.taskId,
            id: query.feedbackId,
          });
        if (!feedback) throw new NotFoundException();
        const rows = manager
          .getRepository(DeliveryCreativeFeedbackEventEntity)
          .createQueryBuilder('event')
          .where(
            'event."workspaceId"=:workspaceId AND event."taskId"=:taskId AND event."feedbackId"=:feedbackId',
            {
              workspaceId: workspace.id,
              taskId: query.taskId,
              feedbackId: query.feedbackId,
            },
          );
        if (query.beforeId !== null) {
          const cursor = await rows
            .clone()
            .andWhere('event.id=:cursorId', { cursorId: query.beforeId })
            .getOne();
          if (!cursor)
            throw new NotFoundException(
              'This feedback history cursor is unavailable.',
            );
          rows.andWhere(
            '(event."createdAt",event.id) < (SELECT "createdAt",id FROM core."deliveryCreativeFeedbackEvent" WHERE "workspaceId"=:workspaceId AND "taskId"=:taskId AND "feedbackId"=:feedbackId AND id=:cursorId)',
            { cursorId: cursor.id },
          );
        }
        const found = await rows
          .orderBy('event.createdAt', 'DESC')
          .addOrderBy('event.id', 'DESC')
          .take(CREATIVE_REVIEW_PAGE_SIZE + 1)
          .getMany();
        const page = found.slice(0, CREATIVE_REVIEW_PAGE_SIZE);
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          taskId: query.taskId,
          feedbackId: query.feedbackId,
          events: page.map((event) => ({
            id: event.id,
            action: event.action,
            revision: event.revision,
            body: event.body,
            actorName: event.actorName,
            createdAt: event.createdAt.toISOString(),
            beforeStatus: event.beforeStatus,
            afterStatus: event.afterStatus,
            correction: event.correction,
          })),
          nextBeforeId:
            found.length > CREATIVE_REVIEW_PAGE_SIZE
              ? page[page.length - 1].id
              : null,
        };
      },
    );
  }

  private async replay(
    manager: EntityManager,
    workspaceId: string,
    taskId: string,
    memberId: string,
    commandId: string,
    requestHash: string,
    details: DeliveryDetails,
  ): Promise<DeliveryCreativeFeedbackResultDTO | null> {
    const previous = await manager
      .getRepository(DeliveryCreativeFeedbackEventEntity)
      .findOneBy({ workspaceId, commandId });
    if (!previous) return null;
    if (
      previous.taskId !== taskId ||
      previous.actorId !== memberId ||
      previous.requestHash !== requestHash
    )
      throw new ConflictException(
        'This creative feedback command was already used for a different request.',
      );
    const row = await manager
      .getRepository(DeliveryCreativeFeedbackEntity)
      .findOneBy({ workspaceId, taskId, id: previous.feedbackId });
    if (!row)
      throw new ConflictException(
        'The earlier feedback command has no current record.',
      );
    return { feedback: this.feedback(row, details), replayed: true };
  }

  private async actorName(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
  ) {
    const members = await this.access.listActiveMembers(workspaceId, manager);
    return (
      members.find((member) => member.memberId === memberId)?.name ||
      'Former team member'
    );
  }

  private async record(
    manager: EntityManager,
    workspaceId: string,
    scope: ReviewScope,
    feedback: DeliveryCreativeFeedbackEntity,
    event: Pick<
      DeliveryCreativeFeedbackEventEntity,
      | 'commandId'
      | 'requestHash'
      | 'action'
      | 'body'
      | 'actorId'
      | 'actorName'
      | 'beforeStatus'
    >,
  ) {
    await manager.getRepository(DeliveryCreativeFeedbackEventEntity).insert({
      workspaceId,
      taskId: feedback.taskId,
      feedbackId: feedback.id,
      revision: feedback.revision,
      createdAt: feedback.updatedAt,
      afterStatus: feedback.status,
      correction: feedback.correction,
      ...event,
    });
    const summaries = {
      CREATED: 'Added precise creative feedback.',
      REPLY: 'Replied to creative feedback.',
      ADDRESSED: 'Marked creative feedback addressed with correction evidence.',
      RESOLVED: 'Resolved creative feedback after review.',
      REOPENED: 'Reopened creative feedback for review.',
    };
    await recordOtogrowActivity(manager, {
      workspaceId,
      actorId: event.actorId,
      category: 'CREATIVE',
      action: `CREATIVE_FEEDBACK_${event.action === 'REPLY' ? 'REPLIED' : event.action}`,
      outcome: 'RECORDED',
      summary: summaries[event.action],
      projectId: scope.task.projectId,
      taskId: feedback.taskId,
      sourceType: 'creative-review',
      sourceId: feedback.id,
      changes: [
        {
          field: 'revision',
          before:
            feedback.revision === 1 ? null : String(feedback.revision - 1),
          after: String(feedback.revision),
        },
        { field: 'state', before: event.beforeStatus, after: feedback.status },
        { field: 'assetId', before: null, after: feedback.assetId },
        {
          field: 'submissionVersion',
          before: null,
          after:
            feedback.submissionVersion === null
              ? null
              : String(feedback.submissionVersion),
        },
      ],
    });
  }

  async create(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryCreativeFeedbackCreateInput,
  ): Promise<DeliveryCreativeFeedbackResultDTO> {
    const command = parseCreativeReview(creativeFeedbackCreateSchema, input);
    const requestHash = financeReviewToken({ action: 'CREATE', ...command });
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
        command.taskId,
      );
      const previous = await this.replay(
        manager,
        workspace.id,
        command.taskId,
        memberId,
        command.commandId,
        requestHash,
        scope.task.details,
      );
      if (previous) return previous;
      const target = creativeReviewTarget(
        command.taskId,
        scope.task.details,
        command,
      );
      assertCreativeReviewTarget(target, command.targetToken);
      assertCreativeReviewAnchor(target, command.anchorKind);
      const now = new Date();
      const actorName = await this.actorName(manager, workspace.id, memberId);
      const repository = manager.getRepository(DeliveryCreativeFeedbackEntity);
      const fields = {
        id: command.commandId,
        workspaceId: workspace.id,
        taskId: command.taskId,
        projectId: scope.task.projectId,
        revision: 1,
        targetKind: command.targetKind,
        submissionVersion: command.submissionVersion,
        assetId: command.assetId,
        target,
        body: command.body,
        anchorKind: command.anchorKind,
        startMs: command.startMs,
        endMs: command.endMs,
        status: 'OPEN' as const,
        createdBy: memberId,
        createdByName: actorName,
        createdAt: now,
        updatedAt: now,
        correction: null,
      };
      const feedback = repository.create(fields);
      await repository.insert(fields);
      await this.record(manager, workspace.id, scope, feedback, {
        commandId: command.commandId,
        requestHash,
        action: 'CREATED',
        body: command.body,
        actorId: memberId,
        actorName,
        beforeStatus: null,
      });
      return {
        feedback: this.feedback(feedback, scope.task.details),
        replayed: false,
      };
    });
  }

  async change(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryCreativeFeedbackChangeInput,
  ): Promise<DeliveryCreativeFeedbackResultDTO> {
    const command = parseCreativeReview(creativeFeedbackChangeSchema, input);
    const requestHash = financeReviewToken({ operation: 'CHANGE', ...command });
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
        command.taskId,
      );
      const previous = await this.replay(
        manager,
        workspace.id,
        command.taskId,
        memberId,
        command.commandId,
        requestHash,
        scope.task.details,
      );
      if (previous) return previous;
      const repository = manager.getRepository(DeliveryCreativeFeedbackEntity);
      const feedback = await repository.findOne({
        where: {
          workspaceId: workspace.id,
          taskId: command.taskId,
          id: command.feedbackId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!feedback) throw new NotFoundException();
      if (feedback.revision !== command.revision)
        throw new ConflictException(
          'Creative feedback changed. Refresh before saving.',
        );
      const permissions = creativeReviewPermissions(
        scope.task.details,
        memberId,
        scope.actor.isManager,
        scope.assigneeId,
        feedback.target,
        command.action === 'RESOLVED' || command.action === 'REOPENED'
          ? (await this.reviewAuthority(manager, workspace.id, scope, memberId))
              .canReview
          : undefined,
      );
      if (command.action === 'ADDRESSED' && !permissions.canAddress)
        throw new ForbiddenException(
          'Only the current assignee or a manager can mark correction evidence addressed.',
        );
      if (
        (command.action === 'RESOLVED' || command.action === 'REOPENED') &&
        !permissions.canResolve
      )
        throw new ForbiddenException(
          'Only the current assigned independent reviewer can resolve or reopen feedback.',
        );
      const beforeStatus = feedback.status;
      if (command.action === 'ADDRESSED' || command.action === 'RESOLVED') {
        if (feedback.status === 'RESOLVED')
          throw new ConflictException(
            'Reopen this feedback before recording another correction.',
          );
        if (
          command.evidenceTargetKind === null ||
          command.evidenceAssetId === null ||
          command.evidenceTargetToken === null
        )
          throw new BadRequestException('Choose exact correction evidence.');
        const correction = creativeReviewTarget(
          command.taskId,
          scope.task.details,
          {
            targetKind: command.evidenceTargetKind,
            submissionVersion: command.evidenceSubmissionVersion,
            assetId: command.evidenceAssetId,
          },
        );
        assertCreativeReviewTarget(correction, command.evidenceTargetToken);
        if (
          command.action === 'ADDRESSED' &&
          correction.assetId === feedback.assetId
        )
          throw new BadRequestException(
            'Addressed feedback requires a different exact correction asset.',
          );
        feedback.correction = correction;
        feedback.status = command.action;
      } else if (command.action === 'REOPENED') {
        if (feedback.status === 'OPEN')
          throw new ConflictException('This feedback is already open.');
        feedback.status = 'OPEN';
        feedback.correction = null;
      }
      feedback.revision += 1;
      feedback.updatedAt = new Date();
      await repository.save(feedback);
      await this.record(manager, workspace.id, scope, feedback, {
        commandId: command.commandId,
        requestHash,
        action: command.action,
        body: command.body,
        actorId: memberId,
        actorName: await this.actorName(manager, workspace.id, memberId),
        beforeStatus,
      });
      return {
        feedback: this.feedback(feedback, scope.task.details),
        replayed: false,
      };
    });
  }
}
