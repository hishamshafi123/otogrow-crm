import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { NetworkStatus } from '@apollo/client';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom';
import {
  type DeliveryClientSetupContextInput,
  type DeliveryClientSetupCreateInput,
} from '~/generated-metadata/graphql';
import { ClientSetupWizard } from '@/delivery/onboarding/ClientSetupWizard';
import { useClientSetup } from '@/delivery/onboarding/useClientSetup';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  clientSetupFixture,
  clientSetupReceiptFixture,
  SETUP_COMPANY,
  SETUP_EDITOR,
  SETUP_MANAGER,
  SETUP_PLAN,
  SETUP_PROJECT,
  SETUP_TASK,
} from '@/delivery/onboarding/__tests__/client-setup.fixtures';

let mockContext = clientSetupFixture();
const mockCreate = jest.fn();
const mockCheck = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/onboarding/onboardingStyles', () => ({
  StyledSetupSteps: 'ol',
  StyledSetupSummary: 'dl',
}));
jest.mock('@/delivery/onboarding/SetupCompanyCreation', () => ({
  SetupCompanyCreation: () => <p>Separate native company creation</p>,
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: true,
    manager: true,
    scope: 'workspace:manager:membership',
    access: { capabilities: ['delivery.manage'], roleIds: [], grants: [] },
    refetch: jest.fn(),
    matches: (
      value?: {
        workspaceId: string;
        memberId: string;
        userWorkspaceId: string;
      } | null,
    ) =>
      value?.workspaceId === 'workspace' &&
      value.memberId === SETUP_MANAGER &&
      value.userWorkspaceId === 'membership',
  }),
}));
const operationName = (document: DocumentNode) => {
  const operation = document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  );
  return operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
};
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    document: DocumentNode,
    options: { variables: { input: DeliveryClientSetupContextInput } },
  ) => {
    if (operationName(document) !== 'DeliveryClientSetup')
      throw new Error('Unexpected legacy setup query');
    const input = options.variables.input;
    return {
      data: {
        deliveryClientSetup: {
          ...mockContext,
          companySearch: input.companySearch ?? '',
          selectedCompany: input.companyId ? mockContext.selectedCompany : null,
          projects: input.companyId ? mockContext.projects : [],
          servicePlans: input.projectId ? mockContext.servicePlans : [],
        },
      },
      loading: false,
      error: undefined,
      networkStatus: NetworkStatus.ready,
      refetch: jest.fn(),
      client: {
        query: async ({
          variables: { input: receiptInput },
        }: {
          variables: { input: { requestId: string } };
        }) => {
          const result = await mockCheck(receiptInput.requestId);
          return {
            data: {
              deliveryClientSetupReceipt:
                result.kind === 'FOUND' ? result.receipt : null,
            },
          };
        },
      },
    };
  },
  useMutation: (document: DocumentNode) => {
    if (operationName(document) !== 'CreateDeliveryClientSetup')
      throw new Error('Unexpected non-atomic setup mutation');
    return [
      async ({
        variables: { input },
      }: {
        variables: { input: DeliveryClientSetupCreateInput };
      }) => ({
        data: { createDeliveryClientSetup: await mockCreate(input) },
      }),
    ];
  },
}));

const Harness = ({ stable = false }: { stable?: boolean }) => {
  const [params] = useSearchParams();
  const [initialRequestId] = useState(params.get('setupRequest'));
  const companyId = params.get('setupCompany');
  const projectId = params.get('setupProject');
  const planId = params.get('setupPlan');
  const context = {
    ...mockContext,
    selectedCompany: companyId ? mockContext.selectedCompany : null,
    projects: companyId ? mockContext.projects : [],
    servicePlans: projectId ? mockContext.servicePlans : [],
  };
  const source = new URLSearchParams(params);
  source.delete('setupRequest');
  source.delete('setupCompanyRequest');
  const state = useClientSetup({ companyId, projectId }, true);
  return (
    <>
      <Link to="/delivery?view=clients">Leave client setup</Link>
      <ClientSetupWizard
        key={stable ? 'stable' : source.toString()}
        state={state}
        context={context}
        companyId={companyId}
        projectId={projectId}
        planId={planId}
        initialRequestId={initialRequestId}
        companyRequestId={null}
        onReload={() => undefined}
      />
    </>
  );
};
const setup = (
  entry = `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}`,
  stable = false,
) => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Harness stable={stable} />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup() };
};
const reusedEntry = () =>
  `/delivery?view=onboarding&setupCompany=${SETUP_COMPANY}&setupProject=${SETUP_PROJECT}&setupPlan=${SETUP_PLAN}`;
const continueStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Continue' }));
};
const prepareFirstTask = async (
  user: ReturnType<typeof userEvent.setup>,
  title = 'First product creative',
) => {
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Include the first task in this setup',
    }),
  );
  await user.type(screen.getByLabelText('First task title'), title);
  await user.selectOptions(
    screen.getByLabelText('First task assignee'),
    SETUP_EDITOR,
  );
  await user.selectOptions(
    screen.getByLabelText('First task reviewer'),
    SETUP_MANAGER,
  );
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
  jest.clearAllMocks();
  mockCreate.mockReset();
  mockCheck.mockReset();
  mockContext = clientSetupFixture();
  mockCheck.mockResolvedValue({ kind: 'NOT_FOUND' });
  mockCreate.mockImplementation(
    async (input: DeliveryClientSetupCreateInput) => ({
      ...clientSetupReceiptFixture(),
      requestId: input.requestId,
      companyId: input.companyId,
      projectId: input.projectId ?? SETUP_PROJECT,
      engagementId: input.engagementId ?? SETUP_PLAN,
      taskId: input.firstTask ? SETUP_TASK : null,
      reusedProject: Boolean(input.projectId),
      reusedEngagement: Boolean(input.engagementId),
    }),
  );
});

it('reviews a new project, explicit team and advertising service plan with a retained independently reviewed first task', async () => {
  const { router, user } = setup();
  await user.selectOptions(screen.getByLabelText('Project choice'), 'NEW');
  await user.type(screen.getByLabelText('New project name'), 'Product launch');
  await user.selectOptions(screen.getByLabelText('Project teammates'), [
    SETUP_EDITOR,
  ]);
  await continueStep(user);
  await user.selectOptions(screen.getByLabelText('Service plan choice'), 'NEW');
  await user.type(
    screen.getByLabelText('Service plan name'),
    'Launch retainer',
  );
  await user.click(
    screen.getByRole('checkbox', { name: 'Performance marketing' }),
  );
  await user.selectOptions(
    screen.getByLabelText('Billing arrangement'),
    'RETAINER',
  );
  await user.type(
    screen.getByLabelText('Client-visible scope'),
    'Approved launch scope',
  );
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Configure the PM, marketer and client budget requests',
    }),
  );
  await user.selectOptions(
    screen.getByLabelText('Advertising project manager'),
    SETUP_MANAGER,
  );
  await user.selectOptions(
    screen.getByLabelText('Assigned marketer'),
    SETUP_EDITOR,
  );
  await continueStep(user);
  await prepareFirstTask(user);
  await user.click(screen.getByText(/First task checklist and references/));
  await user.type(
    screen.getByLabelText('References — one URL per line'),
    'https://example.com/brand',
  );
  await user.type(
    screen.getByLabelText('Checklist — one item per line'),
    'Check product details',
  );
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Launch retainer',
  );
  expect(screen.getByLabelText('Assigned marketer')).toHaveValue(SETUP_EDITOR);
  await user.click(screen.getByRole('link', { name: 'Leave client setup' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
    'onboarding',
  );
  expect(screen.getByLabelText('Client-visible scope')).toHaveValue(
    'Approved launch scope',
  );
  await continueStep(user);
  expect(screen.getByLabelText('First task title')).toHaveValue(
    'First product creative',
  );
  await continueStep(user);
  expect(screen.getByText('New project: Product launch')).toBeVisible();
  expect(screen.getByText('Advertising responsibilities')).toBeVisible();
  expect(
    screen.getByText(/Independent manager.*Project editor.*USD.*META.*DAILY/),
  ).toBeVisible();
  expect(screen.getByText('Onboarding questions')).toBeVisible();
  expect(
    screen.getByText(
      /Website link.*Logo and brand guideline links.*Brand goals and notes/,
    ),
  ).toBeVisible();
  const originalCreate = mockCreate.getMockImplementation();
  mockCreate.mockImplementationOnce(
    async (input: DeliveryClientSetupCreateInput) => {
      expect(
        new URLSearchParams(router.state.location.search).get('setupRequest'),
      ).toBe(input.requestId);
      return originalCreate?.(input);
    },
  );
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  await screen.findByRole('heading', { name: 'Client work setup saved' });
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockCreate.mock.calls[0][0]).toMatchObject({
    projectId: null,
    projectRevision: null,
    projectName: 'Product launch',
    memberIds: [SETUP_EDITOR],
    engagementId: null,
    plan: {
      billing: 'RETAINER',
      services: ['Performance marketing'],
      advertising: {
        managerId: SETUP_MANAGER,
        marketerId: SETUP_EDITOR,
        channel: 'META',
        currency: 'USD',
        period: 'DAILY',
      },
    },
    firstTask: {
      assigneeId: SETUP_EDITOR,
      reviewerId: SETUP_MANAGER,
      evidence: ['https://example.com/brand'],
      checklist: ['Check product details'],
    },
  });
});

