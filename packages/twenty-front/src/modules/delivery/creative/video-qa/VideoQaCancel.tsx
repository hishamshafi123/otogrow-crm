import { useCallback, useLayoutEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useVideoQaAccess } from '@/delivery/creative/video-qa/useVideoQaAccess';
import { useVideoQaCommands } from '@/delivery/creative/video-qa/useVideoQaCommands';
import {
  type VideoQaIntent,
  type VideoQaCommand,
} from '@/delivery/creative/video-qa/video-qa.types';
import {
  videoQaDestination,
  retainsVideoQaCancellation,
} from '@/delivery/creative/video-qa/video-qa-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
export const VideoQaCancel = ({
  access,
  taskId,
  runId,
  requestId,
  intent,
  consumeIntent,
  enabled,
  canCancel,
  onDenied,
  onSaved,
}: {
  access: ReturnType<typeof useVideoQaAccess>;
  taskId: string;
  runId: string;
  requestId: string;
  intent: VideoQaIntent | null;
  consumeIntent: (id: string) => void;
  enabled: boolean;
  canCancel: boolean;
  onDenied: () => void;
  onSaved: () => Promise<unknown>;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const [owned] = useState(
    () =>
      intent?.kind === 'CANCEL' &&
      intent.taskId === taskId &&
      intent.runId === runId &&
      intent.requestId === requestId,
  );
  useLayoutEffect(() => consumeIntent(requestId), [requestId, consumeIntent]);
  const [frozen, setFrozen] = useState<VideoQaCommand | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [retry, setRetry] = useState(false);
  const [message, setMessage] = useState('');
  const commands = useVideoQaCommands({ access, taskId, enabled, onDenied });
  const retention = useCallback(retainsVideoQaCancellation, []);
  useDeliveryDraftStatus({
    retainsNavigation: retention,
    dirty: !saved && (frozen !== null || confirmed),
    saving: commands.busy,
  });
  const accept = async () => {
    setSaved(true);
    setFrozen(null);
    setRetry(false);
    setMessage(
      t`The cancellation was recorded. Provider usage already incurred may still be charged.`,
    );
    await onSaved().catch(() => undefined);
  };
  const execute = async (command: VideoQaCommand) => {
    if (!enabled || !canCancel) return;
    setFrozen(command);
    setRetry(false);
    const result = await commands.execute(command);
    if (result.kind === 'FOUND') await accept();
    else if (result.kind === 'REJECTED') {
      setFrozen(null);
      setMessage(result.message);
    } else
      setMessage(
        t`The cancellation is unconfirmed. Check the saved cancellation before trying again.`,
      );
  };
  return (
    <section aria-label={t`Cancel video inspection`}>
      <StyledDeliveryStack>
        <h4>
          <Trans>Cancel this video inspection</Trans>
        </h4>
        <p>
          <Trans>
            Cancellation stops publication where possible. Work already
            dispatched can still incur a charge.
          </Trans>
        </p>
        {(message || commands.error) && (
          <p role="status">{message || commands.error}</p>
        )}
        {!saved && (!owned || frozen !== null) && (
          <>
            <p>
              <Trans>
                This link checks the original cancellation. An earlier unsaved
                command is never reconstructed.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy}
              onClick={async () => {
                setRetry(false);
                const result = await commands.check(requestId, 'CANCEL', runId);
                if (result.kind === 'FOUND') await accept();
                else if (result.kind === 'NOT_FOUND') {
                  setRetry(frozen !== null);
                  setMessage(
                    frozen
                      ? t`No cancellation was found. You may retry the original cancellation while the run remains cancellable.`
                      : t`No cancellation was found. Close this view and review the current run before starting a new cancellation.`,
                  );
                } else
                  setMessage(
                    t`The saved cancellation could not be verified. Keep this view open and check again.`,
                  );
              }}
            >
              <Trans>Check saved cancellation</Trans>
            </StyledDeliveryButton>
            {retry && frozen !== null && canCancel && (
              <StyledDeliveryButton
                type="button"
                disabled={!enabled || commands.busy}
                onClick={() => void execute(frozen)}
              >
                <Trans>Retry exact cancellation</Trans>
              </StyledDeliveryButton>
            )}
          </>
        )}
        {owned && frozen === null && !saved && (
          <>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!enabled || commands.busy || !canCancel}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
              />
              <Trans>I want to cancel publication of this inspection.</Trans>
            </label>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy || !canCancel || !confirmed}
              onClick={() =>
                void execute({
                  kind: 'CANCEL',
                  input: { taskId, runId, requestId },
                })
              }
            >
              <Trans>Confirm inspection cancellation</Trans>
            </StyledDeliveryButton>
          </>
        )}
        <Link to={videoQaDestination(params, { creativeQaCancel: null })}>
          <Trans>Close cancellation</Trans>
        </Link>
      </StyledDeliveryStack>
    </section>
  );
};
