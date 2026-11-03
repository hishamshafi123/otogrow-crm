import { useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdvertisingDraftPreviewView } from '@/delivery/advertising/drafts/AdvertisingDraftPreviewView';
import { AdvertisingDraftResultView } from '@/delivery/advertising/drafts/AdvertisingDraftResultView';
import { AdvertisingDraftContextView } from '@/delivery/advertising/drafts/AdvertisingDraftContextView';
import {
  advertisingDraftDetail,
  advertisingDraftPreview,
  DRAFT_SUGGESTION_ID,
} from '@/delivery/advertising/drafts/__tests__/advertising-draft.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock(
  '@/delivery/advertising/workbench/advertisingWorkbenchStyles',
  () => ({
    StyledAdvertisingItem: 'article',
    StyledAdvertisingFacts: 'dl',
    StyledAdvertisingText: 'p',
  }),
);
beforeEach(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
const Preview = ({
  blocked = false,
  stale = false,
  cost = '0.05',
}: {
  blocked?: boolean;
  stale?: boolean;
  cost?: string | null;
}) => {
  const [confirmed, setConfirmed] = useState(false);
  const preview = advertisingDraftPreview();
  preview.budget.budgetReady = !blocked;
  preview.budget.maximumCostUsd = cost;
  return (
    <AdvertisingDraftPreviewView
      preview={preview}
      confirmed={confirmed}
      disabled={false}
      stale={stale}
      onConfirmedChange={setConfirmed}
      onStart={mockStart}
    />
  );
};
const mockStart = jest.fn();
const showPreview = (props: Parameters<typeof Preview>[0] = {}) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <Preview
          blocked={props.blocked}
          stale={props.stale}
          cost={props.cost}
        />
      </MemoryRouter>
    </I18nProvider>,
  );

it('shows account-only scope, published-source omissions and redacted settings before explicit paid confirmation', async () => {
  mockStart.mockClear();
  showPreview();
  expect(screen.getByText(/account totals only/)).toBeVisible();
  expect(screen.getByText('USD 0.05')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Start one suggestion run' }),
  ).toBeDisabled();
  await userEvent.click(screen.getByText('Report and brand evidence sent'));
  expect(
    screen.getByText(/2 published knowledge sources included; 1 omitted/),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Assistant settings are private; the configuration version is recorded.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByText('Administrator assistant settings'),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed this evidence, its limits and the maximum reservation.',
    }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Start one suggestion run' }),
  );
  expect(mockStart).toHaveBeenCalledTimes(1);
});

it.each([
  { blocked: true, stale: false, cost: '0.05' },
  { blocked: false, stale: true, cost: '0.05' },
  { blocked: false, stale: false, cost: null },
])(
  'does not permit a blocked, stale or unbounded reservation: %p',
  async (props) => {
    showPreview(props);
    const checkbox = screen.getByRole('checkbox', {
      name: 'I reviewed this evidence, its limits and the maximum reservation.',
    });
    if (!props.stale) await userEvent.click(checkbox);
    expect(
      screen.getByRole('button', { name: 'Start one suggestion run' }),
    ).toBeDisabled();
  },
);

it('preserves a known zero reservation rather than labelling it unknown', () => {
  showPreview({ cost: '0' });
  expect(screen.getByText('USD 0')).toBeVisible();
  expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
});

it('shows the exact human evidence, target and currency without converting unknown money to zero', async () => {
  const context = advertisingDraftPreview().context;
  context.goal.provenance = 'HUMAN';
  context.goal.metricProvenance = 'HUMAN_REPORTED';
  context.goal.evidence = 'Four signed orders were manually reconciled.';
  context.goal.targetCostMicros = '2500000';
  context.metrics = [
    {
      key: 'money:unknown',
      label: 'Revenue not reported',
      value: null,
      unit: 'MONEY',
      goalKinds: ['SALES'],
      provenance: 'UNMAPPED',
      reason: 'NOT_REPORTED',
    },
    {
      key: 'money:zero',
      label: 'Explicit zero revenue',
      value: '0',
      unit: 'MONEY',
      goalKinds: ['SALES'],
      provenance: 'HUMAN_REPORTED',
      reason: null,
    },
  ];
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <AdvertisingDraftContextView context={context} />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    screen.getByText('Four signed orders were manually reconciled.'),
  ).toBeVisible();
  expect(
    screen.getByText('Reporting currency').nextElementSibling,
  ).toHaveTextContent('USD');
  expect(
    screen.getByText('Target cost per outcome').nextElementSibling,
  ).toHaveTextContent('$2.50');
  await userEvent.click(screen.getByText('Report and brand evidence sent'));
  expect(screen.getByText(/Unknown USD/)).toBeVisible();
  expect(screen.getByText(/0 USD/)).toBeVisible();
});

it('requires deliberate proposal selection and labels current evidence before append', async () => {
  const detail = advertisingDraftDetail();
  const insert = jest.fn().mockResolvedValue(undefined);
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <AdvertisingDraftResultView
          detail={detail}
          enabled
          busy={false}
          insertedIds={[]}
          remainingSlots={20}
          canUseNoChange={false}
          onInsert={insert}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(screen.getByText(/unverified proposals/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Append selected suggestions' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getAllByRole('checkbox', { name: 'Select this suggestion' })[0],
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Append selected suggestions' }),
  );
  expect(insert).toHaveBeenCalledWith([DRAFT_SUGGESTION_ID]);
});

it('keeps readonly history useful without exposing an insertion action or treating it as approved work', () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <AdvertisingDraftResultView
          detail={advertisingDraftDetail()}
          enabled={false}
          busy={false}
          insertedIds={[]}
          remainingSlots={0}
          canUseNoChange={false}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(screen.getByText('Test an alternative product opening')).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Append selected suggestions' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Open a recommendation draft/)).toBeVisible();
});

it('prevents duplicate insertions and unsupported no-change combinations while preserving the proposal text', () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <AdvertisingDraftResultView
          detail={advertisingDraftDetail()}
          enabled
          busy={false}
          insertedIds={[DRAFT_SUGGESTION_ID]}
          remainingSlots={19}
          canUseNoChange={false}
          onInsert={jest.fn()}
          onNoChange={jest.fn()}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    screen.getByRole('checkbox', { name: 'Already added to this draft' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Add proposed no-change explanation' }),
  ).toBeDisabled();
  expect(screen.getByText(/Your draft already includes work/)).toBeVisible();
});
