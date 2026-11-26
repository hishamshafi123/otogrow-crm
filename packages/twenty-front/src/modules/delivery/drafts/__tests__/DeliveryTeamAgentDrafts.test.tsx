import { agentRoleDirectory } from '@/delivery/__tests__/agentRoleFixture';
import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
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
const Harness = ({ mode }: { mode: 'agent' | 'team' | 'team-edit' }) => {
  const [closed, setClosed] = useState(false);
  return (
    <>
      <Link to="/other">Other view</Link>
      {mode !== 'agent' ? (
        <DeliveryTeam
          workspace={{
            ...workspace,
            projects: mode === 'team-edit' ? workspace.projects : [],
          }}
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
const setup = (mode: 'agent' | 'team' | 'team-edit') => {
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
    // JSDOM does not perform the native modal's initial focus.
    this.querySelector<HTMLButtonElement>('button')?.focus();
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
  await user.click(screen.getByText('Create project', { selector: 'summary' }));
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

it.each([
  ['team', 'Create a project', 'Create project'],
  ['team-edit', 'Edit project Brand', 'Save project access'],
] as const)(
  'blocks a whitespace-only name in %s without losing preparation, then saves a corrected trimmed name',
  async (mode, formName, saveName) => {
    const user = setup(mode);
    await user.click(
      mode === 'team'
        ? screen.getByText('Create project', { selector: 'summary' })
        : screen.getByText('Brand', { selector: 'strong' }),
    );
    const form = within(screen.getByRole('form', { name: formName }));
    const name = form.getByLabelText('Project name');
    await user.clear(name);
    await user.type(name, '   ');
    expect(name).toHaveValue('   ');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(
      'Add a project name before saving.',
    );
    expect(form.getByRole('button', { name: saveName })).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(save).not.toHaveBeenCalled();
    await user.clear(name);
    await user.type(name, '  Corrected brand  ');
    expect(form.getByRole('button', { name: saveName })).toBeEnabled();
    expect(name).not.toHaveAttribute('aria-invalid', 'true');
    await user.click(form.getByRole('button', { name: saveName }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project',
        name: 'Corrected brand',
        ...(mode === 'team-edit' ? { id: 'project', revision: 1 } : {}),
      }),
    );
  },
);

it('keeps project preparation mounted across disclosures and guarded navigation until explicit discard', async () => {
  const user = setup('team-edit');
  const summary = screen
    .getByText('Brand', { selector: 'strong' })
    .closest('summary')!;
  const disclosure = summary.closest('details')!;
  expect(disclosure).not.toHaveAttribute('open');
  expect(summary).toHaveTextContent('Brand · Internal work · 1 team member');
  expect(
    screen.getByRole('form', { name: 'Edit project Brand' }),
  ).not.toBeVisible();
  await user.click(summary);
  const formElement = screen.getByRole('form', { name: 'Edit project Brand' });
  const form = within(formElement);
  await user.clear(form.getByLabelText('Project name'));
  await user.type(form.getByLabelText('Project name'), 'Prepared brand name');
  await user.click(form.getByLabelText('Editor'));
  await user.click(summary);
  expect(disclosure).not.toHaveAttribute('open');
  expect(formElement).toBeInTheDocument();
  expect(summary).toHaveTextContent('Unsaved changes');
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('link', { name: 'Other view' })).toHaveFocus();
  expect(disclosure).not.toHaveAttribute('open');
  await user.click(summary);
  expect(form.getByLabelText('Project name')).toHaveValue(
    'Prepared brand name',
  );
  expect(form.getByLabelText('Editor')).not.toBeChecked();
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByText('Other view opened')).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

it('supports keyboard preparation and guarded keyboard navigation after opening Create project', async () => {
  const user = setup('team');
  const summary = screen.getByText('Create project', { selector: 'summary' });
  await user.click(summary);
  expect(summary.closest('details')).toHaveAttribute('open');
  await user.click(screen.getByLabelText('Project name'));
  await user.keyboard('Keyboard project');
  await user.tab();
  expect(screen.getByLabelText('Client')).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Select all' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('checkbox', { name: 'Editor' })).toHaveFocus();
  await user.keyboard(' ');
  expect(screen.getByRole('checkbox', { name: 'Editor' })).toBeChecked();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Create project' })).toHaveFocus();
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  const keep = screen.getByRole('button', { name: 'Keep editing' });
  expect(keep).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('Project name')).toHaveValue('Keyboard project');
  expect(screen.getByRole('link', { name: 'Other view' })).toHaveFocus();
  expect(save).not.toHaveBeenCalled();
});
