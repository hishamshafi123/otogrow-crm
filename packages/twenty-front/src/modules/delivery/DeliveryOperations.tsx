import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState, type FormEvent } from 'react';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import {
  type OperationsSnapshot,
  type RecurringTemplate,
} from '@/delivery/delivery-operations.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
  StyledDeliveryBadge,
} from '@/delivery/deliveryStyles';

const GET_OPERATIONS = gql`
  query DeliveryOperations {
    deliveryOperations
  }
`;
const CHANGE_OPERATIONS = gql`
  mutation ChangeDeliveryOperations($input: JSON!) {
    changeDeliveryOperations(input: $input)
  }
`;
type DeliveryOperationsProps = {
  workspace: DeliveryWorkspace;
  task?: DeliveryTask;
  onChanged: () => Promise<unknown>;
  onOpenTask?: (id: string) => void;
};
export const DeliveryOperations = ({
  workspace,
  task,
  onChanged,
  onOpenTask,
}: DeliveryOperationsProps) => {
  const { t } = useLingui();
  const query = useQuery<{ deliveryOperations: OperationsSnapshot }>(
    GET_OPERATIONS,
    { fetchPolicy: 'network-only', pollInterval: 30000 },
  );
  const [mutate, mutation] = useMutation<{
    changeDeliveryOperations: OperationsSnapshot;
  }>(CHANGE_OPERATIONS);
  const [error, setError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecurringTemplate | null>(null);
  const data = query.data?.deliveryOperations;
  const actor = workspace.actor;
  const manager = actor.isManager;
  const run = async (input: Record<string, unknown>) => {
    try {
      setError('');
      const result = await mutate({ variables: { input } });
      if (result.data) {
        query.client.writeQuery({
          query: GET_OPERATIONS,
          data: { deliveryOperations: result.data.changeDeliveryOperations },
        });
        if (result.data.changeDeliveryOperations.link)
          setLink(result.data.changeDeliveryOperations.link);
      }
      await onChanged();
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save this operation.`,
      );
      return false;
    }
  };
  const taskId = task?.id;
  const refetch = query.refetch;
  useEffect(() => {
    if (!taskId) return;
    void mutate({ variables: { input: { action: 'seen', taskId } } })
      .then(() => refetch())
      .catch(() =>
        setError(
          t`Could not mark this task as seen. Use Acknowledge in Follow-through.`,
        ),
      );
  }, [taskId, mutate, refetch, t]);
  const labels: Record<string, string> = {
    DAILY: t`Daily`,
    WEEKLY: t`Weekly`,
    MONTHLY: t`Monthly`,
    WAITING: t`Awaiting confirmation`,
    FULFILLED: t`Fulfilled`,
    REDOING: t`Redoing`,
    NOT_FULFILLED: t`Not fulfilled`,
    DELIVERED: t`Delivery recorded`,
    PENDING: t`Waiting`,
    SENDING: t`Sending`,
    SENT: t`Telegram sent`,
    UNCONFIGURED: t`Telegram unavailable`,
    FAILED: t`Send failed`,
    UNCERTAIN: t`Delivery uncertain`,
    SUPPRESSED: t`No ping needed`,
    NORMAL: t`Normal`,
    URGENT: t`Urgent`,
  };
  const label = (value: string) => labels[value] ?? value;
  const name = (id: string) =>
    (id === 'system'
      ? t`System`
      : workspace.members.find((member) => member.id === id)?.name) ??
    t`Former member`;
  const title = (id: string) =>
    workspace.tasks.find((item) => item.id === id)?.title ?? t`Task`;
  const date = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      timeZone: data?.timezone ?? 'UTC',
    });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return new FormData(event.currentTarget);
  };
  const field = (form: FormData, key: string) =>
    String(form.get(key) ?? '').trim();
  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!data)
    return (
      <p>
        <Trans>Loading follow-through…</Trans>
      </p>
    );
  const fulfilment = data.fulfilments.find((item) => item.taskId === taskId);
  const notices = data.notices.filter((item) =>
    task ? item.taskId === task.id : item.recipientId === actor.memberId,
  );
  const memberOptions = workspace.members.map((member) => (
    <option key={member.id} value={member.id}>
      {member.name}
    </option>
  ));
  return (
    <StyledDeliveryStack>
      {error && <p role="alert">{error}</p>}
      <StyledDeliveryRow>
        <StyledDeliveryBadge>{data.timezone}</StyledDeliveryBadge>
        <StyledDeliveryBadge>
          {data.enabled ? t`Schedules enabled` : t`Schedules paused`}
        </StyledDeliveryBadge>
        <StyledDeliveryButton onClick={() => void query.refetch()}>
          <Trans>Refresh follow-through</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {task && (
        <>
          <StyledDeliveryCard>
            <StyledDeliveryStack>
              <h3>
                <Trans>Delivery and fulfilment</Trans>
              </h3>
              <p>
                {fulfilment
                  ? `${label(fulfilment.status)} · ${t`Delivery cycle`} ${fulfilment.cycle}`
                  : t`No delivery recorded. Approval alone does not confirm delivery.`}
              </p>
              {fulfilment && (
                <>
                  <p>
                    <Trans>Delivered:</Trans> {date(fulfilment.deliveredAt)}
                  </p>
                  {fulfilment.nextCheckAt && (
                    <p>
                      <Trans>Next fulfilment check:</Trans>{' '}
                      {date(fulfilment.nextCheckAt)}
                    </p>
                  )}
                  <details>
                    <summary>{t`Delivery history`}</summary>
                    {fulfilment.history.map((entry, index) => (
                      <p key={index}>
                        {date(entry.at)} · {label(entry.action)} ·{' '}
                        {name(entry.actorId)}: {entry.note}
                      </p>
                    ))}
                  </details>
                </>
              )}
              {manager &&
                task.assigneeId !== actor.memberId &&
                task.details.state === 'APPROVED' &&
                fulfilment?.status !== 'WAITING' && (
                  <form
                    onSubmit={async (event) => {
                      const form = submit(event);
                      await run({
                        action: 'delivered',
                        taskId,
                        revision: task.revision,
                        note: field(form, 'note'),
                      });
                    }}
                  >
                    <StyledDeliveryStack>
                      <label>
                        <Trans>Delivery evidence or note</Trans>
                        <textarea
                          name="note"
                          required
                          maxLength={2000}
                          placeholder={t`Where and when did you send the work?`}
                        />
                      </label>
                      <StyledDeliveryButton
                        type="submit"
                        disabled={mutation.loading}
                      >
                        <Trans>Record delivery now</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryStack>
                  </form>
                )}
              {manager &&
                task.assigneeId !== actor.memberId &&
                fulfilment?.status === 'WAITING' && (
                  <form
                    onSubmit={async (event) => {
                      const form = submit(event);
                      await run({
                        action: 'fulfilment',
                        taskId,
                        cycle: fulfilment.cycle,
                        historyLength: fulfilment.history.length,
                        decision: field(form, 'decision'),
                        note: field(form, 'note'),
                      });
                    }}
                  >
                    <StyledDeliveryStack>
                      <label>
                        <Trans>Fulfilment decision</Trans>
                        <select name="decision">
                          <option value="FULFILLED">{t`Fulfilled`}</option>
                          <option value="NOT_FULFILLED">{t`Not fulfilled — ask again in 12 hours`}</option>
                          <option value="REDOING">{t`Redoing — return to revision`}</option>
                        </select>
                      </label>
                      <label>
                        <Trans>Decision note</Trans>
                        <textarea name="note" required maxLength={2000} />
                      </label>
                      <StyledDeliveryButton
                        type="submit"
                        disabled={mutation.loading}
                      >
                        <Trans>Save fulfilment decision</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryStack>
                  </form>
                )}
            </StyledDeliveryStack>
          </StyledDeliveryCard>
          <StyledDeliveryCard>
            <h3>
              <Trans>Address an internal message</Trans>
            </h3>
            <form
              onSubmit={async (event) => {
                const element = event.currentTarget;
                const form = submit(event);
                if (
                  await run({
                    action: 'message',
                    taskId,
                    recipientId: field(form, 'recipientId'),
                    text: field(form, 'text'),
                  })
                )
                  element.reset();
              }}
            >
              <StyledDeliveryStack>
                <label>
                  <Trans>Recipient</Trans>
                  <select name="recipientId" required>
                    {memberOptions}
                  </select>
                </label>
                <label>
                  <Trans>Message</Trans>
                  <textarea name="text" required maxLength={2000} />
                </label>
                <small>
                  <Trans>
                    One Telegram ping after five minutes if unread and
                    unacknowledged. Opening this task counts as seen.
                  </Trans>
                </small>
                <StyledDeliveryButton type="submit" disabled={mutation.loading}>
                  <Trans>Send internal message</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryStack>
            </form>
          </StyledDeliveryCard>
          {manager && (
            <StyledDeliveryCard>
              <h3>
                <Trans>Flag for founder</Trans>
              </h3>
              <form
                onSubmit={async (event) => {
                  const form = submit(event);
                  await run({
                    action: 'alert',
                    taskId,
                    category: field(form, 'category'),
                    severity: field(form, 'severity'),
                    ownerId: field(form, 'ownerId'),
                    reason: field(form, 'reason'),
                  });
                }}
              >
                <StyledDeliveryStack>
                  <label>
                    <Trans>Issue</Trans>
                    <select name="category">
                      <option value="CLIENT">{t`Unhappy client`}</option>
                      <option value="CONTRACT">{t`Scope or contract`}</option>
                      <option value="BUDGET">{t`Budget concern`}</option>
                    </select>
                  </label>
                  <label>
                    <Trans>Severity</Trans>
                    <select name="severity">
                      <option value="NORMAL">{t`Normal`}</option>
                      <option value="URGENT">{t`Urgent`}</option>
                    </select>
                  </label>
                  <label>
                    <Trans>Owner</Trans>
                    <select
                      name="ownerId"
                      defaultValue={task.details.reviewerId}
                    >
                      {memberOptions}
                    </select>
                  </label>
                  <label>
                    <Trans>Reason</Trans>
                    <textarea name="reason" required maxLength={2000} />
                  </label>
                  <StyledDeliveryButton
                    type="submit"
                    disabled={mutation.loading}
                  >
                    <Trans>Flag issue</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryStack>
              </form>
            </StyledDeliveryCard>
          )}
        </>
      )}
      <h3>
        <Trans>Notifications and messages</Trans>
      </h3>
      {!notices.length && (
        <p>
          <Trans>No notifications here yet.</Trans>
        </p>
      )}
      {notices
        .slice()
        .reverse()
        .map((notice) => (
          <StyledDeliveryCard key={notice.id}>
            <StyledDeliveryStack>
              <strong>
                {notice.taskId.startsWith('meta-report:')
                  ? t`Meta report`
                  : title(notice.taskId)}
              </strong>
              <p>{notice.text}</p>
              <small>
                {name(notice.recipientId)} · {date(notice.createdAt)} ·{' '}
                {notice.acknowledgedAt
                  ? t`Acknowledged`
                  : notice.seenAt
                    ? t`Seen`
                    : t`Unread`}{' '}
                · {label(notice.sendState)}
              </small>
              {notice.error && <p>{notice.error}</p>}
              <StyledDeliveryRow>
                {notice.taskId.startsWith('meta-report:') && (
                  <a href="/delivery?view=ads">
                    <Trans>Open advertising reports</Trans>
                  </a>
                )}
                {onOpenTask && !notice.taskId.startsWith('meta-report:') && (
                  <StyledDeliveryButton
                    onClick={() => onOpenTask(notice.taskId)}
                  >
                    <Trans>Open task</Trans>
                  </StyledDeliveryButton>
                )}
                {notice.recipientId === actor.memberId &&
                  !notice.acknowledgedAt && (
                    <StyledDeliveryButton
                      disabled={mutation.loading}
                      onClick={() =>
                        void run({ action: 'acknowledge', id: notice.id })
                      }
                    >
                      <Trans>Acknowledge</Trans>
                    </StyledDeliveryButton>
                  )}
              </StyledDeliveryRow>
            </StyledDeliveryStack>
          </StyledDeliveryCard>
        ))}
      {!task && (
        <>
          {manager && (
            <>
              <h3>
                <Trans>Fulfilment checks</Trans>
              </h3>
              {data.fulfilments
                .filter((item) => item.status !== 'FULFILLED')
                .map((item) => (
                  <StyledDeliveryCard key={item.taskId}>
                    <strong>{title(item.taskId)}</strong>
                    <p>
                      {label(item.status)} ·{' '}
                      {item.nextCheckAt
                        ? date(item.nextCheckAt)
                        : t`Waiting for revised approval and redelivery`}
                    </p>
                    <StyledDeliveryButton
                      onClick={() => onOpenTask?.(item.taskId)}
                    >
                      <Trans>Open delivery</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryCard>
                ))}
              <h3>
                <Trans>Recurring work</Trans>
              </h3>
              <p>
                <Trans>
                  One task per occurrence. After downtime, only the latest
                  missed occurrence is created; earlier ones are counted as
                  skipped. Deadlines are relative to creation.
                </Trans>
              </p>
              <StyledDeliveryGrid>
                {data.templates.map((template) => (
                  <StyledDeliveryCard key={template.id}>
                    <StyledDeliveryStack>
                      <strong>{template.fields.title}</strong>
                      <small>
                        {label(template.frequency)} · {template.time} ·{' '}
                        {name(template.fields.assigneeId)}
                      </small>
                      <p>
                        {template.paused ? t`Paused` : t`Active`} ·{' '}
                        {t`Last occurrence`}: {template.lastDate ?? '—'} ·{' '}
                        {t`Skipped`}: {template.skipped}
                      </p>
                      {template.error && <p role="alert">{template.error}</p>}
                      <StyledDeliveryRow>
                        <StyledDeliveryButton
                          onClick={() => setEditing(template)}
                        >
                          <Trans>Edit template</Trans>
                        </StyledDeliveryButton>
                        <StyledDeliveryButton
                          disabled={mutation.loading}
                          onClick={() =>
                            void run({
                              action: 'pause',
                              id: template.id,
                              paused: !template.paused,
                            })
                          }
                        >
                          {template.paused ? t`Resume` : t`Pause`}
                        </StyledDeliveryButton>
                        {template.lastTaskId && (
                          <StyledDeliveryButton
                            onClick={() => onOpenTask?.(template.lastTaskId!)}
                          >
                            <Trans>Last task</Trans>
                          </StyledDeliveryButton>
                        )}
                      </StyledDeliveryRow>
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
                ))}
              </StyledDeliveryGrid>
              <StyledDeliveryCard>
                <h3>
                  {editing
                    ? t`Edit recurring template`
                    : t`New recurring template`}
                </h3>
                <form
                  key={editing?.id ?? 'new'}
                  onSubmit={async (event) => {
                    const form = submit(event);
                    const checklist = field(form, 'checklist')
                      .split('\n')
                      .map((text) => text.trim())
                      .filter(Boolean)
                      .map((text) => ({
                        id: crypto.randomUUID(),
                        text,
                        done: false,
                      }));
                    if (
                      await run({
                        action: 'template',
                        template: {
                          ...(editing ? { id: editing.id } : {}),
                          projectId: field(form, 'projectId'),
                          frequency: field(form, 'frequency'),
                          weekdays: form.getAll('weekdays').map(Number),
                          monthDay: Number(field(form, 'monthDay')),
                          time: field(form, 'time'),
                          startDate: field(form, 'startDate'),
                          endDate: field(form, 'endDate') || null,
                          dueHours: Number(field(form, 'dueHours')),
                          paused: form.has('paused'),
                          fields: {
                            title: field(form, 'title'),
                            service: field(form, 'service'),
                            brief: field(form, 'brief'),
                            assigneeId: field(form, 'assigneeId'),
                            reviewerId: field(form, 'reviewerId'),
                            priority: 'NORMAL',
                            scheduledDate: null,
                            dueAt: null,
                            evidence: [],
                            checklist,
                          },
                        },
                      })
                    )
                      setEditing(null);
                  }}
                >
                  <StyledDeliveryStack>
                    <StyledDeliveryGrid>
                      <label>
                        <Trans>Task title</Trans>
                        <input
                          name="title"
                          required
                          maxLength={200}
                          defaultValue={editing?.fields.title}
                        />
                      </label>
                      <label>
                        <Trans>Project</Trans>
                        <select
                          name="projectId"
                          required
                          defaultValue={editing?.projectId}
                        >
                          {workspace.projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <Trans>Service</Trans>
                        <input
                          name="service"
                          maxLength={100}
                          defaultValue={editing?.fields.service}
                          placeholder={t`SEO, advertising, design…`}
                        />
                      </label>
                      <label>
                        <Trans>Assignee</Trans>
                        <select
                          name="assigneeId"
                          required
                          defaultValue={editing?.fields.assigneeId}
                        >
                          {memberOptions}
                        </select>
                      </label>
                      <label>
                        <Trans>Reviewer</Trans>
                        <select
                          name="reviewerId"
                          required
                          defaultValue={
                            editing?.fields.reviewerId ?? actor.memberId
                          }
                        >
                          {workspace.members
                            .filter((member) =>
                              ['ADMIN', 'MANAGER'].includes(member.access),
                            )
                            .map((member) => (
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
                          defaultValue={editing?.frequency ?? 'WEEKLY'}
                        >
                          <option value="DAILY">{t`Daily`}</option>
                          <option value="WEEKLY">{t`Weekly`}</option>
                          <option value="MONTHLY">{t`Monthly`}</option>
                        </select>
                      </label>
                      <label>
                        <Trans>Local scheduled time</Trans>
                        <input
                          type="time"
                          name="time"
                          required
                          defaultValue={editing?.time ?? '09:00'}
                        />
                      </label>
                      <label>
                        <Trans>Monthly day (clamped to month end)</Trans>
                        <input
                          type="number"
                          name="monthDay"
                          min={1}
                          max={31}
                          required
                          defaultValue={editing?.monthDay ?? 1}
                        />
                      </label>
                      <label>
                        <Trans>Start date</Trans>
                        <input
                          type="date"
                          name="startDate"
                          required
                          defaultValue={
                            editing?.startDate ??
                            new Date().toISOString().slice(0, 10)
                          }
                        />
                      </label>
                      <label>
                        <Trans>End date (optional)</Trans>
                        <input
                          type="date"
                          name="endDate"
                          defaultValue={editing?.endDate ?? ''}
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
                          defaultValue={editing?.dueHours ?? 24}
                        />
                      </label>
                    </StyledDeliveryGrid>
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
                              defaultChecked={(
                                editing?.weekdays ?? [1]
                              ).includes(index)}
                            />
                            {day}
                          </label>
                        ))}
                      </StyledDeliveryRow>
                    </fieldset>
                    <label>
                      <Trans>Brief, instructions and required evidence</Trans>
                      <textarea
                        name="brief"
                        maxLength={20000}
                        defaultValue={editing?.fields.brief}
                      />
                    </label>
                    <label>
                      <Trans>Checklist (one item per line)</Trans>
                      <textarea
                        name="checklist"
                        defaultValue={editing?.fields.checklist
                          .map((item) => item.text)
                          .join('\n')}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name="paused"
                        defaultChecked={editing?.paused ?? false}
                      />
                      <Trans>Keep this template paused</Trans>
                    </label>
                    <StyledDeliveryRow>
                      <StyledDeliveryButton
                        type="submit"
                        disabled={
                          mutation.loading || !workspace.projects.length
                        }
                      >
                        <Trans>Save recurring template</Trans>
                      </StyledDeliveryButton>
                      {editing && (
                        <StyledDeliveryButton
                          type="button"
                          onClick={() => setEditing(null)}
                        >
                          <Trans>Cancel edit</Trans>
                        </StyledDeliveryButton>
                      )}
                    </StyledDeliveryRow>
                  </StyledDeliveryStack>
                </form>
              </StyledDeliveryCard>
            </>
          )}
          {actor.isAdmin && (
            <>
              <h3>
                <Trans>Founder attention</Trans>
              </h3>
              {data.alerts.map((alert) => (
                <StyledDeliveryCard key={alert.id}>
                  <StyledDeliveryStack>
                    <strong>
                      {title(alert.taskId)} · {label(alert.severity)}
                    </strong>
                    <p>{alert.reason}</p>
                    <small>
                      {name(alert.ownerId)} · {date(alert.createdAt)} ·{' '}
                      {alert.resolvedAt
                        ? t`Resolved`
                        : alert.acknowledgedAt
                          ? t`Acknowledged`
                          : t`Needs attention`}
                    </small>
                    <StyledDeliveryRow>
                      <StyledDeliveryButton
                        onClick={() => onOpenTask?.(alert.taskId)}
                      >
                        <Trans>Open task</Trans>
                      </StyledDeliveryButton>
                      {!alert.resolvedAt && (
                        <>
                          <StyledDeliveryButton
                            disabled={mutation.loading}
                            onClick={() =>
                              void run({
                                action: 'resolveAlert',
                                id: alert.id,
                                resolve: false,
                              })
                            }
                          >
                            <Trans>Acknowledge alert</Trans>
                          </StyledDeliveryButton>
                          <StyledDeliveryButton
                            disabled={mutation.loading}
                            onClick={() =>
                              void run({
                                action: 'resolveAlert',
                                id: alert.id,
                                resolve: true,
                              })
                            }
                          >
                            <Trans>Resolve alert</Trans>
                          </StyledDeliveryButton>
                        </>
                      )}
                    </StyledDeliveryRow>
                  </StyledDeliveryStack>
                </StyledDeliveryCard>
              ))}
            </>
          )}
          <StyledDeliveryCard>
            <StyledDeliveryStack>
              <h3>
                <Trans>Telegram connection</Trans>
              </h3>
              <p>
                {data.connections.some(
                  (connection) => connection.memberId === actor.memberId,
                )
                  ? t`Your Telegram is linked.`
                  : t`Your Telegram is not linked.`}
              </p>
              <p>
                {data.botAvailable
                  ? t`Workspace bot is available.`
                  : t`An administrator must configure and test the workspace bot in Telegram settings.`}
              </p>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  disabled={!data.botAvailable || mutation.loading}
                  onClick={() => void run({ action: 'linkTelegram' })}
                >
                  <Trans>Create private link</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  disabled={mutation.loading}
                  onClick={async () => {
                    if (await run({ action: 'unlinkTelegram' })) setLink(null);
                  }}
                >
                  <Trans>Unlink my Telegram</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
              {link && (
                <p>
                  <a href={link} target="_blank" rel="noreferrer">
                    <Trans>Open Telegram to connect your own account</Trans>
                  </a>{' '}
                  ·{' '}
                  <Trans>
                    This private link expires in 10 minutes and works once. Do
                    not share it.
                  </Trans>
                </p>
              )}
              {actor.isAdmin && (
                <details>
                  <summary>{t`Team connection status`}</summary>
                  {workspace.members.map((member) => (
                    <p key={member.id}>
                      {member.name}:{' '}
                      {data.connections.some(
                        (connection) => connection.memberId === member.id,
                      )
                        ? t`Linked`
                        : t`Not linked`}
                    </p>
                  ))}
                </details>
              )}
            </StyledDeliveryStack>
          </StyledDeliveryCard>
          {actor.isAdmin && (
            <StyledDeliveryCard>
              <h3>
                <Trans>Follow-through settings</Trans>
              </h3>
              <form
                key={`${data.timezone}-${data.enabled}-${data.telegramEnabled}-${data.founderId}`}
                onSubmit={async (event) => {
                  const form = submit(event);
                  await run({
                    action: 'settings',
                    timezone: field(form, 'timezone'),
                    enabled: form.has('enabled'),
                    telegramEnabled: form.has('telegramEnabled'),
                    founderId: field(form, 'founderId') || null,
                  });
                }}
              >
                <StyledDeliveryStack>
                  <label>
                    <Trans>Workspace timezone (IANA)</Trans>
                    <input
                      name="timezone"
                      required
                      defaultValue={data.timezone}
                      placeholder="Asia/Dubai"
                    />
                  </label>
                  <label>
                    <Trans>Founder alert recipient</Trans>
                    <select
                      name="founderId"
                      defaultValue={data.founderId ?? ''}
                    >
                      <option value="">{t`Not selected`}</option>
                      {workspace.members
                        .filter((member) => member.access === 'ADMIN')
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={data.enabled}
                    />
                    <Trans>
                      Enable recurring tasks and follow-through scheduling
                    </Trans>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="telegramEnabled"
                      defaultChecked={data.telegramEnabled}
                    />
                    <Trans>
                      Enable Telegram delivery to linked employees, 24/7
                    </Trans>
                  </label>
                  <small>
                    <Trans>
                      Existing assignments enter the reminder workflow when
                      scheduling is enabled. Previously missed or uncertain
                      Telegram messages are not automatically resent.
                    </Trans>
                  </small>
                  <StyledDeliveryButton
                    type="submit"
                    disabled={mutation.loading}
                  >
                    <Trans>Save follow-through settings</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryStack>
              </form>
            </StyledDeliveryCard>
          )}
        </>
      )}
    </StyledDeliveryStack>
  );
};
