import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryFinanceForecast } from '@/delivery/finance/DeliveryFinanceForecast';
import {
  type FinanceForecastSnapshot,
  type FinanceForecastSources,
} from '@/delivery/finance/finance-forecast.types';
import {
  financeForecastItemFixture,
  financeForecastSnapshotFixture,
  financeForecastSourcesFixture,
  FORECAST_CASH_ID,
  FORECAST_INVOICE_ID,
  FORECAST_ITEM_ID,
  FORECAST_OWNER_ID,
  FORECAST_REALIZATION_ID,
} from '@/delivery/finance/__tests__/finance-forecast.fixtures';

let mockSnapshot: FinanceForecastSnapshot;
let mockMainError: Error | undefined;
let mockSourceError: Error | undefined;
let mockReady = true;
let mockCanRead = true;
let mockCanManage = true;
let mockScope = 'workspace:member:membership';
const mockMainRefetch = jest.fn();
const mockSourceRefetch = jest.fn();
const mockChanged = jest.fn();
const mockMutation = jest.fn();
const mockMainCache = new Map<string, FinanceForecastSnapshot>();
const mockSources = new Map<string, FinanceForecastSources>();
const mockSourceCache = new Map<string, FinanceForecastSources>();
type MockInput = {
  currency: string;
  horizonDays?: number;
  selectedItemId?: string | null;
  kind?: string;
  selectedId?: string | null;
  month?: string | null;
};
const mockOperationName = (document: DocumentNode) => {
  const operation = document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  );
  return operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
};
const mockMain = (input: MockInput) => {
  const key = JSON.stringify(input);
  let data = mockMainCache.get(key);
  if (!data) {
    data = {
      ...mockSnapshot,
      currency: input.currency,
      horizonDays: input.horizonDays ?? 30,
      selectedItem:
        mockSnapshot.items.find((item) => item.id === input.selectedItemId) ??
        null,
    };
    mockMainCache.set(key, data);
  }
  return data;
};
const mockSource = (input: MockInput) => {
  const key = JSON.stringify(input);
  let data = mockSourceCache.get(key);
  if (!data) {
    const base = mockSources.get(input.kind ?? 'RECEIVABLE')!;
    data = {
      ...base,
      currency: input.currency,
      selectedSource:
        base.sources.find((source) => source.id === input.selectedId) ?? null,
    };
    mockSourceCache.set(key, data);
  }
  return data;
};
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    document: DocumentNode,
    options: { variables: { input: MockInput } },
  ) =>
    mockOperationName(document) === 'DeliveryFinanceForecastSources'
      ? {
          data: {
            deliveryFinanceForecastSources: mockSource(options.variables.input),
          },
          error: mockSourceError,
          loading: false,
          refetch: mockSourceRefetch,
        }
      : {
          data: { deliveryFinanceForecast: mockMain(options.variables.input) },
          error: mockMainError,
          loading: false,
          refetch: mockMainRefetch,
        },
  useMutation: (document: DocumentNode) => [
    (options: unknown) => mockMutation(mockOperationName(document), options),
  ],
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canReadFinance: mockCanRead,
    canManageFinance: mockCanManage,
    lastVerifiedCanReadFinance: mockReady ? mockCanRead : true,
    scope: mockScope,
    refetch: mockMainRefetch,
    matches: (
      value:
        | { workspaceId: string; memberId: string; userWorkspaceId: string }
        | null
        | undefined,
    ) =>
      mockReady &&
      value?.workspaceId === 'workspace' &&
      value.memberId === FORECAST_OWNER_ID &&
      value.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
