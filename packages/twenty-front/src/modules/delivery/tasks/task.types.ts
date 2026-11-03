import {
  type DeliveryTask,
  type DeliveryTaskContext,
} from '@/delivery/delivery.types';
import {
  type DeliveryTaskListQuery,
  type DeliveryTaskDetailQuery,
  type DeliveryWorkspaceContextQuery,
} from '~/generated-metadata/graphql';
export type TaskListSnapshot = DeliveryTaskListQuery['deliveryTaskList'];
export type TaskSummary = TaskListSnapshot['items'][number];
export type TaskWorkspaceContext = Omit<
  DeliveryWorkspaceContextQuery['deliveryWorkspaceContext'],
  'members'
> &
  DeliveryTaskContext;
// The exact endpoint retains one legacy details document until its independent histories are migrated.
export type TaskDetailSnapshot = Omit<
  DeliveryTaskDetailQuery['deliveryTaskDetail'],
  'task'
> & { task: DeliveryTask };
