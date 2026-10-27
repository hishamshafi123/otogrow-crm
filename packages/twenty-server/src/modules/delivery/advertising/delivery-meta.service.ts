import {
  resolveMetaClientRouting,
  hasPerformanceMarketingService,
  type MetaClientRouting,
} from 'src/modules/delivery/advertising/delivery-meta-client-routing';
import { z } from 'zod';
import { DeliveryMetaReportEntity } from 'src/modules/delivery/advertising/entities/delivery-meta-report.entity';
import {
  getMetaReport,
  insertMetaReport,
  latestMetaReport,
  listMetaReports,
  metaReportChecks,
  metaReportFilterSchema,
  migrateLegacyMetaReports,
  readMetaReportPage,
  readMetaReportSummary,
  type MetaReportScope,
} from 'src/modules/delivery/advertising/delivery-meta-report-store';
import { readDeliveryOperations } from 'src/modules/delivery/read-delivery-snapshot';
import { Cron } from '@nestjs/schedule';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  newDeliveryOperations,
  type DeliveryOperations,
} from 'src/modules/delivery/operations/delivery-operations.types';
import { localCalendar } from 'src/modules/delivery/operations/delivery-recurrence';
import {
  DeliveryMetaAdapter,
  MetaReportingError,
} from 'src/modules/delivery/advertising/delivery-meta.adapter';
import {
  metaCommandSchema,
  newMetaReporting,
  type MetaReporting,
  type MetaReport,
  type MetaConnection,
} from 'src/modules/delivery/advertising/delivery-meta.types';

