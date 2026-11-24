import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom';
import { DeliveryFinanceAiCosts } from '@/delivery/finance/DeliveryFinanceAiCosts';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type FinanceAiCostSnapshot } from '@/delivery/finance/finance-ai-cost.types';
import {
  AI_ENTRY_ID,
  AI_EVIDENCE_ID,
  AI_MEMBER_ID,
  AI_SPEND_ID,
  financeAiCostSnapshotFixture,
  financeAiCostSourceFixture,
} from '@/delivery/finance/__tests__/finance-ai-cost.fixtures';

type QueryInput = {
  filter: string;
  selectedSpendId: string | null;
  afterSpendId: string | null;
  afterEvidenceId: string | null;
};
let mockSnapshot: FinanceAiCostSnapshot;
let mockError: Error | undefined;
let mockReady = true;
let mockCanRead = true;
let mockCanManage = true;
let mockCanManageBudget = false;
let mockRefreshPage: () => void = () => undefined;
let mockLatestInput: QueryInput;
const mockCache = new Map<string, FinanceAiCostSnapshot>();
const mockMutation = jest.fn();
const mockRefetch = jest.fn();
const mockChanged = jest.fn();
jest.mock('@/delivery/finance/useFinanceRecognitionAvailability', () => ({
  useFinanceRecognitionAvailability: () => ({
    available: true,
    canManage: mockCanManage,
    monthValid: true,
    lockedMonths: [],
    error: false,
    checking: false,
    refetch: mockRefetch,
  }),
}));
const mockQuery = (input: QueryInput) => {
  mockLatestInput = input;
  const key = JSON.stringify(input);
  let data = mockCache.get(key);
  if (!data) {
    data = {
      ...mockSnapshot,
      filter: input.filter,
      selectedSource:
        mockSnapshot.selectedSource?.id === input.selectedSpendId
          ? mockSnapshot.selectedSource
          : (mockSnapshot.sources.find(
              (source) => source.id === input.selectedSpendId,
            ) ?? null),
    };
    mockCache.set(key, data);
  }
  return data;
};
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/DeliveryBusiness', () => ({
  DeliveryBusiness: () => <p>Cash records workspace</p>,
}));
jest.mock('@/delivery/finance/DeliveryMonthlyFinance', () => ({
  DeliveryMonthlyFinance: () => <p>Monthly results workspace</p>,
}));
jest.mock('@/delivery/finance/DeliveryReconciliation', () => ({
  DeliveryReconciliation: () => null,
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    _document: DocumentNode,
    options: { variables: { input: QueryInput } },
  ) => ({
    data: { deliveryFinanceAiCosts: mockQuery(options.variables.input) },
    loading: false,
    error: mockError,
    refetch: mockRefetch,
  }),
  useMutation: () => [mockMutation, { loading: false }],
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canReadFinance: mockCanRead,
    canManageFinance: mockCanManage,
    canManageRoles: mockCanManageBudget,
    lastVerifiedCanReadFinance: mockReady ? mockCanRead : true,
    scope: 'workspace:member',
    refetch: mockRefetch,
    matches: (value: FinanceAiCostSnapshot | undefined) =>
      mockReady &&
      value?.workspaceId === 'workspace' &&
      value.memberId === AI_MEMBER_ID &&
      value.userWorkspaceId === 'membership',
  }),
}));
const setup = (params = `&financeAiSpend=${AI_SPEND_ID}`) => {
  const Page = () => {
    const [, setVersion] = useState(0);
    const [searchParams] = useSearchParams();
    mockRefreshPage = () => setVersion((value) => value + 1);
    const financeView = searchParams.get('financeView') ?? 'ai-costs';
    return (
      <div>
        <nav aria-label="Legacy finance views">
          <Link
            to="/delivery?view=finance&financeView=ai-costs"
            aria-current={financeView === 'ai-costs' ? 'page' : undefined}
          >
            AI costs
          </Link>
          <Link
            to="/delivery?view=finance&financeView=monthly"
            aria-current={financeView === 'monthly' ? 'page' : undefined}
          >
            Monthly results
          </Link>
        </nav>
        {financeView === 'monthly' ? (
          <p>Monthly results workspace</p>
        ) : (
          <DeliveryFinanceAiCosts
            key={searchParams.toString()}
            onChanged={mockChanged}
          />
        )}
      </div>
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
        `/delivery?view=finance&financeView=ai-costs&financeMonth=2026-10${params}`,
      ],
    },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return {
    router,
    update: () => {
      mockCache.clear();
      act(mockRefreshPage);
    },
  };
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
  mockSnapshot = financeAiCostSnapshotFixture();
  mockCache.clear();
  mockError = undefined;
  mockReady = true;
  mockCanRead = true;
  mockCanManage = true;
  mockCanManageBudget = false;
  mockChanged.mockReset().mockResolvedValue(undefined);
  mockMutation.mockReset().mockResolvedValue({
    data: {
      prepareDeliveryFinanceAiCost: {
        entryId: AI_ENTRY_ID,
        status: 'DRAFT',
        replayed: false,
      },
    },
  });
  mockRefetch.mockReset().mockImplementation(async () => ({
    data: { deliveryFinanceAiCosts: mockQuery(mockLatestInput) },
  }));
});
const completeImport = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: 'Prepare monthly cost draft' }),
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Recorded financial event' }),
    AI_EVIDENCE_ID,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Assign remaining amount to company' }),
  );
  await userEvent.click(
    screen.getByRole('checkbox', { name: /I checked that this charge/ }),
  );
};
it('allows a finance-only operator to prepare a cost without exposing administrator spending controls', async () => {
  setup();
  expect(screen.getByRole('link', { name: 'AI costs' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(
    screen.getByRole('button', { name: 'Prepare monthly cost draft' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Open administrator AI spending' }),
  ).not.toBeInTheDocument();
  await completeImport();
  await userEvent.clear(screen.getByLabelText('Service month'));
  await userEvent.type(screen.getByLabelText('Service month'), '2026-09');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save AI-cost draft' }),
  );
  const link = await screen.findByRole('link', {
    name: 'Open saved monthly entry',
  });
  expect(mockMutation).toHaveBeenCalledTimes(1);
  expect(mockMutation.mock.calls[0][0].variables.input.month).toBe('2026-09');
  expect(link).toHaveAttribute(
    'href',
    expect.stringContaining('financeMonth=2026-09'),
  );
  expect(
    screen.getByText(/Review its allocation and post it separately/),
  ).toBeVisible();
});
it('lets a finance reader inspect immutable evidence and existing source links without import controls', () => {
  mockCanManage = false;
  mockSnapshot.canManage = false;
  setup();
  expect(
    screen.getByRole('region', { name: 'Available financial evidence' }),
  ).toHaveTextContent('Recorded usage at the saved model price');
  expect(
    screen.queryByRole('button', { name: 'Prepare monthly cost draft' }),
  ).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});
it('explains an unsettled or malformed-model source without presenting held amounts as costs', () => {
  mockSnapshot.sources = [
    {
      ...financeAiCostSourceFixture(),
      state: 'UNCERTAIN',
      modelId: '',
      settledAmountMicros: null,
      eligible: false,
      evidenceOptions: [],
      sourceWarnings: [
        'SOURCE_NOT_SETTLED',
        'SOURCE_AMOUNT_INVALID',
        'SETTLEMENT_EVIDENCE_UNAVAILABLE',
        'SOURCE_MODEL_UNAVAILABLE',
      ],
    },
  ];
  setup('&financeAiFilter=ALL&financeAiSpend=' + AI_SPEND_ID);
  expect(
    screen.getByRole('heading', { name: 'Model identity unavailable' }),
  ).toBeVisible();
  expect(
    screen.getByText(
      /An administrator must reconcile it in AI spending before import/,
    ),
  ).toBeVisible();
  expect(
    screen.queryByText(/The recorded amount is unavailable or invalid/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/The original financial evidence is unavailable/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Available financial evidence' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Prepare monthly cost draft' }),
  ).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});
it('retains missing-amount and evidence diagnostics for a malformed settled source', () => {
  mockSnapshot.sources = [
    {
      ...financeAiCostSourceFixture(),
      settledAmountMicros: null,
      eligible: false,
      evidenceOptions: [],
      sourceWarnings: [
        'SOURCE_AMOUNT_INVALID',
        'SETTLEMENT_EVIDENCE_UNAVAILABLE',
      ],
    },
  ];
  setup();
  expect(
    screen.getByText(/The recorded amount is unavailable or invalid/),
  ).toBeVisible();
  expect(
    screen.getByText(/The original financial evidence is unavailable/),
  ).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Available financial evidence' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Prepare monthly cost draft' }),
  ).not.toBeInTheDocument();
});
it('uses a selected source outside the paged list and preserves filter/source URLs', async () => {
  mockSnapshot.selectedSource = financeAiCostSourceFixture();
  mockSnapshot.sources = [];
  const page = setup();
  expect(screen.getByRole('heading', { name: 'reviewed-model' })).toBeVisible();
  await userEvent.click(
    screen.getByRole('link', { name: 'All recorded requests' }),
  );
  expect(
    new URLSearchParams(page.router.state.location.search).get(
      'financeAiFilter',
    ),
  ).toBe('ALL');
  expect(
    new URLSearchParams(page.router.state.location.search).get(
      'financeAiSpend',
    ),
  ).toBe(AI_SPEND_ID);
  expect(mockMutation).not.toHaveBeenCalled();
});
it('opens the existing claimed draft instead of offering a second import', () => {
  mockSnapshot.sources[0].claim = {
    revision: 1,
    currentEntry: {
      id: AI_ENTRY_ID,
      revision: 2,
      status: 'DRAFT',
      month: '2026-08',
      amountMicros: '10125678',
      matchedMicros: '0',
      activeMatchCount: 0,
    },
    replacementEntry: null,
  };
  setup();
  expect(
    screen.getByRole('link', { name: 'Open monthly draft' }),
  ).toHaveAttribute('href', expect.stringContaining('financeMonth=2026-08'));
  expect(
    screen.queryByRole('button', { name: 'Prepare monthly cost draft' }),
  ).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});
