import {
  assetKindForMime,
  bindClientDriveFolderSchema,
  buildPortalSlug,
  formatDriveDeliverableFilename,
  formatDriveMonthFolder,
  formatDriveVariationFilename,
  generateClientAccessCode,
  hashClientAccessCode,
  matchExistingMonthSubfolder,
  normalizeServiceScope,
  parseByteRangeHeader,
  resolveClientBillingCycle,
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

  describe('resolveClientBillingCycle & matchExistingMonthSubfolder', () => {
    it('computes client billing cycle across month and year boundaries', () => {
      // Month starts on 15th; on Dec 5 we are still inside Nov 15 – Dec 14 cycle
      const dec5 = resolveClientBillingCycle(
        15,
        new Date(Date.UTC(2026, 11, 5)),
      );
      expect(dec5.cycleMonthKey).toBe('2026-11');
      expect(dec5.cycleLabel).toBe('Nov 15 – Dec 14, 2026');

      // On Dec 15 we roll into Dec 15, 2026 – Jan 14, 2027
      const dec15 = resolveClientBillingCycle(
        15,
        new Date(Date.UTC(2026, 11, 15)),
      );
      expect(dec15.cycleMonthKey).toBe('2026-12');
      expect(dec15.cycleLabel).toBe('Dec 15, 2026 – Jan 14, 2027');

      // On Jan 5 with start day 15 we are still inside 2026-12 cycle
      const jan5 = resolveClientBillingCycle(
        15,
        new Date(Date.UTC(2027, 0, 5)),
      );
      expect(jan5.cycleMonthKey).toBe('2026-12');
      expect(jan5.cycleLabel).toBe('Dec 15, 2026 – Jan 14, 2027');

      // Start day 31 clamps cleanly for February
      const mar10 = resolveClientBillingCycle(
        31,
        new Date(Date.UTC(2026, 2, 10)),
      );
      expect(mar10.cycleMonthKey).toBe('2026-02');
      expect(mar10.startDay).toBe(28);
    });

    it('matches existing month folders across naming styles without confusing trailing range months or other years', () => {
      const folders = [
        { id: 'f-2025', name: 'November 2025' },
        { id: 'f-oct', name: 'Oct 15 - Nov 14' },
        { id: 'f-nov-range', name: 'Nov 15 - Dec 14' },
        { id: 'f-dec', name: 'December 2026' },
      ];

      // Must match Nov 15 - Dec 14, NOT Oct 15 - Nov 14 and NOT November 2025
      expect(
        matchExistingMonthSubfolder(folders, {
          monthKey: '2026-11',
          expectedName: 'November 2026',
          monthStartDay: 15,
        })?.id,
      ).toBe('f-nov-range');

      // If only Oct 15 - Nov 14 exists, do NOT mistakenly match it for 2026-11
      expect(
        matchExistingMonthSubfolder(
          [
            { id: 'f-2025', name: 'November 2025' },
            { id: 'f-oct', name: 'Oct 15 - Nov 14' },
          ],
          {
            monthKey: '2026-11',
            expectedName: 'November 2026',
            monthStartDay: 15,
          },
        ),
      ).toBeNull();

      // Matches YYYY-MM and short month names
      expect(
        matchExistingMonthSubfolder(
          [
            { id: 'f-10', name: '2026-10' },
            { id: 'f-11', name: '2026-11 Content' },
          ],
          {
            monthKey: '2026-11',
            expectedName: 'November 2026',
            monthStartDay: 1,
          },
        )?.id,
      ).toBe('f-11');

      expect(
        matchExistingMonthSubfolder(
          [
            { id: 'f-oct', name: 'October' },
            { id: 'f-nov', name: 'November' },
          ],
          {
            monthKey: '2026-11',
            expectedName: 'November 2026',
            monthStartDay: 1,
          },
        )?.id,
      ).toBe('f-nov');
    });
  });

  describe('bindClientDriveFolderSchema (multiple main folders)', () => {
    it('accepts multiple labeled main folders with a default and enforces the 15-folder cap', () => {
      const valid = bindClientDriveFolderSchema.safeParse({
        companyId: '11111111-1111-4111-8111-111111111111',
        companyName: 'Acme Apparel',
        rootFolders: [
          { id: 'folder-reels', name: 'Acme Reels', label: 'Reels', isDefault: true },
          { id: 'folder-ads', name: 'Acme Paid Ads', label: 'Paid Ads', isDefault: false },
          { id: 'folder-ugc', name: 'Acme UGC', label: null, isDefault: false },
        ],
        monthStartDay: 10,
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.rootFolders).toHaveLength(3);
        expect(valid.data.rootFolders?.[0].label).toBe('Reels');
      }

      const tooMany = bindClientDriveFolderSchema.safeParse({
        companyId: '11111111-1111-4111-8111-111111111111',
        rootFolders: Array.from({ length: 16 }, (_, idx) => ({
          id: `folder-${idx}`,
          name: `Folder ${idx}`,
        })),
      });
      expect(tooMany.success).toBe(false);
    });
  });
});
