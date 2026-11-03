import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FounderExceptionRow } from '@/delivery/founder/FounderExceptionRow';
import {
  type FounderAction,
  type FounderException,
} from '@/delivery/founder/founder.types';
import {
  FOUNDER_ENGAGEMENT_ID,
  FOUNDER_PERIOD_ID,
  FOUNDER_TASK_ID,
  founderExceptionFixture,
} from '@/delivery/founder/__tests__/founder.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({ StyledDeliveryStack: 'div' }));
jest.mock('@/delivery/founder/founderStyles', () => ({
  StyledFounderHeading: 'div',
  StyledFounderEvidence: 'dl',
}));
const setup = (item: FounderException) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <FounderExceptionRow item={item} />
      </MemoryRouter>
    </I18nProvider>,
  );
const monetary = (
  amountMicros: string | null,
  currency = 'USD',
): FounderException => {
  const item = founderExceptionFixture();
  return {
    ...item,
    domain: 'FINANCE',
    sourceType: 'FORECAST_SOURCE',
    reasonCode: 'FORECAST_UNSCHEDULED_COLLECTION',
    evidence: { ...item.evidence, currency, amountMicros },
    nextAction: {
      ...item.nextAction,
      code: 'REVIEW_COLLECTION',
      targetType: 'FORECAST',
      targetId: FOUNDER_TASK_ID,
      currency,
      sourceKind: 'RECEIVABLE',
    },
  };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});
