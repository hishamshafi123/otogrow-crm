import { isDeepStrictEqual } from 'node:util';
import { localCalendar } from 'src/modules/delivery/operations/delivery-recurrence';
import {
  type MetaConnection,
  type MetaInsightRow,
  type MetaReport,
  type MetaReporting,
} from 'src/modules/delivery/advertising/delivery-meta.types';

export const shiftMetaDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);

export const metaReportDate = (now: Date, timezone: string) =>
  shiftMetaDate(localCalendar(now, timezone).date, -1);

export const metaScheduleSettings = (
  connection: Pick<
    MetaConnection,
    'catchUpDays' | 'refreshDays' | 'dailyImportLimit'
  >,
) => ({
  catchUpDays: connection.catchUpDays ?? 14,
  refreshDays: connection.refreshDays ?? 7,
  dailyImportLimit: connection.dailyImportLimit ?? 10,
});

export const sameMetaMapping = (
  report: MetaReport,
  connection: Pick<
    MetaConnection,
    | 'engagementId'
    | 'accountId'
    | 'currency'
    | 'timezone'
    | 'projectId'
    | 'managerId'
    | 'marketerId'
  >,
) =>
  (report.engagementId ?? null) === (connection.engagementId ?? null) &&
  report.accountId === connection.accountId &&
  report.currency === connection.currency &&
  report.timezone === connection.timezone &&
  report.projectId === connection.projectId &&
  report.managerId === connection.managerId &&
  report.marketerId === connection.marketerId;

export const metaSuccessfulChecks = (
  connection: MetaConnection,
  reports: MetaReport[],
) => {
  const checks = new Map<
    string,
    { date: string; reportId: string; checkedAt: string }
  >();
  // Legacy report timestamps provide coverage without a write on page load.
  for (const report of reports) {
    if (sameMetaMapping(report, connection))
      checks.set(report.date, {
        date: report.date,
        reportId: report.id,
        checkedAt: report.fetchedAt,
      });
  }
  for (const check of connection.checks ?? []) {
    if (checks.get(check.date)?.reportId === check.reportId)
      checks.set(check.date, check);
  }
  return checks;
};

export const metaRetryAt = (
  connection: Pick<MetaConnection, 'accountId' | 'retryAt'>,
  state: MetaReporting,
) =>
  [
    connection.retryAt,
    ...(state.attempts ?? [])
      .filter((attempt) => attempt.accountId === connection.accountId)
      .map((attempt) => attempt.retryAt),
  ].reduce<string | null>(
    (latest, retryAt) =>
      retryAt && (!latest || retryAt > latest) ? retryAt : latest,
    null,
  );

export const metaCoverage = (
  connection: MetaConnection,
  state: MetaReporting,
  now: Date,
  successfulChecks = metaSuccessfulChecks(connection, state.reports),
) => {
  const settings = metaScheduleSettings(connection);
  const today = localCalendar(now, connection.timezone).date;
  const throughDate = shiftMetaDate(today, -1);
  const fromDate = shiftMetaDate(today, -settings.catchUpDays);
  const checks = successfulChecks;
  const missingDates = Array.from(
    { length: settings.catchUpDays },
    (_, index) => shiftMetaDate(fromDate, index),
  ).filter((date) => !checks.has(date));
  const refreshDueDates = Array.from(
    { length: settings.refreshDays },
    (_, index) => shiftMetaDate(throughDate, -index),
  )
    .filter((date) => {
      const check = checks.get(date);
      return (
        check &&
        localCalendar(new Date(check.checkedAt), connection.timezone).date !==
          today
      );
    })
    .sort((left, right) =>
      checks.get(left)!.checkedAt.localeCompare(checks.get(right)!.checkedAt),
    );
  const attemptsToday =
    state.attempts?.find(
      (attempt) =>
        attempt.accountId === connection.accountId && attempt.date === today,
    )?.count ?? 0;
  const nextDate = missingDates.includes(throughDate)
    ? throughDate
    : (missingDates[0] ?? refreshDueDates[0] ?? null);
  return {
    fromDate,
    throughDate,
    missingDates,
    refreshDueDates,
    nextDate,
    attemptDate: today,
    attemptsToday,
    remainingToday: Math.max(0, settings.dailyImportLimit - attemptsToday),
  };
};

const canonicalInsight = (row: MetaInsightRow) => ({
  ...row,
  actions: row.actions
    .slice()
    .sort((left, right) =>
      `${left.action_type}:${left.value}`.localeCompare(
        `${right.action_type}:${right.value}`,
      ),
    ),
  action_values: row.action_values
    .slice()
    .sort((left, right) =>
      `${left.action_type}:${left.value}`.localeCompare(
        `${right.action_type}:${right.value}`,
      ),
    ),
});

export const sameMetaData = (previous: MetaReport, next: MetaReport) =>
  sameMetaMapping(previous, next) &&
  isDeepStrictEqual(
    previous.account ? canonicalInsight(previous.account) : null,
    next.account ? canonicalInsight(next.account) : null,
  ) &&
  isDeepStrictEqual(
    previous.ads
      .map(canonicalInsight)
      .sort((left, right) =>
        `${left.ad_id}:${left.adset_id}:${left.campaign_id}`.localeCompare(
          `${right.ad_id}:${right.adset_id}:${right.campaign_id}`,
        ),
      ),
    next.ads
      .map(canonicalInsight)
      .sort((left, right) =>
        `${left.ad_id}:${left.adset_id}:${left.campaign_id}`.localeCompare(
          `${right.ad_id}:${right.adset_id}:${right.campaign_id}`,
        ),
      ),
  );
