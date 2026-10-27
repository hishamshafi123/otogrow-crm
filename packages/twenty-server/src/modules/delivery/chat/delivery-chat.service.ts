import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { DeliveryChatMessageEntity } from 'src/modules/delivery/chat/entities/delivery-chat-message.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import {
  DeliveryReminderOutboxEntity,
  type DeliveryReminderState,
} from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type DeliveryChatSnapshotDTO } from 'src/modules/delivery/chat/delivery-chat.dto';

const CHAT_PAGE_SIZE = 50;
const CHAT_REMINDER_DELAY = 5 * 60 * 1000;
const CHAT_QUERY = z
  .object({
    peerId: z.string().uuid().nullish(),
    before: z
      .string()
      .regex(/^[1-9][0-9]{0,17}$/)
      .nullish(),
    search: z.string().trim().max(80).nullish(),
  })
  .strict();
const CHAT_SEND = z
  .object({
    recipientId: z.string().uuid(),
    requestId: z.string().uuid(),
    text: z.string().trim().min(1).max(4000),
  })
  .strict();
const CHAT_VIEW = z
  .object({ messageIds: z.array(z.string().uuid()).min(1).max(CHAT_PAGE_SIZE) })
  .strict();

type ChatHead = {
  peerId: string;
  name: string;
  createdAt: Date;
  unread: string;
};

