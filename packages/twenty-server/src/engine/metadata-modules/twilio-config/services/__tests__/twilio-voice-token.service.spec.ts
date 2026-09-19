import { NotFoundException } from '@nestjs/common';

import { type TwilioConfigEntity } from 'src/engine/metadata-modules/twilio-config/entities/twilio-config.entity';
import { TwilioVoiceTokenService } from 'src/engine/metadata-modules/twilio-config/services/twilio-voice-token.service';

const WORKSPACE_ID = 'workspace-id';
const WORKSPACE_MEMBER_ID = 'workspace-member-id';

const decodeJwtPayload = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

describe('TwilioVoiceTokenService', () => {
  const buildService = (config: Partial<TwilioConfigEntity> | null) => {
    const twilioConfigService = {
      findByWorkspaceId: jest.fn().mockResolvedValue(config),
      decryptApiKeySecret: jest.fn().mockReturnValue('api-key-secret'),
    };

    return new TwilioVoiceTokenService(twilioConfigService as never);
  };

  it('should mint a JWT with a voice grant scoped to the TwiML app and member identity', async () => {
    const service = buildService({
      accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      apiKeySid: 'SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      apiKeySecret: 'enc:v2:xxx' as never,
      twimlAppSid: 'APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    });

    const token = await service.generateVoiceToken({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: WORKSPACE_MEMBER_ID,
    });

    const payload = decodeJwtPayload(token) as {
      iss: string;
      sub: string;
      iat: number;
      exp: number;
      grants: {
        identity: string;
        voice: {
          outgoing: { application_sid: string };
          incoming: { allow: boolean };
        };
      };
    };

    expect(payload.iss).toBe('SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect(payload.sub).toBe('ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect(payload.grants.identity).toBe(WORKSPACE_MEMBER_ID);
    expect(payload.grants.voice.outgoing.application_sid).toBe(
      'APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    );
    expect(payload.grants.voice.incoming.allow).toBe(true);
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('should throw when calling is not provisioned', async () => {
    const service = buildService({
      accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      apiKeySid: null,
      twimlAppSid: null,
    });

    await expect(
      service.generateVoiceToken({
        workspaceId: WORKSPACE_ID,
        workspaceMemberId: WORKSPACE_MEMBER_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw when Twilio is not configured at all', async () => {
    const service = buildService(null);

    await expect(
      service.generateVoiceToken({
        workspaceId: WORKSPACE_ID,
        workspaceMemberId: WORKSPACE_MEMBER_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
