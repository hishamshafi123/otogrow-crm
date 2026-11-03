import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  ActivityEvent,
  formatActivityTime,
} from '@/otogrow-activity/ActivityEvent';
import { ActivityExactEvent } from '@/otogrow-activity/ActivityExactEvent';
import { ActivityFilterBar } from '@/otogrow-activity/ActivityFilterBar';
import { ActivityRecordPicker } from '@/otogrow-activity/ActivityRecordPicker';
import {
  activityDateRange,
  activityFilterParams,
  readActivityFilters,
} from '@/otogrow-activity/activityFilters';
import {
  StyledActivityBoundary,
  StyledActivityList,
} from '@/otogrow-activity/activityStyles';
import {
  matchesActivityIdentity,
  useActivityContext,
} from '@/otogrow-activity/useActivityContext';
import { GET_ACTIVITY_PAGE } from '@/otogrow-activity/activity-reads.graphql';
import {
  activityReadFilters,
  lastSevenActivityDays,
} from '@/otogrow-activity/analysis/activity-analysis-scope';
import {
  activityAnalysisDestination,
  readActivityAnalysisNavigation,
  activityCurrentTaskClose,
} from '@/otogrow-activity/analysis/activity-analysis-navigation';
import { ActivityCurrentTaskViewer } from '@/otogrow-activity/analysis/ActivityCurrentTaskViewer';
import { ActivityAnalysisPanel } from '@/otogrow-activity/analysis/ActivityAnalysisPanel';
import { type ActivityFilters } from '@/otogrow-activity/otogrow-activity.types';
import { type OtogrowActivityPageQuery } from '~/generated-metadata/graphql';

export const ActivityWorkspace = () => {
  const state = useActivityContext();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const [denied, setDenied] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [privateSource, setPrivateSource] = useState(state.source);
  const authorityChanged =
    state.permission.ready && privateSource !== state.source;
  const loseAuthority = useCallback(() => {
    cancelPendingNavigation();
    setDenied(true);
  }, [cancelPendingNavigation]);
  const startRequest = useFinanceExportRequestGuard(
    state.source,
    state.permission.ready && state.administrator,
  );
  useLayoutEffect(() => {
    if (state.denied || (state.permission.ready && !state.administrator))
      loseAuthority();
  }, [
    state.denied,
    state.permission.ready,
    state.administrator,
    loseAuthority,
  ]);
  useLayoutEffect(() => {
    if (authorityChanged) {
      cancelPendingNavigation();
      setPrivateSource(state.source);
    }
  }, [authorityChanged, state.source, cancelPendingNavigation]);
  const { t } = useLingui();
  const verified =
    state.data !== null &&
    state.administrator &&
    !state.denied &&
    !authorityChanged;
  return (
    <StyledDeliveryStack>
      {(denied || !verified) && (
        <StyledDeliveryStack>
          <p role={denied || state.query.error ? 'alert' : 'status'}>
            {denied
              ? t`Current administrator access to activity was denied. Private preparation was cleared.`
              : t`Current activity access could not be verified. Unsaved work is hidden and kept while you retry.`}
          </p>
          <StyledDeliveryButton
            type="button"
            onClick={async () => {
              const current = startRequest();
              try {
                const result = await state.query.refetch();
                const value = result.data?.otogrowActivityContext;
                if (
                  current() &&
                  value &&
                  matchesActivityIdentity(state, value)
                ) {
                  setDenied(false);
                  if (denied) setGeneration((previous) => previous + 1);
                }
              } catch {
                /* A failed check must leave private preparation hidden. */
              }
            }}
          >
            <Trans>Check activity access</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryStack>
      )}
      {!denied && (
        <ActivityBody
          key={`${privateSource}:${generation}`}
          state={state}
          available={verified}
          onAuthorityLost={loseAuthority}
        />
      )}
    </StyledDeliveryStack>
  );
};

