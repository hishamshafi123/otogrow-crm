import {
  StyledFinanceDesktopNavigation,
  StyledFinanceMobileNavigation,
} from '@/delivery/finance/financeStyles';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { DeliveryBusiness } from '@/delivery/DeliveryBusiness';
import { DeliveryMonthlyFinance } from '@/delivery/finance/DeliveryMonthlyFinance';
import { DeliveryReconciliation } from '@/delivery/finance/DeliveryReconciliation';
import { DeliveryFinanceAiCosts } from '@/delivery/finance/DeliveryFinanceAiCosts';
import { DeliveryFinanceForecast } from '@/delivery/finance/DeliveryFinanceForecast';
import { DeliveryFinanceExports } from '@/delivery/finance/export/DeliveryFinanceExports';
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
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get('financeView');
  const views = [
    { value: 'cash', label: t`Cash records` },
    { value: 'forecast', label: t`Cash forecast` },
    { value: 'payments', label: t`Payments and matching` },
    { value: 'monthly', label: t`Monthly results` },
    { value: 'plans', label: t`Monthly cost plans` },
    { value: 'ai-costs', label: t`AI costs` },
    { value: 'exports', label: t`Accounting exports` },
  ] as const;
  const view =
    views.find((option) => option.value === requested)?.value ?? 'cash';
  const destination = (nextView: string) => {
    const next = new URLSearchParams(params);
    next.set('view', 'finance');
    if (nextView === 'cash') next.delete('financeView');
    else next.set('financeView', nextView);
    return `/delivery?${next.toString()}`;
  };
  return (
    <StyledDeliveryStack>
      <StyledFinanceDesktopNavigation aria-label={t`Finance views`}>
        {views.map((option) => (
          <Link
            key={option.value}
            to={destination(option.value)}
            aria-current={view === option.value ? 'page' : undefined}
          >
            {option.label}
          </Link>
        ))}
      </StyledFinanceDesktopNavigation>
      <StyledFinanceMobileNavigation>
        {t`Finance view`}
        <select
          aria-label={t`Finance view`}
          value={view}
          onChange={(event) => {
            const selected = views.find(
              (option) => option.value === event.currentTarget.value,
            );
            if (selected && selected.value !== view)
              navigate(destination(selected.value));
          }}
        >
          {views.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </StyledFinanceMobileNavigation>
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
      ) : view === 'exports' ? (
        <DeliveryFinanceExports key={params.toString()} onChanged={onChanged} />
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
