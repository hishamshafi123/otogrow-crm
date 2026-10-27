import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { OtogrowTeamRoles } from '@/otogrow-access/OtogrowTeamRoles';
import {
  type OtogrowRoleDirectory,
  type OtogrowAccess,
} from '@/otogrow-access/otogrow-access.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
const mockMutation = jest.fn();
const mockRefetch = jest.fn();
const mockChanged = jest.fn();
const mockAccess: OtogrowAccess = {
  workspaceId: 'workspace',
  memberId: 'founder',
  userWorkspaceId: 'membership',
  roleIds: [],
  capabilities: ['workspace.admin', 'delivery.manage', 'phone.use'],
  nativeAdministrator: true,
  grants: [],
};
let mockDirectory: OtogrowRoleDirectory;
let mockLoading = false;
let mockQueryError: Error | undefined;
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({
    access: mockAccess,
    scopeKey: 'workspace:founder',
    canManageRoles: true,
    refetch: mockRefetch,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutation, { loading: false }],
  useQuery: () => ({
    data: { otogrowRoleDirectory: mockDirectory },
    loading: mockLoading,
    error: mockQueryError,
    refetch: mockRefetch,
  }),
}));
const setup = () =>
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <OtogrowTeamRoles onChanged={mockChanged} />
      </ThemeProvider>
    </I18nProvider>,
  );
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockLoading = false;
  mockQueryError = undefined;
  mockMutation.mockReset().mockResolvedValue({});
  mockChanged.mockReset().mockResolvedValue(undefined);
  mockDirectory = {
    actor: mockAccess,
    roles: [
      {
        id: 'marketing',
        name: 'Marketing',
        description: '',
        capabilities: [],
        revision: 0,
      },
      {
        id: 'sales',
        name: 'Sales',
        description: '',
        capabilities: ['phone.use'],
        revision: 0,
      },
    ],
    members: [
      {
        memberId: 'founder',
        name: 'Founder',
        roleIds: [],
        revision: 0,
        access: mockAccess,
      },
      {
        memberId: 'amna',
        name: 'Amna',
        roleIds: ['marketing'],
        revision: 1,
        access: {
          ...mockAccess,
          memberId: 'amna',
          nativeAdministrator: false,
          capabilities: [],
          grants: [],
        },
      },
    ],
  };
  mockRefetch.mockReset().mockImplementation(async () => ({
    data: { otogrowRoleDirectory: mockDirectory },
  }));
});
it('previews multiple-role access with its source and saves only after confirmation', async () => {
  setup();
  expect(
    screen.getByRole('button', { name: 'Edit roles for Founder' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit roles for Amna' }),
  );
  const preview = within(
    screen.getByRole('region', { name: 'Combined access preview' }),
  );
  expect(preview.getByText('Use the phone:').parentElement).toHaveTextContent(
    'Use the phone: Not granted',
  );
  await userEvent.click(screen.getByRole('checkbox', { name: 'Sales' }));
  expect(preview.getByText('Use the phone:').parentElement).toHaveTextContent(
    'Use the phone: Allowed',
  );
  expect(preview.getByText(/From: Sales/)).toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Save access' }));
  await waitFor(() =>
    expect(mockMutation).toHaveBeenCalledWith({
      variables: {
        input: {
          memberId: 'amna',
          roleIds: ['marketing', 'sales'],
          revision: 1,
          roleRevisions: [
            { id: 'marketing', revision: 0 },
            { id: 'sales', revision: 0 },
          ],
        },
      },
    }),
  );
  expect(await screen.findByText('Access changes saved.')).toBeInTheDocument();
  expect(mockChanged).toHaveBeenCalledTimes(1);
});
it('retains the chosen roles and old preview on conflict until explicitly reloading the latest version', async () => {
  mockMutation.mockRejectedValueOnce(new Error('Conflict'));
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit roles for Amna' }),
  );
  await userEvent.click(screen.getByRole('checkbox', { name: 'Sales' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save access' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your edits are still here',
  );
  expect(screen.getByRole('checkbox', { name: 'Sales' })).toBeChecked();
  mockDirectory = {
    ...mockDirectory,
    roles: mockDirectory.roles.map((role) =>
      role.id === 'sales' ? { ...role, capabilities: [], revision: 2 } : role,
    ),
    members: mockDirectory.members.map((member) => ({
      ...member,
      revision: 3,
    })),
  };
  expect(screen.getByText('Use the phone:').parentElement).toHaveTextContent(
    'Use the phone: Allowed',
  );
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Reload latest version and keep edits',
    }),
  );
  await waitFor(() =>
    expect(screen.getByText('Use the phone:').parentElement).toHaveTextContent(
      'Use the phone: Not granted',
    ),
  );
  expect(screen.getByRole('checkbox', { name: 'Sales' })).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Save access' }));
  await waitFor(() =>
    expect(mockMutation.mock.calls[1][0].variables.input).toMatchObject({
      revision: 3,
      roleRevisions: [
        { id: 'marketing', revision: 0 },
        { id: 'sales', revision: 2 },
      ],
    }),
  );
});
it('shows native grants separately and does not imply phone access from administration alone', async () => {
  mockDirectory.members[1].access.grants = [
    {
      capability: 'phone.use',
      sourceId: 'native-role',
      sourceName: 'CRM Administrator',
      sourceType: 'native',
    },
  ];
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit roles for Amna' }),
  );
  expect(
    screen.getByText(/CRM Administrator \(inherited from native CRM\)/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await userEvent.click(screen.getByRole('button', { name: 'Roles' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create role' }));
  await userEvent.type(screen.getByLabelText('Role name'), 'Delivery lead');
  await userEvent.click(
    screen.getByRole('checkbox', { name: /Administer Otogrow OS/ }),
  );
  expect(
    screen.getByText('Plan and review all projects:').parentElement,
  ).toHaveTextContent('Plan and review all projects: Allowed');
  expect(screen.getByText('Use the phone:').parentElement).toHaveTextContent(
    'Use the phone: Not granted',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save access' }));
  await waitFor(() =>
    expect(mockMutation.mock.calls[0][0].variables.input).toMatchObject({
      name: 'Delivery lead',
      capabilities: ['workspace.admin'],
    }),
  );
});

it.each(['workspaceId', 'memberId', 'userWorkspaceId'] as const)(
  'does not show a directory from a different %s',
  (key) => {
    mockDirectory.actor = { ...mockAccess, [key]: 'previous-identity' };
    setup();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading access for this workspace',
    );
    expect(screen.queryByText('Amna')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit roles for Amna' }),
    ).not.toBeInTheDocument();
  },
);
it('blocks editing retained directory data while loading or after a query error', () => {
  mockLoading = true;
  const loading = setup();
  expect(screen.queryByText('Amna')).not.toBeInTheDocument();
  loading.unmount();
  mockLoading = false;
  mockQueryError = new Error('Network unavailable');
  setup();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not load people and roles',
  );
  expect(screen.queryByText('Amna')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
it('explains a duplicate role name without discarding the role draft', async () => {
  mockMutation.mockRejectedValueOnce(new Error('Choose a unique role name.'));
  setup();
  expect(screen.getByText('No business roles assigned')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Roles' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create role' }));
  await userEvent.type(screen.getByLabelText('Role name'), 'Sales');
  await userEvent.click(screen.getByRole('button', { name: 'Save access' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A role already has that name. Choose a different name.',
  );
  expect(screen.getByLabelText('Role name')).toHaveValue('Sales');
});

it('explains finance editing inheritance without granting phone or administration', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Roles' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create role' }));
  await userEvent.click(
    screen.getByRole('checkbox', { name: /Record and correct finances/ }),
  );
  const preview = within(
    screen.getByRole('region', { name: 'Combined access preview' }),
  );
  expect(
    preview.getByText('View and export finances:').parentElement,
  ).toHaveTextContent('Allowed');
  expect(
    preview.getByText('Record and correct finances:').parentElement,
  ).toHaveTextContent('Allowed');
  expect(preview.getByText('Use the phone:').parentElement).toHaveTextContent(
    'Not granted',
  );
  expect(
    preview.getByText('Administer Otogrow OS:').parentElement,
  ).toHaveTextContent('Not granted');
  expect(screen.getByText(/salary allocations/)).toBeInTheDocument();
});
