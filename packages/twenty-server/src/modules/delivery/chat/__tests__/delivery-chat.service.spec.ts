import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { type DataSource } from 'typeorm';
import { type FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  CHAT_REMINDER_DELAY,
  DeliveryChatService,
} from 'src/modules/delivery/chat/delivery-chat.service';
import { DeliveryChatAttachmentEntity } from 'src/modules/delivery/chat/entities/delivery-chat-attachment.entity';
import { DeliveryChatMessageEntity } from 'src/modules/delivery/chat/entities/delivery-chat-message.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryReminderOutboxEntity } from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import { type TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';

jest.mock('src/modules/delivery/read-delivery-snapshot', () => ({
  readDeliverySnapshot: jest.fn(
    async (_dataSource, _workspaceId, work: (manager: unknown) => unknown) =>
      work(mockManager),
  ),
}));

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(async () => undefined),
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const PEER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const USER_WORKSPACE_ID = '55555555-5555-4555-8555-555555555555';
const PROJECT_A_ID = '66666666-6666-4666-8666-666666666666';
const PROJECT_B_ID = '77777777-7777-4777-8777-777777777777';
const MESSAGE_ID = '88888888-8888-4888-8888-888888888888';
const ATTACHMENT_ID = '99999999-9999-4999-8999-999999999999';
const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTBOX_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let mockManager: {
  query: jest.Mock;
  getRepository: jest.Mock;
};

const createService = () => {
  const repos = new Map<unknown, Record<string, jest.Mock>>();
  const getRepo = (entity: unknown) => {
    if (!repos.has(entity)) {
      repos.set(entity, {
        find: jest.fn(async () => []),
        findBy: jest.fn(async () => []),
        findOne: jest.fn(async () => null),
        findOneBy: jest.fn(async () => null),
        existsBy: jest.fn(async () => false),
        insert: jest.fn(async () => undefined),
        update: jest.fn(async () => undefined),
        createQueryBuilder: jest.fn(),
      });
    }
    return repos.get(entity)!;
  };

  mockManager = {
    query: jest.fn(async () => []),
    getRepository: jest.fn((entity: unknown) => getRepo(entity)),
  };

  const dataSource = {
    query: jest.fn(async () => []),
    getRepository: jest.fn((entity: unknown) => getRepo(entity)),
  } as unknown as DataSource;

  const access = {
    accessForUser: jest.fn(async () => ({ workspaceId: WORKSPACE_ID })),
    listActiveMembers: jest.fn(async () => [
      { memberId: MEMBER_ID, name: 'Hisham' },
      { memberId: PEER_ID, name: 'Amna' },
      { memberId: OTHER_MEMBER_ID, name: 'Felix' },
    ]),
  } as unknown as OtogrowAccessService;

  const telegram = {
    findByWorkspaceId: jest.fn(async () => ({
      isActive: true,
      encryptedBotToken: 'enc-token',
    })),
    decryptBotToken: jest.fn(() => 'bot-secret-token'),
  } as unknown as TelegramConfigService;

  const config = {
    get: jest.fn((key: string) =>
      key === 'FRONTEND_URL' ? 'https://crm.otogrow.com' : undefined,
    ),
  } as unknown as TwentyConfigService;

  const storageDriver = {
    writeFile: jest.fn(async () => undefined),
    readFile: jest.fn(async () => Buffer.from('file-bytes')),
    delete: jest.fn(async () => undefined),
  };
  const storage = {
    getCurrentDriver: jest.fn(() => storageDriver),
  } as unknown as FileStorageDriverFactory;

  const service = new DeliveryChatService(
    dataSource,
    access,
    telegram,
    config,
    storage,
  );

  return { service, getRepo, dataSource, access, telegram, storageDriver };
};