it('labels the original ledger amount separately from current recognition and a pending correction in catalog rows', () => {
  const source = mockSnapshot.sources[0];
  source.settledAmountMicros = '2500000';
  source.evidenceOptions[0].amountMicros = '2500000';
  source.claim = {
    revision: 4,
    currentEntry: {
      id: AI_ENTRY_ID,
      revision: 2,
      status: 'POSTED',
      month: '2026-09',
      amountMicros: '3750000',
      matchedMicros: '0',
      activeMatchCount: 0,
    },
    replacementEntry: {
      id: '54af1cef-16d4-4137-8ee0-27ae470b1592',
      revision: 1,
      status: 'DRAFT',
      month: '2026-10',
      amountMicros: '1000000',
      matchedMicros: '0',
      activeMatchCount: 0,
    },
  };
  setup('&financeAiFilter=ALL');
  expect(screen.getByText(/Original ledger charge:/)).toHaveTextContent(
    'Original ledger charge: $2.50',
  );
  expect(screen.getByText(/Current monthly entry:/)).toHaveTextContent(
    'Current monthly entry: $3.75 · 2026-09 · Posted',
  );
  expect(screen.getByText(/Pending correction:/)).toHaveTextContent(
    'Pending correction: $1.00 · 2026-10 · Draft',
  );
  expect(mockMutation).not.toHaveBeenCalled();
});
it.each([
  { original: '0', expected: '$0.00' },
  { original: null, expected: 'Not confirmed' },
])(
  'distinguishes original ledger value $original from an unknown amount in catalog rows',
  ({ original, expected }) => {
    mockSnapshot.sources[0].settledAmountMicros = original;
    mockSnapshot.sources[0].eligible = original !== null;
    mockSnapshot.sources[0].sourceWarnings =
      original === null ? ['SOURCE_AMOUNT_INVALID'] : [];
    setup('&financeAiFilter=ALL');
    expect(screen.getByText(/Original ledger charge:/)).toHaveTextContent(
      `Original ledger charge: ${expected}`,
    );
  },
);
it('keeps a dirty source review through query/access failures and requires guarded navigation', async () => {
  const page = setup();
  await completeImport();
  const notes = screen.getByRole('textbox', { name: 'Finance review notes' });
  await userEvent.type(notes, 'Keep this financial review');
  mockError = new Error('Source offline');
  page.update();
  expect(notes).not.toBeVisible();
  expect(notes).toHaveValue('Keep this financial review');
  mockError = undefined;
  mockReady = false;
  mockCanRead = false;
  mockCanManage = false;
  page.update();
  expect(notes).not.toBeVisible();
  expect(notes).toBeDisabled();
  mockReady = true;
  mockCanRead = true;
  mockCanManage = true;
  page.update();
  expect(screen.getByRole('textbox', { name: 'Finance review notes' })).toBe(
    notes,
  );
  await userEvent.click(screen.getByRole('link', { name: 'Monthly results' }));
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(notes).toHaveValue('Keep this financial review');
  await userEvent.click(screen.getByRole('link', { name: 'Monthly results' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByText('Monthly results workspace')).toBeVisible();
  expect(mockMutation).not.toHaveBeenCalled();
});
it('redacts and discards an opened import after verified finance-read revocation', async () => {
  const page = setup();
  await completeImport();
  mockCanRead = false;
  page.update();
  expect(
    screen.getByText('Finance access is required to inspect AI costs.'),
  ).toBeVisible();
  expect(
    screen.queryByLabelText('Finance review notes'),
  ).not.toBeInTheDocument();
  mockCanRead = true;
  page.update();
  expect(
    screen.queryByLabelText('Finance review notes'),
  ).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});
it('reports the actual voided state returned by a replay instead of claiming a new draft', async () => {
  mockMutation.mockResolvedValueOnce({
    data: {
      prepareDeliveryFinanceAiCost: {
        entryId: AI_ENTRY_ID,
        status: 'VOID',
        replayed: true,
      },
    },
  });
  setup();
  await completeImport();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save AI-cost draft' }),
  );
  await waitFor(() =>
    expect(screen.getByText(/its entry is now voided/)).toBeVisible(),
  );
  expect(screen.queryByText(/AI-cost draft saved/)).not.toBeInTheDocument();
});
