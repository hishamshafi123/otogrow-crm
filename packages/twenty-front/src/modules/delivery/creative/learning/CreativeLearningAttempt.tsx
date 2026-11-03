import { Link, useSearchParams } from 'react-router-dom';
import { creativeLearningDestination } from '@/delivery/creative/learning/creative-learning-navigation';
import { normalizeCreativeLearningCommand } from '@/delivery/creative/learning/creative-learning-command';
import { useState, type ReactNode } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  useCreativeLearningCommands,
  type CreativeLearningCommandAccess,
} from '@/delivery/creative/learning/useCreativeLearningCommands';
import {
  type CreativeLearningCommand,
  type CreativeLearningReceipt,
} from '@/delivery/creative/learning/creative-learning.types';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledLearningBoundary } from '@/delivery/creative/learning/creativeLearningStyles';
type CreativeLearningAttemptProps = {
  state: CreativeLearningCommandAccess;
  requestId: string;
  linkId: string;
  lessonId?: string;
  action: string;
  owned: boolean;
  enabled: boolean;
  onDenied: () => void;
  onSaved: (receipt: CreativeLearningReceipt) => void;
  children: (props: {
    execute: (command: CreativeLearningCommand) => Promise<void>;
    busy: boolean;
    locked: boolean;
  }) => ReactNode;
};
export const CreativeLearningAttempt = ({
  state,
  requestId,
  linkId,
  lessonId,
  action,
  owned,
  enabled,
  onDenied,
  onSaved,
  children,
}: CreativeLearningAttemptProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const [frozen, setFrozen] = useState<CreativeLearningCommand | null>(null),
    [receipt, setReceipt] = useState<CreativeLearningReceipt | null>(null),
    [retry, setRetry] = useState(false),
    [message, setMessage] = useState('');
  const commands = useCreativeLearningCommands({
    state,
    scope: `${linkId}:${requestId}`,
    enabled,
    onDenied,
  });
  useDeliveryDraftStatus({
    dirty: receipt === null && (owned || frozen !== null),
    saving: commands.busy,
  });
  const matches = (value: CreativeLearningReceipt) =>
    value.receipt.requestId === requestId &&
    value.receipt.linkId === linkId &&
    value.receipt.action === action &&
    (!lessonId || value.receipt.lessonId === lessonId);
  const accept = (value: CreativeLearningReceipt, matchedBody: boolean) => {
    if (!matches(value)) {
      setMessage(
        t`The saved receipt does not match this preparation. Keep this view open and check again.`,
      );
      return;
    }
    setReceipt(value);
    setFrozen(null);
    setRetry(false);
    setMessage(
      matchedBody
        ? t`The current saved request matches your submitted preparation. Refresh the saved evidence to see its current state.`
        : t`An earlier saved request was found. Open the recorded evidence to inspect what was saved; unsaved notes were not restored.`,
    );
    onSaved(value);
  };
  const execute = async (candidate: CreativeLearningCommand) => {
    const command = normalizeCreativeLearningCommand(candidate);
    setFrozen(command);
    setRetry(false);
    setMessage('');
    const result = await commands.execute(command);
    if (result.kind === 'FOUND') accept(result.receipt, true);
    else if (result.kind === 'REJECTED') {
      setFrozen(null);
      setMessage(result.message);
    } else if (result.kind === 'CONFLICT')
      setMessage(
        t`This request conflicts with a saved request or changed evidence. The submitted preparation is kept unchanged. Check its saved status; close and start a fresh preparation if the evidence must change.`,
      );
    else
      setMessage(
        t`The result is unconfirmed. Your submitted preparation is kept unchanged. Check its saved status before retrying.`,
      );
  };
  const check = async () => {
    setRetry(false);
    const result = await commands.check(requestId, frozen ?? undefined);
    if (result.kind === 'FOUND') accept(result.receipt, frozen !== null);
    else if (result.kind === 'NOT_FOUND') {
      setRetry(frozen !== null);
      setMessage(
        frozen
          ? t`No saved request was found. You can retry only the exact submitted preparation.`
          : t`No saved request was found. Unsaved preparation is no longer available. Close this view to begin again.`,
      );
    } else if (result.kind === 'CONFLICT')
      setMessage(
        t`A different preparation was recorded under this request. Your submitted notes were not confirmed. Do not retry a changed body; open the saved evidence or close this preparation and begin again.`,
      );
    else
      setMessage(
        t`The result could not be checked. Keep this view open and check again.`,
      );
  };
  return (
    <StyledDeliveryStack data-learning-request={requestId}>
      {(message || commands.error) && (
        <p role={commands.error ? 'alert' : 'status'}>
          {message || commands.error}
        </p>
      )}
      {!owned && !receipt && (
        <p>
          <Trans>
            This earlier preparation can check a saved request. It cannot
            reconstruct or send unsaved notes.
          </Trans>
        </p>
      )}
      {(!owned || frozen !== null) && !receipt && (
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || commands.busy}
            onClick={() => void check()}
          >
            <Trans>Check saved request</Trans>
          </StyledDeliveryButton>
          {retry && frozen && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy}
              onClick={() => void execute(frozen)}
            >
              <Trans>Retry exact submitted request</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
      )}
      {receipt && (
        <Link
          to={creativeLearningDestination(params, {
            learningLink: receipt.receipt.linkId,
            learningVersion: String(receipt.receipt.version),
            learningMode: null,
            learningRequest: null,
            learningLesson: receipt.receipt.lessonId ?? null,
          })}
        >
          {receipt.receipt.lessonId
            ? t`Open recorded lesson`
            : t`Open saved association`}
        </Link>
      )}
      {owned && receipt === null && (
        <StyledLearningBoundary
          hidden={!enabled}
          disabled={!enabled || commands.busy || frozen !== null}
          inert={!enabled || undefined}
        >
          {children({ execute, busy: commands.busy, locked: frozen !== null })}
        </StyledLearningBoundary>
      )}
    </StyledDeliveryStack>
  );
};
