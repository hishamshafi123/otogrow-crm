import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { type RecurringTemplate } from '@/delivery/delivery-operations.types';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  WorkflowPinField,
  workflowPinFromForm,
} from '@/delivery/workflows/WorkflowPinField';
import {
  recurringTemplateValues,
  recurringTemplateSnapshot,
  type RecurringTemplateValues,
  type OperationSaveResult,
} from '@/delivery/operations/forms/recurring-template-values';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type RecurringTemplateFormProps = {
  workspace: DeliveryWorkspace;
  template: RecurringTemplate | null;
  timezone: string;
  busy: boolean;
  onSave: (input: Record<string, unknown>) => Promise<OperationSaveResult>;
  onCancel: () => void;
  onInspect: () => Promise<boolean>;
};
export const RecurringTemplateForm = ({
  workspace,
  template,
  timezone,
  busy,
  onSave,
  onCancel,
  onInspect,
}: RecurringTemplateFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [opened, setOpened] = useState(() => ({
    template,
    snapshot: `${timezone}:${recurringTemplateSnapshot(template)}`,
  }));
  const [values, setValues] = useState(() =>
    recurringTemplateValues(template, timezone),
  );
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [inspected, setInspected] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: values,
    busy: busy || saving,
  });
  const stale =
    opened.snapshot !== `${timezone}:${recurringTemplateSnapshot(template)}`;
  const project = workspace.projects.find(
    (item) => item.id === values.projectId,
  );
  const owners = workspace.members.filter((member) =>
    project?.memberIds.includes(member.id),
  );
  const reviewers = workspace.members.filter(
    (member) =>
      ['ADMIN', 'MANAGER'].includes(member.access) &&
      member.id !== values.assigneeId,
  );
  const checklist = values.checklist
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const requirements = [
    ...(!values.title.trim() ? [t`Add a task title.`] : []),
    ...(!project ? [t`Choose a project.`] : []),
    ...(!owners.some((member) => member.id === values.assigneeId)
      ? [t`Choose an active owner from this project’s team.`]
      : []),
    ...(!reviewers.some((member) => member.id === values.reviewerId)
      ? [t`Choose a different current manager to review the work.`]
      : []),
    ...(values.frequency === 'WEEKLY' && values.weekdays.length === 0
      ? [t`Choose at least one weekly day.`]
      : []),
    ...(!values.startDate ||
    (values.endDate && values.endDate < values.startDate)
      ? [t`Choose a start date and an optional end date on or after it.`]
      : []),
    ...(!Number.isInteger(Number(values.dueHours)) ||
    Number(values.dueHours) < 1 ||
    Number(values.dueHours) > 744
      ? [t`Use a whole deadline between 1 and 744 hours after task creation.`]
      : []),
    ...(values.frequency === 'MONTHLY' &&
    (!Number.isInteger(Number(values.monthDay)) ||
      Number(values.monthDay) < 1 ||
      Number(values.monthDay) > 31)
      ? [t`Choose a monthly day from 1 to 31.`]
      : []),
    ...(checklist.length > 100 || checklist.some((item) => item.length > 200)
      ? [t`Use at most 100 checklist items, each up to 200 characters.`]
      : []),
  ];
  const update = (change: Partial<RecurringTemplateValues>) =>
    setValues((previous) => ({ ...previous, ...change }));
  const restoreCurrent = () => {
    const next = recurringTemplateValues(template, timezone);
    setOpened({
      template,
      snapshot: `${timezone}:${recurringTemplateSnapshot(template)}`,
    });
    setValues(next);
    draft.markSaved(next);
    setVersion((value) => value + 1);
    setError('');
  };
  const reload = () => requestAction(restoreCurrent);
  if (stale && !draft.dirty && !busy && !saving && !uncertain) restoreCurrent();
  return (
    <form
      key={version}
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || saving || stale || uncertain || requirements.length) return;
        const form = new FormData(event.currentTarget);
        setSaving(true);
        setError('');
        try {
          const result = await onSave({
            ...(opened.template ? { id: opened.template.id } : {}),
            projectId: values.projectId,
            workflow: workflowPinFromForm(form, opened.template?.workflow),
            frequency: values.frequency,
            weekdays: values.weekdays.length ? values.weekdays : [1],
            monthDay:
              values.frequency === 'MONTHLY' ? Number(values.monthDay) : 1,
            time: values.time,
            startDate: values.startDate,
            endDate: values.endDate || null,
            dueHours: Number(values.dueHours),
            paused: values.paused,
            fields: {
              title: values.title.trim(),
              service: values.service.trim(),
              brief: values.brief.trim(),
              assigneeId: values.assigneeId,
              reviewerId: values.reviewerId,
              priority: 'NORMAL',
              scheduledDate: null,
              dueAt: null,
              evidence: [],
              checklist: checklist.map((text) => ({
                id: crypto.randomUUID(),
                text,
                done: false,
              })),
            },
          });
          if (result.kind === 'SAVED') {
            const next = recurringTemplateValues(null, timezone);
            setValues(next);
            draft.markSaved(next);
            setVersion((value) => value + 1);
            onCancel();
          } else if (result.kind === 'REJECTED') setError(result.message);
          else {
            setUncertain(true);
            setError(
              t`The save result is unknown. Do not create another copy or retry changed details. Inspect the current schedules first; this view cannot prove which request created a schedule.`,
            );
          }
        } finally {
          setSaving(false);
        }
      }}
    >
      <StyledDeliveryStack>
        {stale && (
          <DeliveryDraftConflict busy={busy || saving} onReload={reload} />
        )}
        {error && <p role="alert">{error}</p>}
        {uncertain && (
          <>
            <StyledDeliveryButton
              type="button"
              disabled={busy || saving}
              onClick={async () => setInspected(await onInspect())}
            >
              <Trans>Inspect current schedules</Trans>
            </StyledDeliveryButton>
            {inspected && (
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  requestAction(() => {
                    const next = recurringTemplateValues(null, timezone);
                    setValues(next);
                    draft.markSaved(next);
                    setUncertain(false);
                    setInspected(false);
                    setError('');
                    setVersion((value) => value + 1);
                    onCancel();
                  })
                }
              >
                <Trans>
                  Discard this preparation after inspecting schedules
                </Trans>
              </StyledDeliveryButton>
            )}
          </>
        )}
        <fieldset disabled={busy || saving || stale || uncertain}>
          <StyledDeliveryStack>
            <p>{t`Scheduled times use ${timezone}. A new template starts paused unless you deliberately change that option.`}</p>
            <StyledDeliveryGrid>
              <label>
                <Trans>Task title</Trans>
                <input
                  name="title"
                  required
                  maxLength={200}
                  value={values.title}
                  onChange={(event) =>
                    update({ title: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                <Trans>Project</Trans>
                <select
                  name="projectId"
                  required
                  value={values.projectId}
                  onChange={(event) =>
                    update({
                      projectId: event.currentTarget.value,
                      assigneeId: '',
                      reviewerId: '',
                    })
                  }
                >
                  <option value="">{t`Choose a project`}</option>
                  {workspace.projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Service</Trans>
                <input
                  name="service"
                  maxLength={100}
                  value={values.service}
                  placeholder={t`SEO, advertising, design…`}
                  onChange={(event) =>
                    update({ service: event.currentTarget.value })
                  }
                />
                <small>
                  <Trans>
                    Use the client’s service name so the new task reaches the
                    right workflow.
                  </Trans>
                </small>
              </label>
              <label>
                <Trans>Assignee</Trans>
                <select
                  name="assigneeId"
                  required
                  disabled={!project || owners.length === 0}
                  value={values.assigneeId}
                  onChange={(event) =>
                    update({
                      assigneeId: event.currentTarget.value,
                      ...(values.reviewerId === event.currentTarget.value
                        ? { reviewerId: '' }
                        : {}),
                    })
                  }
                >
                  <option value="">{t`Choose a project team member`}</option>
                  {owners.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Reviewer</Trans>
                <select
                  name="reviewerId"
                  required
                  value={values.reviewerId}
                  onChange={(event) =>
                    update({ reviewerId: event.currentTarget.value })
                  }
                >
                  <option value="">{t`Choose a separate manager`}</option>
                  {reviewers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Frequency</Trans>
                <select
                  name="frequency"
                  value={values.frequency}
                  onChange={(event) =>
                    update({
                      frequency:
                        event.currentTarget.value === 'DAILY'
                          ? 'DAILY'
                          : event.currentTarget.value === 'MONTHLY'
                            ? 'MONTHLY'
                            : 'WEEKLY',
                    })
                  }
                >
                  <option value="DAILY">{t`Daily`}</option>
                  <option value="WEEKLY">{t`Weekly`}</option>
                  <option value="MONTHLY">{t`Monthly`}</option>
                </select>
              </label>
              <label>
                <Trans>Local scheduled time</Trans>
                <input
                  name="time"
                  type="time"
                  required
                  value={values.time}
                  onChange={(event) =>
                    update({ time: event.currentTarget.value })
                  }
                />
              </label>
              {values.frequency === 'MONTHLY' && (
                <label>
                  <Trans>Monthly day (clamped to month end)</Trans>
                  <input
                    name="monthDay"
                    type="number"
                    min={1}
                    max={31}
                    value={values.monthDay}
                    required
                    onChange={(event) =>
                      update({ monthDay: event.currentTarget.value })
                    }
                  />
                </label>
              )}
              <label>
                <Trans>Start date</Trans>
                <input
                  type="date"
                  name="startDate"
                  required
                  value={values.startDate}
                  onChange={(event) =>
                    update({ startDate: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                <Trans>End date (optional)</Trans>
                <input
                  type="date"
                  name="endDate"
                  min={values.startDate || undefined}
                  value={values.endDate}
                  onChange={(event) =>
                    update({ endDate: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                <Trans>Deadline hours after creation</Trans>
                <input
                  type="number"
                  name="dueHours"
                  min={1}
                  max={744}
                  required
                  value={values.dueHours}
                  onChange={(event) =>
                    update({ dueHours: event.currentTarget.value })
                  }
                />
              </label>
            </StyledDeliveryGrid>
            {project && owners.length === 0 && (
              <p role="status">
                <Trans>
                  This project has no active team member available for
                  assignment. Add its team before scheduling work.
                </Trans>
              </p>
            )}
            {reviewers.length === 0 && (
              <p role="status">
                <Trans>
                  No separate current manager can review this owner’s work.
                  Review team access before creating a schedule.
                </Trans>
              </p>
            )}
            {values.frequency === 'WEEKLY' && (
              <fieldset>
                <legend>
                  <Trans>Weekly days</Trans>
                </legend>
                <StyledDeliveryRow>
                  {[
                    t`Sunday`,
                    t`Monday`,
                    t`Tuesday`,
                    t`Wednesday`,
                    t`Thursday`,
                    t`Friday`,
                    t`Saturday`,
                  ].map((day, index) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        name="weekdays"
                        value={index}
                        checked={values.weekdays.includes(index)}
                        onChange={(event) =>
                          update({
                            weekdays: event.currentTarget.checked
                              ? [...values.weekdays, index]
                              : values.weekdays.filter(
                                  (value) => value !== index,
                                ),
                          })
                        }
                      />
                      {day}
                    </label>
                  ))}
                </StyledDeliveryRow>
              </fieldset>
            )}
            <label>
              <Trans>Brief, instructions and required evidence</Trans>
              <textarea
                name="brief"
                maxLength={20000}
                value={values.brief}
                onChange={(event) =>
                  update({ brief: event.currentTarget.value })
                }
              />
            </label>
            <WorkflowPinField initial={opened.template?.workflow} />
            <label>
              <Trans>Checklist (one item per line)</Trans>
              <textarea
                name="checklist"
                value={values.checklist}
                onChange={(event) =>
                  update({ checklist: event.currentTarget.value })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                name="paused"
                checked={values.paused}
                onChange={(event) =>
                  update({ paused: event.currentTarget.checked })
                }
              />
              <Trans>Keep this template paused</Trans>
            </label>
            {requirements.length > 0 && (
              <div role="status">
                <p>
                  <Trans>Before saving:</Trans>
                </p>
                <ul>
                  {requirements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <StyledDeliveryRow>
              <StyledDeliveryButton
                type="submit"
                disabled={requirements.length > 0}
              >
                <Trans>Save recurring template</Trans>
              </StyledDeliveryButton>
              {template && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => requestAction(onCancel)}
                >
                  <Trans>Cancel edit</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </StyledDeliveryStack>
        </fieldset>
      </StyledDeliveryStack>
    </form>
  );
};
