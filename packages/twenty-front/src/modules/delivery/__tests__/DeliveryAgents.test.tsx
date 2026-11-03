import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryAgents } from '@/delivery/DeliveryAgents';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';

const mockEntry = jest.fn();
jest.mock('@/delivery/assistants/DeliveryAssistantsPage', () => ({
  DeliveryAssistantsWorkspace: (props: {
    taskId?: string;
    onChanged: () => Promise<unknown>;
  }) => {
    mockEntry(props);
    return (
      <button onClick={() => void props.onChanged()}>
        Refresh exact assistant task
      </button>
    );
  },
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'editor', isAdmin: false, isManager: false },
  projects: [],
  members: [],
  companies: [],
  tasks: [],
};
const task: DeliveryTask = {
  id: 'exact-task',
  title: 'Task',
  projectId: 'project',
  assigneeId: 'editor',
  revision: 1,
  dueAt: null,
  details: {
    brief: 'Private task',
    service: 'COPY',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'reviewer',
    state: 'PLANNED',
    blocker: '',
    checklist: [],
    evidence: [],
    submissions: [],
    events: [],
  },
};
beforeEach(() => mockEntry.mockClear());
it('hands the exact task and refresh callback to bounded reads without forwarding a legacy workspace', async () => {
  const changed = jest.fn().mockResolvedValue(undefined);
  render(
    <DeliveryAgents
      workspace={workspace}
      task={task}
      onTaskChanged={changed}
    />,
  );
  expect(mockEntry).toHaveBeenCalledWith({
    taskId: 'exact-task',
    onChanged: changed,
  });
  expect(mockEntry.mock.calls[0][0]).not.toHaveProperty('workspace');
  await userEvent
    .setup()
    .click(
      screen.getByRole('button', { name: 'Refresh exact assistant task' }),
    );
  expect(changed).toHaveBeenCalledTimes(1);
});
it('keeps legacy call compatibility while the standalone dispatcher supplies the task-free page', () => {
  const changed = jest.fn().mockResolvedValue(undefined);
  render(<DeliveryAgents workspace={workspace} onTaskChanged={changed} />);
  expect(mockEntry).toHaveBeenCalledWith({
    taskId: undefined,
    onChanged: changed,
  });
});
