import { useQuery } from '@apollo/client/react';
import { useRef } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import { ActivityFilterBar } from '@/otogrow-activity/ActivityFilterBar';
import {
  ActivityEvent,
  formatActivityTime,
} from '@/otogrow-activity/ActivityEvent';
import {
  StyledActivityActions,
  StyledActivityList,
} from '@/otogrow-activity/activityStyles';
import {
  activityDateRange,
  activityFilterParams,
  activityInput,
  readActivityFilters,
} from '@/otogrow-activity/activityFilters';
import { GET_OTOGROW_ACTIVITY } from '@/otogrow-activity/otogrow-activity.graphql';
import {
  type OtogrowActivityQuery,
  type OtogrowActivityQueryVariables,
} from '~/generated-metadata/graphql';

type OtogrowActivityProps = { workspace: DeliveryWorkspace };

export const OtogrowActivity = ({ workspace }: OtogrowActivityProps) => {
  const { t } = useLingui();
  const permission = useOtogrowAccess();
  const [params, setParams] = useSearchParams();
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusResults = () => {
    resultsHeadingRef.current?.focus({ preventScroll: true });
    resultsHeadingRef.current?.scrollIntoView?.({
      block: 'start',
      behavior: 'auto',
    });
  };
  const filters = readActivityFilters(params);
  const cursor = params.get('activityCursor');
  const validDates = activityDateRange(filters) !== null;
  const canView =
    workspace.actor.isAdmin &&
    permission.canManageRoles &&
    workspace.actor.memberId === permission.access?.memberId;
  const query = useQuery<
    OtogrowActivityQuery,
    OtogrowActivityQueryVariables & { identity: string | null }
  >(GET_OTOGROW_ACTIVITY, {
    variables: {
      input: activityInput(filters, cursor),
      identity: permission.scopeKey,
    },
    skip: !canView || !validDates,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
  });
  const candidate = query.data?.otogrowActivity;
  const feed =
    canView &&
    !query.error &&
    candidate?.workspaceId === permission.access?.workspaceId &&
    candidate?.memberId === permission.access?.memberId &&
    candidate?.userWorkspaceId === permission.access?.userWorkspaceId
      ? candidate
      : undefined;
  const filtered = Object.values(filters).some(Boolean);
  const clear = () => {
    setParams(activityFilterParams(params));
    focusResults();
  };
  const olderParams = new URLSearchParams(params);
  if (feed?.nextCursor) olderParams.set('activityCursor', feed.nextCursor);
  const latestParams = new URLSearchParams(params);
  latestParams.delete('activityCursor');
  if (permission.loading)
    return (
      <p role="status">
        <Trans>Checking activity access…</Trans>
      </p>
    );
  if (permission.error)
    return (
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <p role="alert">
            <Trans>
              Could not check activity access. Activity is hidden until access
              can be verified.
            </Trans>
          </p>
          <StyledActivityActions>
            <StyledDeliveryButton onClick={() => void permission.refetch()}>
              <Trans>Check access again</Trans>
            </StyledDeliveryButton>
          </StyledActivityActions>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    );
  if (!canView)
    return (
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <p role="alert">
            <Trans>
              Team activity is available to administrators. Your current access
              does not include this view.
            </Trans>
          </p>
          <Link to="/delivery?view=home">
            <Trans>Go to Today</Trans>
          </Link>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    );
  return (
    <StyledDeliveryStack>
      <p>
        {feed?.coverageStartedAt &&
          `${t`Recorded activity since ${formatActivityTime(feed.coverageStartedAt)}.`} `}
        <Trans>
          Recorded changes and decisions appear here. Earlier work remains in
          task histories.
        </Trans>
      </p>
      <ActivityFilterBar
        key={`${permission.scopeKey}:${JSON.stringify(filters)}`}
        filters={filters}
        options={feed}
        onApply={(next) => {
          setParams(activityFilterParams(params, next));
          focusResults();
        }}
        onReset={clear}
      />
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <StyledActivityActions>
            <h2 ref={resultsHeadingRef} tabIndex={-1}>
              <Trans>Recorded activity</Trans>
            </h2>
            <small>
              <Trans>Newest first · Times in UTC</Trans>
            </small>
          </StyledActivityActions>
          {!validDates ? (
            <div role="alert">
              <Trans>
                Choose valid dates with the end date on or after the start date.
              </Trans>
            </div>
          ) : query.error ? (
            <StyledDeliveryStack>
              <p role="alert">
                <Trans>
                  Could not load activity. Check your access and connection,
                  then try again. Clear filters to reset an outdated page.
                </Trans>
              </p>
              <StyledActivityActions>
                <StyledDeliveryButton onClick={() => void query.refetch()}>
                  <Trans>Try again</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton onClick={clear}>
                  <Trans>Reset activity view</Trans>
                </StyledDeliveryButton>
              </StyledActivityActions>
            </StyledDeliveryStack>
          ) : query.loading || !feed ? (
            <p role="status">
              <Trans>Loading activity…</Trans>
            </p>
          ) : feed.events.length === 0 ? (
            <StyledDeliveryStack>
              <p role="status">
                {filtered || cursor
                  ? t`No recorded activity matches this view.`
                  : t`No activity has been recorded yet.`}
              </p>
              <p>
                <Trans>
                  Events appear when supported work changes are saved. Existing
                  task histories remain available.
                </Trans>
              </p>
              {(filtered || cursor) && (
                <StyledActivityActions>
                  <StyledDeliveryButton onClick={clear}>
                    <Trans>Show latest activity</Trans>
                  </StyledDeliveryButton>
                </StyledActivityActions>
              )}
            </StyledDeliveryStack>
          ) : (
            <StyledActivityList aria-label={t`Activity events`}>
              {feed.events.map((event) => (
                <ActivityEvent
                  key={event.id}
                  event={event}
                  workspace={workspace}
                  params={params}
                />
              ))}
            </StyledActivityList>
          )}
          {validDates &&
            !query.loading &&
            !query.error &&
            feed &&
            (cursor || feed.nextCursor) && (
              <nav aria-label={t`Activity pages`}>
                <StyledActivityActions>
                  {cursor && (
                    <Link
                      to={`/delivery?${latestParams}`}
                      onClick={focusResults}
                    >
                      <Trans>Latest activity</Trans>
                    </Link>
                  )}
                  {feed.nextCursor && (
                    <Link
                      to={`/delivery?${olderParams}`}
                      onClick={focusResults}
                    >
                      <Trans>Older activity</Trans>
                    </Link>
                  )}
                </StyledActivityActions>
              </nav>
            )}
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    </StyledDeliveryStack>
  );
};
