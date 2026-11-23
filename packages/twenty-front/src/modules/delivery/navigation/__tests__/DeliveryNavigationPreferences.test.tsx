import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { useDeliveryNavigation } from '@/delivery/useDeliveryNavigation';
import { useDeliveryNavigationPreferences } from '@/delivery/navigation/useDeliveryNavigationPreferences';
import { DeliveryNavigationPreferences } from '@/delivery/navigation/DeliveryNavigationPreferences';
import { type OtogrowAccess } from '@/otogrow-access/otogrow-access.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
let mockAccess: OtogrowAccess;
let mockReady = true;
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({
    access: mockReady ? mockAccess : undefined,
    scopeKey: mockReady
      ? `${mockAccess.workspaceId}:${mockAccess.memberId}:${mockAccess.userWorkspaceId}`
      : null,
    loading: !mockReady,
    canReadFinance:
      mockReady && mockAccess.capabilities.includes('finance.read'),
  }),
}));

const Workspace = () => {
  const actor = {
    memberId: mockAccess.memberId,
    isAdmin: true,
    isManager: true,
  };
  const groups = useDeliveryNavigation(actor);
  const personal = useDeliveryNavigationPreferences(actor, groups);
  return (
    <>
      <DeliveryNavigationPreferences personalNavigation={personal} />
      <output aria-label="Start destination">
        {personal.preferences.startView}
      </output>
      <output aria-label="Pinned destinations">
        {personal.preferences.pinnedViews.join(',')}
      </output>
    </>
  );
};
const view = (store: ReturnType<typeof createStore>) => (
  <Provider store={store}>
    <I18nProvider i18n={i18n}>
      <Workspace />
    </I18nProvider>
  </Provider>
);
beforeEach(() => {
  localStorage.clear();
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockReady = true;
  mockAccess = {
    workspaceId: crypto.randomUUID(),
    memberId: 'member',
    userWorkspaceId: 'membership',
    roleIds: [],
    capabilities: ['workspace.admin', 'finance.read'],
    nativeAdministrator: true,
    grants: [],
  };
});
const open = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByText('Personalize workspace'));
  return user;
};
it('applies personal choices, preserves them after remount, and resets to role defaults', async () => {
  const first = render(view(createStore()));
  const user = await open();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Start page' }),
    'creative',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Creative studio' }));
  expect(screen.getByLabelText('Start destination')).toHaveTextContent(
    'creative',
  );
  expect(screen.getByLabelText('Pinned destinations')).toHaveTextContent(
    'creative',
  );
  first.unmount();
  render(view(createStore()));
  expect(screen.getByLabelText('Start destination')).toHaveTextContent(
    'creative',
  );
  await open();
  await user.click(screen.getByRole('button', { name: 'Use role defaults' }));
  expect(screen.getByLabelText('Start destination')).toHaveTextContent(
    'health',
  );
  expect(
    screen.getByRole('checkbox', { name: 'Creative studio' }),
  ).not.toBeChecked();
});
it('keeps one person’s choices out of another membership and filters revoked destinations', async () => {
  const store = createStore();
  const { rerender } = render(view(store));
  const user = await open();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Start page' }),
    'finance',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Finance' }));
  const original = mockAccess;
  mockAccess = {
    ...original,
    memberId: 'other-member',
    userWorkspaceId: 'other-membership',
  };
  rerender(view(store));
  expect(screen.getByLabelText('Start destination')).toHaveTextContent(
    'health',
  );
  expect(screen.getByRole('checkbox', { name: 'Finance' })).not.toBeChecked();
  mockAccess = original;
  rerender(view(store));
  expect(screen.getByLabelText('Start destination')).toHaveTextContent(
    'finance',
  );
  mockAccess = { ...original, capabilities: [], nativeAdministrator: false };
  rerender(view(store));
  expect(screen.getByLabelText('Start destination')).toHaveTextContent('mine');
  expect(
    screen.queryByRole('checkbox', { name: 'Finance' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('checkbox', { name: 'Team activity' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Pinned destinations')).not.toHaveTextContent(
    'finance',
  );
});
it('disables edits while access is unverified and restores preferences on recovery', async () => {
  const store = createStore();
  const { rerender } = render(view(store));
  const user = await open();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Start page' }),
    'creative',
  );
  mockReady = false;
  rerender(view(store));
  expect(screen.getByRole('combobox', { name: 'Start page' })).toBeDisabled();
  expect(screen.getByLabelText('Pinned destinations')).toBeEmptyDOMElement();
  mockReady = true;
  rerender(view(store));
  expect(screen.getByRole('combobox', { name: 'Start page' })).toHaveValue(
    'creative',
  );
});
it('explains unavailable browser storage without changing access', async () => {
  render(view(createStore()));
  const user = await open();
  const write = jest
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Start page' }),
    'creative',
  );
  expect(screen.getByRole('alert')).toHaveTextContent('only for this session');
  expect(mockAccess.capabilities).toEqual(['workspace.admin', 'finance.read']);
  act(() => write.mockRestore());
});
