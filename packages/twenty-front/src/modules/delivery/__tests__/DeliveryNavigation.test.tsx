import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, useNavigate } from 'react-router-dom';
import { DeliveryNavigation } from '@/delivery/DeliveryNavigation';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';

jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerSection',
  () => ({
    NavigationDrawerSection: 'section',
  }),
);
jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem',
  () => ({
    NavigationDrawerItem: ({
      label,
      to,
      active,
    }: {
      label: string;
      to: string;
      active?: boolean;
    }) => (
      <Link to={to} aria-current={active ? 'page' : undefined}>
        {label}
      </Link>
    ),
  }),
);
let mockActor: DeliveryWorkspace['actor'];
let mockFinanceReader = false;
let mockReviewOnly = false;
let mockPersonalNavigation = false;
const mockWorkspaceQuery = jest.fn(() => {
  throw new Error(
    'The sidebar must use verified access without loading tasks.',
  );
});
jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerAnimatedCollapseWrapper',
  () => ({ NavigationDrawerAnimatedCollapseWrapper: 'div' }),
);
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({
    canReadFinance: mockActor.isAdmin || mockFinanceReader,
    access: {
      workspaceId: 'workspace',
      memberId: mockActor.memberId,
      userWorkspaceId: 'membership',
      roleIds: [],
      capabilities: mockActor.isAdmin
        ? ['workspace.admin']
        : mockActor.isManager
          ? ['delivery.manage']
          : mockReviewOnly
            ? ['delivery.review']
            : [],
      grants: [],
      nativeAdministrator: mockActor.isAdmin,
    },
    scopeKey: mockPersonalNavigation ? 'navigation-test-identity' : null,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: () => mockWorkspaceQuery(),
}));
// oxlint-disable twenty/no-navigate-prefer-link -- This control simulates browser history rather than a destination link.
const BrowserBack = () => {
  const navigate = useNavigate();
  const goBack = () => navigate(-1);
  return <button onClick={goBack}>Browser back</button>;
};
// oxlint-enable twenty/no-navigate-prefer-link
const setup = (entry = '/delivery?view=mine') => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[entry]}>
        <BrowserBack />
        <DeliveryNavigation />
      </MemoryRouter>
    </I18nProvider>,
  );
  return userEvent.setup();
};
beforeEach(() => {
  mockWorkspaceQuery.mockClear();
  mockFinanceReader = false;
  mockReviewOnly = false;
  mockPersonalNavigation = false;
  mockActor = { memberId: 'manager', isAdmin: true, isManager: true };
});

afterEach(() => {
  expect(mockWorkspaceQuery).not.toHaveBeenCalled();
});

