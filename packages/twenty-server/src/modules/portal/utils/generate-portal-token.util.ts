import { randomBytes } from 'crypto';

export const generatePortalToken = (): string => {
  return randomBytes(32).toString('base64url');
};
