import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type useFinanceRecognitionAvailability } from '@/delivery/finance/useFinanceRecognitionAvailability';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceRecognitionNoticeProps = {
  availability: ReturnType<typeof useFinanceRecognitionAvailability>;
};

export const FinanceRecognitionNotice = ({
  availability,
}: FinanceRecognitionNoticeProps) => {
  const { t } = useLingui();
  if (!availability.monthValid) return null;
  if (!availability.available)
    return (
      <p role={availability.error ? 'alert' : 'status'}>
        <Trans>
          The month’s result status must be checked before saving. Your draft is
          kept.
        </Trans>{' '}
        <StyledDeliveryButton
          type="button"
          onClick={() => void availability.refetch().catch(() => undefined)}
        >
          <Trans>Check month status</Trans>
        </StyledDeliveryButton>
      </p>
    );
  if (!availability.lockedMonths.length) return null;
  return (
    <StyledDeliveryStack role="status">
      <p>
        <Trans>
          Monthly results are locked. Reopen every affected month before
          changing recognized entries. Actual payments and matching remain
          available.
        </Trans>
      </p>
      {availability.lockedMonths.map((month) => (
        <Link
          key={month}
          to={`/delivery?view=finance&financeView=monthly&financeMonth=${month}`}
        >
          {t`Review reopening ${month}`}
        </Link>
      ))}
    </StyledDeliveryStack>
  );
};
