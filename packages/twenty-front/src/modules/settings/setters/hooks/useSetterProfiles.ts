import { useState } from 'react';

import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import { UPSERT_SETTER_PROFILE } from '@/settings/setters/graphql/mutations/upsertSetterProfile';
import { GET_SETTER_PROFILES } from '@/settings/setters/graphql/queries/getSetterProfiles';
import { type SetterProfile } from '@/settings/setters/types/setters.types';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useMutation, useQuery } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';

export type SetterProfileDraft = {
  isSetter: boolean;
  activeDays: string;
  activeStartHour: string;
  activeEndHour: string;
  dailyLeadCap: string;
};

export const toSetterProfileDraft = (
  profile: SetterProfile,
): SetterProfileDraft => ({
  isSetter: profile.isSetter,
  activeDays: profile.activeDays,
  activeStartHour: String(profile.activeStartHour),
  activeEndHour: String(profile.activeEndHour),
  dailyLeadCap:
    profile.dailyLeadCap === null ? '' : String(profile.dailyLeadCap),
});

export const useSetterProfiles = () => {
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);

  const { loading, error, data } = useQuery<{
    setterProfiles: SetterProfile[];
  }>(GET_SETTER_PROFILES);

  useSnackBarOnQueryError(error, t`Failed to load setters`);

  const [upsertSetterProfile] = useMutation<{
    upsertSetterProfile: SetterProfile;
  }>(UPSERT_SETTER_PROFILE);

  const saveSetterProfile = async (
    workspaceMemberId: string,
    draft: SetterProfileDraft,
  ) => {
    const activeStartHour = Number(draft.activeStartHour);
    const activeEndHour = Number(draft.activeEndHour);
    const dailyLeadCap =
      draft.dailyLeadCap.trim() === '' ? null : Number(draft.dailyLeadCap);

    if (
      !Number.isInteger(activeStartHour) ||
      !Number.isInteger(activeEndHour) ||
      activeStartHour < 0 ||
      activeStartHour > 23 ||
      activeEndHour < 0 ||
      activeEndHour > 24
    ) {
      enqueueErrorSnackBar({
        message: t`Start hour must be between 0 and 23; end hour may be 24 for midnight`,
      });
      return;
    }

    if (
      dailyLeadCap !== null &&
      (!Number.isInteger(dailyLeadCap) || dailyLeadCap < 1)
    ) {
      enqueueErrorSnackBar({
        message: t`Daily cap must be a positive whole number, or empty for no cap`,
      });
      return;
    }

    setSavingMemberId(workspaceMemberId);

    try {
      await upsertSetterProfile({
        variables: {
          input: {
            workspaceMemberId,
            isSetter: draft.isSetter,
            activeDays: draft.activeDays,
            activeStartHour,
            activeEndHour,
            dailyLeadCap,
          },
        },
        refetchQueries: [GET_SETTER_PROFILES],
        awaitRefetchQueries: true,
      });

      enqueueSuccessSnackBar({ message: t`Setter saved` });
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    } finally {
      setSavingMemberId(null);
    }
  };

  return {
    loading,
    error,
    setterProfiles: data?.setterProfiles ?? [],
    savingMemberId,
    saveSetterProfile,
  };
};
