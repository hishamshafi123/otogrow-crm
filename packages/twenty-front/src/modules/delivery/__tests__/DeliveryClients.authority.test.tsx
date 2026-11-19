import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom';
import { DeliveryClients } from '@/delivery/DeliveryClients';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { type ClientsSnapshot } from '@/delivery/delivery-clients.types';
import { taskDetailFixture } from '@/delivery/tasks/__tests__/tasks.fixtures';

const COMPANY_ID = '10000000-0000-4000-8000-000000000001';
const PROJECT_ID = '10000000-0000-4000-8000-000000000002';
const PLAN_ID = '10000000-0000-4000-8000-000000000003';
const ACTOR_ID = '10000000-0000-4000-8000-000000000004';
let mockError: Error | undefined;
let mockRoles: string[] = [];
let mockRefresh: () => void;
const mockMutate = jest.fn();
const mockFetch = jest.fn();
const snapshot = (): ClientsSnapshot => ({
  workspaceId: 'workspace',
  memberId: ACTOR_ID,
  userWorkspaceId: 'membership',
  shares: [],
  links: [],
  engagements: [
    {
      id: PLAN_ID,
      revision: 1,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      name: 'Brand SEO plan',
      services: ['SEO'],
      billing: 'RETAINER',
      scope: 'Reviewed scope',
      allowance: '',
      contact: '',
      advertising: null,
      fields: [],
      submissions: [],
      assets: [
        {
          id: 'asset',
          name: 'Brand guidelines.pdf',
          mimeType: 'application/pdf',
          size: 100,
          createdAt: '2026-11-03T00:00:00Z',
        },
      ],
    },
  ],
});
const workspace: DeliveryWorkspace = {
  actor: { memberId: ACTOR_ID, isAdmin: true, isManager: true },
  tasks: [],
  companies: [{ id: COMPANY_ID, name: 'Example brand' }],
  projects: [
    {
      id: PROJECT_ID,
      name: 'Brand project',
      revision: 1,
      companyId: COMPANY_ID,
      memberIds: [ACTOR_ID],
    },
  ],
  members: [{ id: ACTOR_ID, name: 'Founder', access: 'ADMIN', roleLabel: '' }],
};
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryGrid: 'div',
}));
jest.mock('@linaria/react', () => ({
  styled: {
    p: () => 'p',
    div: () => 'div',
    fieldset: () => 'fieldset',
    dialog: () => 'dialog',
  },
}));
jest.mock('@/delivery/commitments/DeliveryCommitments', () => ({
  DeliveryCommitments: () => null,
}));
jest.mock('@/delivery/commitments/DeliveryCommitmentDirectory', () => ({
  DeliveryCommitmentDirectory: () => <p>Assigned client work</p>,
}));
jest.mock('@/delivery/handoffs/DeliveryHandoffs', () => ({
  DeliveryHandoffs: () => null,
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    scope: 'workspace:membership',
    ready: true,
    manager: true,
    canManageRoles: true,
    denied: false,
    loading: false,
    refetch: async () => undefined,
    access: {
      workspaceId: 'workspace',
      memberId: ACTOR_ID,
      userWorkspaceId: 'membership',
      capabilities: ['workspace.admin'],
      roleIds: mockRoles,
      grants: [],
    },
    matches: (
      value?: {
        workspaceId: string;
        memberId: string;
        userWorkspaceId: string;
      } | null,
    ) =>
      value?.workspaceId === 'workspace' &&
      value.memberId === ACTOR_ID &&
      value.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { deliveryClients: snapshot() },
    error: mockError,
    loading: false,
    refetch: async () => ({ data: { deliveryClients: snapshot() } }),
  }),
  useMutation: () => [mockMutate, { loading: false }],
}));
const setup = (entryOverride?: string) => {
  const Page = () => {
    const [, update] = useState(0);
    const [params] = useSearchParams();
    mockRefresh = () => update((value) => value + 1);
    return (
      <>
        <Link to="/other">Another page</Link>
        {params.get('view') === 'onboarding' ? (
          <p>Guided setup opened</p>
        ) : (
          <DeliveryClients
            workspace={workspace}
            onChanged={async () => undefined}
          />
        )}
      </>
    );
  };
  const entry =
    entryOverride ?? `/delivery?view=clients&clientEngagement=${PLAN_ID}`;
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
      { path: '/other', element: <p>Other route</p> },
    ],
    { initialEntries: ['/other', entry], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
};
const denied = () =>
  new CombinedGraphQLErrors({
    errors: [
      { message: 'Client access denied', extensions: { code: 'FORBIDDEN' } },
    ],
  });
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  mockError = undefined;
  mockRoles = [];
  workspace.tasks = [];
  Object.assign(globalThis, { Request });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockMutate.mockResolvedValue({ data: { changeDeliveryClients: snapshot() } });
  global.fetch = mockFetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});
