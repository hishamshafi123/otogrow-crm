import { useLingui } from '@lingui/react/macro';

export const useContentLabels = () => {
  const { t } = useLingui();
  const states: Record<string, string> = {
    DRAFT: t`Draft post`,
    REVIEW: t`Post awaiting review`,
    APPROVED: t`Approved for manual posting`,
    CHANGES_REQUESTED: t`Post changes requested`,
    PUBLISHED: t`Publication recorded manually`,
    CANCELLED: t`Cancelled — not posted by the OS`,
  };
  const actions: Record<string, string> = {
    account: t`Add social account`,
    'edit-account': t`Edit account metadata`,
    plan: t`Create content plan`,
    'edit-plan': t`Edit content plan`,
    variant: t`Prepare post variant`,
    'edit-variant': t`Revise posting package`,
    SUBMIT: t`Submit this post for review`,
    APPROVE: t`Approve this post`,
    REQUEST_CHANGES: t`Request post changes`,
    RECORD_PUBLICATION: t`Record publication evidence`,
    RECORD_FAILED: t`Record failed manual posting`,
    RECORD_UNCERTAIN: t`Record uncertain publication`,
    CORRECT_PUBLICATION: t`Correct publication evidence`,
    CANCEL: t`Cancel this planned post`,
    SAVE_ACCOUNT: t`Account metadata saved`,
    SAVE_PLAN: t`Content plan saved`,
    SAVE: t`Posting package saved`,
  };
  const platforms: Record<string, string> = {
    X: 'X',
    INSTAGRAM: 'Instagram',
    FACEBOOK: 'Facebook',
    TIKTOK: 'TikTok',
  };
  const formats: Record<string, string> = {
    TEXT: t`Text`,
    IMAGE: t`Image`,
    VIDEO: t`Video`,
  };
  return {
    status: (value: string) => states[value] ?? t`Status unavailable`,
    action: (value: string) => actions[value] ?? t`Saved content action`,
    platform: (value: string) => platforms[value] ?? t`Channel unavailable`,
    format: (value: string) => formats[value] ?? t`Format unavailable`,
  };
};
