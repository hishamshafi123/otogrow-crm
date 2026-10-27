import { useCallback, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledWorkflowActions } from '@/delivery/workflows/workflowStyles';
import {
  type BatchCommand,
  type BatchEditorSelection,
  type BatchSnapshot,
} from '@/delivery/batches/batch.types';

type BatchEditorProps = {
  selection: BatchEditorSelection;
  data: BatchSnapshot;
  busy: boolean;
  error: string;
  onSave: (command: BatchCommand) => Promise<boolean>;
  onCancel: () => void;
  onSearch: (value: string) => void;
  onReload: () => void;
};
export const BatchEditor = ({
  selection,
  data,
  busy,
  error,
  onSave,
  onCancel,
  onSearch,
  onReload,
}: BatchEditorProps) => {
  const { t } = useLingui();
  const focusHeading = useCallback((heading: HTMLHeadingElement | null) => {
    heading?.focus();
  }, []);
  const batch = selection.batch;
  const task = selection.kind === 'item' ? selection.task : undefined;
  const currentRevision = batch
    ? (data.selected?.revision ?? batch.revision)
    : 0;
  const [search, setSearch] = useState('');
  const draft = useDeliveryDraft({
    initialValues: {
      label: batch?.label ?? '',
      startDate: batch?.startDate ?? '',
      endDate: batch?.endDate ?? '',
      timezone: batch?.timezone ?? 'Asia/Qatar',
      periodId: batch?.periodId ?? '',
      taskId: task?.taskId ?? '',
      taskRevision: task?.taskRevision ?? null,
      concept: task?.concept ?? '',
      reason: '',
    },
    revision: batch?.revision ?? 0,
    busy,
  });
  const values = draft.values;
  const update = (patch: Partial<typeof values>) =>
    draft.update({ ...values, ...patch });
  const stale = currentRevision !== (batch?.revision ?? 0);
  const requirements: string[] = [];
  if (values.reason.trim().length < 3)
    requirements.push(t`Explain the planning change.`);
  if (selection.kind === 'plan') {
    if (!values.label.trim()) requirements.push(t`Give the batch a name.`);
    if (
      (values.startDate || values.endDate) &&
      (!values.startDate ||
        !values.endDate ||
        values.endDate < values.startDate)
    )
      requirements.push(
        t`Set both dates, with the last day on or after the first day.`,
      );
    try {
      new Intl.DateTimeFormat('en', { timeZone: values.timezone });
    } catch {
      requirements.push(t`Choose a valid timezone.`);
    }
  }
  if (selection.kind === 'item' && !values.taskId)
    requirements.push(t`Choose a task from this project.`);
  const submit = async () => {
    if (busy || stale || requirements.length) return;
    const common = { projectId: data.projectId, reason: values.reason };
    let command: BatchCommand;
    if (selection.kind === 'plan')
      command = {
        kind: 'plan',
        input: {
          ...common,
          id: selection.id,
          revision: batch?.revision ?? 0,
          label: values.label,
          startDate: values.startDate || null,
          endDate: values.endDate || null,
          timezone: values.timezone,
          periodId: values.periodId || null,
        },
      };
    else if (selection.kind === 'state')
      command = {
        kind: 'state',
        input: {
          ...common,
          batchId: selection.batch.id,
          revision: selection.batch.revision,
          closed: !selection.batch.closed,
        },
      };
    else
      command = {
        kind: 'item',
        input: {
          ...common,
          batchId: selection.batch.id,
          revision: selection.batch.revision,
          taskId: values.taskId,
          taskRevision: values.taskRevision,
          active: !selection.remove,
          concept: values.concept,
        },
      };
    draft.setSaving(true);
    try {
      if (await onSave(command)) draft.markSaved();
    } finally {
      draft.setSaving(false);
    }
  };
  const title =
    selection.kind === 'plan'
      ? batch
        ? t`Edit batch plan`
        : t`New production batch`
      : selection.kind === 'state'
        ? selection.batch.closed
          ? t`Reopen planning`
          : t`Close planning`
        : selection.remove
          ? t`Remove task from batch`
          : task
            ? t`Edit task concept`
            : t`Add a task`;
  return (
    <form
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <StyledDeliveryStack>
        <h3 tabIndex={-1} ref={focusHeading}>
          {title}
        </h3>
        {selection.kind === 'plan' && (
          <>
            <label>
              <Trans>Batch name</Trans>
              <input
                required
                maxLength={160}
                value={values.label}
                onChange={(event) => update({ label: event.target.value })}
              />
            </label>
            <StyledDeliveryGrid>
              <label>
                <Trans>First day (optional)</Trans>
                <input
                  type="date"
                  value={values.startDate}
                  onChange={(event) =>
                    update({ startDate: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Last day (inclusive)</Trans>
                <input
                  type="date"
                  value={values.endDate}
                  onChange={(event) => update({ endDate: event.target.value })}
                />
              </label>
              <label>
                <Trans>Timezone</Trans>
                <input
                  required
                  maxLength={100}
                  value={values.timezone}
                  onChange={(event) => update({ timezone: event.target.value })}
                />
              </label>
            </StyledDeliveryGrid>
            <label>
              <Trans>Commitment period (optional)</Trans>
              <select
                value={values.periodId}
                onChange={(event) => update({ periodId: event.target.value })}
              >
                <option value="">{t`Across this project's commitments`}</option>
                {values.periodId &&
                  !data.periods.some(
                    (period) => period.id === values.periodId,
                  ) && (
                    <option
                      value={values.periodId}
                    >{t`Previously selected period`}</option>
                  )}
                {data.periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.label}
                  </option>
                ))}
              </select>
            </label>
            <small>
              <Trans>
                Dates organize the plan. Linking a commitment period does not
                allocate tasks or change billing.
              </Trans>
            </small>
          </>
        )}
        {selection.kind === 'state' && (
          <p>
            {selection.batch.closed ? (
              <Trans>
                Reopening lets you change task membership and concepts. Existing
                approvals and fulfilment remain intact.
              </Trans>
            ) : (
              <Trans>
                Closing freezes the plan. Task reviews, revisions and client
                fulfilment continue to update its progress.
              </Trans>
            )}
          </p>
        )}
        {selection.kind === 'item' && (
          <>
            {task ? (
              <strong>{task.title}</strong>
            ) : (
              <>
                <label>
                  <Trans>Find a task</Trans>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    maxLength={160}
                  />
                </label>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => onSearch(search)}
                >
                  <Trans>Search tasks</Trans>
                </StyledDeliveryButton>
                <label>
                  <Trans>Task</Trans>
                  <select
                    value={values.taskId}
                    onChange={(event) => {
                      const option = data.taskOptions.find(
                        (item) => item.taskId === event.target.value,
                      );
                      update({
                        taskId: option?.taskId ?? '',
                        taskRevision: option?.taskRevision ?? null,
                      });
                    }}
                  >
                    <option value="">{t`Choose a project task`}</option>
                    {values.taskId &&
                      !data.taskOptions.some(
                        (item) => item.taskId === values.taskId,
                      ) && (
                        <option
                          value={values.taskId}
                        >{t`Previously selected task — refresh if unavailable`}</option>
                      )}
                    {data.taskOptions.map((option) => (
                      <option key={option.taskId} value={option.taskId}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                </label>
                {data.moreTaskOptions && (
                  <p>
                    <Trans>
                      Showing 50 choices. Search by task name to narrow the
                      list.
                    </Trans>
                  </p>
                )}
                {!data.taskOptions.length && (
                  <p>
                    <Trans>
                      No matching unassigned tasks. Create work in the team
                      planner or change your search.
                    </Trans>
                  </p>
                )}
              </>
            )}
            {selection.remove ? (
              <p>
                <Trans>
                  This removes the task from this plan. It keeps the task,
                  reviews and commitment history.
                </Trans>
              </p>
            ) : (
              <label>
                <Trans>Concept or grouping note (optional)</Trans>
                <textarea
                  value={values.concept}
                  maxLength={500}
                  onChange={(event) => update({ concept: event.target.value })}
                />
              </label>
            )}
          </>
        )}
        <label>
          <Trans>Reason for this change</Trans>
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={values.reason}
            onChange={(event) => update({ reason: event.target.value })}
          />
        </label>
        {stale && (
          <div role="alert">
            <p>
              <Trans>
                This batch changed while you were editing. Refresh before
                saving; your draft is kept until you choose to discard it.
              </Trans>
            </p>
            <StyledDeliveryButton type="button" onClick={onReload}>
              <Trans>Refresh batch</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {requirements.length > 0 && (
          <ul>
            {requirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        )}
        <StyledWorkflowActions>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={busy || stale || requirements.length > 0}
          >
            <Trans>Save plan change</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledWorkflowActions>
      </StyledDeliveryStack>
    </form>
  );
};