const ActivityBody = ({
  state,
  available,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useActivityContext>;
  available: boolean;
  onAuthorityLost: () => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestNavigation } = useDeliveryDraftGuard();
  const heading = useRef<HTMLHeadingElement>(null);
  const filters = readActivityFilters(params);
  const inputFilters = activityReadFilters(filters);
  const after = params.get('activityCursor');
  const source = `${state.source}:${JSON.stringify(inputFilters)}:${after ?? ''}`;
  const datesValid = activityDateRange(filters) !== null;
  const query = useQuery<OtogrowActivityPageQuery>(GET_ACTIVITY_PAGE, {
    variables: {
      input: { filters: inputFilters, after, limit: 30 },
      identity: source,
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !available || !datesValid,
  });
  const reading = useAssistantRead({
    value: query.data?.otogrowActivityPage,
    source,
    enabled: available && datesValid,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      matchesActivityIdentity(state, value) &&
      Object.entries(inputFilters).every(
        ([key, expected]) =>
          value.filters[key as keyof typeof inputFilters] === expected,
      ),
  });
  const denied = isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onAuthorityLost();
  }, [denied, onAuthorityLost]);
  const navigation = readActivityAnalysisNavigation(params);
  const navigateTo = (destination: { pathname: string; search: string }) =>
    requestNavigation(destination, () => navigate(destination));
  const apply = (nextFilters?: ActivityFilters, commitReset?: () => void) => {
    const destination = {
      pathname: '/delivery',
      search: `?${activityFilterParams(params, nextFilters)}`,
    };
    requestNavigation(destination, () => {
      commitReset?.();
      navigate(destination);
      heading.current?.focus();
    });
  };
  const filtered = Object.values(filters).some(Boolean);
  return (
    <StyledActivityBoundary
      hidden={!available || denied}
      disabled={!available || denied}
      inert={!available || denied || undefined}
    >
      <StyledDeliveryStack>
        <p>
          {state.data?.coverageStartedAt &&
            t`Earliest retained record: ${formatActivityTime(state.data.coverageStartedAt)}. `}
          <Trans>
            Recorded changes do not cover all work. Message contents, earlier
            history and unrecorded activity are not included.
          </Trans>
        </p>
        <ActivityFilterBar
          key={JSON.stringify(filters)}
          filters={filters}
          onApply={apply}
          onReset={(commitReset) => apply(undefined, commitReset)}
          recordPicker={(kind, label, value, onChange) => (
            <ActivityRecordPicker
              state={state}
              kind={
                kind === 'personId'
                  ? 'PERSON'
                  : kind === 'projectId'
                    ? 'PROJECT'
                    : 'CLIENT'
              }
              label={label}
              value={value}
              onChange={onChange}
              onAuthorityLost={onAuthorityLost}
            />
          )}
        />
        {!filters.from && !filters.through && (
          <p>
            <Trans>Choose a date range for AI questions.</Trans>{' '}
            <StyledDeliveryButton
              type="button"
              onClick={() =>
                apply({ ...filters, ...lastSevenActivityDays(new Date()) })
              }
            >
              <Trans>Use the last seven UTC days</Trans>
            </StyledDeliveryButton>
          </p>
        )}
        {!navigation.valid ? (
          <p role="alert">
            <Trans>
              This activity link is incomplete. Reset the view to continue.
            </Trans>
            <StyledDeliveryButton type="button" onClick={() => apply(filters)}>
              <Trans>Reset activity link</Trans>
            </StyledDeliveryButton>
          </p>
        ) : (
          <>
            <ActivityAnalysisPanel
              state={state}
              filters={filters}
              available={available && !denied}
              onAuthorityLost={onAuthorityLost}
            />
            {navigation.eventId && (
              <ActivityExactEvent
                key={`${state.source}:${navigation.eventId}`}
                state={state}
                eventId={navigation.eventId}
                onAuthorityLost={onAuthorityLost}
                onClose={() =>
                  navigateTo(
                    activityAnalysisDestination(params, {
                      activityEvent: null,
                    }),
                  )
                }
              />
            )}
            {navigation.currentTaskId && navigation.runId === null && (
              <ActivityCurrentTaskViewer
                key={`${state.source}:${navigation.currentTaskId}`}
                state={state}
                taskId={navigation.currentTaskId}
                enabled={available && !denied}
                onAuthorityLost={onAuthorityLost}
                onClose={() =>
                  navigateTo(
                    activityAnalysisDestination(
                      params,
                      activityCurrentTaskClose,
                    ),
                  )
                }
              />
            )}
          </>
        )}
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <h2 ref={heading} tabIndex={-1}>
                <Trans>Recorded activity</Trans>
              </h2>
              <small>
                <Trans>Newest first · Times in UTC</Trans>
              </small>
              <StyledDeliveryButton
                type="button"
                disabled={!available || query.loading}
                onClick={() => void query.refetch().catch(() => undefined)}
              >
                <Trans>Refresh recorded activity</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
            {!datesValid ? (
              <p role="alert">
                <Trans>
                  Choose valid dates with the end on or after the start.
                </Trans>
              </p>
            ) : reading.data ? (
              <>
                <p>{t`Showing ${reading.data.events.length} of ${reading.data.totalCount} matching records.`}</p>
                {reading.data.events.length ? (
                  <StyledActivityList aria-label={t`Activity events`}>
                    {reading.data.events.map((event) => (
                      <ActivityEvent
                        key={event.id}
                        event={event}
                        params={params}
                        onOpenExact={(id) =>
                          navigateTo(
                            activityAnalysisDestination(params, {
                              activityEvent: id,
                            }),
                          )
                        }
                      />
                    ))}
                  </StyledActivityList>
                ) : (
                  <p role="status">
                    {filtered || after
                      ? t`No recorded activity matches this view.`
                      : t`No activity has been recorded yet.`}
                  </p>
                )}
                <StyledDeliveryRow>
                  {after && (
                    <Link
                      to={activityAnalysisDestination(params, {
                        activityCursor: null,
                      })}
                    >
                      <Trans>Latest activity</Trans>
                    </Link>
                  )}
                  {reading.data.nextCursor && (
                    <Link
                      to={activityAnalysisDestination(params, {
                        activityCursor: reading.data.nextCursor,
                      })}
                    >
                      <Trans>Older activity</Trans>
                    </Link>
                  )}
                </StyledDeliveryRow>
              </>
            ) : (
              <StyledDeliveryStack>
                <p role={query.error ? 'alert' : 'status'}>
                  {query.error
                    ? t`Recorded activity could not be loaded. Your preparation is kept.`
                    : t`Loading recorded activity…`}
                </p>
                {query.error && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => apply(filters)}
                  >
                    <Trans>Reset this activity page</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryStack>
            )}
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      </StyledDeliveryStack>
    </StyledActivityBoundary>
  );
};