describe('founder exception evidence and actions', () => {
  it('keeps a missing task deadline unknown instead of showing the last update as due', () => {
    const item = founderExceptionFixture();
    setup({
      ...item,
      dueAt: null,
      occurredAt: '2026-10-29T10:00:00.000Z',
      evidence: { ...item.evidence, date: null },
    });
    expect(screen.getByText('Date not confirmed')).toBeInTheDocument();
  });
  it('links overdue approved client delivery to its Delivery and reminders panel with the stored reviewer', () => {
    const item = founderExceptionFixture();
    setup({
      ...item,
      reasonCode: 'TASK_DELIVERY_OVERDUE',
      ownerName: 'Stored reviewer',
      evidence: {
        ...item.evidence,
        state: 'APPROVED',
        warnings: ['DELIVERY_REDOING'],
      },
      nextAction: { ...item.nextAction, code: 'REVIEW_DELIVERY' },
    });
    expect(
      screen.getByRole('heading', {
        name: 'Approved work is overdue for client delivery',
      }),
    ).toBeVisible();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Stored reviewer')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Review client delivery' }),
    ).toHaveAttribute(
      'href',
      `/delivery?view=planner&task=${FOUNDER_TASK_ID}&panel=operations`,
    );
    expect(
      screen.getByText(
        'Client delivery is being redone. The current cycle still needs delivery confirmation.',
      ),
    ).toBeInTheDocument();
  });
  it('keeps exact zero distinct from an unconfirmed remaining balance', () => {
    const view = setup(monetary(null));
    expect(screen.getByText('Amount not confirmed')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    view.rerender(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <FounderExceptionRow item={monetary('0')} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.queryByText('Amount not confirmed')).not.toBeInTheDocument();
  });
  it('shows exact large sub-cent evidence without Number rounding or combining currencies', () => {
    setup(monetary('9007199254740993123'));
    expect(screen.getByText('$9,007,199,254,740.993123')).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
  });
  it('shows a recorded monthly loss and incomplete-cost limitation without inventing a margin threshold', () => {
    const item = monetary(null, 'EUR');
    setup({
      ...item,
      sourceType: 'MONTHLY_RESULT',
      reasonCode: 'MONTHLY_NEGATIVE_RESULT',
      evidence: {
        ...item.evidence,
        revenueMicros: '1000000',
        costMicros: '2500000',
        resultMicros: '-1500000',
      },
      nextAction: {
        ...item.nextAction,
        code: 'REVIEW_MONTHLY',
        targetType: 'MONTHLY',
        serviceMonth: '2026-09',
      },
    });
    expect(screen.getByText('€1.00')).toBeInTheDocument();
    expect(screen.getByText('€2.50')).toBeInTheDocument();
    expect(screen.getByText('-€1.50')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Complete costs and company profitability are not verified/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('financeMonth=2026-09'),
    );
  });
  it('preserves commitment quantities, explicit unassigned ownership and its exact engagement/period', () => {
    const item = founderExceptionFixture();
    setup({
      ...item,
      domain: 'COMMITMENTS',
      sourceType: 'COMMITMENT',
      reasonCode: 'COMMITMENT_SHORTFALL',
      dueAt: '2026-10-01',
      ownerId: null,
      ownerName: null,
      ownerState: 'UNASSIGNED',
      evidence: {
        ...item.evidence,
        date: '2026-10-01',
        timezone: 'Asia/Qatar',
        promisedQuantity: 10,
        fulfilledQuantity: 3,
        remainingQuantity: 7,
      },
      nextAction: {
        ...item.nextAction,
        code: 'REVIEW_COMMITMENT',
        targetType: 'COMMITMENT',
        engagementId: FOUNDER_ENGAGEMENT_ID,
        periodId: FOUNDER_PERIOD_ID,
      },
    });
    expect(
      screen.getByText('Unassigned — review ownership in the source'),
    ).toBeInTheDocument();
    const evidence = screen.getByRole('article');
    expect(evidence).toHaveTextContent('Promised10');
    expect(evidence).toHaveTextContent('Currently fulfilled3');
    expect(evidence).toHaveTextContent('Remaining7');
    expect(evidence).toHaveTextContent('2026-10-01 · Asia/Qatar');
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/delivery?view=clients&clientEngagement=${FOUNDER_ENGAGEMENT_ID}&commitmentPeriod=${FOUNDER_PERIOD_ID}`,
    );
  });
  it('keeps a missing project name distinct from company allocation and shows unavailable ownership', () => {
    const item = founderExceptionFixture();
    setup({ ...item, projectName: null, ownerState: 'UNAVAILABLE' });
    expect(screen.getByText('Client project unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Company / unassigned')).not.toBeInTheDocument();
    expect(screen.getByText('Amna — owner unavailable')).toBeInTheDocument();
  });
  it('does not invent a monetary amount for campaign setup coverage', () => {
    const item = founderExceptionFixture();
    setup({
      ...item,
      domain: 'CAMPAIGNS',
      sourceType: 'CAMPAIGN_SETUP',
      reasonCode: 'CAMPAIGN_SETUP',
      evidence: { ...item.evidence, date: null },
      nextAction: {
        ...item.nextAction,
        code: 'REVIEW_SETUP',
        targetType: 'READINESS',
        targetId: null,
      },
    });
    expect(
      screen.queryByText('Amount in this evidence'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Amount not confirmed')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/delivery?view=health#company-readiness',
    );
  });
  it.each([
    [
      { code: 'OPEN_TASK', targetType: 'TASK', targetId: FOUNDER_TASK_ID },
      `/delivery?view=planner&task=${FOUNDER_TASK_ID}`,
    ],
    [
      {
        code: 'REVIEW_SUBMISSION',
        targetType: 'TASK',
        targetId: FOUNDER_TASK_ID,
      },
      `/delivery?view=reviews&task=${FOUNDER_TASK_ID}&panel=task`,
    ],
    [
      {
        code: 'REVIEW_SUBMISSION',
        targetType: 'TASK',
        targetId: FOUNDER_TASK_ID,
        submissionVersion: 2,
      },
      `/delivery?view=reviews&task=${FOUNDER_TASK_ID}&panel=task&creativeSubmission=2`,
    ],
    [
      {
        code: 'REVIEW_CAMPAIGN',
        targetType: 'MANUAL_REPORT',
        targetId: FOUNDER_TASK_ID,
      },
      `/delivery?view=ads&adSource=MANUAL&adReport=${FOUNDER_TASK_ID}`,
    ],
    [
      {
        code: 'REVIEW_CAMPAIGN',
        targetType: 'META_REPORT',
        targetId: FOUNDER_TASK_ID,
      },
      `/delivery?view=ads&adSource=META&adReport=${FOUNDER_TASK_ID}`,
    ],
    [
      {
        code: 'REVIEW_CASH',
        targetType: 'FORECAST',
        targetId: FOUNDER_TASK_ID,
        sourceKind: 'CASH',
        currency: 'USD',
      },
      `/delivery?view=finance&financeCurrency=USD&financeView=payments&financeCash=${FOUNDER_TASK_ID}`,
    ],
    [
      {
        code: 'APPLY_OUTFLOW',
        targetType: 'FORECAST',
        targetId: FOUNDER_TASK_ID,
        sourceKind: 'CASH',
        currency: 'USD',
      },
      `/delivery?view=finance&financeCurrency=USD&financeView=forecast&financeForecastKind=CASH&financeForecastSource=${FOUNDER_TASK_ID}`,
    ],
    [
      {
        code: 'REVIEW_FORECAST',
        targetType: 'FORECAST',
        targetId: FOUNDER_TASK_ID,
        sourceKind: 'ITEM',
        currency: 'USD',
      },
      `/delivery?view=finance&financeCurrency=USD&financeView=forecast&financeForecastItem=${FOUNDER_TASK_ID}`,
    ],
    [
      {
        code: 'REVIEW_FORECAST',
        targetType: 'FORECAST',
        targetId: FOUNDER_TASK_ID,
        sourceKind: 'ANCHOR',
        currency: 'USD',
      },
      '/delivery?view=finance&financeCurrency=USD&financeView=forecast&financeForecastDays=90',
    ],
    [
      {
        code: 'SET_UP_CASH',
        targetType: 'FORECAST',
        targetId: null,
        sourceKind: 'ANCHOR',
        currency: 'USD',
      },
      '/delivery?view=finance&financeCurrency=USD&financeView=forecast',
    ],
  ] as [Partial<FounderAction>, string][])(
    'opens the precise supported action %#',
    (action, href) => {
      const item = founderExceptionFixture();
      setup({ ...item, nextAction: { ...item.nextAction, ...action } });
      expect(screen.getByRole('link')).toHaveAttribute('href', href);
    },
  );
  it.each([
    // oxlint-disable-next-line no-script-url -- This negative case must cover executable schemes.
    { targetType: 'TASK', targetId: 'javascript:alert(1)' },
    {
      targetType: 'COMMITMENT',
      engagementId: FOUNDER_ENGAGEMENT_ID,
      periodId: null,
    },
    { targetType: 'MONTHLY', currency: 'USD', serviceMonth: null },
    {
      targetType: 'FORECAST',
      sourceKind: 'ITEM',
      currency: 'USD',
      targetId: null,
    },
  ] as Partial<FounderAction>[])(
    'offers refresh instead of pretending a malformed source link opens the right record %#',
    (action) => {
      const item = founderExceptionFixture();
      setup({ ...item, nextAction: { ...item.nextAction, ...action } });
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'source link could not be confirmed',
      );
    },
  );
  it('keeps secondary factual task reasons in source evidence without duplicating the action', () => {
    setup(founderExceptionFixture());
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const details = screen
      .getByText('Evidence and source details')
      .closest('details');
    expect(details).not.toBeNull();
    if (!details) throw new Error('Missing source details');
    expect(within(details).getByText('Source version: 4')).toBeInTheDocument();
    expect(
      within(details).getByText('Work is past its due date'),
    ).toBeInTheDocument();
  });
  it('labels a first negative daily close as a 90-day scenario rather than an actual payment', () => {
    const item = monetary('-100000000');
    setup({
      ...item,
      reasonCode: 'FORECAST_NEGATIVE_CLOSING',
      sourceType: 'FORECAST_ANCHOR',
      dueAt: '2026-11-20',
      evidence: {
        ...item.evidence,
        timezone: 'Asia/Qatar',
        date: '2026-11-20',
        warnings: ['REVIEWED_90_DAY_SCENARIO', 'INCOMPLETE_FORECAST'],
      },
      nextAction: {
        ...item.nextAction,
        code: 'REVIEW_FORECAST',
        sourceKind: 'ANCHOR',
      },
    });
    expect(
      screen.getByText('Projected daily closing balance'),
    ).toBeInTheDocument();
    expect(screen.getByText('-$100.00')).toBeInTheDocument();
    expect(screen.getByText(/2026-11-20 · Asia\/Qatar/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('financeForecastDays=90'),
    );
  });
});
