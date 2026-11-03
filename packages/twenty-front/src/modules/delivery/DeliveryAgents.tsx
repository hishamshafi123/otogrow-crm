import { DeliveryAssistantsWorkspace } from '@/delivery/assistants/DeliveryAssistantsPage';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';

type DeliveryAgentsProps = {
  workspace: DeliveryWorkspace;
  task?: DeliveryTask;
  onTaskChanged: () => Promise<unknown>;
};
export const DeliveryAgents = ({
  task,
  onTaskChanged,
}: DeliveryAgentsProps) => (
  <DeliveryAssistantsWorkspace taskId={task?.id} onChanged={onTaskChanged} />
);
