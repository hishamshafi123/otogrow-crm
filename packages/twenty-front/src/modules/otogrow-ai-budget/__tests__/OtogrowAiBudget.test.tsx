import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { OtogrowAiBudget } from '@/otogrow-ai-budget/OtogrowAiBudget';
import { type AiBudgetSnapshot } from '@/otogrow-ai-budget/aiBudget.types';
import { type OtogrowAiBudgetSnapshotInput } from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryStack: 'div',
  StyledDeliveryBadge: 'span',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
}));
jest.mock('@/otogrow-ai-budget/aiBudgetStyles', () => ({
  StyledAiBudgetActions: 'div',
  StyledAiBudgetList: 'ul',
  StyledAiBudgetMetrics: 'dl',
}));
jest.mock('@/otogrow-ai-budget/AiSpendHistory', () => ({
  AiSpendHistory: () => <div>Charge history</div>,
}));
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
let mockSnapshot: AiBudgetSnapshot;
let mockError: Error | undefined;
let mockPermission = {
  scopeKey: 'workspace:admin:membership',
  canManageRoles: true,
  loading: false,
  error: undefined as Error | undefined,
  access: {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
  },
};
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({ ...mockPermission, refetch: mockRefetch }),
}));
const mockQuery = jest.fn(
  (
    _query: unknown,
    _options: {
      variables: { input: OtogrowAiBudgetSnapshotInput };
      fetchPolicy: string;
      skip: boolean;
    },
  ) => ({
    data: { otogrowAiBudgetSnapshot: mockSnapshot },
    error: mockError,
    loading: false,
    refetch: mockRefetch,
  }),
);
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: Parameters<typeof mockQuery>) => mockQuery(...args),
  useMutation: () => [mockMutate, { loading: false }],
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  tasks: [],
  projects: [],
  companies: [],
  members: [],
};
const Harness = () => {
  const [, refresh] = useState(0);
  return (
    <>
      <button onClick={() => refresh((value) => value + 1)}>
        Refresh test state
      </button>
      <OtogrowAiBudget workspace={workspace} />
    </>
  );
};
const setup = (search = '') => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness />
          </DeliveryDraftGuardProvider>
        ),
      },
    ],
    { initialEntries: [`/delivery?view=agents&agentView=spending${search}`] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return { user: userEvent.setup(), router };
};
beforeAll(() => {
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockMutate.mockReset().mockResolvedValue({ data: {} });
  mockRefetch.mockReset().mockResolvedValue({});
  mockQuery.mockClear();
  mockError = undefined;
  mockPermission = {
    scopeKey: 'workspace:admin:membership',
    canManageRoles: true,
    loading: false,
    error: undefined,
    access: {
      workspaceId: 'workspace',
      memberId: 'admin',
      userWorkspaceId: 'membership',
    },
  };
  mockSnapshot = {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
    configured: false,
    chargedUsd: '0',
    heldUsd: '0',
    unresolvedCount: 0,
    coverageStartedAt: null,
    budgets: [],
    priceProfiles: [],
    recentSpend: [],
    clients: [{ id: 'client', name: 'Brand' }],
    tasks: [],
    nextCursor: null,
  };
});
const existingLimit = () => {
  mockSnapshot.configured = true;
  mockSnapshot.budgets = [
    {
      id: 'limit',
      scope: 'WORKSPACE',
      scopeId: 'workspace',
      scopeName: 'Workspace',
      revision: 2,
      enabled: false,
      capUsd: '2',
      openingSpentUsd: '0.25',
      chargedUsd: '0.5',
      heldUsd: '0.1',
      remainingUsd: '1.4',
    },
  ];
};
const uncertainSpend = () => {
  mockSnapshot.unresolvedCount = 1;
  mockSnapshot.recentSpend = [
    {
      id: 'spend',
      sourceKind: 'TASK_AGENT',
      sourceRunId: 'run',
      state: 'UNCERTAIN',
      revision: 3,
      kind: 'TEXT',
      modelId: 'test-model',
      clientName: 'Brand',
      taskName: 'Review creative',
      reservedUsd: '0.4',
      actualUsd: null,
      reportedActualUsd: null,
      heldUsd: '0.4',
      boundSource: 'MODEL_CONTEXT',
      priceSource: 'Provider pricing evidence',
      priceRevision: 2,
      priceVerifiedAt: '2026-10-20T00:00:00.000Z',
      createdAt: '2026-10-25T00:00:00.000Z',
      dispatchedAt: '2026-10-25T00:00:01.000Z',
      settledAt: null,
      attentionReason: 'Provider usage unavailable',
    },
  ];
};

