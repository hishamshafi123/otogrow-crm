import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { FileTypeParser } from 'file-type';
import { DataSource, In, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import {
  type DeliveryChatAttachmentKind,
  DeliveryChatAttachmentEntity,
} from 'src/modules/delivery/chat/entities/delivery-chat-attachment.entity';
import {
  type DeliveryChatMessageAttachmentMeta,
  DeliveryChatMessageEntity,
  type DeliveryChatMessageReactionMeta,
} from 'src/modules/delivery/chat/entities/delivery-chat-message.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  DeliveryReminderOutboxEntity,
  type DeliveryReminderState,
} from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import {
  type DeliveryChatAttachmentDTO,
  type DeliveryChatMessageDTO,
  type DeliveryChatProjectPillDTO,
  type DeliveryChatReplyPreviewDTO,
  type DeliveryChatSnapshotDTO,
} from 'src/modules/delivery/chat/delivery-chat.dto';

export const CHAT_PAGE_SIZE = 50;
export const CHAT_REMINDER_DELAY = 5 * 60 * 1000;
export const CHAT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
const CHAT_MAX_ATTACHMENTS_PER_MESSAGE = 5;
const CHAT_MAX_UPLOADS_PER_MINUTE = 30;
const CHAT_MAX_VOICE_DURATION_MS = 10 * 60 * 1000;

const GENERAL_PROJECT_KEY = 'GENERAL';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHAT_QUERY = z
  .object({
    peerId: z.string().uuid().nullish(),
    projectId: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === '' ||
          value === 'ALL' ||
          value === GENERAL_PROJECT_KEY ||
          UUID_REGEX.test(value),
      )
      .nullish(),
    before: z
      .string()
      .regex(/^[1-9][0-9]{0,17}$/)
      .nullish(),
    search: z.string().trim().max(80).nullish(),
    messageSearch: z.string().trim().max(120).nullish(),
    filter: z.enum(['ALL', 'FILES', 'VOICE', 'PINNED']).nullish(),
  })
  .strict();

const CHAT_SEND = z
  .object({
    recipientId: z.string().uuid(),
    requestId: z.string().uuid(),
    text: z.string().trim().max(4000).optional().default(''),
    projectId: z.string().uuid().nullish(),
    replyToMessageId: z.string().uuid().nullish(),
    attachmentIds: z
      .array(z.string().uuid())
      .max(CHAT_MAX_ATTACHMENTS_PER_MESSAGE)
      .nullish(),
  })
  .strict()
  .refine(
    (value) => value.text.length > 0 || (value.attachmentIds?.length ?? 0) > 0,
    { message: 'Message text or at least one attachment is required.' },
  );

const CHAT_VIEW = z
  .object({ messageIds: z.array(z.string().uuid()).min(1).max(CHAT_PAGE_SIZE) })
  .strict();

const CHAT_EDIT = z
  .object({
    messageId: z.string().uuid(),
    text: z.string().trim().min(1).max(4000),
  })
  .strict();

const CHAT_MESSAGE_ID = z
  .object({
    messageId: z.string().uuid(),
  })
  .strict();

const CHAT_REACTION = z
  .object({
    messageId: z.string().uuid(),
    emoji: z
      .string()
      .trim()
      .min(1)
      .max(16)
      .refine((value) => !/[<>]/.test(value)),
  })
  .strict();

const CHAT_UPLOAD_BODY = z
  .object({
    recipientId: z.string().uuid(),
    kind: z.enum(['AUTO', 'VOICE']).optional().default('AUTO'),
    durationMs: z.coerce
      .number()
      .int()
      .min(0)
      .max(CHAT_MAX_VOICE_DURATION_MS)
      .optional(),
    waveform: z.string().max(1024).optional(),
  })
  .strict();

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const ALLOWED_VOICE_MIMES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/x-m4a',
  'audio/flac',
]);

const ALLOWED_FILE_MIMES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const SAFE_TEXT_EXTENSIONS: Record<string, string> = {
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.log': 'text/plain',
};

const ACTIVE_MARKUP_PATTERN =
  /<(?:!doctype|html|head|body|script|svg|iframe|object|embed|form)\b/i;

type ChatHead = {
  peerId: string;
  name: string;
  createdAt: Date;
  unread: string;
  lastText: string;
  lastAttachments: DeliveryChatMessageAttachmentMeta[] | null;
  lastProjectName: string | null;
  lastDeletedAt: Date | null;
};

type ProjectSummaryRow = {
  projectId: string | null;
  projectName: string | null;
  messageCount: string;
  unread: string;
  lastMessageAt: Date | null;
};

