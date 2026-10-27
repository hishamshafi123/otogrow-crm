import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import {
  type DeliveryTask,
  type DeliveryCommandRunner,
} from '@/delivery/delivery.types';
import {
  EMPTY_TASK_PLAN,
  type TaskPlan,
} from '@/delivery/capacity/capacity.types';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryTaskPlanProps = {
  task: DeliveryTask;
  canManage: boolean;
  run: DeliveryCommandRunner;
  busy: boolean;
};
export const DeliveryTaskPlan = ({
  task,
  canManage,
  run,
  busy,
}: DeliveryTaskPlanProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [editing, setEditing] = useState(false);
  const plan = task.details.plan ?? EMPTY_TASK_PLAN;
  const minutes = (value: number | null) =>
    isDefined(value) ? t`${value} min` : t`Not estimated`;
  const complexity =
    plan.complexity === 'STANDARD'
      ? t`Standard`
      : plan.complexity === 'INVOLVED'
        ? t`Involved`
        : plan.complexity === 'COMPLEX'
          ? t`Complex`
          : t`Not assessed`;
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h3>
          <Trans>Capacity planning</Trans>
        </h3>
        <p>
          <Trans>
            Remaining work estimates, not hours worked. Generation waiting does
            not consume working time.
          </Trans>
        </p>
        {editing && canManage ? (
          <TaskPlanEditor
            task={task}
            busy={busy}
            run={run}
            onClose={() => setEditing(false)}
          />
        ) : (
          <>
            <p>{t`Production: ${minutes(plan.workMinutes)} · Revision allowance: ${minutes(plan.revisionMinutes)} · Review: ${minutes(plan.reviewMinutes)}`}</p>
            <p>{t`Generation waiting: ${minutes(plan.waitMinutes)} · Review day: ${plan.reviewDate ?? t`Not scheduled`}`}</p>
            <p>{t`Complexity: ${complexity}`}</p>
            {canManage && task.details.state !== 'APPROVED' && (
              <StyledDeliveryButton
                onClick={() => requestAction(() => setEditing(true))}
                disabled={busy}
              >
                <Trans>Plan remaining effort</Trans>
              </StyledDeliveryButton>
            )}
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
type TaskPlanEditorProps = Pick<
  DeliveryTaskPlanProps,
  'task' | 'run' | 'busy'
> & { onClose: () => void };
export const TaskPlanEditor = ({
  task,
  run,
  busy,
  onClose,
}: TaskPlanEditorProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [opened, setOpened] = useState({
    revision: task.revision,
    plan: task.details.plan ?? EMPTY_TASK_PLAN,
  });
  const [plan, setPlan] = useState<TaskPlan>(opened.plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const stale = opened.revision !== task.revision;
  useDeliveryDraftStatus({
    dirty: JSON.stringify(plan) !== JSON.stringify(opened.plan),
    saving: saving || busy,
  });
  const fields = [
    ['workMinutes', t`Remaining production minutes`],
    ['revisionMinutes', t`Revision allowance minutes`],
    ['waitMinutes', t`Expected generation waiting minutes`],
    ['reviewMinutes', t`Remaining review minutes`],
  ] as const;
  return (
    <form
      aria-label={t`Plan remaining effort`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (stale || busy || saving) return;
        setSaving(true);
        setError('');
        try {
          if (
            await run({
              action: 'plan',
              taskId: task.id,
              revision: opened.revision,
              plan,
            })
          )
            onClose();
          else
            setError(
              t`The estimate was not saved. Your draft is preserved. Refresh the page to check for newer changes.`,
            );
        } catch {
          setError(
            t`The estimate was not saved. Your draft is preserved. Try again.`,
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <StyledDeliveryStack>
        {stale && (
          <div role="alert">
            <p>
              <Trans>
                This task changed. Reload its latest estimate before saving.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              onClick={() =>
                requestAction(() => {
                  const next = {
                    revision: task.revision,
                    plan: task.details.plan ?? EMPTY_TASK_PLAN,
                  };
                  setOpened(next);
                  setPlan(next.plan);
                  setError('');
                })
              }
            >
              <Trans>Reload latest estimate</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        <p>
          <Trans>
            Leave an estimate blank if unknown. Enter zero only when no time is
            needed. Split multi-day work into dated tasks. Production uses the
            assignment's scheduled day.
          </Trans>
        </p>
        <fieldset disabled={busy || saving}>
          <StyledDeliveryGrid>
            {fields.map(([field, label]) => (
              <label key={field}>
                {label}
                <input
                  type="number"
                  min={0}
                  max={10080}
                  step={1}
                  value={plan[field] ?? ''}
                  onChange={(event) =>
                    setPlan({
                      ...plan,
                      [field]:
                        event.target.value === ''
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
            ))}
            <label>
              <Trans>Planned review day</Trans>
              <input
                type="date"
                value={plan.reviewDate ?? ''}
                onChange={(event) =>
                  setPlan({ ...plan, reviewDate: event.target.value || null })
                }
              />
            </label>
            <label>
              <Trans>Complexity</Trans>
              <select
                value={plan.complexity ?? ''}
                onChange={(event) =>
                  setPlan({
                    ...plan,
                    complexity: (event.target.value ||
                      null) as TaskPlan['complexity'],
                  })
                }
              >
                <option value="">{t`Not assessed`}</option>
                <option value="STANDARD">{t`Standard`}</option>
                <option value="INVOLVED">{t`Involved`}</option>
                <option value="COMPLEX">{t`Complex`}</option>
              </select>
            </label>
          </StyledDeliveryGrid>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <StyledDeliveryButton
          type="submit"
          disabled={
            busy || saving || stale || task.details.state === 'APPROVED'
          }
        >
          <Trans>Save estimate</Trans>
        </StyledDeliveryButton>
        <StyledDeliveryButton
          type="button"
          onClick={() => requestAction(onClose)}
          disabled={busy || saving}
        >
          <Trans>Cancel estimate</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
