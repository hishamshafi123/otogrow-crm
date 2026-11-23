import {
  commitmentLastDay,
  commitmentEndExclusive,
} from '@/delivery/commitments/commitmentDates';
import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledCommitmentActions } from '@/delivery/commitments/commitmentStyles';
import { useCommitmentLabels } from '@/delivery/commitments/useCommitmentLabels';
import {
  type CommitmentCommand,
  type CommitmentEditorSelection,
  type CommitmentSnapshot,
} from '@/delivery/commitments/commitment.types';

type CommitmentEditorProps = {
  selection: CommitmentEditorSelection;
  data: CommitmentSnapshot;
  billing: string;
  busy: boolean;
  saving: boolean;
  error: string;
  moreTaskOptions: boolean;
  moreParentOptions: boolean;
  parentSearchFailed: boolean;
  taskOptions: CommitmentSnapshot['taskOptions'];
  parentOptions: CommitmentSnapshot['taskOptions'];
  onSearch: (value: string, parents: boolean) => void;
  onSelectedSources: (selection: {
    taskId: string | null;
    parentTaskId: string | null;
  }) => void;
  onSave: (command: CommitmentCommand) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => Promise<void>;
};
export const CommitmentEditor = ({
  selection,
  data,
  billing,
  busy,
  saving,
  error,
  moreTaskOptions,
  moreParentOptions,
  parentSearchFailed,
  taskOptions,
  parentOptions,
  onSearch,
  onSelectedSources,
  onSave,
  onCancel,
  onReload,
}: CommitmentEditorProps) => {
  const { t } = useLingui();
  const labels = useCommitmentLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const period = data.periods.find((item) => item.id === data.selectedPeriodId);
  const editedPeriod =
    selection.kind === 'period'
      ? data.periods.find((item) => item.id === selection.id)
      : period;
  const line =
    selection.kind === 'line'
      ? data.lines.find((item) => item.id === selection.id)
      : undefined;
  const allocation =
    selection.kind === 'remove'
      ? data.allocations.find((item) => item.taskId === selection.taskId)
      : undefined;
  const revision =
    (editedPeriod?.revision ?? 0) +
    data.lines.reduce((total, item) => total + item.revision, 0) +
    (allocation?.revision ?? 0);
  const draft = useDeliveryDraft({
    initialValues: {
      label:
        selection.kind === 'period'
          ? (editedPeriod?.label ?? '')
          : (line?.label ?? ''),
      startDate: editedPeriod?.startDate ?? '',
      lastDay: commitmentLastDay(editedPeriod?.endDateExclusive) ?? '',
      timezone: editedPeriod?.timezone ?? 'Asia/Qatar',
      unit: line?.unit ?? 'UNIQUE_VIDEO',
      quantity: String(line?.promisedQuantity ?? 0),
      lineId: '',
      taskId: '',
      parentTaskId: '',
      reason: '',
      periodRevision: editedPeriod?.revision ?? 0,
      lineRevision: line?.revision ?? 0,
      allocationRevision: allocation?.revision ?? 0,
      taskRevision: 0,
    },
    revision,
    busy: saving,
  });
  const [failed, setFailed] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const values = draft.values;
  const chosenTask =
    data.selectedTask?.taskId === values.taskId
      ? data.selectedTask
      : taskOptions.find((item) => item.taskId === values.taskId);
  const chosenParent =
    data.selectedParent?.taskId === values.parentTaskId
      ? data.selectedParent
      : parentOptions.find((item) => item.taskId === values.parentTaskId);
  const update = (patch: Partial<typeof values>) =>
    draft.update({ ...values, ...patch });
  const selectedLine = data.lines.find((item) => item.id === values.lineId);
  const newPeriod = selection.kind === 'period' && !editedPeriod;
  const needsEnd = (editedPeriod?.billing ?? billing) === 'RETAINER';
  const unavailable =
    selection.kind === 'period'
      ? editedPeriod?.state === 'CLOSED'
      : !period || (period.state !== 'OPEN' && selection.kind !== 'state');
  const selectedTaskChanged =
    selection.kind === 'assign' &&
    chosenTask &&
    (chosenTask.taskRevision !== values.taskRevision ||
      chosenTask.allocationRevision !== values.allocationRevision);
  const parentEligible =
    chosenParent?.allocatedUnit === 'UNIQUE_VIDEO' &&
    chosenParent.allocatedPeriodId === period?.id &&
    chosenParent.taskId !== values.taskId;
  const stale = draft.stale || unavailable || Boolean(selectedTaskChanged);
  const periodRequirements: string[] = [];
  if (selection.kind === 'period') {
    if (!commitmentEndExclusive(values.startDate))
      periodRequirements.push(t`Choose a valid start date.`);
    if (needsEnd && !values.lastDay)
      periodRequirements.push(t`Choose the last day for this retainer period.`);
    if (
      values.lastDay &&
      (!commitmentEndExclusive(values.lastDay) ||
        values.lastDay < values.startDate)
    )
      periodRequirements.push(
        t`Choose a valid last day on or after the start date.`,
      );
    try {
      if (!values.timezone.trim()) throw new Error();
      new Intl.DateTimeFormat('en', { timeZone: values.timezone });
    } catch {
      periodRequirements.push(t`Enter a valid timezone, such as Asia/Qatar.`);
    }
  }
  const submitDisabled =
    busy ||
    draft.saving ||
    stale ||
    periodRequirements.length > 0 ||
    values.reason.trim().length < 3 ||
    ((selection.kind === 'period' || selection.kind === 'line') &&
      !values.label.trim()) ||
    (selection.kind === 'assign' &&
      (!values.taskId ||
        !selectedLine ||
        (selectedLine.unit === 'VARIATION' &&
          (!values.parentTaskId || !parentEligible))));
  const title =
    selection.kind === 'period'
      ? newPeriod
        ? t`Plan a period or package`
        : t`Edit period`
      : selection.kind === 'line'
        ? line
          ? t`Edit promised work`
          : t`Add promised work`
        : selection.kind === 'assign'
          ? t`Link a task to promised work`
          : selection.kind === 'remove'
            ? t`Remove task from commitment`
            : selection.state === 'CLOSED'
              ? t`Close this period`
              : t`Reopen this period`;
  const reload = () => requestAction(() => void onReload());
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitDisabled) return;
        draft.setSaving(true);
        setFailed(false);
        const common = {
          engagementId: data.engagementId,
          reason: values.reason.trim(),
        };
        let command: CommitmentCommand;
        if (selection.kind === 'period')
          command = {
            kind: 'period',
            input: {
              ...common,
              id: selection.id,
              revision: values.periodRevision,
              label: values.label,
              startDate: values.startDate,
              endDateExclusive: commitmentEndExclusive(values.lastDay),
              timezone: values.timezone,
            },
          };
        else if (selection.kind === 'line')
          command = {
            kind: 'line',
            input: {
              ...common,
              id: selection.id,
              periodId: period!.id,
              periodRevision: values.periodRevision,
              revision: values.lineRevision,
              label: values.label,
              unit: values.unit,
              promisedQuantity: Number(values.quantity),
            },
          };
        else if (selection.kind === 'assign')
          command = {
            kind: 'assign',
            input: {
              ...common,
              periodId: period!.id,
              periodRevision: values.periodRevision,
              lineId: values.lineId,
              lineRevision: values.lineRevision,
              taskId: values.taskId,
              taskRevision: values.taskRevision,
              revision: values.allocationRevision,
              parentTaskId:
                selectedLine?.unit === 'VARIATION' ? values.parentTaskId : null,
            },
          };
        else if (selection.kind === 'remove')
          command = {
            kind: 'remove',
            input: {
              ...common,
              periodId: period!.id,
              taskId: selection.taskId,
              revision: values.allocationRevision,
            },
          };
        else
          command = {
            kind: 'state',
            input: {
              ...common,
              periodId: period!.id,
              revision: values.periodRevision,
              state: selection.state,
            },
          };
        try {
          if (await onSave(command)) draft.markSaved();
          else setFailed(true);
        } finally {
          draft.setSaving(false);
        }
      }}
    >
      <StyledDeliveryStack>
        <h3>{title}</h3>
        {stale && (
          <DeliveryDraftConflict
            onReload={reload}
            busy={busy || draft.saving}
          />
        )}
        <fieldset disabled={busy || draft.saving || stale}>
          <StyledDeliveryStack>
            {selection.kind === 'period' && (
              <>
                <StyledDeliveryGrid>
                  <label>
                    <Trans>Period or package name</Trans>
                    <input
                      required
                      maxLength={160}
                      value={values.label}
                      onChange={(event) =>
                        update({ label: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <Trans>Timezone</Trans>
                    <input
                      required
                      maxLength={100}
                      value={values.timezone}
                      onChange={(event) =>
                        update({ timezone: event.target.value })
                      }
                    />
                  </label>
                </StyledDeliveryGrid>
                <StyledDeliveryGrid>
                  <label>
                    <Trans>Start date</Trans>
                    <input
                      required
                      type="date"
                      value={values.startDate}
                      onChange={(event) =>
                        update({ startDate: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <Trans>Last day</Trans>
                    <input
                      required={needsEnd}
                      type="date"
                      min={values.startDate || undefined}
                      value={values.lastDay}
                      onChange={(event) =>
                        update({ lastDay: event.target.value })
                      }
                    />
                  </label>
                </StyledDeliveryGrid>
                <small>
                  <Trans>
                    The last day is included in this period. Retainers require
                    both dates; a one-time package can stay open-ended.
                    Unfinished work does not roll into another period
                    automatically.
                  </Trans>
                </small>
              </>
            )}
            {selection.kind === 'line' && (
              <>
                <label>
                  <Trans>Promised item name</Trans>
                  <input
                    required
                    maxLength={160}
                    value={values.label}
                    onChange={(event) => update({ label: event.target.value })}
                  />
                </label>
                <StyledDeliveryGrid>
                  <label>
                    <Trans>Work type</Trans>
                    <select
                      disabled={Boolean(line?.assignedQuantity)}
                      value={values.unit}
                      onChange={(event) => update({ unit: event.target.value })}
                    >
                      {['UNIQUE_VIDEO', 'VARIATION', 'OTHER'].map((unit) => (
                        <option key={unit} value={unit}>
                          {labels.unit(unit)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <Trans>Promised quantity</Trans>
                    <input
                      type="number"
                      required
                      min={0}
                      max={1000000}
                      step={1}
                      value={values.quantity}
                      onChange={(event) =>
                        update({ quantity: event.target.value })
                      }
                    />
                  </label>
                </StyledDeliveryGrid>
                <small>
                  <Trans>
                    Each linked task counts as one work item. Video variations
                    are counted separately from original videos.
                  </Trans>
                </small>
              </>
            )}
            {selection.kind === 'assign' && (
              <>
                <label>
                  <Trans>Commitment item</Trans>
                  <select
                    required
                    value={values.lineId}
                    onChange={(event) => {
                      const next = data.lines.find(
                        (item) => item.id === event.target.value,
                      );
                      update({
                        lineId: event.target.value,
                        lineRevision: next?.revision ?? 0,
                        parentTaskId: '',
                      });
                      onSelectedSources({
                        taskId: values.taskId || null,
                        parentTaskId: null,
                      });
                    }}
                  >
                    <option value="">{t`Choose promised work`}</option>
                    {data.lines.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · {labels.unit(item.unit)}
                      </option>
                    ))}
                  </select>
                </label>
                <StyledCommitmentActions>
                  <label>
                    <Trans>Find a task</Trans>
                    <input
                      value={taskSearch}
                      maxLength={160}
                      onChange={(event) => setTaskSearch(event.target.value)}
                    />
                  </label>
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => onSearch(taskSearch, false)}
                  >
                    <Trans>Search tasks</Trans>
                  </StyledDeliveryButton>
                </StyledCommitmentActions>
                <label>
                  <Trans>Task to link</Trans>
                  <select
                    required
                    value={values.taskId}
                    onChange={(event) => {
                      const next = taskOptions.find(
                        (item) => item.taskId === event.target.value,
                      );
                      onSelectedSources({
                        taskId: next?.taskId ?? null,
                        parentTaskId: values.parentTaskId || null,
                      });
                      update({
                        taskId: next?.taskId ?? '',
                        taskRevision: next?.taskRevision ?? 0,
                        allocationRevision: next?.allocationRevision ?? 0,
                      });
                    }}
                  >
                    <option value="">{t`Choose a task`}</option>
                    {chosenTask &&
                      !taskOptions.some(
                        (item) => item.taskId === chosenTask.taskId,
                      ) && (
                        <option value={chosenTask.taskId}>
                          {chosenTask.name}
                        </option>
                      )}
                    {taskOptions.map((item) => (
                      <option key={item.taskId} value={item.taskId}>
                        {item.name}
                        {item.allocatedLineId ? ` · ${t`Already linked`}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {moreTaskOptions && (
                  <small>
                    <Trans>
                      More tasks match this search. Use a more specific task
                      name to find the right one.
                    </Trans>
                  </small>
                )}
                {chosenTask?.allocatedLineId && (
                  <p>
                    <Trans>
                      This replaces the task’s existing commitment assignment.
                      The task will count in only one item and period.
                    </Trans>
                  </p>
                )}
                {selectedLine?.unit === 'VARIATION' &&
                  values.parentTaskId &&
                  !parentEligible && (
                    <p role="status">
                      <Trans>
                        Choose an original video currently linked to this
                        period.
                      </Trans>
                    </p>
                  )}
                {selectedLine?.unit === 'VARIATION' && (
                  <>
                    {parentSearchFailed && (
                      <p role="alert">
                        <Trans>
                          Could not load original video choices. Search again to
                          retry.
                        </Trans>
                      </p>
                    )}
                    {moreParentOptions && (
                      <small>
                        <Trans>
                          More tasks match. Search for the original video by
                          name.
                        </Trans>
                      </small>
                    )}
                    <StyledCommitmentActions>
                      <label>
                        <Trans>Find the original video task</Trans>
                        <input
                          value={parentSearch}
                          maxLength={160}
                          onChange={(event) =>
                            setParentSearch(event.target.value)
                          }
                        />
                      </label>
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => onSearch(parentSearch, true)}
                      >
                        <Trans>Search original videos</Trans>
                      </StyledDeliveryButton>
                    </StyledCommitmentActions>
                    <label>
                      <Trans>Original unique-video task</Trans>
                      <select
                        required
                        value={values.parentTaskId}
                        onChange={(event) => {
                          const next = parentOptions.find(
                            (item) => item.taskId === event.target.value,
                          );
                          onSelectedSources({
                            taskId: values.taskId || null,
                            parentTaskId: next?.taskId ?? null,
                          });
                          update({ parentTaskId: next?.taskId ?? '' });
                        }}
                      >
                        <option value="">{t`Choose a linked original video`}</option>
                        {chosenParent &&
                          !parentOptions.some(
                            (item) => item.taskId === chosenParent.taskId,
                          ) && (
                            <option value={chosenParent.taskId}>
                              {chosenParent.name}
                            </option>
                          )}
                        {parentOptions
                          .filter(
                            (item) =>
                              item.allocatedUnit === 'UNIQUE_VIDEO' &&
                              item.allocatedPeriodId === period?.id &&
                              item.taskId !== values.taskId,
                          )
                          .map((item) => (
                            <option key={item.taskId} value={item.taskId}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
              </>
            )}
            {selection.kind === 'remove' && (
              <p>
                {allocation?.taskName ?? t`Task no longer available`} ·{' '}
                <Trans>
                  The task stays in the project. Its assignment and current
                  credit are removed from this commitment.
                </Trans>
              </p>
            )}
            {selection.kind === 'state' && (
              <p>
                {selection.state === 'CLOSED'
                  ? t`Closing freezes the plan. Fulfilment can still change if a client objects or work is reopened.`
                  : t`Reopening allows the plan and task assignments to be edited again.`}
              </p>
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
          </StyledDeliveryStack>
        </fieldset>
        {periodRequirements.length > 0 && (
          <div role="status">
            <ul>
              {periodRequirements.map((requirement) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {failed && (
          <p role="status">
            <Trans>
              Your draft is still here. Reload the latest plan before retrying a
              conflicting change.
            </Trans>
          </p>
        )}
        <StyledCommitmentActions>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={submitDisabled}
          >
            <Trans>Save commitment change</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            onClick={() => requestAction(onCancel)}
          >
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
          {failed && (
            <StyledDeliveryButton
              type="button"
              onClick={reload}
              disabled={busy || draft.saving}
            >
              <Trans>Reload latest plan</Trans>
            </StyledDeliveryButton>
          )}
        </StyledCommitmentActions>
      </StyledDeliveryStack>
    </form>
  );
};
