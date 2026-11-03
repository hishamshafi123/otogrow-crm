import { useLayoutEffect } from 'react';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { deliveryTaskDestination } from '@/delivery/delivery-task-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { StyledActivityBoundary } from '@/otogrow-activity/activityStyles';
import {
  matchesActivityIdentity,
  type useActivityContext,
} from '@/otogrow-activity/useActivityContext';
import { readActivityAnalysisNavigation } from '@/otogrow-activity/analysis/activity-analysis-navigation';
import { GET_ACTIVITY_CURRENT_TASK } from '@/otogrow-activity/analysis/activity-current-work.graphql';
import { ActivityCurrentTaskFacts } from '@/otogrow-activity/analysis/ActivityCurrentTaskFacts';
import { type ActivityCurrentWorkSnapshot } from '@/otogrow-activity/analysis/activity-analysis.types';
import { type OtogrowActivityCurrentTaskQuery } from '~/generated-metadata/graphql';

const StyledTaskEvidence = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  margin-top: ${themeCssVariables.spacing[4]};
  min-width: 0;
  overflow-wrap: anywhere;
  padding-top: ${themeCssVariables.spacing[4]};
`;

type ActivityCurrentTaskViewerProps = {
  state: ReturnType<typeof useActivityContext>;
  taskId: string;
  snapshot?: ActivityCurrentWorkSnapshot | null;
  comparisonReady?: boolean;
  enabled: boolean;
  onAuthorityLost: () => void;
  onClose: () => void;
};
export const ActivityCurrentTaskViewer = ({
  state,
  taskId,
  snapshot,
  comparisonReady = true,
  enabled,
  onAuthorityLost,
  onClose,
}: ActivityCurrentTaskViewerProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigation = readActivityAnalysisNavigation(params);
  const focus = useAssistantPanelFocus();
  const selected = snapshot?.scope ?? navigation.currentTaskScope;
  const scope = {
    personId: selected.personId ?? null,
    projectId: selected.projectId ?? null,
    clientId: selected.clientId ?? null,
  };
  const scoped = Object.values(scope).some(Boolean);
  const source = `${state.source}:${taskId}:${JSON.stringify(scope)}`;
  const available = enabled && comparisonReady;
  const query = useQuery<OtogrowActivityCurrentTaskQuery>(
    GET_ACTIVITY_CURRENT_TASK,
    {
      variables: {
        input: { taskId, ...(scoped ? { scope } : {}) },
        identity: source,
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: !available,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.otogrowActivityCurrentTask,
    source,
    enabled: available,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      matchesActivityIdentity(state, value) &&
      value.task !== undefined &&
      (value.task === null || value.task.taskId === taskId) &&
      Object.entries(scope).every(
        ([key, expected]) =>
          value.scopeSelection[key as keyof typeof scope] === expected,
      ),
  });
  const denied = isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onAuthorityLost();
  }, [denied, onAuthorityLost]);
  const savedTask = snapshot?.items.find((task) => task.taskId === taskId);
  const freshTask = reading.data?.task;
  return (
    <StyledTaskEvidence
      ref={focus}
      tabIndex={-1}
      aria-label={t`Current task evidence`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            <Trans>Current task check</Trans>
          </h3>
          <StyledDeliveryButton type="button" onClick={onClose}>
            <Trans>Close task check</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        <p>
          <Trans>
            This is a separate readonly source check. Refreshing it does not
            replace the evidence used by your question or saved answer.
          </Trans>
        </p>
        <StyledActivityBoundary
          hidden={!enabled || denied}
          disabled={!enabled || denied}
          inert={!enabled || denied || undefined}
        >
          {savedTask && snapshot ? (
            <details>
              <summary>{t`Saved facts captured at ${formatActivityTime(snapshot.capturedAt)}`}</summary>
              <ActivityCurrentTaskFacts task={savedTask} />
            </details>
          ) : (
            comparisonReady && (
              <p>
                <Trans>
                  No saved task comparison is available in this view. The facts
                  below are a fresh source check.
                </Trans>
              </p>
            )
          )}
          {!comparisonReady ? (
            <p role="status">
              <Trans>
                Checking the saved task scope before loading fresh facts…
              </Trans>
            </p>
          ) : reading.data ? (
            <StyledDeliveryStack>
              <p>{t`Fresh source check: ${formatActivityTime(reading.data.capturedAt)}`}</p>
              {freshTask ? (
                <>
                  <ActivityCurrentTaskFacts task={freshTask} />
                  {savedTask && (
                    <p>
                      {fastDeepEqual(savedTask, freshTask)
                        ? t`These source facts match the saved snapshot. They are current only as of this check.`
                        : t`The fresh facts differ from or add to the saved snapshot. The saved answer remains unchanged.`}
                    </p>
                  )}
                  <Link
                    to={deliveryTaskDestination(
                      new URLSearchParams({ view: 'planner' }),
                      taskId,
                    )}
                  >
                    <Trans>Open full task</Trans>
                  </Link>
                </>
              ) : (
                <p role="status">
                  {scoped
                    ? t`This task is no longer available in the selected scope. Saved facts remain historical.`
                    : t`This task could not be verified in the current workspace.`}
                </p>
              )}
            </StyledDeliveryStack>
          ) : (
            <p role={query.error ? 'alert' : 'status'}>
              {query.error
                ? t`Fresh task facts could not be verified. Your question and saved evidence are kept.`
                : t`Loading fresh task facts…`}
            </p>
          )}
          <StyledDeliveryButton
            type="button"
            disabled={!available || query.loading}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh live task facts</Trans>
          </StyledDeliveryButton>
        </StyledActivityBoundary>
      </StyledDeliveryStack>
    </StyledTaskEvidence>
  );
};
