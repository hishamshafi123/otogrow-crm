import { useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ConversationPermissions,
  type ConversationPermissionsValue,
} from '@/delivery/inbox/ConversationPermissions';
import { type OtogrowRoleDirectory } from '@/otogrow-access/otogrow-access.types';

const access = (memberId: string, capabilities: string[] = []) => ({
  workspaceId: 'workspace',
  memberId,
  userWorkspaceId: memberId,
  roleIds: [],
  nativeAdministrator: false,
  capabilities,
  grants: [],
});
const directory: OtogrowRoleDirectory = {
  actor: access('founder', ['workspace.admin']),
  roles: [
    {
      id: 'editor',
      name: 'Editor',
      description: '',
      capabilities: [],
      revision: 1,
    },
    {
      id: 'marketing',
      name: 'Marketing',
      description: '',
      capabilities: [],
      revision: 1,
    },
  ],
  members: [
    {
      memberId: 'founder',
      name: 'Founder',
      roleIds: [],
      revision: 1,
      access: access('founder', ['workspace.admin']),
    },
    {
      memberId: 'amna',
      name: 'Amna',
      roleIds: ['editor', 'marketing'],
      revision: 1,
      access: access('amna'),
    },
    {
      memberId: 'designer',
      name: 'Designer',
      roleIds: [],
      revision: 1,
      access: access('designer'),
    },
  ],
};
const setup = (overrides: Partial<ConversationPermissionsValue> = {}) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const Form = () => {
    const [value, setValue] = useState<ConversationPermissionsValue>({
      ownerId: 'founder',
      private: false,
      grants: [],
      roleGrants: [],
      ...overrides,
    });
    return (
      <ConversationPermissions
        value={value}
        directory={directory}
        onChange={setValue}
      />
    );
  };
  return render(
    <I18nProvider i18n={i18n}>
      <Form />
    </I18nProvider>,
  );
};
const person = (name: string) =>
  within(
    within(
      screen.getByRole('list', { name: 'Effective conversation access' }),
    ).getByRole('listitem', { name }),
  );
it('combines multiple roles and explains why removing one grant does not remove another', async () => {
  setup();
  await userEvent.click(screen.getByLabelText('Editor: view conversation'));
  expect(person('Amna').getByText('View only')).toBeVisible();
  await userEvent.click(screen.getByLabelText('Marketing: prepare replies'));
  expect(screen.getByLabelText('Marketing: view conversation')).toBeChecked();
  expect(person('Amna').getByText('View and prepare replies')).toBeVisible();
  await userEvent.click(screen.getByLabelText('Editor: view conversation'));
  expect(person('Amna').getByText('View and prepare replies')).toBeVisible();
  expect(
    person('Amna').getByText('Marketing: view and prepare replies'),
  ).toBeVisible();
  expect(person('Designer').getByText('No access')).toBeVisible();
});
it('removing viewing also removes reply preparation for that role', async () => {
  setup({ roleGrants: [{ roleId: 'editor', read: true, send: true }] });
  await userEvent.click(screen.getByLabelText('Editor: view conversation'));
  expect(screen.getByLabelText('Editor: prepare replies')).not.toBeChecked();
  expect(person('Amna').getByText('No access')).toBeVisible();
});
it('private mode overrides administrator, role and individual grants without erasing them', async () => {
  setup({
    ownerId: 'designer',
    grants: [{ memberId: 'amna', read: true, send: true }],
    roleGrants: [{ roleId: 'editor', read: true, send: true }],
  });
  await userEvent.click(screen.getByLabelText('Private to the owner'));
  expect(person('Founder').getByText('No access')).toBeVisible();
  expect(person('Amna').getByText('No access')).toBeVisible();
  expect(
    person('Designer').getByText('View and prepare replies'),
  ).toBeVisible();
  expect(screen.getByLabelText('Editor: prepare replies')).toBeDisabled();
  await userEvent.click(screen.getByLabelText('Private to the owner'));
  expect(person('Amna').getByText('View and prepare replies')).toBeVisible();
  expect(person('Founder').getByText('OS administrator')).toBeVisible();
});
it('previews owner changes immediately without changing role assignments', async () => {
  setup({ private: true });
  await userEvent.selectOptions(
    screen.getByLabelText('Conversation owner'),
    'amna',
  );
  expect(person('Amna').getByText('Conversation owner')).toBeVisible();
  expect(person('Founder').getByText('No access')).toBeVisible();
});
