import { Trans, useLingui } from '@lingui/react/macro';
import { useSearchParams } from 'react-router-dom';
import {
  type TaskWorkspaceContext,
  type TaskListSnapshot,
} from '@/delivery/tasks/task.types';
import {
  TASK_STATES,
  taskPageDestination,
} from '@/delivery/tasks/task-navigation';
import { useTaskLabels } from '@/delivery/tasks/useTaskLabels';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryButton,
} from '@/delivery/deliveryStyles';
import { AVAILABLE_TIMEZONE_OPTIONS } from '@/settings/experience/constants/AvailableTimezoneOptions';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
type DeliveryTaskFiltersProps = {
  context: TaskWorkspaceContext;
  snapshot: TaskListSnapshot | null;
  timezone: string;
  onClear: () => void;
};
export const DeliveryTaskFilters = ({
  context,
  snapshot,
  timezone,
  onClear,
}: DeliveryTaskFiltersProps) => {
  const { t } = useLingui();
  const labels = useTaskLabels();
  const [params, setParams] = useSearchParams();
  const { requestAction } = useDeliveryDraftGuard();
  const mobile = useIsMobile();
  const selectedProject = params.get('project');
  const selectedMember = params.get('member');
  const activeCount = [
    'search',
    'project',
    ...(params.get('view') === 'mine' ? [] : ['member']),
    'service',
    'status',
    'from',
    'through',
    'attention',
  ].filter((key) => Boolean(params.get(key))).length;
  const update = (changes: Record<string, string | null>) =>
    requestAction(() =>
      setParams(
        taskPageDestination(params, {
          ...changes,
          tasksAfter: null,
          ...('taskTimezone' in changes
            ? { capacityAfter: null, capacityAssignmentsAfter: null }
            : {}),
        }).split('?')[1],
      ),
    );
  return (
    <StyledDeliveryCard>
      <details open={(!mobile && activeCount > 0) || undefined}>
        <summary>
          <Trans>Filter tasks</Trans>
          {activeCount > 0 && <> · {t`${activeCount} active`}</>}
        </summary>
        <StyledDeliveryGrid>
          <label>
            <Trans>Search</Trans>
            <input
              aria-label={t`Search tasks`}
              maxLength={200}
              value={params.get('search') ?? ''}
              onChange={(event) => update({ search: event.target.value })}
            />
          </label>
          <label>
            <Trans>Project / client</Trans>
            <select
              aria-label={t`Project / client`}
              value={params.get('project') ?? ''}
              onChange={(event) => update({ project: event.target.value })}
            >
              <option value="">{t`All permitted projects`}</option>
              {selectedProject &&
                !context.projects.some(
                  (project) => project.id === selectedProject,
                ) && (
                  <option
                    value={selectedProject}
                  >{t`Selected project unavailable`}</option>
                )}
              {context.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          {params.get('view') !== 'mine' && context.actor.isManager && (
            <label>
              <Trans>Assignee</Trans>
              <select
                aria-label={t`Assignee`}
                value={params.get('member') ?? ''}
                onChange={(event) => update({ member: event.target.value })}
              >
                <option value="">{t`All assignees`}</option>
                {selectedMember &&
                  !context.members.some(
                    (member) => member.id === selectedMember,
                  ) && (
                    <option
                      value={selectedMember}
                    >{t`Selected teammate unavailable`}</option>
                  )}
                {context.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <Trans>Service</Trans>
            <select
              aria-label={t`Service`}
              value={params.get('service') ?? ''}
              onChange={(event) => update({ service: event.target.value })}
            >
              <option value="">{t`All services`}</option>
              {[
                ...new Set([
                  ...(snapshot?.serviceOptions ?? []),
                  ...(params.get('service') ? [params.get('service')!] : []),
                ]),
              ].map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Trans>Status</Trans>
            <select
              aria-label={t`Status`}
              value={params.get('status') ?? ''}
              onChange={(event) => update({ status: event.target.value })}
            >
              <option value="">{t`All statuses`}</option>
              {TASK_STATES.map((state) => (
                <option key={state} value={state}>
                  {labels.state(state)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Trans>Scheduled from</Trans>
            <input
              aria-label={t`Scheduled from`}
              type="date"
              value={params.get('from') ?? ''}
              onChange={(event) =>
                update({ from: event.target.value, through: null })
              }
            />
          </label>
          <label>
            <Trans>Scheduled through</Trans>
            <input
              aria-label={t`Scheduled through`}
              type="date"
              min={params.get('from') ?? ''}
              value={params.get('through') ?? ''}
              onChange={(event) => update({ through: event.target.value })}
            />
          </label>
          <label>
            <Trans>Needs attention</Trans>
            <select
              aria-label={t`Needs attention`}
              value={params.get('attention') ?? ''}
              onChange={(event) => update({ attention: event.target.value })}
            >
              <option value="">{t`All work`}</option>
              <option value="today">{t`Due or scheduled today`}</option>
              <option value="overdue">{t`Overdue`}</option>
            </select>
          </label>
          <label>
            <Trans>Task calendar timezone</Trans>
            <select
              aria-label={t`Task calendar timezone`}
              value={timezone}
              onChange={(event) => update({ taskTimezone: event.target.value })}
            >
              {!AVAILABLE_TIMEZONE_OPTIONS.some(
                (option) => option.value === timezone,
              ) && <option value={timezone}>{timezone}</option>}
              {AVAILABLE_TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </StyledDeliveryGrid>
        {activeCount > 0 && (
          <StyledDeliveryButton onClick={onClear}>
            <Trans>Clear filters</Trans>
          </StyledDeliveryButton>
        )}
      </details>
    </StyledDeliveryCard>
  );
};
