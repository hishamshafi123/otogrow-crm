import { isDeepStrictEqual } from 'node:util';
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
  type MetaConnection,
} from 'src/modules/delivery/advertising/delivery-meta.types';

export const metaReportDate = (now: Date, timezone: string) =>
  new Date(
    Date.parse(`${localCalendar(now, timezone).date}T12:00:00Z`) - 86400000,
  )
    .toISOString()
    .slice(0, 10);
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
  private async validateMapping(
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
  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return this.transact(workspace.id, async (state, _operations, manager) => {
      const actor = await this.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      const projects = await manager
        .getRepository(DeliveryProjectEntity)
        .findBy({ workspaceId: workspace.id });
      const projectIds = new Set(
        projects
          .filter((project) => project.memberIds.includes(memberId))
          .map((project) => project.id),
      );
      return {
        connections: actor.isAdmin
          ? state.connections.map(
              ({
                ciphertext: _ciphertext,
                ownerId: _ownerId,
                userWorkspaceId: _userWorkspaceId,
                lease,
                ...connection
              }) => ({
                ...connection,
                hasToken: true,
                running: Boolean(lease && Date.parse(lease.until) > Date.now()),
              }),
            )
          : [],
        reports: state.reports.filter(
          (report) =>
            actor.isAdmin ||
            (actor.isManager && report.managerId === memberId) ||
            (report.status === 'APPROVED' &&
              report.marketerId === memberId &&
              report.projectId &&
              projectIds.has(report.projectId)),
        ),
        workerSeenAt: actor.isAdmin ? state.workerSeenAt : null,
      };
    });
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
    if (command.action !== 'review' && !actor.isAdmin)
      throw new ForbiddenException();
    if (command.action === 'connect') {
      const configuration = command.configuration;
      const stored = await this.transact(workspace.id, async (state) =>
        state.connections.find(
          (connection) => connection.accountId === configuration.accountId,
        ),
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
      await this.transact(workspace.id, async (state, _operations, manager) => {
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
        if (
          configuration.enabled ||
          configuration.projectId ||
          configuration.managerId ||
          configuration.marketerId
        )
          await this.validateMapping(workspace, configuration, manager);
        if (!existing && state.connections.length >= 20)
          throw new BadRequestException(
            'Maximum 20 reporting connections per workspace.',
          );
        const { token: _token, ...fields } = configuration;
        const connection: MetaConnection = {
          ...fields,
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
          error: null,
          retryAt: null,
          lease: null,
        };
        if (existing) Object.assign(existing, connection);
        else state.connections.push(connection);
      });
    } else if (command.action === 'sync') {
      await this.sync(workspace, command.accountId, false);
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
      });
    } else {
      await this.transact(workspace.id, async (state, operations, manager) => {
        const reviewer = await this.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const report = state.reports.find((item) => item.id === command.id);
        if (
          !report ||
          !reviewer.isManager ||
          (!reviewer.isAdmin && report.managerId !== memberId) ||
          report.marketerId === memberId
        )
          throw new ForbiddenException();
        if (report.status !== 'REVIEW')
          throw new ConflictException('This report has already been reviewed.');
        if (command.status === 'APPROVED') {
          await this.validateMapping(workspace, report, manager);
          const taskId = await this.delivery.command(
            workspace,
            memberId,
            userWorkspaceId,
            {
              action: 'create',
              projectId: report.projectId,
              fields: {
                title: `Meta advertising review: ${report.date}`,
                brief: `Manager-approved Meta report for account ${report.accountId}. Open Business tools > Ads for account and ad-level performance.\nManager recommendations: ${command.note}\nNo live campaign or budget changes have been made by the OS.`,
                service: 'PERFORMANCE_MARKETING',
                priority: 'NORMAL',
                scheduledDate: null,
                dueAt: null,
                assigneeId: report.marketerId,
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
            report.marketerId!,
            memberId,
            `Approved Meta report for ${report.date}. Follow-up task assigned.`,
          );
        }
        report.status = command.status;
        report.reviewedBy = memberId;
        report.reviewedAt = new Date().toISOString();
        report.note = command.note;
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
  ) {
    const prepared = await this.transact(
      workspace.id,
      async (state, _operations, manager) => {
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
        const date = metaReportDate(now, connection.timezone);
        if (
          scheduled &&
          (!connection.enabled ||
            localCalendar(now, connection.timezone).time < connection.time ||
            connection.lastDate === date ||
            (connection.retryAt &&
              Date.parse(connection.retryAt) > now.getTime()))
        )
          return null;
        if (
          connection.lease &&
          Date.parse(connection.lease.until) > now.getTime()
        ) {
          if (scheduled) return null;
          throw new ConflictException('This account is already importing.');
        }
        if (connection.enabled)
          await this.validateMapping(workspace, connection, manager);
        const lease = {
          id: randomUUID(),
          until: new Date(now.getTime() + 180000).toISOString(),
        };
        connection.lease = lease;
        return { ...connection, date, lease };
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
        if (connection.projectId)
          await this.validateMapping(workspace, connection, manager);
        const report = {
          id: randomUUID(),
          accountId,
          projectId: connection.projectId,
          managerId: connection.managerId,
          marketerId: connection.marketerId,
          date: prepared.date,
          currency: connection.currency,
          timezone: connection.timezone,
          fetchedAt: new Date().toISOString(),
          account: account[0] ?? null,
          ads,
          status: 'REVIEW' as const,
          reviewedBy: null,
          reviewedAt: null,
          note: '',
          taskId: null,
        };
        const previous = state.reports
          .slice()
          .reverse()
          .find(
            (item) =>
              item.accountId === accountId && item.date === prepared.date,
          );
        if (
          !previous ||
          !isDeepStrictEqual(
            [
              previous.account,
              previous.ads,
              previous.projectId,
              previous.managerId,
              previous.marketerId,
            ],
            [
              report.account,
              report.ads,
              report.projectId,
              report.managerId,
              report.marketerId,
            ],
          )
        ) {
          if (state.reports.length >= 500)
            throw new BadRequestException(
              'Archive reports before importing more.',
            );
          state.reports.push(report);
          if (report.managerId)
            this.notice(
              operations,
              report.id,
              report.managerId,
              'META',
              `Meta report for ${report.date} is ready for your review.`,
            );
        }
        connection.lastDate = prepared.date;
        connection.lastSuccessAt = new Date().toISOString();
        connection.error = null;
        connection.retryAt = null;
        connection.lease = null;
      });
    } catch (error) {
      const message =
        error instanceof MetaReportingError
          ? error.message
          : error instanceof BadRequestException
            ? error.message
            : 'Import failed or connection permissions changed. Check staff access and retry.';
      await this.transact(workspace.id, async (state) => {
        const connection = state.connections.find(
          (item) => item.accountId === accountId,
        );
        if (
          connection?.revision === prepared.revision &&
          connection.lease?.id === prepared.lease.id
        ) {
          connection.lease = null;
          connection.error = message;
          connection.retryAt = new Date(Date.now() + 3600000).toISOString();
          if (error instanceof MetaReportingError && error.reason === 'AUTH')
            connection.enabled = false;
        }
      });
      if (!scheduled) throw new BadRequestException(message);
    }
  }
  @Cron('* * * * *')
  async tick(now = new Date()) {
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
          state.workerSeenAt = now.toISOString();
        });
        for (const connection of entity.state.metaReporting.connections.filter(
          (item) => item.enabled,
        )) {
          try {
            await this.sync(workspace, connection.accountId, true, now);
          } catch {
            await this.transact(workspace.id, async (state) => {
              const current = state.connections.find(
                (item) => item.accountId === connection.accountId,
              );
              if (current?.revision !== connection.revision) return;
              current.enabled = false;
              current.error =
                'Scheduled import paused. Check owner access, project and staff assignments before enabling again.';
            });
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
