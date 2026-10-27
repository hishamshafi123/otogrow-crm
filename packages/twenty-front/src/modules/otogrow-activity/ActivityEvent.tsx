import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { StyledDeliveryBadge } from '@/delivery/deliveryStyles';
import {
  StyledActivityActions,
  StyledActivityChanges,
  StyledActivityEntry,
} from '@/otogrow-activity/activityStyles';
import { type OtogrowActivityEvent } from '@/otogrow-activity/otogrow-activity.types';
import { useActivityLabels } from '@/otogrow-activity/useActivityLabels';

type ActivityEventProps = {
  event: OtogrowActivityEvent;
  workspace: DeliveryWorkspace;
  params: URLSearchParams;
};

export const formatActivityTime = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`
    : value;
};

export const ActivityEvent = ({
  event,
  workspace,
  params,
}: ActivityEventProps) => {
  const { t } = useLingui();
  const { label, valueLabel } = useActivityLabels();
  const financeMonth = event.changes.find(
    (change) => change.field === 'financeMonth',
  )?.after;
  const availableTask = workspace.tasks.some(
    (task) => task.id === event.taskId,
  );
  const taskParams = new URLSearchParams(params);
  if (event.taskId) taskParams.set('task', event.taskId);
  if (event.sourceType === 'creative') taskParams.set('panel', 'creative');
  else if (event.sourceType === 'agent-run') taskParams.set('panel', 'agents');
  else if (event.sourceType === 'delivery')
    taskParams.set('panel', 'operations');
  else taskParams.delete('panel');
  const businessSources: Record<string, { to: string; name: string }> = {
    capacity: { to: '/delivery?view=planner', name: t`Open team capacity` },
    'brand-knowledge': {
      to: `/delivery?view=knowledge&project=${event.projectId}&source=${event.sourceId}`,
      name: t`Open brand knowledge`,
    },
    'delivery-batch': {
      to: `/delivery?view=batches&batchProject=${event.projectId}&batch=${event.sourceId}`,
      name: t`Open production batch`,
    },
    'workflow-template': {
      to: '/delivery?view=workflows',
      name: t`Open service workflows`,
    },
    'meta-connection': { to: '/delivery?view=ads', name: t`Open advertising` },
    'meta-report': {
      to: isValidUuid(event.sourceId)
        ? `/delivery?view=ads&metaArchive=ALL&metaReport=${event.sourceId}`
        : '/delivery?view=ads',
      name: t`Open advertising report`,
    },
    conversation: { to: '/delivery?view=inbox', name: t`Open inbox` },
    'ad-report': { to: '/delivery?view=ads', name: t`Open advertising` },
    budget: { to: '/delivery?view=ads', name: t`Open advertising` },
    finance: { to: '/delivery?view=finance', name: t`Open finance` },
    'finance-payment': {
      to: `/delivery?view=finance&financeView=payments&financeCash=${encodeURIComponent(event.sourceId)}`,
      name: t`Open payment and matching`,
    },
    'finance-plan': {
      to: `/delivery?view=finance&financeView=plans&financePlan=${encodeURIComponent(event.sourceId)}`,
      name: t`Open monthly cost plan`,
    },
    'finance-entry': {
      to: `/delivery?view=finance&financeView=monthly&financeEntry=${encodeURIComponent(event.sourceId)}`,
      name: t`Open monthly entry`,
    },
    'finance-period': {
      to: `/delivery?view=finance&financeView=monthly${financeMonth ? `&financeMonth=${encodeURIComponent(financeMonth)}` : ''}`,
      name: t`Open monthly review`,
    },
    'finance-forecast': {
      to: '/delivery?view=finance&financeView=forecast',
      name: t`Open cash forecast`,
    },
    content: { to: '/delivery?view=content', name: t`Open content` },
    competitor: {
      to: '/delivery?view=competitors',
      name: t`Open competitor research`,
    },
    release: { to: '/delivery?view=development', name: t`Open development` },
    'client-engagement': {
      to: '/delivery?view=clients',
      name: t`Open clients`,
    },
    'client-share': { to: '/delivery?view=clients', name: t`Open clients` },
    notice: {
      to: '/delivery?view=operations',
      name: t`Open delivery messages`,
    },
    alert: { to: '/delivery?view=operations', name: t`Open delivery alerts` },
    connection: {
      to: '/delivery?view=operations',
      name: t`Open delivery settings`,
    },
  };
  const sourceLink = [
    'AI_BUDGET_CONFIGURED',
    'AI_PRICE_CONFIGURED',
    'AI_SPEND_RECONCILED',
  ].includes(event.action)
    ? {
        to: '/delivery?view=agents&agentView=spending',
        name: t`Open AI spending`,
      }
    : ['task', 'agent-run', 'delivery', 'creative'].includes(
          event.sourceType,
        ) && availableTask
      ? {
          to: `/delivery?${taskParams}`,
          name:
            event.sourceType === 'agent-run'
              ? t`Open task's assistant runs`
              : t`Open task`,
        }
      : event.sourceType === 'roles'
        ? { to: '/delivery?view=team', name: t`Open people and roles` }
        : event.sourceType === 'project' &&
            workspace.projects.some((project) => project.id === event.sourceId)
          ? { to: '/delivery?view=team', name: t`Open project setup` }
          : event.sourceType === 'agent' && isValidUuid(event.sourceId)
            ? { to: '/delivery?view=agents', name: t`Open assistants` }
            : ['recurrence', 'settings'].includes(event.sourceType) &&
                isValidUuid(event.sourceId)
              ? {
                  to: '/delivery?view=operations',
                  name:
                    event.sourceType === 'recurrence'
                      ? t`Open recurring work`
                      : t`Open delivery settings`,
                }
              : isValidUuid(event.sourceId)
                ? (businessSources[event.sourceType] ?? null)
                : null;
  const changeValue = (value: string | null | undefined) =>
    value === null || value === undefined || value === ''
      ? t`Not set`
      : valueLabel(value);
  return (
    <li>
      <StyledActivityEntry>
        {event.taskName && <h3>{event.taskName}</h3>}
        <StyledActivityActions>
          <strong>{label(event.action)}</strong>
          <StyledDeliveryBadge data-state={event.outcome}>
            {label(event.outcome)}
          </StyledDeliveryBadge>
          <time dateTime={event.occurredAt}>
            {formatActivityTime(event.occurredAt)}
          </time>
        </StyledActivityActions>
        <p>
          {event.actorType === 'AGENT'
            ? event.actorId
              ? event.agentName
                ? t`${event.agentName} · initiated by ${event.actorName}`
                : t`Agent run initiated by ${event.actorName}`
              : t`Automated assistant run`
            : event.actorType === 'SYSTEM'
              ? t`Automation`
              : event.actorType === 'CLIENT'
                ? t`Client portal`
                : event.actorName}
          {event.subjectName && event.subjectMemberId !== event.actorId
            ? ` · ${t`Affects ${event.subjectName}`}`
            : ''}
        </p>
        {event.summary && <p>{event.summary}</p>}
        <small>
          {[
            label(event.category),
            event.actorType !== 'AGENT' ? event.agentName : null,
            event.projectName,
            event.clientName,
          ]
            .filter(Boolean)
            .join(' · ')}
        </small>
        <details>
          <summary>{t`View event details`}</summary>
          <StyledActivityEntry>
            {event.changes.length ? (
              <StyledActivityChanges>
                {event.changes.map((change, index) => (
                  <div key={`${change.field}-${index}`}>
                    <dt>{label(change.field)}</dt>
                    <dd>
                      <div>
                        <small>
                          <Trans>Before</Trans>
                        </small>
                        {changeValue(change.before)}
                      </div>
                      <div>
                        <small>
                          <Trans>After</Trans>
                        </small>
                        {changeValue(change.after)}
                      </div>
                    </dd>
                  </div>
                ))}
              </StyledActivityChanges>
            ) : (
              <p>
                <Trans>No field changes were recorded for this event.</Trans>
              </p>
            )}
            {event.sourceType === 'agent-run' && (
              <small>{t`Run reference: ${event.sourceId}`}</small>
            )}
            {sourceLink ? (
              <Link to={sourceLink.to}>{sourceLink.name}</Link>
            ) : (
              <small>
                <Trans>
                  The source is not available in the current workspace.
                </Trans>
              </small>
            )}
          </StyledActivityEntry>
        </details>
      </StyledActivityEntry>
    </li>
  );
};
