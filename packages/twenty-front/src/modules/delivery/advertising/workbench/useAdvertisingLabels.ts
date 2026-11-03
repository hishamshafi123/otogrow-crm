import { useLingui } from '@lingui/react/macro';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';

export const useAdvertisingLabels = () => {
  const { t, i18n } = useLingui();
  const goals: Record<string, string> = {
    PURCHASES: t`Purchases`,
    LEADS: t`Leads`,
    QUALIFIED_LEADS: t`Qualified leads`,
    BOOKED_CALLS: t`Booked calls`,
    REGISTRATIONS: t`Webinar registrations`,
    SALES: t`Sales revenue`,
  };
  const states: Record<string, string> = {
    REVIEW: t`Needs review`,
    APPROVED: t`Report reviewed`,
    CHANGES_REQUESTED: t`Changes requested`,
    DRAFT: t`Recommendations in preparation`,
    ASSIGNED: t`Work assigned`,
    PLANNED: t`Planned`,
    IN_PROGRESS: t`In progress`,
    BLOCKED: t`Blocked`,
    IN_REVIEW: t`Awaiting independent review`,
  };
  const assessments: Record<string, string> = {
    IMPROVED: t`Improved`,
    WORSE: t`Worse`,
    UNCHANGED: t`Unchanged`,
    INCONCLUSIVE: t`Inconclusive`,
  };
  const reasons: Record<string, string> = {
    MISSING_PROJECT: t`Map this report to a client project before planning work.`,
    CLIENT_PROJECT_CHANGED: t`The client project has changed. Review its source mapping before planning more work.`,
    ROUTING_UNAVAILABLE: t`Reporting responsibilities need an active project manager and a separate marketer.`,
    SOURCE_VOID: t`This report was voided and cannot be used for new work.`,
    SOURCE_NOT_SUBMITTED: t`Submit the manual report for review before assigning recommendations.`,
    INDEPENDENT_SOURCE_REVIEW_REQUIRED: t`Another authorized manager must review this source before these recommendations can be assigned.`,
    NO_PROVIDER_ROW: t`The platform returned no reporting row.`,
    NOT_REPORTED: t`This value was not reported.`,
    LEGACY_FIELD_PRESENCE_NOT_RECORDED: t`This older import did not preserve whether the platform supplied this field.`,
    UNSUPPORTED_PROVIDER_VALUE: t`This reported value could not be interpreted reliably.`,
    AMBIGUOUS_PROVIDER_METRIC: t`More than one provider value used this event name. Choose another metric or add independent evidence.`,
    HUMAN_REPORT_NOT_INDEPENDENT_VERIFICATION: t`Manually reported; independent verification has not been recorded.`,
    NOT_MAPPED: t`No source metric has been selected for this outcome.`,
  };
  return {
    goal: (value: string | null | undefined) =>
      value ? (goals[value] ?? t`Unmapped outcome`) : t`Unmapped outcome`,
    reportedGoal: (value: string) =>
      value === 'CALLS'
        ? t`Calls`
        : (goals[value] ?? t`Original outcome needs confirmation`),
    source: (value: string) =>
      value === 'META'
        ? t`Imported Meta report`
        : value === 'MANUAL'
          ? t`Manually recorded report`
          : t`Report source unknown`,
    state: (value: string) => states[value] ?? t`Status unavailable`,
    assessment: (value: string) => assessments[value] ?? t`Inconclusive`,
    planState: (value: string, actionCount: number) =>
      value === 'ASSIGNED' && actionCount === 0
        ? t`Reviewed — no changes needed`
        : (states[value] ?? t`Status unavailable`),
    taskState: (value: string) =>
      value === 'APPROVED'
        ? t`Work approved`
        : (states[value] ?? t`Current task status unavailable`),
    provenance: (value: string) =>
      value === 'PLATFORM_REPORTED'
        ? t`Reported by the ad platform`
        : value === 'HUMAN_REPORTED'
          ? t`Recorded by a person`
          : t`No source metric mapped`,
    reason: (value: string) =>
      reasons[value] ?? t`Review the current requirements before continuing.`,
    money: (
      value: string | null | undefined,
      currency: string | null | undefined,
    ) =>
      value == null || !currency
        ? t`Unknown`
        : formatFinanceAmountMicros(value, currency, i18n.locale),
    count: (value: string | null | undefined) =>
      value == null ? t`Unknown` : value,
  };
};
