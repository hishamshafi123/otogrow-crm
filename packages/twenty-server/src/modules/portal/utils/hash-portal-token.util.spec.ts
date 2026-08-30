import { createHash } from 'crypto';

import { hashPortalToken } from 'src/modules/portal/utils/hash-portal-token.util';

describe('hashPortalToken', () => {
  it('should return the sha256 hex digest of the token', () => {
    const token = 'test-portal-token';

    expect(hashPortalToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });

  it('should be deterministic', () => {
    expect(hashPortalToken('same-token')).toBe(hashPortalToken('same-token'));
  });

  it('should produce different hashes for different tokens', () => {
    expect(hashPortalToken('token-a')).not.toBe(hashPortalToken('token-b'));
  });
});
