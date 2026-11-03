import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import { type ClientSetupReceipt } from '@/delivery/onboarding/client-setup.types';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import {
  type DeliveryClientSetupCreateInput,
  type DeliveryClientSetupContextInput,
} from '~/generated-metadata/graphql';
import { DeliveryClientSetupPage } from '@/delivery/onboarding/DeliveryClientSetupPage';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  clientSetupFixture,
  clientSetupReceiptFixture,
  SETUP_COMPANY,
  SETUP_PROJECT,
  SETUP_PLAN,
  SETUP_MANAGER,
  SETUP_EDITOR,
  SETUP_REQUEST,
  SETUP_TASK,
} from '@/delivery/onboarding/__tests__/client-setup.fixtures';

let mockContext = clientSetupFixture();
let mockReady = true;
let mockManager = true;
let mockMembership = 'membership';
let mockRoleIds: string[] = [];
let mockCurrentInput: DeliveryClientSetupContextInput = {};
let mockError: Error | undefined;
let mockLoading = false;
let mockNetworkStatus = NetworkStatus.ready;
let mockNativeAllowed = true;
let mockRefresh: () => void;
const mockRead = jest.fn();
const mockRefetch = jest.fn();
const mockSave = jest.fn();
const mockClientQuery = jest.fn();
const mockCoreCreate = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCanvas: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/onboarding/onboardingStyles', () => ({
  StyledSetupBoundary: 'fieldset',
  StyledSetupSteps: 'ol',
  StyledSetupSummary: 'dl',
}));
jest.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: 'div',
}));
jest.mock('@/ui/layout/page/components/PageBody', () => ({ PageBody: 'main' }));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'company-metadata' },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: true,
    canUpdateObjectRecords: mockNativeAllowed,
  }),
}));
jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: () => ({
    createOneRecord: mockCoreCreate,
    loading: false,
  }),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    manager: mockReady && mockManager,
    scope: `workspace:${SETUP_MANAGER}:${mockMembership}`,
    error: mockError,
    refetch: mockRefetch,
    access: mockReady
      ? {
          capabilities: mockManager ? ['delivery.manage'] : [],
          roleIds: mockRoleIds,
          grants: [],
        }
      : undefined,
    matches: (
      data?: {
        workspaceId: string;
        memberId: string;
        userWorkspaceId: string;
      } | null,
    ) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === SETUP_MANAGER &&
      data.userWorkspaceId === mockMembership,
  }),
}));
const operationName = (document: DocumentNode) => {
  const operation = document.definitions.find(
    (entry) => entry.kind === 'OperationDefinition',
  );
  return operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
};
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    document: DocumentNode,
    options: {
      variables: { input: DeliveryClientSetupContextInput };
      skip: boolean;
    },
  ) => {
    if (operationName(document) !== 'DeliveryClientSetup')
      throw new Error('Unexpected full workspace query');
    if (!options.skip) mockRead(options.variables.input);
    const input = options.variables.input;
    mockCurrentInput = input;
    return {
      data: {
        deliveryClientSetup: {
          ...structuredClone(mockContext),
          companySearch: input.companySearch ?? '',
          selectedCompany: input.companyId ? mockContext.selectedCompany : null,
          projects: input.companyId ? mockContext.projects : [],
          servicePlans: input.projectId ? mockContext.servicePlans : [],
        },
      },
      loading: mockLoading,
      error: mockError,
      networkStatus: mockNetworkStatus,
      refetch: mockRefetch,
      client: { query: mockClientQuery },
    };
  },
  useMutation: (document: DocumentNode) => {
    if (operationName(document) !== 'CreateDeliveryClientSetup')
      throw new Error('Unexpected non-atomic setup write');
    return [mockSave];
  },
}));
const setup = (entry = '/delivery?view=onboarding', previousEntry?: string) => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return (
      <>
        <Link to="/delivery?view=clients">Other Clients route</Link>
        <DeliveryClientSetupPage />
      </>
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
      initialEntries: previousEntry ? [previousEntry, entry] : [entry],
      initialIndex: previousEntry ? 1 : 0,
    },
  );
  render(<RouterProvider router={router} />);
  return router;
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockContext = clientSetupFixture();
  mockReady = true;
  mockManager = true;
  mockMembership = 'membership';
  mockRoleIds = [];
  mockCurrentInput = {};
  mockError = undefined;
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  mockNativeAllowed = true;
  mockRefetch.mockImplementation(async () => ({
    data: {
      deliveryClientSetup: {
        ...structuredClone(mockContext),
        companySearch: mockCurrentInput.companySearch ?? '',
        selectedCompany: mockCurrentInput.companyId
          ? mockContext.selectedCompany
          : null,
        projects: mockCurrentInput.companyId ? mockContext.projects : [],
        servicePlans: mockCurrentInput.projectId
          ? mockContext.servicePlans
          : [],
      },
    },
  }));
  mockSave.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliveryClientSetupCreateInput };
    }) => ({
      data: {
        createDeliveryClientSetup: {
          ...clientSetupReceiptFixture(),
          requestId: input.requestId,
          companyId: input.companyId,
          projectId: input.projectId ?? SETUP_PROJECT,
          engagementId: input.engagementId ?? SETUP_PLAN,
          taskId: input.firstTask ? SETUP_TASK : null,
          reusedProject: Boolean(input.projectId),
          reusedEngagement: Boolean(input.engagementId),
        },
      },
    }),
  );
  mockClientQuery.mockResolvedValue({
    data: { deliveryClientSetupReceipt: null },
  });
  mockCoreCreate.mockRejectedValue(
    new Error('Synthetic unknown native outcome'),
  );
});
const prepareNewPlan = async () => {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Service plan choice'), 'NEW');
  expect(screen.getByLabelText('Billing arrangement')).toHaveValue('');
  expect(screen.getByLabelText('Billing arrangement')).toHaveDisplayValue(
    'Choose a billing arrangement',
  );
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await user.type(
    screen.getByLabelText('Service plan name'),
    'Reviewed product launch',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Static ads' }));
  await user.type(
    screen.getByLabelText('Client-visible scope'),
    'Product image campaign scope',
  );
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(screen.getByText('Choose a billing arrangement.')).toBeVisible();
  await user.selectOptions(
    screen.getByLabelText('Billing arrangement'),
    'ONE_TIME',
  );
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return user;
};
it('starts task-free without invented company/project/billing or any setup write', () => {
  setup();
  expect(
    screen.getByRole('heading', { name: 'Set up client work' }),
  ).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Client company' })).toHaveValue(
    '',
  );
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(mockRead).toHaveBeenCalledWith({
    companySearch: '',
    companyId: null,
    projectId: null,
  });
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockCoreCreate).not.toHaveBeenCalled();
});
it('reuses exact saved project/plan unchanged and saves no optional task unless requested', async () => {
  const router = setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}&setupPlan=${SETUP_PLAN}`,
  );
  const user = userEvent.setup();
  expect(
    screen.getByRole('checkbox', {
      name: 'Include the first task in this setup',
    }),
  ).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Client work setup saved' }),
  ).toBeVisible();
  const input = mockSave.mock.calls[0][0].variables.input;
  expect(input).toMatchObject({
    companyId: SETUP_COMPANY,
    projectId: SETUP_PROJECT,
    projectRevision: 2,
    projectName: null,
    memberIds: [],
    engagementId: SETUP_PLAN,
    engagementRevision: 3,
    plan: null,
    firstTask: null,
  });
  expect(
    new URLSearchParams(router.state.location.search).get('setupRequest'),
  ).toBe(input.requestId);
  expect(
    screen.getByText(/Existing service plan reused unchanged\./),
  ).toBeVisible();
  expect(mockSave).toHaveBeenCalledTimes(1);
});
it('reuses genuine service-plan fields, keeps Back values and permits setup without inventing a second person', async () => {
  mockContext.members = [mockContext.members[0]];
  mockContext.projects = [
    { ...mockContext.projects[0], memberIds: [SETUP_MANAGER] },
  ];
  setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}`,
  );
  const user = await prepareNewPlan();
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Include the first task in this setup',
    }),
  );
  await user.type(screen.getByLabelText('First task title'), 'Product draft');
  await user.selectOptions(
    screen.getByLabelText('First task assignee'),
    SETUP_MANAGER,
  );
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(
    screen.getByRole('link', { name: 'Open Team & projects' }),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Reviewed product launch',
  );
  expect(screen.getByLabelText('Billing arrangement')).toHaveValue('ONE_TIME');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Include the first task in this setup',
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Client work setup saved' }),
  ).toBeVisible();
  expect(mockSave.mock.calls[0][0].variables.input).toMatchObject({
    plan: {
      services: ['Static ads'],
      billing: 'ONE_TIME',
      scope: 'Product image campaign scope',
      advertising: null,
    },
    firstTask: null,
  });
});
it('assigns an optional task only to a selected member and a different explicit reviewer', async () => {
  setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}&setupPlan=${SETUP_PLAN}`,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Include the first task in this setup',
    }),
  );
  await user.type(
    screen.getByLabelText('First task title'),
    'Independent product review',
  );
  expect(screen.getByLabelText('First task assignee')).toHaveValue('');
  expect(screen.getByLabelText('Independent first task reviewer')).toHaveValue(
    '',
  );
  await user.selectOptions(
    screen.getByLabelText('First task assignee'),
    SETUP_EDITOR,
  );
  await user.selectOptions(
    screen.getByLabelText('Independent first task reviewer'),
    SETUP_MANAGER,
  );
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  await screen.findByRole('heading', { name: 'Client work setup saved' });
  expect(mockSave.mock.calls[0][0].variables.input.firstTask).toMatchObject({
    assigneeId: SETUP_EDITOR,
    reviewerId: SETUP_MANAGER,
    scheduledDate: null,
    dueAt: null,
    checklist: [],
    evidence: [],
  });
  expect(
    screen.getByRole('link', { name: 'Open the saved first task' }),
  ).toHaveAttribute('href', expect.stringContaining(`task=${SETUP_TASK}`));
});
it('keeps one frozen unknown setup request, checks it without a new mutation and shows the exact original receipt', async () => {
  mockSave.mockRejectedValueOnce(new Error('Committed but response lost'));
  const router = setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}&setupPlan=${SETUP_PLAN}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Recover this setup request' }),
  ).toBeVisible();
  const input = mockSave.mock.calls[0][0].variables.input;
  expect(
    new URLSearchParams(router.state.location.search).get('setupRequest'),
  ).toBe(input.requestId);
  mockClientQuery.mockResolvedValueOnce({
    data: {
      deliveryClientSetupReceipt: {
        ...clientSetupReceiptFixture(),
        requestId: input.requestId,
        replayed: true,
      },
    },
  });
  await user.click(screen.getByRole('button', { name: 'Check setup request' }));
  expect(
    await screen.findByText(/The earlier request was found/),
  ).toBeVisible();
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.objectContaining({
      fetchPolicy: 'no-cache',
      variables: expect.objectContaining({
        input: { requestId: input.requestId },
      }),
    }),
  );
  expect(mockSave).toHaveBeenCalledTimes(1);
});
it('opens a reload recovery link read-only and never resubmits it automatically', async () => {
  setup(`/delivery?view=onboarding&setupRequest=${SETUP_REQUEST}`);
  expect(
    screen.getByRole('heading', { name: 'Recover this setup request' }),
  ).toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockClientQuery).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check setup request' }),
  );
  expect(await screen.findByText(/No saved setup was found/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry this exact reviewed setup' }),
  ).not.toBeInTheDocument();
  expect(mockSave).not.toHaveBeenCalled();
});
it('rejects a delayed create receipt after access loss and restoration, keeping exact-request recovery instead of publishing stale success', async () => {
  let finish:
    | ((result: {
        data: { createDeliveryClientSetup: ClientSetupReceipt };
      }) => void)
    | undefined;
  mockSave.mockImplementation(
    () =>
      new Promise<{ data: { createDeliveryClientSetup: ClientSetupReceipt } }>(
        (resolve) => {
          finish = resolve;
        },
      ),
  );
  const router = setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}&setupPlan=${SETUP_PLAN}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  const input = mockSave.mock.calls[0][0].variables.input;
  mockReady = false;
  mockError = new Error('Current access became unavailable');
  act(mockRefresh);
  mockReady = true;
  mockError = undefined;
  act(mockRefresh);
  if (!finish) throw new Error('The explicit setup mutation was not started');
  const complete = finish;
  await act(async () =>
    complete({
      data: {
        createDeliveryClientSetup: {
          ...clientSetupReceiptFixture(),
          requestId: input.requestId,
        },
      },
    }),
  );
  expect(
    screen.queryByRole('heading', { name: 'Client work setup saved' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check setup request' }),
  ).toBeVisible();
  expect(
    new URLSearchParams(router.state.location.search).get('setupRequest'),
  ).toBe(input.requestId);
  expect(mockSave).toHaveBeenCalledTimes(1);
});
it('remounts a revoked/regranted pending wizard as exact read-only recovery and does not publish its delayed receipt', async () => {
  let finish:
    | ((result: {
        data: { createDeliveryClientSetup: ClientSetupReceipt };
      }) => void)
    | undefined;
  mockSave.mockImplementationOnce(
    () =>
      new Promise<{ data: { createDeliveryClientSetup: ClientSetupReceipt } }>(
        (resolve) => {
          finish = resolve;
        },
      ),
  );
  const router = setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}&setupPlan=${SETUP_PLAN}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  const input = mockSave.mock.calls[0][0].variables.input;
  mockManager = false;
  act(mockRefresh);
  expect(
    screen.queryByRole('heading', { name: 'Recover this setup request' }),
  ).not.toBeInTheDocument();
  mockManager = true;
  act(mockRefresh);
  expect(
    screen.queryByRole('heading', { name: 'Recover this setup request' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save reviewed client setup' }),
  ).not.toBeInTheDocument();
  if (!finish) throw new Error('The explicit setup mutation was not started');
  const complete = finish;
  await act(async () =>
    complete({
      data: {
        createDeliveryClientSetup: {
          ...clientSetupReceiptFixture(),
          requestId: input.requestId,
        },
      },
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Retry client setup access' }),
  );
  expect(
    screen.getByRole('heading', { name: 'Recover this setup request' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Client work setup saved' }),
  ).not.toBeInTheDocument();
  expect(
    new URLSearchParams(router.state.location.search).get('setupRequest'),
  ).toBe(input.requestId);
  mockClientQuery.mockResolvedValueOnce({
    data: {
      deliveryClientSetupReceipt: {
        ...clientSetupReceiptFixture(),
        requestId: input.requestId,
        replayed: true,
      },
    },
  });
  await user.click(screen.getByRole('button', { name: 'Check setup request' }));
  expect(
    await screen.findByRole('heading', { name: 'Client work setup saved' }),
  ).toBeVisible();
  expect(mockSave).toHaveBeenCalledTimes(1);
});
it('permits an explicit fresh review after a reload not-found check while keeping the same setup UUID', async () => {
  const router = setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}&setupPlan=${SETUP_PLAN}&setupRequest=${SETUP_REQUEST}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Check setup request' }));
  await user.click(
    await screen.findByRole('button', {
      name: 'Prepare a new review with this same request ID',
    }),
  );
  expect(mockSave).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  await screen.findByRole('heading', { name: 'Client work setup saved' });
  expect(mockSave.mock.calls[0][0].variables.input.requestId).toBe(
    SETUP_REQUEST,
  );
  expect(
    new URLSearchParams(router.state.location.search).get('setupRequest'),
  ).toBe(SETUP_REQUEST);
});
it('records native company ID before create, ignores optimistic data and blocks a replacement until an exact fresh check', async () => {
  const router = setup();
  const user = userEvent.setup();
  mockCoreCreate.mockImplementation(
    async (input: { id: string; name: string }) => {
      expect(
        new URLSearchParams(router.state.location.search).get(
          'setupCompanyRequest',
        ),
      ).toBe(input.id);
      return { id: input.id, name: input.name };
    },
  );
  mockClientQuery.mockResolvedValue({
    data: {
      deliveryClientSetup: { ...clientSetupFixture(), selectedCompany: null },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Create a new client company' }),
  );
  await user.type(
    screen.getByLabelText('Company name'),
    'Frozen native client',
  );
  await user.click(screen.getByRole('button', { name: 'Create company' }));
  expect(
    await screen.findByText(/No company was found at this ID/),
  ).toBeVisible();
  expect(screen.queryByText(/Saved company found/)).not.toBeInTheDocument();
  expect(mockCoreCreate).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: 'Create company' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry the same company request' }),
  ).toBeVisible();
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.objectContaining({ fetchPolicy: 'no-cache' }),
  );
});
it('retains the native company UUID when its name is deliberately edited after a fresh not-found check, and exposes a conflicting saved name', async () => {
  const router = setup();
  const user = userEvent.setup();
  mockClientQuery.mockResolvedValue({
    data: {
      deliveryClientSetup: { ...clientSetupFixture(), selectedCompany: null },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Create a new client company' }),
  );
  await user.type(screen.getByLabelText('Company name'), 'First prepared name');
  await user.click(screen.getByRole('button', { name: 'Create company' }));
  await screen.findByText(/No company was found at this ID/);
  const first = mockCoreCreate.mock.calls[0][0];
  expect(
    screen.getByRole('combobox', { name: 'Client company' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', {
      name: 'Edit company name with this same recovery ID',
    }),
  );
  await user.clear(screen.getByLabelText('Company name'));
  await user.type(
    screen.getByLabelText('Company name'),
    'Explicitly changed draft name',
  );
  mockClientQuery.mockResolvedValueOnce({
    data: {
      deliveryClientSetup: {
        ...clientSetupFixture(),
        selectedCompany: {
          id: first.id,
          name: 'First prepared name',
          sourceToken: 'b'.repeat(64),
        },
      },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Submit this same company request' }),
  );
  expect(
    await screen.findByText(
      /Your prepared name was Explicitly changed draft name/,
    ),
  ).toHaveTextContent(
    'The current saved company is named First prepared name.',
  );
  expect(mockCoreCreate.mock.calls[1][0]).toEqual({
    id: first.id,
    name: 'Explicitly changed draft name',
  });
  expect(
    new URLSearchParams(router.state.location.search).get(
      'setupCompanyRequest',
    ),
  ).toBe(first.id);
  expect(
    new URLSearchParams(router.state.location.search).get('setupCompany'),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Use this saved company' }),
  ).toBeVisible();
});
it('keeps a native recovery-only reload read-only until a fresh check and never allocates a replacement UUID', async () => {
  const router = setup(
    `/delivery?view=onboarding&setupCompanyRequest=${SETUP_REQUEST}`,
  );
  const user = userEvent.setup();
  expect(screen.getByLabelText('Company name')).toBeDisabled();
  expect(
    screen.getByRole('combobox', { name: 'Client company' }),
  ).toBeDisabled();
  expect(mockCoreCreate).not.toHaveBeenCalled();
  mockClientQuery.mockResolvedValueOnce({
    data: {
      deliveryClientSetup: { ...clientSetupFixture(), selectedCompany: null },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check company request' }),
  );
  await screen.findByText(/No company was found at this ID/);
  await user.click(
    screen.getByRole('button', {
      name: 'Edit company name with this same recovery ID',
    }),
  );
  await user.type(
    screen.getByLabelText('Company name'),
    'Explicit recovery name',
  );
  await user.click(
    screen.getByRole('button', { name: 'Submit this same company request' }),
  );
  expect(mockCoreCreate).toHaveBeenCalledWith({
    id: SETUP_REQUEST,
    name: 'Explicit recovery name',
  });
  expect(
    new URLSearchParams(router.state.location.search).get(
      'setupCompanyRequest',
    ),
  ).toBe(SETUP_REQUEST);
});
it('preserves a same-identity private draft through poll/error/failed retry and hides it until fresh recovery', async () => {
  setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}`,
  );
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Service plan choice'), 'NEW');
  await user.type(
    screen.getByLabelText('Service plan name'),
    'Retain private setup',
  );
  const input = screen.getByLabelText('Service plan name');
  mockLoading = true;
  mockNetworkStatus = NetworkStatus.poll;
  act(mockRefresh);
  expect(input).toBeVisible();
  mockLoading = false;
  mockReady = false;
  mockError = new Error('Offline');
  act(mockRefresh);
  expect(input).not.toBeVisible();
  expect(input).toBeDisabled();
  mockReady = true;
  mockError = undefined;
  mockLoading = true;
  mockNetworkStatus = NetworkStatus.refetch;
  act(mockRefresh);
  expect(input).not.toBeVisible();
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  act(mockRefresh);
  expect(screen.getByLabelText('Service plan name')).toBe(input);
  expect(input).toHaveValue('Retain private setup');
  expect(mockSave).not.toHaveBeenCalled();
});
it('disposes a private draft on confirmed source denial and real identity change, with no automatic write after recovery', async () => {
  setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}`,
  );
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Service plan choice'), 'NEW');
  await user.type(
    screen.getByLabelText('Service plan name'),
    'Do not revive this plan',
  );
  mockError = new CombinedGraphQLErrors({
    errors: [
      { message: 'Forbidden setup source', extensions: { code: 'FORBIDDEN' } },
    ],
  });
  act(mockRefresh);
  expect(
    screen.queryByDisplayValue('Do not revive this plan'),
  ).not.toBeInTheDocument();
  mockError = undefined;
  mockMembership = 'other-membership';
  act(mockRefresh);
  expect(
    screen.queryByDisplayValue('Do not revive this plan'),
  ).not.toBeInTheDocument();
  expect(mockSave).not.toHaveBeenCalled();
});
it('protects edited plan values when leaving the route, and Keep retains exact fields', async () => {
  const router = setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}`,
  );
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Service plan choice'), 'NEW');
  await user.type(
    screen.getByLabelText('Service plan name'),
    'Keep prepared plan',
  );
  await user.click(screen.getByRole('link', { name: 'Back to Clients' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
    'onboarding',
  );
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Keep prepared plan',
  );
});
it('hides and avoids source reads for a known nonmanager without giving native company write permission', () => {
  mockManager = false;
  setup();
  expect(
    screen.getByText(
      /Client work setup requires current delivery management access/,
    ),
  ).toBeVisible();
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockCoreCreate).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
});
const forbiddenSetup = () =>
  new CombinedGraphQLErrors({
    errors: [
      { message: 'Setup unavailable', extensions: { code: 'FORBIDDEN' } },
    ],
  });
