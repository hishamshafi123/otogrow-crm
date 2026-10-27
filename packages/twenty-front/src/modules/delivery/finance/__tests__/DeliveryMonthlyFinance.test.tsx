import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type DeliveryFinanceQuery } from '~/generated-metadata/graphql';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryFinance } from '@/delivery/finance/DeliveryFinance';
import { type FinanceAiCostSnapshot } from '@/delivery/finance/finance-ai-cost.types';
import { type FinancePeriodSnapshot } from '@/delivery/finance/finance-period.types';
import {
  financePeriodStateFixture,
  financePeriodSnapshotFixture,
  financePeriodLockedFixture,
} from '@/delivery/finance/__tests__/finance-period.fixtures';
import {
  AI_PRIOR_ENTRY_ID,
  financeAiCostEntryFixture,
  financeAiCostSnapshotFixture,
  financeAiCostSourceFixture,
} from '@/delivery/finance/__tests__/finance-ai-cost.fixtures';

type FinanceSnapshot = DeliveryFinanceQuery['deliveryFinance'];
type FinanceEntry = FinanceSnapshot['entries'][number];
type QueryInput = {
  selectedEntryId: string | null;
  selectedPlanId: string | null;
  month?: string;
};
type MutationOptions = { variables: { input: { id?: string } } };
const MEMBER_ID = '2a3587de-498f-48bf-a1a8-9939109f877a';
const PLAN_ID = '879ef795-b85d-4db5-bfba-d3d89b159111';
const ENTRY_ID = 'd908d75f-00c9-4e91-8071-27c4b3216a79';
const SECOND_ENTRY_ID = '9943ba39-b25e-4ce7-b79f-3369553cd242';
const PROJECT_ID = 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689';
const SOURCE_ACKNOWLEDGEMENT =
  'I reviewed the changed source and confirm this saved obligation belongs in this month.';
