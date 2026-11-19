import { type ReactNode } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryCommitmentsPage } from '@/delivery/commitments/DeliveryCommitmentsPage';
let mockManager = true;
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({ manager: mockManager }),
}));
jest.mock('@/delivery/operations-pages/DeliveryOperationalPage', () => ({
  DeliveryOperationalPage: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
jest.mock('@/delivery/commitments/DeliveryCommitmentDirectory', () => ({
  DeliveryCommitmentDirectory: () => <p>Authorized commitment directory</p>,
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));
const setup = (entry: string) => {
  const router = createMemoryRouter(
    [{ path: '/delivery', element: <DeliveryCommitmentsPage /> }],
    { initialEntries: [entry] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return { router, user: userEvent.setup() };
};
beforeAll(() => Object.assign(globalThis, { Request }));
beforeEach(() => {
  mockManager = true;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});
it('preserves the exact selected service plan and period when opening agreements', () => {
  setup(
    '/delivery?view=clients&clientEngagement=plan&commitmentPeriod=period&search=keep',
  );
  expect(
    screen.getByRole('link', { name: 'Service agreements & client portals' }),
  ).toHaveAttribute(
    'href',
    '/delivery?view=clients&clientEngagement=plan&commitmentPeriod=period&search=keep&clientView=agreements',
  );
  expect(screen.getByText('Authorized commitment directory')).toBeVisible();
});
it('explains an unknown client view and removes only that selection during explicit recovery', async () => {
  const { user, router } = setup(
    '/delivery?view=clients&clientView=unknown&clientEngagement=plan&commitmentPeriod=period',
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'This client view is unavailable',
  );
  await user.click(
    screen.getByRole('link', { name: 'Use the commitments view' }),
  );
  expect(router.state.location.search).toBe(
    '?view=clients&clientEngagement=plan&commitmentPeriod=period',
  );
});
it('keeps assigned staff focused on their commitment directory without manager agreement actions', () => {
  mockManager = false;
  setup('/delivery?view=clients');
  expect(screen.getByText('Authorized commitment directory')).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Service agreements & client portals' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Set up client work' }),
  ).not.toBeInTheDocument();
});
