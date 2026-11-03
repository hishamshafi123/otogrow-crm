import { useCallback, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type useActivityContext } from '@/otogrow-activity/useActivityContext';
import { type ActivityFilters } from '@/otogrow-activity/otogrow-activity.types';
import { activityAnalysisScope } from '@/otogrow-activity/analysis/activity-analysis-scope';
import {
  activityAnalysisClose,
  activityAnalysisDestination,
  readActivityAnalysisNavigation,
  activityCurrentTaskClose,
} from '@/otogrow-activity/analysis/activity-analysis-navigation';
import { ActivityAnalysisAssistantPicker } from '@/otogrow-activity/analysis/ActivityAnalysisAssistantPicker';
import { ActivityAnalysisPreparation } from '@/otogrow-activity/analysis/ActivityAnalysisPreparation';
import { ActivityAnalysisHistory } from '@/otogrow-activity/analysis/ActivityAnalysisHistory';
import { ActivityAnalysisRunViewer } from '@/otogrow-activity/analysis/ActivityAnalysisRunViewer';
import {
  type ActivityAnalysisIntent,
  type ActivityAnalysisCitationTarget,
} from '@/otogrow-activity/analysis/activity-analysis.types';

export const ActivityAnalysisPanel = ({
  state,
  filters,
  available,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useActivityContext>;
  filters: ActivityFilters;
  available: boolean;
  onAuthorityLost: () => void;
}) => (
  <AnalysisWorkspace
    key={`${state.source}:${JSON.stringify(filters)}`}
    state={state}
    filters={filters}
    available={available}
    onAuthorityLost={onAuthorityLost}
  />
);

const AnalysisWorkspace = ({
  state,
  filters,
  available,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useActivityContext>;
  filters: ActivityFilters;
  available: boolean;
  onAuthorityLost: () => void;
}) => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestNavigation } = useDeliveryDraftGuard();
  const [intent, setIntent] = useState<ActivityAnalysisIntent | null>(null);
  const consumeIntent = useCallback(
    (id: string) =>
      setIntent((current) => (current?.requestId === id ? null : current)),
    [],
  );
  const navigation = readActivityAnalysisNavigation(params);
  const scope = activityAnalysisScope(filters);
  const enabled = available && state.data?.canAnalyze === true;
  const go = (
    changes: Record<string, string | null>,
    nextIntent?: ActivityAnalysisIntent,
  ) => {
    const destination = activityAnalysisDestination(params, changes);
    requestNavigation(destination, () => {
      if (nextIntent) setIntent(nextIntent);
      navigate(destination);
    });
  };
  const onCitation = (target: ActivityAnalysisCitationTarget) =>
    target.kind === 'EVENT'
      ? go({ ...activityCurrentTaskClose, activityEvent: target.eventId })
      : go({
          activityEvent: null,
          activityCurrentTask: target.taskId,
          activityCurrentPerson: target.scope.personId ?? null,
          activityCurrentProject: target.scope.projectId ?? null,
          activityCurrentClient: target.scope.clientId ?? null,
        });
  const openRun = (id: string) =>
    go({
      ...activityAnalysisClose,
      ...activityCurrentTaskClose,
      activityAnalysis: 'history',
      activityAnalysisRun: id,
    });
  const open = navigation.view !== null || navigation.runId !== null;
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>
            <Trans>Ask about recorded work</Trans>
          </h2>
          {!open ? (
            <>
              <StyledDeliveryButton
                type="button"
                disabled={!enabled || scope === null}
                onClick={() =>
                  go({
                    ...activityAnalysisClose,
                    ...activityCurrentTaskClose,
                    activityAnalysis: 'assistants',
                  })
                }
              >
                <Trans>Prepare a question</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                type="button"
                disabled={!available}
                onClick={() =>
                  go({
                    ...activityAnalysisClose,
                    ...activityCurrentTaskClose,
                    activityAnalysis: 'history',
                  })
                }
              >
                <Trans>Saved analyses</Trans>
              </StyledDeliveryButton>
            </>
          ) : (
            <StyledDeliveryButton
              type="button"
              onClick={() => go(activityAnalysisClose)}
            >
              <Trans>Close analysis</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
        <p>
          <Trans>
            Use cited records to understand decisions and handoffs. AI cannot
            determine hours worked or employee productivity. Current task facts
            require the optional current-work snapshot and a fresh source check.
          </Trans>
        </p>
        {scope === null && (
          <p>
            <Trans>
              Apply an explicit From and Through date before preparing a
              question. Saved analyses remain available.
            </Trans>
          </p>
        )}
        {navigation.view === 'assistants' && scope !== null && (
          <ActivityAnalysisAssistantPicker
            state={state}
            enabled={enabled}
            onAuthorityLost={onAuthorityLost}
            onChoose={(assistant) => {
              const nextIntent: ActivityAnalysisIntent = {
                kind: 'start',
                requestId: crypto.randomUUID(),
                runId: crypto.randomUUID(),
                agentId: assistant.id,
              };
              go(
                {
                  ...activityCurrentTaskClose,
                  activityAnalysis: 'prepare',
                  activityAssistant: assistant.id,
                  activityAnalysisRequest: nextIntent.requestId,
                  activityAnalysisRun: nextIntent.runId,
                  activityAnalysisCancel: null,
                  activityAnalysisAfter: null,
                },
                nextIntent,
              );
            }}
          />
        )}
        {navigation.view === 'prepare' &&
          navigation.requestId &&
          navigation.runId &&
          navigation.assistantId &&
          scope !== null && (
            <ActivityAnalysisPreparation
              key={`${navigation.requestId}:${navigation.runId}`}
              state={state}
              filters={scope}
              requestId={navigation.requestId}
              runId={navigation.runId}
              agentId={navigation.assistantId}
              intent={intent}
              consumeIntent={consumeIntent}
              enabled={enabled}
              onAuthorityLost={onAuthorityLost}
              onOpenRun={openRun}
              onCitation={onCitation}
            />
          )}
        {navigation.view !== 'prepare' && navigation.runId && (
          <ActivityAnalysisRunViewer
            key={`${state.source}:${navigation.runId}`}
            state={state}
            runId={navigation.runId}
            cancelRequestId={navigation.cancelRequestId}
            intent={intent}
            consumeIntent={consumeIntent}
            enabled={available}
            onAuthorityLost={onAuthorityLost}
            onCitation={onCitation}
            onCancel={(id, revision) => {
              const nextIntent: ActivityAnalysisIntent = {
                kind: 'cancel',
                requestId: crypto.randomUUID(),
                runId: id,
                revision,
              };
              go(
                {
                  activityAnalysis: 'history',
                  activityAnalysisCancel: nextIntent.requestId,
                },
                nextIntent,
              );
            }}
          />
        )}
        {navigation.view === 'history' && !navigation.runId && (
          <ActivityAnalysisHistory
            state={state}
            after={navigation.after}
            enabled={available}
            onAuthorityLost={onAuthorityLost}
            onPage={(after) => go({ activityAnalysisAfter: after })}
            onOpenRun={openRun}
          />
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
