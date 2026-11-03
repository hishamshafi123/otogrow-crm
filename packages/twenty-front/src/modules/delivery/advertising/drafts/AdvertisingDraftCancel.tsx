import { useLayoutEffect, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import {
  useAdvertisingDraftCommands,
  type AdvertisingDraftCommand,
} from '@/delivery/advertising/drafts/useAdvertisingDraftCommands';
import { type AdvertisingDraftReceipt } from '@/delivery/advertising/drafts/advertising-draft-types';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type CancelDeliveryAdvertisingDraftInput } from '~/generated-metadata/graphql';

export const AdvertisingDraftCancel = ({
  state,
  selection,
  scope,
  runId,
  requestId,
  revision,
  canCancel,
  intent,
  consumeIntent,
  enabled,
  onAuthorityLost,
  onChanged,
  onClose,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  scope: string;
  runId: string;
  requestId: string;
  revision: number;
  canCancel: boolean;
  intent: CancelDeliveryAdvertisingDraftInput | null;
  consumeIntent: (requestId: string) => void;
  enabled: boolean;
  onAuthorityLost: () => void;
  onChanged: () => Promise<unknown>;
  onClose: () => void;
}) => {
  const { t } = useLingui();
  const [opened] = useState(() =>
    intent?.requestId === requestId && intent.id === runId ? intent : null,
  );
  const [frozen, setFrozen] = useState<AdvertisingDraftCommand | null>(null);
  const [receipt, setReceipt] = useState<AdvertisingDraftReceipt | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [message, setMessage] = useState('');
  const commands = useAdvertisingDraftCommands({
    state,
    selection,
    scope: `${scope}:${requestId}`,
    enabled,
    onAuthorityLost,
  });
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  useDeliveryDraftStatus({ dirty: frozen !== null, saving: commands.busy });
  const current = opened !== null && opened.revision === revision && canCancel;
  const cancel = async (command: AdvertisingDraftCommand) => {
    const result = await commands.execute(command);
    if (!result) {
      setMessage(
        t`Cancellation could not be confirmed. Check this request before trying again.`,
      );
      return;
    }
    setReceipt(result);
    setFrozen(null);
    setRetryAllowed(false);
    setMessage(
      t`Cancellation was recorded. A provider request already sent may still have a cost.`,
    );
    await onChanged().catch(() => undefined);
  };
  const check = async () => {
    setRetryAllowed(false);
    const result = await commands.check(
      requestId,
      runId,
      'CANCELLED',
      undefined,
      frozen !== null,
    );
    if (result.kind === 'FOUND') {
      setReceipt(result.receipt);
      setFrozen(null);
      setMessage(t`The saved cancellation was found.`);
      await onChanged().catch(() => undefined);
    } else if (result.kind === 'NOT_FOUND') {
      setRetryAllowed(frozen !== null);
      setMessage(
        frozen
          ? t`No saved cancellation was found. You may retry the same cancellation while the run is still eligible.`
          : t`No saved cancellation was found. Close this view and review the current run before cancelling.`,
      );
    } else
      setMessage(
        t`Cancellation could not be checked. Keep this view open and check again.`,
      );
  };
  return (
    <section
      aria-label={t`Cancel AI suggestion run`}
      data-advertising-draft-cancel-request-id={requestId}
    >
      <StyledDeliveryStack>
        <h5>
          <Trans>Cancel this suggestion run?</Trans>
        </h5>
        <p>
          <Trans>
            Cancellation prevents further local work. It cannot recall a request
            already sent to the provider or promise a refund; unresolved
            exposure stays recorded.
          </Trans>
        </p>
        {message && <p role="status">{message}</p>}
        {opened && frozen === null && receipt === null && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || commands.busy || !current}
            onClick={() => {
              const command: AdvertisingDraftCommand = {
                kind: 'CANCELLED',
                input: opened,
              };
              setFrozen(command);
              void cancel(command);
            }}
          >
            <Trans>Confirm cancellation</Trans>
          </StyledDeliveryButton>
        )}
        {(opened === null || frozen !== null) && receipt === null && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || commands.busy}
            onClick={() => void check()}
          >
            <Trans>Check saved cancellation</Trans>
          </StyledDeliveryButton>
        )}
        {retryAllowed && frozen && current && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || commands.busy}
            onClick={() => void cancel(frozen)}
          >
            <Trans>Retry this exact cancellation</Trans>
          </StyledDeliveryButton>
        )}
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="button"
            disabled={commands.busy}
            onClick={onClose}
          >
            <Trans>Close cancellation</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
