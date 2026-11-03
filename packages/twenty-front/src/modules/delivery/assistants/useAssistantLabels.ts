import { useLingui } from '@lingui/react/macro';

export const useAssistantLabels = () => {
  const { t } = useLingui();
  const statuses: Record<string, string> = {
    QUEUED: t`Queued`,
    RUNNING: t`Running`,
    WAITING_REVIEW: t`Needs human review`,
    SUCCEEDED: t`Reviewed`,
    FAILED: t`Failed`,
    CANCELLED: t`Cancelled`,
  };
  const kinds: Record<string, string> = {
    BRIEF: t`Brief checker`,
    COPY: t`Copy and submission checker`,
    SEO: t`SEO evidence verifier`,
    ADVERTISING: t`Advertising recommendations`,
    ACTIVITY: t`Team activity analysis`,
  };
  const blocked: Record<string, string> = {
    CURRENT_AGENT_OR_KNOWLEDGE_UNAVAILABLE: t`Current assistant access or published brand knowledge no longer matches this run. Review the current setup and prepare a fresh preview before applying edits. The original findings remain available.`,
    TASK_CHANGED_OR_SUBMITTED: t`This task changed or was submitted after the run. Review the current task before preparing another check; these proposed edits cannot be applied to it.`,
  };
  return {
    status: (value: string) => statuses[value] ?? t`Status unavailable`,
    kind: (value: string) => kinds[value] ?? t`Workflow unavailable`,
    blocked: (value: string) =>
      blocked[value] ??
      t`This run cannot currently apply edits. Review the current task and assistant access; the original findings remain available.`,
    time: (value: string | null | undefined) =>
      value != null && value !== '' && Number.isFinite(Date.parse(value))
        ? `${new Date(value).toLocaleString(undefined, { timeZone: 'UTC' })} UTC`
        : t`Time unavailable`,
  };
};
