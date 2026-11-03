import { useLayoutEffect, useMemo, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type useActivityContext } from '@/otogrow-activity/useActivityContext';
import { activityQuestionRetainsNavigation } from '@/otogrow-activity/analysis/activity-analysis-navigation';
import { useActivityAnalysisCommands } from '@/otogrow-activity/analysis/useActivityAnalysisCommands';
import {
  type ActivityAnalysisCommand,
  type ActivityAnalysisIntent,
  type ActivityAnalysisReceipt,
} from '@/otogrow-activity/analysis/activity-analysis.types';

export const ActivityAnalysisCancel = ({
  state,
  requestId,
  runId,
  intent,
  consumeIntent,
  enabled,
  onAuthorityLost,
  onRecorded,
}: {
  state: ReturnType<typeof useActivityContext>;
  requestId: string;
  runId: string;
  intent: ActivityAnalysisIntent | null;
  consumeIntent: (id: string) => void;
  enabled: boolean;
  onAuthorityLost: () => void;
  onRecorded: () => void;
}) => {
  const { t } = useLingui();
  const [owned] = useState(() =>
    intent?.kind === 'cancel' &&
    intent.requestId === requestId &&
    intent.runId === runId
      ? { id: runId, requestId, revision: intent.revision }
      : null,
  );
  const [frozen, setFrozen] = useState<ActivityAnalysisCommand | null>(null);
  const [receipt, setReceipt] = useState<ActivityAnalysisReceipt | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [message, setMessage] = useState('');
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const commands = useActivityAnalysisCommands({
    state,
    scope: `${runId}:${requestId}`,
    enabled,
    onAuthorityLost,
  });
  const retainsNavigation = useMemo(
    () =>
      activityQuestionRetainsNavigation(
        requestId,
        runId,
        'activityAnalysisCancel',
      ),
    [requestId, runId],
  );
  useDeliveryDraftStatus({
    dirty: frozen !== null,
    saving: commands.busy,
    retainsNavigation,
  });
  const execute = async (command: ActivityAnalysisCommand) => {
    const result = await commands.execute(command);
    if (result) {
      setReceipt(result);
      setFrozen(null);
      setRetryAllowed(false);
      setMessage(t`Cancellation was recorded. Usage may still be charged.`);
      onRecorded();
    } else
      setMessage(
        t`Cancellation could not be confirmed. Check this exact request before retrying.`,
      );
  };
  return (
    <section aria-label={t`Analysis cancellation`}>
      <StyledDeliveryStack>
        <h4>
          <Trans>Cancel this analysis</Trans>
        </h4>
        <p>
          <Trans>
            Cancellation prevents a pending answer from being published when
            possible. A request already sent to a model may still incur usage.
          </Trans>
        </p>
        {message && <p role="status">{message}</p>}
        {owned && frozen === null && receipt === null && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || commands.busy}
            onClick={() => {
              const command: ActivityAnalysisCommand = {
                kind: 'CANCELLED',
                input: owned,
              };
              setFrozen(command);
              setRetryAllowed(false);
              void execute(command);
            }}
          >
            <Trans>Confirm cancellation</Trans>
          </StyledDeliveryButton>
        )}
        {receipt === null && (!owned || frozen !== null) && (
          <>
            <p>
              <Trans>
                Check an earlier cancellation before taking another action.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy}
              onClick={async () => {
                setRetryAllowed(false);
                const result = await commands.check(
                  requestId,
                  runId,
                  'CANCELLED',
                  undefined,
                  owned !== null && frozen !== null,
                );
                if (result.kind === 'FOUND') {
                  setReceipt(result.receipt);
                  setFrozen(null);
                  setMessage(t`The saved cancellation was found.`);
                  onRecorded();
                } else if (result.kind === 'NOT_FOUND') {
                  setRetryAllowed(owned !== null && frozen !== null);
                  setMessage(
                    frozen
                      ? t`No saved cancellation was found. You may retry the exact cancellation.`
                      : t`No saved cancellation was found. Close this recovery view to review the current run.`,
                  );
                } else
                  setMessage(
                    t`Cancellation could not be checked. Keep this view open and check again.`,
                  );
              }}
            >
              <Trans>Check cancellation request</Trans>
            </StyledDeliveryButton>
          </>
        )}
        {retryAllowed && frozen !== null && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || commands.busy}
            onClick={() => void execute(frozen)}
          >
            <Trans>Retry exact cancellation</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
