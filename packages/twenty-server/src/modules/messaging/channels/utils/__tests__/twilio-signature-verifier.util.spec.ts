import { createHmac } from 'crypto';

import { verifyTwilioSignature } from 'src/modules/messaging/channels/utils/twilio-signature-verifier.util';

const AUTH_TOKEN = 'test-twilio-auth-token';
const URL = 'http://localhost:3000/webhooks/twilio/workspace-id/inbound';

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

describe('verifyTwilioSignature', () => {
  const params = {
    From: 'whatsapp:+14155551234',
    To: 'whatsapp:+15550001111',
    Body: 'Hello there',
    MessageSid: 'SM123',
  };

  it('should accept a valid signature', () => {
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        url: URL,
        params,
        signature: signPayload({ url: URL, params }),
      }),
    ).toBe(true);
  });

  it('should accept a valid signature regardless of param order', () => {
    const reorderedParams = Object.fromEntries(
      Object.entries(params).reverse(),
    );

    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        url: URL,
        params: reorderedParams,
        signature: signPayload({ url: URL, params }),
      }),
    ).toBe(true);
  });

  it('should reject a signature computed for another URL', () => {
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        url: URL,
        params,
        signature: signPayload({ url: `${URL}/status`, params }),
      }),
    ).toBe(false);
  });

  it('should reject a signature computed with another auth token', () => {
    const signature = signPayload({ url: URL, params });

    expect(
      verifyTwilioSignature({
        authToken: 'another-token',
        url: URL,
        params,
        signature,
      }),
    ).toBe(false);
  });

  it('should reject a signature when a param value is tampered with', () => {
    const signature = signPayload({ url: URL, params });

    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        url: URL,
        params: { ...params, Body: 'Tampered' },
        signature,
      }),
    ).toBe(false);
  });

  it('should reject a malformed signature without throwing', () => {
    expect(
      verifyTwilioSignature({
        authToken: AUTH_TOKEN,
        url: URL,
        params,
        signature: 'not-a-valid-base64-signature!!!',
      }),
    ).toBe(false);
  });
});
