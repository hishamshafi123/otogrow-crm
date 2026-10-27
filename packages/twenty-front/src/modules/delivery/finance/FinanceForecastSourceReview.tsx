import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import {
  type DeliveryFinanceForecastSourcesQuery,
  type DeliveryFinanceForecastItemInput,
} from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  type FinanceForecastItem,
  type FinanceForecastSnapshot,
  type FinanceForecastSource,
} from '@/delivery/finance/finance-forecast.types';
import { GET_DELIVERY_FINANCE_FORECAST_SOURCES } from '@/delivery/finance/delivery-finance-forecast.graphql';
import { FinanceForecastItemForm } from '@/delivery/finance/FinanceForecastItemForm';
import { useFinanceForecastLabels } from '@/delivery/finance/useFinanceForecastLabels';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceForecastSourceReviewProps = {
  item: FinanceForecastItem;
  owners: FinanceForecastSnapshot['owners'];
  busy: boolean;
  readOnly: boolean;
  onSave: (input: DeliveryFinanceForecastItemInput) => Promise<boolean>;
  onCancel: () => void;
  refreshItem: () => Promise<unknown>;
};
const StyledPlanBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const FinanceForecastSourceReview = ({
  item,
  owners,
  busy,
  readOnly,
  onSave,
  onCancel,
  refreshItem,
}: FinanceForecastSourceReviewProps) => {
  const { t } = useLingui();
  const labels = useFinanceForecastLabels();
  const financeLabels = useFinanceLabels();
  const permission = useWorkflowAccess();
  const { requestAction } = useDeliveryDraftGuard();
  const plan = item.sourceType === 'PLAN';
  const kind = plan ? 'PLAN' : 'RECEIVABLE';
  const query = useQuery<DeliveryFinanceForecastSourcesQuery>(
    GET_DELIVERY_FINANCE_FORECAST_SOURCES,
    {
      variables: {
        input: {
          currency: item.currency,
          kind,
          month: plan ? item.planMonth : null,
          selectedId: item.sourceId,
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !permission.ready || !permission.canReadFinance,
    },
  );
  const candidate = query.data?.deliveryFinanceForecastSources;
  const selectedSource = candidate?.selectedSource;
  const source =
    isDefined(selectedSource) && selectedSource.id === item.sourceId
      ? selectedSource
      : candidate?.sources.find((entry) => entry.id === item.sourceId);
  const sourceMatches =
    isDefined(source) &&
    isDefined(item.sourceId) &&
    source.id === item.sourceId &&
    (!plan ||
      (isDefined(item.planMonth) && source.planMonth === item.planMonth));
  const available =
    permission.ready &&
    permission.canReadFinance &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.currency === item.currency &&
    candidate.kind === kind &&
    sourceMatches;
  const unavailable =
    !query.loading &&
    !query.error &&
    permission.ready &&
    permission.canReadFinance &&
    permission.matches(candidate) &&
    candidate?.currency === item.currency &&
    candidate.kind === kind &&
    !sourceMatches;
  const [lastVerified, setLastVerified] =
    useState<FinanceForecastSource | null>(null);
  if (available && source !== lastVerified) setLastVerified(source);
  const data = available ? source : lastVerified;
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const reload = async () => {
    try {
      await refreshItem();
      const refreshed = (await query.refetch()).data
        ?.deliveryFinanceForecastSources;
      const current =
        refreshed?.selectedSource ??
        refreshed?.sources.find((entry) => entry.id === item.sourceId);
      if (
        !isDefined(refreshed) ||
        !permission.matches(refreshed) ||
        refreshed.currency !== item.currency ||
        refreshed.kind !== kind ||
        !isDefined(current) ||
        current.id !== item.sourceId ||
        (plan && current.planMonth !== item.planMonth)
      )
        throw new Error();
      setVersion((value) => value + 1);
    } catch {
      setError(
        t`The current source could not be checked. Your reviewed amount, date and notes are kept.`,
      );
    }
  };
  return (
    <StyledDeliveryStack>
      {!available && (
        <p role={query.error || unavailable ? 'alert' : 'status'}>
          {query.error
            ? t`The current source could not be checked. Saved source details are hidden and your draft is kept.`
            : unavailable
              ? plan
                ? t`The current plan is unavailable for this currency and month. Review the original plan or cancel this expectation.`
                : t`The current invoice is unavailable. Review the original record or cancel this expectation.`
              : t`Checking the current financial source before review…`}{' '}
          <StyledDeliveryButton
            type="button"
            disabled={busy || query.loading}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh current source</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      {!available && (
        <StyledDeliveryButton
          type="button"
          disabled={busy}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel source review</Trans>
        </StyledDeliveryButton>
      )}
      {error && <p role="alert">{error}</p>}
      <StyledPlanBoundary
        hidden={!available}
        disabled={!available || busy || query.loading}
      >
        {data && (
          <StyledDeliveryStack>
            <h4>{plan ? t`Current plan terms` : t`Current invoice balance`}</h4>
            <p>
              {data.title}
              {plan
                ? ` · ${financeLabels.planTypes[data.category] ?? t`Cost plan`} · ${data.planMonth}`
                : ''}
            </p>
            <p>
              {plan ? t`Current plan amount` : t`Original invoice amount`}:{' '}
              {!isDefined(data.amountMicros)
                ? t`Not confirmed`
                : formatFinanceAmountMicros(
                    data.amountMicros,
                    data.currency,
                  )}{' '}
              ·{' '}
              {plan
                ? t`Suggested payment date`
                : t`Current outstanding balance`}
              :{' '}
              {plan
                ? (data.suggestedDate ?? t`Not scheduled`)
                : !isDefined(data.remainingMicros)
                  ? t`Not confirmed`
                  : formatFinanceAmountMicros(
                      data.remainingMicros,
                      data.currency,
                    )}
            </p>
            {data.warnings.map((warning) => (
              <p key={warning}>{labels.warning(warning)}</p>
            ))}
            {plan && (
              <small>
                <Trans>
                  The plan is guidance. Your reviewed payment amount and date
                  stay as entered until you change them.
                </Trans>
              </small>
            )}
            <FinanceForecastItemForm
              key={version}
              initial={item}
              source={data}
              owners={owners}
              currency={item.currency}
              busy={busy}
              readOnly={readOnly || !available || candidate?.canManage !== true}
              onSave={onSave}
              onCancel={onCancel}
              onReload={() => void reload()}
            />
          </StyledDeliveryStack>
        )}
      </StyledPlanBoundary>
    </StyledDeliveryStack>
  );
};
