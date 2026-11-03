import { Trans, useLingui } from '@lingui/react/macro';
import {
  type ReleaseBody,
  type ReleaseTask,
} from '@/delivery/development/release.types';
import { useReleaseLabels } from '@/delivery/development/useReleaseLabels';
import {
  StyledReleaseFacts,
  StyledReleaseItem,
  StyledReleaseText,
} from '@/delivery/development/releaseStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type ReleasePlanSummaryProps = {
  body: ReleaseBody;
  tasks: ReleaseTask[];
  ownerName: string;
};
export const ReleasePlanSummary = ({
  body,
  tasks,
  ownerName,
}: ReleasePlanSummaryProps) => {
  const { t } = useLingui();
  const labels = useReleaseLabels();
  return (
    <StyledDeliveryStack>
      <h3>{body.title}</h3>
      <StyledReleaseFacts>
        <div>
          <dt>
            <Trans>Owner</Trans>
          </dt>
          <dd>{ownerName || t`Owner name unavailable`}</dd>
        </div>
        <div>
          <dt>
            <Trans>Target date</Trans>
          </dt>
          <dd>{body.targetDate}</dd>
        </div>
        <div>
          <dt>
            <Trans>Repository</Trans>
          </dt>
          <dd>{body.repositoryUrl}</dd>
        </div>
        <div>
          <dt>
            <Trans>Commit</Trans>
          </dt>
          <dd>{body.commitSha || t`Not selected yet`}</dd>
        </div>
      </StyledReleaseFacts>
      <h4>
        <Trans>Release changes</Trans>
      </h4>
      <StyledReleaseText>
        {body.summary || t`Not recorded yet`}
      </StyledReleaseText>
      <h4>
        <Trans>Client acceptance criteria</Trans>
      </h4>
      <StyledReleaseText>
        {body.acceptanceCriteria || t`Not recorded yet`}
      </StyledReleaseText>
      <h4>
        <Trans>Included work</Trans>
      </h4>
      {!body.work.length && (
        <p>
          <Trans>No tasks selected yet.</Trans>
        </p>
      )}
      {body.work.map((work) => (
        <StyledReleaseItem key={work.taskId}>
          <StyledDeliveryStack>
            <strong>
              {tasks.find((task) => task.taskId === work.taskId)?.title ??
                t`Task title unavailable`}
            </strong>
            <span>{t`Task revision ${work.revision}`}</span>
            {work.issueUrl && (
              <span>{t`Existing issue: ${work.issueUrl}`}</span>
            )}
            {work.pullRequestUrl && (
              <span>{t`Pull request: ${work.pullRequestUrl}`}</span>
            )}
            {work.blockedByTaskIds.length > 0 && (
              <span>{t`Depends on: ${work.blockedByTaskIds.map((id) => tasks.find((task) => task.taskId === id)?.title ?? t`Task title unavailable`).join(', ')}`}</span>
            )}
          </StyledDeliveryStack>
        </StyledReleaseItem>
      ))}
      <h4>
        <Trans>Checks</Trans>
      </h4>
      {body.checks.map((check) => (
        <StyledReleaseItem key={check.id}>
          <StyledDeliveryStack>
            <strong>
              {check.label} · {labels.checkState(check.status)}
            </strong>
            <StyledReleaseText>{check.note}</StyledReleaseText>
            {check.evidenceUrl && <span>{check.evidenceUrl}</span>}
          </StyledDeliveryStack>
        </StyledReleaseItem>
      ))}
      <h4>
        <Trans>Rollback plan</Trans>
      </h4>
      <StyledReleaseText>
        {body.rollbackPlan || t`Not recorded yet`}
      </StyledReleaseText>
    </StyledDeliveryStack>
  );
};
