import { Trans, useLingui } from '@lingui/react/macro';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { useActivityLabels } from '@/otogrow-activity/useActivityLabels';
import {
  type ActivityAnalysisContext,
  type ActivityAnalysisCitationTarget,
} from '@/otogrow-activity/analysis/activity-analysis.types';
import { ActivityCurrentWorkView } from '@/otogrow-activity/analysis/ActivityCurrentWorkView';
import { ActivityAnalysisCitation } from '@/otogrow-activity/analysis/ActivityAnalysisCitation';

export const ActivityAnalysisContextView = ({
  context,
  onCitation,
}: {
  context: ActivityAnalysisContext;
  onCitation: (target: ActivityAnalysisCitationTarget) => void;
}) => {
  const { t } = useLingui();
  const { label } = useActivityLabels();
  const selectedPerson = context.events.find(
    (event) =>
      event.actorId === context.filters.personId ||
      event.subjectMemberId === context.filters.personId,
  );
  const taskForPerson = context.currentWork?.items.find(
    (task) =>
      task.ownerId === context.filters.personId ||
      task.effectiveReviewerId === context.filters.personId,
  );
  const recordedPersonName =
    selectedPerson !== undefined &&
    selectedPerson.actorId === context.filters.personId
      ? selectedPerson.actorName
      : selectedPerson?.subjectName;
  const personName =
    recordedPersonName ??
    (taskForPerson?.ownerId === context.filters.personId
      ? taskForPerson?.ownerName
      : taskForPerson?.effectiveReviewerName);
  return (
    <StyledDeliveryStack>
      <p>
        <strong>
          <Trans>Question</Trans>
        </strong>
        : {context.question}
      </p>
      <h4>
        <Trans>Dated audit history</Trans>
      </h4>
      <dl>
        <dt>
          <Trans>UTC evidence window</Trans>
        </dt>
        <dd>
          {formatActivityTime(context.from)} →{' '}
          {formatActivityTime(context.through)} <Trans>(end excluded)</Trans>
        </dd>
        <dt>
          <Trans>Evidence captured</Trans>
        </dt>
        <dd>{formatActivityTime(context.capturedAt)}</dd>
        <dt>
          <Trans>Recorded evidence</Trans>
        </dt>
        <dd>{t`${context.includedCount} included · ${context.totalCount} matching · ${context.omittedCount} omitted`}</dd>
        <dt>
          <Trans>Shortened evidence</Trans>
        </dt>
        <dd>{t`${context.truncatedFieldCount} fields shortened · ${context.omittedBytes} bytes omitted`}</dd>
        <dt>
          <Trans>Earliest retained record</Trans>
        </dt>
        <dd>
          {context.coverageStartedAt
            ? formatActivityTime(context.coverageStartedAt)
            : t`Unknown`}
        </dd>
      </dl>
      <p>
        {context.filters.personId
          ? t`Person: ${personName ?? t`Selected person`}. This includes actions they took and changes affecting them.`
          : t`All people; human actions, affected people and automated events remain distinct.`}
      </p>
      {context.filters.projectId && (
        <p>{t`Project: ${context.events.find((event) => event.projectId === context.filters.projectId)?.projectName ?? context.currentWork?.items.find((task) => task.projectId === context.filters.projectId)?.projectName ?? t`Selected project`}`}</p>
      )}
      {context.filters.clientId && (
        <p>{t`Client: ${context.events.find((event) => event.clientId === context.filters.clientId)?.clientName ?? context.currentWork?.items.find((task) => task.clientId === context.filters.clientId)?.clientName ?? t`Selected client`}`}</p>
      )}
      <p>
        {[
          context.filters.category,
          context.filters.action,
          context.filters.outcome,
        ]
          .filter((value): value is string => value != null)
          .map(label)
          .join(' · ')}
      </p>
      <p>
        <Trans>
          Audit records do not establish current task status, working hours or
          productivity. A possible handoff issue needs a current source check.
        </Trans>
      </p>
      {context.containsFinance && (
        <p>
          <Trans>
            This snapshot includes permitted finance-related structural events.
          </Trans>
        </p>
      )}
      {context.limitations.length > 0 && (
        <ul>
          {context.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      )}
      <details>
        <summary>
          <Trans>Inspect the recorded evidence</Trans>
        </summary>
        <StyledDeliveryStack>
          {context.events.map((event) => (
            <article key={event.id}>
              <strong>{label(event.action)}</strong>
              <p>
                {event.actorType === 'AGENT'
                  ? t`Assistant ${event.agentName ?? t`Unknown`} · initiated by ${event.actorName}`
                  : event.actorType === 'SYSTEM'
                    ? t`Automation`
                    : event.actorType === 'CLIENT'
                      ? t`Client portal`
                      : event.actorName}
                {event.subjectName && event.subjectMemberId !== event.actorId
                  ? ` · ${t`Affects ${event.subjectName}`}`
                  : ''}
              </p>
              <p>{event.summary}</p>
              <ActivityAnalysisCitation
                context={context}
                eventId={event.id}
                onCitation={onCitation}
              />
            </article>
          ))}
        </StyledDeliveryStack>
      </details>
      <ActivityCurrentWorkView context={context} onCitation={onCitation} />
      <details>
        <summary>
          <Trans>Assistant settings used</Trans>
        </summary>
        {context.assistantInstructions === null ? (
          <p>
            <Trans>
              Private assistant settings are withheld; the saved configuration
              version is recorded.
            </Trans>
          </p>
        ) : (
          <p>{context.assistantInstructions}</p>
        )}
      </details>
    </StyledDeliveryStack>
  );
};
