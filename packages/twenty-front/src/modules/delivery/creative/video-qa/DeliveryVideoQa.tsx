import { useCallback, useLayoutEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type CreativeProductionTask } from '@/delivery/creative/production/creative-production.types';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useVideoQaAccess } from '@/delivery/creative/video-qa/useVideoQaAccess';
import {
  videoQaDestination,
  videoQaSelectionValid,
  VIDEO_QA_CLOSE,
} from '@/delivery/creative/video-qa/video-qa-navigation';
import {
  type VideoQaIntent,
  type VideoQaReceipt,
} from '@/delivery/creative/video-qa/video-qa.types';
import { VideoQaPreparation } from '@/delivery/creative/video-qa/VideoQaPreparation';
import { VideoQaRunView } from '@/delivery/creative/video-qa/VideoQaRunView';
import { StyledVideoQaBoundary } from '@/delivery/creative/video-qa/videoQaStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
export const DeliveryVideoQa = ({
  task,
  onChanged,
  onAuthorityLost,
}: {
  task: CreativeProductionTask;
  onChanged: () => Promise<unknown>;
  onAuthorityLost?: () => void;
}) => {
  const access = useVideoQaAccess();
  const { source, invalidateSource } = access;
  const deniedByScope = access.permission.denied;
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const [owner, setOwner] = useState(access.source);
  const [denied, setDenied] = useState(false);
  const changed = owner !== access.source;
  useLayoutEffect(() => {
    if (changed || deniedByScope) {
      invalidateSource();
      cancelPendingNavigation();
      setOwner(source);
      setDenied(Boolean(deniedByScope));
    }
  }, [
    changed,
    source,
    deniedByScope,
    invalidateSource,
    cancelPendingNavigation,
  ]);
  const loseAuthority = useCallback(() => {
    invalidateSource();
    cancelPendingNavigation();
    setDenied(true);
    onAuthorityLost?.();
  }, [invalidateSource, cancelPendingNavigation, onAuthorityLost]);
  return (
    <StyledDeliveryCard>
      {denied && (
        <p role="alert">
          <Trans>
            Video inspection access changed. Private preparation was cleared.
            Refresh the task’s current access to continue.
          </Trans>
        </p>
      )}
      {!denied && !changed && (
        <VideoQaWorkspace
          key={`${owner}:${task.id}`}
          access={access}
          task={task}
          onChanged={onChanged}
          onDenied={loseAuthority}
        />
      )}
    </StyledDeliveryCard>
  );
};
const VideoQaWorkspace = ({
  access,
  task,
  onChanged,
  onDenied,
}: {
  access: ReturnType<typeof useVideoQaAccess>;
  task: CreativeProductionTask;
  onChanged: () => Promise<unknown>;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction, requestNavigation } = useDeliveryDraftGuard();
  const [intent, setIntent] = useState<VideoQaIntent | null>(null);
  const consumeIntent = useCallback(
    (requestId: string) =>
      setIntent((previous) =>
        previous?.requestId === requestId ? null : previous,
      ),
    [],
  );
  const enabled = access.permission.ready;
  const requestId = params.get('creativeQaRequest'),
    runId = params.get('creativeQaRun');
  const canPrepare =
    enabled &&
    task.details.state !== 'APPROVED' &&
    (access.permission.manager ||
      task.assigneeId === access.permission.access?.memberId);
  const valid = videoQaSelectionValid(params);
  const runs = (task.details.creative?.mediaRuns ?? [])
    .filter((run) => run.kind === 'VIDEO_QA')
    .sort(
      (first, second) =>
        second.createdAt.localeCompare(first.createdAt) ||
        second.id.localeCompare(first.id),
    );
  const after = params.get('creativeQaAfter');
  const afterIndex =
    after === null ? -1 : runs.findIndex((run) => run.id === after);
  const page = runs.slice(afterIndex + 1, afterIndex + 26);
  const more = runs.length > afterIndex + 26;
  const openRun = (id: string) => {
    const destination = videoQaDestination(params, {
      creativeQaRun: id,
      creativeQaCancel: null,
    });
    const target = new URL(destination, window.location.origin);
    requestNavigation(
      { pathname: target.pathname, search: target.search },
      () => navigate(destination),
    );
  };
  const saved = (receipt: VideoQaReceipt) => {
    if (receipt.taskId !== task.id) return;
    void onChanged().catch(() => undefined);
  };
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <div>
          <h3>
            <Trans>Video quality review</Trans>
          </h3>
          <p>
            <Trans>
              Inspect the actual video, audio, visible text and product evidence
              before independent final approval.
            </Trans>
          </p>
        </div>
        <StyledDeliveryButton
          type="button"
          disabled={!canPrepare}
          onClick={() =>
            requestAction(() => {
              const id = crypto.randomUUID();
              setIntent({ kind: 'START', taskId: task.id, requestId: id });
              navigate(
                videoQaDestination(params, {
                  creativeQaRequest: id,
                  creativeQaCancel: null,
                }),
              );
            })
          }
        >
          <Trans>Prepare a video inspection</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {!enabled && (
        <p role="status">
          <Trans>
            Current task access is being checked. Private preparation is hidden
            and retained during this connection problem.
          </Trans>
        </p>
      )}
      {!valid && (
        <p role="alert">
          <Trans>This inspection link is invalid.</Trans>{' '}
          <LinkToClear params={params} />
        </p>
      )}
      <StyledVideoQaBoundary
        hidden={!enabled}
        disabled={!enabled}
        inert={!enabled || undefined}
      >
        {valid && (
          <StyledDeliveryStack>
            {requestId && (
              <VideoQaPreparation
                key={requestId}
                access={access}
                task={task}
                requestId={requestId}
                intent={intent}
                consumeIntent={consumeIntent}
                enabled={enabled}
                onDenied={onDenied}
                onSaved={saved}
              />
            )}
            {runId && (
              <VideoQaRunView
                key={runId}
                access={access}
                taskId={task.id}
                runId={runId}
                enabled={enabled}
                onDenied={onDenied}
                intent={intent}
                consumeIntent={consumeIntent}
                openCancel={() => {
                  const requestId = crypto.randomUUID();
                  const destination = videoQaDestination(params, {
                    creativeQaCancel: requestId,
                  });
                  const target = new URL(destination, window.location.origin);
                  requestNavigation(
                    { pathname: target.pathname, search: target.search },
                    () => {
                      setIntent({
                        kind: 'CANCEL',
                        taskId: task.id,
                        runId,
                        requestId,
                      });
                      navigate(destination);
                    },
                  );
                }}
              />
            )}
            <details>
              <summary>{t`Recorded video inspections (${runs.length}, latest task history)`}</summary>
              <StyledDeliveryStack>
                {after !== null && afterIndex === -1 && (
                  <p role="status">
                    <Trans>
                      This history page expired. Open the first page.
                    </Trans>
                  </p>
                )}
                {runs.length === 0 && (
                  <p>
                    <Trans>
                      No video inspections have been recorded for this task.
                    </Trans>
                  </p>
                )}
                {page.map((run) => (
                  <StyledDeliveryButton
                    type="button"
                    key={run.id}
                    onClick={() => openRun(run.id)}
                  >
                    {new Date(run.createdAt).toLocaleString()} ·{' '}
                    {run.status === 'SUCCEEDED'
                      ? t`Findings ready for review`
                      : run.status === 'RUNNING'
                        ? t`Inspecting`
                        : run.status === 'QUEUED'
                          ? t`Queued`
                          : run.status === 'CANCELLED'
                            ? t`Cancelled`
                            : t`Failed — inspect reason`}{' '}
                    · {t`Brief version ${run.briefVersion}`}
                  </StyledDeliveryButton>
                ))}
                <StyledDeliveryRow>
                  {after && (
                    <ReaderLink
                      params={params}
                      changes={{ creativeQaAfter: null }}
                    >
                      <Trans>First inspection page</Trans>
                    </ReaderLink>
                  )}
                  {more && page.length > 0 && (
                    <ReaderLink
                      params={params}
                      changes={{ creativeQaAfter: page[page.length - 1].id }}
                    >
                      <Trans>More inspections</Trans>
                    </ReaderLink>
                  )}
                </StyledDeliveryRow>
              </StyledDeliveryStack>
            </details>
          </StyledDeliveryStack>
        )}
      </StyledVideoQaBoundary>
    </StyledDeliveryStack>
  );
};
const ReaderLink = ({
  params,
  changes,
  children,
}: {
  params: URLSearchParams;
  changes: Record<string, string | null>;
  children: ReactNode;
}) => {
  const { requestNavigation } = useDeliveryDraftGuard();
  const navigate = useNavigate();
  const destination = videoQaDestination(params, changes);
  return (
    <Link
      to={destination}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        const target = new URL(destination, window.location.origin);
        requestNavigation(
          { pathname: target.pathname, search: target.search },
          () => navigate(destination),
        );
      }}
    >
      {children}
    </Link>
  );
};
const LinkToClear = ({ params }: { params: URLSearchParams }) => (
  <ReaderLink params={params} changes={VIDEO_QA_CLOSE}>
    <Trans>Clear inspection selection</Trans>
  </ReaderLink>
);
