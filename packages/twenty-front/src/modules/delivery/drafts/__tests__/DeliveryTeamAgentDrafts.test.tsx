import { agentRoleDirectory } from '@/delivery/__tests__/agentRoleFixture';
import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryAgentForm } from '@/delivery/DeliveryAgentForm';
import { DeliveryTeam } from '@/delivery/DeliveryTeam';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/otogrow-access/OtogrowTeamRoles', () => ({
  OtogrowTeamRoles: () => <div>Business roles</div>,
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Brand',
      companyId: null,
      memberIds: ['editor'],
    },
  ],
  members: [{ id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' }],
  tasks: [],
  companies: [],
};
const save = jest.fn<Promise<boolean>, [Record<string, unknown>]>();
const Harness = ({ mode }: { mode: 'agent' | 'team' }) => {
  const [closed, setClosed] = useState(false);
  return (
    <>
      <Link to="/other">Other view</Link>
      {mode === 'team' ? (
        <DeliveryTeam
          workspace={{ ...workspace, projects: [] }}
          run={save}
          busy={false}
        />
      ) : closed ? (
        <p>Agent editor closed</p>
      ) : (
        <DeliveryAgentForm
          workspace={workspace}
          directory={agentRoleDirectory}
          models={[]}
          busy={false}
          save={save}
          close={() => setClosed(true)}
        />
      )}
    </>
  );
};
const setup = (mode: 'agent' | 'team') => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness mode={mode} />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other view opened</p> },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return userEvent.setup();
};
beforeAll(() => {
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  save.mockReset().mockResolvedValue(true);
});

it('guards a starter replacement and Cancel, preserves a failed configuration, and closes directly after success', async () => {
  const user = setup('agent');
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), 'Specific brief checker');
  await user.selectOptions(screen.getByLabelText('Starter workflow'), 'SEO');
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Name')).toHaveValue('Specific brief checker');
  expect(screen.getByLabelText('Starter workflow')).toHaveValue('BRIEF');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await user.click(screen.getByLabelText('Brand'));
  await user.click(screen.getByLabelText('Production team'));
  save.mockResolvedValueOnce(false);
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  expect(screen.getByLabelText('Name')).toHaveValue('Specific brief checker');
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  expect(screen.getByText('Agent editor closed')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByText('Other view opened')).toBeInTheDocument();
});

it('protects project membership and title edits, but resets the draft after creating a project', async () => {
  const user = setup('team');
  await user.type(screen.getByLabelText('Project name'), 'New brand');
  await user.click(screen.getByLabelText('Editor'));
  save.mockResolvedValueOnce(false);
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Project name')).toHaveValue('New brand');
  expect(screen.getByLabelText('Editor')).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  expect(screen.getByLabelText('Project name')).toHaveValue('');
  expect(screen.getByLabelText('Editor')).not.toBeChecked();
  await user.type(screen.getByLabelText('Project name'), 'Temporary');
  await user.clear(screen.getByLabelText('Project name'));
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByText('Other view opened')).toBeInTheDocument();
});
