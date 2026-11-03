import { isValidUuid } from 'twenty-shared/utils';

export const knowledgeDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'knowledge');
  for (const [name, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(name);
    else next.set(name, value);
  }
  return `/delivery?${next}`;
};

export const knowledgeSelectionValid = (params: URLSearchParams) => {
  const project = params.get('project');
  const source = params.get('source');
  const create = params.get('knowledgeCreate');
  const version = params.get('knowledgeVersion');
  return (
    [project, source, create].every((id) => id === null || isValidUuid(id)) &&
    !(source !== null && create !== null) &&
    (!(source || create) || project !== null) &&
    (params.get('knowledgeEdit') === null ||
      (params.get('knowledgeEdit') === '1' &&
        source !== null &&
        version === null)) &&
    (version === null || (source !== null && /^[1-9]\d{0,8}$/.test(version))) &&
    ['knowledgeAfter', 'knowledgeProjectsAfter'].every(
      (name) => (params.get(name)?.length ?? 0) <= 4000,
    ) &&
    ['knowledgeSearch', 'knowledgeProjectSearch'].every(
      (name) => (params.get(name)?.length ?? 0) <= 160,
    )
  );
};

export const knowledgeCloseSelection = {
  source: null,
  knowledgeCreate: null,
  knowledgeEdit: null,
  knowledgeVersion: null,
};
