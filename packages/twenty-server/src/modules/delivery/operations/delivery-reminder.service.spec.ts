import { Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { type DataSource } from 'typeorm';
import { type DeliveryChatService } from 'src/modules/delivery/chat/delivery-chat.service';
import { type DeliveryReminderOutboxEntity } from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import { type DeliveryFounderEscalationService } from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.service';
import { type DeliveryOperationsService } from 'src/modules/delivery/operations/delivery-operations.service';
import { DeliveryReminderService } from 'src/modules/delivery/operations/delivery-reminder.service';

jest.mock('src/modules/delivery/chat/delivery-chat.service', () => ({
  DeliveryChatService: class {},
}));
jest.mock(
  'src/modules/delivery/founder/escalation/delivery-founder-escalation.service',
  () => ({ DeliveryFounderEscalationService: class {} }),
);
jest.mock(
  'src/modules/delivery/operations/delivery-operations.service',
  () => ({
    DeliveryOperationsService: class {},
  }),
);

const NOW = new Date('2026-10-28T03:00:00Z');
const PAYLOAD = {
  botToken: 'test-only-token',
  chatId: '1234',
  text: 'Otogrow: Urgent founder attention.\nhttps://example.test/delivery?view=health',
};
const owner = () => ({
  ownsReminder: jest.fn(async (_outboxId: string) => false),
  queueDue: jest.fn(async (_now: Date) => {}),
  claimReminder: jest.fn(
    async (_outboxId: string, _now: Date) => PAYLOAD as typeof PAYLOAD | null,
  ),
  finishReminder: jest.fn(
    async (
      _outboxId: string,
      _status: 'SENT' | 'FAILED' | 'UNCERTAIN',
      _error: string | null,
      _now: Date,
      _expiredBefore?: Date,
    ) => {},
  ),
});

const setup = () => {
  const operations = {
    ...owner(),
    enqueueReminder: jest.fn(async (_outboxId: string) => {}),
  };
  const chat = owner();
  const founder = owner();
  const repository = {
    find: jest.fn<Promise<DeliveryReminderOutboxEntity[]>, [unknown]>(),
  };
  const dataSource = { getRepository: jest.fn(() => repository) };
  const reminders = new DeliveryReminderService(
    dataSource as unknown as DataSource,
    operations as unknown as DeliveryOperationsService,
    chat as unknown as DeliveryChatService,
    founder as unknown as DeliveryFounderEscalationService,
  );
  return { operations, chat, founder, repository, reminders };
};

describe('durable Telegram reminder dispatch', () => {
  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('routes founder occurrences through their own source checks and receipt owner', async () => {
    const { reminders, founder, chat, operations } = setup();
    founder.ownsReminder.mockResolvedValue(true);
    await reminders.execute('founder-outbox', NOW);
    expect(founder.claimReminder).toHaveBeenCalledWith('founder-outbox', NOW);
    expect(chat.claimReminder).not.toHaveBeenCalled();
    expect(operations.claimReminder).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-only-token/sendMessage',
      {
        chat_id: PAYLOAD.chatId,
        text: PAYLOAD.text,
        link_preview_options: { is_disabled: true },
      },
      { timeout: 10000, maxRedirects: 0, proxy: false },
    );
    expect(founder.finishReminder).toHaveBeenCalledWith(
      'founder-outbox',
      'SENT',
      null,
      expect.any(Date),
    );
  });

  it('retains chat routing and does not ask founder ownership for chat jobs', async () => {
    const { reminders, founder, chat, operations } = setup();
    chat.ownsReminder.mockResolvedValue(true);
    await reminders.execute('chat-outbox', NOW);
    expect(chat.finishReminder).toHaveBeenCalled();
    expect(founder.ownsReminder).not.toHaveBeenCalled();
    expect(operations.claimReminder).not.toHaveBeenCalled();
  });

  it('retains Operations ownership for assignment and fulfilment jobs', async () => {
    const { reminders, operations, founder } = setup();
    await reminders.execute('task-outbox', NOW);
    expect(founder.ownsReminder).toHaveBeenCalledWith('task-outbox');
    expect(operations.finishReminder).toHaveBeenCalledWith(
      'task-outbox',
      'SENT',
      null,
      expect.any(Date),
    );
  });

  it('does not send when current source or authority checks reject the claim', async () => {
    const { reminders, founder } = setup();
    founder.ownsReminder.mockResolvedValue(true);
    founder.claimReminder.mockResolvedValue(null);
    await reminders.execute('no-longer-permitted', NOW);
    expect(send).not.toHaveBeenCalled();
    expect(founder.finishReminder).not.toHaveBeenCalled();
  });

  it('records an explicit Telegram rejection as failed', async () => {
    const { reminders, founder } = setup();
    founder.ownsReminder.mockResolvedValue(true);
    send.mockResolvedValue({ data: { ok: false } });
    await reminders.execute('rejected', NOW);
    expect(founder.finishReminder).toHaveBeenCalledWith(
      'rejected',
      'FAILED',
      'Telegram rejected the notification.',
      expect.any(Date),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['network timeout', new Error('timeout'), 'UNCERTAIN'],
    [
      'server rejection',
      new AxiosError('server', undefined, undefined, undefined, {
        data: {},
        status: 500,
        statusText: 'Error',
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
      'UNCERTAIN',
    ],
    [
      'client rejection',
      new AxiosError('client', undefined, undefined, undefined, {
        data: {},
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
      'FAILED',
    ],
  ] as const)(
    'records %s without retrying HTTP',
    async (_label, failure, status) => {
      const { reminders, founder } = setup();
      founder.ownsReminder.mockResolvedValue(true);
      send.mockRejectedValue(failure);
      await reminders.execute('founder-outbox', NOW);
      expect(send).toHaveBeenCalledTimes(1);
      expect(founder.finishReminder).toHaveBeenCalledWith(
        'founder-outbox',
        status,
        expect.any(String),
        expect.any(Date),
      );
    },
  );

  it('leaves lost completion receipts for recovery rather than repeating the request', async () => {
    const { reminders, founder } = setup();
    founder.ownsReminder.mockResolvedValue(true);
    founder.finishReminder.mockRejectedValue(new Error('database unavailable'));
    await expect(reminders.execute('founder-outbox', NOW)).rejects.toThrow(
      'database unavailable',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('recovers interrupted founder sends as uncertain and safely enqueues all queued owners', async () => {
    const { reminders, founder, chat, operations, repository } = setup();
    founder.ownsReminder.mockResolvedValue(true);
    repository.find
      .mockResolvedValueOnce([
        { id: 'interrupted' } as DeliveryReminderOutboxEntity,
      ])
      .mockResolvedValueOnce([
        { id: 'queued' } as DeliveryReminderOutboxEntity,
      ]);
    await reminders.recover(NOW);
    expect(chat.queueDue).toHaveBeenCalledWith(NOW);
    expect(founder.queueDue).toHaveBeenCalledWith(NOW);
    expect(founder.finishReminder).toHaveBeenCalledWith(
      'interrupted',
      'UNCERTAIN',
      expect.any(String),
      NOW,
      expect.any(Date),
    );
    expect(operations.enqueueReminder).toHaveBeenCalledWith('queued');
    expect(send).not.toHaveBeenCalled();
  });

  it('continues durable recovery when the founder evaluation pass fails', async () => {
    const { reminders, founder, operations, repository } = setup();
    founder.queueDue.mockRejectedValue(new Error('source unavailable'));
    repository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'durable-queued' } as DeliveryReminderOutboxEntity,
      ]);
    await reminders.recover(NOW);
    expect(operations.enqueueReminder).toHaveBeenCalledWith('durable-queued');
    expect(send).not.toHaveBeenCalled();
  });
});