const formatDurationShort = (durationMs: number | null | undefined): string => {
  if (!durationMs || durationMs <= 0) return '0:00';
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const buildMessagePreview = (
  text: string,
  attachments: DeliveryChatMessageAttachmentMeta[] | null | undefined,
  deletedAt: Date | null | undefined,
): string => {
  if (deletedAt) return 'Message deleted';
  const trimmed = (text ?? '').trim();
  if (trimmed) {
    return trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed;
  }
  const items = Array.isArray(attachments) ? attachments : [];
  if (items.length === 0) return '';
  const voice = items.find((item) => item.kind === 'VOICE');
  if (voice) {
    return `Voice message (${formatDurationShort(voice.durationMs)})`;
  }
  const images = items.filter((item) => item.kind === 'IMAGE');
  if (images.length === items.length) {
    return images.length === 1 ? 'Photo' : `${images.length} photos`;
  }
  if (items.length === 1) {
    const name = items[0].name;
    return name.length > 60 ? `${name.slice(0, 57)}…` : name;
  }
  return `${items.length} attachments`;
};

const sanitizeFileName = (raw: string, fallback: string): string => {
  const cleaned = (raw ?? '')
    .replace(/[\r\n/\\<>:"|?*\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 200);
  return cleaned || fallback;
};

const parseWaveform = (raw: string | undefined): number[] | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 4 || parsed.length > 64) {
      return null;
    }
    const normalized = parsed.map((entry) => {
      const num = Number(entry);
      if (!Number.isFinite(num)) return 15;
      return Math.max(5, Math.min(100, Math.round(num)));
    });
    return normalized;
  } catch {
    return null;
  }
};

