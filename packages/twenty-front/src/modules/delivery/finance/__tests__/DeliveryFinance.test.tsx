import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { DeliveryFinance } from '@/delivery/finance/DeliveryFinance';

jest.mock('@/delivery/finance/v2/DeliveryFinanceV2Workspace', () => ({
  DeliveryFinanceV2Workspace: () => <p>Finance V2 6-tab workspace</p>,
}));

const workspace: DeliveryWorkspace = {
  actor: { memberId: 'member', isAdmin: true, isManager: true },
  projects: [],
  members: [],
  companies: [],
  tasks: [],
};

describe('DeliveryFinance', () => {
  it('mounts the new 6-tab Finance V2 workspace', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/delivery',
          element: (
            <I18nProvider i18n={i18n}>
              <DeliveryFinance
                workspace={workspace}
                onChanged={jest.fn()}
                onOpenTask={jest.fn()}
              />
            </I18nProvider>
          ),
        },
      ],
      { initialEntries: ['/delivery?view=finance'] },
    );

    render(
      <RouterProvider router={router} future={{ v7_startTransition: true }} />,
    );

    expect(screen.getByText('Finance V2 6-tab workspace')).toBeInTheDocument();
  });
});
