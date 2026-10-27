jest.mock('@/delivery/readiness/DeliveryReadiness', () => ({
  DeliveryReadiness: () => <section aria-label="Capability readiness" />,
}));
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
jest.mock('@/delivery/revisions/DeliveryRevisionCosts', () => ({
  DeliveryRevisionCosts: () => null,
}));
import { DeliveryBusiness } from '@/delivery/DeliveryBusiness';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { type BusinessSnapshot } from '@/delivery/delivery-business.types';
import { GET_OTOGROW_ROLE_DIRECTORY } from '@/otogrow-access/otogrow-access.graphql';
import { type OtogrowRoleDirectory } from '@/otogrow-access/otogrow-access.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryBadge: 'span',
}));
const mockMutate = jest.fn().mockResolvedValue({});
const mockRefetch = jest.fn().mockResolvedValue({});
let mockData: BusinessSnapshot;
let mockQueryError: Error | undefined;
let mockDirectory: OtogrowRoleDirectory | undefined;
let mockDirectoryError: Error | undefined;
let mockPermission = {
  ready: true,
  canReadFinance: true,
  canManageFinance: true,
};
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ...mockPermission,
    scope: 'workspace:member',
    refetch: mockRefetch,
    matches: (data: BusinessSnapshot | undefined) =>
      mockPermission.ready && data?.workspaceId === 'workspace',
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate, { loading: false }],
  useQuery: (query: unknown) =>
    query === GET_OTOGROW_ROLE_DIRECTORY
      ? {
          data: { otogrowRoleDirectory: mockDirectory },
          error: mockDirectoryError,
          refetch: mockRefetch,
        }
      : {
          data: { deliveryBusiness: mockData, deliveryAgents: { agents: [] } },
          refetch: mockRefetch,
          error: mockQueryError,
        },
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  projects: [],
  tasks: [],
  members: [],
  companies: [],
};
const setup = (view: string, value = workspace) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <DeliveryBusiness
        workspace={value}
        view={view}
        onChanged={mockRefetch}
        onOpenTask={jest.fn()}
      />
    </I18nProvider>,
    { wrapper: MemoryRouter },
  );
};
beforeEach(() => {
  mockMutate.mockClear();
  mockQueryError = undefined;
  mockDirectory = undefined;
  mockDirectoryError = undefined;
  mockPermission = {
    ready: true,
    canReadFinance: true,
    canManageFinance: true,
  };
  mockData = {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
    financeAccess: { read: true, manage: true },
    financeProjects: [],
    conversationAccess: {},
    records: [],
    inbox: [],
    seen: {},
    finance: [],
    connections: [],
  };
});
it('preserves currency and decimal cents when entering a receipt', async () => {
  setup('finance');
  await userEvent.click(
    screen.getByRole('button', { name: 'New Financial entry' }),
  );
  await userEvent.type(screen.getByLabelText('Title'), 'Receipt');
  await userEvent.selectOptions(screen.getByLabelText('Currency'), 'AED');
  await userEvent.selectOptions(
    screen.getByLabelText('Entry category *'),
    'INCOME',
  );
  await userEvent.type(screen.getByLabelText('Amount *'), '12.34');
  await userEvent.type(
    screen.getByLabelText('Transaction date *'),
    '2026-10-24',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save record' }));
  await waitFor(() => expect(mockMutate).toHaveBeenCalled());
  expect(mockMutate.mock.calls[0][0].variables.input.record).toMatchObject({
    kind: 'FINANCE',
    category: 'INCOME',
    currency: 'AED',
    amount: 1234,
    projectId: null,
  });
});

it('shows plain-language cash categories while preserving their stored values', async () => {
  setup('finance');
  await userEvent.click(
    screen.getByRole('button', { name: 'New Financial entry' }),
  );
  const category = screen.getByRole('combobox', { name: 'Entry category *' });
  for (const [label, value] of [
    ['Opening cash balance', 'OPENING_BALANCE'],
    ['Money received', 'INCOME'],
    ['Expense paid', 'EXPENSE'],
    ['Salary paid', 'SALARY'],
    ['Receivable / expected payment', 'RECEIVABLE'],
  ]) {
    const option = screen.getByRole('option', { name: label });
    expect(option).toHaveValue(value);
    await userEvent.selectOptions(category, label);
    expect(category).toHaveValue(value);
  }
  expect(
    screen.queryByRole('option', { name: 'OPENING_BALANCE' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'RECEIVABLE' }),
  ).not.toBeInTheDocument();
  expect(mockMutate).not.toHaveBeenCalled();
});
it('does not show financial editing or exports to an employee', () => {
  mockPermission.canReadFinance = false;
  mockPermission.canManageFinance = false;
  setup('finance', {
    ...workspace,
    actor: { memberId: 'employee', isAdmin: false, isManager: false },
  });
  expect(
    screen.queryByRole('button', { name: 'Export CSV' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'New Financial entry' }),
  ).not.toBeInTheDocument();
});
it('shows a read-only conversation without draft or model execution controls', async () => {
  mockData.records = [
    {
      id: 'conversation',
      revision: 1,
      kind: 'CONVERSATION',
      projectId: null,
      title: 'Client conversation',
      status: 'OPEN',
      createdBy: 'admin',
      taskId: null,
      history: [],
      private: false,
      ownerId: 'admin',
      grants: [{ memberId: 'employee', read: true, send: false }],
    },
  ];
  setup('inbox', {
    ...workspace,
    actor: { memberId: 'employee', isAdmin: false, isManager: false },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
  expect(screen.getByText('Open')).toBeVisible();
  expect(screen.queryByText('Awaiting payment')).not.toBeInTheDocument();
  expect(
    screen.getByText('You have view-only access to this conversation.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save inside OS' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Generate unsent reply draft' }),
  ).not.toBeInTheDocument();
});
it('does not offer self-approval of a release', async () => {
  mockData.records = [
    {
      id: 'release',
      revision: 2,
      kind: 'RELEASE',
      projectId: null,
      title: 'Release',
      status: 'REVIEW',
      createdBy: 'admin',
      ownerId: 'admin',
      taskId: 'task',
      history: [],
    },
  ];
  setup('development');
  await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
  expect(
    screen.queryByRole('button', { name: 'Record decision' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Open assigned task' }),
  ).toBeInTheDocument();
});
it('uses the typed capability readiness view on the company overview', () => {
  mockData.connections = [{ channel: 'META', status: 'CONNECTED' }];
  setup('health');
  expect(
    screen.getByRole('region', { name: 'Capability readiness' }),
  ).toBeVisible();
  expect(screen.queryByText('Connected')).not.toBeInTheDocument();
});

it('lets a finance reader view and export without editing', async () => {
  mockPermission.canManageFinance = false;
  mockData.financeAccess.manage = false;
  mockData.records = [
    {
      id: 'invoice',
      revision: 1,
      kind: 'FINANCE',
      projectId: null,
      title: 'Unpaid invoice',
      status: 'OPEN',
      createdBy: 'admin',
      taskId: null,
      history: [],
      category: 'RECEIVABLE',
      amount: 200,
      currency: 'USD',
    },
  ];
  setup('finance', {
    ...workspace,
    actor: { memberId: 'reader', isAdmin: false, isManager: false },
  });
  expect(
    screen.getByRole('button', { name: 'Export CSV' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'New Financial entry' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
  expect(
    screen.queryByRole('button', { name: 'Confirm payment' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Void entry' }),
  ).not.toBeInTheDocument();
});
it('links a partially paid receivable to its payment balance and protects it from ordinary voiding', async () => {
  mockData.records = [
    {
      id: 'invoice',
      revision: 1,
      kind: 'FINANCE',
      projectId: null,
      title: 'October invoice',
      status: 'OPEN',
      createdBy: 'admin',
      taskId: null,
      history: [],
      category: 'RECEIVABLE',
      amount: 20000,
      currency: 'AED',
    },
  ];
  mockData.financeReceivableBalances = [
    {
      id: 'invoice',
      settledMicros: '50000000',
      outstandingMicros: '150000000',
      sourceWarnings: [],
    },
  ];
  setup('finance');
  expect(screen.getByText('Partially paid')).toBeVisible();
  expect(screen.getByText(/Payments applied/)).toHaveTextContent('150.00');
  await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
  const destination = new URL(
    screen
      .getByRole('link', { name: 'Review invoice payments' })
      .getAttribute('href') ?? '',
    'http://localhost',
  );
  expect(destination.searchParams.get('financeView')).toBe('payments');
  expect(destination.searchParams.get('financeReceivable')).toBe('invoice');
  expect(destination.searchParams.get('financeCurrency')).toBe('AED');
  expect(
    screen.queryByRole('option', { name: 'Confirm payment' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'Void entry' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(
      /Reverse the invoice link or void its linked payment receipt first/,
    ),
  ).toBeVisible();
  expect(mockMutate).not.toHaveBeenCalled();
});

it.each(['unavailable', 'warning', 'unpaid', 'paid'])(
  'uses the verified %s receivable balance for payment status and void controls',
  async (state) => {
    mockData.records = [
      {
        id: 'invoice',
        revision: 1,
        kind: 'FINANCE',
        projectId: null,
        title: 'October invoice',
        status: 'OPEN',
        createdBy: 'admin',
        taskId: null,
        history: [],
        category: 'RECEIVABLE',
        amount: 20000,
        currency: 'USD',
      },
    ];
    if (state !== 'unavailable')
      mockData.financeReceivableBalances = [
        {
          id: 'invoice',
          settledMicros: state === 'paid' ? '200000000' : '0',
          outstandingMicros: state === 'paid' ? '0' : '200000000',
          sourceWarnings:
            state === 'warning' ? ['LEGACY_PAID_WITHOUT_RECEIPT'] : [],
        },
      ];
    setup('finance');
    expect(
      screen.getByText(
        state === 'paid'
          ? 'Fully paid'
          : state === 'unpaid'
            ? 'Awaiting payment'
            : 'Payment status needs review',
      ),
    ).toBeVisible();
    if (state === 'unavailable')
      expect(screen.getByText(/payment balance is unavailable/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
    if (state === 'unpaid')
      expect(
        screen.getByRole('option', { name: 'Void entry' }),
      ).toBeInTheDocument();
    else
      expect(
        screen.queryByRole('option', { name: 'Void entry' }),
      ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Confirm payment' }),
    ).not.toBeInTheDocument();
  },
);

it.each(['INCOME', 'EXPENSE', 'SALARY'])(
  'links a recorded %s cash movement to matching without creating a payment',
  async (category) => {
    mockData.records = [
      {
        id: 'payment',
        revision: 1,
        kind: 'FINANCE',
        projectId: null,
        title: 'Recorded payment',
        status: 'POSTED',
        createdBy: 'admin',
        taskId: null,
        history: [],
        category,
        amount: 200,
        currency: 'USD',
      },
    ];
    setup('finance');
    await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
    const destination = new URL(
      screen
        .getByRole('link', { name: 'Review payment and matching' })
        .getAttribute('href') ?? '',
      'http://localhost',
    );
    expect(destination.searchParams.get('financeView')).toBe('payments');
    expect(destination.searchParams.get('financeCash')).toBe('payment');
    expect(destination.searchParams.get('financeCurrency')).toBe('USD');
    expect(mockMutate).not.toHaveBeenCalled();
  },
);
it('lets a finance editor allocate to a project without delivery management', async () => {
  mockData.financeProjects = [
    { id: 'finance-project', name: 'Accounting allocation project' },
  ];
  setup('finance', {
    ...workspace,
    actor: { memberId: 'accountant', isAdmin: false, isManager: false },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'New Financial entry' }),
  );
  expect(
    screen.getByRole('option', { name: 'Accounting allocation project' }),
  ).toBeInTheDocument();
});
it.each(['identity', 'access', 'error'])(
  'hides cached finance records after %s failure',
  (failure) => {
    mockData.records = [
      {
        id: 'secret',
        revision: 1,
        kind: 'FINANCE',
        projectId: null,
        title: 'Private salary allocation',
        status: 'POSTED',
        createdBy: 'admin',
        taskId: null,
        history: [],
      },
    ];
    if (failure === 'identity') mockData.workspaceId = 'other';
    if (failure === 'access') mockPermission.ready = false;
    if (failure === 'error') mockQueryError = new Error('Unavailable');
    setup('finance');
    expect(
      screen.queryByText('Private salary allocation'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export CSV' }),
    ).not.toBeInTheDocument();
  },
);

it('keeps an unsaved finance entry through a failed refresh while hiding stale records', async () => {
  const rendered = setup('finance');
  await userEvent.click(
    screen.getByRole('button', { name: 'New Financial entry' }),
  );
  await userEvent.type(screen.getByLabelText('Title'), 'Unsaved allocation');
  const page = () => (
    <I18nProvider i18n={i18n}>
      <DeliveryBusiness
        workspace={workspace}
        view="finance"
        onChanged={mockRefetch}
        onOpenTask={jest.fn()}
      />
    </I18nProvider>
  );
  mockQueryError = new Error('Network down');
  rendered.rerender(page());
  expect(screen.getByRole('alert')).toHaveTextContent('unsaved edits are kept');
  expect(
    screen.queryByRole('button', { name: 'Export CSV' }),
  ).not.toBeInTheDocument();
  mockQueryError = undefined;
  rendered.rerender(page());
  expect(screen.getByLabelText('Title')).toHaveValue('Unsaved allocation');
});

it('uses current server conversation permissions for reply controls and hides them after revocation', async () => {
  mockData.records = [
    {
      id: 'conversation',
      revision: 1,
      kind: 'CONVERSATION',
      projectId: null,
      title: 'Role-shared client inbox',
      status: 'OPEN',
      createdBy: 'admin',
      taskId: null,
      history: [],
      private: false,
      ownerId: 'admin',
      grants: [],
      roleGrants: [{ roleId: 'editor', read: true, send: true }],
    },
  ];
  mockData.conversationAccess = { conversation: { draft: true } };
  const value = {
    ...workspace,
    actor: { memberId: 'employee', isAdmin: false, isManager: false },
  };
  const rendered = setup('inbox', value);
  await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
  expect(screen.getByRole('button', { name: 'Save inside OS' })).toBeVisible();
  mockData = {
    ...mockData,
    conversationAccess: { conversation: { draft: false } },
  };
  rendered.rerender(
    <I18nProvider i18n={i18n}>
      <DeliveryBusiness
        workspace={value}
        view="inbox"
        onChanged={mockRefetch}
        onOpenTask={jest.fn()}
      />
    </I18nProvider>,
  );
  expect(
    screen.queryByRole('button', { name: 'Save inside OS' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('You have view-only access to this conversation.'),
  ).toBeVisible();
});
it('blocks conversation access changes when the current role directory is unavailable', async () => {
  setup('inbox');
  await userEvent.click(
    screen.getByRole('button', { name: 'New Conversation' }),
  );
  await userEvent.type(screen.getByLabelText('Title'), 'Draft conversation');
  expect(screen.getByRole('button', { name: 'Save record' })).toBeDisabled();
  expect(screen.getByLabelText('Title')).toHaveValue('Draft conversation');
  expect(screen.getByText('Checking current roles and people…')).toBeVisible();
});
it('preserves unsaved role sharing while hiding stale access previews after a failed directory refresh', async () => {
  const actor = {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
    roleIds: [],
    capabilities: ['workspace.admin'],
    grants: [],
    nativeAdministrator: true,
  };
  mockDirectory = {
    actor,
    roles: [
      {
        id: 'editor',
        name: 'Editor',
        description: '',
        capabilities: [],
        revision: 1,
      },
    ],
    members: [
      {
        memberId: 'admin',
        name: 'Founder',
        roleIds: [],
        revision: 1,
        access: actor,
      },
    ],
  };
  const rendered = setup('inbox');
  await userEvent.click(
    screen.getByRole('button', { name: 'New Conversation' }),
  );
  await userEvent.type(
    screen.getByLabelText('Title'),
    'Keep this conversation',
  );
  await userEvent.selectOptions(
    screen.getByLabelText('Conversation owner'),
    'admin',
  );
  await userEvent.click(screen.getByLabelText('Private to the owner'));
  await userEvent.click(screen.getByLabelText('Editor: prepare replies'));
  const page = (
    <I18nProvider i18n={i18n}>
      <DeliveryBusiness
        workspace={workspace}
        view="inbox"
        onChanged={mockRefetch}
        onOpenTask={jest.fn()}
      />
    </I18nProvider>
  );
  mockDirectoryError = new Error('Directory unavailable');
  rendered.rerender(page);
  expect(screen.getByRole('button', { name: 'Save record' })).toBeDisabled();
  expect(
    screen.queryByRole('list', { name: 'Effective conversation access' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Title')).toHaveValue('Keep this conversation');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not verify current roles',
  );
  mockDirectoryError = undefined;
  rendered.rerender(
    <I18nProvider i18n={i18n}>
      <DeliveryBusiness
        workspace={workspace}
        view="inbox"
        onChanged={mockRefetch}
        onOpenTask={jest.fn()}
      />
    </I18nProvider>,
  );
  expect(screen.getByLabelText('Editor: prepare replies')).toBeChecked();
  expect(screen.getByLabelText('Conversation owner')).toHaveValue('admin');
});
