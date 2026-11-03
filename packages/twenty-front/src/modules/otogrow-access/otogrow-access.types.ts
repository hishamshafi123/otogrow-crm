export const OTOGROW_CAPABILITIES = [
  'workspace.admin',
  'delivery.manage',
  'delivery.review',
  'phone.use',
  'finance.read',
  'finance.manage',
] as const;
export type OtogrowCapability = (typeof OTOGROW_CAPABILITIES)[number];
export type OtogrowAccess = OtogrowAccessFieldsFragment;
export type OtogrowRoleDirectory = OtogrowDirectoryFieldsFragment;
export type OtogrowRole = OtogrowRoleDirectory['roles'][number];
export type OtogrowRoleMember = OtogrowRoleDirectory['members'][number];
import {
  type OtogrowAccessFieldsFragment,
  type OtogrowDirectoryFieldsFragment,
} from '~/generated-metadata/graphql';

export const hasOtogrowCapability = (
  capabilities: readonly string[],
  capability: OtogrowCapability,
) =>
  capabilities.includes(capability) ||
  ([
    'delivery.manage',
    'delivery.review',
    'finance.read',
    'finance.manage',
  ].includes(capability) &&
    capabilities.includes('workspace.admin')) ||
  (capability === 'delivery.review' &&
    capabilities.includes('delivery.manage')) ||
  (capability === 'finance.read' && capabilities.includes('finance.manage'));
