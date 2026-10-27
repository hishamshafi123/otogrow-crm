import { StyledFinanceNavigation } from '@/delivery/finance/financeStyles';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { DeliveryBusiness } from '@/delivery/DeliveryBusiness';
import { DeliveryMonthlyFinance } from '@/delivery/finance/DeliveryMonthlyFinance';
import { DeliveryReconciliation } from '@/delivery/finance/DeliveryReconciliation';
import { DeliveryFinanceAiCosts } from '@/delivery/finance/DeliveryFinanceAiCosts';
import { DeliveryFinanceForecast } from '@/delivery/finance/DeliveryFinanceForecast';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type DeliveryFinanceProps = {
  workspace: DeliveryWorkspace;
  onChanged: () => Promise<unknown>;
  onOpenTask: (id: string) => void;
};
export const DeliveryFinance = ({
  workspace,
  onChanged,
  onOpenTask,
}: DeliveryFinanceProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const requested = params.get('financeView');
  const view =
    requested === 'monthly' ||
    requested === 'plans' ||
    requested === 'payments' ||
    requested === 'ai-costs' ||
    requested === 'forecast'
      ? requested
      : 'cash';
  const destination = (nextView: string) => {
    const next = new URLSearchParams(params);
    next.set('view', 'finance');
    if (nextView === 'cash') next.delete('financeView');
    else next.set('financeView', nextView);
    return `/delivery?${next.toString()}`;
  };
  return (
    <StyledDeliveryStack>
      <StyledFinanceNavigation aria-label={t`Finance views`}>
        <Link
          to={destination('cash')}
          aria-current={view === 'cash' ? 'page' : undefined}
        >
          <Trans>Cash records</Trans>
        </Link>
        <Link
          to={destination('forecast')}
          aria-current={view === 'forecast' ? 'page' : undefined}
        >
          <Trans>Cash forecast</Trans>
        </Link>
        <Link
          to={destination('payments')}
          aria-current={view === 'payments' ? 'page' : undefined}
        >
          <Trans>Payments and matching</Trans>
        </Link>
        <Link
          to={destination('monthly')}
          aria-current={view === 'monthly' ? 'page' : undefined}
        >
          <Trans>Monthly results</Trans>
        </Link>
        <Link
          to={destination('plans')}
          aria-current={view === 'plans' ? 'page' : undefined}
        >
          <Trans>Monthly cost plans</Trans>
        </Link>
        <Link
          to={destination('ai-costs')}
          aria-current={view === 'ai-costs' ? 'page' : undefined}
        >
          <Trans>AI costs</Trans>
        </Link>
      </StyledFinanceNavigation>
      {view === 'cash' ? (
        <DeliveryBusiness
          workspace={workspace}
          view="finance"
          onChanged={onChanged}
          onOpenTask={onOpenTask}
        />
      ) : view === 'forecast' ? (
        <DeliveryFinanceForecast
          key={params.toString()}
          onChanged={onChanged}
        />
      ) : view === 'payments' ? (
        <DeliveryReconciliation key={params.toString()} onChanged={onChanged} />
      ) : view === 'ai-costs' ? (
        <DeliveryFinanceAiCosts key={params.toString()} onChanged={onChanged} />
      ) : (
        <DeliveryMonthlyFinance
          key={params.toString()}
          view={view}
          onChanged={onChanged}
        />
      )}
    </StyledDeliveryStack>
  );
};
