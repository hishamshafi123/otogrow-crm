import { createHmac, timingSafeEqual } from 'crypto';

// Twilio signs webhooks with an HMAC-SHA1 over the request URL with every POST
// param appended in sorted key order (key immediately followed by value),
// keyed with the account auth token and carried base64 in X-Twilio-Signature.
export const verifyTwilioSignature = ({
  authToken,
  url,
  params,
  signature,
}: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean => {
  const data = Object.keys(params)
    .sort()
    .reduce((payload, key) => `${payload}${key}${params[key]}`, url);

  const expectedSignature = createHmac('sha1', authToken)
    .update(data)
    .digest('base64');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const candidateBuffer = Buffer.from(signature, 'utf8');

  return (
    expectedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(expectedBuffer, candidateBuffer)
  );
};
