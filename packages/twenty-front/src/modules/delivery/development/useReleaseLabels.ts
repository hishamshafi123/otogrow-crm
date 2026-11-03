import { useLingui } from '@lingui/react/macro';

export const useReleaseLabels = () => {
  const { t } = useLingui();
  const states: Record<string, string> = {
    DRAFT: t`Planning`,
    SUBMITTED: t`Awaiting manager review`,
    APPROVED: t`Approved for deployment`,
    CHANGES_REQUESTED: t`Changes requested`,
    DEPLOYED: t`Deployment recorded`,
    HANDED_OVER: t`Client handover recorded`,
    ACCEPTED: t`Client acceptance recorded`,
  };
  const checks: Record<string, string> = {
    TEST: t`Tests`,
    CODE_REVIEW: t`Code review`,
    ROLLBACK: t`Rollback readiness`,
    HANDOVER: t`Handover readiness`,
  };
  const checkStates: Record<string, string> = {
    NOT_RUN: t`Not checked`,
    PASSED: t`Passed`,
    FAILED: t`Failed`,
  };
  const actions: Record<string, string> = {
    SAVE: t`Save release plan`,
    SUBMIT: t`Submit for review`,
    APPROVE: t`Approve release`,
    REQUEST_CHANGES: t`Request changes`,
    RECORD_DEPLOYMENT: t`Record successful deployment`,
    RECORD_DEPLOYMENT_FAILED: t`Record failed deployment`,
    RECORD_HANDOVER: t`Record client handover`,
    RECORD_ACCEPTANCE: t`Record client acceptance`,
  };
  const recorded: Record<string, string> = {
    SAVE: t`Plan saved`,
    SUBMIT: t`Submitted for review`,
    APPROVE: t`Release approved`,
    REQUEST_CHANGES: t`Changes requested`,
    RECORD_DEPLOYMENT: t`Successful deployment recorded`,
    RECORD_DEPLOYMENT_FAILED: t`Failed deployment recorded`,
    RECORD_HANDOVER: t`Client handover recorded`,
    RECORD_ACCEPTANCE: t`Client acceptance recorded`,
  };
  return {
    state: (value: string) => states[value] ?? t`Status unavailable`,
    check: (value: string) => checks[value] ?? t`Other check`,
    checkState: (value: string) => checkStates[value] ?? t`Status unavailable`,
    action: (value: string) => actions[value] ?? t`Record release action`,
    recorded: (value: string) => recorded[value] ?? t`Release action recorded`,
  };
};