it('uses guided stable-receipt setup for a new service plan and keeps selected client/project context', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('link', { name: 'New client service plan' }),
  );
  expect(screen.getByText('Guided setup opened')).toBeVisible();
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('setupCompany')).toBe(COMPANY_ID);
  expect(params.get('setupProject')).toBe(PROJECT_ID);
  expect(mockMutate).not.toHaveBeenCalled();
});
it('retains the exact existing-plan input through an ordinary outage and declined guided navigation', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Edit client service plan' }),
  );
  await user.type(
    screen.getByLabelText('Service plan name'),
    ' private changes',
  );
  const input = screen.getByLabelText('Service plan name');
  mockError = new Error('Offline');
  act(mockRefresh);
  expect(input).not.toBeVisible();
  mockError = undefined;
  act(mockRefresh);
  expect(screen.getByLabelText('Service plan name')).toBe(input);
  expect(input).toHaveValue('Brand SEO plan private changes');
  await user.click(
    screen.getByRole('link', { name: 'New client service plan' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(input).toHaveValue('Brand SEO plan private changes');
  expect(mockMutate).not.toHaveBeenCalled();
});
it.each(['read denial', 'authority change'])(
  'cancels a blocked browser Back and disposes private fields on %s',
  async (change) => {
    const router = setup();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Edit client service plan' }),
    );
    await user.type(
      screen.getByLabelText('Service plan name'),
      ' do not revive',
    );
    act(() => {
      void router.navigate(-1);
    });
    expect(
      await screen.findByRole('button', { name: 'Keep editing' }),
    ).toBeVisible();
    if (change === 'read denial') mockError = denied();
    else mockRoles = ['changed-role'];
    act(mockRefresh);
    expect(
      screen.queryByDisplayValue('Brand SEO plan do not revive'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Keep editing' }),
    ).not.toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
      'clients',
    );
    if (change === 'read denial') {
      mockError = undefined;
      act(mockRefresh);
      await user.click(
        screen.getByRole('button', { name: 'Check client access again' }),
      );
    }
    expect(
      screen.queryByLabelText('Service plan name'),
    ).not.toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  },
);
it('latches a local save denial without waiting for the global role refresh', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Edit client service plan' }),
  );
  await user.type(screen.getByLabelText('Service plan name'), ' private edit');
  mockMutate.mockRejectedValueOnce(denied());
  await user.click(
    screen.getByRole('button', { name: 'Save client service plan' }),
  );
  expect(
    await screen.findByText(
      /Unsaved preparation and private portal credentials were cleared/,
    ),
  ).toBeVisible();
  expect(screen.queryByLabelText('Service plan name')).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Check client access again' }),
  );
  expect(screen.queryByLabelText('Service plan name')).not.toBeInTheDocument();
  expect(mockMutate).toHaveBeenCalledTimes(1);
});
it('clears local private access after an authenticated file denial and never starts a download', async () => {
  setup();
  mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
  await userEvent.click(
    screen.getByRole('button', { name: 'Brand guidelines.pdf' }),
  );
  expect(
    await screen.findByText(
      /Unsaved preparation and private portal credentials were cleared/,
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Brand guidelines.pdf' }),
  ).not.toBeInTheDocument();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
it('rejects late portal credentials after a concurrent file denial and does not reveal them on recheck', async () => {
  let finish:
    | ((value: { data: { changeDeliveryClients: ClientsSnapshot } }) => void)
    | undefined;
  mockMutate.mockImplementationOnce(
    () =>
      new Promise<{ data: { changeDeliveryClients: ClientsSnapshot } }>(
        (resolve) => {
          finish = resolve;
        },
      ),
  );
  let denyDownload:
    | ((value: { ok: false; status: number }) => void)
    | undefined;
  mockFetch.mockImplementationOnce(
    () =>
      new Promise<{ ok: false; status: number }>((resolve) => {
        denyDownload = resolve;
      }),
  );
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Create 24-hour client link' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Brand guidelines.pdf' }),
  );
  if (!finish) throw new Error('The native portal-link request did not begin.');
  if (!denyDownload)
    throw new Error('The private asset request did not begin.');
  const deny = denyDownload;
  const complete = finish;
  await act(async () => {
    deny({ ok: false, status: 403 });
    await Promise.resolve();
    complete({
      data: {
        changeDeliveryClients: {
          ...snapshot(),
          token: 'do-not-revive-token',
          accessCode: 'do-not-revive-code',
        },
      },
    });
  });
  expect(
    await screen.findByText(
      /Unsaved preparation and private portal credentials were cleared/,
    ),
  ).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Check client access again' }),
  );
  expect(screen.queryByLabelText('Client link')).not.toBeInTheDocument();
  expect(
    screen.queryByDisplayValue('do-not-revive-code'),
  ).not.toBeInTheDocument();
});

it('opens task-free commitments with the exact selected service plan and period', async () => {
  const periodId = '10000000-0000-4000-8000-000000000007';
  const router = setup(
    `/delivery?view=clients&clientView=agreements&clientEngagement=${PLAN_ID}&commitmentPeriod=${periodId}&task=old&panel=creative`,
  );
  await userEvent
    .setup()
    .click(screen.getByRole('link', { name: 'Delivery commitments' }));
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('view')).toBe('clients');
  expect(params.get('clientView')).toBeNull();
  expect(params.get('clientEngagement')).toBe(PLAN_ID);
  expect(params.get('commitmentPeriod')).toBe(periodId);
  expect(params.get('task')).toBeNull();
  expect(params.get('panel')).toBeNull();
});
it('never renders a cached parent task as a portal share choice', () => {
  workspace.tasks = [
    {
      ...taskDetailFixture().task,
      projectId: PROJECT_ID,
      title: 'PRIVATE_CACHED_PARENT_TASK',
    },
  ];
  setup();
  expect(
    screen.queryByText('PRIVATE_CACHED_PARENT_TASK'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Share approved submission' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check task access' }),
  ).toBeVisible();
});
