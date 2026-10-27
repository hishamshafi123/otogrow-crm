import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import {
  metaConfigurationSchema,
  metaCommandSchema,
  type MetaConnection,
  type MetaReport,
  type MetaReporting,
} from 'src/modules/delivery/advertising/delivery-meta.types';
import {
  metaCoverage,
  metaReportDate,
  metaScheduleSettings,
  sameMetaData,
} from 'src/modules/delivery/advertising/delivery-meta-schedule';

const connection: MetaConnection = {
  accountId: '123456789',
  revision: 1,
  projectId: null,
  managerId: null,
  marketerId: null,
  time: '06:00',
  enabled: false,
  ciphertext: 'fixture' as EncryptedString,
  name: 'Fixture',
  currency: 'USD',
  timezone: 'Asia/Qatar',
  ownerId: 'fixture',
  userWorkspaceId: 'fixture',
  lastSuccessAt: null,
  lastDate: '2026-10-24',
  error: null,
  retryAt: null,
  lease: null,
};
const report = (
  date: string,
  fetchedAt = '2026-10-25T03:00:00Z',
): MetaReport => ({
  id: date,
  accountId: connection.accountId,
  projectId: null,
  managerId: null,
  marketerId: null,
  date,
  currency: 'USD',
  timezone: 'Asia/Qatar',
  fetchedAt,
  account: null,
  ads: [],
  status: 'REVIEW',
  reviewedBy: null,
  reviewedAt: null,
  note: '',
  taskId: null,
});
const state = (reports: MetaReport[] = []): MetaReporting => ({
  connections: [connection],
  reports,
  workerSeenAt: null,
});
const now = new Date('2026-10-25T03:00:00Z');

it('recovers legacy coverage without trusting lastDate or writing defaults', () => {
  const saved = state([report('2026-10-24')]);
  const before = JSON.stringify(saved);
  expect(metaScheduleSettings(connection)).toEqual({
    catchUpDays: 14,
    refreshDays: 7,
    dailyImportLimit: 10,
  });
  expect(metaCoverage(connection, saved, now)).toMatchObject({
    fromDate: '2026-10-11',
    throughDate: '2026-10-24',
    nextDate: '2026-10-11',
    attemptsToday: 0,
    remainingToday: 10,
  });
  expect(metaCoverage(connection, state(), now).nextDate).toBe('2026-10-24');
  expect(JSON.stringify(saved)).toBe(before);
});

it('checks yesterday, then the oldest missing day, then stale recent data once a local day', () => {
  const configured = { ...connection, catchUpDays: 3, refreshDays: 2 };
  const saved = state([
    report('2026-10-24'),
    report('2026-10-23', '2026-10-24T03:00:00Z'),
  ]);
  expect(metaCoverage(configured, saved, now).nextDate).toBe('2026-10-22');
  saved.reports.push(report('2026-10-22'));
  expect(metaCoverage(configured, saved, now).nextDate).toBe('2026-10-23');
  configured.checks = [
    {
      date: '2026-10-23',
      reportId: '2026-10-23',
      checkedAt: now.toISOString(),
    },
  ];
  expect(metaCoverage(configured, saved, now).nextDate).toBeNull();
  expect(
    metaCoverage({ ...configured, refreshDays: 0 }, saved, now).refreshDueDates,
  ).toEqual([]);
});

it('does not treat another project or currency as current coverage', () => {
  const saved = state([{ ...report('2026-10-24'), projectId: 'different' }]);
  expect(metaCoverage(connection, saved, now).missingDates).toContain(
    '2026-10-24',
  );
  saved.reports[0] = { ...report('2026-10-24'), currency: 'EUR' };
  expect(metaCoverage(connection, saved, now).missingDates).toContain(
    '2026-10-24',
  );
});

it('includes successful empty days and ignores checks pointing at a superseded report', () => {
  const saved = state([report('2026-10-24', '2026-10-24T20:00:00Z')]);
  const configured = {
    ...connection,
    catchUpDays: 1,
    refreshDays: 1,
    checks: [
      {
        date: '2026-10-24',
        reportId: 'old-version',
        checkedAt: now.toISOString(),
      },
    ],
  };
  expect(metaCoverage(configured, saved, now).missingDates).toEqual([]);
  expect(metaCoverage(configured, saved, now).refreshDueDates).toEqual([
    '2026-10-24',
  ]);
});

