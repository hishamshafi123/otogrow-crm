import { Trans, useLingui } from '@lingui/react/macro';
import { type FinanceReceivableBalance } from '@/delivery/delivery-business.types';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { useReconciliationLabels } from '@/delivery/finance/useReconciliationLabels';

type DeliveryReceivableBalanceProps = {
  balance: FinanceReceivableBalance | undefined;
  currency: string;
};
export const DeliveryReceivableBalance = ({
  balance,
  currency,
}: DeliveryReceivableBalanceProps) => {
  const { t } = useLingui();
  const labels = useReconciliationLabels();
  if (!balance)
    return (
      <p role="status">
        <Trans>
          This receivable’s payment balance is unavailable. Review its cash
          source before treating it as paid or unpaid.
        </Trans>
      </p>
    );
  return (
    <>
      <p>
        {t`Payments applied`}:{' '}
        {formatFinanceAmountMicros(balance.settledMicros, currency)} ·{' '}
        {t`Outstanding`}:{' '}
        {formatFinanceAmountMicros(balance.outstandingMicros, currency)}
      </p>
      {balance.sourceWarnings.map((warning) => (
        <p key={warning} role="status">
          {labels.warning(warning)}
        </p>
      ))}
    </>
  );
};
