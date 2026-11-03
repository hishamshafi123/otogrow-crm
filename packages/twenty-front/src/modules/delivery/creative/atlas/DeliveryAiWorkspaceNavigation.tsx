import { Link, useSearchParams } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import { StyledAtlasNavigation } from '@/delivery/creative/atlas/atlasStyles';

type DeliveryAiWorkspaceNavigationProps = { administrator: boolean };
export const DeliveryAiWorkspaceNavigation = ({
  administrator,
}: DeliveryAiWorkspaceNavigationProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  if (!administrator) return null;
  const section = ['spending', 'media'].includes(params.get('agentView') ?? '')
    ? params.get('agentView')
    : 'assistants';
  return (
    <StyledAtlasNavigation aria-label={t`AI workspace views`}>
      {[
        { id: 'assistants', label: t`Assistants` },
        { id: 'spending', label: t`AI spending` },
        { id: 'media', label: t`Media models` },
      ].map((item) => (
        <Link
          key={item.id}
          aria-current={section === item.id ? 'page' : undefined}
          to={taskPageDestination(params, {
            ...deliveryTaskSelection(null),
            view: 'agents',
            agentView: item.id,
          })}
        >
          {item.label}
        </Link>
      ))}
    </StyledAtlasNavigation>
  );
};