it('uses account-local days at midnight, leap years and DST boundaries', () => {
  expect(metaReportDate(new Date('2026-10-24T20:59:59Z'), 'Asia/Qatar')).toBe(
    '2026-10-23',
  );
  expect(metaReportDate(new Date('2026-10-24T21:00:00Z'), 'Asia/Qatar')).toBe(
    '2026-10-24',
  );
  expect(metaReportDate(new Date('2024-03-01T03:00:00Z'), 'Asia/Qatar')).toBe(
    '2024-02-29',
  );
  expect(metaReportDate(new Date('2027-01-01T03:00:00Z'), 'Asia/Qatar')).toBe(
    '2026-12-31',
  );
  expect(
    metaReportDate(new Date('2026-03-09T10:00:00Z'), 'America/New_York'),
  ).toBe('2026-03-08');
  expect(
    metaReportDate(new Date('2026-11-02T11:00:00Z'), 'America/New_York'),
  ).toBe('2026-11-01');
});

it('keeps account-local attempt usage separate by day and clamps remaining after a lowered limit', () => {
  const saved = state();
  saved.attempts = [
    { accountId: connection.accountId, date: '2026-10-24', count: 20 },
    { accountId: connection.accountId, date: '2026-10-25', count: 4 },
    { accountId: 'other', date: '2026-10-25', count: 50 },
  ];
  expect(
    metaCoverage({ ...connection, dailyImportLimit: 3 }, saved, now),
  ).toMatchObject({ attemptsToday: 4, remainingToday: 0 });
  expect(
    metaCoverage(connection, saved, new Date('2026-10-25T21:00:00Z'))
      .attemptsToday,
  ).toBe(0);
});

it('validates bounded windows, refresh within catch-up, and real calendar dates', () => {
  const configuration = {
    accountId: connection.accountId,
    revision: 0,
    projectId: null,
    managerId: null,
    marketerId: null,
    time: '06:00',
    enabled: false,
  };
  expect(metaConfigurationSchema.safeParse(configuration).success).toBe(true);
  for (const invalid of [
    { catchUpDays: 91 },
    { refreshDays: 31 },
    { dailyImportLimit: 101 },
    { dailyImportLimit: 0 },
    { catchUpDays: 2, refreshDays: 3 },
  ])
    expect(
      metaConfigurationSchema.safeParse({ ...configuration, ...invalid })
        .success,
    ).toBe(false);
  expect(
    metaCommandSchema.safeParse({
      action: 'sync',
      accountId: connection.accountId,
      date: '2026-02-30',
    }).success,
  ).toBe(false);
});

it('ignores provider ordering but detects delayed conversions, mapping and currency changes without changing approved reports', () => {
  const row = {
    account_id: connection.accountId,
    date_start: '2026-10-24',
    date_stop: '2026-10-24',
    spend: '10.01',
    impressions: '100',
    clicks: '10',
    actions: [
      { action_type: 'purchase', value: '2' },
      { action_type: 'lead', value: '3' },
    ],
    action_values: [{ action_type: 'purchase', value: '40.01' }],
  };
  const approved = {
    ...report('2026-10-24'),
    status: 'APPROVED' as const,
    note: 'Approved recommendation',
    account: row,
    ads: [
      { ...row, ad_id: 'a' },
      { ...row, ad_id: 'b' },
    ],
  };
  const before = JSON.stringify(approved);
  const reordered = {
    ...approved,
    account: { ...row, actions: row.actions.slice().reverse() },
    ads: approved.ads.slice().reverse(),
  };
  expect(sameMetaData(approved, reordered)).toBe(true);
  expect(
    sameMetaData(approved, {
      ...reordered,
      account: {
        ...row,
        action_values: [{ action_type: 'purchase', value: '80.02' }],
      },
    }),
  ).toBe(false);
  expect(sameMetaData(approved, { ...reordered, currency: 'EUR' })).toBe(false);
  expect(sameMetaData(approved, { ...reordered, managerId: 'another' })).toBe(
    false,
  );
  expect(JSON.stringify(approved)).toBe(before);
});
