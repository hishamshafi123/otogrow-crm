export type GoogleApisScopeConfiguration = {
  isMessagingEnabled: boolean;
  isCalendarEnabled: boolean;
};

export const getGoogleApisOauthScopes = ({
  isMessagingEnabled,
  isCalendarEnabled,
}: GoogleApisScopeConfiguration): string[] => [
  'email',
  'profile',
  ...(isMessagingEnabled
    ? [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose',
      ]
    : []),
  ...(isCalendarEnabled
    ? ['https://www.googleapis.com/auth/calendar.events']
    : []),
];