@Injectable()
export class DeliveryChatService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: OtogrowAccessService,
    private readonly telegram: TelegramConfigService,
    private readonly config: TwentyConfigService,
  ) {}

  private authorize(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
  ) {
    return this.access.accessForUser(
      workspaceId,
      memberId,
      userWorkspaceId,
      manager,
    );
  }

  async snapshot(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ): Promise<DeliveryChatSnapshotDTO> {
    const parsed = CHAT_QUERY.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Choose a teammate and valid chat page.');
    const query = parsed.data;
    return readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        const members = await this.access.listActiveMembers(
          workspaceId,
          manager,
        );
        const heads: ChatHead[] = await manager.query(
          `
        SELECT DISTINCT ON ("peerId") "peerId", name, "createdAt", unread FROM (
          SELECT CASE WHEN "senderId"=$2 THEN "recipientId" ELSE "senderId" END AS "peerId",
          CASE WHEN "senderId"=$2 THEN "recipientName" ELSE "senderName" END AS name,
          "createdAt", position,
          COUNT(*) FILTER (WHERE "recipientId"=$2 AND "viewedAt" IS NULL) OVER (PARTITION BY LEAST("senderId","recipientId"),GREATEST("senderId","recipientId")) AS unread
          FROM core."deliveryChatMessage" WHERE "workspaceId"=$1 AND ("senderId"=$2 OR "recipientId"=$2)
        ) conversations ORDER BY "peerId", position DESC`,
          [workspaceId, memberId],
        );
        const people = new Map(
          members
            .filter((member) => member.memberId !== memberId)
            .map((member) => [
              member.memberId,
              {
                id: member.memberId,
                name: member.name,
                active: true,
                unread: 0,
                lastMessageAt: null as string | null,
              },
            ]),
        );
        for (const head of heads) {
          const person = people.get(head.peerId) ?? {
            id: head.peerId,
            name: head.name,
            active: false,
            unread: 0,
            lastMessageAt: null,
          };
          people.set(head.peerId, {
            ...person,
            unread: Number(head.unread),
            lastMessageAt: head.createdAt.toISOString(),
          });
        }
        const peer = query.peerId ? people.get(query.peerId) : null;
        if (query.peerId && !peer)
          throw new ForbiddenException(
            'This teammate is not available in your workspace.',
          );
        const matching = [...people.values()]
          .filter(
            (person) =>
              !query.search ||
              person.name
                .toLocaleLowerCase()
                .includes(query.search.toLocaleLowerCase()),
          )
          .sort(
            (left, right) =>
              Number(right.unread > 0) - Number(left.unread > 0) ||
              (right.lastMessageAt ?? '').localeCompare(
                left.lastMessageAt ?? '',
              ) ||
              left.name.localeCompare(right.name) ||
              left.id.localeCompare(right.id),
          );
        const messages = peer
          ? await manager
              .getRepository(DeliveryChatMessageEntity)
              .createQueryBuilder('message')
              .where('message.workspaceId = :workspaceId', { workspaceId })
              .andWhere(
                '((message.senderId = :memberId AND message.recipientId = :peerId) OR (message.recipientId = :memberId AND message.senderId = :peerId))',
                { memberId, peerId: peer.id },
              )
              .andWhere(query.before ? 'message.position < :before' : 'TRUE', {
                before: query.before,
              })
              .orderBy('message.position', 'DESC')
              .take(CHAT_PAGE_SIZE + 1)
              .getMany()
          : [];
        const page = messages.slice(0, CHAT_PAGE_SIZE);
        const reminders = page.length
          ? await manager.getRepository(DeliveryReminderOutboxEntity).findBy({
              workspaceId,
              noticeId: In(page.map((message) => message.id)),
            })
          : [];
        const operations = await manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId });
        const bot = await this.telegram.findByWorkspaceId(workspaceId);
        return {
          workspaceId,
          memberId,
          userWorkspaceId,
          people: matching.slice(0, CHAT_PAGE_SIZE),
          peopleTotal: matching.length,
          peer: peer ?? null,
          before: query.before ?? null,
          olderCursor:
            messages.length > CHAT_PAGE_SIZE
              ? page[page.length - 1].position
              : null,
          telegramReady: Boolean(
            operations?.state.telegramEnabled &&
            operations.state.connections[memberId] &&
            bot?.isActive,
          ),
          messages: page.reverse().map((message) => ({
            id: message.id,
            position: message.position,
            senderId: message.senderId,
            recipientId: message.recipientId,
            senderName: message.senderName,
            text: message.text,
            createdAt: message.createdAt.toISOString(),
            viewedAt: message.viewedAt?.toISOString() ?? null,
            reminderState: message.viewedAt
              ? 'VIEWED'
              : (reminders.find((reminder) => reminder.noticeId === message.id)
                  ?.status ?? 'WAITING'),
          })),
        };
      },
    );
  }

  async send(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    now = new Date(),
  ) {
    const parsed = CHAT_SEND.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Write a message of up to 4,000 characters and choose a teammate.',
      );
    const command = parsed.data;
    if (command.recipientId === memberId)
      throw new BadRequestException('Choose another teammate.');
    return readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`chat-send:${workspaceId}:${memberId}`],
        );
        const members = await this.access.listActiveMembers(
          workspaceId,
          manager,
        );
        const recipient = members.find(
          (member) => member.memberId === command.recipientId,
        );
        const sender = members.find((member) => member.memberId === memberId);
        if (!recipient || !sender)
          throw new ForbiddenException(
            'Choose an active teammate in your workspace.',
          );
        const repository = manager.getRepository(DeliveryChatMessageEntity);
        const existing = await repository.findOneBy({
          workspaceId,
          senderId: memberId,
          requestId: command.requestId,
        });
        if (existing) {
          if (
            existing.recipientId !== command.recipientId ||
            existing.text !== command.text
          )
            throw new ConflictException(
              'This send attempt already contains a different message.',
            );
          return existing.id;
        }
        const recent = await repository
          .createQueryBuilder('message')
          .where(
            'message.workspaceId = :workspaceId AND message.senderId = :memberId AND message.createdAt > :since',
            { workspaceId, memberId, since: new Date(now.getTime() - 60000) },
          )
          .getCount();
        if (recent >= 60)
          throw new BadRequestException(
            'Too many messages. Wait a minute before sending more.',
          );
        const id = randomUUID();
        await repository.insert({
          id,
          workspaceId,
          senderId: memberId,
          recipientId: recipient.memberId,
          senderName: sender.name,
          recipientName: recipient.name,
          requestId: command.requestId,
          text: command.text,
          createdAt: now,
          viewedAt: null,
        });
        await recordOtogrowActivity(manager, {
          workspaceId,
          actorId: memberId,
          subjectMemberId: recipient.memberId,
          category: 'DELIVERY',
          action: 'TEAM_MESSAGE_SENT',
          outcome: 'RECORDED',
          summary: 'Sent a direct team message.',
          sourceType: 'team-chat',
          sourceId: id,
        });
        return id;
      },
    );
  }

  async view(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    now = new Date(),
  ) {
    const parsed = CHAT_VIEW.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Choose the visible messages to mark viewed.',
      );
    const ids = [...new Set(parsed.data.messageIds)];
    return readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        const repository = manager.getRepository(DeliveryChatMessageEntity);
        const messages = await repository.find({
          where: { workspaceId, id: In(ids), recipientId: memberId },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (messages.length !== ids.length)
          throw new ForbiddenException(
            'Only the recipient can view these messages.',
          );
        const unread = messages.filter((message) => !message.viewedAt);
        if (unread.length)
          await repository.update(
            { workspaceId, id: In(unread.map((message) => message.id)) },
            { viewedAt: now },
          );
        return true;
      },
    );
  }

  async queueDue(now = new Date()) {
    // Unique notice IDs keep scheduler retries from creating a second ping.
    await this.dataSource.query(
      `INSERT INTO core."deliveryReminderOutbox" (id,"workspaceId","noticeId",status,"createdAt","updatedAt")
      SELECT gen_random_uuid(), message."workspaceId",message.id,'QUEUED',$1,$1 FROM core."deliveryChatMessage" message
      WHERE message."viewedAt" IS NULL AND message."createdAt" <= $2 AND NOT EXISTS (SELECT 1 FROM core."deliveryReminderOutbox" reminder WHERE reminder."workspaceId"=message."workspaceId" AND reminder."noticeId"=message.id)
      ORDER BY message."createdAt",message.id LIMIT 200 ON CONFLICT ("workspaceId","noticeId") DO NOTHING`,
      [now, new Date(now.getTime() - CHAT_REMINDER_DELAY)],
    );
  }

  async ownsReminder(outboxId: string) {
    const reminder = await this.dataSource
      .getRepository(DeliveryReminderOutboxEntity)
      .findOneBy({ id: outboxId });
    return Boolean(
      reminder &&
      (await this.dataSource.getRepository(DeliveryChatMessageEntity).existsBy({
        workspaceId: reminder.workspaceId,
        id: reminder.noticeId,
      })),
    );
  }

  async claimReminder(outboxId: string, now = new Date()) {
    const initial = await this.dataSource
      .getRepository(DeliveryReminderOutboxEntity)
      .findOneBy({ id: outboxId });
    if (!initial || initial.status !== 'QUEUED') return null;
    return readDeliverySnapshot(
      this.dataSource,
      initial.workspaceId,
      async (manager) => {
        // Viewing and claiming lock the same message, so a completed read suppresses its ping.
        const message = await manager
          .getRepository(DeliveryChatMessageEntity)
          .findOne({
            where: { workspaceId: initial.workspaceId, id: initial.noticeId },
            lock: { mode: 'pessimistic_write' },
          });
        const repository = manager.getRepository(DeliveryReminderOutboxEntity);
        const reminder = await repository.findOne({
          where: { id: outboxId, status: 'QUEUED' },
          lock: { mode: 'pessimistic_write' },
        });
        if (!reminder) return null;
        const finish = async (
          status: DeliveryReminderState,
          error: string | null = null,
        ) => {
          await repository.update(
            { id: reminder.id },
            { status, error, finishedAt: now },
          );
          return null;
        };
        if (
          !message ||
          message.viewedAt ||
          message.createdAt.getTime() + CHAT_REMINDER_DELAY > now.getTime()
        )
          return finish('SUPPRESSED');
        let members;
        try {
          members = await this.access.listActiveMembers(
            initial.workspaceId,
            manager,
          );
        } catch (error) {
          if (error instanceof ForbiddenException) return finish('SUPPRESSED');
          throw error;
        }
        if (
          ![message.recipientId, message.senderId].every((id) =>
            members.some((member) => member.memberId === id),
          )
        )
          return finish('SUPPRESSED');
        const operations = await manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId: initial.workspaceId });
        const connection = operations?.state.connections[message.recipientId];
        const bot = await this.telegram.findByWorkspaceId(initial.workspaceId);
        if (!operations?.state.telegramEnabled || !connection || !bot?.isActive)
          return finish(
            'UNCONFIGURED',
            'Link Telegram and enable the bot to receive future message pings.',
          );
        const url = new URL(
          '/delivery',
          this.config.get('FRONTEND_URL') ?? this.config.get('SERVER_URL'),
        );
        url.searchParams.set('view', 'chat');
        url.searchParams.set('chatWith', message.senderId);
        await repository.update(
          { id: reminder.id },
          { status: 'SENDING', attemptedAt: now },
        );
        return {
          botToken: this.telegram.decryptBotToken(bot),
          chatId: connection.chatId,
          text: `Otogrow: An unread team message needs your attention.\n${url}`,
        };
      },
    );
  }

  async finishReminder(
    outboxId: string,
    status: 'SENT' | 'FAILED' | 'UNCERTAIN',
    error: string | null,
    now = new Date(),
    expiredBefore?: Date,
  ) {
    const update = this.dataSource
      .getRepository(DeliveryReminderOutboxEntity)
      .createQueryBuilder()
      .update()
      .set({ status, error, finishedAt: now })
      .where('id = :outboxId AND status = :current', {
        outboxId,
        current: 'SENDING',
      });
    if (expiredBefore)
      update.andWhere('"attemptedAt" < :expiredBefore', { expiredBefore });
    await update.execute();
  }
}