describe('Otogrow sidebar navigation', () => {
  it('keeps contextual onboarding under Clients without adding another destination', () => {
    setup('/delivery?view=onboarding');
    const navigation = within(
      screen.getByRole('navigation', { name: 'Otogrow navigation' }),
    );
    expect(navigation.getByRole('link', { name: 'Clients' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(navigation.getByRole('link', { name: 'Clients' })).toHaveAttribute(
      'href',
      '/delivery?view=clients',
    );
    expect(
      navigation.queryByRole('link', { name: /onboarding/i }),
    ).not.toBeInTheDocument();
    expect(mockWorkspaceQuery).not.toHaveBeenCalled();
  });
  it('expands the current group and follows browser history', async () => {
    const user = setup();
    const navigation = within(
      screen.getByRole('navigation', { name: 'Otogrow navigation' }),
    );
    expect(navigation.getByRole('link', { name: 'My tasks' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      navigation.getByRole('link', { name: 'Delivery & reminders' }),
    ).toHaveAttribute('href', '/delivery?view=operations');
    expect(
      navigation.getByRole('link', { name: 'Advertising' }),
    ).not.toBeVisible();
    await user.click(navigation.getByTitle('Growth'));
    await user.click(navigation.getByRole('link', { name: 'Advertising' }));
    expect(
      navigation.getByRole('link', { name: 'Advertising' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      navigation.getByRole('link', { name: 'Competitor research' }),
    ).toHaveAttribute('href', '/delivery?view=competitors');
    expect(
      navigation.getByRole('link', { name: 'My tasks' }),
    ).not.toBeVisible();
    await user.click(navigation.getByRole('link', { name: 'Content' }));
    expect(navigation.getByRole('link', { name: 'Content' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(
      navigation.getByRole('link', { name: 'Advertising' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('does not expose administrative or manager destinations to an employee', async () => {
    mockActor = { memberId: 'editor', isAdmin: false, isManager: false };
    const user = setup();
    const navigation = within(
      screen.getByRole('navigation', { name: 'Otogrow navigation' }),
    );
    for (const name of [
      'Business',
      'Clients',
      'Finance',
      'Team planner',
      'Approvals',
      'Team & projects',
      'Company overview',
      'Team activity',
    ])
      expect(navigation.queryByRole('link', { name })).not.toBeInTheDocument();
    for (const name of [
      'Today',
      'AI assistants',
      'My tasks',
      'Creative studio',
      'Delivery & reminders',
      'Development',
    ])
      expect(navigation.getByRole('link', { name })).toBeInTheDocument();
    for (const label of ['Work', 'Client work', 'Inbox', 'Growth'])
      expect(navigation.getByTitle(label)).toBeInTheDocument();
    await user.click(navigation.getByTitle('Client work'));
    expect(
      navigation.getByRole('link', { name: 'Client commitments' }),
    ).toHaveAttribute('href', '/delivery?view=clients');
    expect(
      navigation.getByRole('link', { name: 'Brand knowledge' }),
    ).toBeInTheDocument();
  });

  it('gives a manager team setup without founder financial access', () => {
    mockFinanceReader = false;
    mockActor = { memberId: 'manager', isAdmin: false, isManager: true };
    setup('/delivery?view=team');
    const navigation = within(
      screen.getByRole('navigation', { name: 'Otogrow navigation' }),
    );
    expect(
      navigation.getByRole('link', { name: 'Team & projects' }),
    ).toHaveAttribute('href', '/delivery?view=team');
    expect(
      navigation.queryByRole('link', { name: 'Finance' }),
    ).not.toBeInTheDocument();
    expect(
      navigation.queryByRole('link', { name: 'Company overview' }),
    ).not.toBeInTheDocument();
    expect(
      navigation.queryByRole('link', { name: 'Team activity' }),
    ).not.toBeInTheDocument();
    expect(
      navigation.getByRole('link', { name: 'Team & projects' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the active financial destination visible for an administrator deep link', () => {
    setup('/delivery?view=finance');
    const navigation = within(
      screen.getByRole('navigation', { name: 'Otogrow navigation' }),
    );
    expect(navigation.getByRole('link', { name: 'Finance' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      navigation.getByRole('link', { name: 'Team & projects' }),
    ).toHaveAttribute('href', '/delivery?view=team');
    expect(
      navigation.getByRole('link', { name: 'Company overview' }),
    ).toBeInTheDocument();
  });

  it('makes the administrator activity destination discoverable and marks its deep link active', () => {
    setup('/delivery?view=activity');
    const navigation = within(
      screen.getByRole('navigation', { name: 'Otogrow navigation' }),
    );
    expect(
      navigation.getByRole('link', { name: 'Team activity' }),
    ).toHaveAttribute('href', '/delivery?view=activity');
    expect(
      navigation.getByRole('link', { name: 'Team activity' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      navigation.getByRole('link', { name: 'Team & projects' }),
    ).toBeInTheDocument();
  });
});

it('shows a finance-only business section without team administration', async () => {
  mockActor = { memberId: 'reader', isAdmin: false, isManager: false };
  mockFinanceReader = true;
  setup('/delivery?view=finance');
  expect(screen.getByRole('link', { name: 'Finance' })).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Team & projects' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Company overview' }),
  ).not.toBeInTheDocument();
});

it('adds Approvals for a scoped review role without granting planner, workflow administration or finances', () => {
  mockActor = { memberId: 'reviewer', isAdmin: false, isManager: false };
  mockReviewOnly = true;
  setup('/delivery?view=reviews');
  expect(screen.getByRole('link', { name: 'Approvals' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(
    screen.queryByRole('link', { name: 'Team planner', hidden: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Service workflows', hidden: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Finance', hidden: true }),
  ).not.toBeInTheDocument();
});
it('shows each pinned destination once and keeps the remaining areas discoverable', () => {
  mockPersonalNavigation = true;
  setup('/delivery?view=home');
  const pinned = within(
    screen.getByRole('navigation', { name: 'Pinned workspace pages' }),
  );
  expect(pinned.getByRole('link', { name: 'Today' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getAllByRole('link', { name: 'Today' })).toHaveLength(1);
  expect(screen.getAllByRole('link', { name: 'Clients' })).toHaveLength(1);
  expect(
    screen.getByRole('link', { name: 'Brand knowledge' }),
  ).toBeInTheDocument();
});
