import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useMutation } from '@apollo/client/react';
import { t } from '@lingui/core/macro';

import { ENROLL_IN_SEQUENCE } from '@/sequences/graphql/mutations/enrollInSequence';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import {
  type EnrollInSequenceMutation,
  type EnrollInSequenceMutationVariables,
} from '~/generated-metadata/graphql';

type EnrollInSequenceParams = {
  sequenceId: string;
  personIds: string[];
};

export const useEnrollInSequence = () => {
  const [enrollInSequenceMutation, { loading }] = useMutation<
    EnrollInSequenceMutation,
    EnrollInSequenceMutationVariables
  >(ENROLL_IN_SEQUENCE);

  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const enrollInSequence = async ({
    sequenceId,
    personIds,
  }: EnrollInSequenceParams): Promise<boolean> => {
    try {
      const result = await enrollInSequenceMutation({
        variables: { input: { sequenceId, personIds } },
      });

      const enrolledCount = result.data?.enrollInSequence.enrolledCount ?? 0;

      if (enrolledCount === 0) {
        enqueueErrorSnackBar({ message: t`No one was enrolled` });

        return false;
      }

      enqueueSuccessSnackBar({
        message: t`Enrolled ${enrolledCount} person(s) in the sequence`,
      });

      return true;
    } catch (error) {
      enqueueErrorSnackBar({
        ...(CombinedGraphQLErrors.is(error) ? { apolloError: error } : {}),
      });

      return false;
    }
  };

  return { enrollInSequence, loading };
};
