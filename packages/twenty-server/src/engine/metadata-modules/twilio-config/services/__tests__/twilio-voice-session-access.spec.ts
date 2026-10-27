import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthException } from 'src/engine/core-modules/auth/auth.exception';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { TwilioConfigResolver } from 'src/engine/metadata-modules/twilio-config/twilio-config.resolver';

describe('voice token GraphQL session boundary', () => {
  const voiceTokens = { generateVoiceToken: jest.fn() };
  const resolver = new TwilioConfigResolver(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    voiceTokens as never,
  );
  const workspace = { id: 'workspace-id' };

  const requestVoiceToken = async (tokenType?: JwtTokenTypeEnum) => {
    const request = {
      tokenType,
      workspace,
      user: { id: 'administrator-user-id' },
      userWorkspaceId: 'administrator-user-workspace-id',
      workspaceMemberId: 'administrator-member-id',
      ...(tokenType === JwtTokenTypeEnum.APPLICATION_ACCESS
        ? { application: { id: 'restricted-application-id' } }
        : {}),
    };
    const context = {
      getType: () => 'graphql',
      getClass: () => TwilioConfigResolver,
      getHandler: () => resolver.generateTwilioVoiceToken,
      getArgs: () => [undefined, {}, { req: request }, {}],
    } as unknown as ExecutionContext;
    const guards = [
      ...(Reflect.getMetadata(
        GUARDS_METADATA,
        TwilioConfigResolver,
      ) as Type<CanActivate>[]),
      ...(Reflect.getMetadata(
        GUARDS_METADATA,
        resolver.generateTwilioVoiceToken,
      ) as Type<CanActivate>[]),
    ];
    for (const Guard of guards) {
      if ((await new Guard().canActivate(context)) !== true)
        throw new ForbiddenException();
    }
    return resolver.generateTwilioVoiceToken(
      workspace as never,
      request.workspaceMemberId,
    );
  };

  beforeEach(() => {
    voiceTokens.generateVoiceToken.mockReset().mockResolvedValue('voice-token');
  });

  it.each([
    JwtTokenTypeEnum.APPLICATION_ACCESS,
    JwtTokenTypeEnum.API_KEY,
    JwtTokenTypeEnum.PLAYGROUND,
    undefined,
  ])(
    'rejects %s before minting a user-only Twilio token',
    async (tokenType) => {
      await expect(requestVoiceToken(tokenType)).rejects.toBeInstanceOf(
        AuthException,
      );
      expect(voiceTokens.generateVoiceToken).not.toHaveBeenCalled();
    },
  );

  it('allows a session token to continue to the current capability check', async () => {
    await expect(requestVoiceToken(JwtTokenTypeEnum.ACCESS)).resolves.toBe(
      'voice-token',
    );
    expect(voiceTokens.generateVoiceToken).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      workspaceMemberId: 'administrator-member-id',
    });
  });
});
