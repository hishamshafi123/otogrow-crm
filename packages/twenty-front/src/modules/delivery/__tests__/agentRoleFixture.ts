import { type OtogrowRoleDirectory } from '@/otogrow-access/otogrow-access.types';
const access = (memberId: string, capabilities: string[] = []) => ({
  workspaceId: 'workspace',
  memberId,
  userWorkspaceId: memberId,
  roleIds: [],
  capabilities,
  nativeAdministrator: false,
  grants: [],
});
export const agentRoleDirectory: OtogrowRoleDirectory = {
  actor: access('admin', ['workspace.admin']),
  roles: [
    {
      id: 'editor-role',
      name: 'Production team',
      description: '',
      capabilities: [],
      revision: 1,
    },
    {
      id: 'seo-role',
      name: 'SEO team',
      description: '',
      capabilities: [],
      revision: 1,
    },
  ],
  members: [
    {
      memberId: 'admin',
      name: 'Founder',
      roleIds: [],
      revision: 1,
      access: access('admin', ['workspace.admin']),
    },
    {
      memberId: 'editor',
      name: 'Editor',
      roleIds: ['editor-role', 'seo-role'],
      revision: 1,
      access: access('editor'),
    },
    {
      memberId: 'outside',
      name: 'Outside specialist',
      roleIds: ['editor-role'],
      revision: 1,
      access: access('outside'),
    },
  ],
};