let mockSnapshot: FinanceSnapshot;
let mockQueryError: Error | undefined;
let mockCanReadFinance = true;
let mockCanManageFinance = true;
let mockAccessReady = true;
let mockAiSnapshot: FinanceAiCostSnapshot;
let mockPeriodSnapshot: FinancePeriodSnapshot;
const mockPeriodCache = new Map<string, FinancePeriodSnapshot>();
const mockPeriodQuery = (input: { month?: string }) => {
  const month = input.month ?? '2026-10';
  let snapshot = mockPeriodCache.get(month);
  if (!snapshot) {
    snapshot = {
      ...mockPeriodSnapshot,
      period: { ...mockPeriodSnapshot.period, month },
    };
    mockPeriodCache.set(month, snapshot);
  }
  return snapshot;
};
jest.mock('@/delivery/finance/useFinanceRecognitionAvailability', () => ({
  useFinanceRecognitionAvailability: () => ({
    available: true,
    canManage: mockCanManageFinance,
    monthValid: true,
    lockedMonths: [],
    error: false,
    checking: false,
    refetch: mockRefetch,
  }),
}));
const mockQueryCache = new Map<string, FinanceSnapshot>();
const mockRefetch = jest.fn();
const mockChanged = jest.fn();
const mockMutation = jest.fn();
const mockOperationName = (document: DocumentNode) => {
  const operation = document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  );
  return operation?.kind === 'OperationDefinition'
    ? operation.name?.value
    : undefined;
};
const mockFinanceQuery = (input: QueryInput) => {
  const key = JSON.stringify(input);
  let snapshot = mockQueryCache.get(key);
  if (!snapshot) {
    snapshot = {
      ...mockSnapshot,
      selectedEntry:
        mockSnapshot.selectedEntry?.id === input.selectedEntryId
          ? mockSnapshot.selectedEntry
          : (mockSnapshot.entries.find(
              (entry) => entry.id === input.selectedEntryId,
            ) ?? null),
      selectedPlan:
        mockSnapshot.plans.find((plan) => plan.id === input.selectedPlanId) ??
        null,
    };
    mockQueryCache.set(key, snapshot);
  }
  return snapshot;
};
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryGrid: 'div',
  StyledDeliveryBadge: 'span',
}));
jest.mock('@/delivery/DeliveryBusiness', () => ({
  DeliveryBusiness: () => <p>Cash records workspace</p>,
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    document: DocumentNode,
    options: { variables: { input: QueryInput & { entryId?: string } } },
  ) => ({
    data:
      mockOperationName(document) === 'DeliveryFinanceEntryHistory'
        ? {
            deliveryFinanceEntryHistory: {
              workspaceId: 'workspace',
              memberId: MEMBER_ID,
              userWorkspaceId: 'user-workspace',
              entryId: options.variables.input.entryId,
              events: [],
              nextBeforeId: null,
            },
          }
        : mockOperationName(document) === 'DeliveryFinancePeriod'
          ? { deliveryFinancePeriod: mockPeriodQuery(options.variables.input) }
          : mockOperationName(document) === 'DeliveryFinanceAiCosts'
            ? { deliveryFinanceAiCosts: mockAiSnapshot }
            : { deliveryFinance: mockFinanceQuery(options.variables.input) },
    error: mockQueryError,
    loading: false,
    refetch: mockRefetch,
  }),
  useMutation: (document: DocumentNode) => [
    (options: MutationOptions) =>
      mockMutation(mockOperationName(document), options),
    { loading: false },
  ],
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockAccessReady,
    scope: 'workspace:member',
    canReadFinance: mockCanReadFinance,
    lastVerifiedCanReadFinance: mockAccessReady ? mockCanReadFinance : true,
    canManageFinance: mockCanManageFinance,
    refetch: mockRefetch,
    matches: (value: FinanceSnapshot | undefined) =>
      mockAccessReady &&
      value?.workspaceId === 'workspace' &&
      value.memberId === MEMBER_ID &&
      value.userWorkspaceId === 'user-workspace',
  }),
}));
const entryFixture = (): FinanceEntry => ({
  id: ENTRY_ID,
  revision: 3,
  month: '2026-10',
  kind: 'COST',
  category: 'SALARY',
  title: 'October editor pay',
  currency: 'USD',
  amountMicros: '1000000000',
  note: '',
  evidenceUrl: null,
  status: 'DRAFT',
  sourceType: 'PLAN',
  sourcePlan: {
    planId: PLAN_ID,
    revision: 2,
    type: 'SALARY',
    name: 'Editor monthly pay',
    memberId: MEMBER_ID,
    memberName: 'Active editor',
    monthlyAmountMicros: '1000000000',
    startMonth: '2026-10',
    endMonth: null,
    dueDay: 31,
  },
  sourceWarnings: [],
  lockedMonths: [],
  sourceReviewToken: 'a'.repeat(64),
  dueDate: '2026-10-31',
  remainingAllocationMicros: '0',
  allocations: [
    {
      projectId: PROJECT_ID,
      projectName: 'Client Alpha',
      amountMicros: '1000000000',
    },
  ],
  createdBy: MEMBER_ID,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  postedAt: null,
  voidedAt: null,
  voidReason: null,
});
const snapshotFixture = (): FinanceSnapshot => ({
  workspaceId: 'workspace',
  memberId: MEMBER_ID,
  userWorkspaceId: 'user-workspace',
  month: '2026-10',
  currency: null,
  canManage: true,
  period: financePeriodStateFixture('2026-10'),
  plans: [],
  entries: [entryFixture()],
  selectedPlan: null,
  selectedEntry: null,
  planTotal: 0,
  entryTotal: 1,
  nextPlanId: null,
  nextEntryId: null,
  summaries: [],
  projects: [{ id: PROJECT_ID, name: 'Client Alpha' }],
  members: [{ id: MEMBER_ID, name: 'Active editor' }],
});
const workspace: DeliveryWorkspace = {
  actor: { memberId: MEMBER_ID, isAdmin: true, isManager: true },
  projects: [],
  members: [],
  companies: [],
  tasks: [],
};
const setup = (additionalParams = `&financeEntry=${ENTRY_ID}`) => {
  let refresh: () => void = () => undefined;
  const Page = () => {
    const [, setVersion] = useState(0);
    refresh = () => setVersion((value) => value + 1);
    return (
      <DeliveryFinance
        workspace={workspace}
        onChanged={mockChanged}
        onOpenTask={jest.fn()}
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
        `/delivery?view=finance&financeView=monthly&financeMonth=2026-10${additionalParams}`,
      ],
    },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return {
    router,
    update: () => {
      mockQueryCache.clear();
      mockPeriodCache.clear();
      act(refresh);
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
  mockSnapshot = snapshotFixture();
  mockPeriodSnapshot = {
    ...financePeriodSnapshotFixture(),
    memberId: MEMBER_ID,
    userWorkspaceId: 'user-workspace',
  };
  mockPeriodCache.clear();
  mockAiSnapshot = {
    ...financeAiCostSnapshotFixture(),
    memberId: MEMBER_ID,
    userWorkspaceId: 'user-workspace',
    filter: 'ALL',
  };
  mockQueryCache.clear();
  mockQueryError = undefined;
  mockCanReadFinance = true;
  mockCanManageFinance = true;
  mockAccessReady = true;
  mockRefetch.mockReset().mockResolvedValue({});
  mockChanged.mockReset().mockResolvedValue(undefined);
  mockMutation
    .mockReset()
    .mockImplementation(
      async (operation: string, options: MutationOptions) => ({
        data: {
          [operation[0].toLowerCase() + operation.slice(1)]:
            options.variables.input.id ?? ENTRY_ID,
        },
      }),
    );
});

it('requires finance read access before showing sources or management actions', () => {
  mockCanReadFinance = false;
  setup();
  expect(
    screen.getByText('Finance access is required to view monthly results.'),
  ).toBeVisible();
  expect(screen.queryByText('October editor pay')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Add monthly entry' }),
  ).not.toBeInTheDocument();
});

const configureAiRecognition = (replacement = false) => {
  const entry = {
    ...financeAiCostEntryFixture(),
    id: ENTRY_ID,
    month: '2026-10',
  };
  const source = financeAiCostSourceFixture();
  const reference = {
    id: ENTRY_ID,
    revision: entry.revision,
    status: 'DRAFT',
    month: entry.month,
    amountMicros: entry.amountMicros,
    matchedMicros: '0',
    activeMatchCount: 0,
  };
  source.claim = {
    revision: 2,
    currentEntry: reference,
    replacementEntry: null,
  };
  if (replacement) {
    entry.sourceAiSpend = {
      ...entry.sourceAiSpend!,
      replacesEntryId: AI_PRIOR_ENTRY_ID,
      correctionReason: 'Reviewed service-month correction',
    };
    source.claim = {
      revision: 4,
      currentEntry: {
        ...reference,
        id: AI_PRIOR_ENTRY_ID,
        revision: 3,
        status: 'POSTED',
        month: '2026-09',
        matchedMicros: '5000000',
        activeMatchCount: 1,
      },
      replacementEntry: reference,
    };
  }
  mockSnapshot.entries = [entry];
  mockAiSnapshot.selectedSource = source;
};

it('keeps an opened AI correction review through parent access loss and posts only through the dedicated AI action', async () => {
  configureAiRecognition(true);
  const page = setup();
  const acknowledgement = screen.getByRole('checkbox', {
    name: /I acknowledge replacing the prior recognized cost/,
  });
  await userEvent.click(acknowledgement);
  mockAccessReady = false;
  mockCanReadFinance = false;
  mockCanManageFinance = false;
  page.update();
  expect(
    screen.getByLabelText(/I acknowledge replacing the prior recognized cost/),
  ).toBe(acknowledgement);
  expect(acknowledgement).toBeChecked();
  expect(acknowledgement).not.toBeVisible();
  mockAccessReady = true;
  mockCanReadFinance = true;
  page.update();
  expect(
    screen.getByRole('checkbox', {
      name: /I acknowledge replacing the prior recognized cost/,
    }),
  ).toBe(acknowledgement);
  expect(acknowledgement).toBeChecked();
  expect(
    screen.getByRole('button', { name: 'Post reviewed AI cost' }),
  ).toBeDisabled();
  mockCanManageFinance = true;
  page.update();
  mockMutation.mockResolvedValueOnce({
    data: {
      postDeliveryFinanceAiCost: {
        entryId: ENTRY_ID,
        status: 'POSTED',
        replayed: false,
      },
    },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Post reviewed AI cost' }),
  );
  await waitFor(() => expect(mockMutation).toHaveBeenCalledTimes(1));
  expect(mockMutation).toHaveBeenCalledWith('PostDeliveryFinanceAiCost', {
    variables: {
      input: {
        id: ENTRY_ID,
        revision: 1,
        expectedClaimRevision: 4,
        expectedSourceReviewToken: 'a'.repeat(64),
        acknowledgeSourceWarnings: false,
        acknowledgeReplacement: true,
      },
    },
  });
  expect(
    await screen.findByText(
      'Correction posted. The prior entry was voided and its monthly payment matches were reversed. Cash and AI spending remain unchanged.',
    ),
  ).toBeVisible();
});

it.each([false, true])(
  'reports an initial AI post with replay=%s without implying a replacement',
  async (replayed) => {
    configureAiRecognition();
    setup();
    mockMutation.mockResolvedValueOnce({
      data: {
        postDeliveryFinanceAiCost: {
          entryId: ENTRY_ID,
          status: 'POSTED',
          replayed,
        },
      },
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Post reviewed AI cost' }),
    );
    expect(
      await screen.findByText(
        replayed
          ? 'This AI cost is already posted. Cash and AI spending remain unchanged.'
          : 'AI cost posted. Cash and AI spending remain unchanged.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Correction posted\./)).not.toBeInTheDocument();
  },
);

it('does not open AI posting controls for a finance reader who never had edit access', () => {
  configureAiRecognition();
  mockCanManageFinance = false;
  mockSnapshot.canManage = false;
  setup();
  expect(
    screen.getByRole('region', { name: 'Saved AI-cost source' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Post reviewed AI cost' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Edit monthly draft' }),
  ).not.toBeInTheDocument();
});

it('lets a finance reader inspect a source without write actions', () => {
  mockCanManageFinance = false;
  setup();
  expect(
    screen.getByRole('heading', { name: 'October editor pay' }),
  ).toBeVisible();
  expect(screen.getByText('Saved cost-plan source')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Review current cost plan' }),
  ).toHaveAttribute('href', expect.stringContaining(`financePlan=${PLAN_ID}`));
  for (const name of [
    'Add monthly entry',
    'Edit monthly draft',
    'Post reviewed entry',
    'Void entry and retain history',
  ])
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(screen.queryByText('Void this entry')).not.toBeInTheDocument();
});

it('preserves the actual editor draft through a query error and recovery', async () => {
  const page = setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit monthly draft' }),
  );
  const title = screen.getByRole('textbox', { name: 'Entry title' });
  await userEvent.clear(title);
  await userEvent.type(title, 'Reviewed October editor pay');
  mockQueryError = new Error('Connection unavailable');
  page.update();
  expect(
    screen.getByText(
      /Monthly finance could not be checked\. Drafts are preserved/,
    ),
  ).toBeVisible();
  expect(screen.getByLabelText('Entry title')).toHaveValue(
    'Reviewed October editor pay',
  );
  expect(screen.getByLabelText('Entry title')).not.toBeVisible();
  mockQueryError = undefined;
  page.update();
  expect(screen.getByRole('textbox', { name: 'Entry title' })).toHaveValue(
    'Reviewed October editor pay',
  );
  expect(mockMutation).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  );
  await waitFor(() =>
    expect(mockMutation).toHaveBeenCalledWith('SaveDeliveryFinanceEntry', {
      variables: {
        input: expect.objectContaining({
          id: ENTRY_ID,
          revision: 3,
          title: 'Reviewed October editor pay',
          amountMicros: '1000000000',
        }),
      },
    }),
  );
});

it('protects an unsaved monthly draft when opening Payments and matching', async () => {
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit monthly draft' }),
  );
  const title = screen.getByRole('textbox', { name: 'Entry title' });
  await userEvent.clear(title);
  await userEvent.type(title, 'Keep this finance review');
  await userEvent.click(
    screen.getByRole('link', { name: 'Payments and matching' }),
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox', { name: 'Entry title' })).toHaveValue(
    'Keep this finance review',
  );
  expect(mockMutation).not.toHaveBeenCalled();
});

it('keeps a monthly draft hidden through an unverified access outage and restores it after a fresh check', async () => {
  const page = setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit monthly draft' }),
  );
  const title = screen.getByRole('textbox', { name: 'Entry title' });
  await userEvent.clear(title);
  await userEvent.type(title, 'Retained through access outage');
  mockAccessReady = false;
  mockCanReadFinance = false;
  mockCanManageFinance = false;
  page.update();
  expect(screen.getByLabelText('Entry title')).toBe(title);
  expect(title).toHaveValue('Retained through access outage');
  expect(title).not.toBeVisible();
  expect(title).toBeDisabled();
  expect(
    screen.queryByRole('heading', { name: 'October editor pay' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry finance access' }),
  );
  expect(mockRefetch).toHaveBeenCalled();
  mockAccessReady = true;
  mockCanReadFinance = true;
  mockCanManageFinance = true;
  page.update();
  expect(screen.getByRole('textbox', { name: 'Entry title' })).toBe(title);
  expect(title).toHaveValue('Retained through access outage');
  expect(mockMutation).not.toHaveBeenCalled();
});

it('discards a monthly draft after verified finance-read revocation', async () => {
  const page = setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit monthly draft' }),
  );
  const title = screen.getByRole('textbox', { name: 'Entry title' });
  await userEvent.clear(title);
  await userEvent.type(title, 'Must not cross a verified denial');
  mockCanReadFinance = false;
  page.update();
  expect(screen.queryByLabelText('Entry title')).not.toBeInTheDocument();
  expect(
    screen.getByText('Finance access is required to view monthly results.'),
  ).toBeVisible();
  mockCanReadFinance = true;
  page.update();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit monthly draft' }),
  );
  expect(screen.getByRole('textbox', { name: 'Entry title' })).toHaveValue(
    'October editor pay',
  );
  expect(mockMutation).not.toHaveBeenCalled();
});

it('requires a fresh source review when a plan changes after acknowledgement', async () => {
  mockSnapshot.entries[0].sourceWarnings = ['SOURCE_PLAN_CHANGED'];
  const page = setup();
  await userEvent.click(
    screen.getByRole('checkbox', { name: SOURCE_ACKNOWLEDGEMENT }),
  );
  mockSnapshot = {
    ...mockSnapshot,
    entries: [
      {
        ...mockSnapshot.entries[0],
        sourceReviewToken: 'b'.repeat(64),
        sourceWarnings: ['SOURCE_PLAN_CHANGED', 'SOURCE_MEMBER_INACTIVE'],
      },
    ],
  };
  page.update();
  expect(
    screen.getByText(/This record changed while you were editing/),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Post reviewed entry' }),
  ).toBeDisabled();
  expect(mockMutation).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  const acknowledgement = screen.getByRole('checkbox', {
    name: SOURCE_ACKNOWLEDGEMENT,
  });
  expect(acknowledgement).not.toBeChecked();
  await userEvent.click(acknowledgement);
  await userEvent.click(
    screen.getByRole('button', { name: 'Post reviewed entry' }),
  );
  await waitFor(() =>
    expect(mockMutation).toHaveBeenCalledWith('PostDeliveryFinanceEntry', {
      variables: {
        input: {
          id: ENTRY_ID,
          revision: 3,
          acknowledgeSourceWarnings: true,
          expectedSourceReviewToken: 'b'.repeat(64),
        },
      },
    }),
  );
});

it('discards a prior void reason before targeting a different selected entry', async () => {
  mockSnapshot.entries.push({
    ...entryFixture(),
    id: SECOND_ENTRY_ID,
    title: 'October overhead',
  });
  mockSnapshot.entryTotal = 2;
  setup();
  await userEvent.click(screen.getByText('Void this entry'));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for voiding' }),
    'Reason intended for the first entry',
  );
  await userEvent.click(
    screen.getAllByRole('link', { name: 'Review entry' })[1],
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    screen.getByRole('heading', { name: 'October overhead' }),
  ).toBeVisible();
  await userEvent.click(screen.getByText('Void this entry'));
  const reason = screen.getByRole('textbox', { name: 'Reason for voiding' });
  expect(reason).toHaveValue('');
  await userEvent.type(reason, 'Superseded overhead estimate');
  await userEvent.click(
    screen.getByRole('button', { name: 'Void entry and retain history' }),
  );
  await waitFor(() =>
    expect(mockMutation).toHaveBeenCalledWith('VoidDeliveryFinanceEntry', {
      variables: {
        input: {
          id: SECOND_ENTRY_ID,
          revision: 3,
          reason: 'Superseded overhead estimate',
        },
      },
    }),
  );
});

