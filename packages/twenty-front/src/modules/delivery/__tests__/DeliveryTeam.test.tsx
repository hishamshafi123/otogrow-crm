import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { Request } from 'cross-fetch';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import userEvent from '@testing-library/user-event';
import { DeliveryTeam } from '@/delivery/DeliveryTeam';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryGrid: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/otogrow-access/OtogrowTeamRoles', () => ({
  OtogrowTeamRoles: () => <div>Business role management</div>,
}));
it('preserves project membership selection and replaces free-text authority with business roles', async () => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const workspace: DeliveryWorkspace = {
    actor: { memberId: 'admin', isAdmin: true, isManager: true },
    members: [
      { id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' },
    ],
    projects: [],
    tasks: [],
    companies: [],
  };
  const run = jest.fn().mockResolvedValue(true);
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryTeam workspace={workspace} run={run} busy={false} />
    </I18nProvider>,
  );
  expect(screen.getByText('Business role management')).toBeInTheDocument();
  expect(screen.queryByLabelText('Role label')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByText('Create project', { selector: 'summary' }),
  );
  await userEvent.type(screen.getByLabelText('Project name'), 'Brand launch');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Editor' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() =>
    expect(run).toHaveBeenCalledWith({
      action: 'project',
      name: 'Brand launch',
      companyId: null,
      memberIds: ['editor'],
    }),
  );
});

const existingProject = {
  id: 'project',
  revision: 3,
  name: 'Original project',
  companyId: null,
  memberIds: ['editor'],
};
const saveProject = jest.fn<Promise<boolean>, [Record<string, unknown>]>();
let refreshProjectFails = false;
const ProjectConflictHarness = () => {
  const [project, setProject] = useState(existingProject);
  const workspace: DeliveryWorkspace = {
    actor: { memberId: 'manager', isAdmin: false, isManager: true },
    projects: [project],
    tasks: [],
    companies: [],
    members: [
      { id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' },
    ],
  };
  return (
    <>
      <button
        onClick={() =>
          setProject({ ...project, revision: project.revision + 1 })
        }
      >
        Another manager saved
      </button>
      <DeliveryTeam
        workspace={workspace}
        busy={false}
        run={async (input) => {
          const saved = await saveProject(input);
          if (saved)
            setProject({
              ...project,
              name: String(input.name),
              revision: project.revision + 1,
            });
          return saved;
        }}
        onChanged={async () => {
          if (refreshProjectFails) throw new Error('Refresh unavailable');
          setProject({ ...project, revision: 4, name: 'Updated by Amna' });
        }}
      />
    </>
  );
};
const setupProjectEditor = () => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  saveProject.mockReset().mockResolvedValue(false);
  refreshProjectFails = false;
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider
        router={createMemoryRouter([
          {
            path: '/',
            element: (
              <DeliveryDraftGuardProvider>
                <ProjectConflictHarness />
              </DeliveryDraftGuardProvider>
            ),
          },
        ])}
      />
    </I18nProvider>,
  );
  return userEvent.setup();
};

it('retains a rejected project draft and requires explicit reload before using the new revision', async () => {
  const user = setupProjectEditor();
  await user.click(
    screen.getByText('Original project', { selector: 'strong' }),
  );
  const form = within(
    screen.getByRole('form', { name: 'Edit project Original project' }),
  );
  await user.clear(form.getByLabelText('Project name'));
  await user.type(form.getByLabelText('Project name'), 'My unsaved title');
  await user.click(form.getByRole('button', { name: 'Save project access' }));
  expect(saveProject).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'project',
      revision: 3,
      name: 'My unsaved title',
    }),
  );
  expect(form.getByLabelText('Project name')).toHaveValue('My unsaved title');
  expect(
    form.getByRole('button', { name: 'Save project access' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(form.getByLabelText('Project name')).toHaveValue('My unsaved title');
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(form.getByLabelText('Project name')).toHaveValue('Updated by Amna');
  saveProject.mockResolvedValue(true);
  await user.type(form.getByLabelText('Project name'), ' approved');
  await user.click(form.getByRole('button', { name: 'Save project access' }));
  expect(saveProject).toHaveBeenLastCalledWith(
    expect.objectContaining({ revision: 4, name: 'Updated by Amna approved' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  );
  expect(
    form.getByRole('button', { name: 'Save project access' }),
  ).toBeDisabled();
});

it('detects an intervening version even when project fields have the same values', async () => {
  const user = setupProjectEditor();
  await user.click(
    screen.getByText('Original project', { selector: 'strong' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Another manager saved' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('This record changed');
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const form = within(
    screen.getByRole('form', { name: 'Edit project Original project' }),
  );
  await user.type(form.getByLabelText('Project name'), ' next');
  await user.click(form.getByRole('button', { name: 'Save project access' }));
  expect(saveProject).toHaveBeenLastCalledWith(
    expect.objectContaining({ revision: 4 }),
  );
});

it('keeps the draft and explains recovery when both save and refresh fail', async () => {
  const user = setupProjectEditor();
  await user.click(
    screen.getByText('Original project', { selector: 'strong' }),
  );
  refreshProjectFails = true;
  const form = within(
    screen.getByRole('form', { name: 'Edit project Original project' }),
  );
  await user.type(form.getByLabelText('Project name'), ' draft');
  await user.click(form.getByRole('button', { name: 'Save project access' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Use Refresh page');
  expect(form.getByLabelText('Project name')).toHaveValue(
    'Original project draft',
  );
});

it('lets managers add and remove multiple teammates cleanly when creating a project', async () => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const workspace: DeliveryWorkspace = {
    actor: { memberId: 'admin', isAdmin: true, isManager: true },
    members: [
      { id: 'm1', name: 'Amna', access: 'MANAGER', roleLabel: 'PM' },
      { id: 'm2', name: 'Arjun', access: 'MEMBER', roleLabel: 'Editor' },
      { id: 'm3', name: 'Maya', access: 'MEMBER', roleLabel: 'Designer' },
      { id: 'm4', name: 'Zaid', access: 'MEMBER', roleLabel: 'Strategist' },
      { id: 'm5', name: 'Lina', access: 'MEMBER', roleLabel: 'Copywriter' },
    ],
    projects: [],
    tasks: [],
    companies: [],
  };
  const run = jest.fn().mockResolvedValue(true);
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryTeam workspace={workspace} run={run} busy={false} />
    </I18nProvider>,
  );

  await user.click(screen.getByText('Create project', { selector: 'summary' }));
  await user.type(screen.getByLabelText('Project name'), 'Q4 Growth Sprint');

  // Single-click multi-selection without modifier keys
  await user.click(screen.getByRole('checkbox', { name: 'Amna' }));
  await user.click(screen.getByRole('checkbox', { name: 'Arjun' }));
  await user.click(screen.getByRole('checkbox', { name: 'Maya' }));

  // Filter teammates and add another match
  await user.type(screen.getByLabelText('Filter teammates'), 'Lina');
  await user.click(screen.getByRole('checkbox', { name: 'Lina' }));
  await user.click(screen.getByRole('button', { name: 'Reset' }));

  // Remove one via chip button
  await user.click(screen.getByRole('button', { name: 'Remove Arjun' }));

  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() =>
    expect(run).toHaveBeenCalledWith({
      action: 'project',
      name: 'Q4 Growth Sprint',
      companyId: null,
      memberIds: ['m1', 'm3', 'm5'],
    }),
  );
});
