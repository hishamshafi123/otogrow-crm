import { isValidUuid } from 'twenty-shared/utils';

export const CLIENT_SECTIONS = [
  'profile',
  'contacts',
  'services',
  'projects',
] as const;
export type ClientSection = (typeof CLIENT_SECTIONS)[number];
export const clientWorkspaceSelection = (params: URLSearchParams) => {
  const companyId = params.get('clientCompany');
  const projectId = params.get('clientProject');
  const section = params.get('clientSection') ?? 'profile';
  const search = params.get('clientSearch') ?? '';
  return {
    companyId,
    projectId,
    section: section as ClientSection,
    search,
    valid:
      [companyId, projectId].every((id) => id === null || isValidUuid(id)) &&
      (!projectId || Boolean(companyId)) &&
      search.length <= 160 &&
      CLIENT_SECTIONS.some((value) => value === section),
  };
};

// Start with a clean selection so another client's detail/cursor cannot leak into a new context.
export const clientWorkspaceDestination = ({
  companyId,
  projectId,
  section = 'profile',
  search = '',
}: {
  companyId?: string | null;
  projectId?: string | null;
  section?: ClientSection;
  search?: string;
}) => {
  const next = new URLSearchParams({
    view: 'clients',
    clientView: 'workspace',
  });
  if (companyId) next.set('clientCompany', companyId);
  if (companyId && projectId) next.set('clientProject', projectId);
  if (section !== 'profile') next.set('clientSection', section);
  if (search) next.set('clientSearch', search);
  return `/delivery?${next}`;
};
