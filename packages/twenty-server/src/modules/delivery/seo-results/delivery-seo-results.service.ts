import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeForIlike } from 'twenty-shared/utils';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { localCalendar } from 'src/modules/delivery/operations/delivery-recurrence';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliverySeoReportEntity } from './entities/delivery-seo-report.entity';
import { DeliverySeoVersionEntity } from './entities/delivery-seo-version.entity';
import { DeliverySeoEventEntity } from './entities/delivery-seo-event.entity';
import {
  seoChoicesSchema,
  seoDecisionSchema,
  seoProjectsSchema,
  seoReceiptSchema,
  seoReportsSchema,
  seoSaveSchema,
  seoSelectionSchema,
  type SeoBody,
  type SeoTaskSnapshot,
} from './delivery-seo-results.types';
import {
  compareSeoMetrics,
  parseSeoInput,
} from './delivery-seo-results.policy';

type SeoAccess = Awaited<ReturnType<OtogrowAccessService['accessForUser']>>;
const managerAccess = (access: SeoAccess) =>
  access.capabilities.some((capability) =>
    ['workspace.admin', 'delivery.manage'].includes(capability),
  );
const schemaFor = (workspace: WorkspaceEntity) => {
  if (
    !workspace.databaseSchema ||
    !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
  )
    throw new ForbiddenException('Workspace data is unavailable.');
  return `"${workspace.databaseSchema}"`;
};
const receipt = (event: DeliverySeoEventEntity) => ({
  workspaceId: event.workspaceId,
  actorId: event.actorId,
  userWorkspaceId: event.userWorkspaceId,
  inputHash: event.inputHash,
  requestId: event.requestId,
  reportId: event.reportId,
  action: event.action,
  revision: event.revision,
  version: event.version,
  status: event.status,
  actorName: event.actorName,
  note: event.note,
  createdAt: event.createdAt.toISOString(),
});
@Injectable()
export class DeliverySeoResultsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: OtogrowAccessService,
  ) {}
  private identity(workspace: WorkspaceEntity, access: SeoAccess) {
    return {
      workspaceId: workspace.id,
      memberId: access.memberId,
      userWorkspaceId: access.userWorkspaceId,
      observedAt: new Date().toISOString(),
      scope: advertisingHash([
        workspace.id,
        access.memberId,
        access.userWorkspaceId,
        access.roleIds,
        access.capabilities,
      ]),
      actor: {
        memberId: access.memberId,
        isManager: managerAccess(access),
        isAdmin: access.capabilities.includes('workspace.admin'),
      },
    };
  }
  private read<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    operation: (manager: EntityManager, access: SeoAccess) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) =>
        operation(
          manager,
          await this.access.accessForUser(
            workspace.id,
            memberId,
            userWorkspaceId,
            manager,
          ),
        ),
      transactionManager,
    );
  }
  private async project(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: SeoAccess,
    id: string,
  ) {
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id });
    if (
      !project ||
      (!managerAccess(access) && !project.memberIds.includes(access.memberId))
    )
      throw new ForbiddenException('This SEO project is unavailable.');
    return project;
  }
  private async selected(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: SeoAccess,
    id: string,
  ) {
    const report = await manager
      .getRepository(DeliverySeoReportEntity)
      .findOneBy({ workspaceId: workspace.id, id });
    if (!report) throw new NotFoundException('This SEO report is unavailable.');
    const project = await this.project(
      manager,
      workspace,
      access,
      report.projectId,
    );
    const changed = project.companyId !== report.companyId;
    if (
      (changed && !access.capabilities.includes('workspace.admin')) ||
      (!managerAccess(access) &&
        report.status !== 'APPROVED' &&
        report.createdBy !== access.memberId &&
        report.ownerId !== access.memberId)
    )
      throw new ForbiddenException('This SEO report is unavailable.');
    return { report, project, changed };
  }
  async projects(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseSeoInput(seoProjectsSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const query = manager
          .getRepository(DeliveryProjectEntity)
          .createQueryBuilder('project')
          .where('project."workspaceId"=:workspaceId', {
            workspaceId: workspace.id,
          });
        if (!managerAccess(access))
          query.andWhere('project."memberIds" ? :memberId', { memberId });
        if (input.search)
          query.andWhere('project.name ILIKE :search', {
            search: `%${escapeForIlike(input.search)}%`,
          });
        const totalCount = await query.getCount();
        if (input.afterId)
          query.andWhere('project.id>:afterId', { afterId: input.afterId });
        const rows = await query
          .select([
            'project.id',
            'project.name',
            'project.revision',
            'project.companyId',
          ])
          .orderBy('project.id', 'ASC')
          .limit(26)
          .getMany();
        return {
          ...this.identity(workspace, access),
          items: rows.slice(0, 25),
          totalCount,
          nextId: rows.length > 25 ? rows[24].id : null,
        };
      },
      transactionManager,
    );
  }
  async reports(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseSeoInput(seoReportsSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const project = await this.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        const query = manager
          .getRepository(DeliverySeoReportEntity)
          .createQueryBuilder('report')
          .where(
            'report."workspaceId"=:workspaceId AND report."projectId"=:projectId',
            { workspaceId: workspace.id, projectId: project.id },
          );
        if (!access.capabilities.includes('workspace.admin'))
          query.andWhere('report."companyId" IS NOT DISTINCT FROM :companyId', {
            companyId: project.companyId,
          });
        if (!managerAccess(access))
          query.andWhere(
            '(report.status=\'APPROVED\' OR report."createdBy"=:memberId OR report."ownerId"=:memberId)',
            { memberId },
          );
        if (input.status)
          query.andWhere('report.status=:status', { status: input.status });
        const totalCount = await query.getCount();
        if (input.afterId) {
          const after = await query
            .clone()
            .andWhere('report.id=:afterId', { afterId: input.afterId })
            .getOne();
          if (!after)
            throw new BadRequestException(
              'The report list changed. Return to its first page.',
            );
          query.andWhere(
            '(report."periodEnd"<:afterDate OR (report."periodEnd"=:afterDate AND report.id<:afterId))',
            { afterDate: after.periodEnd, afterId: after.id },
          );
        }
        const rows = await query
          .orderBy('report.periodEnd', 'DESC')
          .addOrderBy('report.id', 'DESC')
          .limit(26)
          .getMany();
        return {
          ...this.identity(workspace, access),
          project,
          items: rows.slice(0, 25),
          totalCount,
          nextId: rows.length > 25 ? rows[24].id : null,
        };
      },
      transactionManager,
    );
  }
  private async tasks(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    projectId: string,
    taskIds?: string[],
    afterId?: string | null,
  ) {
    return manager.query(
      `SELECT native.id AS "taskId",left(native.title,200) AS title,managed.revision,managed.details->>'state' AS state,
      CASE WHEN managed.details->'submissions'->-1->>'version' ~ '^[1-9][0-9]{0,8}$' THEN (managed.details->'submissions'->-1->>'version')::integer ELSE NULL END AS "submissionVersion",
      checked.id AS "verificationRunId",left(checked.result->>'summary',1000) AS "verificationSummary"
      FROM core."deliveryTask" managed JOIN ${schemaFor(workspace)}.task native ON native.id=managed."taskId" AND native."deletedAt" IS NULL
      LEFT JOIN LATERAL(SELECT run.id,run.result FROM core."deliveryAgentRun" run WHERE run."workspaceId"=managed."workspaceId" AND run."taskId"=managed."taskId" AND run.configuration->>'kind'='SEO' AND run.status='SUCCEEDED' AND run.decision->>'action'='ACCEPT' ORDER BY run."createdAt" DESC,run.id DESC LIMIT 1) checked ON true
      WHERE managed."workspaceId"=$1 AND managed."projectId"=$2 AND managed.details->>'service'='SEO' AND managed.details->>'state'='APPROVED'
      AND ($3::uuid[] IS NULL OR native.id=ANY($3::uuid[])) AND ($4::uuid IS NULL OR native.id>$4) ORDER BY native.id LIMIT 31`,
      [workspace.id, projectId, taskIds ?? null, afterId ?? null],
    ) as Promise<SeoTaskSnapshot[]>;
  }
  async choices(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseSeoInput(seoChoicesSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const project = await this.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        const tasks = await this.tasks(
          manager,
          workspace,
          project.id,
          undefined,
          input.afterTaskId,
        );
        const [count]: { count: string }[] = await manager.query(
          `SELECT count(*)::text AS count FROM core."deliveryTask" managed JOIN ${schemaFor(workspace)}.task native ON native.id=managed."taskId" AND native."deletedAt" IS NULL WHERE managed."workspaceId"=$1 AND managed."projectId"=$2 AND managed.details->>'service'='SEO' AND managed.details->>'state'='APPROVED'`,
          [workspace.id, project.id],
        );
        const members: { id: string; name: string }[] = await manager.query(
          `SELECT member.id,trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${schemaFor(workspace)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 AND membership."deletedAt" IS NULL JOIN core."user" account ON account.id=membership."userId" AND account."deletedAt" IS NULL AND NOT account.disabled WHERE member."deletedAt" IS NULL AND (member.id=ANY($2::uuid[]) OR member.id=$3) AND ($4::uuid IS NULL OR member.id>$4) ORDER BY member.id LIMIT 26`,
          [
            workspace.id,
            project.memberIds,
            access.memberId,
            input.afterMemberId ?? null,
          ],
        );
        return {
          ...this.identity(workspace, access),
          members: members.slice(0, 25),
          tasks: tasks.slice(0, 30),
          totalTaskCount: Number(count.count),
          nextTaskId: tasks.length > 30 ? tasks[29].taskId : null,
          nextMemberId: members.length > 25 ? members[24].id : null,
        };
      },
      transactionManager,
    );
  }
  private async comparison(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: SeoAccess,
    project: DeliveryProjectEntity,
    body: SeoBody,
  ) {
    if (!body.comparisonId) return null;
    const selected = await this.selected(
      manager,
      workspace,
      access,
      body.comparisonId,
    );
    if (
      selected.changed ||
      selected.project.id !== project.id ||
      selected.report.status !== 'APPROVED' ||
      selected.report.approvedVersion !== body.comparisonVersion
    )
      throw new ConflictException(
        'Choose an approved comparison version from the same client project.',
      );
    return manager.getRepository(DeliverySeoVersionEntity).findOneByOrFail({
      workspaceId: workspace.id,
      reportId: body.comparisonId,
      version: body.comparisonVersion!,
    });
  }
  async detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseSeoInput(seoSelectionSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const { report, project, changed } = await this.selected(
          manager,
          workspace,
          access,
          input.id,
        );
        const version = input.version ?? report.currentVersion;
        const canReadDraft =
          managerAccess(access) ||
          [report.createdBy, report.ownerId].includes(memberId);
        if (!canReadDraft && version !== report.approvedVersion)
          throw new ForbiddenException(
            'Only the approved report version is available.',
          );
        const saved = await manager
          .getRepository(DeliverySeoVersionEntity)
          .findOneBy({
            workspaceId: workspace.id,
            reportId: report.id,
            version,
          });
        if (!saved)
          throw new NotFoundException(
            'This SEO report version is unavailable.',
          );
        const previous = saved.body.comparisonSnapshot;
        const historyQuery = manager
          .getRepository(DeliverySeoEventEntity)
          .createQueryBuilder('event')
          .where(
            'event."workspaceId"=:workspaceId AND event."reportId"=:reportId',
            { workspaceId: workspace.id, reportId: report.id },
          );
        if (!canReadDraft) historyQuery.andWhere("event.action='APPROVE'");
        if (input.afterEventId) {
          const after = await manager
            .getRepository(DeliverySeoEventEntity)
            .findOneBy({
              workspaceId: workspace.id,
              reportId: report.id,
              id: input.afterEventId,
            });
          if (!after)
            throw new BadRequestException(
              'The report history cursor is unavailable. Start from its first page.',
            );
          historyQuery.andWhere('event.revision>:afterRevision', {
            afterRevision: after.revision,
          });
        }
        const history = await historyQuery
          .orderBy('event.revision', 'ASC')
          .limit(26)
          .getMany();
        return {
          ...this.identity(workspace, access),
          project,
          report,
          version,
          body: saved.body,
          taskSnapshots: saved.body.taskSnapshots,
          comparison: previous ? compareSeoMetrics(saved.body, previous) : [],
          comparisonTitle: previous?.title ?? null,
          comparisonPeriodStart: previous?.periodStart ?? null,
          comparisonPeriodEnd: previous?.periodEnd ?? null,
          comparisonTimezone: previous?.timezone ?? null,
          history: history.slice(0, 25).map(receipt),
          nextEventId: history.length > 25 ? history[24].id : null,
          canEdit:
            !changed &&
            version === report.currentVersion &&
            ['DRAFT', 'CHANGES_REQUESTED'].includes(report.status) &&
            (managerAccess(access) ||
              [report.createdBy, report.ownerId].includes(memberId)),
          canSubmit:
            !changed &&
            version === report.currentVersion &&
            ['DRAFT', 'CHANGES_REQUESTED'].includes(report.status) &&
            (managerAccess(access) ||
              [report.createdBy, report.ownerId].includes(memberId)),
          canReview:
            !changed &&
            version === report.currentVersion &&
            report.status === 'SUBMITTED' &&
            managerAccess(access) &&
            ![report.createdBy, report.ownerId].includes(memberId),
          clientAnchorChanged: changed,
        };
      },
      transactionManager,
    );
  }
  async state(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseSeoInput(seoSelectionSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const { report, project, changed } = await this.selected(
          manager,
          workspace,
          access,
          input.id,
        );
        const canEdit =
          !changed &&
          ['DRAFT', 'CHANGES_REQUESTED'].includes(report.status) &&
          (managerAccess(access) ||
            [report.createdBy, report.ownerId].includes(memberId));
        return {
          ...this.identity(workspace, access),
          project,
          report,
          canEdit,
          canSubmit: canEdit,
          canReview:
            !changed &&
            report.status === 'SUBMITTED' &&
            managerAccess(access) &&
            ![report.createdBy, report.ownerId].includes(memberId),
          clientAnchorChanged: changed,
        };
      },
      transactionManager,
    );
  }
  private async snapshotTasks(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    projectId: string,
    body: SeoBody,
  ) {
    const tasks = body.tasks.length
      ? await this.tasks(
          manager,
          workspace,
          projectId,
          body.tasks.map((task) => task.taskId),
        )
      : [];
    if (
      body.tasks.some(
        (reference) =>
          !tasks.some(
            (task) =>
              task.taskId === reference.taskId &&
              task.revision === reference.revision,
          ),
      )
    )
      throw new ConflictException(
        'A linked SEO task changed or is no longer approved. Refresh the report evidence.',
      );
    return tasks;
  }
  private write<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    operation: (manager: EntityManager, access: SeoAccess) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    const apply = async (manager: EntityManager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspace.id}`],
      );
      return operation(
        manager,
        await this.access.accessForUser(
          workspace.id,
          memberId,
          userWorkspaceId,
          manager,
        ),
      );
    };
    if (
      transactionManager &&
      !transactionManager.queryRunner?.isTransactionActive
    )
      throw new Error('An active transaction is required.');
    return transactionManager
      ? apply(transactionManager)
      : this.dataSource.transaction(apply);
  }
  private async replay(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: SeoAccess,
    requestId: string,
    inputHash: string,
  ) {
    const existing = await manager
      .getRepository(DeliverySeoEventEntity)
      .findOneBy({ workspaceId: workspace.id, requestId });
    if (!existing) return null;
    await this.selected(manager, workspace, access, existing.reportId);
    if (
      existing.actorId !== access.memberId ||
      existing.userWorkspaceId !== access.userWorkspaceId ||
      existing.inputHash !== inputHash
    )
      throw new ConflictException(
        'This request identity belongs to a different saved action.',
      );
    return receipt(existing);
  }
  private async record(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: SeoAccess,
    report: DeliverySeoReportEntity,
    requestId: string,
    inputHash: string,
    action: string,
    note: string,
  ) {
    const members = await this.access.listActiveMembers(workspace.id, manager);
    const actorName =
      members.find((member) => member.memberId === access.memberId)?.name ??
      'Workspace member';
    const event = await manager.getRepository(DeliverySeoEventEntity).save({
      workspaceId: workspace.id,
      reportId: report.id,
      requestId,
      inputHash,
      action,
      note,
      actorId: access.memberId,
      userWorkspaceId: access.userWorkspaceId,
      actorName,
      revision: report.revision,
      version: report.currentVersion,
      status: report.status,
    });
    await recordOtogrowActivity(manager, {
      workspaceId: workspace.id,
      actorId: access.memberId,
      actorType: 'HUMAN',
      category: 'DELIVERY',
      action: `SEO_REPORT_${action}`,
      outcome:
        action === 'APPROVE'
          ? 'APPROVED'
          : action === 'REQUEST_CHANGES'
            ? 'CHANGES_REQUESTED'
            : 'RECORDED',
      summary:
        'Recorded a measured SEO report decision; task completion and measured outcomes remain separate.',
      projectId: report.projectId,
      sourceType: 'seo-report',
      sourceId: report.id,
      changes: [
        { field: 'state', before: null, after: report.status },
        { field: 'revision', before: null, after: String(report.revision) },
      ],
    });
    return receipt(event);
  }
  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
    transactionManager?: EntityManager,
  ) {
    const input = parseSeoInput(seoSaveSchema, raw);
    const inputHash = advertisingHash(input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const project = await this.project(
          manager,
          workspace,
          access,
          input.projectId,
        );
        if (
          input.body.metrics.some(
            (metric) => Date.parse(metric.observedAt) > Date.now() + 60000,
          )
        )
          throw new BadRequestException(
            'A measurement capture cannot be in the future.',
          );
        const replay = await this.replay(
          manager,
          workspace,
          access,
          input.requestId,
          inputHash,
        );
        if (replay) return replay;
        if (
          project.revision !== input.projectRevision ||
          project.companyId !== input.expectedCompanyId
        )
          throw new ConflictException(
            'The project or client changed. Review the current project before saving this report.',
          );
        const repository = manager.getRepository(DeliverySeoReportEntity);
        let report = await repository.findOneBy({
          workspaceId: workspace.id,
          id: input.id,
        });
        if (report) {
          const selected = await this.selected(
            manager,
            workspace,
            access,
            input.id,
          );
          if (
            selected.changed ||
            report.projectId !== project.id ||
            report.revision !== input.revision ||
            !['DRAFT', 'CHANGES_REQUESTED'].includes(report.status) ||
            (!managerAccess(access) &&
              ![report.createdBy, report.ownerId].includes(memberId))
          )
            throw new ConflictException(
              'This SEO report changed or is no longer editable.',
            );
        } else {
          if (input.revision !== 0)
            throw new ConflictException('The original report is unavailable.');
          report = repository.create({
            id: input.id,
            workspaceId: workspace.id,
            projectId: project.id,
            companyId: project.companyId,
            createdBy: memberId,
            revision: 0,
            currentVersion: 0,
            status: 'DRAFT',
            approvedVersion: null,
            reviewedBy: null,
            reviewedAt: null,
          });
        }
        const active = await this.access.listActiveMembers(
          workspace.id,
          manager,
        );
        if (
          !active.some((member) => member.memberId === input.body.ownerId) ||
          (!project.memberIds.includes(input.body.ownerId) &&
            input.body.ownerId !== memberId)
        )
          throw new BadRequestException(
            'Choose an active owner assigned to this project.',
          );
        if (input.body.comparisonId === report.id)
          throw new BadRequestException(
            'Choose another approved report for comparison.',
          );
        const comparison = await this.comparison(
          manager,
          workspace,
          access,
          project,
          input.body,
        );
        const taskSnapshots = await this.snapshotTasks(
          manager,
          workspace,
          project.id,
          input.body,
        );
        report.ownerId = input.body.ownerId;
        report.ownerName = active.find(
          (member) => member.memberId === input.body.ownerId,
        )!.name;
        if (input.revision === 0)
          report.createdByName =
            active.find((member) => member.memberId === memberId)?.name ??
            'Workspace member';
        report.title = input.body.title;
        report.periodStart = input.body.periodStart;
        report.periodEnd = input.body.periodEnd;
        report.revision++;
        report.currentVersion++;
        report.status = 'DRAFT';
        if (input.revision === 0) {
          try {
            await repository.insert({
              id: report.id,
              workspaceId: report.workspaceId,
              projectId: report.projectId,
              companyId: report.companyId,
              createdBy: report.createdBy,
              createdByName: report.createdByName,
              ownerId: report.ownerId,
              ownerName: report.ownerName,
              revision: report.revision,
              currentVersion: report.currentVersion,
              status: report.status,
              title: report.title,
              periodStart: report.periodStart,
              periodEnd: report.periodEnd,
              approvedVersion: report.approvedVersion,
              reviewedBy: report.reviewedBy,
              reviewedAt: report.reviewedAt,
            });
          } catch (error) {
            if (
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              error.code === '23505'
            )
              throw new ConflictException(
                'This report identity already exists. Check the original request.',
              );
            throw error;
          }
        } else await repository.save(report);
        await manager.getRepository(DeliverySeoVersionEntity).insert({
          workspaceId: workspace.id,
          reportId: report.id,
          version: report.currentVersion,
          body: {
            ...input.body,
            taskSnapshots,
            comparisonSnapshot: comparison
              ? {
                  title: comparison.body.title,
                  period: comparison.body.period,
                  periodStart: comparison.body.periodStart,
                  periodEnd: comparison.body.periodEnd,
                  timezone: comparison.body.timezone,
                  metrics: comparison.body.metrics,
                }
              : null,
          },
          createdBy: memberId,
        });
        return this.record(
          manager,
          workspace,
          access,
          report,
          input.requestId,
          inputHash,
          'SAVE',
          '',
        );
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
    const input = parseSeoInput(seoDecisionSchema, raw);
    const inputHash = advertisingHash(input);
    return this.write(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const replay = await this.replay(
          manager,
          workspace,
          access,
          input.requestId,
          inputHash,
        );
        if (replay) return replay;
        const { report, project, changed } = await this.selected(
          manager,
          workspace,
          access,
          input.id,
        );
        if (changed || report.revision !== input.revision)
          throw new ConflictException(
            'The report or client scope changed. Refresh before deciding.',
          );
        const version = await manager
          .getRepository(DeliverySeoVersionEntity)
          .findOneByOrFail({
            workspaceId: workspace.id,
            reportId: report.id,
            version: report.currentVersion,
          });
        if (input.action === 'SUBMIT') {
          if (
            !['DRAFT', 'CHANGES_REQUESTED'].includes(report.status) ||
            (!managerAccess(access) &&
              ![report.createdBy, report.ownerId].includes(memberId))
          )
            throw new ForbiddenException(
              'Only this report owner or a manager may submit its draft.',
            );
          if (
            !version.body.summary ||
            !version.body.metrics.length ||
            (!version.body.workNotes &&
              !version.body.tasks.length &&
              !version.body.evidence.length)
          )
            throw new BadRequestException(
              'Add a summary, work evidence and measured results or explicit unknown measurements before review.',
            );
          if (
            version.body.periodEnd >=
            localCalendar(new Date(), version.body.timezone).date
          )
            throw new BadRequestException(
              'Keep this report as a draft until its complete reporting period has ended.',
            );
          if (
            version.body.metrics.some(
              (metric) =>
                localCalendar(
                  new Date(metric.observedAt),
                  version.body.timezone,
                ).date <= version.body.periodEnd,
            )
          )
            throw new BadRequestException(
              'Capture measurements after the complete reporting period ends, or keep the report as a draft.',
            );
          await this.snapshotTasks(
            manager,
            workspace,
            project.id,
            version.body,
          );
          report.status = 'SUBMITTED';
        } else {
          if (
            report.status !== 'SUBMITTED' ||
            !managerAccess(access) ||
            [report.createdBy, report.ownerId].includes(memberId)
          )
            throw new ForbiddenException(
              'A separate manager must review this submitted report.',
            );
          if (input.action === 'REQUEST_CHANGES' && !input.note)
            throw new BadRequestException('Explain the changes needed.');
          if (input.action === 'APPROVE') {
            await this.snapshotTasks(
              manager,
              workspace,
              project.id,
              version.body,
            );
            await this.comparison(
              manager,
              workspace,
              access,
              project,
              version.body,
            );
            report.status = 'APPROVED';
            report.approvedVersion = report.currentVersion;
            report.reviewedBy = memberId;
            report.reviewedAt = new Date();
          } else report.status = 'CHANGES_REQUESTED';
        }
        report.revision++;
        await manager.getRepository(DeliverySeoReportEntity).save(report);
        return this.record(
          manager,
          workspace,
          access,
          report,
          input.requestId,
          inputHash,
          input.action,
          input.note,
        );
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
    const input = parseSeoInput(seoReceiptSchema, raw);
    return this.read(
      workspace,
      memberId,
      userWorkspaceId,
      async (manager, access) => {
        const event = await manager
          .getRepository(DeliverySeoEventEntity)
          .findOneBy({ workspaceId: workspace.id, requestId: input.requestId });
        if (
          !event ||
          event.actorId !== memberId ||
          event.userWorkspaceId !== userWorkspaceId
        )
          throw new NotFoundException('This saved request is unavailable.');
        await this.selected(manager, workspace, access, event.reportId);
        return receipt(event);
      },
      transactionManager,
    );
  }
}
