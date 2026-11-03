export const OTOGROW_CAPABILITIES = [
  'workspace.admin',
  'delivery.manage',
  'delivery.review',
  'phone.use',
  'finance.read',
  'finance.manage',
] as const;

export type OtogrowCapability = (typeof OTOGROW_CAPABILITIES)[number];

export type OtogrowAccess = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  nativeAdministrator: boolean;
  capabilities: string[];
  roleIds: string[];
  grants: {
    capability: string;
    sourceId: string;
    sourceName: string;
    sourceType: 'role' | 'native';
  }[];
};

export type OtogrowRole = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  revision: number;
};

export type OtogrowRoleDirectory = {
  actor: OtogrowAccess;
  roles: OtogrowRole[];
  members: {
    memberId: string;
    name: string;
    roleIds: string[];
    revision: number;
    access: OtogrowAccess;
    projectMemberships: { id: string; name: string }[];
  }[];
};

export const OTOGROW_DEFAULT_ROLES = [
  {
    key: 'admin',
    name: 'Admin',
    description: 'Administer the OS, delivery and phone.',
    capabilities: [...OTOGROW_CAPABILITIES],
  },
  {
    key: 'secondary-admin',
    name: 'Secondary Admin',
    description: 'Administer the OS, delivery and phone.',
    capabilities: [...OTOGROW_CAPABILITIES],
  },
  {
    key: 'project-manager',
    name: 'Project manager',
    description: 'Plan and review work across all projects.',
    capabilities: ['delivery.manage'],
  },
  {
    key: 'sales',
    name: 'Sales',
    description: 'Use the phone within existing CRM record permissions.',
    capabilities: ['phone.use'],
  },
  {
    key: 'setter',
    name: 'Setter',
    description: 'Use the phone within existing CRM record permissions.',
    capabilities: ['phone.use'],
  },
  ...['Editor', 'Marketing', 'SEO specialist', 'Designer', 'Developer'].map(
    (name) => ({
      key: name.toLowerCase().replace(/ /g, '-'),
      name,
      description:
        'Work within assigned projects. No additional administration or phone access.',
      capabilities: [],
    }),
  ),
];
