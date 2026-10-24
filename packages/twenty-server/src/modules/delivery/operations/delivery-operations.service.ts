import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
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
import { DataSource, type EntityManager } from 'typeorm';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import axios from 'axios';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { type TelegramUpdate } from 'src/modules/lead-assignment/services/telegram.service';
import {
  operationsCommandSchema,
  newDeliveryOperations,
  type DeliveryNotice,
  type DeliveryOperations,
} from 'src/modules/delivery/operations/delivery-operations.types';
import { latestRecurrence } from 'src/modules/delivery/operations/delivery-recurrence';

const HOURS_12 = 12 * 60 * 60 * 1000;
const MINUTES_5 = 5 * 60 * 1000;
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class DeliveryOperationsService {
  private readonly logger = new Logger(DeliveryOperationsService.name);
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly creative: DeliveryCreativeService,
    private readonly telegram: TelegramConfigService,
    private readonly config: TwentyConfigService,
  ) {}

  private async transact<TResult>(
    workspaceId: string,
    operation: (
      state: DeliveryOperations,
      manager: EntityManager,
    ) => Promise<TResult>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${workspaceId}`],
      );
      const repository = manager.getRepository(DeliveryOperationsEntity);
      const record =
        (await repository.findOneBy({ workspaceId })) ??
        repository.create({ workspaceId, state: newDeliveryOperations() });
      const result = await operation(record.state, manager);
      if (JSON.stringify(record.state).length > 10000000)
        throw new BadRequestException(
          'Operations history reached its storage limit. Contact an administrator for maintenance.',
        );
      await repository.save(record);
      return result;
    });
  }

  private async active(
    workspace: WorkspaceEntity,
    memberId: string,
    manager: EntityManager,
  ) {
    const members: { userWorkspaceId: string }[] = await manager.query(
      `SELECT u.id AS "userWorkspaceId" FROM ${this.delivery.schema(workspace)}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" AND u."workspaceId"=$2 WHERE m.id=$1 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL`,
      [memberId, workspace.id],
    );
    return members[0]?.userWorkspaceId ?? null;
  }

  private async actor(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
  ) {
    if ((await this.active(workspace, memberId, manager)) !== userWorkspaceId)
      throw new ForbiddenException();
    return this.delivery.actor(workspace, memberId, userWorkspaceId, manager);
  }

  private async metaNoticeAllowed(
    state: DeliveryOperations,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    reportKey: string,
    manager: EntityManager,
  ) {
    const report = state.metaReporting?.reports.find(
      (item) => `meta-report:${item.id}` === reportKey,
    );
    if (!report) return false;
    const actor = await this.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (actor.isAdmin || (actor.isManager && report.managerId === memberId))
      return true;
    if (
      report.status !== 'APPROVED' ||
      report.marketerId !== memberId ||
      !report.projectId
    )
      return false;
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: report.projectId });
    return Boolean(project?.memberIds.includes(memberId));
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    const actor = await this.actor(
      workspace,
      memberId,
      userWorkspaceId,
      this.dataSource.manager,
    );
    const snapshot = await this.delivery.snapshot(
      workspace,
      memberId,
      userWorkspaceId,
    );
    const state =
      (
        await this.dataSource
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId: workspace.id })
      )?.state ?? newDeliveryOperations();
    const taskIds = new Set(snapshot.tasks.map((task) => task.id));
    for (const report of state.metaReporting?.reports ?? []) {
      const key = `meta-report:${report.id}`;
      if (
        await this.metaNoticeAllowed(
          state,
          workspace,
          memberId,
          userWorkspaceId,
          key,
          this.dataSource.manager,
        )
      )
        taskIds.add(key);
    }
    const bot = await this.telegram.findByWorkspaceId(workspace.id);
    return {
      timezone: state.timezone,
      enabled: state.enabled,
      telegramEnabled: state.telegramEnabled,
      founderId: state.founderId,
      templates: actor.isManager ? state.templates : [],
      fulfilments: state.fulfilments.filter((item) => taskIds.has(item.taskId)),
      notices: state.notices.filter(
        (item) =>
          !item.cancelled &&
          taskIds.has(item.taskId) &&
          (item.recipientId === memberId || actor.isManager),
      ),
      alerts: actor.isAdmin
        ? state.alerts.filter((item) => taskIds.has(item.taskId))
        : [],
      connections: Object.entries(state.connections)
        .filter(([id]) => id === memberId || actor.isAdmin)
        .map(([id, connection]) => ({
          memberId: id,
          linkedAt: connection.linkedAt,
        })),
      botAvailable: Boolean(bot?.isActive && bot.botUsername),
    };
  }

  private notice(
    state: DeliveryOperations,
    taskId: string,
    recipientId: string,
    senderId: string,
    kind: DeliveryNotice['kind'],
    text: string,
    now: Date,
  ) {
    const notice: DeliveryNotice = {
      id: randomUUID(),
      taskId,
      recipientId,
      senderId,
      kind,
      text,
      createdAt: now.toISOString(),
      remindAt: new Date(
        now.getTime() +
          (kind === 'MESSAGE' || kind === 'ASSIGNMENT' ? MINUTES_5 : 0),
      ).toISOString(),
      seenAt: null,
      acknowledgedAt: null,
      cancelled: false,
      sendState: 'PENDING',
      attemptedAt: null,
      error: null,
    };
    state.notices.push(notice);
    return notice;
  }

  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    now = new Date(),
  ) {
    const parsed = operationsCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Check the operation fields and schedule.');
    const command = parsed.data;
    let link: string | null = null;
    await this.transact(workspace.id, async (state, manager) => {
      const actor = await this.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      const requireManager = () => {
        if (!actor.isManager)
          throw new ForbiddenException('A manager is required.');
      };
      if (command.action === 'settings') {
        if (!actor.isAdmin) throw new ForbiddenException();
        try {
          new Intl.DateTimeFormat('en', { timeZone: command.timezone }).format(
            now,
          );
        } catch {
          throw new BadRequestException('Select a valid IANA timezone.');
        }
        if (command.founderId) {
          const founderUser = await this.active(
            workspace,
            command.founderId,
            manager,
          );
          if (
            !founderUser ||
            !(
              await this.delivery.actor(
                workspace,
                command.founderId,
                founderUser,
                manager,
              )
            ).isAdmin
          )
            throw new BadRequestException(
              'Select an active administrator for founder alerts.',
            );
        }
        Object.assign(state, {
          timezone: command.timezone,
          enabled: command.enabled,
          telegramEnabled: command.telegramEnabled,
          founderId: command.founderId,
        });
        return;
      }
      if (command.action === 'linkTelegram') {
        const bot = await this.telegram.findByWorkspaceId(workspace.id);
        if (
          !bot?.isActive ||
          !bot.botUsername ||
          !/^[a-zA-Z0-9_]+$/.test(bot.botUsername)
        )
          throw new BadRequestException(
            'Ask an admin to configure and test the Telegram bot first.',
          );
        const token = randomBytes(24).toString('hex');
        state.linkTokens = state.linkTokens.filter(
          (item) =>
            item.memberId !== memberId && item.expiresAt > now.toISOString(),
        );
        state.linkTokens.push({
          hash: hashToken(token),
          memberId,
          expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
        });
        link = `https://t.me/${bot.botUsername}?start=delivery_${token}`;
        return;
      }
      if (command.action === 'unlinkTelegram') {
        delete state.connections[memberId];
        state.linkTokens = state.linkTokens.filter(
          (item) => item.memberId !== memberId,
        );
        return;
      }
      if (command.action === 'template') {
        requireManager();
        const template = command.template;
        const existing = template.id
          ? state.templates.find((item) => item.id === template.id)
          : null;
        if (template.id && !existing) throw new NotFoundException();
        if (!existing && state.templates.length >= 100)
          throw new BadRequestException('Maximum 100 recurring templates.');
        const visible = await this.delivery.snapshot(
          workspace,
          memberId,
          userWorkspaceId,
        );
        const project = visible.projects.find(
          (item) => item.id === template.projectId,
        );
        if (
          !project?.memberIds.includes(template.fields.assigneeId) ||
          template.fields.assigneeId === template.fields.reviewerId
        )
          throw new BadRequestException(
            'Choose a project member and a separate reviewer.',
          );
        for (const id of [
          template.fields.assigneeId,
          template.fields.reviewerId,
        ])
          if (!(await this.active(workspace, id, manager)))
            throw new BadRequestException('Select active members.');
        const reviewerUser = await this.active(
          workspace,
          template.fields.reviewerId,
          manager,
        );
        if (
          !reviewerUser ||
          !(
            await this.delivery.actor(
              workspace,
              template.fields.reviewerId,
              reviewerUser,
              manager,
            )
          ).isManager
        )
          throw new BadRequestException('The reviewer must be a manager.');
        if (existing)
          Object.assign(existing, template, {
            creatorId: memberId,
            userWorkspaceId,
            error: null,
          });
        else
          state.templates.push({
            ...template,
            id: randomUUID(),
            creatorId: memberId,
            userWorkspaceId,
            lastDate: null,
            lastTaskId: null,
            skipped: 0,
            error: null,
          });
        return;
      }
      if (command.action === 'pause') {
        requireManager();
        const template = state.templates.find((item) => item.id === command.id);
        if (!template) throw new NotFoundException();
        template.paused = command.paused;
        return;
      }
      if (command.action === 'resolveAlert') {
        if (!actor.isAdmin) throw new ForbiddenException();
        const alert = state.alerts.find((item) => item.id === command.id);
        if (!alert) throw new NotFoundException();
        alert.acknowledgedAt = now.toISOString();
        if (command.resolve) alert.resolvedAt = now.toISOString();
        for (const notice of state.notices.filter(
          (item) => item.kind === 'ALERT' && item.taskId === alert.taskId,
        ))
          notice.cancelled = true;
        return;
      }
      if (command.action === 'acknowledge') {
        const notice = state.notices.find(
          (item) =>
            item.id === command.id &&
            item.recipientId === memberId &&
            !item.cancelled,
        );
        if (!notice) throw new NotFoundException();
        if (notice.taskId.startsWith('meta-report:')) {
          if (
            !(await this.metaNoticeAllowed(
              state,
              workspace,
              memberId,
              userWorkspaceId,
              notice.taskId,
              manager,
            ))
          )
            throw new ForbiddenException();
        } else {
          await this.creative.scope(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            notice.taskId,
          );
        }
        notice.acknowledgedAt = now.toISOString();
        return;
      }
      const scope = await this.creative.scope(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        command.taskId,
      );
      if (command.action === 'seen') {
        if (scope.assigneeId === memberId)
          state.assignments[command.taskId] =
            `${memberId}:${scope.task.details.assignmentAt ?? 'legacy'}`;
        for (const notice of state.notices.filter(
          (item) =>
            item.taskId === command.taskId &&
            item.recipientId === memberId &&
            !item.cancelled,
        ))
          notice.seenAt ??= now.toISOString();
        return;
      }
      if (command.action === 'message') {
        const recipientUser = await this.active(
          workspace,
          command.recipientId,
          manager,
        );
        if (!recipientUser)
          throw new BadRequestException('Recipient is no longer active.');
        await this.creative.scope(
          manager,
          workspace,
          command.recipientId,
          recipientUser,
          command.taskId,
        );
        this.notice(
          state,
          command.taskId,
          command.recipientId,
          memberId,
          'MESSAGE',
          command.text,
          now,
        );
        return;
      }
      requireManager();
      if (command.action === 'alert') {
        if (!(await this.active(workspace, command.ownerId, manager)))
          throw new BadRequestException('Select an active owner.');
        const current = state.alerts.find(
          (item) =>
            item.taskId === command.taskId &&
            item.category === command.category &&
            !item.resolvedAt,
        );
        if (current)
          Object.assign(current, {
            reason: command.reason,
            severity: command.severity,
            ownerId: command.ownerId,
          });
        else {
          state.alerts.push({
            id: randomUUID(),
            taskId: command.taskId,
            category: command.category,
            severity: command.severity,
            reason: command.reason,
            ownerId: command.ownerId,
            createdAt: now.toISOString(),
            acknowledgedAt: null,
            resolvedAt: null,
          });
          if (state.founderId)
            this.notice(
              state,
              command.taskId,
              state.founderId,
              memberId,
              'ALERT',
              'A manager flagged a delivery issue. Review it in Otogrow.',
              now,
            );
        }
        return;
      }
      if (scope.assigneeId === memberId)
        throw new ForbiddenException(
          'A different manager must confirm delivery and fulfilment.',
        );
      let fulfilment = state.fulfilments.find(
        (item) => item.taskId === command.taskId,
      );
      if (command.action === 'delivered') {
        if (scope.task.revision !== command.revision)
          throw new ConflictException('Refresh the changed task.');
        if (scope.task.details.state !== 'APPROVED')
          throw new BadRequestException(
            'Approve the work before recording delivery.',
          );
        if (fulfilment?.status === 'WAITING')
          throw new BadRequestException(
            'Answer the current fulfilment check first.',
          );
        if (!fulfilment) {
          fulfilment = {
            taskId: command.taskId,
            status: 'WAITING',
            deliveredAt: now.toISOString(),
            nextCheckAt: null,
            cycle: 0,
            history: [],
          };
          state.fulfilments.push(fulfilment);
        }
        fulfilment.cycle++;
        fulfilment.status = 'WAITING';
        fulfilment.deliveredAt = now.toISOString();
        fulfilment.nextCheckAt = new Date(
          now.getTime() + HOURS_12,
        ).toISOString();
        fulfilment.history.push({
          at: now.toISOString(),
          actorId: memberId,
          action: 'DELIVERED',
          note: command.note,
        });
      } else if (command.action === 'fulfilment') {
        if (
          !fulfilment ||
          fulfilment.cycle !== command.cycle ||
          fulfilment.history.length !== command.historyLength ||
          fulfilment.status !== 'WAITING'
        )
          throw new ConflictException('Refresh the delivery cycle.');
        fulfilment.history.push({
          at: now.toISOString(),
          actorId: memberId,
          action: command.decision,
          note: command.note,
        });
        fulfilment.nextCheckAt =
          command.decision === 'NOT_FULFILLED'
            ? new Date(now.getTime() + HOURS_12).toISOString()
            : null;
        if (command.decision !== 'NOT_FULFILLED')
          fulfilment.status = command.decision;
        if (command.decision === 'REDOING') {
          scope.task.details.state = 'CHANGES_REQUESTED';
          scope.task.details.events.push({
            id: randomUUID(),
            actorId: memberId,
            action: 'REDOING',
            text: command.note,
            at: now.toISOString(),
          });
          scope.task.revision++;
          await manager.getRepository(DeliveryTaskEntity).save(scope.task);
          await manager.query(
            `UPDATE ${this.delivery.schema(workspace)}.task SET status='IN_PROGRESS', "updatedAt"=now() WHERE id=$1`,
            [command.taskId],
          );
        }
      }
      for (const notice of state.notices.filter(
        (item) => item.kind === 'FULFILMENT' && item.taskId === command.taskId,
      ))
        notice.cancelled = true;
    });
    return {
      ...(await this.snapshot(workspace, memberId, userWorkspaceId)),
      link,
    };
  }

  async handleTelegramUpdate(
    workspaceId: string,
    update: TelegramUpdate,
    now = new Date(),
  ) {
    const message = update.message;
    const match = message?.text?.match(
      /^\/start(?:@\w+)? delivery_([a-f0-9]{48})$/,
    );
    if (!match || !message || message.chat.id <= 0) return;
    const workspace = await this.dataSource
      .getRepository(WorkspaceEntity)
      .findOneBy({ id: workspaceId });
    if (!workspace) return;
    await this.transact(workspaceId, async (state, manager) => {
      const token = state.linkTokens.find(
        (item) =>
          item.hash === hashToken(match[1]) &&
          item.expiresAt > now.toISOString(),
      );
      if (!token || !(await this.active(workspace, token.memberId, manager)))
        return;
      if (
        Object.entries(state.connections).some(
          ([id, connection]) =>
            id !== token.memberId &&
            connection.chatId === String(message.chat.id),
        )
      )
        return;
      state.connections[token.memberId] = {
        chatId: String(message.chat.id),
        linkedAt: now.toISOString(),
      };
      state.linkTokens = state.linkTokens.filter(
        (item) => item.hash !== token.hash,
      );
    });
  }

  async tickWorkspace(workspace: WorkspaceEntity, now = new Date()) {
    await this.transact(workspace.id, async (state, manager) => {
      if (!state.enabled) return;
      for (const template of state.templates) {
        const occurrence = latestRecurrence(template, state.timezone, now);
        if (!occurrence) continue;
        try {
          const creator = await this.actor(
            workspace,
            template.creatorId,
            template.userWorkspaceId,
            manager,
          );
          if (!creator.isManager) {
            template.error = 'Template creator no longer has manager access.';
            continue;
          }
          const createdTaskId = await this.delivery.command(
            workspace,
            template.creatorId,
            template.userWorkspaceId,
            {
              action: 'create',
              projectId: template.projectId,
              fields: {
                ...template.fields,
                scheduledDate: occurrence.date,
                dueAt: new Date(
                  now.getTime() + template.dueHours * 3600000,
                ).toISOString(),
                checklist: template.fields.checklist.map((item) => ({
                  ...item,
                  id: randomUUID(),
                  done: false,
                })),
                evidence: [],
              },
            },
            manager,
          );
          if (typeof createdTaskId !== 'string')
            throw new Error(
              'Recurring task creation did not return an identity.',
            );
          template.lastTaskId = createdTaskId;
          template.lastDate = occurrence.date;
          template.skipped += occurrence.skipped;
          template.error = null;
        } catch (error) {
          if (
            !(
              error instanceof BadRequestException ||
              error instanceof ForbiddenException ||
              error instanceof NotFoundException
            )
          )
            throw error;
          template.error =
            'Assignment or access changed. Edit the template to select active members and reviewer.';
        }
      }
      const tasks: {
        id: string;
        assigneeId: string;
        dueAt: string | null;
        details: DeliveryTaskEntity['details'];
      }[] = await manager.query(
        `SELECT t.id,t."assigneeId",t."dueAt",d.details FROM core."deliveryTask" d JOIN ${this.delivery.schema(workspace)}.task t ON t.id=d."taskId" WHERE d."workspaceId"=$1 AND t."deletedAt" IS NULL`,
        [workspace.id],
      );
      for (const task of tasks) {
        const assignmentIdentity = `${task.assigneeId}:${task.details.assignmentAt ?? 'legacy'}`;
        if (state.assignments[task.id] !== assignmentIdentity) {
          for (const notice of state.notices.filter(
            (item) => item.taskId === task.id && item.kind === 'ASSIGNMENT',
          ))
            notice.cancelled = true;
          state.assignments[task.id] = assignmentIdentity;
          if (task.assigneeId)
            this.notice(
              state,
              task.id,
              task.assigneeId,
              task.details.reviewerId,
              'ASSIGNMENT',
              'You have a task assignment to review.',
              task.details.assignmentAt
                ? new Date(task.details.assignmentAt)
                : now,
            );
        }
        const fulfilment = state.fulfilments.find(
          (item) => item.taskId === task.id,
        );
        if (
          fulfilment?.status === 'WAITING' &&
          task.details.state !== 'APPROVED'
        ) {
          fulfilment.history.push({
            at: now.toISOString(),
            actorId: 'system',
            action: 'REDOING',
            note: 'Production was reopened; revised approval and redelivery are required.',
          });
          fulfilment.status = 'REDOING';
          fulfilment.nextCheckAt = null;
          for (const notice of state.notices.filter(
            (item) => item.taskId === task.id && item.kind === 'FULFILMENT',
          ))
            notice.cancelled = true;
        }
        if (
          fulfilment?.status === 'WAITING' &&
          fulfilment.nextCheckAt &&
          fulfilment.nextCheckAt <= now.toISOString()
        ) {
          for (const notice of state.notices.filter(
            (item) =>
              item.taskId === task.id &&
              item.kind === 'FULFILMENT' &&
              item.recipientId !== task.details.reviewerId,
          ))
            notice.cancelled = true;
          const existing = state.notices.find(
            (item) =>
              item.taskId === task.id &&
              item.kind === 'FULFILMENT' &&
              !item.cancelled,
          );
          if (!existing)
            this.notice(
              state,
              task.id,
              task.details.reviewerId,
              task.details.reviewerId,
              'FULFILMENT',
              'Has the delivered work been fulfilled? Choose fulfilled, not fulfilled, or redoing.',
              now,
            );
        }
        const overdue =
          task.dueAt &&
          new Date(task.dueAt).getTime() < now.getTime() &&
          (!fulfilment || fulfilment.status === 'REDOING');
        const sourceKey = `${task.id}:${task.dueAt}:${fulfilment?.cycle ?? 0}`;
        if (
          overdue &&
          !state.alerts.some(
            (item) =>
              item.taskId === task.id &&
              item.category === 'LATE' &&
              item.sourceKey === sourceKey,
          )
        ) {
          state.alerts.push({
            id: randomUUID(),
            taskId: task.id,
            category: 'LATE',
            sourceKey,
            severity: 'URGENT',
            reason: 'The delivery deadline passed without recorded delivery.',
            ownerId: task.details.reviewerId,
            createdAt: now.toISOString(),
            acknowledgedAt: null,
            resolvedAt: null,
          });
          if (state.founderId)
            this.notice(
              state,
              task.id,
              state.founderId,
              task.details.reviewerId,
              'ALERT',
              'A delivery deadline passed. Review the task in Otogrow.',
              now,
            );
        }
      }
    });
  }

  async dispatchWorkspace(workspace: WorkspaceEntity, now = new Date()) {
    const claimed = await this.transact(workspace.id, async (state) => {
      if (!state.enabled) return [];
      const ids: string[] = [];
      for (const notice of state.notices) {
        if (
          notice.sendState === 'SENDING' &&
          notice.attemptedAt &&
          new Date(notice.attemptedAt).getTime() < now.getTime() - 120000
        ) {
          notice.sendState = 'UNCERTAIN';
          notice.error =
            'Worker interrupted after claiming send. Check Telegram before any manual follow-up.';
        }
        if (
          notice.sendState !== 'PENDING' ||
          notice.remindAt > now.toISOString()
        )
          continue;
        if (notice.cancelled || notice.seenAt || notice.acknowledgedAt) {
          notice.sendState = 'SUPPRESSED';
          continue;
        }
        if (!state.telegramEnabled || !state.connections[notice.recipientId]) {
          notice.sendState = 'UNCONFIGURED';
          notice.error =
            'Telegram is disabled or recipient is not linked. The OS notification remains available.';
          continue;
        }
        if (ids.length >= 20) continue;
        notice.sendState = 'SENDING';
        notice.attemptedAt = now.toISOString();
        ids.push(notice.id);
      }
      return ids;
    });
    for (const id of claimed)
      await this.transact(workspace.id, async (state, manager) => {
        const notice = state.notices.find((item) => item.id === id);
        if (!notice || notice.sendState !== 'SENDING') return;
        try {
          const userWorkspaceId = await this.active(
            workspace,
            notice.recipientId,
            manager,
          );
          if (!userWorkspaceId) throw new ForbiddenException();
          const isMetaReport = notice.taskId.startsWith('meta-report:');
          if (
            isMetaReport &&
            !(await this.metaNoticeAllowed(
              state,
              workspace,
              notice.recipientId,
              userWorkspaceId,
              notice.taskId,
              manager,
            ))
          )
            throw new ForbiddenException();
          const scope = isMetaReport
            ? null
            : await this.creative.scope(
                manager,
                workspace,
                notice.recipientId,
                userWorkspaceId,
                notice.taskId,
              );
          if (
            (notice.kind === 'ASSIGNMENT' &&
              (scope?.assigneeId !== notice.recipientId ||
                (scope?.task.details.assignmentAt &&
                  scope.task.details.assignmentAt !== notice.createdAt))) ||
            (notice.kind === 'ALERT' && !scope?.actor.isAdmin) ||
            (notice.kind === 'FULFILMENT' &&
              (!scope?.actor.isManager ||
                scope.task.details.reviewerId !== notice.recipientId)) ||
            notice.cancelled ||
            notice.seenAt ||
            notice.acknowledgedAt ||
            !state.enabled ||
            !state.telegramEnabled
          ) {
            notice.sendState = 'SUPPRESSED';
            return;
          }
          const bot = await this.telegram.findByWorkspaceId(workspace.id);
          const connection = state.connections[notice.recipientId];
          if (!bot?.isActive || !connection) {
            notice.sendState = 'UNCONFIGURED';
            notice.error = 'Bot or recipient connection unavailable.';
            return;
          }
          const base =
            this.config.get('FRONTEND_URL') ?? this.config.get('SERVER_URL');
          const url = new URL('/delivery', base);
          if (isMetaReport) url.searchParams.set('view', 'ads');
          else url.searchParams.set('task', notice.taskId);
          const response = await axios.post(
            `https://api.telegram.org/bot${this.telegram.decryptBotToken(bot)}/sendMessage`,
            {
              chat_id: connection.chatId,
              text: `Otogrow: ${notice.kind === 'MESSAGE' ? 'An internal task message needs your attention.' : notice.kind === 'ASSIGNMENT' ? 'A task assignment needs your attention.' : 'A delivery check needs your attention.'}\n${url}`,
              link_preview_options: { is_disabled: true },
            },
            { timeout: 10000, maxRedirects: 0, proxy: false },
          );
          notice.sendState = response.data?.ok === true ? 'SENT' : 'FAILED';
          if (notice.sendState === 'FAILED')
            notice.error = 'Telegram rejected the notification.';
        } catch (error) {
          if (
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
          ) {
            notice.sendState = 'SUPPRESSED';
            return;
          }
          notice.sendState =
            axios.isAxiosError(error) &&
            error.response &&
            error.response.status >= 400 &&
            error.response.status < 500
              ? 'FAILED'
              : 'UNCERTAIN';
          notice.error =
            notice.sendState === 'FAILED'
              ? 'Telegram rejected the notification. Check the bot connection.'
              : 'Delivery is uncertain. Check Telegram before following up; no automatic resend.';
        }
      });
  }

  @Cron('* * * * *')
  async tick() {
    const records = await this.dataSource
      .getRepository(DeliveryOperationsEntity)
      .find();
    for (const record of records.filter((item) => item.state.enabled)) {
      try {
        const workspace = await this.dataSource
          .getRepository(WorkspaceEntity)
          .findOneBy({ id: record.workspaceId });
        if (!workspace) continue;
        await this.tickWorkspace(workspace);
        await this.dispatchWorkspace(workspace);
      } catch {
        this.logger.warn(
          `Delivery scheduler could not process workspace ${record.workspaceId}.`,
        );
      }
    }
  }
}
