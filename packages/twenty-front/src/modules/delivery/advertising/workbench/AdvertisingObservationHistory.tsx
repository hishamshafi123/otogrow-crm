import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual, isSafeUrl } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import { GET_ADVERTISING_OBSERVATIONS } from '@/delivery/advertising/workbench/delivery-advertising.graphql';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import {
  StyledAdvertisingFacts,
  StyledAdvertisingItem,
  StyledAdvertisingText,
} from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { DateTimeDisplay } from '@/ui/field/display/components/DateTimeDisplay';
import { type DeliveryAdvertisingObservationsQuery } from '~/generated-metadata/graphql';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';

export type AdvertisingObservation =
  DeliveryAdvertisingObservationsQuery['deliveryAdvertisingObservations']['items'][number];
type AdvertisingObservationHistoryProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  review: AdvertisingReview;
  actionId: string;
  enabled: boolean;
  onCorrect?: (observation: AdvertisingObservation) => void;
  onAuthorityLost?: () => void;
};

export const AdvertisingObservationHistory = ({
  state,
  review,
  actionId,
  enabled,
  onCorrect,
  onAuthorityLost,
}: AdvertisingObservationHistoryProps) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const [after, setAfter] = useState<string | null>(null);
  const identity = `${state.source}:${review.id}:${review.revision}:${actionId}:${after ?? 'first'}`;
  const query = useQuery<DeliveryAdvertisingObservationsQuery>(
    GET_ADVERTISING_OBSERVATIONS,
    {
      variables: {
        input: { reviewId: review.id, actionId, after, limit: 25 },
        identity,
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: !enabled || state.data === null,
    },
  );
  const denied = isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onAuthorityLost?.();
  }, [denied, onAuthorityLost]);
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingObservations,
    source: identity,
    enabled: enabled && state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.permission.matches(value) &&
      fastDeepEqual(value.actor, state.data?.actor) &&
      value.items.every(
        (item) => item.reviewId === review.id && item.actionId === actionId,
      ),
  });
  if (!enabled || state.data === null) return null;
  const authorName = (id: string) => {
    if (id === state.data?.memberId) return t`You`;
    for (const action of review.actions) {
      if (id === action.ownerId && action.ownerName) return action.ownerName;
      if (id === action.reviewerId && action.reviewerName)
        return action.reviewerName;
    }
    return t`Team member`;
  };
  return (
    <section aria-label={t`Recorded outcomes`}>
      <StyledDeliveryStack>
        <h3>
          <Trans>Recorded outcomes</Trans>
        </h3>
        <p>
          <Trans>
            Each observation preserves its evidence and task state at that time.
            Corrections add a new entry; they do not erase the original. A later
            result alone does not prove this work caused it.
          </Trans>
        </p>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} observations, newest first.`}</p>
            {reading.data.items.map((item) => (
              <StyledAdvertisingItem key={item.id}>
                <h4>
                  {labels.assessment(item.assessment)}
                  {item.correctedById
                    ? ` · ${t`Corrected by a later entry`}`
                    : ''}
                </h4>
                <p>
                  {authorName(item.actorId)} ·{' '}
                  <DateTimeDisplay value={item.createdAt} />
                </p>
                {item.correctsId && (
                  <p>
                    <Trans>
                      This entry corrects earlier evidence for the same action.
                    </Trans>
                  </p>
                )}
                <StyledAdvertisingFacts>
                  <dt>
                    <Trans>Observed period</Trans>
                  </dt>
                  <dd>
                    {item.fromDate} – {item.throughDate}
                  </dd>
                  <dt>
                    <Trans>Evidence source</Trans>
                  </dt>
                  <dd>
                    {item.source
                      ? `${labels.source(item.source.kind)} · ${item.source.title}`
                      : t`Recorded by a person`}
                  </dd>
                  <dt>
                    <Trans>Observed outcome</Trans>
                  </dt>
                  <dd>
                    {item.metric?.label ?? labels.goal(review.goal.kind)}:{' '}
                    {labels.count(item.value)}
                    {(item.metric?.unit ?? review.goal.metricUnit) === 'MONEY'
                      ? ` ${item.source?.currency ?? review.goal.currency}`
                      : ''}
                  </dd>
                  <dt>
                    <Trans>Provenance</Trans>
                  </dt>
                  <dd>
                    {item.metric
                      ? labels.provenance(item.metric.provenance)
                      : t`Human observation; not independently verified by the platform`}
                  </dd>
                  {item.source && (
                    <>
                      <dt>
                        <Trans>Reporting scope</Trans>
                      </dt>
                      <dd>
                        {item.source.accountId ?? t`Account not recorded`} ·{' '}
                        {item.source.timezone ?? t`Timezone not recorded`}
                      </dd>
                    </>
                  )}
                  <dt>
                    <Trans>Task at recording</Trans>
                  </dt>
                  <dd>
                    {item.task.title} · {labels.taskState(item.task.state)} ·{' '}
                    {t`revision ${item.task.revision}`}
                  </dd>
                  <dt>
                    <Trans>Submission at recording</Trans>
                  </dt>
                  <dd>
                    {item.task.submissionState
                      ? `${labels.taskState(item.task.submissionState)} · ${t`version ${item.task.submissionVersion ?? 0}`}`
                      : t`No submitted version recorded`}
                  </dd>
                </StyledAdvertisingFacts>
                {item.task.evidence.length > 0 && (
                  <details>
                    <summary>
                      <Trans>
                        Task evidence recorded with this observation
                      </Trans>
                    </summary>
                    <ul>
                      {item.task.evidence.map((evidence) => (
                        <li key={`${evidence.url}:${evidence.label}`}>
                          {isSafeUrl(evidence.url) ? (
                            <a
                              href={evidence.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {evidence.label}
                            </a>
                          ) : (
                            evidence.label
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {item.metric?.reason && (
                  <p>{labels.reason(item.metric.reason)}</p>
                )}
                <h4>
                  <Trans>Evidence</Trans>
                </h4>
                <StyledAdvertisingText>{item.evidence}</StyledAdvertisingText>
                <h4>
                  <Trans>Interpretation and limitations</Trans>
                </h4>
                <StyledAdvertisingText>{item.note}</StyledAdvertisingText>
                {onCorrect && !item.correctedById && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => onCorrect(item)}
                  >
                    <Trans>Correct this observation</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledAdvertisingItem>
            ))}
            {reading.data.totalCount === 0 && (
              <p>
                <Trans>
                  No outcomes have been recorded for this action yet.
                </Trans>
              </p>
            )}
            <StyledDeliveryRow>
              {after && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setAfter(null)}
                >
                  <Trans>Newest observations</Trans>
                </StyledDeliveryButton>
              )}
              {reading.data.nextCursor && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setAfter(reading.data?.nextCursor ?? null)}
                >
                  <Trans>Older observations</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`The current outcome history could not be verified. Refresh it or return to the newest page.`
              : t`Loading recorded outcomes…`}
          </p>
        )}
        <StyledDeliveryRow>
          {query.error && after && (
            <StyledDeliveryButton type="button" onClick={() => setAfter(null)}>
              <Trans>Newest observations</Trans>
            </StyledDeliveryButton>
          )}
          <StyledDeliveryButton
            type="button"
            disabled={query.loading}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh outcomes</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
