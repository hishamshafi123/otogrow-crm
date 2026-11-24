import { TelegramService } from 'src/modules/lead-assignment/services/telegram.service';
import { formatLeadTelegramMessage } from 'src/modules/lead-assignment/utils/format-lead-telegram-message.util';

const WORKSPACE_ID = 'workspace-id';
const BOT_TOKEN = '123456:ABC-DEF';

const CONFIG = {
  workspaceId: WORKSPACE_ID,
  botToken: 'enc:v2:xxx',
  botUsername: 'otogrow_bot',
  isActive: true,
};

const mockTelegramApi = (result: unknown) => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, result }),
  });

  global.fetch = fetchMock as never;

  return fetchMock;
};

const buildService = () => {
  const telegramConfigService = {
    decryptBotToken: jest.fn().mockReturnValue(BOT_TOKEN),
  };
  const setterProfileService = {
    setTelegramChatId: jest.fn().mockResolvedValue({ id: 'profile-1' }),
  };

  const service = new TelegramService(
    telegramConfigService as never,
    setterProfileService as never,
  );

  return { service, telegramConfigService, setterProfileService };
};

describe('formatLeadTelegramMessage', () => {
  it('includes lead name, phone, source and person link', () => {
    const message = formatLeadTelegramMessage({
      leadName: 'Jane Doe',
      leadPhone: '+15551234567',
      leadSource: 'FORM',
      personUrl: 'http://localhost:3001/objects/people/person-id',
    });

    expect(message).toContain('Jane Doe');
    expect(message).toContain('+15551234567');
    expect(message).toContain('FORM');
    expect(message).toContain('http://localhost:3001/objects/people/person-id');
  });

  it('renders a placeholder when the phone is missing', () => {
    const message = formatLeadTelegramMessage({
      leadName: 'Jane Doe',
      leadPhone: null,
      leadSource: 'FORM',
      personUrl: 'http://localhost:3001/objects/people/person-id',
    });

    expect(message).toContain('Phone: —');
  });
});

describe('TelegramService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls getMe against the bot API', async () => {
    const fetchMock = mockTelegramApi({ id: 1, username: 'otogrow_bot' });
    const { service } = buildService();

    const botInfo = await service.getMe(BOT_TOKEN);

    expect(botInfo).toEqual({ id: 1, username: 'otogrow_bot' });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${BOT_TOKEN}/getMe`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends a formatted assignment message', async () => {
    const fetchMock = mockTelegramApi({ message_id: 1 });
    const { service } = buildService();

    await service.sendLeadAssignmentMessage(CONFIG as never, 'chat-1', {
      leadName: 'Jane Doe',
      leadPhone: '+15551234567',
      leadSource: 'FORM',
      personUrl: 'http://localhost:3001/objects/people/person-id',
    });

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);

    const body = JSON.parse((options as RequestInit).body as string);

    expect(body.chat_id).toBe('chat-1');
    expect(body.text).toContain('Jane Doe');
    expect(body.text).toContain(
      'http://localhost:3001/objects/people/person-id',
    );
  });

  it('links the chat id on /start <workspaceMemberId> and confirms', async () => {
    const fetchMock = mockTelegramApi({ message_id: 1 });
    const { service, setterProfileService } = buildService();

    await service.handleUpdate(CONFIG as never, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 42 },
        text: '/start member-1',
      },
    });

    expect(setterProfileService.setTelegramChatId).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'member-1',
      '42',
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );

    expect(body.text).toContain('Telegram linked');
  });

  it('links the chat id on /start@bot_username <workspaceMemberId>', async () => {
    const fetchMock = mockTelegramApi({ message_id: 1 });
    const { service, setterProfileService } = buildService();

    await service.handleUpdate(CONFIG as never, {
      update_id: 2,
      message: {
        message_id: 2,
        chat: { id: 99 },
        text: '/start@otogrow_bot member-2',
      },
    });

    expect(setterProfileService.setTelegramChatId).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'member-2',
      '99',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replies with guidance on bare /start', async () => {
    const fetchMock = mockTelegramApi({ message_id: 1 });
    const { service, setterProfileService } = buildService();

    await service.handleUpdate(CONFIG as never, {
      update_id: 1,
      message: { message_id: 1, chat: { id: 42 }, text: '/start' },
    });

    expect(setterProfileService.setTelegramChatId).not.toHaveBeenCalled();

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );

    expect(body.text).toContain('Setters & Telegram');
  });

  it('ignores non-/start messages without calling the API', async () => {
    const fetchMock = mockTelegramApi({});
    const { service, setterProfileService } = buildService();

    await service.handleUpdate(CONFIG as never, {
      update_id: 1,
      message: { message_id: 1, chat: { id: 42 }, text: 'hello' },
    });

    expect(setterProfileService.setTelegramChatId).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not confirm when the workspace member is unknown', async () => {
    const fetchMock = mockTelegramApi({ message_id: 1 });
    const { service, setterProfileService } = buildService();

    setterProfileService.setTelegramChatId.mockResolvedValue(null);

    await service.handleUpdate(CONFIG as never, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 42 },
        text: '/start unknown-member',
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes offset and timeout to getUpdates', async () => {
    const fetchMock = mockTelegramApi([]);
    const { service } = buildService();

    await service.getUpdates(BOT_TOKEN, 15, 30);

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );

    expect(body).toEqual({ offset: 15, timeout: 30 });
  });
});