const setup = (additional = '') => {
  let refresh: () => void = () => undefined;
  const Page = () => {
    const [, setVersion] = useState(0);
    const [params] = useSearchParams();
    refresh = () => setVersion((version) => version + 1);
    return (
      <DeliveryFinanceForecast
        key={params.toString()}
        onChanged={mockChanged}
      />
    );
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Page />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    {
      initialEntries: [
        `/delivery?view=finance&financeView=forecast&financeCurrency=USD${additional}`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return {
    router,
    update: () => {
      mockMainCache.clear();
      mockSourceCache.clear();
      act(refresh);
    },
  };
};
const fillCollection = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: 'Schedule this collection' }),
  );
  fireEvent.change(screen.getByLabelText('Expected collection date'), {
    target: { value: '2026-11-03' },
  });
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Responsible finance owner' }),
    FORECAST_OWNER_ID,
  );
  fireEvent.change(screen.getByLabelText('Next action date'), {
    target: { value: '2026-10-29' },
  });
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Follow-up note' }),
    'Keep this collection follow-up.',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for this review' }),
    'Reviewed current invoice balance.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockSnapshot = financeForecastSnapshotFixture();
  mockMainError = undefined;
  mockSourceError = undefined;
  mockReady = true;
  mockCanRead = true;
  mockCanManage = true;
  mockScope = 'workspace:member:membership';
  mockMainCache.clear();
  mockSourceCache.clear();
  mockSources.clear();
  for (const kind of ['RECEIVABLE', 'PLAN', 'CASH'])
    mockSources.set(kind, financeForecastSourcesFixture(kind));
  mockMainRefetch.mockReset().mockImplementation(async () => ({
    data: { deliveryFinanceForecast: mockSnapshot },
  }));
  mockSourceRefetch.mockReset().mockImplementation(async () => ({
    data: { deliveryFinanceForecastSources: mockSources.get('RECEIVABLE') },
  }));
  mockChanged.mockReset().mockResolvedValue(undefined);
  mockMutation.mockReset().mockResolvedValue({ data: {} });
});

it('keeps missing starting cash unknown instead of inventing a zero projection', () => {
  mockSnapshot = {
    ...mockSnapshot,
    anchor: null,
    timezone: null,
    businessDate: null,
    actualInflowMicros: null,
    actualOutflowMicros: null,
    currentCashMicros: null,
    expectedInflowMicros: null,
    expectedOutflowMicros: null,
    endingCashMicros: null,
    timeline: [],
    projectionComplete: false,
    warnings: ['ANCHOR_NOT_SET'],
  };
  setup();
  expect(
    screen.getByText(
      'Starting cash is unknown. Confirm a dated closing balance before a cash projection can be calculated.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Set up starting cash' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Reviewed cash scenario' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Projected closing cash')).not.toBeInTheDocument();
});

