import { createHash } from 'crypto';

export const hashPortalToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex');
};