it('shows unconfigured boundaries and never supplies funding or assumed historical spend', async () => {
  const { user } = setup();
  expect(screen.getByText('Workspace limit needed')).toBeVisible();
  expect(screen.getByText(/Native CRM text requests/)).toBeVisible();
  expect(mockQuery.mock.calls.at(-1)?.[1].fetchPolicy).toBe('no-cache');
  await user.click(screen.getByRole('button', { name: 'Add limit' }));
  expect(screen.getByLabelText('Total limit (USD)')).toHaveValue('');
  expect(screen.getByLabelText(/Previously spent/)).toHaveValue('');
  expect(
    screen.getByLabelText('Allow paid requests within this limit'),
  ).not.toBeChecked();
  expect(mockMutate).not.toHaveBeenCalled();
});

it('identifies a native CRM request and retains its unresolved charge', async () => {
  uncertainSpend();
  mockSnapshot.recentSpend[0].sourceKind = 'NATIVE_CRM';
  mockSnapshot.recentSpend[0].clientName = null;
  mockSnapshot.recentSpend[0].taskName = null;
  const { user } = setup();
  await user.click(screen.getByRole('button', { name: 'Usage & charges' }));
  await user.click(screen.getByText('Request and pricing evidence'));
  expect(screen.getByText(/Native CRM AI/)).toBeVisible();
  expect(screen.getByText(/Confirmed charge unavailable/)).toHaveTextContent(
    'Held USD 0.4',
  );
  expect(screen.getByRole('button', { name: 'Resolve charge' })).toBeVisible();
  expect(mockMutate).not.toHaveBeenCalled();
});

it.each(['permission', 'identity', 'query error'])(
  'hides financial details after %s changes',
  async (mode) => {
    existingLimit();
    const { user } = setup();
    expect(
      screen.getByRole('button', { name: 'Edit limit for Workspace' }),
    ).toBeVisible();
    if (mode === 'permission') mockPermission.canManageRoles = false;
    else if (mode === 'identity')
      mockSnapshot = { ...mockSnapshot, memberId: 'other' };
    else mockError = new Error('Access revoked');
    await user.click(
      screen.getByRole('button', { name: 'Refresh test state' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Edit limit for Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Opening balance: USD/)).not.toBeInTheDocument();
  },
);

it('sends exact decimal strings and explicit verified opening balance without a funding default', async () => {
  const { user } = setup();
  await user.click(screen.getByRole('button', { name: 'Add limit' }));
  await user.type(screen.getByLabelText('Total limit (USD)'), '1.234567');
  await user.type(screen.getByLabelText(/Previously spent/), '0.000001');
  await user.click(
    screen.getByLabelText('I verified the opening amount for this scope.'),
  );
  await user.click(screen.getByRole('button', { name: 'Save limit' }));
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: {
        scope: 'WORKSPACE',
        scopeId: 'workspace',
        capUsd: '1.234567',
        openingSpentUsd: '0.000001',
        enabled: false,
        confirmOpeningBalance: true,
        revision: 0,
      },
    },
  });
  expect(
    screen.queryByRole('form', { name: 'Add AI limit' }),
  ).not.toBeInTheDocument();
});

