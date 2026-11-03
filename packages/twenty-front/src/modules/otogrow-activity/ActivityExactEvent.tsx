import { useLayoutEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useSearchParams } from 'react-router-dom';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { ActivityEvent } from '@/otogrow-activity/ActivityEvent';
import { StyledActivityList } from '@/otogrow-activity/activityStyles';
import { GET_ACTIVITY_EVENT } from '@/otogrow-activity/activity-reads.graphql';
import {
  matchesActivityIdentity,
  type useActivityContext,
} from '@/otogrow-activity/useActivityContext';
import { type OtogrowActivityEventQuery } from '~/generated-metadata/graphql';

export const ActivityExactEvent = ({
  state,
  eventId,
  onClose,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useActivityContext>;
  eventId: string;
  onClose: () => void;
  onAuthorityLost: () => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const focus = useAssistantPanelFocus();
  const source = `${state.source}:${eventId}`;
  const enabled = state.data !== null && state.administrator;
  const query = useQuery<OtogrowActivityEventQuery>(GET_ACTIVITY_EVENT, {
    variables: { input: { id: eventId }, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const reading = useAssistantRead({
    value: query.data?.otogrowActivityEvent,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      matchesActivityIdentity(state, value) &&
      value.event !== undefined &&
      (value.event === null || value.event.id === eventId),
  });
  const denied = isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onAuthorityLost();
  }, [denied, onAuthorityLost]);
  return (
    <StyledDeliveryCard>
      <section ref={focus} tabIndex={-1} aria-label={t`Cited activity event`}>
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <h2>
              <Trans>Recorded evidence</Trans>
            </h2>
            <StyledDeliveryButton type="button" onClick={onClose}>
              <Trans>Close event</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
          <p>
            <Trans>
              This is an audit record. Open its source to verify current work;
              the record does not establish today’s status.
            </Trans>
          </p>
          {reading.data?.event ? (
            <StyledActivityList aria-label={t`Exact activity event`}>
              <ActivityEvent event={reading.data.event} params={params} />
            </StyledActivityList>
          ) : reading.data?.event === null ? (
            <p role="status">
              <Trans>
                This event is no longer available. Your filters and analysis
                remain open.
              </Trans>
            </p>
          ) : (
            <>
              <p role={query.error ? 'alert' : 'status'}>
                {query.error
                  ? t`This evidence could not be verified. Your other preparation is kept.`
                  : t`Loading exact evidence…`}
              </p>
              <StyledDeliveryButton
                type="button"
                disabled={!enabled}
                onClick={() => void query.refetch().catch(() => undefined)}
              >
                <Trans>Check event again</Trans>
              </StyledDeliveryButton>
            </>
          )}
        </StyledDeliveryStack>
      </section>
    </StyledDeliveryCard>
  );
};
