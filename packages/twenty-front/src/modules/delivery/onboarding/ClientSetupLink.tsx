import { type ReactNode } from 'react';
import { Link, useInRouterContext, useSearchParams } from 'react-router-dom';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';

type ClientSetupLinkProps = {
  companyId?: string | null;
  projectId?: string | null;
  planId?: string | null;
  newServicePlan?: boolean;
  children: ReactNode;
};
export const ClientSetupLink = (props: ClientSetupLinkProps) =>
  useInRouterContext() ? (
    <ClientSetupRouteLink
      companyId={props.companyId}
      projectId={props.projectId}
      planId={props.planId}
      newServicePlan={props.newServicePlan}
    >
      {props.children}
    </ClientSetupRouteLink>
  ) : null;
type ClientSetupRouteLinkProps = ClientSetupLinkProps;
const ClientSetupRouteLink = ({
  companyId,
  projectId,
  planId,
  newServicePlan = false,
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
        setupPlanMode: newServicePlan ? 'new' : null,
        setupCompanyRequest: null,
        setupRequest: null,
      })}
    >
      {children}
    </Link>
  );
};
