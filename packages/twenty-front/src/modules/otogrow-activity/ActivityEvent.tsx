import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
} from '@/delivery/deliveryStyles';
import {
  StyledActivityActions,
  StyledActivityChanges,
  StyledActivityEntry,
} from '@/otogrow-activity/activityStyles';
import { type OtogrowActivityEvent } from '@/otogrow-activity/otogrow-activity.types';
import { useActivityLabels } from '@/otogrow-activity/useActivityLabels';
import { advertisingReportDestination } from '@/delivery/advertising/advertising-report-destination';
import {
  activityAnalysisClose,
  activityAnalysisDestination,
  activityCurrentTaskClose,
} from '@/otogrow-activity/analysis/activity-analysis-navigation';

type ActivityEventProps = {
  event: OtogrowActivityEvent;
  workspace?: DeliveryWorkspace;
  params: URLSearchParams;
  onOpenExact?: (id: string) => void;
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
  onOpenExact,
}: ActivityEventProps) => {
  const { t } = useLingui();
  const { label, valueLabel } = useActivityLabels();
  const financeMonth = event.changes.find(
    (change) => change.field === 'financeMonth',
  )?.after;
  const availableTask =
    event.taskId != null &&
    (isValidUuid(event.taskId) ||
      workspace?.tasks.some((task) => task.id === event.taskId));
  const taskParams = workspace
    ? new URLSearchParams(params)
    : new URLSearchParams({ view: 'planner' });
  for (const parameter of [
    'creativeSubmission',
    'creativeAsset',
    'creativeCompare',
    'creativeFeedback',
    'creativeFeedbackAfter',
    'creativeFeedbackBefore',
    'creativeSubmissionsBefore',
  ])
    taskParams.delete(parameter);
  if (event.taskId) taskParams.set('task', event.taskId);
  if (event.sourceType === 'creative') taskParams.set('panel', 'creative');
  else if (event.sourceType === 'creative-review') {
    taskParams.set('panel', 'task');
    taskParams.set('creativeFeedback', event.sourceId);
    const submissionVersion = event.changes.find(
      (change) => change.field === 'submissionVersion',
    )?.after;
    const assetId = event.changes.find(
      (change) => change.field === 'assetId',
    )?.after;
    if (submissionVersion && /^[1-9]\d*$/.test(submissionVersion)) {
      taskParams.set('creativeSubmission', submissionVersion);
      taskParams.delete('creativeAsset');
    } else if (assetId && isValidUuid(assetId)) {
      taskParams.set('panel', 'creative');
      taskParams.set('creativeAsset', assetId);
      taskParams.delete('creativeSubmission');
    }
    taskParams.delete('creativeCompare');
    taskParams.delete('creativeCompareAsset');
  } else if (event.sourceType === 'agent-run')
    taskParams.set('panel', 'agents');
  else if (event.sourceType === 'delivery')
    taskParams.set('panel', 'operations');
  else taskParams.delete('panel');
  const businessSources: Record<string, { to: string; name: string }> = {
    'content-account': {
      to: `/delivery?view=content&contentProject=${encodeURIComponent(event.projectId ?? '')}&contentAccountId=${encodeURIComponent(event.sourceId)}`,
      name: t`Open content account`,
    },
    'content-plan': {
      to: `/delivery?view=content&contentProject=${encodeURIComponent(event.projectId ?? '')}&contentPlanId=${encodeURIComponent(event.sourceId)}`,
      name: t`Open content plan`,
    },
    'content-post': {
      to: `/delivery?view=content&contentProject=${encodeURIComponent(event.projectId ?? '')}&contentPostId=${encodeURIComponent(event.sourceId)}`,
      name: t`Open content post`,
    },
    'competitor-source': {
      to: `/delivery?view=competitors&competitorProject=${encodeURIComponent(event.projectId ?? '')}&competitorSource=${encodeURIComponent(event.sourceId)}`,
      name: t`Open competitor source`,
    },
    'development-release': {
      to: `/delivery?view=development&releaseProject=${event.projectId ?? ''}&releaseId=${event.sourceId}`,
      name: t`Open release`,
    },
    'creative-learning': {
      to: `/delivery?view=creative&creativeView=learning&learningProject=${event.projectId ?? ''}&learningLink=${event.sourceId}`,
      name: t`Open creative performance evidence`,
    },
    'seo-report': {
      to: `/delivery?view=seo&seoProject=${event.projectId ?? ''}&seoReport=${event.sourceId}`,
      name: t`Open SEO report`,
    },
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
    'meta-connection': {
      to: '/delivery?view=ads&adView=legacy',
      name: t`Open advertising connections`,
    },
    'meta-report': {
      to:
        advertisingReportDestination('META', event.sourceId) ??
        '/delivery?view=ads',
      name: t`Open advertising report`,
    },
    conversation: { to: '/delivery?view=inbox', name: t`Open inbox` },
    'ad-report': {
      to:
        advertisingReportDestination('MANUAL', event.sourceId) ??
        '/delivery?view=ads',
      name: t`Open advertising report`,
    },
    budget: {
      to: '/delivery?view=ads&adView=legacy',
      name: t`Open advertising budgets`,
    },
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
    'finance-export': {
      to: '/delivery?view=finance&financeView=exports',
      name: t`Open accounting exports`,
    },
    'founder-alert': {
      to: `/delivery?view=health&founderPanel=alerts&founderRule=${encodeURIComponent(event.sourceId)}`,
      name: t`Open founder alert rules`,
    },
    content: {
      to: `/delivery?view=content&contentView=legacy&businessRecord=${encodeURIComponent(event.sourceId)}`,
      name: t`Open earlier content record`,
    },
    competitor: {
      to: `/delivery?view=competitors&competitorView=legacy&businessRecord=${encodeURIComponent(event.sourceId)}`,
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
  const advertisingKind = event.changes.find(
    (change) => change.field === 'advertisingSourceKind',
  )?.after;
  const advertisingId = event.changes.find(
    (change) => change.field === 'advertisingSourceId',
  )?.after;
  const advertisingDraftDestination =
    event.sourceType === 'advertising-draft' &&
    isValidUuid(event.sourceId) &&
    (advertisingKind === 'META' || advertisingKind === 'MANUAL')
      ? advertisingReportDestination(advertisingKind, advertisingId)
      : null;
  const analysisDestination =
    event.sourceType === 'activity-analysis' && isValidUuid(event.sourceId)
      ? activityAnalysisDestination(params, {
          ...activityAnalysisClose,
          ...activityCurrentTaskClose,
          view: 'activity',
          activityAnalysis: 'history',
          activityAnalysisRun: event.sourceId,
          activityEvent: null,
          task: null,
          panel: null,
        })
      : null;
  const sourceLink = analysisDestination
    ? {
        to: `${analysisDestination.pathname}${analysisDestination.search}`,
        name: t`Open saved work analysis`,
      }
    : [
          'AI_BUDGET_CONFIGURED',
          'AI_PRICE_CONFIGURED',
          'AI_SPEND_RECONCILED',
        ].includes(event.action)
      ? {
          to: '/delivery?view=agents&agentView=spending',
          name: t`Open AI spending`,
        }
      : [
            'task',
            'agent-run',
            'delivery',
            'creative',
            'creative-review',
          ].includes(event.sourceType) && availableTask
        ? {
            to: `/delivery?${taskParams}`,
            name:
              event.sourceType === 'creative-review'
                ? t`Open creative feedback`
                : event.sourceType === 'agent-run'
                  ? t`Open task's assistant runs`
                  : t`Open task`,
          }
        : advertisingDraftDestination
          ? {
              to: `${advertisingDraftDestination}&adDraftRun=${event.sourceId}`,
              name: t`Open advertising suggestions`,
            }
          : event.sourceType === 'roles'
            ? { to: '/delivery?view=team', name: t`Open people and roles` }
            : event.sourceType === 'project' &&
                (isValidUuid(event.sourceId) ||
                  workspace?.projects.some(
                    (project) => project.id === event.sourceId,
                  ))
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
        {event.detailsTruncated === true && (
          <p>
            <Trans>
              Preview shortened. Open the exact event to read the complete
              recorded details.
            </Trans>{' '}
            {onOpenExact && isValidUuid(event.id) && (
              <StyledDeliveryButton
                type="button"
                onClick={() => onOpenExact(event.id)}
              >
                <Trans>Open exact event</Trans>
              </StyledDeliveryButton>
            )}
          </p>
        )}
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
