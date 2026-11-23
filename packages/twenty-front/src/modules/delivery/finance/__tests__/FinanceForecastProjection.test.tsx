import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FinanceForecastProjectionSummary,
  FinanceForecastTimeline,
} from '@/delivery/finance/FinanceForecastProjection';
import { type FinanceForecastProjection } from '@/delivery/finance/finance-forecast.types';

jest.mock('@/delivery/deliveryStyles', () => ({ StyledDeliveryStack: 'div' }));
const projectionFixture = (): FinanceForecastProjection => ({
  actualInflowMicros: '400000000',
  actualOutflowMicros: '0',
  currentCashMicros: '1400000000',
  expectedInflowMicros: '600000000',
  expectedOutflowMicros: '1000000000',
  endingCashMicros: '1000000000',
  firstNegativeDate: null,
  timeline: [
    {
      date: '2026-10-28',
      inflowMicros: '600000000',
      outflowMicros: '1000000000',
      closingMicros: '1000000000',
      itemIds: [],
    },
  ],
});
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

it('labels current recorded cash separately from the remaining collection and outgoing expectations', () => {
  render(
    <I18nProvider i18n={i18n}>
      <FinanceForecastProjectionSummary
        projection={projectionFixture()}
        currency="USD"
        incomplete={false}
      />
    </I18nProvider>,
  );
  const summary = screen.getByRole('region', {
    name: 'Reviewed cash scenario',
  });
  expect(
    within(summary).getByText('Recorded cash today').nextElementSibling,
  ).toHaveTextContent('$1,400.00');
  expect(
    within(summary).getByText('Expected collections').nextElementSibling,
  ).toHaveTextContent('$600.00');
  expect(
    within(summary).getByText('Expected payments').nextElementSibling,
  ).toHaveTextContent('$1,000.00');
  expect(
    within(summary).getByText('Projected closing cash').nextElementSibling,
  ).toHaveTextContent('$1,000.00');
  expect(screen.getByText('None in the reviewed dated items')).toBeVisible();
  expect(screen.queryByText('Incomplete information')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('announces a projected cash shortfall with its first negative date', () => {
  render(
    <I18nProvider i18n={i18n}>
      <FinanceForecastProjectionSummary
        projection={{
          ...projectionFixture(),
          firstNegativeDate: '2026-10-29',
        }}
        currency="USD"
        incomplete={false}
      />
    </I18nProvider>,
  );
  const shortfall = screen.getByRole('status');
  expect(shortfall).toHaveTextContent('First negative daily close');
  expect(shortfall).toHaveTextContent('2026-10-29');
});

it('qualifies a numeric ending balance when unresolved information makes the scenario incomplete', () => {
  render(
    <I18nProvider i18n={i18n}>
      <FinanceForecastProjectionSummary
        projection={projectionFixture()}
        currency="USD"
        incomplete
      />
    </I18nProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Incomplete information',
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Resolve the exceptions before relying on this scenario.',
  );
  expect(
    screen.getByText('Projected closing cash').nextElementSibling,
  ).toHaveTextContent('$1,000.00');
  expect(screen.queryByText(/guaranteed runway/i)).not.toBeInTheDocument();
});

it.each([null, undefined])(
  'keeps an omitted or null projection amount %s unconfirmed instead of displaying zero',
  (amount) => {
    const projection = {
      ...projectionFixture(),
      currentCashMicros: amount,
      expectedInflowMicros: amount,
      expectedOutflowMicros: amount,
      endingCashMicros: amount,
      firstNegativeDate: undefined,
    };
    render(
      <I18nProvider i18n={i18n}>
        <FinanceForecastProjectionSummary
          projection={projection}
          currency="USD"
          incomplete
        />
      </I18nProvider>,
    );
    for (const label of [
      'Recorded cash today',
      'Expected collections',
      'Expected payments',
      'Projected closing cash',
      'First negative daily close',
    ])
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent(
        'Not confirmed',
      );
    expect(
      screen.queryByText('None in the reviewed dated items'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  },
);

it('keeps exact negative and sub-cent daily closes and explains daily net timing', async () => {
  const projection = {
    ...projectionFixture(),
    firstNegativeDate: '2026-10-28',
    endingCashMicros: '-9007199254740993',
    timeline: [
      {
        date: '2026-10-28',
        inflowMicros: '0',
        outflowMicros: '1',
        closingMicros: '-1',
        itemIds: [],
      },
    ],
  };
  render(
    <I18nProvider i18n={i18n}>
      <FinanceForecastProjectionSummary
        projection={projection}
        currency="USD"
        incomplete
      />
      <FinanceForecastTimeline
        projection={projection}
        currency="USD"
        incomplete
      />
    </I18nProvider>,
  );
  expect(
    screen.getByText('Projected closing cash').nextElementSibling,
  ).toHaveTextContent('-$9,007,199,254.740993');
  expect(
    screen.getByText(/They do not show the order of payments within a day/),
  ).toBeVisible();
  await userEvent.click(screen.getByText('Daily closing scenario (1 days)'));
  const day = screen.getByRole('listitem', {
    name: 'Closing scenario for 2026-10-28',
  });
  expect(within(day).getByText('Collections: $0.00')).toBeVisible();
  expect(within(day).getByText('Payments: $0.000001')).toBeVisible();
  expect(within(day).getByText('Closing cash: -$0.000001')).toBeVisible();
  expect(
    screen.getByText(
      'Only eligible dated expectations are included. Review the unresolved items above.',
    ),
  ).toBeVisible();
});
