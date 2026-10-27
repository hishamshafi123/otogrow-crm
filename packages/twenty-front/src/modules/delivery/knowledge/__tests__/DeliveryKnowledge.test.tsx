import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DeliveryKnowledgeForm } from '@/delivery/knowledge/DeliveryKnowledgeForm';
import { DeliveryKnowledge } from '@/delivery/knowledge/DeliveryKnowledge';
import {
  type DeliveryKnowledgeSaveInput,
  type DeliveryKnowledgeQuery,
} from '~/generated-metadata/graphql';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
let mockData: DeliveryKnowledgeQuery['deliveryKnowledge'];
let mockReady = true;
let mockError: Error | undefined;
const mockSave = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { deliveryKnowledge: mockData },
    error: mockError,
    loading: false,
    refetch: mockRefetch,
  }),
  useMutation: () => [mockSave, { loading: false }],
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    scope: 'workspace:member',
    ready: mockReady,
    manager: mockData?.canPublish === true,
    matches: (value: { workspaceId: string } | undefined) =>
      mockReady && value?.workspaceId === 'workspace',
  }),
}));
const initial: DeliveryKnowledgeSaveInput = {
  id: 'source',
  projectId: 'project',
  revision: 1,
  title: 'Launch meeting',
  meetingDate: '2026-10-26',
  sourceUrl: 'https://fathom.video/share/synthetic',
  transcript: 'Original notes',
  knowledge: 'Prior decision',
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'member', isAdmin: false, isManager: false },
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Brand project',
      companyId: null,
      memberIds: ['member'],
    },
  ],
  members: [],
  companies: [],
  tasks: [],
};
it('links a manager with no projects to setup instead of a disabled meeting form', () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/delivery?view=knowledge']}>
        <DeliveryKnowledge workspace={{ ...workspace, projects: [] }} />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    screen.getByRole('link', { name: 'Set up your first project' }),
  ).toHaveAttribute('href', '/delivery?view=team');
  expect(
    screen.queryByRole('button', { name: 'Add meeting' }),
  ).not.toBeInTheDocument();
});
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockReady = true;
  mockError = undefined;
  mockSave.mockReset();
  mockRefetch.mockReset().mockResolvedValue({});
  mockData = {
    workspaceId: 'workspace',
    memberId: 'member',
    userWorkspaceId: 'member',
    canPublish: true,
    nextCursor: null,
    items: [
      {
        id: 'source',
        revision: 1,
        title: 'Launch meeting',
        category: 'MEETING',
        meetingDate: '2026-10-26',
        version: 1,
        publishedVersion: null,
        publishedAt: null,
        createdBy: 'member',
        canEdit: true,
      },
    ],
    detail: {
      id: 'source',
      revision: 1,
      title: 'Launch meeting',
      category: 'MEETING',
      meetingDate: '2026-10-26',
      version: 1,
      currentVersion: 1,
      publishedVersion: null,
      publishedAt: null,
      createdBy: 'member',
      canEdit: true,
      sourceUrl: initial.sourceUrl,
      transcript: initial.transcript,
      knowledge: initial.knowledge,
    },
  };
});
const page = () => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter
      initialEntries={[
        '/delivery?view=knowledge&project=project&source=source',
      ]}
    >
      <DeliveryKnowledge workspace={workspace} />
    </MemoryRouter>
  </I18nProvider>
);
it('preserves a failed draft and saves the exact reviewed values without publishing', async () => {
  const save = jest.fn().mockResolvedValue(false);
  const saved = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryKnowledgeForm
        initial={initial}
        busy={false}
        enabled
        onSave={save}
        onClose={jest.fn()}
        onSaved={saved}
      />
    </I18nProvider>,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Knowledge to publish'));
  await user.type(
    screen.getByLabelText('Knowledge to publish'),
    'Confirmed webinar plan',
  );
  await user.click(screen.getByRole('button', { name: 'Save meeting draft' }));
  expect(save).toHaveBeenCalledWith({
    ...initial,
    knowledge: 'Confirmed webinar plan',
  });
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Knowledge to publish')).toHaveValue(
    'Confirmed webinar plan',
  );
  save.mockResolvedValue(true);
  await user.click(screen.getByRole('button', { name: 'Save meeting draft' }));
  expect(saved).toHaveBeenCalledTimes(1);
});
it('retains dirty notes across a concurrent revision and requires reload', async () => {
  const props = {
    busy: false,
    enabled: true,
    onSave: jest.fn(),
    onClose: jest.fn(),
    onSaved: jest.fn(),
  };
  const view = (revision: number) => (
    <I18nProvider i18n={i18n}>
      <DeliveryKnowledgeForm
        busy={props.busy}
        enabled={props.enabled}
        onSave={props.onSave}
        onClose={props.onClose}
        onSaved={props.onSaved}
        initial={{ ...initial, revision }}
      />
    </I18nProvider>
  );
  const { rerender } = render(view(1));
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Transcript or meeting notes'),
    ' — local correction',
  );
  rerender(view(2));
  expect(screen.getByRole('alert')).toHaveTextContent('draft is preserved');
  expect(
    screen.getByRole('button', { name: 'Save meeting draft' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Transcript or meeting notes')).toHaveValue(
    'Original notes — local correction',
  );
});
it('shows a manager the explicit publication action and sends its current revision', async () => {
  render(page());
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Publish reviewed knowledge' }));
  expect(mockSave).toHaveBeenCalledWith({
    variables: {
      input: { projectId: 'project', id: 'source', revision: 1, publish: true },
    },
  });
});
it('does not expose raw notes, recording links or publication to an ordinary approved-context reader', () => {
  mockData = {
    ...mockData,
    canPublish: false,
    detail: {
      ...mockData.detail!,
      canEdit: false,
      publishedVersion: 1,
      transcript: null,
      sourceUrl: '',
    },
  };
  render(page());
  expect(
    screen.queryByText('Original transcript or notes'),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Open original recording')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Publish reviewed knowledge' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Prior decision')).toBeVisible();
});
it('hides unverified evidence and preserves an open draft for recovery', async () => {
  const { rerender } = render(page());
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit draft' }));
  await user.type(
    screen.getByLabelText('Knowledge to publish'),
    ' and local change',
  );
  mockError = new Error('Connection failed');
  rerender(page());
  expect(screen.getByLabelText('Knowledge to publish')).not.toBeVisible();
  expect(screen.getByLabelText('Knowledge to publish')).toBeDisabled();
  mockError = undefined;
  rerender(page());
  expect(screen.getByLabelText('Knowledge to publish')).toHaveValue(
    'Prior decision and local change',
  );
});

it('creates a reusable prompt with evidence and an explicit review boundary', async () => {
  const save = jest.fn().mockResolvedValue(false);
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryKnowledgeForm
        initial={{ ...initial, category: 'BRAND_FACTS' }}
        busy={false}
        enabled
        onSave={save}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />
    </I18nProvider>,
  );
  await userEvent.selectOptions(
    screen.getByLabelText('Knowledge category'),
    'PROMPT',
  );
  expect(screen.getByLabelText('Knowledge title')).toHaveValue(
    'Launch meeting',
  );
  expect(screen.getByLabelText('Source evidence and notes')).toHaveValue(
    'Original notes',
  );
  expect(screen.getByText(/Links are not fetched or inspected/)).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save knowledge draft' }),
  );
  expect(save).toHaveBeenCalledWith({ ...initial, category: 'PROMPT' });
});
it('opens a facts draft separately from the dedicated meeting action', async () => {
  mockData.detail = null;
  render(page());
  await userEvent.click(screen.getByRole('button', { name: 'Add knowledge' }));
  expect(screen.getByLabelText('Knowledge category')).toHaveValue(
    'BRAND_FACTS',
  );
  expect(
    screen.getByRole('button', { name: 'Save knowledge draft' }),
  ).toBeDisabled();
});
it('shows the visible category on published knowledge without exposing raw source evidence', () => {
  mockData.items = [];
  mockData.detail = {
    ...mockData.detail!,
    category: 'VISUAL_RULES',
    canEdit: false,
    transcript: null,
    sourceUrl: '',
    publishedVersion: 1,
  };
  mockData.canPublish = false;
  render(page());
  expect(screen.getByText(/Visual and tone rules.*Version 1/)).toBeVisible();
  expect(screen.queryByText('Open original source')).not.toBeInTheDocument();
});
