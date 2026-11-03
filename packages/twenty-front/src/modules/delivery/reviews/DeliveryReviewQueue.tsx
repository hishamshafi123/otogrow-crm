import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NetworkStatus } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { type DeliveryReviewQueueQuery } from '~/generated-metadata/graphql';
import { GET_REVIEW_QUEUE } from '@/delivery/reviews/delivery-reviews.graphql';
import { type ReviewQueueSnapshot } from '@/delivery/reviews/review.types';
import {
  parseReviewBatch,
  reviewBatchValue,
  reviewItemDestination,
  reviewQueueDestination,
  reviewQueueInput,
  type SelectedReview,
} from '@/delivery/reviews/review-navigation';
import { useReviewLabels } from '@/delivery/reviews/useReviewLabels';
import {
  StyledReviewQueueItem,
  StyledReviewQueueStack,
  StyledReviewQueueCard,
  StyledReviewQueueHeading,
} from '@/delivery/reviews/reviewStyles';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
type DeliveryReviewQueueProps = {
  enabled?: boolean;
  readScope?: string;
};
export const DeliveryReviewQueue = ({
  enabled = true,
  readScope,
}: DeliveryReviewQueueProps) => {
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const input = reviewQueueInput(params);
  const source = readScope ?? permission.scope;
  return (
    <ReviewQueueWorkspace
      key={`${permission.scope}:${source}:${JSON.stringify(input)}`}
      enabled={enabled}
      readScope={source}
    />
  );
};
type ReviewQueueWorkspaceProps = { enabled: boolean; readScope: string };
const ReviewQueueWorkspace = ({
  enabled,
  readScope,
}: ReviewQueueWorkspaceProps) => {
  const { t } = useLingui();
  const labels = useReviewLabels();
  const permission = useWorkflowAccess();
  const [params, setParams] = useSearchParams();
  const mobile = useIsMobile();
  const { requestAction } = useDeliveryDraftGuard();
  const input = reviewQueueInput(params);
  const authorized =
    enabled &&
    permission.ready &&
    hasOtogrowCapability(
      permission.access?.capabilities ?? [],
      'delivery.review',
    );
  const query = useQuery<DeliveryReviewQueueQuery>(GET_REVIEW_QUEUE, {
    variables: { input, identity: readScope },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !input || !authorized,
  });
  const candidate = query.data?.deliveryReviewQueue;
  const trusted =
    authorized &&
    Boolean(input) &&
    !query.error &&
    permission.matches(candidate);
  const fresh = trusted && !query.loading && candidate ? candidate : null;
  const [lastVerified, setLastVerified] = useState<ReviewQueueSnapshot | null>(
    null,
  );
  const [retainReading, setRetainReading] = useState(false);
  if (fresh && !fastDeepEqual(fresh, lastVerified)) setLastVerified(fresh);
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  if (fresh && !retainReading) setRetainReading(true);
  else if (retainReading && (!trusted || (query.loading && !refreshing)))
    setRetainReading(false);
  const data =
    fresh ?? (trusted && refreshing && retainReading ? lastVerified : null);
  const selected = parseReviewBatch(params, 'reviewsSelected') ?? [];
  const selectedProject = params.get('reviewProject');
  const selectedReviewer = params.get('reviewReviewer');
  const activeFilterCount = [
    Boolean(selectedProject),
    Boolean(selectedReviewer),
    params.get('reviewsMine') === '1',
  ].filter(Boolean).length;
  const validSelection = selected.length > 0 && selected.length <= 25;
  const update = (changes: Record<string, string | null>) => {
    const destination = reviewQueueDestination(params, {
      ...changes,
      reviewsAfter: null,
      reviewsSelected: null,
      reviewBatch: null,
      reviewBatchIndex: null,
    });
    setParams(destination.slice(destination.indexOf('?') + 1));
  };
  const start = selected[0];
  const changeSelection = (next: SelectedReview[]) =>
    requestAction(() => {
      const destination = reviewQueueDestination(params, {
        reviewsSelected: next.length ? reviewBatchValue(next) : null,
      });
      setParams(destination.slice(destination.indexOf('?') + 1));
    });
  return (
    <StyledReviewQueueCard aria-label={t`Pending submission queue`}>
      <StyledReviewQueueStack>
        <StyledReviewQueueHeading>
          <h2>
            <Trans>Oldest first</Trans>
          </h2>
          <StyledDeliveryButton
            aria-label={t`Refresh approvals`}
            disabled={query.loading || !authorized || !input}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            {mobile ? t`Refresh` : t`Refresh approvals`}
          </StyledDeliveryButton>
        </StyledReviewQueueHeading>
        {(!input || query.error) && (
          <p role="alert">
            <Trans>
              The approval queue could not be verified. Retry or clear its
              filters; previous evidence is hidden.
            </Trans>{' '}
            {params.has('reviewsAfter') && (
              <>
                <Trans>
                  This page may have changed. Return to the first approval page
                  to load current results; your selected reviews are retained.
                </Trans>{' '}
                <Link
                  to={reviewQueueDestination(params, { reviewsAfter: null })}
                >
                  <Trans>First approval page</Trans>
                </Link>{' '}
              </>
            )}
            <Link
              to={reviewQueueDestination(params, {
                reviewProject: null,
                reviewReviewer: null,
                reviewsAfter: null,
                reviewsMine: null,
              })}
            >
              <Trans>Clear approval filters</Trans>
            </Link>
          </p>
        )}
        {!permission.ready && (
          <p role="status">
            <Trans>Current review access is unavailable.</Trans>{' '}
            <StyledDeliveryButton
              onClick={() => void permission.refetch().catch(() => undefined)}
            >
              <Trans>Retry approval access</Trans>
            </StyledDeliveryButton>
          </p>
        )}
        {!data && input && !query.error && permission.ready && (
          <p role="status">
            {authorized
              ? t`Checking the full pending queue…`
              : !enabled
                ? t`Verifying workspace access before loading approvals…`
                : t`A current delivery review role is required to open Approvals.`}
          </p>
        )}
        {data && (
          <>
            <strong>{t`Pending in this selection: ${data.totalCount}`}</strong>
            <small>{t`Unknown or future waiting time: ${data.unknownAgeCount} · Reviewer needs attention: ${data.unavailableReviewerCount}`}</small>
            {(params.has('reviewsAfter') || activeFilterCount > 0) && (
              <StyledDeliveryRow>
                {params.has('reviewsAfter') && (
                  <Link
                    to={reviewQueueDestination(params, { reviewsAfter: null })}
                  >
                    <Trans>First approval page</Trans>
                  </Link>
                )}
                {activeFilterCount > 0 && (
                  <Link
                    to={reviewQueueDestination(params, {
                      reviewProject: null,
                      reviewReviewer: null,
                      reviewsAfter: null,
                      reviewsMine: null,
                    })}
                  >
                    <Trans>Clear approval filters</Trans>
                  </Link>
                )}
              </StyledDeliveryRow>
            )}
            <details open={!mobile || undefined}>
              <summary>
                <Trans>Filter approvals</Trans>
                {activeFilterCount > 0 && (
                  <> · {t`${activeFilterCount} active`}</>
                )}
              </summary>
              <StyledDeliveryRow>
                <label>
                  <Trans>Approval client / project</Trans>
                  <select
                    aria-label={t`Approval client / project`}
                    value={params.get('reviewProject') ?? ''}
                    onChange={(event) =>
                      update({ reviewProject: event.target.value || null })
                    }
                  >
                    <option value="">{t`All permitted projects`}</option>
                    {selectedProject &&
                      !data.projects.some(
                        (item) => item.id === selectedProject,
                      ) && (
                        <option
                          value={selectedProject}
                        >{t`Selected project unavailable`}</option>
                      )}
                    {data.projects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Submission reviewer</Trans>
                  <select
                    aria-label={t`Submission reviewer`}
                    value={params.get('reviewReviewer') ?? ''}
                    onChange={(event) =>
                      update({ reviewReviewer: event.target.value || null })
                    }
                  >
                    <option value="">{t`All permitted reviewers`}</option>
                    {selectedReviewer &&
                      !data.reviewers.some(
                        (item) => item.id === selectedReviewer,
                      ) && (
                        <option
                          value={selectedReviewer}
                        >{t`Selected reviewer unavailable`}</option>
                      )}
                    {data.reviewers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={params.get('reviewsMine') === '1'}
                    onChange={(event) =>
                      update({ reviewsMine: event.target.checked ? '1' : null })
                    }
                  />
                  <Trans>Assigned to me</Trans>
                </label>
              </StyledDeliveryRow>
            </details>
            {selected.length > 0 && (
              <section aria-label={t`Selected reviews`}>
                <StyledDeliveryRow>
                  <strong>{t`Selected ${selected.length} submissions`}</strong>
                  {validSelection && (
                    <Link
                      to={reviewItemDestination(params, start, {
                        reviewBatch: reviewBatchValue(selected),
                        reviewBatchIndex: 0,
                      })}
                    >
                      <Trans>Start selected reviews</Trans>
                    </Link>
                  )}
                  <StyledDeliveryButton onClick={() => changeSelection([])}>
                    <Trans>Clear selected reviews</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
                <small>
                  <Trans>
                    Up to 25 submissions. Each needs its own checks and
                    decision.
                  </Trans>
                </small>
              </section>
            )}
            {!data.items.length && (
              <p>
                <Trans>
                  No pending submissions match these filters. Missing or
                  unavailable evidence is not treated as approval.
                </Trans>
              </p>
            )}
            {data.items.map((item) => {
              const selectedItem = selected.some(
                (current) =>
                  current.taskId === item.taskId &&
                  current.submissionVersion === item.submissionVersion,
              );
              const version = item.submissionVersion;
              return (
                <StyledReviewQueueItem
                  key={`${item.taskId}:${version}`}
                  aria-label={item.title}
                >
                  <StyledDeliveryRow>
                    <h3>{item.title}</h3>
                    <strong>{labels.age(item)}</strong>
                  </StyledDeliveryRow>
                  {version != null && (
                    <Link
                      to={reviewItemDestination(params, {
                        taskId: item.taskId,
                        submissionVersion: version,
                      })}
                    >
                      {item.canReviewSubmission
                        ? t`Review exact submission`
                        : t`View submission and responsibility`}
                    </Link>
                  )}
                  <p>
                    {item.projectName} · {item.service} ·{' '}
                    {version != null
                      ? t`Submission ${version}`
                      : t`Submission identity unavailable`}
                  </p>
                  <p>
                    {t`Review owner: ${item.effectiveReviewerName}`} ·{' '}
                    {labels.mode(item.assignmentMode)} ·{' '}
                    {labels.reviewer(item.reviewerState)}
                  </p>
                  <small>{t`Primary delivery manager: ${item.primaryReviewerName}`}</small>
                  <p>
                    {item.requiredCheckCount != null
                      ? t`Required review checks: ${item.requiredCheckCount}`
                      : t`Review requirements unavailable`}
                    {' · '}
                    {t`Submitted`}:{' '}
                    {labels.submittedAt(item.submittedAt, data.observedAt)}
                  </p>
                  {item.warnings.length > 0 && (
                    <details>
                      <summary>
                        <Trans>Source and reviewer checks</Trans>
                      </summary>
                      {item.warnings.map((code) => (
                        <p key={code}>{labels.warning(code)}</p>
                      ))}
                    </details>
                  )}
                  {version != null && (
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedItem}
                        disabled={
                          !item.canReviewSubmission ||
                          (!selectedItem && selected.length >= 25)
                        }
                        onChange={(event) =>
                          changeSelection(
                            event.target.checked
                              ? [
                                  ...selected.filter(
                                    (value) => value.taskId !== item.taskId,
                                  ),
                                  {
                                    taskId: item.taskId,
                                    submissionVersion: version,
                                  },
                                ]
                              : selected.filter(
                                  (value) => value.taskId !== item.taskId,
                                ),
                          )
                        }
                      />
                      {t`Select ${item.title} submission ${version}`}
                    </label>
                  )}
                </StyledReviewQueueItem>
              );
            })}
            <StyledDeliveryRow>
              {data.nextCursor && (
                <Link
                  to={reviewQueueDestination(params, {
                    reviewsAfter: data.nextCursor,
                  })}
                >
                  <Trans>More pending submissions</Trans>
                </Link>
              )}
            </StyledDeliveryRow>
            <details>
              <summary>
                <Trans>About approvals</Trans>
              </summary>
              <p>
                <Trans>
                  Review submitted work one item at a time. Waiting time starts
                  when work was submitted.
                </Trans>
              </p>
              <small>
                {t`Checked at`}:{' '}
                {new Date(data.observedAt).toLocaleString(undefined, {
                  timeZone: 'UTC',
                })}{' '}
                UTC{refreshing ? ` · ${t`Refreshing`}` : ''}
              </small>
            </details>
          </>
        )}
      </StyledReviewQueueStack>
    </StyledReviewQueueCard>
  );
};
