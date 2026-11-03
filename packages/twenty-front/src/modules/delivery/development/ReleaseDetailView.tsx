import { ReleaseStage } from '@/delivery/development/ReleaseStage';
import { useQuery } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { type useReleaseAccess } from '@/delivery/development/useReleaseAccess';
import { useReleaseRead } from '@/delivery/development/useReleaseRead';
import { GET_RELEASE_DETAIL } from '@/delivery/development/delivery-release.graphql';
import { releaseDestination } from '@/delivery/development/release-navigation';
import { canonicalReleaseBody } from '@/delivery/development/release-body';
import { type ReleaseIntent } from '@/delivery/development/release.types';
import { useReleaseLabels } from '@/delivery/development/useReleaseLabels';
import {
  StyledReleaseFacts,
  StyledReleaseItem,
  StyledReleaseText,
  StyledReleaseActions,
} from '@/delivery/development/releaseStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryReleaseDetailQuery } from '~/generated-metadata/graphql';

type ReleaseDetailViewProps = {
  access: ReturnType<typeof useReleaseAccess>;
  releaseId: string;
  projectId: string;
  enabled: boolean;
  onDenied: () => void;
  openIntent: (intent: ReleaseIntent) => void;
};
export const ReleaseDetailView = ({
  access,
  releaseId,
  projectId,
  enabled,
  onDenied,
  openIntent,
}: ReleaseDetailViewProps) => {
  const { t } = useLingui();
  const labels = useReleaseLabels();
  const [params] = useSearchParams();
  const version = params.get('releaseVersion')
    ? Number(params.get('releaseVersion'))
    : null;
  const query = useQuery<DeliveryReleaseDetailQuery>(GET_RELEASE_DETAIL, {
    variables: {
      input: {
        id: releaseId,
        version,
        afterEventId: params.get('releaseHistoryAfter'),
      },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled,
  });
  const read = useReleaseRead({
    value: query.data?.deliveryReleaseDetail,
    access,
    scope: `detail:${releaseId}:${version}:${params.get('releaseHistoryAfter')}`,
    query,
    matches: (value) =>
      value.release.id === releaseId &&
      value.project.id === projectId &&
      (version === null || value.selectedVersion === version),
    onDenied,
  });
  const detail = enabled ? read.data : null;
  if (!detail)
    return (
      <div role={query.error ? 'alert' : 'status'}>
        <p>
          {query.error ? (
            <Trans>
              The release could not be checked under your current permissions.
              Private evidence is hidden while you reconnect.
            </Trans>
          ) : (
            <Trans>Checking the current release…</Trans>
          )}
        </p>
        <StyledDeliveryButton
          type="button"
          disabled={!enabled}
          onClick={() => void query.refetch()}
        >
          <Trans>Check release again</Trans>
        </StyledDeliveryButton>
      </div>
    );
  const prepare = (mode: string) =>
    openIntent({
      releaseId,
      requestId: crypto.randomUUID(),
      projectId,
      projectRevision: detail.project.revision,
      expectedCompanyId: detail.project.companyId ?? null,
      revision: detail.release.revision,
      mode,
      sourceFingerprint: detail.currentSourceFingerprint,
      body: canonicalReleaseBody(detail.body),
      tasks: detail.body.tasks,
    });
  const actions = [
    ...(detail.canEdit ? ['edit'] : []),
    ...(detail.canSubmit ? ['SUBMIT'] : []),
    ...(detail.canReview ? ['APPROVE', 'REQUEST_CHANGES'] : []),
    ...(detail.canRecordDeployment
      ? ['RECORD_DEPLOYMENT', 'RECORD_DEPLOYMENT_FAILED']
      : []),
    ...(detail.canRecordHandover ? ['RECORD_HANDOVER'] : []),
    ...(detail.canRecordAcceptance ? ['RECORD_ACCEPTANCE'] : []),
  ];
  return (
    <ReleaseStage label={detail.release.title}>
      <h3>{detail.release.title}</h3>
      <StyledReleaseFacts>
        <div>
          <dt>
            <Trans>Current stage</Trans>
          </dt>
          <dd>{labels.state(detail.release.status)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Release owner</Trans>
          </dt>
          <dd>{detail.release.ownerName}</dd>
        </div>
        <div>
          <dt>
            <Trans>Selected manifest</Trans>
          </dt>
          <dd>{t`Version ${detail.selectedVersion} of ${detail.release.currentVersion}`}</dd>
        </div>
        <div>
          <dt>
            <Trans>Target date</Trans>
          </dt>
          <dd>{detail.body.targetDate}</dd>
        </div>
      </StyledReleaseFacts>
      <p>
        <Trans>
          Approval, deployment and client acceptance are separate records.
          External links and results are recorded by your team; they have not
          been verified with GitHub or Jira.
        </Trans>
      </p>
      {detail.sourceChanged && (
        <p role="alert">
          <Trans>
            Linked tasks changed after this manifest was saved. Deployment and
            client handover actions are locked. Return a pending review for an
            updated plan.
          </Trans>
        </p>
      )}
      {detail.selectedVersion !== detail.release.currentVersion && (
        <p>
          <Trans>You are viewing an earlier immutable manifest.</Trans>{' '}
          <Link
            to={releaseDestination(params, {
              releaseVersion: null,
              releaseHistoryAfter: null,
            })}
          >
            <Trans>Open current version</Trans>
          </Link>
        </p>
      )}
      {detail.reviewBlockedReason && (
        <p role="status">{detail.reviewBlockedReason}</p>
      )}
      <StyledReleaseActions>
        {actions.map((action) => (
          <StyledDeliveryButton
            key={action}
            type="button"
            data-primary={
              action === (actions.includes('SUBMIT') ? 'SUBMIT' : actions[0])
            }
            disabled={
              action === 'APPROVE' &&
              (detail.sourceChanged || Boolean(detail.reviewBlockedReason))
            }
            onClick={() => prepare(action)}
          >
            {action === 'edit' ? t`Edit release plan` : labels.action(action)}
          </StyledDeliveryButton>
        ))}
      </StyledReleaseActions>
      <h4>
        <Trans>Changes and acceptance criteria</Trans>
      </h4>
      <StyledReleaseText>
        {detail.body.summary || t`No change summary recorded.`}
      </StyledReleaseText>
      <StyledReleaseText>
        {detail.body.acceptanceCriteria || t`No acceptance criteria recorded.`}
      </StyledReleaseText>
      <StyledReleaseFacts>
        <div>
          <dt>
            <Trans>Repository</Trans>
          </dt>
          <dd>
            <a
              href={detail.body.repositoryUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Trans>Open repository</Trans>
            </a>
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Exact commit</Trans>
          </dt>
          <dd>{detail.body.commitSha || t`Not selected yet`}</dd>
        </div>
      </StyledReleaseFacts>
      <h4>
        <Trans>Included work</Trans>
      </h4>
      {!detail.body.work.length && (
        <p>
          <Trans>No tasks have been selected.</Trans>
        </p>
      )}
      {detail.body.work.map((work) => {
        const task = detail.body.tasks.find(
          (item) => item.taskId === work.taskId,
        );
        return (
          <StyledReleaseItem key={work.taskId}>
            <StyledDeliveryStack>
              <Link to={`/delivery?view=mine&task=${work.taskId}&panel=task`}>
                {task?.title ?? t`Task title unavailable`}
              </Link>
              <span>
                {t`Recorded task revision ${work.revision}`}
                {task?.submissionVersion
                  ? ` · ${t`Submission ${task.submissionVersion}`}`
                  : ''}{' '}
                ·{' '}
                {task?.approved
                  ? t`Independently approved at capture`
                  : t`Not approved at capture`}
              </span>
              <StyledDeliveryRow>
                {work.issueUrl && (
                  <a
                    href={work.issueUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Trans>Existing issue / Jira work</Trans>
                  </a>
                )}
                {work.pullRequestUrl && (
                  <a
                    href={work.pullRequestUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Trans>Pull request</Trans>
                  </a>
                )}
              </StyledDeliveryRow>
              {work.blockedByTaskIds.length > 0 && (
                <p>{t`Depends on: ${work.blockedByTaskIds.map((id) => detail.body.tasks.find((item) => item.taskId === id)?.title ?? t`Task title unavailable`).join(', ')}`}</p>
              )}
            </StyledDeliveryStack>
          </StyledReleaseItem>
        );
      })}
      <h4>
        <Trans>Release checks</Trans>
      </h4>
      {detail.body.checks.map((check) => (
        <StyledReleaseItem key={check.id}>
          <StyledDeliveryStack>
            <strong>{check.label}</strong>
            <span>
              {check.label === labels.check(check.kind)
                ? labels.checkState(check.status)
                : `${labels.check(check.kind)} · ${labels.checkState(check.status)}`}
            </span>
            <StyledReleaseText>{check.note}</StyledReleaseText>
            {check.evidenceUrl && (
              <a
                href={check.evidenceUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Trans>Check evidence</Trans>
              </a>
            )}
          </StyledDeliveryStack>
        </StyledReleaseItem>
      ))}
      <h4>
        <Trans>Rollback plan</Trans>
      </h4>
      <StyledReleaseText>
        {detail.body.rollbackPlan || t`No rollback plan recorded.`}
      </StyledReleaseText>
      <h4>
        <Trans>Decisions and delivery history</Trans>
      </h4>
      {detail.history.map((event) => (
        <StyledReleaseItem key={event.requestId}>
          <StyledDeliveryStack>
            <strong>{labels.recorded(event.action)}</strong>
            <span>
              {event.actorName} ·{' '}
              <time dateTime={event.createdAt}>
                {formatActivityTime(event.createdAt)}
              </time>{' '}
              · {t`Manifest ${event.version}`}
            </span>
            <StyledReleaseText>{event.note}</StyledReleaseText>
            {event.environment && (
              <span>{t`Environment: ${event.environment}`}</span>
            )}
            {event.commitSha && <span>{t`Commit: ${event.commitSha}`}</span>}
            {event.evidenceUrl && (
              <a
                href={event.evidenceUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Trans>Recorded evidence</Trans>
              </a>
            )}
            <Link
              to={releaseDestination(params, {
                releaseVersion: String(event.version),
                releaseHistoryAfter: null,
              })}
            >
              <Trans>Inspect this manifest version</Trans>
            </Link>
          </StyledDeliveryStack>
        </StyledReleaseItem>
      ))}
      <StyledDeliveryRow>
        {params.get('releaseHistoryAfter') && (
          <Link to={releaseDestination(params, { releaseHistoryAfter: null })}>
            <Trans>Latest decisions</Trans>
          </Link>
        )}
        {detail.nextEventId && (
          <Link
            to={releaseDestination(params, {
              releaseHistoryAfter: detail.nextEventId,
            })}
          >
            <Trans>Earlier decisions</Trans>
          </Link>
        )}
      </StyledDeliveryRow>
    </ReleaseStage>
  );
};
