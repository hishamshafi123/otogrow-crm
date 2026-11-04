import { useLingui } from '@lingui/react/macro';

export const useCompetitorLabels = () => {
  const { t } = useLingui();
  const platforms: Record<string, string> = {
    X: t`X`,
    INSTAGRAM: t`Instagram`,
    META_AD_LIBRARY: t`Meta Ad Library`,
    MANUAL: t`Manual source`,
  };
  const statuses: Record<string, string> = {
    ACTIVE: t`Saved source (collection OFF)`,
    PAUSED: t`Paused`,
    ARCHIVED: t`Archived`,
  };
  const actions: Record<string, string> = {
    SAVE: t`Save source`,
    PAUSE: t`Pause source`,
    RESTORE: t`Restore source`,
    ARCHIVE: t`Archive source`,
  };
  const recorded: Record<string, string> = {
    SAVE: t`Source saved`,
    PAUSE: t`Source paused`,
    RESTORE: t`Source restored`,
    ARCHIVE: t`Source archived`,
  };
  return {
    platform: (platform: string) =>
      platforms[platform] ?? t`Platform unavailable`,
    status: (status: string) => statuses[status] ?? t`Status unavailable`,
    action: (action: string) => actions[action] ?? t`Record source change`,
    recorded: (action: string) => recorded[action] ?? t`Source change recorded`,
  };
};
