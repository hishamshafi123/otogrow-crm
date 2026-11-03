import { type APIsOAuthRequest } from 'src/engine/core-modules/auth/types/apis-oauth-request.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { GoogleAPIsOauthRequestCodeStrategy } from './google-apis-oauth-request-code.auth.strategy';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
];
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

describe('Google account authorization consent', () => {
  it.each([
    { gmail: true, calendar: false, expected: GMAIL_SCOPES },
    { gmail: false, calendar: true, expected: [CALENDAR_SCOPE] },
    {
      gmail: true,
      calendar: true,
      expected: [...GMAIL_SCOPES, CALENDAR_SCOPE],
    },
    { gmail: false, calendar: false, expected: [] },
  ])(
    'requests only configured provider access: %j',
    ({ gmail, calendar, expected }) => {
      const configuration: Record<string, string | boolean> = {
        AUTH_GOOGLE_CLIENT_ID: 'synthetic-client.apps.googleusercontent.com',
        AUTH_GOOGLE_CLIENT_SECRET: 'synthetic-client-secret',
        AUTH_GOOGLE_APIS_CALLBACK_URL:
          'https://crm.example.invalid/auth/google-apis/get-access-token',
        MESSAGING_PROVIDER_GMAIL_ENABLED: gmail,
        CALENDAR_PROVIDER_GOOGLE_ENABLED: calendar,
      };
      const strategy = new GoogleAPIsOauthRequestCodeStrategy({
        get: (key: string) => configuration[key],
      } as unknown as TwentyConfigService);
      const redirect = jest.fn();
      strategy.redirect = redirect;

      strategy.authenticate(
        {
          query: {},
          params: {
            transientToken: 'synthetic-transient-token',
            loginHint: 'synthetic@example.invalid',
            calendarVisibility: 'SHARE_EVERYTHING',
          },
        } as unknown as APIsOAuthRequest,
        {},
      );

      expect(redirect).toHaveBeenCalledTimes(1);
      const url = new URL(redirect.mock.calls[0][0]);
      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(
        ['email', 'profile', ...expected].sort(),
      );
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(url.searchParams.get('redirect_uri')).toBe(
        configuration.AUTH_GOOGLE_APIS_CALLBACK_URL,
      );
      expect(
        JSON.parse(url.searchParams.get('state') ?? '{}').transientToken,
      ).toBe('synthetic-transient-token');
    },
  );
});
