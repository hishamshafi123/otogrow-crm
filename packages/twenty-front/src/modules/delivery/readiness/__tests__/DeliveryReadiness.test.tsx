import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryReadiness } from '@/delivery/readiness/DeliveryReadiness';
import { type DeliveryReadinessQuery } from '~/generated-metadata/graphql';

type ReadinessSnapshot = DeliveryReadinessQuery['deliveryReadiness'];
type ReadinessItem = ReadinessSnapshot['items'][number];
const mockRefetch = jest.fn().mockResolvedValue({});
let mockReady = true;
let mockAdmin = true;
let mockError: Error | undefined;
let mockLoading = false;
let mockSnapshot: ReadinessSnapshot;
const mockQueryOptions = jest.fn();
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canManageRoles: mockAdmin,
    scope: 'workspace:member',
    matches: (data: ReadinessSnapshot | undefined) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === 'member' &&
      data.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (_query: unknown, options: unknown) => {
    mockQueryOptions(options);
    return {
      data: { deliveryReadiness: mockSnapshot },
      error: mockError,
      loading: mockLoading,
      refetch: mockRefetch,
    };
  },
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCard: 'section',
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
const item = (
  id: string,
  capability: string,
  status: string,
  reason: string,
  destination: string,
): ReadinessItem => ({
  id,
  capability,
  status,
  reason,
  destination,
  accountName: null,
  lastSuccessAt: null,
});
const setup = (entry = '/delivery?view=health') => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  const router = createMemoryRouter(
    [{ path: '/delivery', element: <DeliveryReadiness /> }],
    { initialEntries: [entry] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return router;
};
beforeEach(() => {
  mockReady = true;
  mockAdmin = true;
  mockError = undefined;
  mockLoading = false;
  mockRefetch.mockClear();
  mockQueryOptions.mockClear();
  mockSnapshot = {
    workspaceId: 'workspace',
    memberId: 'member',
    userWorkspaceId: 'membership',
    observedAt: '2026-10-27T08:00:00Z',
    items: [
      {
        ...item('meta', 'META', 'PAUSED', 'META_PAUSED', 'ads'),
        accountName: 'Client account',
        lastSuccessAt: '2026-10-26T03:00:00Z',
      },
      item('email', 'EMAIL_OS', 'NOT_IMPLEMENTED', 'EMAIL_BRIDGE', 'inbox'),
      item(
        'competitors',
        'COMPETITOR_COLLECTION',
        'MANUAL',
        'COMPETITOR_MANUAL',
        'competitors',
      ),
      item(
        'knowledge',
        'BRAND_KNOWLEDGE',
        'AVAILABLE',
        'KNOWLEDGE_REVIEWED',
        'knowledge',
      ),
    ],
  };
});
it('shows distinct operational meanings and real destinations without inferring a healthy schedule from past success', () => {
  setup();
  const list = screen.getByRole('list');
  expect(within(list).getByText('Paused')).toBeVisible();
  expect(within(list).getByText('Not implemented')).toBeVisible();
  expect(within(list).getByText('Manual workflow')).toBeVisible();
  expect(within(list).getByText('Available')).toBeVisible();
  expect(within(list).queryByText('Connected')).not.toBeInTheDocument();
  expect(screen.getByText(/Automatic imports are off/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open Inbox' })).toHaveAttribute(
    'href',
    '/delivery?view=inbox',
  );
});
it('restores the status filter from a URL and retains it through browser history', async () => {
  const router = setup('/delivery?view=health&readinessStatus=MANUAL');
  expect(
    screen.getByRole('combobox', { name: 'Show capability status' }),
  ).toHaveValue('MANUAL');
  expect(
    screen.queryByText('Gmail / email in the OS inbox'),
  ).not.toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Show capability status' }),
    'PAUSED',
  );
  expect(router.state.location.search).toContain('readinessStatus=PAUSED');
  await act(async () => {
    await router.navigate(-1);
  });
  expect(
    screen.getByRole('combobox', { name: 'Show capability status' }),
  ).toHaveValue('MANUAL');
  await act(async () => {
    await router.navigate(1);
  });
  expect(screen.getByText('Meta reporting · Client account')).toBeVisible();
});
it('removes the filter for All and handles an unsupported URL status without inventing results', async () => {
  const router = setup('/delivery?view=health&readinessStatus=toString');
  expect(
    screen.getByRole('combobox', { name: 'Show capability status' }),
  ).toHaveValue('ALL');
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Show capability status' }),
    'PAUSED',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Show capability status' }),
    'ALL',
  );
  expect(router.state.location.search).toBe('?view=health');
});
it('offers an empty-state explanation when a valid filter has no entries', () => {
  setup('/delivery?view=health&readinessStatus=CONNECTED');
  expect(screen.getByText('No capabilities match this status.')).toBeVisible();
});
it('hides prior status on an error and offers an explicit retry', async () => {
  mockError = new Error('Network failure');
  setup();
  expect(
    screen.queryByText('Meta reporting · Client account'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Readiness could not be checked',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh readiness' }),
  );
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
it('does not expose a foreign member snapshot', () => {
  mockSnapshot.memberId = 'other';
  setup();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Loading capability status',
  );
});
it('withholds workspace checks from a non-admin even if cached data is present', () => {
  mockAdmin = false;
  setup();
  expect(mockQueryOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({ skip: true }),
  );
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Refresh readiness' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/An administrator can inspect/)).toBeVisible();
});
it('shows access checking while authorization is unresolved', () => {
  mockReady = false;
  setup();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Checking readiness access',
  );
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});
it('does not fabricate a label, explanation or navigation for an unknown contract value', () => {
  mockSnapshot.items = [
    item(
      'future',
      'UNKNOWN',
      'UNSUPPORTED',
      'UNKNOWN',
      'https://external.invalid',
    ),
  ];
  setup();
  expect(screen.getByText('Unknown capability')).toBeVisible();
  expect(screen.getByText('Status unavailable')).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
