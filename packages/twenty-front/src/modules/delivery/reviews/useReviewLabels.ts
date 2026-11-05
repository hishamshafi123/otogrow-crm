import { useLingui } from '@lingui/react/macro';
import { plural } from '@lingui/core/macro';
import { type ReviewQueueItem } from '@/delivery/reviews/review.types';
import { isNonEmptyString } from '@sniptt/guards';
export const useReviewLabels = () => {
  const { t } = useLingui();
  const states: Record<string, string> = {
    ACTIVE: t`Eligible now`,
    UNASSIGNED: t`Reviewer not assigned`,
    UNAVAILABLE: t`Reviewer currently unavailable`,
    SELF_REVIEW: t`Independent reviewer needed`,
  };
  const warnings: Record<string, string> = {
    UNKNOWN_SUBMISSION_TIME: t`The submitted time is unknown; waiting time cannot be established.`,
    FUTURE_SUBMISSION_TIME: t`The recorded submitted time is in the future; waiting time cannot be established.`,
    REVIEWER_UNAVAILABLE: t`Review the current reviewer assignment.`,
    REVIEWER_NATIVE_ACCESS_UNAVAILABLE: t`The assigned reviewer cannot currently access or update this task. A manager must choose an eligible reviewer or review their permissions.`,
    NATIVE_REVIEW_WRITE_UNAVAILABLE: t`You can inspect this submission, but your task permissions do not allow a review decision. Ask a manager to check your access.`,
    SELF_REVIEW: t`The producer cannot approve their own work.`,
    SUBMISSION_IDENTITY_UNAVAILABLE: t`This submitted version cannot be established. Review the source before making a decision.`,
    WORKFLOW_REQUIREMENTS_UNAVAILABLE: t`The required review checks cannot be established. Refresh the submitted requirements before approval.`,
    LEGACY_CREATIVE_IDENTITY: t`Frozen creative media is unavailable. Request a new exact submission before approval.`,
  };
  return {
    reviewer: (state: string) =>
      states[state] ?? t`Reviewer status not verified`,
    mode: (mode: string) =>
      mode === 'BACKUP'
        ? t`Submission backup`
        : mode === 'PRIMARY'
          ? t`Primary manager`
          : t`Assignment unavailable`,
    warning: (code: string) =>
      warnings[code] ?? t`This submission needs a source or reviewer check.`,
    submittedAt: (
      value: string | null | undefined,
      observedAt: string | null | undefined,
    ) => {
      const time = isNonEmptyString(value) ? Date.parse(value) : NaN;
      if (!Number.isFinite(time)) return t`Submitted time unknown`;
      const recorded = `${new Date(time).toLocaleString(undefined, { timeZone: 'UTC' })} UTC`;
      const observed = isNonEmptyString(observedAt)
        ? Date.parse(observedAt)
        : NaN;
      if (!Number.isFinite(observed))
        return t`Recorded submitted time: ${recorded} · Current timing unverified`;
      return time > observed
        ? t`Recorded future submitted time: ${recorded} · Waiting time unverified`
        : recorded;
    },
    age: (item: ReviewQueueItem) =>
      item.ageState === 'VALID' &&
      item.ageSeconds != null &&
      Number.isFinite(item.ageSeconds) &&
      item.ageSeconds >= 0
        ? item.ageSeconds < 3600
          ? plural(Math.floor(item.ageSeconds / 60), {
              one: 'Waiting # minute',
              other: 'Waiting # minutes',
            })
          : item.ageSeconds < 86400
            ? plural(Math.floor(item.ageSeconds / 3600), {
                one: 'Waiting # hour',
                other: 'Waiting # hours',
              })
            : plural(Math.floor(item.ageSeconds / 86400), {
                one: 'Waiting # day',
                other: 'Waiting # days',
              })
        : item.ageState === 'FUTURE'
          ? t`Submitted time is in the future`
          : t`Waiting time unknown`,
  };
};
