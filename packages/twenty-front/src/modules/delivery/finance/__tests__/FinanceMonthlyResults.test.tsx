import { type ComponentProps } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import { FinanceMonthlyResults } from '@/delivery/finance/FinanceMonthlyResults';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCard: 'section',
  StyledDeliveryGrid: 'div',
  StyledDeliveryStack: 'div',
}));

type Summary = ComponentProps<
  typeof FinanceMonthlyResults
>['summaries'][number];

const summary = (overrides: Partial<Summary> = {}): Summary => ({
  currency: 'USD',
  revenueMicros: '100000000',
  costMicros: '25000000',
  resultMicros: '75000000',
  draftCount: 1,
  postedCount: 3,
  voidCount: 0,
  unassignedRevenueMicros: '0',
  unassignedCostMicros: '5000000',
  projects: [
    {
      projectId: 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689',
      projectName: 'Client Alpha',
      revenueMicros: '100000000',
      costMicros: '20000000',
      resultMicros: '80000000',
    },
    {
      projectId: null,
      projectName: null,
      revenueMicros: '0',
      costMicros: '5000000',
      resultMicros: '-5000000',
    },
  ],
  ...overrides,
});

const setup = (summaries: Summary[]) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <FinanceMonthlyResults summaries={summaries} />
    </I18nProvider>,
  );
};

describe('FinanceMonthlyResults recorded margins', () => {
  it('keeps company and client margins separate within each currency', () => {
    setup([
      summary(),
      summary({
        currency: 'EUR',
        revenueMicros: '200000000',
        costMicros: '250000000',
        resultMicros: '-50000000',
        unassignedCostMicros: '0',
        projects: [],
      }),
    ]);
    const dollarCard = screen
      .getByRole('heading', { name: 'USD · Recorded monthly result' })
      .closest<HTMLElement>('section');
    const euroCard = screen
      .getByRole('heading', { name: 'EUR · Recorded monthly result' })
      .closest<HTMLElement>('section');
    if (!dollarCard || !euroCard)
      throw new Error('Currency results are required.');
    expect(within(dollarCard).getByText('75.00%')).toBeVisible();
    expect(
      within(dollarCard).getByText(/Recorded margin: 80\.00%/),
    ).toBeVisible();
    expect(
      within(dollarCard).getByText(/Recorded margin: Unavailable/),
    ).toBeVisible();
    expect(within(euroCard).getByText('-25.00%')).toBeVisible();
    expect(within(euroCard).queryByText('75.00%')).not.toBeInTheDocument();
    expect(within(dollarCard).getByRole('status')).toHaveTextContent(
      'Client figures exclude these shared amounts and are not fully allocated profit.',
    );
  });

  it('shows unavailable for zero revenue rather than a zero or infinite margin', () => {
    setup([
      summary({
        revenueMicros: '0',
        costMicros: '1000000',
        resultMicros: '-1000000',
        projects: [],
      }),
    ]);
    expect(screen.getByText('Unavailable')).toBeVisible();
    expect(screen.queryByText(/NaN|Infinity|0\.00%/)).not.toBeInTheDocument();
  });

  it('keeps the rounding basis and incomplete recorded-cost limits visible', () => {
    setup([summary()]);
    expect(
      screen.getByText(
        /Recorded margin is recorded result divided by recorded revenue/,
      ),
    ).toHaveTextContent('rounded to two decimal places');
    expect(
      screen.getByText(/Results include posted monthly entries only/),
    ).toHaveTextContent(
      'Review those sources before treating this as complete profitability.',
    );
    expect(screen.getByText('3 posted · 1 draft · 0 voided')).toBeVisible();
  });
});