@Injectable()
export class DeliveryChatService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: OtogrowAccessService,
    private readonly telegram: TelegramConfigService,
    private readonly config: TwentyConfigService,
    private readonly storage: FileStorageDriverFactory,
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

  private mapReplyPreview(
    target: DeliveryChatMessageEntity | undefined,
  ): DeliveryChatReplyPreviewDTO | null {
    if (!target) return null;
    const attachments = Array.isArray(target.attachments)
      ? target.attachments
      : [];
    return {
      id: target.id,
      senderId: target.senderId,
      senderName: target.senderName,
      text: target.deletedAt ? '' : target.text.slice(0, 180),
      hasAttachments: !target.deletedAt && attachments.length > 0,
      hasVoice:
        !target.deletedAt && attachments.some((item) => item.kind === 'VOICE'),
      deleted: Boolean(target.deletedAt),
    };
  }

  private mapMessageDto(
    message: DeliveryChatMessageEntity,
    reminderMap: Map<string, string>,
    replyMap: Map<string, DeliveryChatMessageEntity>,
    projectNameMap: Map<string, string>,
  ): DeliveryChatMessageDTO {
    const liveProjectName = message.projectId
      ? (projectNameMap.get(message.projectId) ?? message.projectName ?? null)
      : null;
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
          durationMs: item.durationMs ?? null,
          waveform: item.waveform ?? null,
        }))
      : [];
    const reactions = Array.isArray(message.reactions)
      ? message.reactions.map((item) => ({
          emoji: item.emoji,
          memberId: item.memberId,
          memberName: item.memberName,
          createdAt: item.createdAt,
        }))
      : [];
    return {
      id: message.id,
      position: message.position,
      senderId: message.senderId,
      recipientId: message.recipientId,
      senderName: message.senderName,
      text: message.deletedAt ? '' : message.text,
      projectId: message.projectId ?? null,
      projectName: liveProjectName,
      replyTo: message.replyToMessageId
        ? this.mapReplyPreview(replyMap.get(message.replyToMessageId))
        : null,
      attachments: message.deletedAt ? [] : attachments,
      reactions,
      createdAt: message.createdAt.toISOString(),
      viewedAt: message.viewedAt?.toISOString() ?? null,
      editedAt: message.editedAt?.toISOString() ?? null,
      deletedAt: message.deletedAt?.toISOString() ?? null,
      pinnedAt: message.pinnedAt?.toISOString() ?? null,
      pinnedById: message.pinnedById ?? null,
      reminderState: message.deletedAt
        ? 'SUPPRESSED'
        : message.viewedAt
          ? 'VIEWED'
          : (reminderMap.get(message.id) ?? 'WAITING'),
    };
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
    const normalizedProjectFilter =
      !query.projectId || query.projectId === 'ALL' ? null : query.projectId;
    const normalizedFilter = query.filter ?? 'ALL';

    return readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        const members = await this.access.listActiveMembers(
          workspaceId,
          manager,
        );
        const workspaceProjects = await manager
          .getRepository(DeliveryProjectEntity)
          .find({
            where: { workspaceId },
            select: { id: true, name: true, memberIds: true },
            order: { name: 'ASC', id: 'ASC' },
            take: 500,
          });
        const projectNameMap = new Map(
          workspaceProjects.map((project) => [project.id, project.name]),
        );
        const memberProjectCount = new Map<string, number>();
        for (const project of workspaceProjects) {
          const ids = Array.isArray(project.memberIds) ? project.memberIds : [];
          for (const assignedId of ids) {
            memberProjectCount.set(
              assignedId,
              (memberProjectCount.get(assignedId) ?? 0) + 1,
            );
          }
        }

        const heads: ChatHead[] = await manager.query(
          `
          SELECT DISTINCT ON ("peerId")
            "peerId",
            name,
            "createdAt",
            unread,
            "lastText",
            "lastAttachments",
            "lastProjectName",
            "lastDeletedAt"
          FROM (
            SELECT
              CASE WHEN "senderId"=$2 THEN "recipientId" ELSE "senderId" END AS "peerId",
              CASE WHEN "senderId"=$2 THEN "recipientName" ELSE "senderName" END AS name,
              "createdAt",
              position,
              text AS "lastText",
              attachments AS "lastAttachments",
              "projectName" AS "lastProjectName",
              "deletedAt" AS "lastDeletedAt",
              COUNT(*) FILTER (WHERE "recipientId"=$2 AND "viewedAt" IS NULL AND "deletedAt" IS NULL)
                OVER (PARTITION BY LEAST("senderId","recipientId"), GREATEST("senderId","recipientId")) AS unread
            FROM core."deliveryChatMessage"
            WHERE "workspaceId"=$1 AND ("senderId"=$2 OR "recipientId"=$2)
          ) conversations
          ORDER BY "peerId", position DESC`,
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
                lastMessagePreview: null as string | null,
                lastMessageProjectName: null as string | null,
                projectCount: memberProjectCount.get(member.memberId) ?? 0,
              },
            ]),
        );

        for (const head of heads) {
          const existing = people.get(head.peerId) ?? {
            id: head.peerId,
            name: head.name,
            active: false,
            unread: 0,
            lastMessageAt: null,
            lastMessagePreview: null,
            lastMessageProjectName: null,
            projectCount: memberProjectCount.get(head.peerId) ?? 0,
          };
          people.set(head.peerId, {
            ...existing,
            unread: Number(head.unread),
            lastMessageAt: head.createdAt.toISOString(),
            lastMessagePreview: buildMessagePreview(
              head.lastText,
              head.lastAttachments,
              head.lastDeletedAt,
            ),
            lastMessageProjectName: head.lastProjectName ?? null,
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

        let projects: DeliveryChatProjectPillDTO[] = [];
        let generalUnread = 0;
        let generalMessageCount = 0;
        let totalUnreadWithPeer = 0;
        let messages: DeliveryChatMessageEntity[] = [];
        let pinnedRaw: DeliveryChatMessageEntity[] = [];

        if (peer) {
          const projectSummaries: ProjectSummaryRow[] = await manager.query(
            `
            SELECT
              "projectId",
              MAX("projectName") AS "projectName",
              COUNT(*) FILTER (WHERE "deletedAt" IS NULL) AS "messageCount",
              COUNT(*) FILTER (WHERE "recipientId"=$2 AND "viewedAt" IS NULL AND "deletedAt" IS NULL) AS unread,
              MAX("createdAt") FILTER (WHERE "deletedAt" IS NULL) AS "lastMessageAt"
            FROM core."deliveryChatMessage"
            WHERE "workspaceId"=$1
              AND (("senderId"=$2 AND "recipientId"=$3) OR ("senderId"=$3 AND "recipientId"=$2))
            GROUP BY "projectId"`,
            [workspaceId, memberId, peer.id],
          );

          const summaryByProjectId = new Map<string, ProjectSummaryRow>();
          for (const row of projectSummaries) {
            const unreadNum = Number(row.unread);
            totalUnreadWithPeer += unreadNum;
            if (!row.projectId) {
              generalUnread = unreadNum;
              generalMessageCount = Number(row.messageCount);
            } else {
              summaryByProjectId.set(row.projectId, row);
            }
          }

          const pillMap = new Map<string, DeliveryChatProjectPillDTO>();
          for (const project of workspaceProjects) {
            const isPeerMember =
              Array.isArray(project.memberIds) &&
              project.memberIds.includes(peer.id);
            const summary = summaryByProjectId.get(project.id);
            const isExplicitlySelected = normalizedProjectFilter === project.id;
            if (isPeerMember || summary || isExplicitlySelected) {
              pillMap.set(project.id, {
                id: project.id,
                name: project.name,
                unread: summary ? Number(summary.unread) : 0,
                messageCount: summary ? Number(summary.messageCount) : 0,
                lastMessageAt: summary?.lastMessageAt
                  ? new Date(summary.lastMessageAt).toISOString()
                  : null,
                isMember: isPeerMember,
              });
            }
          }
          // Preserve history pills even if a project was removed later
          for (const [projId, summary] of summaryByProjectId.entries()) {
            if (!pillMap.has(projId)) {
              pillMap.set(projId, {
                id: projId,
                name: summary.projectName ?? 'Archived project',
                unread: Number(summary.unread),
                messageCount: Number(summary.messageCount),
                lastMessageAt: summary.lastMessageAt
                  ? new Date(summary.lastMessageAt).toISOString()
                  : null,
                isMember: false,
              });
            }
          }

          projects = [...pillMap.values()].sort(
            (left, right) =>
              Number(right.unread > 0) - Number(left.unread > 0) ||
              (right.lastMessageAt ?? '').localeCompare(
                left.lastMessageAt ?? '',
              ) ||
              Number(right.isMember) - Number(left.isMember) ||
              left.name.localeCompare(right.name),
          );

          const messageQuery = manager
            .getRepository(DeliveryChatMessageEntity)
            .createQueryBuilder('message')
            .where('message.workspaceId = :workspaceId', { workspaceId })
            .andWhere(
              '((message.senderId = :memberId AND message.recipientId = :peerId) OR (message.recipientId = :memberId AND message.senderId = :peerId))',
              { memberId, peerId: peer.id },
            );

          if (normalizedProjectFilter === GENERAL_PROJECT_KEY) {
            messageQuery.andWhere('message.projectId IS NULL');
          } else if (normalizedProjectFilter) {
            messageQuery.andWhere('message.projectId = :projectId', {
              projectId: normalizedProjectFilter,
            });
          }

          if (query.before) {
            messageQuery.andWhere('message.position < :before', {
              before: query.before,
            });
          }

          if (normalizedFilter === 'FILES') {
            messageQuery.andWhere(
              `message.deletedAt IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(message.attachments) elem WHERE elem->>'kind' IN ('FILE', 'IMAGE'))`,
            );
          } else if (normalizedFilter === 'VOICE') {
            messageQuery.andWhere(
              `message.deletedAt IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(message.attachments) elem WHERE elem->>'kind' = 'VOICE')`,
            );
          } else if (normalizedFilter === 'PINNED') {
            messageQuery.andWhere(
              'message.deletedAt IS NULL AND message.pinnedAt IS NOT NULL',
            );
          }

          if (query.messageSearch) {
            const escaped = query.messageSearch.replace(/[%_\\]/g, '\\$&');
            messageQuery.andWhere(
              `(message.deletedAt IS NULL AND (message.text ILIKE :searchPattern ESCAPE '\\' OR COALESCE(message.projectName, '') ILIKE :searchPattern ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_array_elements(message.attachments) elem WHERE elem->>'name' ILIKE :searchPattern ESCAPE '\\')))`,
              { searchPattern: `%${escaped}%` },
            );
          }

          messages = await messageQuery
            .orderBy('message.position', 'DESC')
            .take(CHAT_PAGE_SIZE + 1)
            .getMany();

          const pinnedQuery = manager
            .getRepository(DeliveryChatMessageEntity)
            .createQueryBuilder('message')
            .where('message.workspaceId = :workspaceId', { workspaceId })
            .andWhere(
              '((message.senderId = :memberId AND message.recipientId = :peerId) OR (message.recipientId = :memberId AND message.senderId = :peerId))',
              { memberId, peerId: peer.id },
            )
            .andWhere(
              'message.deletedAt IS NULL AND message.pinnedAt IS NOT NULL',
            );
          if (normalizedProjectFilter === GENERAL_PROJECT_KEY) {
            pinnedQuery.andWhere('message.projectId IS NULL');
          } else if (normalizedProjectFilter) {
            pinnedQuery.andWhere('message.projectId = :projectId', {
              projectId: normalizedProjectFilter,
            });
          }
          pinnedRaw = await pinnedQuery
            .orderBy('message.pinnedAt', 'DESC')
            .take(20)
            .getMany();
        }

        const page = messages.slice(0, CHAT_PAGE_SIZE);
        const allMessageIds = [
          ...new Set([
            ...page.map((message) => message.id),
            ...pinnedRaw.map((message) => message.id),
          ]),
        ];
        const reminders = allMessageIds.length
          ? await manager.getRepository(DeliveryReminderOutboxEntity).findBy({
              workspaceId,
              noticeId: In(allMessageIds),
            })
          : [];
        const reminderMap = new Map(
          reminders.map((reminder) => [reminder.noticeId, reminder.status]),
        );

        const replyIds = [
          ...new Set(
            [...page, ...pinnedRaw]
              .map((message) => message.replyToMessageId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const replyRows = replyIds.length
          ? await manager.getRepository(DeliveryChatMessageEntity).findBy({
              workspaceId,
              id: In(replyIds),
            })
          : [];
        const replyMap = new Map(replyRows.map((row) => [row.id, row]));

        const operations = await manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId });
        const bot = await this.telegram.findByWorkspaceId(workspaceId);
        const botActive = Boolean(
          operations?.state.telegramEnabled && bot?.isActive,
        );

        return {
          workspaceId,
          memberId,
          userWorkspaceId,
          people: matching.slice(0, CHAT_PAGE_SIZE),
          peopleTotal: matching.length,
          peer: peer ?? null,
          projectId: normalizedProjectFilter,
          projects,
          allWorkspaceProjects: workspaceProjects.map((project) => ({
            id: project.id,
            name: project.name,
          })),
          generalUnread,
          generalMessageCount,
          totalUnreadWithPeer,
          before: query.before ?? null,
          olderCursor:
            messages.length > CHAT_PAGE_SIZE
              ? page[page.length - 1].position
              : null,
          telegramReady: Boolean(
            botActive && operations?.state.connections[memberId],
          ),
          peerTelegramReady: Boolean(
            peer && botActive && operations?.state.connections[peer.id],
          ),
          messages: page
            .reverse()
            .map((message) =>
              this.mapMessageDto(
                message,
                reminderMap,
                replyMap,
                projectNameMap,
              ),
            ),
          pinnedMessages: pinnedRaw.map((message) =>
            this.mapMessageDto(message, reminderMap, replyMap, projectNameMap),
          ),
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
        'Write a message of up to 4,000 characters or attach a file/voice note, and choose a teammate.',
      );
    const command = parsed.data;
    if (command.recipientId === memberId)
      throw new BadRequestException('Choose another teammate.');
    const requestedAttachmentIds = command.attachmentIds
      ? [...new Set(command.attachmentIds)]
      : [];

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
          const existingAttachmentIds = (existing.attachments ?? [])
            .map((item) => item.id)
            .sort()
            .join(',');
          const nextAttachmentIds = [...requestedAttachmentIds]
            .sort()
            .join(',');
          if (
            existing.recipientId !== command.recipientId ||
            existing.text !== command.text ||
            (existing.projectId ?? null) !== (command.projectId ?? null) ||
            (existing.replyToMessageId ?? null) !==
              (command.replyToMessageId ?? null) ||
            existingAttachmentIds !== nextAttachmentIds
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

        let projectId: string | null = null;
        let projectName: string | null = null;
        if (command.projectId) {
          const project = await manager
            .getRepository(DeliveryProjectEntity)
            .findOneBy({ workspaceId, id: command.projectId });
          if (!project)
            throw new BadRequestException(
              'The selected project does not exist in this workspace.',
            );
          projectId = project.id;
          projectName = project.name;
        }

        let replyToMessageId: string | null = null;
        if (command.replyToMessageId) {
          const replyTarget = await repository.findOneBy({
            workspaceId,
            id: command.replyToMessageId,
          });
          const sameConversation =
            replyTarget &&
            ((replyTarget.senderId === memberId &&
              replyTarget.recipientId === recipient.memberId) ||
              (replyTarget.senderId === recipient.memberId &&
                replyTarget.recipientId === memberId));
          if (!sameConversation)
            throw new BadRequestException(
              'You can only reply to messages in this conversation.',
            );
          replyToMessageId = replyTarget.id;
        }

        let attachmentMeta: DeliveryChatMessageAttachmentMeta[] = [];
        if (requestedAttachmentIds.length > 0) {
          const attachmentRepo = manager.getRepository(
            DeliveryChatAttachmentEntity,
          );
          const rows = await attachmentRepo.find({
            where: {
              workspaceId,
              id: In(requestedAttachmentIds),
              uploaderId: memberId,
              recipientId: recipient.memberId,
            },
            order: { createdAt: 'ASC' },
            lock: { mode: 'pessimistic_write' },
          });
          if (
            rows.length !== requestedAttachmentIds.length ||
            rows.some((row) => row.messageId !== null)
          ) {
            throw new BadRequestException(
              'One or more attachments are unavailable or already sent.',
            );
          }
          const byId = new Map(rows.map((row) => [row.id, row]));
          attachmentMeta = requestedAttachmentIds.map((attId) => {
            const row = byId.get(attId)!;
            return {
              id: row.id,
              kind: row.kind,
              name: row.name,
              mimeType: row.mimeType,
              size: row.size,
              durationMs: row.durationMs ?? null,
              waveform: row.waveform ?? null,
            };
          });
        }

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
          projectId,
          projectName,
          replyToMessageId,
          attachments: attachmentMeta,
          reactions: [],
          createdAt: now,
          viewedAt: null,
          editedAt: null,
          deletedAt: null,
          pinnedAt: null,
          pinnedById: null,
        });

        if (requestedAttachmentIds.length > 0) {
          await manager
            .getRepository(DeliveryChatAttachmentEntity)
            .update(
              { workspaceId, id: In(requestedAttachmentIds) },
              { messageId: id },
            );
        }

        await recordOtogrowActivity(manager, {
          workspaceId,
          actorId: memberId,
          subjectMemberId: recipient.memberId,
          category: 'DELIVERY',
          action: 'TEAM_MESSAGE_SENT',
          outcome: 'RECORDED',
          summary: projectName
            ? `Sent a team message in ${projectName}.`
            : 'Sent a direct team message.',
          sourceType: 'team-chat',
          sourceId: id,
        });
        return id;
      },
    );
  }

  async edit(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    now = new Date(),
  ) {
    const parsed = CHAT_EDIT.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Write an updated message between 1 and 4,000 characters.',
      );
    const { messageId, text } = parsed.data;
    return readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        const repository = manager.getRepository(DeliveryChatMessageEntity);
        const message = await repository.findOne({
          where: { workspaceId, id: messageId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!message || message.senderId !== memberId)
          throw new ForbiddenException('You can only edit your own messages.');
        if (message.deletedAt)
          throw new BadRequestException('Deleted messages cannot be edited.');
        await repository.update(
          { workspaceId, id: message.id },
          { text, editedAt: now },
        );
        return true;
      },
    );
  }

  async remove(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    now = new Date(),
  ) {
    const parsed = CHAT_MESSAGE_ID.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Choose a valid message to delete.');
    const { messageId } = parsed.data;
    return readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        const repository = manager.getRepository(DeliveryChatMessageEntity);
        const message = await repository.findOne({
          where: { workspaceId, id: messageId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!message || message.senderId !== memberId)
          throw new ForbiddenException(
            'You can only delete your own messages.',
          );
        if (!message.deletedAt) {
          await repository.update(
            { workspaceId, id: message.id },
            {
              text: '',
              attachments: [],
              deletedAt: now,
              pinnedAt: null,
              pinnedById: null,
            },
          );
          await manager
            .getRepository(DeliveryReminderOutboxEntity)
            .update(
              { workspaceId, noticeId: message.id, status: 'QUEUED' },
              { status: 'SUPPRESSED', finishedAt: now },
            );
        }
        return true;
      },
    );
  }

  async toggleReaction(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    now = new Date(),
  ) {
    const parsed = CHAT_REACTION.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Choose a valid emoji reaction.');
    const { messageId, emoji } = parsed.data;
    return readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        const members = await this.access.listActiveMembers(
          workspaceId,
          manager,
        );
        const actor = members.find((member) => member.memberId === memberId);
        if (!actor)
          throw new ForbiddenException('Active workspace membership required.');
        const repository = manager.getRepository(DeliveryChatMessageEntity);
        const message = await repository.findOne({
          where: { workspaceId, id: messageId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !message ||
          (message.senderId !== memberId && message.recipientId !== memberId)
        )
          throw new ForbiddenException(
            'Only conversation participants can react to this message.',
          );
        if (message.deletedAt)
          throw new BadRequestException('Cannot react to a deleted message.');

        const current: DeliveryChatMessageReactionMeta[] = Array.isArray(
          message.reactions,
        )
          ? [...message.reactions]
          : [];
        const existingIndex = current.findIndex(
          (item) => item.emoji === emoji && item.memberId === memberId,
        );
        if (existingIndex >= 0) {
          current.splice(existingIndex, 1);
        } else {
          if (current.length >= 40) {
            throw new BadRequestException(
              'Too many reactions on this message.',
            );
          }
          current.push({
            emoji,
            memberId,
            memberName: actor.name,
            createdAt: now.toISOString(),
          });
        }
        await repository.update(
          { workspaceId, id: message.id },
          { reactions: current },
        );
        return true;
      },
    );
  }

  async togglePin(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    now = new Date(),
  ) {
    const parsed = CHAT_MESSAGE_ID.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Choose a valid message to pin.');
    const { messageId } = parsed.data;
    return readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        const repository = manager.getRepository(DeliveryChatMessageEntity);
        const message = await repository.findOne({
          where: { workspaceId, id: messageId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !message ||
          (message.senderId !== memberId && message.recipientId !== memberId)
        )
          throw new ForbiddenException(
            'Only conversation participants can pin this message.',
          );
        if (message.deletedAt)
          throw new BadRequestException('Deleted messages cannot be pinned.');
        const nextPinnedAt = message.pinnedAt ? null : now;
        const nextPinnedById = message.pinnedAt ? null : memberId;
        await repository.update(
          { workspaceId, id: message.id },
          { pinnedAt: nextPinnedAt, pinnedById: nextPinnedById },
        );
        return true;
      },
    );
  }

  async uploadAttachment(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    body: unknown,
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
    now = new Date(),
  ): Promise<DeliveryChatAttachmentDTO> {
    const parsed = CHAT_UPLOAD_BODY.safeParse(body);
    if (!parsed.success || !file?.buffer?.length)
      throw new BadRequestException(
        'Choose a non-empty file or voice recording and a teammate.',
      );
    if (file.buffer.length > CHAT_ATTACHMENT_MAX_BYTES)
      throw new BadRequestException('Files must be 25 MiB or smaller.');
    if (parsed.data.recipientId === memberId)
      throw new BadRequestException('Choose another teammate.');

    const detected = await new FileTypeParser().fromBuffer(file.buffer);
    let kind: DeliveryChatAttachmentKind;
    let mimeType: string;

    if (parsed.data.kind === 'VOICE') {
      if (detected?.mime === 'video/webm' || detected?.mime === 'audio/webm') {
        mimeType = 'audio/webm';
      } else if (
        detected?.mime === 'audio/ogg' ||
        detected?.mime === 'audio/opus'
      ) {
        mimeType = 'audio/ogg';
      } else if (
        detected?.mime === 'video/mp4' ||
        detected?.mime === 'audio/mp4' ||
        detected?.mime === 'audio/x-m4a'
      ) {
        mimeType = 'audio/mp4';
      } else if (detected && ALLOWED_VOICE_MIMES.has(detected.mime)) {
        mimeType =
          detected.mime === 'audio/x-wav' ? 'audio/wav' : detected.mime;
      } else {
        throw new BadRequestException(
          'Unsupported voice recording format. Use WebM, OGG, MP4, MP3, or WAV audio.',
        );
      }
      kind = 'VOICE';
    } else if (detected && ALLOWED_IMAGE_MIMES.has(detected.mime)) {
      kind = 'IMAGE';
      mimeType = detected.mime;
    } else if (detected && ALLOWED_VOICE_MIMES.has(detected.mime)) {
      kind = 'VOICE';
      mimeType = detected.mime === 'audio/x-wav' ? 'audio/wav' : detected.mime;
    } else if (detected && ALLOWED_FILE_MIMES.has(detected.mime)) {
      kind = 'FILE';
      mimeType = detected.mime;
    } else if (!detected) {
      const lower = (file.originalname ?? '').toLowerCase();
      const matchedExt = Object.keys(SAFE_TEXT_EXTENSIONS).find((ext) =>
        lower.endsWith(ext),
      );
      const hasNullByte = file.buffer.includes(0);
      const sample = file.buffer.subarray(0, 4096).toString('utf8');
      if (!matchedExt || hasNullByte || ACTIVE_MARKUP_PATTERN.test(sample)) {
        throw new BadRequestException(
          'Upload an image, voice note, PDF, Office document, ZIP, video, or plain text/CSV file.',
        );
      }
      kind = 'FILE';
      mimeType = SAFE_TEXT_EXTENSIONS[matchedExt];
    } else {
      throw new BadRequestException(
        'This file type is not allowed in team chat.',
      );
    }

    const fallbackName =
      kind === 'VOICE'
        ? `voice-message.${mimeType === 'audio/mp4' ? 'm4a' : mimeType === 'audio/ogg' ? 'ogg' : 'webm'}`
        : 'attachment';
    const name = sanitizeFileName(file.originalname, fallbackName);
    const id = randomUUID();
    const storagePath = `${workspaceId}/delivery-chat/${id}`;
    const durationMs =
      kind === 'VOICE' ? (parsed.data.durationMs ?? null) : null;
    const waveform =
      kind === 'VOICE' ? parseWaveform(parsed.data.waveform) : null;

    // Authorize and check rate limit before writing bytes to storage
    await readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        const members = await this.access.listActiveMembers(
          workspaceId,
          manager,
        );
        if (!members.some((m) => m.memberId === parsed.data.recipientId)) {
          throw new ForbiddenException(
            'Choose an active teammate in your workspace.',
          );
        }
        const recentUploads = await manager
          .getRepository(DeliveryChatAttachmentEntity)
          .createQueryBuilder('att')
          .where(
            'att.workspaceId = :workspaceId AND att.uploaderId = :memberId AND att.createdAt > :since',
            { workspaceId, memberId, since: new Date(now.getTime() - 60000) },
          )
          .getCount();
        if (recentUploads >= CHAT_MAX_UPLOADS_PER_MINUTE) {
          throw new BadRequestException(
            'Too many uploads. Wait a minute before attaching more files.',
          );
        }
      },
    );

    const driver = this.storage.getCurrentDriver();
    await driver.writeFile({
      filePath: storagePath,
      sourceFile: file.buffer,
      mimeType,
    });

    try {
      await readDeliverySnapshot(
        this.dataSource,
        workspaceId,
        async (manager) => {
          await manager.getRepository(DeliveryChatAttachmentEntity).insert({
            id,
            workspaceId,
            uploaderId: memberId,
            recipientId: parsed.data.recipientId,
            messageId: null,
            kind,
            name,
            mimeType,
            size: file.buffer.length,
            storagePath,
            durationMs,
            waveform,
            createdAt: now,
          });
        },
      );
    } catch (error) {
      await driver
        .delete({ folderPath: `${workspaceId}/delivery-chat`, filename: id })
        .catch(() => undefined);
      throw error;
    }

    return {
      id,
      kind,
      name,
      mimeType,
      size: file.buffer.length,
      durationMs,
      waveform,
    };
  }

  async downloadAttachment(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    attachmentId: string,
  ) {
    if (!UUID_REGEX.test(attachmentId)) {
      throw new BadRequestException('Invalid attachment identifier.');
    }
    const attachment = await readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      async (manager) => {
        await this.authorize(workspaceId, memberId, userWorkspaceId, manager);
        const row = await manager
          .getRepository(DeliveryChatAttachmentEntity)
          .findOneBy({ workspaceId, id: attachmentId });
        if (!row) throw new NotFoundException('Attachment not found.');
        if (row.uploaderId !== memberId && row.recipientId !== memberId) {
          throw new ForbiddenException(
            'Only conversation participants can access this attachment.',
          );
        }
        if (row.messageId) {
          const msg = await manager
            .getRepository(DeliveryChatMessageEntity)
            .findOneBy({ workspaceId, id: row.messageId });
          if (msg?.deletedAt) {
            throw new NotFoundException('This message has been deleted.');
          }
        }
        return row;
      },
    );
    const stream = await this.storage
      .getCurrentDriver()
      .readFile({ filePath: attachment.storagePath });
    return { attachment, stream };
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
      WHERE message."viewedAt" IS NULL AND message."deletedAt" IS NULL AND message."createdAt" <= $2
        AND NOT EXISTS (SELECT 1 FROM core."deliveryReminderOutbox" reminder WHERE reminder."workspaceId"=message."workspaceId" AND reminder."noticeId"=message.id)
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
          message.deletedAt ||
          message.createdAt.getTime() + CHAT_REMINDER_DELAY > now.getTime()
        )
          return finish('SUPPRESSED');

        // Coalesce burst pings: if another ping for the same sender->recipient(+project) was already sent in the last 5 minutes, suppress duplicates.
        const recentBurstRows: { exists: boolean }[] = await manager.query(
          `SELECT EXISTS (
            SELECT 1
            FROM core."deliveryReminderOutbox" otherOutbox
            JOIN core."deliveryChatMessage" otherMsg
              ON otherMsg."workspaceId" = otherOutbox."workspaceId"
              AND otherMsg.id = otherOutbox."noticeId"
            WHERE otherOutbox."workspaceId" = $1
              AND otherOutbox.id <> $2
              AND otherOutbox.status IN ('SENT', 'SENDING')
              AND COALESCE(otherOutbox."finishedAt", otherOutbox."attemptedAt", otherOutbox."updatedAt") >= $3
              AND otherMsg."senderId" = $4
              AND otherMsg."recipientId" = $5
              AND otherMsg."projectId" IS NOT DISTINCT FROM $6
          ) AS exists`,
          [
            initial.workspaceId,
            reminder.id,
            new Date(now.getTime() - CHAT_REMINDER_DELAY),
            message.senderId,
            message.recipientId,
            message.projectId ?? null,
          ],
        );
        if (recentBurstRows[0]?.exists) return finish('SUPPRESSED');

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

        const unreadCountRows: { count: string }[] = await manager.query(
          `SELECT COUNT(*)::text AS count
           FROM core."deliveryChatMessage"
           WHERE "workspaceId" = $1
             AND "senderId" = $2
             AND "recipientId" = $3
             AND "projectId" IS NOT DISTINCT FROM $4
             AND "viewedAt" IS NULL
             AND "deletedAt" IS NULL`,
          [
            initial.workspaceId,
            message.senderId,
            message.recipientId,
            message.projectId ?? null,
          ],
        );
        const totalUnread = Math.max(1, Number(unreadCountRows[0]?.count ?? 1));

        const url = new URL(
          '/delivery',
          this.config.get('FRONTEND_URL') ?? this.config.get('SERVER_URL'),
        );
        url.searchParams.set('view', 'chat');
        url.searchParams.set('chatWith', message.senderId);
        if (message.projectId) {
          url.searchParams.set('chatProject', message.projectId);
        }

        const preview = buildMessagePreview(
          message.text,
          message.attachments,
          message.deletedAt,
        );
        const lines = [
          `Otogrow Team Chat — Unread message (5m+)`,
          `From: ${message.senderName}`,
        ];
        if (message.projectName) {
          lines.push(`Project: ${message.projectName}`);
        }
        if (preview) {
          lines.push(`"${preview}"`);
        }
        if (totalUnread > 1) {
          lines.push(`(+${totalUnread - 1} more unread in this thread)`);
        }
        lines.push(`${url}`);

        await repository.update(
          { id: reminder.id },
          { status: 'SENDING', attemptedAt: now },
        );
        return {
          botToken: this.telegram.decryptBotToken(bot),
          chatId: connection.chatId,
          text: lines.join('\n'),
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
