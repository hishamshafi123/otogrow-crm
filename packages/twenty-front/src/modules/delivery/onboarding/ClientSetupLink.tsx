import { type ReactNode } from 'react';
import { Link, useInRouterContext, useSearchParams } from 'react-router-dom';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';

type ClientSetupLinkProps = {
  companyId?: string | null;
  projectId?: string | null;
  planId?: string | null;
  children: ReactNode;
};
export const ClientSetupLink = (props: ClientSetupLinkProps) =>
  useInRouterContext() ? (
    <ClientSetupRouteLink
      companyId={props.companyId}
      projectId={props.projectId}
      planId={props.planId}
    >
      {props.children}
    </ClientSetupRouteLink>
  ) : null;
type ClientSetupRouteLinkProps = ClientSetupLinkProps;
const ClientSetupRouteLink = ({
  companyId,
  projectId,
  planId,
  children,
}: ClientSetupRouteLinkProps) => {
  const [params] = useSearchParams();
  return (
    <Link
      to={taskPageDestination(params, {
        ...deliveryTaskSelection(null),
        view: 'onboarding',
        setupCompany: companyId ?? null,
        setupProject: projectId ?? null,
        setupPlan: planId ?? null,
        setupCompanyRequest: null,
        setupRequest: null,
      })}
    >
      {children}
    </Link>
  );
};
