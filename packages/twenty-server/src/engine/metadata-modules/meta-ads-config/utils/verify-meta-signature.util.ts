import { createHmac, timingSafeEqual } from 'crypto';

// Meta signs webhook deliveries with the app secret as
// "sha256=<hex hmac of the raw request body>".
export const verifyMetaSignature = ({
  appSecret,
  rawBody,
  signatureHeader,
}: {
  appSecret: string;
  rawBody: Buffer;
  signatureHeader: string;
}): boolean => {
  const expectedPrefix = 'sha256=';

  if (!signatureHeader.startsWith(expectedPrefix)) {
    return false;
  }

  const expectedSignature = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const receivedSignature = signatureHeader.slice(expectedPrefix.length);

  if (expectedSignature.length !== receivedSignature.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedSignature),
  );
};
