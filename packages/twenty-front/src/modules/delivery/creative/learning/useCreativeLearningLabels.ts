import { useLingui } from '@lingui/react/macro';
export const useCreativeLearningLabels = () => {
  const { t } = useLingui();
  const statuses: Record<string, string> = {
    DRAFT: t`Draft proposal`,
    SUBMITTED: t`Awaiting independent review`,
    CHANGES_REQUESTED: t`Changes requested`,
    REVIEWED: t`Reviewed human association`,
    RETRACTED: t`Retracted association`,
    SAVE: t`Draft saved`,
    SUBMIT: t`Submitted for review`,
    REVIEW: t`Association reviewed`,
    REQUEST_CHANGES: t`Changes requested`,
    RETRACT: t`Association retracted`,
    LESSON: t`Lesson recorded`,
  };
  const warnings: Record<string, string> = {
    LEGACY_SUBMISSION_LEARNING_MISSING: t`This earlier submission has no frozen component or brief learning snapshot.`,
    COMPONENTS_UNKNOWN: t`The rendered hook, base and CTA components are unknown.`,
    COMPONENTS_HUMAN_DECLARED: t`Some component associations are human-declared, not recorded assembly evidence.`,
    HUMAN_ASSOCIATION_NOT_PROVIDER_VERIFIED: t`This human association has not been verified by Meta.`,
    EXACT_REPORT_WINDOW_ONLY: t`The observation applies only to this exact ad and reporting window.`,
    SOURCE_REPORT_REVIEW_REQUIRED: t`The advertising source must be reviewed before confirming this association.`,
    SOURCE_METADATA_CHANGED: t`Source evidence changed. Inspect it again before relying on this proposal.`,
    ASSOCIATION_CORRECTED: t`A correction replaces this association.`,
    HUMAN_LESSON_NOT_CAUSAL_PROOF: t`This is a human interpretation, not proof of a causal effect.`,
    WINDOWS_ARE_NOT_AGGREGATED: t`Evidence windows are shown separately and are not added together.`,
    LESSON_CORRECTED: t`A correction replaces this lesson.`,
  };
  const actions: Record<string, string> = {
    SUBMIT: t`Submit for review`,
    REVIEW: t`Confirm independent review`,
    REQUEST_CHANGES: t`Return for changes`,
    RETRACT: t`Retract association`,
  };
  return {
    state: (value: string) => statuses[value] ?? t`Recorded decision`,
    action: (value: string) => actions[value] ?? t`Confirm decision`,
    warning: (value: string) =>
      warnings[value] ?? t`Additional source limitation: ${value}`,
  };
};