describe('DeliveryChatService', () => {
  it('builds project pills from teammate project memberships and message history with unread counts', async () => {
    const { service, getRepo } = createService();
    const projectRepo = getRepo(DeliveryProjectEntity);
    projectRepo.find.mockResolvedValue([
      { id: PROJECT_A_ID, name: 'Alpha Launch', memberIds: [PEER_ID] },
      { id: PROJECT_B_ID, name: 'Beta Retainer', memberIds: [OTHER_MEMBER_ID] },
    ]);

    const messageQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };
    getRepo(DeliveryChatMessageEntity).createQueryBuilder.mockReturnValue(
      messageQb,
    );
    getRepo(DeliveryOperationsEntity).findOneBy.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      state: {
        telegramEnabled: true,
        connections: {
          [MEMBER_ID]: { chatId: '100' },
          [PEER_ID]: { chatId: '200' },
        },
      },
    });

    mockManager.query
      // heads query
      .mockResolvedValueOnce([
        {
          peerId: PEER_ID,
          name: 'Amna',
          createdAt: new Date('2026-11-25T10:00:00Z'),
          unread: '3',
          lastText: 'Updated the creative deck',
          lastAttachments: [],
          lastProjectName: 'Alpha Launch',
          lastDeletedAt: null,
        },
      ])
      // project summaries query
      .mockResolvedValueOnce([
        {
          projectId: null,
          projectName: null,
          messageCount: '4',
          unread: '1',
          lastMessageAt: new Date('2026-11-25T09:00:00Z'),
        },
        {
          projectId: PROJECT_A_ID,
          projectName: 'Alpha Launch',
          messageCount: '12',
          unread: '2',
          lastMessageAt: new Date('2026-11-25T10:00:00Z'),
        },
      ]);

    const snapshot = await service.snapshot(
      WORKSPACE_ID,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      { peerId: PEER_ID, projectId: PROJECT_A_ID },
    );

    expect(snapshot.projectId).toBe(PROJECT_A_ID);
    expect(snapshot.totalUnreadWithPeer).toBe(3);
    expect(snapshot.generalUnread).toBe(1);
    expect(snapshot.generalMessageCount).toBe(4);
    expect(snapshot.peerTelegramReady).toBe(true);
    expect(snapshot.projects).toEqual([
      expect.objectContaining({
        id: PROJECT_A_ID,
        name: 'Alpha Launch',
        unread: 2,
        messageCount: 12,
        isMember: true,
      }),
    ]);
    expect(snapshot.allWorkspaceProjects).toHaveLength(2);
    expect(messageQb.andWhere).toHaveBeenCalledWith(
      'message.projectId = :projectId',
      { projectId: PROJECT_A_ID },
    );
  });

  it('sends a project-scoped message with attachments and reply, and enforces idempotent retry', async () => {
    const { service, getRepo } = createService();
    const msgRepo = getRepo(DeliveryChatMessageEntity);
    const projectRepo = getRepo(DeliveryProjectEntity);
    const attachmentRepo = getRepo(DeliveryChatAttachmentEntity);

    const countQb = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn(async () => 0),
    };
    msgRepo.createQueryBuilder.mockReturnValue(countQb);
    msgRepo.findOneBy
      // existing requestId check -> null
      .mockResolvedValueOnce(null)
      // replyTo lookup -> found in same conversation
      .mockResolvedValueOnce({
        id: MESSAGE_ID,
        workspaceId: WORKSPACE_ID,
        senderId: PEER_ID,
        recipientId: MEMBER_ID,
      });

    projectRepo.findOneBy.mockResolvedValue({
      id: PROJECT_A_ID,
      name: 'Alpha Launch',
    });

    attachmentRepo.find.mockResolvedValue([
      {
        id: ATTACHMENT_ID,
        workspaceId: WORKSPACE_ID,
        uploaderId: MEMBER_ID,
        recipientId: PEER_ID,
        messageId: null,
        kind: 'VOICE',
        name: 'voice-note.webm',
        mimeType: 'audio/webm',
        size: 12345,
        durationMs: 7400,
        waveform: [20, 40, 60, 35],
      },
    ]);

    const sentId = await service.send(
      WORKSPACE_ID,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      {
        recipientId: PEER_ID,
        requestId: REQUEST_ID,
        text: '',
        projectId: PROJECT_A_ID,
        replyToMessageId: MESSAGE_ID,
        attachmentIds: [ATTACHMENT_ID],
      },
    );

    expect(sentId).toBeTruthy();
    expect(msgRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sentId,
        projectId: PROJECT_A_ID,
        projectName: 'Alpha Launch',
        replyToMessageId: MESSAGE_ID,
        attachments: [
          expect.objectContaining({
            id: ATTACHMENT_ID,
            kind: 'VOICE',
            durationMs: 7400,
          }),
        ],
      }),
    );
    expect(attachmentRepo.update).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE_ID, id: expect.anything() },
      { messageId: sentId },
    );

    // Retry with conflicting projectId throws ConflictException
    msgRepo.findOneBy.mockResolvedValueOnce({
      id: sentId,
      recipientId: PEER_ID,
      text: '',
      projectId: PROJECT_A_ID,
      replyToMessageId: MESSAGE_ID,
      attachments: [{ id: ATTACHMENT_ID }],
    });

    await expect(
      service.send(WORKSPACE_ID, MEMBER_ID, USER_WORKSPACE_ID, {
        recipientId: PEER_ID,
        requestId: REQUEST_ID,
        text: '',
        projectId: PROJECT_B_ID,
        replyToMessageId: MESSAGE_ID,
        attachmentIds: [ATTACHMENT_ID],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects active HTML/SVG uploads and blocks non-participants from downloading attachments', async () => {
    const { service, getRepo } = createService();

    await expect(
      service.uploadAttachment(
        WORKSPACE_ID,
        MEMBER_ID,
        USER_WORKSPACE_ID,
        { recipientId: PEER_ID, kind: 'AUTO' },
        {
          buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
          originalname: 'malicious.txt',
          size: 29,
        },
      ),
    ).rejects.toThrow(BadRequestException);

    getRepo(DeliveryChatAttachmentEntity).findOneBy.mockResolvedValue({
      id: ATTACHMENT_ID,
      workspaceId: WORKSPACE_ID,
      uploaderId: MEMBER_ID,
      recipientId: PEER_ID,
      messageId: MESSAGE_ID,
      storagePath: `${WORKSPACE_ID}/delivery-chat/${ATTACHMENT_ID}`,
    });

    await expect(
      service.downloadAttachment(
        WORKSPACE_ID,
        OTHER_MEMBER_ID,
        USER_WORKSPACE_ID,
        ATTACHMENT_ID,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('soft-deletes own message and suppresses any queued Telegram reminder', async () => {
    const { service, getRepo } = createService();
    const msgRepo = getRepo(DeliveryChatMessageEntity);
    const outboxRepo = getRepo(DeliveryReminderOutboxEntity);
    msgRepo.findOne.mockResolvedValue({
      id: MESSAGE_ID,
      workspaceId: WORKSPACE_ID,
      senderId: MEMBER_ID,
      recipientId: PEER_ID,
      text: 'Wrong file',
      deletedAt: null,
    });

    const now = new Date('2026-11-25T10:05:00Z');
    await service.remove(
      WORKSPACE_ID,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      { messageId: MESSAGE_ID },
      now,
    );

    expect(msgRepo.update).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE_ID, id: MESSAGE_ID },
      expect.objectContaining({ text: '', attachments: [], deletedAt: now }),
    );
    expect(outboxRepo.update).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE_ID, noticeId: MESSAGE_ID, status: 'QUEUED' },
      { status: 'SUPPRESSED', finishedAt: now },
    );
  });

  it('toggles emoji reactions and pins for conversation participants only', async () => {
    const { service, getRepo } = createService();
    const msgRepo = getRepo(DeliveryChatMessageEntity);
    msgRepo.findOne.mockResolvedValue({
      id: MESSAGE_ID,
      workspaceId: WORKSPACE_ID,
      senderId: PEER_ID,
      recipientId: MEMBER_ID,
      reactions: [],
      deletedAt: null,
      pinnedAt: null,
    });

    await service.toggleReaction(WORKSPACE_ID, MEMBER_ID, USER_WORKSPACE_ID, {
      messageId: MESSAGE_ID,
      emoji: '🔥',
    });

    expect(msgRepo.update).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE_ID, id: MESSAGE_ID },
      {
        reactions: [
          expect.objectContaining({
            emoji: '🔥',
            memberId: MEMBER_ID,
            memberName: 'Hisham',
          }),
        ],
      },
    );

    await service.togglePin(WORKSPACE_ID, MEMBER_ID, USER_WORKSPACE_ID, {
      messageId: MESSAGE_ID,
    });
    expect(msgRepo.update).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE_ID, id: MESSAGE_ID },
      expect.objectContaining({ pinnedById: MEMBER_ID }),
    );

    // Non-participant is forbidden
    await expect(
      service.togglePin(WORKSPACE_ID, OTHER_MEMBER_ID, USER_WORKSPACE_ID, {
        messageId: MESSAGE_ID,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('claims 5-minute unread Telegram ping with project context, deep link, and burst coalescing', async () => {
    const { service, getRepo } = createService();
    const outboxRepo = getRepo(DeliveryReminderOutboxEntity);
    const msgRepo = getRepo(DeliveryChatMessageEntity);
    const opsRepo = getRepo(DeliveryOperationsEntity);

    const createdAt = new Date('2026-11-25T10:00:00Z');
    const now = new Date(createdAt.getTime() + CHAT_REMINDER_DELAY + 1000);

    outboxRepo.findOneBy.mockResolvedValue({
      id: OUTBOX_ID,
      workspaceId: WORKSPACE_ID,
      noticeId: MESSAGE_ID,
      status: 'QUEUED',
    });
    outboxRepo.findOne.mockResolvedValue({
      id: OUTBOX_ID,
      workspaceId: WORKSPACE_ID,
      noticeId: MESSAGE_ID,
      status: 'QUEUED',
    });
    msgRepo.findOne.mockResolvedValue({
      id: MESSAGE_ID,
      workspaceId: WORKSPACE_ID,
      senderId: PEER_ID,
      recipientId: MEMBER_ID,
      senderName: 'Amna',
      text: 'Client approved the ad spend',
      projectId: PROJECT_A_ID,
      projectName: 'Alpha Launch',
      attachments: [],
      createdAt,
      viewedAt: null,
      deletedAt: null,
    });
    opsRepo.findOneBy.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      state: {
        telegramEnabled: true,
        connections: { [MEMBER_ID]: { chatId: 'chat-999' } },
      },
    });

    // First ping: no recent burst, 3 total unread in this thread
    mockManager.query
      .mockResolvedValueOnce([{ exists: false }])
      .mockResolvedValueOnce([{ count: '3' }]);

    const claimed = await service.claimReminder(OUTBOX_ID, now);
    expect(claimed).not.toBeNull();
    expect(claimed?.chatId).toBe('chat-999');
    expect(claimed?.text).toContain('From: Amna');
    expect(claimed?.text).toContain('Project: Alpha Launch');
    expect(claimed?.text).toContain('Client approved the ad spend');
    expect(claimed?.text).toContain('(+2 more unread in this thread)');
    expect(claimed?.text).toContain(
      `https://crm.otogrow.com/delivery?view=chat&chatWith=${PEER_ID}&chatProject=${PROJECT_A_ID}`,
    );

    // Burst second message within 5 minutes is coalesced & suppressed
    mockManager.query.mockResolvedValueOnce([{ exists: true }]);
    const suppressed = await service.claimReminder(OUTBOX_ID, now);
    expect(suppressed).toBeNull();
    expect(outboxRepo.update).toHaveBeenCalledWith(
      { id: OUTBOX_ID },
      { status: 'SUPPRESSED', error: null, finishedAt: now },
    );
  });
});
