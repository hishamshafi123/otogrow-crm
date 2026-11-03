import { useSearchParams } from 'react-router-dom';
import { DeliveryAgents } from '@/delivery/DeliveryAgents';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';
import { DeliveryAiWorkspaceNavigation } from '@/delivery/creative/atlas/DeliveryAiWorkspaceNavigation';
import { OtogrowAiBudget } from '@/otogrow-ai-budget/OtogrowAiBudget';

type DeliveryAiWorkspaceProps = {
  workspace: DeliveryWorkspace;
  onTaskChanged: () => Promise<unknown>;
};
export const DeliveryAiWorkspace = ({
  workspace,
  onTaskChanged,
}: DeliveryAiWorkspaceProps) => {
  const [params] = useSearchParams();
  const spending = params.get('agentView') === 'spending';
  return (
    <StyledDeliveryStack>
      <DeliveryAiWorkspaceNavigation administrator={workspace.actor.isAdmin} />
      {spending ? (
        <OtogrowAiBudget workspace={workspace} />
      ) : (
        <DeliveryAgents workspace={workspace} onTaskChanged={onTaskChanged} />
      )}
    </StyledDeliveryStack>
  );
};
