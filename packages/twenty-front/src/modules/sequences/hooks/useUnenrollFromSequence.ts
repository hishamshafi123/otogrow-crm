import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useMutation } from '@apollo/client/react';
import { t } from '@lingui/core/macro';

import { UNENROLL_FROM_SEQUENCE } from '@/sequences/graphql/mutations/unenrollFromSequence';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import {
  type UnenrollFromSequenceMutation,
  type UnenrollFromSequenceMutationVariables,
} from '~/generated-metadata/graphql';

export const useUnenrollFromSequence = () => {
  const [unenrollFromSequenceMutation, { loading }] = useMutation<
    UnenrollFromSequenceMutation,
    UnenrollFromSequenceMutationVariables
  >(UNENROLL_FROM_SEQUENCE);

  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const unenrollFromSequence = async (
    enrollmentIds: string[],
  ): Promise<boolean> => {
    try {
      await unenrollFromSequenceMutation({
        variables: { input: { enrollmentIds } },
      });

      enqueueSuccessSnackBar({ message: t`Unenrolled from the sequence` });

      return true;
    } catch (error) {
      enqueueErrorSnackBar({
        ...(CombinedGraphQLErrors.is(error) ? { apolloError: error } : {}),
      });

      return false;
    }
  };

  return { unenrollFromSequence, loading };
};