it('allows one first-task manager in both roles and can deliberately save reused records without a task', async () => {
  mockContext.members = [mockContext.members[0]];
  mockContext.projects[0].memberIds = [SETUP_MANAGER];
  const { user } = setup(reusedEntry());
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Include the first task in this setup',
    }),
  );
  await user.type(
    screen.getByLabelText('First task title'),
    'First task allows same manager',
  );
  await user.selectOptions(
    screen.getByLabelText('First task assignee'),
    SETUP_MANAGER,
  );
  await user.selectOptions(
    screen.getByLabelText('First task reviewer'),
    SETUP_MANAGER,
  );
  expect(
    within(
      screen.getByLabelText('First task reviewer'),
    ).getByRole('option', { name: 'Independent manager' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(
    screen.queryByRole('link', { name: 'Open Team & projects' }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Include the first task in this setup',
    }),
  );
  await continueStep(user);
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  await screen.findByRole('heading', { name: 'Client work setup saved' });
  expect(mockCreate.mock.calls[0][0]).toMatchObject({
    projectId: SETUP_PROJECT,
    projectRevision: 2,
    projectName: null,
    memberIds: [],
    engagementId: SETUP_PLAN,
    engagementRevision: 3,
    plan: null,
    firstTask: null,
  });
});

it('blocks malformed references and oversized checklists before any setup request', async () => {
  const { user } = setup(reusedEntry());
  await prepareFirstTask(user);
  await user.click(screen.getByText(/First task checklist and references/));
  const references = screen.getByLabelText('References — one URL per line');
  const checklist = screen.getByLabelText('Checklist — one item per line');
  await user.type(references, 'Use the latest reel');
  expect(screen.getByText(/each a complete HTTP or HTTPS URL/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await user.clear(references);
  await user.type(references, 'https://example.com/reference');
  await user.click(checklist);
  await user.paste(
    Array.from({ length: 101 }, (_, index) => `Check ${index + 1}`).join('\n'),
  );
  expect(screen.getByText(/Use at most 100 checklist lines/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await user.clear(checklist);
  await user.type(checklist, 'Check realism');
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockCheck).not.toHaveBeenCalled();
});

it('requires a fresh check before retrying the exact frozen setup identity and payload', async () => {
  mockCreate.mockResolvedValueOnce(null);
  const { router, user } = setup(reusedEntry());
  await continueStep(user);
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  await screen.findByRole('heading', { name: 'Recover this setup request' });
  const original = structuredClone(mockCreate.mock.calls[0][0]);
  expect(
    screen.queryByRole('button', { name: 'Retry this exact reviewed setup' }),
  ).not.toBeInTheDocument();
  expect(mockCreate).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Check setup request' }));
  expect(mockCheck).toHaveBeenCalledWith(original.requestId);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  await user.click(
    screen.getByRole('button', { name: 'Retry this exact reviewed setup' }),
  );
  await screen.findByRole('heading', { name: 'Client work setup saved' });
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(mockCreate.mock.calls[1][0]).toEqual(original);
  expect(
    new URLSearchParams(router.state.location.search).get('setupRequest'),
  ).toBe(original.requestId);
});

it('returns to a retained draft after a fresh absent receipt and keeps its original request ID when correcting first work', async () => {
  mockCreate.mockResolvedValueOnce(null);
  const { user } = setup(reusedEntry());
  await prepareFirstTask(user, 'Original prepared creative');
  await continueStep(user);
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  await screen.findByRole('heading', { name: 'Recover this setup request' });
  const requestId = mockCreate.mock.calls[0][0].requestId;
  await user.click(screen.getByRole('button', { name: 'Check setup request' }));
  await user.click(
    screen.getByRole('button', {
      name: 'Return to the retained draft after this check',
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('First task title')).toHaveValue(
    'Original prepared creative',
  );
  await user.clear(screen.getByLabelText('First task title'));
  await user.type(
    screen.getByLabelText('First task title'),
    'Corrected prepared creative',
  );
  await continueStep(user);
  await user.click(
    screen.getByRole('button', { name: 'Save reviewed client setup' }),
  );
  await screen.findByRole('heading', { name: 'Client work setup saved' });
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(mockCreate.mock.calls[1][0]).toMatchObject({
    requestId,
    firstTask: { title: 'Corrected prepared creative' },
  });
});

jest.mock('@/delivery/onboarding/useServiceCatalog', () => ({
  useServiceCatalog: () => ({
    services: [],
    loading: false,
    unavailable: false,
    canAdd: true,
    retry: jest.fn(),
    add: jest.fn(),
  }),
}));


it('allows a company selected after mount without treating its first source version as stale', async () => {
  const { user } = setup('/delivery?view=onboarding', true);
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Client company' }),
    SETUP_COMPANY,
  );
  await continueStep(user);
  expect(
    screen.getByRole('region', { name: 'Project and team' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/selected project or service plan changed/),
  ).not.toBeInTheDocument();
});