it('retains an editor draft read-only when edit access is revoked', async () => {
  const page = setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit monthly draft' }),
  );
  const title = screen.getByRole('textbox', { name: 'Entry title' });
  await userEvent.clear(title);
  await userEvent.type(title, 'Unsaved salary explanation');
  mockCanManageFinance = false;
  mockSnapshot = { ...mockSnapshot, canManage: false };
  page.update();
  expect(screen.getByText(/Your edit permission changed/)).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Entry title' })).toHaveValue(
    'Unsaved salary explanation',
  );
  expect(screen.getByRole('textbox', { name: 'Entry title' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Save monthly draft' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('offers the real month and currency for a source outside the current results', () => {
  mockSnapshot.currency = 'USD';
  mockSnapshot.selectedEntry = {
    ...entryFixture(),
    month: '2026-09',
    currency: 'AED',
  };
  mockSnapshot.entries = [];
  mockSnapshot.entryTotal = 0;
  setup(
    `&financeCurrency=USD&financeEntry=${ENTRY_ID}&financeEntriesAfter=older-entry&financePlansAfter=older-plan`,
  );
  expect(
    screen.getByText('This source is outside the selected month or currency.'),
  ).toBeVisible();
  const link = screen.getByRole('link', {
    name: 'Open its month and currency',
  });
  const destination = new URL(
    link.getAttribute('href') ?? '',
    'http://localhost',
  );
  expect(destination.searchParams.get('financeMonth')).toBe('2026-09');
  expect(destination.searchParams.get('financeCurrency')).toBe('AED');
  expect(destination.searchParams.get('financeEntry')).toBe(ENTRY_ID);
  expect(destination.searchParams.has('financeEntriesAfter')).toBe(false);
  expect(destination.searchParams.has('financePlansAfter')).toBe(false);
});

it.each(['POSTED', 'VOID'] as const)(
  'opens payment history for a %s monthly entry with its actual currency and source',
  (status) => {
    mockSnapshot.entries[0].status = status;
    setup();
    const destination = new URL(
      screen
        .getByRole('link', { name: 'Review payments matched to this entry' })
        .getAttribute('href') ?? '',
      'http://localhost',
    );
    expect(destination.searchParams.get('financeView')).toBe('payments');
    expect(destination.searchParams.get('financeMatchEntry')).toBe(ENTRY_ID);
    expect(destination.searchParams.get('financeCurrency')).toBe('USD');
    expect(destination.searchParams.get('financeList')).toBe('cash');
    expect(destination.searchParams.has('financeCash')).toBe(false);
    expect(destination.searchParams.has('financeReceivable')).toBe(false);
  },
);

it('does not offer cash matching for an unposted monthly draft', () => {
  setup();
  expect(
    screen.queryByRole('link', {
      name: 'Review payments matched to this entry',
    }),
  ).not.toBeInTheDocument();
});

it('blocks recognition changes for locked months while payment history stays available', async () => {
  mockSnapshot.period = financePeriodLockedFixture();
  mockSnapshot.entries[0] = {
    ...mockSnapshot.entries[0],
    status: 'POSTED',
    lockedMonths: ['2026-10', '2026-09'],
  };
  setup();
  expect(
    screen.getByRole('button', { name: 'Add monthly entry' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Prepare this month’s cost drafts' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('link', { name: 'Review reopening 2026-09' }),
  ).toHaveAttribute('href', expect.stringContaining('financeMonth=2026-09'));
  expect(
    screen.getByRole('link', { name: 'Review payments matched to this entry' }),
  ).toBeVisible();
  await userEvent.click(screen.getByText('Void this entry'));
  expect(
    screen.getByRole('textbox', { name: 'Reason for voiding' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Void entry and retain history' }),
  ).toBeDisabled();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('guards reciprocal transitions between a monthly entry draft and a reasoned month review', async () => {
  mockRefetch.mockImplementation(async () => ({
    data: { deliveryFinancePeriod: mockPeriodQuery({ month: '2026-10' }) },
  }));
  setup('');
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and lock month' }),
  );
  await userEvent.type(
    await screen.findByRole('textbox', { name: 'Reason for locking' }),
    'Keep this month review.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Add monthly entry' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    screen.getByRole('textbox', { name: 'Reason for locking' }),
  ).toHaveValue('Keep this month review.');
  expect(
    screen.queryByRole('textbox', { name: 'Entry title' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Add monthly entry' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Entry title' }),
    'Unsaved client cost',
  );
  expect(
    screen.queryByRole('textbox', { name: 'Reason for locking' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and lock month' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    await screen.findByRole('textbox', { name: 'Reason for locking' }),
  ).toHaveValue('');
  expect(
    screen.queryByRole('textbox', { name: 'Entry title' }),
  ).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('resets the month review after a saved status change when the selected month changes', async () => {
  mockRefetch.mockImplementation(async () => ({
    data: {
      deliveryFinancePeriod: mockPeriodQuery({ month: mockSnapshot.month }),
    },
  }));
  mockMutation.mockResolvedValue({
    data: {
      changeDeliveryFinancePeriod: {
        period: financePeriodLockedFixture(),
        replayed: false,
      },
    },
  });
  const page = setup('');
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and lock month' }),
  );
  await userEvent.type(
    await screen.findByRole('textbox', { name: 'Reason for locking' }),
    'October reviewed.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  );
  await screen.findByText(
    'Monthly results locked. Actual payments and evidence remain available.',
  );
  mockSnapshot = {
    ...mockSnapshot,
    month: '2026-11',
    period: financePeriodStateFixture('2026-11'),
  };
  mockPeriodSnapshot = {
    ...mockPeriodSnapshot,
    period: financePeriodStateFixture('2026-11'),
  };
  page.update();
  await act(async () => {
    await page.router.navigate(
      '/delivery?view=finance&financeView=monthly&financeMonth=2026-11',
    );
  });
  expect(
    screen.getByText('Monthly result status', { exact: false }),
  ).toHaveTextContent('2026-11');
  expect(
    screen.getByRole('button', { name: 'Review and lock month' }),
  ).toBeEnabled();
  expect(
    screen.queryByText(
      'Monthly results locked. Actual payments and evidence remain available.',
    ),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Review and lock month' }),
  );
  expect(
    await screen.findByRole('textbox', { name: 'Reason for locking' }),
  ).toHaveValue('');
});
