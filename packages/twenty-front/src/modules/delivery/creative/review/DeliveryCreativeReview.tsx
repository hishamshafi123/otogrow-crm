import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NetworkStatus } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import {
  type ChangeDeliveryCreativeFeedbackMutation,
  type CreateDeliveryCreativeFeedbackMutation,
  type DeliveryCreativeReviewQuery,
} from '~/generated-metadata/graphql';
import {
  CHANGE_CREATIVE_FEEDBACK,
  CREATE_CREATIVE_FEEDBACK,
  GET_CREATIVE_REVIEW,
} from '@/delivery/creative/review/delivery-creative-review.graphql';
import {
  type CreativeFeedback,
  type CreativeReviewSnapshot,
} from '@/delivery/creative/review/creative-review.types';
import {
  creativeReviewDestination,
  creativeReviewInput,
  creativeTargetChanges,
  formatCreativeReviewTime,
} from '@/delivery/creative/review/creative-review-navigation';
import { CreativeReviewPlayer } from '@/delivery/creative/review/CreativeReviewPlayer';
import { CreativeReviewTargetDetails } from '@/delivery/creative/review/CreativeReviewTargetDetails';
import {
  CreativeFeedbackForm,
  type CreativeFeedbackCommand,
} from '@/delivery/creative/review/CreativeFeedbackForm';
import { CreativeFeedbackHistory } from '@/delivery/creative/review/CreativeFeedbackHistory';
import { useCreativeReviewLabels } from '@/delivery/creative/review/useCreativeReviewLabels';
import {
  StyledFeedback,
  StyledReviewBoundary,
} from '@/delivery/creative/review/creativeReviewStyles';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryCreativeReviewProps = {
  taskId: string;
  taskRevision: number;
  targetKind: 'SUBMISSION' | 'ASSET';
  onFinalReviewReady?: (ready: boolean) => void;
  enabled?: boolean;
};
export const DeliveryCreativeReview = ({
  taskId,
  taskRevision,
  targetKind,
  onFinalReviewReady,
  enabled = true,
}: DeliveryCreativeReviewProps) => {
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  return (
    <CreativeReviewWorkspace
      key={`${permission.scope}:${taskId}:${targetKind}:${params}`}
      taskId={taskId}
      taskRevision={taskRevision}
      targetKind={targetKind}
      onFinalReviewReady={onFinalReviewReady}
      enabled={enabled}
    />
  );
};
type CreativeReviewWorkspaceProps = DeliveryCreativeReviewProps;
const CreativeReviewWorkspace = ({
  taskId,
  taskRevision,
  targetKind,
  onFinalReviewReady,
  enabled = true,
}: CreativeReviewWorkspaceProps) => {
  const { t } = useLingui();
  const labels = useCreativeReviewLabels();
  const permission = useWorkflowAccess();
  const { requestAction } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const input = creativeReviewInput(taskId, targetKind, params);
  const query = useQuery<DeliveryCreativeReviewQuery>(GET_CREATIVE_REVIEW, {
    variables: { input, identity: permission.scope, taskRevision },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !input || !permission.ready || !enabled,
  });
  const candidate = query.data?.deliveryCreativeReview;
  const denied = permission.denied || isOtogrowAccessDenied(query.error);
  const trusted = Boolean(
    input &&
    enabled &&
    permission.ready &&
    !query.error &&
    candidate?.taskId === taskId &&
    permission.matches(candidate),
  );
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  const [lastVerified, setLastVerified] =
    useState<CreativeReviewSnapshot | null>(null);
  const [retainReading, setRetainReading] = useState(false);
  const fresh = trusted && !query.loading && candidate ? candidate : null;
  if (fresh && !fastDeepEqual(fresh, lastVerified)) setLastVerified(fresh);
  else if (denied && lastVerified) setLastVerified(null);
  if (fresh && !retainReading) setRetainReading(true);
  else if (retainReading && (!trusted || (query.loading && !refreshing)))
    setRetainReading(false);
  const data =
    fresh ?? (trusted && refreshing && retainReading ? lastVerified : null);
  const available = Boolean(data);
  const currentReviewCapability =
    permission.ready &&
    hasOtogrowCapability(
      permission.access?.capabilities ?? [],
      'delivery.review',
    );
  const finalReviewReady = Boolean(
    data?.canReviewFinal && currentReviewCapability,
  );
  useLayoutEffect(() => {
    onFinalReviewReady?.(finalReviewReady);
    return () => onFinalReviewReady?.(false);
  }, [finalReviewReady, onFinalReviewReady]);
  const retained = fresh ?? lastVerified;
  const [editor, setEditor] = useState<{
    action: 'CREATE' | 'REPLY' | 'ADDRESSED' | 'RESOLVED' | 'REOPENED';
    feedbackId?: string;
  } | null>(null);
  const [version, setVersion] = useState(0);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [seek, setSeek] = useState<{ seconds: number; requestId: number }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [create] = useMutation<CreateDeliveryCreativeFeedbackMutation>(
    CREATE_CREATIVE_FEEDBACK,
  );
  const [change] = useMutation<ChangeDeliveryCreativeFeedbackMutation>(
    CHANGE_CREATIVE_FEEDBACK,
  );
  // oxlint-disable-next-line twenty/no-state-useref -- Ignore mutation completion after access, target or identity changed.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [permission.scope, available, currentReviewCapability]);
  const focus = useCallback((element: HTMLElement | null) => {
    element?.focus();
    element?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const update = (changes: Record<string, string | number | null>) => {
    const destination = creativeReviewDestination(params, changes);
    setParams(destination.slice(destination.indexOf('?') + 1));
  };
  const refresh = async () => {
    try {
      await query.refetch();
      return true;
    } catch {
      setError(
        t`Review evidence could not refresh. Your draft is kept and previous evidence is hidden.`,
      );
      return false;
    }
  };
  const save = async (command: CreativeFeedbackCommand) => {
    if (!data || busy || !permission.ready) return false;
    const started = epoch.current;
    setBusy(true);
    setError('');
    try {
      const result =
        'feedbackId' in command
          ? (await change({ variables: { input: command } })).data
              ?.changeDeliveryCreativeFeedback
          : (await create({ variables: { input: command } })).data
              ?.createDeliveryCreativeFeedback;
      if (started !== epoch.current) return false;
      if (!result) throw new Error(t`Feedback was not confirmed.`);
      setNotice(
        result.replayed
          ? t`The earlier feedback request was processed. Review its current status and immutable history.`
          : t`Feedback saved. Approval and client delivery remain separate.`,
      );
      setEditor(null);
      void refresh();
      return true;
    } catch (failure) {
      if (started === epoch.current)
        setError(
          failure instanceof Error
            ? failure.message
            : t`Feedback could not be saved. Your request is kept.`,
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const open = (
    action: NonNullable<typeof editor>['action'],
    feedbackId?: string,
  ) =>
    requestAction(() => {
      setEditor({ action, feedbackId });
      setVersion((value) => value + 1);
    });
  const selectedFeedback = retained?.selectedFeedback;
  const feedback =
    retained?.feedback.find((item) => item.id === editor?.feedbackId) ??
    (selectedFeedback && selectedFeedback.id === editor?.feedbackId
      ? selectedFeedback
      : undefined);
  const canUseEditor = Boolean(
    data &&
    (editor?.action === 'CREATE' || editor?.action === 'REPLY'
      ? data.canComment
      : editor?.action === 'ADDRESSED'
        ? data.canAddress
        : data.canResolve && currentReviewCapability),
  );
  const recovery = {
    creativeSubmission: null,
    creativeCompare: null,
    creativeAsset: null,
    creativeFeedback: null,
    creativeFeedbackAfter: null,
    creativeFeedbackBefore: null,
    creativeSubmissionsBefore: null,
    reviewAssignmentBefore: null,
  };
  const items: CreativeFeedback[] = data
    ? [
        ...(data.selectedFeedback &&
        !data.feedback.some((item) => item.id === data.selectedFeedback?.id)
          ? [data.selectedFeedback]
          : []),
        ...data.feedback,
      ]
    : [];
  return (
    <StyledDeliveryCard
      role="region"
      aria-label={t`Creative review`}
      tabIndex={-1}
      ref={focus}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>
            {targetKind === 'SUBMISSION'
              ? t`Review submitted work`
              : t`Review production asset`}
          </h2>
          <StyledDeliveryButton
            disabled={!permission.ready || query.loading || !input || !enabled}
            onClick={() => void refresh()}
          >
            <Trans>Refresh creative review</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {!input && (
          <p role="alert">
            <Trans>
              This review link is incomplete or invalid. Choose an exact
              permitted source.
            </Trans>
          </p>
        )}
        {(!input || query.error) && (
          <Link
            to={creativeReviewDestination(params, {
              ...recovery,
              panel: 'task',
            })}
          >
            <Trans>Return to current submission</Trans>
          </Link>
        )}
        {!permission.ready && (
          <p role="status">
            <Trans>
              Current access could not be verified. Media and saved evidence are
              hidden; your draft is kept.
            </Trans>{' '}
            <StyledDeliveryButton
              onClick={() => void permission.refetch().catch(() => undefined)}
            >
              <Trans>Retry creative review access</Trans>
            </StyledDeliveryButton>
          </p>
        )}
        {query.error && (
          <p role="alert">
            <Trans>
              The review could not be checked. Retry before making changes.
            </Trans>
          </p>
        )}
        {!data && input && !query.error && permission.ready && (
          <p role="status">
            <Trans>Checking exact review source…</Trans>
          </p>
        )}
        {data && (
          <>
            {refreshing && (
              <p role="status">
                <Trans>Refreshing; showing the last verified review.</Trans>
              </p>
            )}
            <small>{t`Reviewer: ${data.reviewerName} · Production owner: ${data.assigneeName}`}</small>
            <label>
              {targetKind === 'SUBMISSION'
                ? t`Submission to review`
                : t`Production asset to review`}
              <select
                aria-label={
                  targetKind === 'SUBMISSION'
                    ? t`Submission to review`
                    : t`Production asset to review`
                }
                value={
                  targetKind === 'SUBMISSION'
                    ? (data.selected.submissionVersion ?? '')
                    : (data.selected.assetId ?? '')
                }
                onChange={(event) =>
                  update({
                    creativeSubmission:
                      targetKind === 'SUBMISSION' ? event.target.value : null,
                    creativeAsset:
                      targetKind === 'ASSET' ? event.target.value : null,
                    creativeCompare: null,
                    creativeFeedback: null,
                    creativeFeedbackAfter: null,
                    creativeFeedbackBefore: null,
                    reviewAssignmentBefore: null,
                  })
                }
              >
                <option value="" disabled>{t`Choose an exact source`}</option>
                {targetKind === 'SUBMISSION' &&
                  data.selected.submissionVersion != null &&
                  !data.submissions.some(
                    (item) => item.version === data.selected.submissionVersion,
                  ) && (
                    <option
                      value={data.selected.submissionVersion}
                    >{t`Submission ${data.selected.submissionVersion} · Selected source, not on this page`}</option>
                  )}
                {targetKind === 'ASSET' &&
                  data.selected.assetId &&
                  !data.assets.some(
                    (item) => item.id === data.selected.assetId,
                  ) && (
                    <option value={data.selected.assetId}>
                      {data.selected.asset?.name ??
                        t`Selected asset unavailable`}
                    </option>
                  )}
                {targetKind === 'SUBMISSION'
                  ? data.submissions.map((item) => (
                      <option key={item.version} value={item.version}>
                        {t`Submission ${item.version} · ${item.submittedByName}`}{' '}
                        · {new Date(item.submittedAt).toLocaleString()}
                      </option>
                    ))
                  : data.assets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {t`Production ${item.productionVersion}`}
                      </option>
                    ))}
              </select>
            </label>
            {data.nextBeforeSubmissionVersion && (
              <Link
                to={creativeReviewDestination(params, {
                  creativeSubmissionsBefore: data.nextBeforeSubmissionVersion,
                })}
              >
                <Trans>Earlier submission choices</Trans>
              </Link>
            )}
            {params.has('creativeSubmissionsBefore') && (
              <Link
                to={creativeReviewDestination(params, {
                  creativeSubmissionsBefore: null,
                })}
              >
                <Trans>Latest submission choices</Trans>
              </Link>
            )}
            <CreativeReviewTargetDetails target={data.selected} />
            {data.selected.asset &&
              data.selected.availability === 'AVAILABLE' && (
                <CreativeReviewPlayer
                  key={`${permission.scope}:${data.selected.asset.id}:${data.selected.targetToken}`}
                  taskId={taskId}
                  asset={data.selected.asset}
                  label={labels.target(data.selected)}
                  seek={seek}
                  onTime={setPlayhead}
                />
              )}
            <label>
              <Trans>Compare with</Trans>
              <select
                aria-label={t`Compare with`}
                value={params.get('creativeCompare') ?? ''}
                onChange={(event) =>
                  update({ creativeCompare: event.target.value || null })
                }
              >
                <option value="">{t`No comparison`}</option>
                {targetKind === 'SUBMISSION' &&
                  data.comparison?.submissionVersion != null &&
                  !data.submissions.some(
                    (item) =>
                      item.version === data.comparison?.submissionVersion,
                  ) && (
                    <option
                      value={data.comparison.submissionVersion}
                    >{t`Submission ${data.comparison.submissionVersion} · Compared source, not on this page`}</option>
                  )}
                {targetKind === 'ASSET' &&
                  data.comparison?.assetId &&
                  !data.assets.some(
                    (item) => item.id === data.comparison?.assetId,
                  ) && (
                    <option value={data.comparison.assetId}>
                      {data.comparison.asset?.name ??
                        t`Compared asset unavailable`}
                    </option>
                  )}
                {targetKind === 'SUBMISSION'
                  ? data.submissions
                      .filter(
                        (item) =>
                          item.version !== data.selected.submissionVersion,
                      )
                      .map((item) => (
                        <option
                          key={item.version}
                          value={item.version}
                        >{t`Submission ${item.version}`}</option>
                      ))
                  : data.assets
                      .filter((item) => item.id !== data.selected.assetId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ·{' '}
                          {t`Production ${item.productionVersion}`}
                        </option>
                      ))}
              </select>
            </label>
            {data.comparison && (
              <section aria-label={t`Compared source`}>
                <CreativeReviewTargetDetails target={data.comparison} />
                {data.comparison.asset &&
                  data.comparison.availability === 'AVAILABLE' && (
                    <CreativeReviewPlayer
                      key={`${permission.scope}:${data.comparison.asset.id}:${data.comparison.targetToken}:comparison`}
                      taskId={taskId}
                      asset={data.comparison.asset}
                      label={t`Comparison: ${labels.target(data.comparison)}`}
                    />
                  )}
              </section>
            )}
            <p>{t`Feedback: ${data.feedbackCount} · Unresolved: ${data.unresolvedCount} · Unresolved on earlier targets: ${data.earlierUnresolvedCount}`}</p>
            <small>
              <Trans>
                Open feedback is advisory. Addressing or resolving it never
                approves work, records delivery or changes revision costs.
              </Trans>
            </small>
            {data.canComment && data.selected.availability === 'AVAILABLE' && (
              <StyledDeliveryButton
                data-primary="true"
                onClick={() => open('CREATE')}
              >
                <Trans>Add precise feedback</Trans>
              </StyledDeliveryButton>
            )}
          </>
        )}
        {editor && retained && !denied && (
          <StyledReviewBoundary hidden={!data} disabled={!data || busy}>
            <CreativeFeedbackForm
              key={version}
              taskId={taskId}
              target={feedback?.target ?? retained.selected}
              comparison={retained.comparison}
              feedback={feedback}
              action={editor.action}
              readOnly={!canUseEditor || busy}
              playhead={playhead}
              onSave={save}
              onCancel={() => requestAction(() => setEditor(null))}
              onReload={() =>
                requestAction(() => {
                  setEditor(null);
                  void refresh();
                })
              }
            />
          </StyledReviewBoundary>
        )}
        {data && (
          <>
            {params.has('creativeFeedback') && !data.selectedFeedback && (
              <p role="alert">
                <Trans>
                  This exact feedback is unavailable. Choose another permitted
                  thread.
                </Trans>
              </p>
            )}
            {items.map((item) => (
              <StyledFeedback
                key={item.id}
                aria-label={t`Feedback by ${item.createdByName}`}
              >
                <strong>{labels.state(item.status)}</strong>
                <p>
                  {item.createdByName} ·{' '}
                  {new Date(item.createdAt).toLocaleString(undefined, {
                    timeZone: 'UTC',
                  })}{' '}
                  UTC · {labels.target(item.target)}
                </p>
                <p>{item.body}</p>
                {item.startMs != null ? (
                  item.assetId === data.selected.assetId ? (
                    <StyledDeliveryButton
                      onClick={() => {
                        if (item.startMs != null) {
                          const seconds = item.startMs / 1000;
                          setSeek((previous) => ({
                            seconds,
                            requestId: (previous?.requestId ?? 0) + 1,
                          }));
                        }
                      }}
                    >
                      {t`Go to ${formatCreativeReviewTime(item.startMs)}`}
                      {item.endMs != null
                        ? ` – ${formatCreativeReviewTime(item.endMs)}`
                        : ''}
                    </StyledDeliveryButton>
                  ) : (
                    <p>
                      {formatCreativeReviewTime(item.startMs)}
                      {item.endMs != null
                        ? ` – ${formatCreativeReviewTime(item.endMs)}`
                        : ''}
                    </p>
                  )
                ) : (
                  <small>
                    <Trans>General asset feedback</Trans>
                  </small>
                )}
                {item.correction && (
                  <p>
                    {t`Recorded correction: ${labels.target(item.correction)}`}{' '}
                    · {item.correction.asset?.name}
                  </p>
                )}
                <StyledDeliveryRow>
                  <Link
                    to={creativeReviewDestination(params, {
                      ...creativeTargetChanges(item.target),
                      creativeFeedback: item.id,
                    })}
                  >
                    <Trans>Open exact feedback and history</Trans>
                  </Link>
                  {data.canComment && (
                    <StyledDeliveryButton
                      onClick={() => open('REPLY', item.id)}
                    >
                      <Trans>Reply</Trans>
                    </StyledDeliveryButton>
                  )}
                  {data.canAddress && item.status !== 'RESOLVED' && (
                    <StyledDeliveryButton
                      onClick={() => open('ADDRESSED', item.id)}
                    >
                      <Trans>Mark addressed</Trans>
                    </StyledDeliveryButton>
                  )}
                  {data.canResolve && currentReviewCapability && (
                    <StyledDeliveryButton
                      onClick={() =>
                        open(
                          item.status === 'RESOLVED' ? 'REOPENED' : 'RESOLVED',
                          item.id,
                        )
                      }
                    >
                      {item.status === 'RESOLVED'
                        ? t`Reopen feedback`
                        : t`Verify and resolve`}
                    </StyledDeliveryButton>
                  )}
                  {data.canResolve &&
                    currentReviewCapability &&
                    item.status === 'ADDRESSED' && (
                      <StyledDeliveryButton
                        onClick={() => open('REOPENED', item.id)}
                      >
                        <Trans>Reopen feedback</Trans>
                      </StyledDeliveryButton>
                    )}
                </StyledDeliveryRow>
              </StyledFeedback>
            ))}
            {!items.length && (
              <p>
                <Trans>No feedback on this file.</Trans>
              </p>
            )}
            {data.nextFeedbackId && (
              <Link
                to={creativeReviewDestination(params, {
                  creativeFeedbackAfter: data.nextFeedbackId,
                })}
              >
                <Trans>More feedback</Trans>
              </Link>
            )}
            {params.has('creativeFeedbackAfter') && (
              <Link
                to={creativeReviewDestination(params, {
                  creativeFeedbackAfter: null,
                })}
              >
                <Trans>First feedback page</Trans>
              </Link>
            )}
            {data.selectedFeedback && (
              <CreativeFeedbackHistory
                key={`${data.selectedFeedback.id}:${data.selectedFeedback.revision}`}
                taskId={taskId}
                feedbackId={data.selectedFeedback.id}
                enabled={Boolean(data)}
              />
            )}
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
