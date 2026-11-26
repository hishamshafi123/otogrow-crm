import {
  assetKindForMime,
  buildPortalSlug,
  formatDriveDeliverableFilename,
  formatDriveMonthFolder,
  formatDriveVariationFilename,
  generateClientAccessCode,
  hashClientAccessCode,
  normalizeServiceScope,
  parseByteRangeHeader,
  sanitizeSafeReturnPath,
  signDeliverableMediaToken,
  signDriveOAuthState,
  validateCustomAccessCode,
  validateMonthFolderPattern,
  validatePortalSlug,
  verifyClientAccessCodeHash,
  verifyDeliverableMediaToken,
  verifyDriveOAuthState,
} from 'src/modules/delivery/deliverables/delivery-deliverables.policy';

describe('delivery-deliverables.policy', () => {
  describe('formatDriveMonthFolder & validateMonthFolderPattern', () => {
    it('formats dynamic month folder patterns accurately', () => {
      expect(formatDriveMonthFolder('2026-11', '{Month} {YYYY}')).toBe(
        'November 2026',
      );
      expect(formatDriveMonthFolder('2026-11', '{YYYY}-{MM}')).toBe('2026-11');
      expect(
        formatDriveMonthFolder('2026-11', '{YYYY}-{MM} - {Month} {YYYY}'),
      ).toBe('2026-11 - November 2026');
      expect(formatDriveMonthFolder('2026-03', '{Mon} {YY}')).toBe('Mar 26');
      expect(formatDriveMonthFolder('2026-01', 'Month {M} ({YYYY})')).toBe(
        'Month 1 (2026)',
      );
      expect(() => formatDriveMonthFolder('0000-01', '{Month} {YYYY}')).toThrow();
    });

    it('rejects patterns missing month or year tokens or containing path separators', () => {
      expect(() => validateMonthFolderPattern('StaticFolder')).toThrow();
      expect(() => validateMonthFolderPattern('{Month}')).toThrow();
      expect(() => validateMonthFolderPattern('{YYYY}')).toThrow();
      expect(() => validateMonthFolderPattern('{YYYY}/{MM}')).toThrow();
      expect(validateMonthFolderPattern('{Month} {YYYY}')).toBe(
        '{Month} {YYYY}',
      );
    });
  });

  describe('access codes and slugs', () => {
    it('generates verifiable human-friendly codes and validates custom codes', () => {
      const code = generateClientAccessCode();
      expect(code).toMatch(/^OTO-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      const hash = hashClientAccessCode(code, 'test-pepper');
      expect(
        verifyClientAccessCodeHash(code.toLowerCase(), hash, 'test-pepper'),
      ).toBe(true);
      expect(
        verifyClientAccessCodeHash('OTO-WRONG-CODE', hash, 'test-pepper'),
      ).toBe(false);

      expect(validateCustomAccessCode('  belfort-2026  ')).toBe('BELFORT-2026');
      expect(() => validateCustomAccessCode('abc')).toThrow();
      expect(() => validateCustomAccessCode('bad code!')).toThrow();
    });

    it('builds clean portal slugs', () => {
      expect(buildPortalSlug('Belfort Entity Hokuro', '12345678-aaaa')).toBe(
        'belfort-entity-hokuro',
      );
      expect(validatePortalSlug('Belfort--Agency')).toBe('belfort-agency');
      expect(() => validatePortalSlug('a')).toThrow();
    });
  });

  describe('naming and byte ranges', () => {
    it('formats Drive filenames for standalone and variation files', () => {
      expect(formatDriveDeliverableFilename(1, 'video/mp4')).toBe('1.mp4');
      expect(formatDriveDeliverableFilename(4, 'video/quicktime')).toBe(
        '4.mov',
      );
      expect(formatDriveVariationFilename(2, 'video/mp4')).toBe('v2.mp4');
      expect(assetKindForMime('video/mp4')).toBe('VIDEO');
      expect(assetKindForMime('image/png')).toBe('IMAGE');
      expect(assetKindForMime('application/pdf')).toBe('DOCUMENT');
      expect(normalizeServiceScope('AI video', 'FLAT')).toBe('ALL');
      expect(normalizeServiceScope('AI video', 'SERVICE_SPLIT')).toBe(
        'ai-video',
      );
    });

    it('parses RFC 7233 byte range headers safely', () => {
      expect(parseByteRangeHeader(undefined, 1000)).toBeNull();
      expect(parseByteRangeHeader('bytes=0-499', 1000)).toEqual({
        start: 0,
        end: 499,
        chunkLength: 500,
      });
      expect(parseByteRangeHeader('bytes=500-', 1000)).toEqual({
        start: 500,
        end: 999,
        chunkLength: 500,
      });
      expect(parseByteRangeHeader('bytes=-200', 1000)).toEqual({
        start: 800,
        end: 999,
        chunkLength: 200,
      });
      expect(parseByteRangeHeader('bytes=2000-2500', 1000)).toBe('INVALID');
      expect(parseByteRangeHeader('bytes=500-200', 1000)).toBe('INVALID');
    });
  });

  describe('signed media & Drive OAuth state tokens', () => {
    it('signs and verifies deliverable media tokens with scope & expiry checks', () => {
      const token = signDeliverableMediaToken(
        'super-secret',
        {
          w: '11111111-1111-4111-8111-111111111111',
          t: 'deliverable',
          id: '22222222-2222-4222-8222-222222222222',
        },
        60_000,
      );
      expect(
        verifyDeliverableMediaToken(
          'super-secret',
          token,
          'deliverable',
          '22222222-2222-4222-8222-222222222222',
        )?.w,
      ).toBe('11111111-1111-4111-8111-111111111111');
      expect(
        verifyDeliverableMediaToken(
          'wrong-secret',
          token,
          'deliverable',
          '22222222-2222-4222-8222-222222222222',
        ),
      ).toBeNull();
      expect(
        verifyDeliverableMediaToken(
          'super-secret',
          token,
          'thumbnail',
          '22222222-2222-4222-8222-222222222222',
        ),
      ).toBeNull();
    });

    it('signs and verifies Drive OAuth state and prevents open redirects', () => {
      expect(sanitizeSafeReturnPath('https://evil.com')).toBe(
        '/delivery?view=deliverables',
      );
      expect(sanitizeSafeReturnPath('//evil.com/x')).toBe(
        '/delivery?view=deliverables',
      );
      expect(sanitizeSafeReturnPath('/delivery?view=deliverables')).toBe(
        '/delivery?view=deliverables',
      );

      const state = signDriveOAuthState('secret-key', {
        w: '11111111-1111-4111-8111-111111111111',
        m: '22222222-2222-4222-8222-222222222222',
        uw: '33333333-3333-4333-8333-333333333333',
        ret: 'https://evil.com',
      });
      const verified = verifyDriveOAuthState('secret-key', state);
      expect(verified?.w).toBe('11111111-1111-4111-8111-111111111111');
      expect(verified?.ret).toBe('/delivery?view=deliverables');
      expect(verifyDriveOAuthState('other-key', state)).toBeNull();
    });
  });
});