it.each([true, false])(
  'directs an unconfigured reporting date to starting cash with management access %s',
  (canManage) => {
    mockCanManage = canManage;
    mockSnapshot = {
      ...mockSnapshot,
      anchor: null,
      timezone: null,
      businessDate: null,
      currentCashMicros: null,
      expectedInflowMicros: null,
      expectedOutflowMicros: null,
      endingCashMicros: null,
      timeline: [],
      projectionComplete: false,
      exceptions: [
        {
          key: 'REPORTING_DATE_NOT_SET:UNKNOWN',
          code: 'REPORTING_DATE_NOT_SET',
          sourceType: null,
          sourceId: null,
          itemId: null,
          title: null,
          date: null,
          amountMicros: null,
        },
      ],
      exceptionCount: 1,
    };
    setup();
    const work = screen.getByRole('region', {
      name: 'Unresolved cash forecast items',
    });
    expect(
      within(work).getByText('Starting cash not configured'),
    ).toBeVisible();
    expect(
      within(work).getByText(
        canManage
          ? 'Confirm starting cash and the reporting time zone in the Starting cash section above.'
          : 'A finance operator must confirm starting cash and the reporting time zone in the Starting cash section above.',
      ),
    ).toBeVisible();
    expect(
      within(work).queryByRole('link', { name: 'Review cash records' }),
    ).not.toBeInTheDocument();
    expect(
      within(work).queryByText('Amount not confirmed'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Reviewed cash scenario' }),
    ).not.toBeInTheDocument();
    if (canManage)
      expect(
        screen.getAllByRole('button', { name: 'Set up starting cash' }),
      ).toHaveLength(1);
    else
      expect(
        screen.queryByRole('button', { name: 'Set up starting cash' }),
      ).not.toBeInTheDocument();
  },
);

it('prioritizes incomplete follow-up with exact source actions and sends future incoming cash to its original record', () => {
  mockSnapshot = {
    ...mockSnapshot,
    projectionComplete: false,
    knownUnscheduledInflowMicros: '600000000',
    unknownCollectionCount: 1,
    exceptions: [
      {
        key: 'collection',
        code: 'UNSCHEDULED_COLLECTION',
        sourceType: 'RECEIVABLE',
        itemId: null,
        sourceId: FORECAST_INVOICE_ID,
        title: 'Unscheduled client balance',
        date: '2026-11-05',
        amountMicros: '600000000',
      },
      {
        key: 'future',
        code: 'FUTURE_CASH',
        sourceType: 'CASH',
        itemId: null,
        sourceId: FORECAST_CASH_ID,
        title: 'Future incoming receipt',
        date: '2026-12-01',
        amountMicros: '400000000',
      },
    ],
    exceptionCount: 2,
  };
  setup();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Incomplete information',
  );
  const work = screen.getByRole('region', {
    name: 'Unresolved cash forecast items',
  });
  expect(within(work).getByText(/Known collections outside/)).toHaveTextContent(
    '$600.00',
  );
  expect(
    within(work).getByText('Collections with unconfirmed balances: 1'),
  ).toBeVisible();
  expect(
    within(work).getByRole('link', { name: 'Review collection source' }),
  ).toHaveAttribute(
    'href',
    expect.stringContaining('financeForecastKind=RECEIVABLE'),
  );
  expect(
    within(work).queryByRole('link', { name: 'Review outgoing payment' }),
  ).not.toBeInTheDocument();
  expect(
    within(work).getAllByRole('link', { name: 'Open original record' })[1],
  ).toHaveAttribute(
    'href',
    expect.stringContaining(`financeCash=${FORECAST_CASH_ID}`),
  );
  expect(
    work.compareDocumentPosition(
      screen.getByText('Daily closing scenario (2 days)'),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('retains the complete hidden collection draft through outage, failed retry and recovery without writing', async () => {
  const page = setup(
    `&financeForecastKind=RECEIVABLE&financeForecastSource=${FORECAST_INVOICE_ID}`,
  );
  await fillCollection();
  const retainedNote = screen.getByRole('textbox', { name: 'Follow-up note' });
  mockMainError = new Error('Offline');
  mockReady = false;
  page.update();
  expect(
    screen.queryByRole('textbox', { name: 'Follow-up note' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Recorded cash today')).not.toBeInTheDocument();
  expect(
    screen.queryByText('Closing balance checked against cash records.'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', {
      name: 'Unresolved cash forecast items',
      hidden: true,
    }),
  ).not.toBeInTheDocument();
  expect(retainedNote).toBeInTheDocument();
  expect(retainedNote).not.toBeVisible();
  expect(retainedNote).toBeDisabled();
  mockMainRefetch.mockRejectedValueOnce(new Error('Offline'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh cash forecast' }),
  );
  expect(
    screen.queryByRole('textbox', { name: 'Follow-up note' }),
  ).not.toBeInTheDocument();
  mockMainError = undefined;
  mockReady = true;
  page.update();
  expect(screen.getByRole('textbox', { name: 'Follow-up note' })).toBe(
    retainedNote,
  );
  expect(screen.getByRole('textbox', { name: 'Follow-up note' })).toHaveValue(
    'Keep this collection follow-up.',
  );
  expect(screen.getByLabelText('Expected collection date')).toHaveValue(
    '2026-11-03',
  );
  expect(
    screen.getByRole('combobox', { name: 'Responsible finance owner' }),
  ).toHaveValue(FORECAST_OWNER_ID);
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('hides only failed source details while retaining the source draft and current cash projection', async () => {
  const page = setup(
    `&financeForecastKind=RECEIVABLE&financeForecastSource=${FORECAST_INVOICE_ID}`,
  );
  await fillCollection();
  mockSourceError = new Error('Source offline');
  page.update();
  expect(
    screen.queryByRole('textbox', { name: 'Follow-up note' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Recorded cash today')).toBeVisible();
  mockSourceRefetch.mockRejectedValueOnce(new Error('Still unavailable'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh forecast sources' }),
  );
  mockSourceError = undefined;
  page.update();
  expect(screen.getByRole('textbox', { name: 'Follow-up note' })).toHaveValue(
    'Keep this collection follow-up.',
  );
  expect(mockMutation).not.toHaveBeenCalled();
});

it('retains a draft read-only on management loss and disposes it on verified finance-read denial', async () => {
  const page = setup(
    `&financeForecastKind=RECEIVABLE&financeForecastSource=${FORECAST_INVOICE_ID}`,
  );
  await fillCollection();
  mockCanManage = false;
  page.update();
  expect(screen.getByRole('textbox', { name: 'Follow-up note' })).toHaveValue(
    'Keep this collection follow-up.',
  );
  expect(
    screen.getByRole('textbox', { name: 'Follow-up note' }),
  ).toBeDisabled();
  mockCanRead = false;
  page.update();
  expect(
    screen.getByText('Finance access is required to view cash forecasts.'),
  ).toBeVisible();
  mockCanRead = true;
  mockCanManage = true;
  page.update();
  await userEvent.click(
    screen.getByRole('button', { name: 'Schedule this collection' }),
  );
  expect(screen.getByRole('textbox', { name: 'Follow-up note' })).toHaveValue(
    '',
  );
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});

it('guards a forecast filter transition and clears discarded data in the new horizon', async () => {
  const page = setup(
    `&financeForecastKind=RECEIVABLE&financeForecastSource=${FORECAST_INVOICE_ID}`,
  );
  await fillCollection();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Forecast horizon' }),
    '90',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Apply forecast filters' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox', { name: 'Follow-up note' })).toHaveValue(
    'Keep this collection follow-up.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Apply forecast filters' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    new URLSearchParams(page.router.state.location.search).get(
      'financeForecastDays',
    ),
  ).toBe('90');
  expect(
    screen.queryByRole('textbox', { name: 'Follow-up note' }),
  ).not.toBeInTheDocument();
});

it('cancels an unusable expectation with a reason without requiring a departed owner or available source', async () => {
  const item = {
    ...financeForecastItemFixture(),
    ownerEligible: false,
    warnings: ['OWNER_INELIGIBLE', 'MISSING_SOURCE'],
    eligible: false,
  };
  mockSnapshot.items = [item];
  mockMutation.mockResolvedValue({
    data: {
      saveDeliveryFinanceForecastItem: {
        item: { ...item, status: 'CANCELLED' },
        replayed: false,
      },
    },
  });
  setup(`&financeForecastItem=${item.id}`);
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel expectation' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for cancelling expectation' }),
    'No longer expected; retain actual transfers.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel expected cash flow' }),
  );
  expect(mockMutation).toHaveBeenCalledWith('SaveDeliveryFinanceForecastItem', {
    variables: {
      input: expect.objectContaining({
        id: item.id,
        revision: item.revision,
        status: 'CANCELLED',
        amountMicros: item.amountMicros,
        ownerId: item.ownerId,
        reason: 'No longer expected; retain actual transfers.',
      }),
    },
  });
  expect(
    await screen.findByText(
      'Expectation cancelled. Actual payments and monthly results remain unchanged.',
    ),
  ).toBeVisible();
});

it('shows current changed-plan terms before retaining an existing reviewed amount and date', async () => {
  const plan = mockSources.get('PLAN')!.sources[0];
  const item = {
    ...financeForecastItemFixture(),
    sourceType: 'PLAN',
    sourceId: plan.id,
    planMonth: plan.planMonth,
    amountMicros: '777000000',
    expectedDate: '2026-11-15',
    sourceReviewToken: plan.sourceReviewToken,
    warnings: ['SOURCE_CHANGED'],
    appliedMicros: '0',
  };
  mockSnapshot.items = [item];
  const page = setup(`&financeForecastItem=${item.id}`);
  await userEvent.click(
    screen.getByRole('button', { name: 'Review expectation' }),
  );
  expect(screen.getByText(/Current plan amount/)).toHaveTextContent(
    '$1,000.00',
  );
  expect(
    screen.getByRole('textbox', { name: 'Expected payment amount (USD)' }),
  ).toHaveValue('777');
  expect(screen.getByLabelText('Expected payment date')).toHaveValue(
    '2026-11-15',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for this review' }),
    'Retain the agreed supplier terms.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
  mockSourceError = new Error('Plan offline');
  page.update();
  expect(
    screen.queryByRole('textbox', { name: 'Expected payment amount (USD)' }),
  ).not.toBeInTheDocument();
  mockSourceError = undefined;
  page.update();
  expect(
    screen.getByRole('textbox', { name: 'Reason for this review' }),
  ).toHaveValue('Retain the agreed supplier terms.');
  expect(screen.getByRole('checkbox')).toBeChecked();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save expected payment' }),
  );
  expect(mockMutation).toHaveBeenCalledWith('SaveDeliveryFinanceForecastItem', {
    variables: {
      input: expect.objectContaining({
        amountMicros: '777000000',
        expectedDate: '2026-11-15',
        expectedSourceReviewToken: plan.sourceReviewToken,
        acknowledgeSourceWarnings: true,
      }),
    },
  });
});

it('shows a verified unavailable current plan and keeps a guarded cancellation route', async () => {
  const plan = mockSources.get('PLAN')!.sources[0];
  mockSnapshot.items = [
    {
      ...financeForecastItemFixture(),
      sourceType: 'PLAN',
      sourceId: plan.id,
      planMonth: plan.planMonth,
      sourceReviewToken: plan.sourceReviewToken,
    },
  ];
  mockSources.set('PLAN', {
    ...mockSources.get('PLAN')!,
    sources: [],
    selectedSource: null,
  });
  setup(`&financeForecastItem=${FORECAST_ITEM_ID}`);
  await userEvent.click(
    screen.getByRole('button', { name: 'Review expectation' }),
  );
  expect(
    screen.getByText(
      'The current plan is unavailable for this currency and month. Review the original plan or cancel this expectation.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('textbox', { name: 'Expected payment amount (USD)' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel source review' }),
  );
  expect(
    screen.queryByRole('button', { name: 'Cancel source review' }),
  ).not.toBeInTheDocument();
});

it('reactivates a cancelled collection using its full current invoice balance rather than the cancelled zero remainder', async () => {
  const item = {
    ...mockSnapshot.items.find((entry) => entry.kind === 'COLLECTION')!,
    status: 'CANCELLED',
    remainingMicros: '0',
    eligible: false,
    warnings: [],
  };
  mockSnapshot.items = [item];
  const sources = mockSources.get('RECEIVABLE')!;
  sources.sources[0] = { ...sources.sources[0], occurrenceItemId: item.id };
  setup(`&financeForecastItem=${item.id}`);
  await userEvent.click(
    screen.getByRole('button', { name: 'Review reactivating expectation' }),
  );
  expect(screen.getByText(/Current outstanding balance/)).toHaveTextContent(
    '$600.00',
  );
  expect(screen.getByText(/Full remaining invoice balance/)).toHaveTextContent(
    '$600.00',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for this review' }),
    'Resume collection with the current outstanding balance.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Save expected collection' }),
  );
  expect(mockMutation).toHaveBeenCalledWith('SaveDeliveryFinanceForecastItem', {
    variables: {
      input: expect.objectContaining({
        id: item.id,
        revision: item.revision,
        status: 'ACTIVE',
        amountMicros: '600000000',
        expectedDate: item.expectedDate,
        ownerId: item.ownerId,
      }),
    },
  });
});

it.each(['owner', 'changed-plan'] as const)(
  'blocks application to an item needing %s review while leaving overdue dates usable',
  async (failure) => {
    const item = {
      ...financeForecastItemFixture(),
      expectedDate: '2026-10-01',
      eligible: false,
      warnings: ['OVERDUE_EXPECTATION'],
    };
    if (failure === 'owner') {
      item.ownerEligible = false;
      item.warnings.push('OWNER_INELIGIBLE');
    } else {
      item.sourceType = 'PLAN';
      item.sourceReviewToken = 'f'.repeat(64);
      item.warnings.push('SOURCE_CHANGED');
    }
    mockSnapshot.items = [item];
    const page = setup(
      `&financeForecastItem=${item.id}&financeForecastKind=CASH&financeForecastSource=${FORECAST_CASH_ID}`,
    );
    expect(
      screen.getByRole('button', { name: 'Apply to selected expectation' }),
    ).toBeDisabled();
    mockSnapshot.items = [
      {
        ...financeForecastItemFixture(),
        expectedDate: null,
        eligible: false,
        warnings: ['UNDATED_EXPECTATION'],
      },
    ];
    page.update();
    expect(
      screen.getByRole('button', { name: 'Apply to selected expectation' }),
    ).toBeEnabled();
  },
);

it('applies and reverses a partial actual outgoing payment through separate forecast operations only', async () => {
  const relation = {
    id: FORECAST_REALIZATION_ID,
    revision: 1,
    itemId: FORECAST_ITEM_ID,
    cashId: FORECAST_CASH_ID,
    cashTitle: 'Recorded supplier transfer',
    targetTitle: 'November supplier payment',
    currency: 'USD',
    amountMicros: '200000001',
    status: 'ACTIVE',
    note: 'Partial supplier transfer.',
    createdAt: '2026-10-28T03:00:00Z',
    createdByName: 'Finance operator',
    reversedAt: null,
    reversedByName: null,
    reversalReason: null,
  };
  mockMutation.mockImplementation(async (operation: string) => ({
    data:
      operation === 'RealizeDeliveryFinanceForecastOutflow'
        ? {
            realizeDeliveryFinanceForecastOutflow: {
              realization: relation,
              replayed: false,
            },
          }
        : {
            reverseDeliveryFinanceForecastRealization: {
              realization: { ...relation, status: 'REVERSED', revision: 2 },
              replayed: false,
            },
          },
  }));
  const page = setup(
    `&financeForecastItem=${FORECAST_ITEM_ID}&financeForecastKind=CASH&financeForecastSource=${FORECAST_CASH_ID}`,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Apply to selected expectation' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Amount to apply' }),
    '200.000001',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Payment application note' }),
    'Partial supplier transfer.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Apply recorded payment' }),
  );
  expect(
    await screen.findByText(
      'Recorded payment applied to the expectation. Cash was counted once; monthly matching is unchanged.',
    ),
  ).toBeVisible();
  expect(mockMutation).toHaveBeenCalledWith(
    'RealizeDeliveryFinanceForecastOutflow',
    {
      variables: {
        input: expect.objectContaining({
          itemId: FORECAST_ITEM_ID,
          cashId: FORECAST_CASH_ID,
          amountMicros: '200000001',
        }),
      },
    },
  );
  mockSnapshot.realizations = [relation];
  page.update();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reverse payment application' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', {
      name: 'Reason for reversing payment application',
    }),
    'Applied to the wrong expectation.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Reverse this application' }),
  );
  expect(
    await screen.findByText(
      'Payment application reversed. The actual payment and monthly matching remain unchanged.',
    ),
  ).toBeVisible();
  expect(mockMutation).toHaveBeenLastCalledWith(
    'ReverseDeliveryFinanceForecastRealization',
    {
      variables: {
        input: {
          id: relation.id,
          revision: 1,
          reason: 'Applied to the wrong expectation.',
        },
      },
    },
  );
  expect(mockMutation.mock.calls.map((call) => call[0])).toEqual([
    'RealizeDeliveryFinanceForecastOutflow',
    'ReverseDeliveryFinanceForecastRealization',
  ]);
});

it('hides retained results for a foreign membership response and clears an old identity’s draft', async () => {
  const page = setup(
    `&financeForecastKind=RECEIVABLE&financeForecastSource=${FORECAST_INVOICE_ID}`,
  );
  await fillCollection();
  const retainedNote = screen.getByRole('textbox', { name: 'Follow-up note' });
  mockSnapshot = { ...mockSnapshot, userWorkspaceId: 'other-membership' };
  page.update();
  expect(
    screen.queryByRole('textbox', { name: 'Follow-up note' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Recorded cash today')).not.toBeInTheDocument();
  expect(
    screen.queryByText('Closing balance checked against cash records.'),
  ).not.toBeInTheDocument();
  expect(retainedNote).not.toBeVisible();
  expect(retainedNote).toBeDisabled();
  mockSnapshot = financeForecastSnapshotFixture();
  mockScope = 'workspace:member:new-membership';
  page.update();
  expect(retainedNote).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Schedule this collection' }),
  );
  expect(screen.getByRole('textbox', { name: 'Follow-up note' })).toHaveValue(
    '',
  );
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});
