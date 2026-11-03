import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { ActivityCurrentTaskFacts } from '@/otogrow-activity/analysis/ActivityCurrentTaskFacts';
import { ActivityAnalysisCitation } from '@/otogrow-activity/analysis/ActivityAnalysisCitation';
import {
  type ActivityAnalysisContext,
  type ActivityAnalysisCitationTarget,
} from '@/otogrow-activity/analysis/activity-analysis.types';

type ActivityCurrentWorkViewProps = {
  context: ActivityAnalysisContext;
  onCitation: (target: ActivityAnalysisCitationTarget) => void;
};
export const ActivityCurrentWorkView = ({
  context,
  onCitation,
}: ActivityCurrentWorkViewProps) => {
  const { t } = useLingui();
  const snapshot = context.currentWork;
  if (snapshot == null)
    return (
      <p>
        <Trans>
          Current work was not included in this analysis. Its audit history does
          not establish today’s owners, reviewers or blockers.
        </Trans>
      </p>
    );
  const includedTasks = plural(snapshot.includedCount, {
    one: '# task included',
    other: '# tasks included',
  });
  return (
    <section aria-label={t`Current work snapshot`}>
      <StyledDeliveryStack>
        <h4>
          <Trans>Current work captured for this analysis</Trans>
        </h4>
        <p>{t`Captured at ${formatActivityTime(snapshot.capturedAt)}. This is a saved snapshot, not a live task list.`}</p>
        <p>{t`${includedTasks} · ${snapshot.totalCount} matching · ${snapshot.omittedCount} omitted`}</p>
        <p>{t`${snapshot.truncatedFieldCount} fields shortened · ${snapshot.omittedBytes} bytes omitted`}</p>
        <p>
          <Trans>
            Only Person, Project and Client select these tasks. Audit dates,
            category, action and outcome do not filter current work. Person
            means current owner or effective reviewer, including a valid backup.
          </Trans>
        </p>
        {!snapshot.complete && (
          <p role="alert">
            <Trans>
              The current-work evidence is incomplete. Narrow the scope or
              resolve source visibility before starting.
            </Trans>
          </p>
        )}
        {snapshot.totalCount === 0 ? (
          <p>
            <Trans>
              No currently visible tasks match this selected scope. This does
              not establish that no work exists outside it.
            </Trans>
          </p>
        ) : (
          snapshot.items.length === 0 && (
            <p>
              <Trans>
                Matching tasks could not be included. This incomplete snapshot
                cannot establish the current work.
              </Trans>
            </p>
          )
        )}
        {snapshot.limitations.length > 0 && (
          <ul>
            {snapshot.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        )}
        <details>
          <summary>
            <Trans>Inspect captured current task facts</Trans>
          </summary>
          <StyledDeliveryStack>
            {snapshot.items.map((task) => (
              <article key={task.taskId}>
                <ActivityCurrentTaskFacts task={task} />
                <ActivityAnalysisCitation
                  context={context}
                  taskId={task.taskId}
                  onCitation={onCitation}
                />
              </article>
            ))}
          </StyledDeliveryStack>
        </details>
      </StyledDeliveryStack>
    </section>
  );
};
