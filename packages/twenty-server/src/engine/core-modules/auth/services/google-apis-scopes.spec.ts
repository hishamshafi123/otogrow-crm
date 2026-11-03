import { AuthException } from 'src/engine/core-modules/auth/auth.exception';
import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { GoogleAPIScopesService } from './google-apis-scopes';

const IDENTITY_SCOPES = ['email', 'profile'];
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
];
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const createService = (gmail: boolean, calendar: boolean) => {
  const get = jest.fn();
  const configuration: Record<string, boolean> = {
    MESSAGING_PROVIDER_GMAIL_ENABLED: gmail,
    CALENDAR_PROVIDER_GOOGLE_ENABLED: calendar,
  };
  return {
    get,
    service: new GoogleAPIScopesService(
      { getHttpClient: () => ({ get }) } as unknown as SecureHttpClientService,
      {
        get: (key: string) => configuration[key],
      } as unknown as TwentyConfigService,
    ),
  };
};

describe('Google token scope acceptance', () => {
  it.each([
    {
      name: 'Gmail without Calendar',
      gmail: true,
      calendar: false,
      scopes: [...IDENTITY_SCOPES, ...GMAIL_SCOPES],
      valid: true,
    },
    {
      name: 'Calendar without Gmail',
      gmail: false,
      calendar: true,
      scopes: [...IDENTITY_SCOPES, CALENDAR_SCOPE],
      valid: true,
    },
    {
      name: 'both configured',
      gmail: true,
      calendar: true,
      scopes: [...IDENTITY_SCOPES, ...GMAIL_SCOPES, CALENDAR_SCOPE],
      valid: true,
    },
    {
      name: 'older wider consent',
      gmail: true,
      calendar: false,
      scopes: [...IDENTITY_SCOPES, ...GMAIL_SCOPES, CALENDAR_SCOPE],
      valid: true,
    },
    {
      name: 'missing enabled Calendar grant',
      gmail: true,
      calendar: true,
      scopes: [...IDENTITY_SCOPES, ...GMAIL_SCOPES],
      valid: false,
    },
    {
      name: 'missing enabled Gmail send grant',
      gmail: true,
      calendar: false,
      scopes: [
        ...IDENTITY_SCOPES,
        ...GMAIL_SCOPES.filter((scope) => !scope.endsWith('/gmail.send')),
      ],
      valid: false,
    },
    {
      name: 'missing identity grant',
      gmail: true,
      calendar: false,
      scopes: GMAIL_SCOPES,
      valid: false,
    },
    {
      name: 'Google expanded identity spelling',
      gmail: true,
      calendar: false,
      scopes: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        ...GMAIL_SCOPES,
      ],
      valid: true,
    },
  ])('$name', async ({ gmail, calendar, scopes, valid }) => {
    const { service, get } = createService(gmail, calendar);
    get.mockResolvedValue({ data: { scope: scopes.join(' ') } });

    await expect(
      service.getScopesFromGoogleAccessTokenAndCheckIfExpectedScopesArePresent(
        'synthetic-access-token',
      ),
    ).resolves.toEqual({ scopes, isValid: valid });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('fails closed when token grants cannot be checked', async () => {
    const { service, get } = createService(true, false);
    get.mockRejectedValue(new Error('synthetic provider failure'));
    await expect(
      service.getScopesFromGoogleAccessTokenAndCheckIfExpectedScopesArePresent(
        'synthetic-access-token',
      ),
    ).rejects.toThrow(AuthException);
  });
});
