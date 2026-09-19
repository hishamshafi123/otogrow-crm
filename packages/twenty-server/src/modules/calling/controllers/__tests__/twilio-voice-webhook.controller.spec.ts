import { ForbiddenException } from '@nestjs/common';

import { createHmac } from 'crypto';

import { type Request } from 'express';

import { TwilioVoiceWebhookController } from 'src/modules/calling/controllers/twilio-voice-webhook.controller';

const WORKSPACE_ID = 'workspace-id';
const AUTH_TOKEN = 'test-twilio-auth-token';
const SERVER_URL = 'https://voice.example.com';
const VOICE_NUMBER = '+12533525757';

const signPayload = ({
  url,
  params,
}: {
  url: string;
  params: Record<string, string>;
}): string => {
  const data = Object.keys(params)
    .sort()
    .reduce((payload, key) => `${payload}${key}${params[key]}`, url);

  return createHmac('sha1', AUTH_TOKEN).update(data).digest('base64');
};

const buildRequest = (
  path: string,
  body: Record<string, string>,
  signature?: string,
): Request =>
  ({
    path,
    ip: '127.0.0.1',
    headers: signature !== undefined ? { 'x-twilio-signature': signature } : {},
  }) as unknown as Request;

describe('TwilioVoiceWebhookController', () => {
  const callLogService = {
    upsertOutboundCall: jest
      .fn()
      .mockResolvedValue({ callId: 'call-id', created: true }),
    handleInboundCall: jest
      .fn()
      .mockResolvedValue({ callId: 'call-id', created: true }),
    listWorkspaceMemberIds: jest
      .fn()
      .mockResolvedValue(['workspace-member-id-1', 'workspace-member-id-2']),
    updateCallStatus: jest.fn().mockResolvedValue(undefined),
    attachRecording: jest.fn().mockResolvedValue(undefined),
  };

  const twilioConfigService = {
    findByWorkspaceId: jest.fn().mockResolvedValue({
      id: 'config-id',
      workspaceId: WORKSPACE_ID,
      voiceNumber: VOICE_NUMBER,
      authToken: 'enc:v2:xxx',
    }),
    decryptAuthToken: jest.fn().mockReturnValue(AUTH_TOKEN),
  };

  const throttlerService = {
    tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(undefined),
  };

  const twentyConfigService = {
    get: jest.fn().mockReturnValue(SERVER_URL),
  };

  const buildController = () =>
    new TwilioVoiceWebhookController(
      twilioConfigService as never,
      callLogService as never,
      throttlerService as never,
      twentyConfigService as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject requests without a Twilio signature', async () => {
    const controller = buildController();
    const body = { CallSid: 'CA123', To: '+15551234567' };

    await expect(
      controller.handleVoiceWebhook(
        WORKSPACE_ID,
        buildRequest(`/webhooks/twilio/${WORKSPACE_ID}/voice`, body),
        body,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should reject requests with an invalid Twilio signature', async () => {
    const controller = buildController();
    const body = { CallSid: 'CA123', To: '+15551234567' };
    const path = `/webhooks/twilio/${WORKSPACE_ID}/voice`;

    await expect(
      controller.handleVoiceWebhook(
        WORKSPACE_ID,
        buildRequest(path, body, 'invalid-signature'),
        body,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should create an outbound call and return Dial TwiML for SDK-originated calls', async () => {
    const controller = buildController();
    const body = {
      CallSid: 'CA123',
      CallDirection: 'outbound',
      To: '+15551234567',
      From: 'client:workspace-member-id',
      PersonId: 'person-id',
    };
    const path = `/webhooks/twilio/${WORKSPACE_ID}/voice`;
    const signature = signPayload({
      url: `${SERVER_URL}${path}`,
      params: body,
    });

    const twiml = await controller.handleVoiceWebhook(
      WORKSPACE_ID,
      buildRequest(path, body, signature),
      body,
    );

    expect(callLogService.upsertOutboundCall).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      callSid: 'CA123',
      fromNumber: VOICE_NUMBER,
      toNumber: '+15551234567',
      personId: 'person-id',
    });
    expect(twiml).toContain(`<Dial callerId="${VOICE_NUMBER}"`);
    expect(twiml).toContain('answerOnBridge="true"');
    expect(twiml).toContain('record="record-from-answer-dual"');
    expect(twiml).toContain(
      `<Number statusCallback="${SERVER_URL}/webhooks/twilio/${WORKSPACE_ID}/voice/status"`,
    );
    expect(twiml).toContain(
      `recordingStatusCallback="${SERVER_URL}/webhooks/twilio/${WORKSPACE_ID}/voice/recording"`,
    );
    expect(twiml).toContain(
      'statusCallbackEvent="initiated ringing answered completed"',
    );
    expect(twiml).toContain('>+15551234567</Number>');
  });

  it('should normalize stray punctuation in the dialed number', async () => {
    const controller = buildController();
    const body = {
      CallSid: 'CA124',
      CallDirection: 'outbound',
      To: '+15551234567.',
      From: 'client:workspace-member-id',
    };
    const path = `/webhooks/twilio/${WORKSPACE_ID}/voice`;
    const signature = signPayload({
      url: `${SERVER_URL}${path}`,
      params: body,
    });

    const twiml = await controller.handleVoiceWebhook(
      WORKSPACE_ID,
      buildRequest(path, body, signature),
      body,
    );

    expect(callLogService.upsertOutboundCall).toHaveBeenCalledWith(
      expect.objectContaining({ toNumber: '+15551234567' }),
    );
    expect(twiml).toContain('>+15551234567</Number>');
  });

  it('should reject a non-E.164 dialed number without dialing', async () => {
    const controller = buildController();
    const body = {
      CallSid: 'CA125',
      CallDirection: 'outbound',
      To: 'call-mom',
      From: 'client:workspace-member-id',
    };
    const path = `/webhooks/twilio/${WORKSPACE_ID}/voice`;
    const signature = signPayload({
      url: `${SERVER_URL}${path}`,
      params: body,
    });

    const twiml = await controller.handleVoiceWebhook(
      WORKSPACE_ID,
      buildRequest(path, body, signature),
      body,
    );

    expect(callLogService.upsertOutboundCall).not.toHaveBeenCalled();
    expect(twiml).not.toContain('<Dial');
    expect(twiml).toContain('invalid');
  });

  it('should create an inbound call and ring every workspace member client with a voicemail fallback', async () => {
    const controller = buildController();
    const body = {
      CallSid: 'CA456',
      From: '+14155552671',
      To: VOICE_NUMBER,
    };
    const path = `/webhooks/twilio/${WORKSPACE_ID}/voice`;
    const signature = signPayload({
      url: `${SERVER_URL}${path}`,
      params: body,
    });

    const twiml = await controller.handleVoiceWebhook(
      WORKSPACE_ID,
      buildRequest(path, body, signature),
      body,
    );

    expect(callLogService.handleInboundCall).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      callSid: 'CA456',
      fromNumber: '+14155552671',
      toNumber: VOICE_NUMBER,
    });
    expect(twiml).toContain('<Dial answerOnBridge="true"');
    expect(twiml).toContain('record="record-from-answer-dual"');
    expect(twiml).toContain(
      `<Client statusCallback="${SERVER_URL}/webhooks/twilio/${WORKSPACE_ID}/voice/status" statusCallbackEvent="initiated ringing answered completed">workspace-member-id-1</Client>`,
    );
    expect(twiml).toContain('>workspace-member-id-2</Client>');
    expect(twiml).toContain(
      `<Record maxLength="120" recordingStatusCallback="${SERVER_URL}/webhooks/twilio/${WORKSPACE_ID}/voice/recording"/>`,
    );
    expect(twiml).toContain(
      '<Say>Please leave a message after the tone.</Say>',
    );
    expect(twiml.indexOf('</Dial>')).toBeLessThan(twiml.indexOf('<Record'));
  });

  it('should fall back to voicemail without a Dial when the workspace has no members', async () => {
    callLogService.listWorkspaceMemberIds.mockResolvedValueOnce([]);
    const controller = buildController();
    const body = {
      CallSid: 'CA457',
      From: '+14155552671',
      To: VOICE_NUMBER,
    };
    const path = `/webhooks/twilio/${WORKSPACE_ID}/voice`;
    const signature = signPayload({
      url: `${SERVER_URL}${path}`,
      params: body,
    });

    const twiml = await controller.handleVoiceWebhook(
      WORKSPACE_ID,
      buildRequest(path, body, signature),
      body,
    );

    expect(callLogService.handleInboundCall).toHaveBeenCalled();
    expect(twiml).not.toContain('<Dial');
    expect(twiml).toContain('<Record maxLength="120"');
  });

  it('should map Dial status callbacks to call log updates', async () => {
    const controller = buildController();
    const body = {
      CallSid: 'CA123',
      DialCallSid: 'CA-child',
      DialCallStatus: 'completed',
      DialCallDuration: '42',
    };
    const path = `/webhooks/twilio/${WORKSPACE_ID}/voice/status`;
    const signature = signPayload({
      url: `${SERVER_URL}${path}`,
      params: body,
    });

    await controller.handleVoiceStatusWebhook(
      WORKSPACE_ID,
      buildRequest(path, body, signature),
      body,
    );

    expect(callLogService.updateCallStatus).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      callSid: 'CA123',
      twilioStatus: 'completed',
      callDurationSeconds: 42,
      errorMessage: null,
    });
  });

  it('should attach recordings from the recording status callback', async () => {
    const controller = buildController();
    const body = {
      CallSid: 'CA123',
      RecordingSid: 'RE123',
      RecordingDuration: '42',
      RecordingStatus: 'completed',
    };
    const path = `/webhooks/twilio/${WORKSPACE_ID}/voice/recording`;
    const signature = signPayload({
      url: `${SERVER_URL}${path}`,
      params: body,
    });

    await controller.handleVoiceRecordingWebhook(
      WORKSPACE_ID,
      buildRequest(path, body, signature),
      body,
    );

    expect(callLogService.attachRecording).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      callSid: 'CA123',
      recordingSid: 'RE123',
      recordingDurationSeconds: 42,
    });
  });
});
