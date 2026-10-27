import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinanceQuery } from '~/generated-metadata/graphql';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { useFinanceAiCostLabels } from '@/delivery/finance/useFinanceAiCostLabels';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type FinanceAiCostOriginProps = {
  origin: NonNullable<
    DeliveryFinanceQuery['deliveryFinance']['entries'][number]['sourceAiSpend']
  >;
};

export const FinanceAiCostOrigin = ({ origin }: FinanceAiCostOriginProps) => {
  const { t } = useLingui();
  const labels = useFinanceAiCostLabels();
  return (
    <section aria-label={t`Saved AI-cost source`}>
      <StyledDeliveryStack>
        <h4>
          <Trans>Saved AI-cost source</Trans>
        </h4>
        <p>
          {origin.modelId} · {labels.sourceKind(origin.sourceKind)}
        </p>
        <p>
          {labels.basis(origin.basis)} ·{' '}
          {new Date(origin.recordedAt).toLocaleString()}
        </p>
        <p>
          {t`Recorded amount`}:{' '}
          {formatFinanceAmountMicros(origin.amountMicros, origin.currency)}
        </p>
        <p>{origin.projectName ?? t`Company / unassigned source`}</p>
        <p>
          <Trans>
            This is an internal ledger charge, not a verified provider invoice
            or a record of payment.
          </Trans>
        </p>
        {origin.basis === 'MANUAL_EVIDENCE' && (
          <p>
            <Trans>
              An administrator recorded this amount. Private supporting budget
              evidence is excluded from this finance view.
            </Trans>
          </p>
        )}
        {origin.correctionReason && (
          <p>
            {t`Correction reason`}: {origin.correctionReason}
          </p>
        )}
        <Link
          to={`/delivery?view=finance&financeView=ai-costs&financeAiSpend=${encodeURIComponent(origin.spendId)}&financeAiFilter=ALL`}
        >
          <Trans>Review AI charge and recognition</Trans>
        </Link>
        <small>
          {t`Financial event reference`}: {origin.evidenceEventId}
        </small>
      </StyledDeliveryStack>
    </section>
  );
};