export { metaReportDate } from 'src/modules/delivery/advertising/delivery-meta-schedule';
import {
  metaCoverage,
  metaReportDate,
  metaRetryAt,
  metaScheduleSettings,
  metaSuccessfulChecks,
  sameMetaMapping,
  sameMetaData,
  shiftMetaDate,
} from 'src/modules/delivery/advertising/delivery-meta-schedule';
@Injectable()
export class DeliveryMetaService {
  private readonly logger = new Logger(DeliveryMetaService.name);
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly encryption: SecretEncryptionService,
    private readonly adapter: DeliveryMetaAdapter,
  ) {}
  private transact<TResult>(
    workspaceId: string,
    operation: (
      state: MetaReporting,
      operations: DeliveryOperations,
      manager: EntityManager,
    ) => Promise<TResult>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${workspaceId}`],
      );
      const repository = manager.getRepository(DeliveryOperationsEntity);
      const entity =
        (await repository.findOneBy({ workspaceId })) ??
        repository.create({ workspaceId, state: newDeliveryOperations() });
      entity.state.metaReporting ??= newMetaReporting();
      await migrateLegacyMetaReports(
        manager,
        workspaceId,
        entity.state.metaReporting,
      );
      const result = await operation(
        entity.state.metaReporting,
        entity.state,
        manager,
      );
      if (JSON.stringify(entity.state).length > 10000000)
        throw new BadRequestException(
          'Reporting history needs archival before more data can be stored.',
        );
      await repository.save(entity);
      return result;
    });
  }
  private async actor(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
  ) {
    const active: { id: string }[] = await manager.query(
      `SELECT m.id FROM ${this.delivery.schema(workspace)}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" WHERE m.id=$1 AND u.id=$2 AND u."workspaceId"=$3 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL`,
      [memberId, userWorkspaceId, workspace.id],
    );
    if (!active.length) throw new ForbiddenException();
    return this.delivery.actor(workspace, memberId, userWorkspaceId, manager);
  }
  private currentRouting(
    operations: DeliveryOperations,
    source: MetaClientRouting,
  ) {
    try {
      return resolveMetaClientRouting(operations, source);
    } catch {
      return null;
    }
  }
  async validateReportRouting(
    workspace: WorkspaceEntity,
    connection: Pick<MetaConnection, 'projectId' | 'managerId' | 'marketerId'>,
    manager: EntityManager,
  ) {
    if (
      !connection.projectId ||
      !connection.managerId ||
      !connection.marketerId ||
      connection.managerId === connection.marketerId
    )
      throw new BadRequestException(
        'Select a project, project manager and separate marketer.',
      );
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: connection.projectId });
    const members: { id: string; userWorkspaceId: string }[] =
      await manager.query(
        `SELECT m.id,u.id AS "userWorkspaceId" FROM ${this.delivery.schema(workspace)}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" WHERE m.id=ANY($1::uuid[]) AND u."workspaceId"=$2 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL`,
        [[connection.managerId, connection.marketerId], workspace.id],
      );
    const reviewer = members.find(
      (member) => member.id === connection.managerId,
    );
    if (
      !project?.memberIds.includes(connection.marketerId) ||
      !members.some((member) => member.id === connection.marketerId) ||
      !reviewer
    )
      throw new BadRequestException(
        'Choose active members and a marketer assigned to this project.',
      );
    if (
      !(
        await this.actor(
          workspace,
          reviewer.id,
          reviewer.userWorkspaceId,
          manager,
        )
      ).isManager
    )
      throw new ForbiddenException();
    return reviewer;
  }
  private async reportScope(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
  ): Promise<MetaReportScope> {
    const actor = await this.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    const projects = await manager
      .getRepository(DeliveryProjectEntity)
      .findBy({ workspaceId: workspace.id });
    return {
      workspaceId: workspace.id,
      memberId,
      isAdmin: actor.isAdmin,
      isManager: actor.isManager,
      projectIds: projects
        .filter((project) => project.memberIds.includes(memberId))
        .map((project) => project.id),
    };
  }
  private async coverage(
    manager: EntityManager,
    workspaceId: string,
    connection: MetaConnection,
    state: MetaReporting,
    now: Date,
  ) {
    const today = localCalendar(now, connection.timezone).date;
    const checks = await metaReportChecks(
      manager,
      workspaceId,
      connection,
      shiftMetaDate(today, -metaScheduleSettings(connection).catchUpDays),
      shiftMetaDate(today, -1),
    );
    return metaCoverage(connection, state, now, checks);
  }
  private legacyCheckedAt(
    state: MetaReporting,
    report: MetaReport,
    fallback: string,
  ) {
    if (!state.reports.some((legacy) => legacy.id === report.id))
      return fallback;
    const connection = state.connections.find((item) =>
      sameMetaMapping(report, item),
    );
    const check = connection
      ? metaSuccessfulChecks(connection, state.reports).get(report.date)
      : null;
    return check?.reportId === report.id ? check.checkedAt : fallback;
  }
  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown = {},
  ) {
    const parsed = metaReportFilterSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Check the report filters and date range.');
    return readDeliveryOperations(
      this.dataSource,
      workspace.id,
      async (operations, manager) => {
        const state = operations.metaReporting ?? newMetaReporting();
        const scope = await this.reportScope(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const page = await listMetaReports(manager, scope, parsed.data);
        const selected = parsed.data.selectedId
          ? await readMetaReportSummary(manager, scope, parsed.data.selectedId)
          : null;
        const connections = [];
        if (scope.isAdmin)
          for (const savedConnection of state.connections) {
            const {
              ciphertext: _ciphertext,
              ownerId: _ownerId,
              userWorkspaceId: _userWorkspaceId,
              lease,
              checks: _checks,
              ...connection
            } = savedConnection;
            connections.push({
              ...connection,
              routing: this.currentRouting(operations, connection),
              ...metaScheduleSettings(connection),
              coverage: await this.coverage(
                manager,
                workspace.id,
                savedConnection,
                state,
                new Date(),
              ),
              hasToken: true,
              running: Boolean(lease && Date.parse(lease.until) > Date.now()),
            });
          }
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          ...page,
          reports: page.reports.map((report) => ({
            ...report,
            routing: this.currentRouting(operations, report),
            lastCheckedAt: this.legacyCheckedAt(
              state,
              report,
              report.lastCheckedAt,
            ),
          })),
          selected: selected
            ? {
                ...selected,
                routing: this.currentRouting(operations, selected),
                lastCheckedAt: this.legacyCheckedAt(
                  state,
                  selected,
                  selected.lastCheckedAt,
                ),
              }
            : null,
          filter: parsed.data,
          connections,
          clientServices: scope.isAdmin
            ? await Promise.all(
                (operations.clients?.engagements ?? [])
                  .filter((engagement) =>
                    hasPerformanceMarketingService(engagement.services),
                  )
                  .map(async (engagement) => {
                    let ready = false;
                    try {
                      const routing = resolveMetaClientRouting(operations, {
                        engagementId: engagement.id,
                        projectId: engagement.projectId,
                        managerId: null,
                        marketerId: null,
                      });
                      await this.validateReportRouting(
                        workspace,
                        routing,
                        manager,
                      );
                      ready = true;
                    } catch {
                      ready = false;
                    }
                    return {
                      id: engagement.id,
                      name: engagement.name,
                      projectId: engagement.projectId,
                      managerId: engagement.advertising?.managerId ?? null,
                      marketerId: engagement.advertising?.marketerId ?? null,
                      ready,
                    };
                  }),
              )
            : [],
          workerSeenAt: scope.isAdmin ? state.workerSeenAt : null,
        };
      },
    );
  }
  async report(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = z
      .object({
        id: z.uuid(),
        offset: z.number().int().min(0).max(1000000).default(0),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Check the report and ad page.');
    return readDeliveryOperations(
      this.dataSource,
      workspace.id,
      async (operations, manager) => {
        const scope = await this.reportScope(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const report = await readMetaReportPage(
          manager,
          scope,
          parsed.data.id,
          parsed.data.offset,
        );
        if (!report)
          throw new ForbiddenException(
            'This report is unavailable or outside your access.',
          );
        return {
          ...report,
          routing: this.currentRouting(operations, report),
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          adOffset: parsed.data.offset,
          lastCheckedAt: this.legacyCheckedAt(
            operations.metaReporting ?? newMetaReporting(),
            report,
            report.lastCheckedAt,
          ),
        };
      },
    );
  }
  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = metaCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Check the Meta connection fields.');
    const command = parsed.data;
    const actor = await this.actor(
      workspace,
      memberId,
      userWorkspaceId,
      this.dataSource.manager,
    );
    if (!['review', 'archive'].includes(command.action) && !actor.isAdmin)
      throw new ForbiddenException();
    if (command.action === 'connect') {
      const configuration = command.configuration;
      const stored = await readDeliveryOperations(
        this.dataSource,
        workspace.id,
        async (operations, manager) => {
          if (
            !(await this.actor(workspace, memberId, userWorkspaceId, manager))
              .isAdmin
          )
            throw new ForbiddenException();
          return operations.metaReporting?.connections.find(
            (connection) => connection.accountId === configuration.accountId,
          );
        },
      );
      if ((stored?.revision ?? 0) !== configuration.revision)
        throw new ConflictException('Refresh the connection before editing.');
      const token =
        configuration.token ??
        (stored
          ? this.encryption.decryptVersionedOrThrow(stored.ciphertext, {
              workspaceId: workspace.id,
            })
          : null);
      if (!token) throw new BadRequestException('Enter a reporting token.');
      const account = await this.adapter.account(
        configuration.accountId,
        token,
      );
      await this.transact(workspace.id, async (state, operations, manager) => {
        if (
          !(await this.actor(workspace, memberId, userWorkspaceId, manager))
            .isAdmin
        )
          throw new ForbiddenException();
        const existing = state.connections.find(
          (connection) => connection.accountId === configuration.accountId,
        );
        if ((existing?.revision ?? 0) !== configuration.revision)
          throw new ConflictException('Refresh the connection before editing.');
        const routing = resolveMetaClientRouting(operations, configuration);
        if (
          configuration.engagementId ||
          configuration.enabled ||
          configuration.projectId ||
          configuration.managerId ||
          configuration.marketerId
        )
          await this.validateReportRouting(workspace, routing, manager);
        if (!existing && state.connections.length >= 20)
          throw new BadRequestException(
            'Maximum 20 reporting connections per workspace.',
          );
        const { token: _token, ...fields } = configuration;
        const before = existing ? { ...existing } : null;
        const connection: MetaConnection = {
          ...fields,
          scheduleTimezone: fields.scheduleTimezone ?? null,
          ...routing,
          ...metaScheduleSettings(fields),
          revision: configuration.revision + 1,
          ciphertext: this.encryption.encryptVersioned(
            token as PlaintextString,
            { workspaceId: workspace.id },
          ),
          name: account.name,
          currency: account.currency,
          timezone: account.timezone_name,
          ownerId: memberId,
          userWorkspaceId,
          lastSuccessAt: existing?.lastSuccessAt ?? null,
          lastDate: existing?.lastDate ?? null,
          error: existing?.error ?? null,
          retryAt: metaRetryAt(
            {
              accountId: configuration.accountId,
              retryAt: existing?.retryAt ?? null,
            },
            state,
          ),
          lease: null,
          checks: existing?.checks ?? [],
        };
        if (existing) Object.assign(existing, connection);
        else state.connections.push(connection);
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          subjectMemberId: connection.managerId,
          projectId: connection.projectId,
          category: 'ADVERTISING',
          action: before ? 'META_CONNECTION_UPDATED' : 'META_CONNECTED',
          outcome: 'RECORDED',
          summary: before
            ? 'Updated Meta reporting settings.'
            : 'Connected a Meta account for reporting.',
          sourceType: 'meta-connection',
          sourceId: uuidv5(`meta:${connection.accountId}`, workspace.id),
          changes: [
            ...(
              [
                'accountId',
                'engagementId',
                'scheduleTimezone',
                'enabled',
                'time',
                'timezone',
                'managerId',
                'marketerId',
                'projectId',
                'revision',
                'catchUpDays',
                'refreshDays',
                'dailyImportLimit',
              ] as const
            ).flatMap((field) =>
              before?.[field] === connection[field]
                ? []
                : [
                    {
                      field,
                      before:
                        before?.[field] == null ? null : String(before[field]),
                      after:
                        connection[field] == null
                          ? null
                          : String(connection[field]),
                    },
                  ],
            ),
            ...(configuration.token
              ? [{ field: 'credentialChanged', before: null, after: 'true' }]
              : []),
          ],
        });
      });
    } else if (command.action === 'sync') {
      await this.sync(
        workspace,
        command.accountId,
        false,
        new Date(),
        { memberId, userWorkspaceId },
        command.date,
      );
    } else if (command.action === 'disconnect') {
      await this.transact(workspace.id, async (state, _operations, manager) => {
        if (
          !(await this.actor(workspace, memberId, userWorkspaceId, manager))
            .isAdmin
        )
          throw new ForbiddenException();
        const connection = state.connections.find(
          (item) => item.accountId === command.accountId,
        );
        if (!connection || connection.revision !== command.revision)
          throw new ConflictException(
            'Refresh the connection before removing it.',
          );
        state.connections = state.connections.filter(
          (item) => item !== connection,
        );
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          projectId: connection.projectId,
          category: 'ADVERTISING',
          action: 'META_DISCONNECTED',
          outcome: 'RECORDED',
          summary:
            'Removed the Meta reporting connection. Existing reports are retained.',
          sourceType: 'meta-connection',
          sourceId: uuidv5(`meta:${connection.accountId}`, workspace.id),
          changes: [
            { field: 'accountId', before: connection.accountId, after: null },
          ],
        });
      });
    } else if (command.action === 'archive') {
      await this.transact(workspace.id, async (_state, operations, manager) => {
        const reviewer = await this.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const report = await getMetaReport(manager, workspace.id, command.id);
        const routing = report ? this.currentRouting(operations, report) : null;
        if (
          !report ||
          !reviewer.isManager ||
          (!reviewer.isAdmin && routing?.managerId !== memberId)
        )
          throw new ForbiddenException();
        if (report.status === 'REVIEW')
          throw new ConflictException(
            'Review this report before archiving it.',
          );
        const result = await manager
          .getRepository(DeliveryMetaReportEntity)
          .createQueryBuilder()
          .update()
          .set({ archivedAt: command.archived ? new Date() : null })
          .where('"workspaceId"=:workspaceId AND id=:id', {
            workspaceId: workspace.id,
            id: report.id,
          })
          .andWhere(
            command.archived
              ? '"archivedAt" IS NULL'
              : '"archivedAt" IS NOT NULL',
          )
          .execute();
        if (result.affected !== 1)
          throw new ConflictException(
            'The archive state changed. Refresh the report.',
          );
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          projectId: report.projectId,
          category: 'ADVERTISING',
          action: command.archived
            ? 'META_REPORT_ARCHIVED'
            : 'META_REPORT_RESTORED',
          outcome: 'RECORDED',
          summary: command.archived
            ? 'Archived a reviewed Meta report without changing its decision.'
            : 'Restored a Meta report to the active list.',
          sourceType: 'meta-report',
          sourceId: report.id,
          changes: [
            {
              field: 'archived',
              before: String(!command.archived),
              after: String(command.archived),
            },
          ],
        });
      });
    } else {
      await this.transact(workspace.id, async (_state, operations, manager) => {
        const reviewer = await this.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const report = await getMetaReport(manager, workspace.id, command.id);
        const routing = report ? this.currentRouting(operations, report) : null;
        if (
          !report ||
          !routing ||
          !reviewer.isManager ||
          (!reviewer.isAdmin && routing.managerId !== memberId) ||
          routing.marketerId === memberId
        )
          throw new ForbiddenException();
        if (
          report.engagementId &&
          (!command.expectedRouting ||
            command.expectedRouting.projectId !== routing.projectId ||
            command.expectedRouting.managerId !== routing.managerId ||
            command.expectedRouting.marketerId !== routing.marketerId)
        )
          throw new ConflictException(
            'Client responsibilities changed. Refresh and review the current PM and marketer before assigning follow-up.',
          );
        if (report.status !== 'REVIEW')
          throw new ConflictException('This report has already been reviewed.');
        if (command.status === 'APPROVED') {
          await this.validateReportRouting(workspace, routing, manager);
          const taskId = await this.delivery.command(
            workspace,
            memberId,
            userWorkspaceId,
            {
              action: 'create',
              projectId: report.projectId,
              fields: {
                title: `Meta advertising review: ${report.date}`,
                brief: `Manager-approved Meta report for account ${report.accountId}. Open Advertising for account and ad-level performance.\nManager recommendations: ${command.note}\nNo live campaign or budget changes have been made by the OS.`,
                service: 'PERFORMANCE_MARKETING',
                priority: 'NORMAL',
                scheduledDate: null,
                dueAt: null,
                assigneeId: routing.marketerId,
                reviewerId: memberId,
                checklist: [],
                evidence: [],
              },
            },
            manager,
          );
          if (typeof taskId !== 'string')
            throw new BadRequestException(
              'Could not create the marketer follow-up task.',
            );
          report.taskId = taskId;
          this.notice(
            operations,
            report.id,
            routing.marketerId!,
            memberId,
            `Approved Meta report for ${report.date}. Follow-up task assigned.`,
          );
        }
        report.status = command.status;
        report.reviewedBy = memberId;
        report.reviewedAt = new Date().toISOString();
        report.note = command.note;
        await manager
          .getRepository(DeliveryMetaReportEntity)
          .update(
            { workspaceId: workspace.id, id: report.id },
            { report, status: report.status },
          );
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          subjectMemberId: routing.marketerId,
          projectId: report.projectId,
          taskId: report.taskId,
          category: 'ADVERTISING',
          action: 'META_REPORT_REVIEWED',
          outcome: command.status,
          summary:
            command.status === 'APPROVED'
              ? 'Approved a Meta report and assigned the marketer follow-up.'
              : 'Requested changes to a Meta report.',
          sourceType: 'meta-report',
          sourceId: report.id,
          changes: [
            { field: 'state', before: 'REVIEW', after: command.status },
          ],
        });
      });
    }
    return this.snapshot(workspace, memberId, userWorkspaceId);
  }
  private notice(
    operations: DeliveryOperations,
    reportId: string,
    recipientId: string,
    senderId: string,
    text: string,
  ) {
    const now = new Date();
    operations.notices.push({
      id: randomUUID(),
      taskId: `meta-report:${reportId}`,
      recipientId,
      senderId,
      kind: 'MESSAGE',
      text,
      createdAt: now.toISOString(),
      remindAt: new Date(now.getTime() + 300000).toISOString(),
      seenAt: null,
      acknowledgedAt: null,
      cancelled: false,
      sendState: 'PENDING',
      attemptedAt: null,
      error: null,
    });
  }
  async sync(
    workspace: WorkspaceEntity,
    accountId: string,
    scheduled: boolean,
    now = new Date(),
    initiator?: { memberId: string; userWorkspaceId: string },
    requestedDate?: string,
  ) {
    const startedAt = Date.now();
    const currentTime = () => new Date(now.getTime() + Date.now() - startedAt);
    const prepared = await this.transact(
      workspace.id,
      async (state, operations, manager) => {
        if (
          initiator &&
          !(
            await this.actor(
              workspace,
              initiator.memberId,
              initiator.userWorkspaceId,
              manager,
            )
          ).isAdmin
        )
          throw new ForbiddenException();
        const connection = state.connections.find(
          (item) => item.accountId === accountId,
        );
        if (!connection)
          throw new BadRequestException('Connect this Meta account first.');
        if (
          !(
            await this.actor(
              workspace,
              connection.ownerId,
              connection.userWorkspaceId,
              manager,
            )
          ).isAdmin
        )
          throw new ForbiddenException();
        if (connection.engagementId) {
          Object.assign(
            connection,
            resolveMetaClientRouting(operations, connection),
          );
          await this.validateReportRouting(workspace, connection, manager);
        }
        const claimTime = currentTime();
        const coverage = await this.coverage(
          manager,
          workspace.id,
          connection,
          state,
          claimTime,
        );
        if (
          scheduled &&
          (!connection.enabled ||
            localCalendar(
              claimTime,
              connection.scheduleTimezone ?? connection.timezone,
            ).time < connection.time)
        )
          return null;
        const retryAt = metaRetryAt(connection, state);
        if (retryAt && Date.parse(retryAt) > claimTime.getTime()) {
          if (scheduled) return null;
          throw new ConflictException(
            'Meta imports are waiting for the retry time shown on the connection.',
          );
        }
        if (!coverage.remainingToday) {
          if (scheduled) return null;
          throw new ConflictException(
            'Daily Meta import limit reached. Scheduled and manual imports share this limit.',
          );
        }
        const date = scheduled
          ? coverage.nextDate
          : (requestedDate ?? metaReportDate(claimTime, connection.timezone));
        if (!date) return null;
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
          shiftMetaDate(date, 0) !== date ||
          date >= coverage.attemptDate
        )
          throw new BadRequestException(
            'Choose a completed date before today in the ad account timezone.',
          );
        if (
          connection.lease &&
          Date.parse(connection.lease.until) > claimTime.getTime()
        ) {
          if (scheduled) return null;
          throw new ConflictException('This account is already importing.');
        }
        if (connection.enabled)
          await this.validateReportRouting(workspace, connection, manager);
        const lease = {
          id: randomUUID(),
          until: new Date(claimTime.getTime() + 180000).toISOString(),
        };
        connection.lease = lease;
        // Usage survives connection edits/removal; every dispatched date costs one attempt.
        state.attempts = (state.attempts ?? []).filter(
          (attempt) =>
            attempt.date >=
            shiftMetaDate(claimTime.toISOString().slice(0, 10), -2),
        );
        const attempt = state.attempts.find(
          (item) =>
            item.accountId === accountId && item.date === coverage.attemptDate,
        );
        if (attempt) attempt.count += 1;
        else
          state.attempts.push({
            accountId,
            date: coverage.attemptDate,
            count: 1,
          });
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: initiator?.memberId ?? null,
          actorType: initiator ? 'HUMAN' : 'SYSTEM',
          subjectMemberId: connection.managerId,
          projectId: connection.projectId,
          category: 'ADVERTISING',
          action: 'META_IMPORT_STARTED',
          outcome: 'RUNNING',
          summary: 'Started importing Meta performance data.',
          sourceType: 'meta-connection',
          sourceId: uuidv5(`meta:${accountId}`, workspace.id),
          changes: [{ field: 'reportDate', before: null, after: date }],
        });
        return {
          ...connection,
          date,
          lease,
          attemptDate: coverage.attemptDate,
        };
      },
    );
    if (!prepared) return;
    try {
      const token = this.encryption.decryptVersionedOrThrow(
        prepared.ciphertext,
        { workspaceId: workspace.id },
      );
      const signal = AbortSignal.timeout(90000);
      const [account, ads] = await Promise.all([
        this.adapter.insights(
          accountId,
          token,
          prepared.date,
          'account',
          signal,
        ),
        this.adapter.insights(accountId, token, prepared.date, 'ad', signal),
      ]);
      if (account.length > 1) throw new MetaReportingError('RESPONSE');
      await this.transact(workspace.id, async (state, operations, manager) => {
        const connection = state.connections.find(
          (item) => item.accountId === accountId,
        );
        if (
          !connection ||
          connection.revision !== prepared.revision ||
          connection.lease?.id !== prepared.lease.id
        )
          throw new ConflictException(
            'Connection changed during import. Results discarded.',
          );
        if (
          initiator &&
          !(
            await this.actor(
              workspace,
              initiator.memberId,
              initiator.userWorkspaceId,
              manager,
            )
          ).isAdmin
        )
          throw new ForbiddenException();
        if (
          !(
            await this.actor(
              workspace,
              connection.ownerId,
              connection.userWorkspaceId,
              manager,
            )
          ).isAdmin
        )
          throw new ForbiddenException();
        if (connection.engagementId)
          Object.assign(
            connection,
            resolveMetaClientRouting(operations, connection),
          );
        if (connection.projectId)
          await this.validateReportRouting(workspace, connection, manager);
        const report = {
          id: randomUUID(),
          engagementId: connection.engagementId ?? null,
          accountId,
          projectId: connection.projectId,
          managerId: connection.managerId,
          marketerId: connection.marketerId,
          date: prepared.date,
          currency: connection.currency,
          timezone: connection.timezone,
          fetchedAt: currentTime().toISOString(),
          account: account[0] ?? null,
          ads,
          status: 'REVIEW' as const,
          reviewedBy: null,
          reviewedAt: null,
          note: '',
          taskId: null,
        };
        const previous = await latestMetaReport(
          manager,
          workspace.id,
          accountId,
          prepared.date,
        );
        const changed = !previous || !sameMetaData(previous, report);
        if (changed) {
          await insertMetaReport(manager, workspace.id, report);
          const recipients = new Set<string>();
          if (report.managerId) recipients.add(report.managerId);
          if (report.engagementId) {
            if (report.marketerId) recipients.add(report.marketerId);
            const members: { id: string; userWorkspaceId: string }[] =
              await manager.query(
                `SELECT m.id,u.id AS "userWorkspaceId" FROM ${this.delivery.schema(workspace)}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" WHERE u."workspaceId"=$1 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL`,
                [workspace.id],
              );
            for (const member of members)
              if (
                (
                  await this.actor(
                    workspace,
                    member.id,
                    member.userWorkspaceId,
                    manager,
                  )
                ).isAdmin
              )
                recipients.add(member.id);
          }
          for (const recipientId of recipients)
            this.notice(
              operations,
              report.id,
              recipientId,
              'META',
              `Meta performance report for ${report.date} is available. Recommendations need independent manager approval before follow-up work is assigned.`,
            );
        }
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: initiator?.memberId ?? null,
          actorType: initiator ? 'HUMAN' : 'SYSTEM',
          subjectMemberId: connection.managerId,
          projectId: connection.projectId,
          category: 'ADVERTISING',
          action: changed ? 'META_REPORT_IMPORTED' : 'META_IMPORT_UNCHANGED',
          outcome: 'SUCCEEDED',
          summary: changed
            ? 'Imported a Meta performance report for manager review.'
            : 'Checked Meta data; the report is unchanged.',
          sourceType: 'meta-report',
          sourceId: changed ? report.id : previous!.id,
          changes: [
            { field: 'reportDate', before: null, after: report.date },
            { field: 'adCount', before: null, after: String(ads.length) },
          ],
        });
        connection.lastDate = prepared.date;
        connection.lastSuccessAt = report.fetchedAt;
        if (!changed)
          await manager
            .getRepository(DeliveryMetaReportEntity)
            .update(
              { workspaceId: workspace.id, id: previous!.id },
              { checkedAt: new Date(report.fetchedAt) },
            );
        connection.error = null;
        connection.retryAt = null;
        for (const attempt of state.attempts ?? []) {
          if (attempt.accountId === accountId) delete attempt.retryAt;
        }
        connection.lease = null;
      });
    } catch (error) {
      const message =
        error instanceof MetaReportingError
          ? error.message
          : error instanceof BadRequestException
            ? error.message
            : 'Import failed or connection permissions changed. Check staff access and retry.';
      await this.transact(workspace.id, async (state, _operations, manager) => {
        const connection = state.connections.find(
          (item) => item.accountId === accountId,
        );
        if (
          connection?.revision === prepared.revision &&
          connection.lease?.id === prepared.lease.id
        ) {
          const wasEnabled = connection.enabled;
          connection.lease = null;
          connection.error = message;
          connection.retryAt = new Date(
            currentTime().getTime() + 3600000,
          ).toISOString();
          const attempt = state.attempts?.find(
            (item) =>
              item.accountId === accountId &&
              item.date === prepared.attemptDate,
          );
          if (attempt) attempt.retryAt = connection.retryAt;
          if (error instanceof MetaReportingError && error.reason === 'AUTH')
            connection.enabled = false;
          await recordOtogrowActivity(manager, {
            workspaceId: workspace.id,
            actorId: initiator?.memberId ?? null,
            actorType: initiator ? 'HUMAN' : 'SYSTEM',
            subjectMemberId: connection.managerId,
            projectId: connection.projectId,
            category: 'ADVERTISING',
            action: 'META_IMPORT_FAILED',
            outcome: 'FAILED',
            summary: 'Meta import failed. Check reporting connection status.',
            sourceType: 'meta-connection',
            sourceId: uuidv5(`meta:${accountId}`, workspace.id),
            changes: [
              { field: 'reportDate', before: null, after: prepared.date },
              ...(wasEnabled !== connection.enabled
                ? [
                    {
                      field: 'enabled',
                      before: String(wasEnabled),
                      after: String(connection.enabled),
                    },
                  ]
                : []),
            ],
          });
        }
      });
      if (!scheduled) throw new BadRequestException(message);
    }
  }
  @Cron('* * * * *')
  async tick(now = new Date()) {
    const startedAt = Date.now();
    const currentTime = () => new Date(now.getTime() + Date.now() - startedAt);
    const entities = await this.dataSource
      .getRepository(DeliveryOperationsEntity)
      .find();
    for (const entity of entities) {
      if (!entity.state.metaReporting?.connections.length) continue;
      try {
        const workspace = await this.dataSource
          .getRepository(WorkspaceEntity)
          .findOneBy({ id: entity.workspaceId });
        if (!workspace) continue;
        await this.transact(workspace.id, async (state) => {
          state.workerSeenAt = currentTime().toISOString();
        });
        for (const connection of entity.state.metaReporting.connections.filter(
          (item) => item.enabled,
        )) {
          try {
            await this.sync(
              workspace,
              connection.accountId,
              true,
              currentTime(),
            );
          } catch {
            await this.transact(
              workspace.id,
              async (state, _operations, manager) => {
                const current = state.connections.find(
                  (item) => item.accountId === connection.accountId,
                );
                if (
                  current?.revision !== connection.revision ||
                  !current.enabled
                )
                  return;
                current.enabled = false;
                current.error =
                  'Scheduled import paused. Check owner access, project and staff assignments before enabling again.';
                await recordOtogrowActivity(manager, {
                  workspaceId: workspace.id,
                  actorId: null,
                  actorType: 'SYSTEM',
                  projectId: current.projectId,
                  category: 'ADVERTISING',
                  action: 'META_REPORTING_PAUSED',
                  outcome: 'RECORDED',
                  summary:
                    'Paused scheduled Meta imports because access or account mapping needs attention.',
                  sourceType: 'meta-connection',
                  sourceId: uuidv5(`meta:${current.accountId}`, workspace.id),
                  changes: [
                    { field: 'enabled', before: 'true', after: 'false' },
                  ],
                });
              },
            );
          }
        }
      } catch {
        this.logger.warn(
          `Meta reporting tick failed for workspace ${entity.workspaceId}.`,
        );
      }
    }
  }
}
