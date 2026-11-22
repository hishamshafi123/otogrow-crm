import { i18n } from '@lingui/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClientServicePlans } from '@/delivery/client-workspace/ClientServicePlans';
import { type useClientSetup } from '@/delivery/onboarding/useClientSetup';

const mockMutate = jest.fn();
const mockRefetch = jest.fn();
const mockDeny = jest.fn();
jest.mock('@apollo/client/react', () => ({ useMutation: () => [mockMutate] }));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryGrid: 'div',
}));
const plan = {
  id: 'plan',
  revision: 1,
  projectId: 'project',
  name: 'Launch videos',
  services: ['AI video'],
  billing: 'RETAINER',
  scope: 'Four launch videos',
  allowance: 'Four unique videos',
  contact: 'Brand owner',
  fields: [],
  advertising: null,
};
const context = () => ({
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  selectedCompany: { id: 'company', name: 'Brand', sourceToken: 'source' },
  servicePlans: [plan],
  projects: [{ id: 'project', name: 'Launch', memberIds: [] }],
  members: [],
});
const state = () =>
  ({
    data: context(),
    source: 'workspace:company',
    denied: false,
    refreshing: false,
    busy: false,
    permission: {
      manager: true,
      matches: (value: { workspaceId?: string } | undefined) =>
        value?.workspaceId === 'workspace',
    },
    query: { refetch: mockRefetch },
    denyAccess: mockDeny,
  }) as unknown as ReturnType<typeof useClientSetup>;
