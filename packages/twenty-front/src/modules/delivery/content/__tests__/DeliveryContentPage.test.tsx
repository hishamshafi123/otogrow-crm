import { type ReactNode } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { NetworkStatus } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DeliveryContentPage } from '@/delivery/content/DeliveryContentPage';
import { useContentAccess } from '@/delivery/content/useContentAccess';
import { contentChoices } from '@/delivery/content/__tests__/content.fixtures';

jest.mock('@apollo/client/react', () => ({ useQuery: jest.fn() }));
jest.mock('@/delivery/content/useContentAccess', () => ({
  useContentAccess: jest.fn(),
}));
jest.mock('@/delivery/operations-pages/DeliveryOperationalPage', () => ({
  DeliveryOperationalPage: ({ children }: { children: ReactNode }) => children,
}));
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.mocked(useContentAccess).mockReturnValue({
    source: 'active',
    permission: { ready: true },
    matches: () => true,
  } as unknown as ReturnType<typeof useContentAccess>);
});
it('shows project loading without claiming access has failed', () => {
  jest.mocked(useQuery).mockReturnValue({
    loading: true,
    networkStatus: NetworkStatus.loading,
  } as unknown as ReturnType<typeof useQuery>);
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/delivery?view=content']}>
        <DeliveryContentPage />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Loading content projects…',
  );
  expect(
    screen.queryByRole('button', { name: 'Check project access' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/could not be checked/)).not.toBeInTheDocument();
});
it.each([true, false])(
  'offers a scoped empty-state next action (manager=%s)',
  (manager) => {
    jest.mocked(useQuery).mockReturnValue({
      loading: false,
      networkStatus: NetworkStatus.ready,
      data: {
        deliveryContentProjects: {
          ...contentChoices,
          isManager: manager,
          items: [],
          totalCount: 0,
          nextId: null,
        },
      },
    } as unknown as ReturnType<typeof useQuery>);
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/delivery?view=content']}>
          <DeliveryContentPage />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(
      screen.queryByRole('link', { name: 'Choose another project' }),
    ).not.toBeInTheDocument();
    if (manager)
      expect(
        screen.getByRole('link', { name: 'Set up a project' }),
      ).toHaveAttribute('href', '/delivery?view=team');
    else {
      expect(
        screen.queryByRole('link', { name: 'Set up a project' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/Ask a manager to add a project/),
      ).toBeInTheDocument();
    }
  },
);
