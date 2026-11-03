import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { isValidUuid } from 'twenty-shared/utils';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
import { useTaskLabels } from '@/delivery/tasks/useTaskLabels';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { useActivityLabels } from '@/otogrow-activity/useActivityLabels';
import {
  type ActivityAnalysisContext,
  type ActivityAnalysisCitationTarget,
} from '@/otogrow-activity/analysis/activity-analysis.types';

const StyledCitationButton = styled(StyledDeliveryButton)`
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: left;
`;

type ActivityAnalysisCitationProps = {
  context: ActivityAnalysisContext;
  onCitation: (target: ActivityAnalysisCitationTarget) => void;
} & (
  | { referenceId: string; eventId?: never; taskId?: never }
  | { eventId: string; referenceId?: never; taskId?: never }
  | { taskId: string; referenceId?: never; eventId?: never }
);

export const ActivityAnalysisCitation = ({
  context,
  referenceId,
  eventId,
  taskId,
  onCitation,
}: ActivityAnalysisCitationProps) => {
  const { t } = useLingui();
  const { label } = useActivityLabels();
  const taskLabels = useTaskLabels();
  const reference = context.citations.find((candidate) =>
    referenceId !== undefined
      ? candidate.id === referenceId
      : taskId !== undefined
        ? candidate.kind === 'CURRENT_TASK' && candidate.taskId === taskId
        : candidate.kind === 'EVENT' && candidate.eventId === eventId,
  );
  if (taskId !== undefined || reference?.kind === 'CURRENT_TASK') {
    const resolvedTaskId = reference?.taskId ?? taskId;
    const snapshot = context.currentWork;
    const task = snapshot?.items.find(
      (candidate) => candidate.taskId === resolvedTaskId,
    );
    if (
      !resolvedTaskId ||
      !isValidUuid(resolvedTaskId) ||
      !snapshot ||
      (!reference && !task)
    )
      return (
        <span>
          <Trans>Evidence reference unavailable</Trans>
        </span>
      );
    const capturedAt = reference?.capturedAt ?? snapshot.capturedAt;
    return (
      <StyledCitationButton
        type="button"
        onClick={() =>
          onCitation({
            kind: 'CURRENT_TASK',
            taskId: resolvedTaskId,
            scope: snapshot.scope,
          })
        }
      >
        <Trans>Task snapshot</Trans>
        {' · '}
        {task?.title ?? t`Current task evidence`}
        {task ? ` · ${taskLabels.state(task.state)}` : ''}
        {' · '}
        <time dateTime={capturedAt}>{formatActivityTime(capturedAt)}</time>
      </StyledCitationButton>
    );
  }
  const resolvedEventId =
    reference?.kind === 'EVENT' ? reference.eventId : eventId;
  const event = context.events.find(
    (candidate) => candidate.id === resolvedEventId,
  );
  if (
    !resolvedEventId ||
    !isValidUuid(resolvedEventId) ||
    (!reference && !event)
  )
    return (
      <span>
        <Trans>Evidence reference unavailable</Trans>
      </span>
    );
  const actor =
    event?.actorType === 'AGENT'
      ? event.actorId
        ? event.agentName
          ? t`Assistant ${event.agentName} · initiated by ${event.actorName}`
          : t`Assistant run · initiated by ${event.actorName}`
        : event.agentName
          ? t`Assistant ${event.agentName}`
          : t`Automated assistant run`
      : event?.actorType === 'SYSTEM'
        ? t`Automation`
        : event?.actorType === 'CLIENT'
          ? t`Client portal`
          : event?.actorName;
  const occurredAt = event?.occurredAt ?? reference?.occurredAt;
  const time =
    occurredAt && Number.isFinite(Date.parse(occurredAt))
      ? formatActivityTime(occurredAt)
      : t`Time unavailable`;
  return (
    <StyledCitationButton
      type="button"
      onClick={() => onCitation({ kind: 'EVENT', eventId: resolvedEventId })}
    >
      {event ? label(event.action) : t`Recorded evidence`}
      {actor ? ` · ${actor}` : ''}
      {event?.subjectName && event.subjectMemberId !== event.actorId
        ? ` · ${t`Affects ${event.subjectName}`}`
        : ''}
      {' · '}
      <time dateTime={occurredAt ?? undefined}>{time}</time>
    </StyledCitationButton>
  );
};