const view = (value = state()) => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter>
      <ClientServicePlans
        state={value}
        projectId="project"
        retainedData={state().data}
      />
    </MemoryRouter>
  </I18nProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  i18n.load('en', {});
  i18n.activate('en');
  mockMutate.mockResolvedValue({
    data: { changeDeliveryClients: { workspaceId: 'workspace' } },
  });
  mockRefetch.mockResolvedValue({
    data: {
      deliveryClientSetup: {
        ...context(),
        servicePlans: [{ ...plan, revision: 2 }],
      },
    },
  });
});
it('shows agreed scope and exact existing workflows without opening an editor', () => {
  render(view());
  expect(screen.getByText('Four launch videos')).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Add service plan' }),
  ).toHaveAttribute('href', expect.stringContaining('setupPlanMode=new'));
  expect(screen.queryByLabelText('Service plan name')).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'View commitments' }),
  ).toHaveAttribute(
    'href',
    '/delivery?view=clients&clientEngagement=plan&clientCompany=company&clientProject=project&clientView=commitments',
  );
  expect(
    screen.getByRole('link', { name: 'Portal and onboarding' }),
  ).toHaveAttribute(
    'href',
    '/delivery?view=clients&clientEngagement=plan&clientCompany=company&clientProject=project&clientView=agreements',
  );
});
it('saves the existing plan revision and verifies its refreshed result', async () => {
  const user = userEvent.setup();
  render(view());
  await user.click(screen.getByRole('button', { name: 'Edit service plan' }));
  await user.clear(screen.getByLabelText('Service plan name'));
  await user.type(screen.getByLabelText('Service plan name'), 'Updated launch');
  await user.click(screen.getByRole('button', { name: 'Save service plan' }));
  await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: {
        action: 'engagement',
        engagement: expect.objectContaining({
          id: 'plan',
          revision: 1,
          projectId: 'project',
          name: 'Updated launch',
        }),
      },
    },
  });
  await waitFor(() =>
    expect(
      screen.queryByLabelText('Service plan name'),
    ).not.toBeInTheDocument(),
  );
});
it('preserves an edited draft and blocks saving after another revision arrives', async () => {
  const user = userEvent.setup();
  const rendered = render(view());
  await user.click(screen.getByRole('button', { name: 'Edit service plan' }));
  await user.type(screen.getByLabelText('Service plan name'), ' draft');
  const next = state();
  if (next.data) next.data.servicePlans = [{ ...plan, revision: 2 }];
  rendered.rerender(view(next));
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Launch videos draft',
  );
  expect(
    screen.getByRole('button', { name: 'Save service plan' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Reload latest version' }),
  ).toBeVisible();
  expect(mockMutate).not.toHaveBeenCalled();
});
it('requires a refresh before retrying an uncertain save', async () => {
  mockMutate.mockRejectedValue(new Error('Network unavailable'));
  const user = userEvent.setup();
  render(view());
  await user.click(screen.getByRole('button', { name: 'Edit service plan' }));
  await user.type(screen.getByLabelText('Service plan name'), ' draft');
  await user.click(screen.getByRole('button', { name: 'Save service plan' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saving could not be confirmed',
  );
  expect(
    screen.getByRole('button', { name: 'Save service plan' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Launch videos draft',
  );
  await user.click(
    screen.getByRole('button', { name: 'Refresh service plan' }),
  );
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(mockMutate).toHaveBeenCalledTimes(1);
});
it('hides private scope and discards the editor when access is denied', async () => {
  const user = userEvent.setup();
  const rendered = render(view());
  await user.click(screen.getByRole('button', { name: 'Edit service plan' }));
  rendered.rerender(view({ ...state(), denied: true }));
  expect(screen.queryByText('Four launch videos')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Service plan name')).not.toBeInTheDocument();
  rendered.rerender(view());
  expect(screen.queryByLabelText('Service plan name')).not.toBeInTheDocument();
});
it('disables opening an editor while the source is refreshing', () => {
  render(view({ ...state(), refreshing: true }));
  expect(
    screen.getByRole('button', { name: 'Edit service plan' }),
  ).toBeDisabled();
});

it('denies access when the mutation rejects the current permission', async () => {
  mockMutate.mockRejectedValue(
    new CombinedGraphQLErrors({
      errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
    }),
  );
  const user = userEvent.setup();
  render(view());
  await user.click(screen.getByRole('button', { name: 'Edit service plan' }));
  await user.type(screen.getByLabelText('Service plan name'), ' draft');
  await user.click(screen.getByRole('button', { name: 'Save service plan' }));
  await waitFor(() => expect(mockDeny).toHaveBeenCalledTimes(1));
  expect(mockRefetch).not.toHaveBeenCalled();
});
it('does not accept a mutation result from another workspace', async () => {
  mockMutate.mockResolvedValue({
    data: { changeDeliveryClients: { workspaceId: 'other-workspace' } },
  });
  const user = userEvent.setup();
  render(view());
  await user.click(screen.getByRole('button', { name: 'Edit service plan' }));
  await user.type(screen.getByLabelText('Service plan name'), ' draft');
  await user.click(screen.getByRole('button', { name: 'Save service plan' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saving could not be confirmed',
  );
  expect(mockRefetch).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Save service plan' }),
  ).toBeDisabled();
});

it('preserves a hidden disabled draft during a source outage and restores it', async () => {
  const user = userEvent.setup();
  const rendered = render(view());
  await user.click(screen.getByRole('button', { name: 'Edit service plan' }));
  await user.type(screen.getByLabelText('Service plan name'), ' draft');
  rendered.rerender(view({ ...state(), data: null }));
  expect(screen.getByLabelText('Service plan name')).not.toBeVisible();
  expect(screen.getByLabelText('Service plan name')).toBeDisabled();
  rendered.rerender(
    view({ ...state(), source: 'workspace:company:new-search' }),
  );
  expect(screen.getByLabelText('Service plan name')).toBeVisible();
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Launch videos draft',
  );
  expect(
    screen.getByRole('button', { name: 'Save service plan' }),
  ).toBeEnabled();
});
it('releases the saving lock after an outage invalidates a pending save and permits verified retry', async () => {
  let rejectSave: (reason: Error) => void = () => undefined;
  mockMutate.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
  );
  const user = userEvent.setup();
  const rendered = render(view());
  await user.click(screen.getByRole('button', { name: 'Edit service plan' }));
  await user.type(screen.getByLabelText('Service plan name'), ' draft');
  await user.click(screen.getByRole('button', { name: 'Save service plan' }));
  rendered.rerender(view({ ...state(), data: null }));
  await act(async () => rejectSave(new Error('Connection interrupted')));
  rendered.rerender(view());
  expect(
    screen.getByRole('button', { name: 'Refresh service plan' }),
  ).toBeEnabled();
  expect(
    screen.getByRole('button', { name: 'Save service plan' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Refresh service plan' }),
  );
  expect(
    screen.getByRole('button', { name: 'Save service plan' }),
  ).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Save service plan' }));
  expect(mockMutate).toHaveBeenCalledTimes(2);
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