it('protects switching views and Cancel, and allows a reverted draft to close', async () => {
  const { user, router } = setup();
  await user.click(screen.getByRole('button', { name: 'Add limit' }));
  await user.type(screen.getByLabelText('Total limit (USD)'), '2');
  await user.click(screen.getByRole('button', { name: 'Model pricing' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(router.state.location.search).not.toContain('spendingView=prices');
  expect(screen.getByLabelText('Total limit (USD)')).toHaveValue('2');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await user.clear(screen.getByLabelText('Total limit (USD)'));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Total limit (USD)')).not.toBeInTheDocument();
});

it('keeps failed writes and stale drafts, requiring explicit reload of a new revision', async () => {
  existingLimit();
  const { user } = setup();
  await user.click(
    screen.getByRole('button', { name: 'Edit limit for Workspace' }),
  );
  expect(screen.queryByLabelText(/Previously spent/)).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('Total limit (USD)'));
  await user.type(screen.getByLabelText('Total limit (USD)'), '1.5');
  mockMutate.mockRejectedValueOnce(new Error('Limit changed on the server'));
  await user.click(screen.getByRole('button', { name: 'Save limit' }));
  expect(screen.getByText('Limit changed on the server')).toBeVisible();
  expect(screen.getByLabelText('Total limit (USD)')).toHaveValue('1.5');
  mockSnapshot = {
    ...mockSnapshot,
    budgets: [{ ...mockSnapshot.budgets[0], capUsd: '3', revision: 3 }],
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(screen.getByRole('button', { name: 'Save limit' })).toBeDisabled();
  expect(screen.getByLabelText('Total limit (USD)')).toHaveValue('1.5');
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Total limit (USD)')).toHaveValue('3');
});

it('treats a successful save followed by refresh failure as saved', async () => {
  existingLimit();
  const { user } = setup();
  await user.click(
    screen.getByRole('button', { name: 'Edit limit for Workspace' }),
  );
  mockRefetch.mockRejectedValueOnce(new Error('Offline'));
  await user.click(screen.getByRole('button', { name: 'Save limit' }));
  expect(
    screen.getByText(/Saved, but the latest view could not load/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Save limit' }),
  ).not.toBeInTheDocument();
  expect(mockMutate).toHaveBeenCalledTimes(1);
});

it('distinguishes uncertain and in-flight requests and requires evidence to reconcile', async () => {
  uncertainSpend();
  mockSnapshot.recentSpend.push({
    ...mockSnapshot.recentSpend[0],
    id: 'processing',
    state: 'DISPATCHED',
    sourceRunId: 'processing-run',
    taskName: 'Still processing',
  });
  const { user } = setup('&spendingView=history');
  expect(
    screen.getAllByRole('button', { name: 'Resolve charge' }),
  ).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Resolve charge' }));
  const form = screen.getByRole('form', { name: 'Resolve uncertain charge' });
  expect(
    within(form).getByLabelText('Provider evidence reference'),
  ).toBeRequired();
  await user.type(
    within(form).getByLabelText('Confirmed charge (USD)'),
    '0.08',
  );
  await user.type(
    within(form).getByLabelText('Provider evidence reference'),
    'Provider receipt R-123',
  );
  await user.type(
    within(form).getByLabelText('Reason for reconciliation'),
    'Usage confirmed from the invoice.',
  );
  await user.click(
    within(form).getByRole('button', { name: 'Record confirmed charge' }),
  );
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: {
        spendId: 'spend',
        revision: 3,
        actualUsd: '0.08',
        evidenceReference: 'Provider receipt R-123',
        reason: 'Usage confirmed from the invoice.',
      },
    },
  });
});

it('resets the cursor when filtering uncertain charges and preserves the URL', async () => {
  uncertainSpend();
  mockSnapshot.nextCursor = 'older';
  const { user, router } = setup('&spendingView=history&spendingCursor=old');
  await user.click(screen.getByLabelText('Needs attention only'));
  expect(router.state.location.search).toContain('spendingAttention=true');
  expect(router.state.location.search).not.toContain('spendingCursor');
  expect(mockQuery.mock.calls.at(-1)?.[1].variables.input).toEqual({
    cursor: undefined,
    limit: 20,
    needsAttention: true,
  });
  await user.click(screen.getByRole('button', { name: 'Older requests' }));
  expect(router.state.location.search).toContain('spendingCursor=older');
});

it('offers verified inspection pricing without enabling it by default or guessing prices', async () => {
  const { user } = setup('&spendingView=prices');
  await user.click(screen.getByRole('button', { name: 'Add pricing' }));
  const form = screen.getByRole('form', { name: 'Model pricing' });
  expect(within(form).getByLabelText('Input')).toHaveValue('');
  expect(within(form).getByLabelText(/Pricing evidence/)).toHaveValue('');
  expect(
    within(form).getByLabelText('Use this verified pricing for new requests'),
  ).not.toBeChecked();
  expect(
    within(form)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual([
    'Text assistance',
    'Image inspection',
    'Video and audio inspection',
  ]);
  expect(
    within(form).queryByRole('option', { name: 'Video generation' }),
  ).not.toBeInTheDocument();
  await user.type(within(form).getByLabelText(/Model ID/), 'test-model');
  await user.click(within(form).getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(within(form).getByLabelText(/Model ID/)).toHaveValue('test-model');
  expect(mockMutate).not.toHaveBeenCalled();
});
