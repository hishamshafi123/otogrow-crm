import { type ReactNode } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Request } from 'cross-fetch';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryHandoffForm } from '@/delivery/handoffs/DeliveryHandoffForm';
import { DeliveryHandoffs } from '@/delivery/handoffs/DeliveryHandoffs';
import { GET_HANDOFFS } from '@/delivery/handoffs/delivery-handoffs.graphql';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  type DeliveryHandoffPreviewQuery,
  type DeliveryHandoffsQuery,
} from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
}));
let permitted = true,
  queryError: Error | undefined;
let directory: DeliveryHandoffsQuery['deliveryHandoffs'];
const refetch = jest.fn(),
  mutate = jest.fn();
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: true,
    scope: 'identity',
    manager: permitted,
    access: { capabilities: ['finance.read'] },
    matches: () => true,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (document: unknown) => ({
    data:
      document === GET_HANDOFFS ? { deliveryHandoffs: directory } : undefined,
    error: queryError,
    refetch,
  }),
  useMutation: () => [mutate],
}));
const source: DeliveryHandoffPreviewQuery['deliveryHandoffPreview']['source'] =
  {
    opportunityId: 'deal',
    opportunityName: 'October creative package',
    companyId: 'company',
    companyName: 'Example brand',
    quoteId: 'quote',
    quoteNumber: 'Q-1',
    scope: '6 unique videos; variants agreed separately.',
    fingerprint: 'original',
    currency: 'USD',
    totalAmountMicros: '1250000000',
  };
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'owner', isAdmin: true, isManager: true },
  projects: [],
  tasks: [],
  companies: [],
  members: [
    {
      id: 'owner',
      name: 'Amna',
      access: 'MANAGER',
      roleLabel: '',
    },
    {
      id: 'reviewer',
      name: 'Founder',
      access: 'ADMIN',
      roleLabel: '',
    },
    {
      id: 'editor',
      name: 'Editor',
      access: 'MEMBER',
      roleLabel: '',
    },
  ],
};
const wrapper = (content: ReactNode) => (
  <I18nProvider i18n={i18n}>
    <RouterProvider
      router={createMemoryRouter([
        {
          path: '/',
          element: (
            <DeliveryDraftGuardProvider>{content}</DeliveryDraftGuardProvider>
          ),
        },
      ])}
    />
  </I18nProvider>
);
const show = (content: ReactNode) => render(wrapper(content));
const fill = async () => {
  await userEvent.selectOptions(
    screen.getByLabelText('Delivery setup owner'),
    'owner',
  );
  await userEvent.selectOptions(
    screen.getByLabelText('Independent setup reviewer'),
    'reviewer',
  );
  await userEvent.selectOptions(
    screen.getByLabelText('Billing arrangement'),
    'RETAINER',
  );
  await userEvent.type(
    screen.getByLabelText('Services (comma separated)'),
    'AI videos, SEO, AI videos',
  );
  await userEvent.type(
    screen.getByLabelText('Client contact and coordination notes'),
    'Client marketing lead',
  );
  await userEvent.click(
    screen.getByLabelText('I reviewed the imported scope and delivery owners.'),
  );
};
beforeEach(() => {
  permitted = true;
  queryError = undefined;
  refetch.mockReset().mockResolvedValue({});
  mutate.mockReset();
  directory = {
    workspaceId: 'workspace',
    memberId: 'owner',
    userWorkspaceId: 'membership',
    search: '',
    hasMore: false,
    opportunities: [
      {
        id: 'deal',
        name: source.opportunityName,
        hasCompany: true,
        quotes: [{ id: 'quote', name: 'Q-1' }],
      },
    ],
    handoffs: [],
  };
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
it('imports scope and quoted amount, requires explicit choices, then submits only reviewed source identity and setup choices', async () => {
  const save = jest.fn().mockResolvedValue(true),
    close = jest.fn();
  show(
    <DeliveryHandoffForm
      source={source}
      latest={source}
      ready
      workspace={workspace}
      onSave={save}
      onClose={close}
    />,
  );
  expect(screen.getByLabelText('Delivery project name')).toHaveFocus();
  expect(screen.getByLabelText('Delivery project name')).toHaveValue(
    source.opportunityName,
  );
  expect(screen.getByText(/Accepted quote total:/)).toHaveTextContent(
    'USD 1,250.00',
  );
  expect(
    screen.getByRole('button', { name: 'Create client setup' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByText('Agreed scope imported from the accepted quote'),
  );
  expect(screen.getByText(source.scope)).toBeVisible();
  await fill();
  await userEvent.click(
    screen.getByRole('button', { name: 'Create client setup' }),
  );
  expect(save).toHaveBeenCalledWith({
    opportunityId: 'deal',
    quoteId: 'quote',
    fingerprint: 'original',
    projectName: source.opportunityName,
    managerId: 'owner',
    reviewerId: 'reviewer',
    memberIds: [],
    services: ['AI videos', 'SEO'],
    billing: 'RETAINER',
    contact: 'Client marketing lead',
    scheduledDate: null,
  });
  expect(close).toHaveBeenCalledTimes(1);
});
it('requires an independent reviewer again when that person becomes the setup owner', async () => {
  show(
    <DeliveryHandoffForm
      source={source}
      latest={source}
      ready
      workspace={workspace}
      onSave={jest.fn()}
      onClose={jest.fn()}
    />,
  );
  await fill();
  await userEvent.selectOptions(
    screen.getByLabelText('Delivery setup owner'),
    'reviewer',
  );
  expect(screen.getByLabelText('Independent setup reviewer')).toHaveValue('');
  expect(
    screen.getByRole('button', { name: 'Create client setup' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('combobox', { name: 'Delivery setup owner' }),
  ).not.toHaveTextContent('Editor');
});
it.each([false, 'throw'])(
  'preserves the complete draft on save failure %s',
  async (outcome) => {
    const save =
      outcome === 'throw'
        ? jest.fn().mockRejectedValue(new Error('offline'))
        : jest.fn().mockResolvedValue(false);
    const close = jest.fn();
    show(
      <DeliveryHandoffForm
        source={source}
        latest={source}
        ready
        workspace={workspace}
        onSave={save}
        onClose={close}
      />,
    );
    await fill();
    await userEvent.click(
      screen.getByRole('button', { name: 'Create client setup' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Your choices are preserved',
      ),
    );
    expect(
      screen.getByLabelText('Client contact and coordination notes'),
    ).toHaveValue('Client marketing lead');
    expect(close).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Create client setup' }),
    ).toBeEnabled();
  },
);
it('blocks a changed quote and requires deliberate preview reload and another review', async () => {
  const changed = {
    ...source,
    fingerprint: 'changed',
    scope: 'Updated agreed scope',
  };
  const save = jest.fn();
  show(
    <DeliveryHandoffForm
      source={source}
      latest={changed}
      ready
      workspace={workspace}
      onSave={save}
      onClose={jest.fn()}
    />,
  );
  await fill();
  expect(
    screen.getByRole('button', { name: 'Create client setup' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Review updated scope' }),
  );
  expect(screen.getByText('Updated agreed scope')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByLabelText('I reviewed the imported scope and delivery owners.'),
  ).not.toBeChecked();
  expect(
    screen.getByLabelText('Client contact and coordination notes'),
  ).toHaveValue('Client marketing lead');
  expect(save).not.toHaveBeenCalled();
});
it('offers keep editing when cancelling a dirty handoff', async () => {
  const close = jest.fn();
  show(
    <DeliveryHandoffForm
      source={source}
      latest={source}
      ready
      workspace={workspace}
      onSave={jest.fn()}
      onClose={close}
    />,
  );
  await userEvent.type(
    screen.getByLabelText('Client contact and coordination notes'),
    'Draft note',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Cancel handoff' }));
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(close).not.toHaveBeenCalled();
  expect(
    screen.getByLabelText('Client contact and coordination notes'),
  ).toHaveValue('Draft note');
});
it('explains missing independent staffing and does not enable setup', () => {
  show(
    <DeliveryHandoffForm
      source={source}
      latest={source}
      ready
      workspace={{ ...workspace, members: workspace.members.slice(0, 1) }}
      onSave={jest.fn()}
      onClose={jest.fn()}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Add a second delivery manager',
  );
  expect(
    screen.getByRole('button', { name: 'Create client setup' }),
  ).toBeDisabled();
});
it('does not expose the sales handoff to an unauthorized role', () => {
  permitted = false;
  show(<DeliveryHandoffs workspace={workspace} onCreated={jest.fn()} />);
  expect(
    screen.queryByRole('heading', { name: 'Sales to delivery' }),
  ).not.toBeInTheDocument();
});
it('replaces duplicate creation with existing setup task links and handles an engagement refresh failure', async () => {
  directory.handoffs = [
    {
      id: 'handoff',
      opportunityId: 'deal',
      projectId: 'project',
      engagementId: 'engagement',
      managerId: 'owner',
      reviewerId: 'reviewer',
      setupTaskIds: ['assets', 'billing', 'plan'],
      createdAt: '2026-10-27T00:00:00Z',
    },
  ];
  const open = jest.fn().mockRejectedValue(new Error('offline'));
  show(<DeliveryHandoffs workspace={workspace} onCreated={open} />);
  await userEvent.click(
    screen.getByRole('button', { name: 'Start from a won deal' }),
  );
  expect(screen.getByText(/Already handed into delivery/)).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Brand onboarding' }),
  ).toHaveAttribute('href', '/delivery?view=planner&task=assets');
  await userEvent.click(
    screen.getByRole('button', { name: 'Open client engagement' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('could not be loaded'),
  );
  expect(mutate).not.toHaveBeenCalled();
});
it('hides stale directory content when the CRM query fails and gives a retry', async () => {
  queryError = new Error('no CRM access');
  show(<DeliveryHandoffs workspace={workspace} onCreated={jest.fn()} />);
  await userEvent.click(
    screen.getByRole('button', { name: 'Start from a won deal' }),
  );
  expect(screen.queryByText(source.opportunityName)).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Check your CRM access');
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry won deals' }),
  );
  expect(refetch).toHaveBeenCalledTimes(1);
});
