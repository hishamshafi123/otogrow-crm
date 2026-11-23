import { Trans } from '@lingui/react/macro';
import { Link, useInRouterContext, useSearchParams } from 'react-router-dom';
import { isValidUuid } from 'twenty-shared/utils';
import { clientWorkspaceDestination } from '@/delivery/client-workspace/client-workspace-navigation';

export const ClientWorkspaceReturnLink = () =>
  useInRouterContext() ? <ClientWorkspaceRouteReturnLink /> : null;

const ClientWorkspaceRouteReturnLink = () => {
  const [params] = useSearchParams();
  const companyId = params.get('clientCompany');
  if (
    !companyId ||
    !isValidUuid(companyId) ||
    (params.get('view') === 'clients' &&
      params.get('clientView') === 'workspace')
  )
    return null;
  const projectId = params.get('clientProject');
  return (
    <Link
      to={clientWorkspaceDestination({
        companyId,
        projectId: projectId && isValidUuid(projectId) ? projectId : null,
      })}
    >
      <Trans>Back to client</Trans>
    </Link>
  );
};
