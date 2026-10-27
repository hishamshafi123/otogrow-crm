import { useQuery } from '@apollo/client/react';
import { isDefined } from 'twenty-shared/utils';
import { type DeliveryFinanceRecognitionAvailabilityQuery } from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { GET_DELIVERY_FINANCE_RECOGNITION_AVAILABILITY } from '@/delivery/finance/delivery-finance-period.graphql';

const validMonth = (month: string) =>
  /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month);

export const useFinanceRecognitionAvailability = (
  month: string,
  replacedMonth?: string | null,
) => {
  const permission = useWorkflowAccess();
  const monthValid = validMonth(month);
  const includeReplaced = Boolean(
    replacedMonth && validMonth(replacedMonth) && replacedMonth !== month,
  );
  const query = useQuery<DeliveryFinanceRecognitionAvailabilityQuery>(
    GET_DELIVERY_FINANCE_RECOGNITION_AVAILABILITY,
    {
      variables: {
        input: { month },
        replacedInput: { month: replacedMonth || month },
        includeReplaced,
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !monthValid || !permission.ready || !permission.canReadFinance,
    },
  );
  const primary = query.data?.deliveryFinancePeriod;
  const replacement = query.data?.replacedPeriod;
  const primaryMatches =
    permission.matches(primary) &&
    primary?.period.month === month &&
    ['OPEN', 'LOCKED'].includes(primary.period.status);
  const replacementMatches =
    !includeReplaced ||
    (permission.matches(replacement) &&
      isDefined(replacement) &&
      replacement.period.month === replacedMonth &&
      ['OPEN', 'LOCKED'].includes(replacement.period.status));
  const available =
    monthValid &&
    permission.ready &&
    permission.canReadFinance &&
    !query.error &&
    primaryMatches &&
    replacementMatches;
  return {
    available,
    monthValid,
    canManage:
      available &&
      permission.canManageFinance &&
      primary?.canManage === true &&
      (!includeReplaced || replacement?.canManage === true),
    lockedMonths: available
      ? [
          ...new Set([
            ...(primary?.period.status === 'LOCKED'
              ? [primary.period.month]
              : []),
            ...(includeReplaced && replacement?.period.status === 'LOCKED'
              ? [replacement.period.month]
              : []),
          ]),
        ]
      : [],
    error: Boolean(query.error || permission.error),
    checking: !query.error && (query.loading || !available),
    refetch: query.refetch,
  };
};
