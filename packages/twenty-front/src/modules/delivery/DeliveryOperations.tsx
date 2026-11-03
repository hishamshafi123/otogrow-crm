import { DeliveryGuardedForm } from '@/delivery/drafts/DeliveryGuardedForm';
import { ReviewAssignmentLink } from '@/delivery/reviews/ReviewAssignmentLink';
import { isValidUuid, getValidTimeZoneOrUndefined } from 'twenty-shared/utils';
import { Link } from 'react-router-dom';
import { advertisingReportDestination } from '@/delivery/advertising/advertising-report-destination';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useState, useRef } from 'react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { RecurringTemplateForm } from '@/delivery/operations/forms/RecurringTemplateForm';
import { type OperationSaveResult } from '@/delivery/operations/forms/recurring-template-values';
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
  const [changing, setChanging] = useState(false);
  const busy = changing || mutation.loading;
  const { requestAction } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({ dirty: false, saving: busy });
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecurringTemplate | null>(null);
  const data = query.data?.deliveryOperations;
  const actor = workspace.actor;
  const manager = actor.isManager;
  // oxlint-disable-next-line twenty/no-state-useref -- Same-turn clicks must share one in-flight operation.
  const pending = useRef(false);
  const beginOperation = useFinanceExportRequestGuard(
    `${actor.memberId}:${actor.isAdmin}:${actor.isManager}`,
    true,
  );
  const runDetailed = async (
    input: Record<string, unknown>,
  ): Promise<OperationSaveResult> => {
    if (pending.current) return { kind: 'UNKNOWN' };
    pending.current = true;
    const current = beginOperation();
    setError('');
    setChanging(true);
    try {
      const result = (await mutate({ variables: { input } })).data
        ?.changeDeliveryOperations;
      if (!current() || !result) return { kind: 'UNKNOWN' };
      query.client.writeQuery({
        query: GET_OPERATIONS,
        data: { deliveryOperations: result },
      });
      if (result.link) setLink(result.link);
      try {
        await onChanged();
      } catch {
        if (current())
          setError(
            t`The operation was saved, but this page could not refresh. Refresh before making another change.`,
          );
      }
      return { kind: 'SAVED' };
    } catch (failure) {
      if (!current()) return { kind: 'UNKNOWN' };
      const message =
        failure instanceof Error
          ? failure.message
          : t`Could not save this operation.`;
      setError(message);
      if (
        CombinedGraphQLErrors.is(failure) &&
        failure.errors.some((entry) =>
          ['BAD_USER_INPUT', 'CONFLICT'].includes(
            String(entry.extensions?.code),
          ),
        )
      )
        return { kind: 'REJECTED', message };
      return { kind: 'UNKNOWN' };
    } finally {
      pending.current = false;
      setChanging(false);
    }
  };
  const run = async (input: Record<string, unknown>) =>
    (await runDetailed(input)).kind === 'SAVED';
  const taskId = task?.id;
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
    QUEUED: t`Queued for Telegram`,
    SENDING: t`Sending`,
    SENT: t`Telegram sent`,
    UNCONFIGURED: t`Telegram unavailable`,
    FAILED: t`Send failed`,
    UNCERTAIN: t`Delivery uncertain — check Telegram before following up. No automatic resend.`,
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
  const field = (form: FormData, key: string) =>
    String(form.get(key) ?? '').trim();
  if (query.error && !data) return <p role="alert">{query.error.message}</p>;
  if (!data)
    return (
      <p>
        <Trans>Loading delivery and reminders…</Trans>
      </p>
    );
  const formTemplate =
    data.templates.find((template) => template.id === editing?.id) ?? editing;
  const fulfilment = data.fulfilments.find((item) => item.taskId === taskId);
  const currentDelivery =
    task?.details.state === 'APPROVED' &&
    task.details.submissions.at(-1)?.decision === 'APPROVED' &&
    task.details.submissions.at(-1)?.version ===
      fulfilment?.deliveredSubmissionVersion;
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
      {(error || query.error) && (
        <p role="alert">{error || query.error?.message}</p>
      )}
      <StyledDeliveryRow>
        <StyledDeliveryBadge>{data.timezone}</StyledDeliveryBadge>
        <StyledDeliveryBadge>
          {data.enabled ? t`Schedules enabled` : t`Schedules paused`}
        </StyledDeliveryBadge>
        <StyledDeliveryButton onClick={() => void query.refetch()}>
          <Trans>Refresh delivery and reminders</Trans>
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
              {fulfilment &&
                !currentDelivery &&
                fulfilment.status !== 'REDOING' && (
                  <p role="status">
                    <Trans>
                      This delivery belongs to an earlier or unverified version.
                      Approve and record delivery of the current version before
                      confirming fulfilment.
                    </Trans>
                  </p>
                )}
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
              <DeliveryGuardedForm
                revision={task.revision}
                busy={busy}
                visible={
                  manager &&
                  task.assigneeId !== actor.memberId &&
                  task.details.state === 'APPROVED' &&
                  (fulfilment?.status !== 'WAITING' || !currentDelivery)
                }
                onSave={(form, revision) =>
                  run({
                    action: 'delivered',
                    taskId,
                    revision,
                    note: field(form, 'note'),
                  })
                }
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
                  <StyledDeliveryButton type="submit" disabled={busy}>
                    <Trans>Record delivery now</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryStack>
              </DeliveryGuardedForm>
              <DeliveryGuardedForm
                revision={task.revision}
                snapshot={JSON.stringify(fulfilment)}
                busy={busy}
                visible={
                  manager &&
                  task.assigneeId !== actor.memberId &&
                  fulfilment?.status === 'WAITING' &&
                  currentDelivery
                }
                onSave={(form) =>
                  run({
                    action: 'fulfilment',
                    taskId,
                    cycle: fulfilment?.cycle,
                    historyLength: fulfilment?.history.length,
                    decision: field(form, 'decision'),
                    note: field(form, 'note'),
                  })
                }
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
                  <StyledDeliveryButton type="submit" disabled={busy}>
                    <Trans>Save fulfilment decision</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryStack>
              </DeliveryGuardedForm>
            </StyledDeliveryStack>
          </StyledDeliveryCard>
          <StyledDeliveryCard>
            <h3>
              <Trans>Address an internal message</Trans>
            </h3>
            <DeliveryGuardedForm
              key={task.id}
              revision={0}
              busy={busy}
              onSave={(form) =>
                run({
                  action: 'message',
                  taskId,
                  recipientId: field(form, 'recipientId'),
                  text: field(form, 'text'),
                })
              }
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
                    unacknowledged, at any time of day. The recipient can mark
                    this message as read or acknowledge it to stop the ping.
                  </Trans>
                </small>
                <StyledDeliveryButton type="submit" disabled={busy}>
                  <Trans>Send internal message</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryStack>
            </DeliveryGuardedForm>
          </StyledDeliveryCard>
          {manager && (
            <StyledDeliveryCard>
              <h3>
                <Trans>Flag for founder</Trans>
              </h3>
              <DeliveryGuardedForm
                key={task.id}
                revision={0}
                busy={busy}
                onSave={(form) =>
                  run({
                    action: 'alert',
                    taskId,
                    category: field(form, 'category'),
                    severity: field(form, 'severity'),
                    ownerId: field(form, 'ownerId'),
                    reason: field(form, 'reason'),
                  })
                }
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
                  <StyledDeliveryButton type="submit" disabled={busy}>
                    <Trans>Flag issue</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryStack>
              </DeliveryGuardedForm>
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
                {notice.kind === 'REVIEW_ASSIGNMENT' &&
                  isValidUuid(notice.taskId) &&
                  notice.reviewAssignment &&
                  Number.isSafeInteger(
                    notice.reviewAssignment.submissionVersion,
                  ) &&
                  notice.reviewAssignment.submissionVersion > 0 && (
                    <ReviewAssignmentLink
                      taskId={notice.taskId}
                      submissionVersion={
                        notice.reviewAssignment.submissionVersion
                      }
                    />
                  )}
                {notice.taskId.startsWith('meta-report:') && (
                  <Link
                    to={
                      advertisingReportDestination(
                        'META',
                        notice.taskId.slice('meta-report:'.length),
                      ) ?? '/delivery?view=ads'
                    }
                  >
                    <Trans>Open advertising report</Trans>
                  </Link>
                )}
                {onOpenTask &&
                  notice.kind !== 'REVIEW_ASSIGNMENT' &&
                  !notice.taskId.startsWith('meta-report:') && (
                    <StyledDeliveryButton
                      onClick={() =>
                        requestAction(() => onOpenTask(notice.taskId))
                      }
                    >
                      <Trans>Open task</Trans>
                    </StyledDeliveryButton>
                  )}
                {notice.recipientId === actor.memberId &&
                  notice.kind !== 'REVIEW_ASSIGNMENT' &&
                  !notice.seenAt &&
                  !notice.acknowledgedAt && (
                    <StyledDeliveryButton
                      disabled={busy}
                      onClick={() =>
                        void run({ action: 'noticeSeen', id: notice.id })
                      }
                    >
                      <Trans>Mark as read</Trans>
                    </StyledDeliveryButton>
                  )}
                {notice.recipientId === actor.memberId &&
                  !notice.acknowledgedAt && (
                    <StyledDeliveryButton
                      disabled={busy}
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
                      onClick={() =>
                        requestAction(() => onOpenTask?.(item.taskId))
                      }
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
                          onClick={() =>
                            requestAction(() => setEditing(template))
                          }
                        >
                          <Trans>Edit template</Trans>
                        </StyledDeliveryButton>
                        <StyledDeliveryButton
                          disabled={busy}
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
                            onClick={() =>
                              requestAction(() =>
                                onOpenTask?.(template.lastTaskId!),
                              )
                            }
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
                <RecurringTemplateForm
                  key={editing?.id ?? 'new'}
                  workspace={workspace}
                  template={formTemplate ?? null}
                  timezone={data.timezone}
                  busy={busy}
                  onSave={(template) =>
                    runDetailed({ action: 'template', template })
                  }
                  onCancel={() => setEditing(null)}
                  onInspect={async () => {
                    try {
                      return Boolean(
                        (await query.refetch()).data?.deliveryOperations,
                      );
                    } catch {
                      return false;
                    }
                  }}
                />
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
                        onClick={() =>
                          requestAction(() => onOpenTask?.(alert.taskId))
                        }
                      >
                        <Trans>Open task</Trans>
                      </StyledDeliveryButton>
                      {!alert.resolvedAt && (
                        <>
                          <StyledDeliveryButton
                            disabled={busy}
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
                            disabled={busy}
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
                  disabled={!data.botAvailable || busy}
                  onClick={() => void run({ action: 'linkTelegram' })}
                >
                  <Trans>Create private link</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  disabled={busy}
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
                <Trans>Delivery and reminder settings</Trans>
              </h3>
              <DeliveryGuardedForm
                revision={0}
                busy={busy}
                snapshot={JSON.stringify({
                  timezone: data.timezone,
                  enabled: data.enabled,
                  telegramEnabled: data.telegramEnabled,
                  founderId: data.founderId,
                })}
                onSave={(form) => {
                  if (!getValidTimeZoneOrUndefined(field(form, 'timezone'))) {
                    setError(
                      t`Choose a valid reporting time zone, for example Asia/Qatar.`,
                    );
                    return Promise.resolve(false);
                  }
                  return run({
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
                      maxLength={100}
                      placeholder="Asia/Dubai"
                      onChange={(event) =>
                        event.currentTarget.setCustomValidity(
                          getValidTimeZoneOrUndefined(event.currentTarget.value)
                            ? ''
                            : t`Choose a valid reporting time zone, for example Asia/Qatar.`,
                        )
                      }
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
                  <StyledDeliveryButton type="submit" disabled={busy}>
                    <Trans>Save follow-through settings</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryStack>
              </DeliveryGuardedForm>
            </StyledDeliveryCard>
          )}
        </>
      )}
    </StyledDeliveryStack>
  );
};