it.each(['query denial', 'manager-preserving role change'])(
  'cancels blocked browser Back before disposing private preparation after %s',
  async (change) => {
    const entry = `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}`;
    const router = setup(entry, '/delivery?view=clients');
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText('Service plan choice'),
      'NEW',
    );
    await user.type(
      screen.getByLabelText('Service plan name'),
      'Private unfinished scope',
    );
    act(() => {
      void router.navigate(-1);
    });
    expect(
      await screen.findByRole('button', { name: 'Keep editing' }),
    ).toBeVisible();
    if (change === 'query denial') mockError = forbiddenSetup();
    else mockRoleIds = ['changed-management-role'];
    act(mockRefresh);
    expect(
      screen.queryByDisplayValue('Private unfinished scope'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Keep editing' }),
    ).not.toBeInTheDocument();
    expect(router.state.location.search).toBe(
      new URL(entry, 'http://localhost').search,
    );
    mockError = undefined;
    act(mockRefresh);
    expect(
      screen.queryByLabelText('Service plan choice'),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Retry client setup access' }),
    );
    expect(screen.getByLabelText('Service plan choice')).toBeVisible();
    expect(
      screen.queryByDisplayValue('Private unfinished scope'),
    ).not.toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  },
);
it('treats a setup save denial as private scope loss and preserves only its exact recovery link', async () => {
  mockSave.mockRejectedValueOnce(forbiddenSetup());
  const router = setup(
    `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}&setupPlan=${SETUP_PLAN}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  const requestId = mockSave.mock.calls[0][0].variables.input.requestId;
  expect(await screen.findByText(/Setup access changed/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry this exact reviewed setup' }),
  ).not.toBeInTheDocument();
  expect(
    new URLSearchParams(router.state.location.search).get('setupRequest'),
  ).toBe(requestId);
  await user.click(
    screen.getByRole('button', { name: 'Retry client setup access' }),
  );
  expect(
    screen.getByRole('heading', { name: 'Recover this setup request' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Save reviewed client setup' }),
  ).not.toBeInTheDocument();
  expect(mockSave).toHaveBeenCalledTimes(1);
});
it.each(['receipt', 'company'])(
  'requires a fresh access check after an exact %s recovery denial',
  async (kind) => {
    const requestParam =
      kind === 'receipt' ? 'setupRequest' : 'setupCompanyRequest';
    setup(`/delivery?view=onboarding&${requestParam}=${SETUP_REQUEST}`);
    mockClientQuery.mockRejectedValueOnce(forbiddenSetup());
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', {
        name:
          kind === 'receipt' ? 'Check setup request' : 'Check company request',
      }),
    );
    expect(await screen.findByText(/Setup access changed/)).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Retry client setup access' }),
    );
    expect(
      screen.getByRole('button', {
        name:
          kind === 'receipt' ? 'Check setup request' : 'Check company request',
      }),
    ).toBeVisible();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockCoreCreate).not.toHaveBeenCalled();
  },
);
it('clears native company private inputs after a native denial without replacing its recorded company ID', async () => {
  const router = setup();
  const user = userEvent.setup();
  mockCoreCreate.mockRejectedValueOnce(forbiddenSetup());
  await user.click(
    screen.getByRole('button', { name: 'Create a new client company' }),
  );
  await user.type(
    screen.getByLabelText('Company name'),
    'Private company name',
  );
  await user.click(screen.getByRole('button', { name: 'Create company' }));
  expect(await screen.findByText(/Setup access changed/)).toBeVisible();
  const companyId = mockCoreCreate.mock.calls[0][0].id;
  expect(
    screen.queryByDisplayValue('Private company name'),
  ).not.toBeInTheDocument();
  expect(
    new URLSearchParams(router.state.location.search).get(
      'setupCompanyRequest',
    ),
  ).toBe(companyId);
  expect(mockClientQuery).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('button', { name: 'Retry client setup access' }),
  );
  expect(screen.getByLabelText('Company name')).toBeDisabled();
  expect(screen.getByLabelText('Company name')).toHaveValue('');
  expect(
    screen.getByRole('button', { name: 'Check company request' }),
  ).toBeVisible();
  expect(mockCoreCreate).toHaveBeenCalledTimes(1);
});
