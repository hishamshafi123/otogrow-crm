import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryFinancePaymentsQuery,
  type DeliveryFinanceReverseRelationInput,
} from '~/generated-metadata/graphql';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ReconciliationReverseFormProps = {
  relation: DeliveryFinancePaymentsQuery['deliveryFinancePayments']['matches'][number];
  canManage: boolean;
  busy: boolean;
  editing: boolean;
  onReverse: (input: DeliveryFinanceReverseRelationInput) => Promise<boolean>;
};
export const ReconciliationReverseForm = ({
  relation,
  canManage,
  busy,
  editing,
  onReverse,
}: ReconciliationReverseFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [reason, setReason] = useState('');
  const [openedRevision, setOpenedRevision] = useState(relation.revision);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useDeliveryDraftStatus({ dirty: reason.length > 0, saving: busy || saving });
  const stale = openedRevision !== relation.revision;
  if (!reason && stale) setOpenedRevision(relation.revision);
  const available = canManage && relation.canReverse;
  const disabled = !available || busy || saving || editing || stale;
  const reset = () => {
    setReason('');
    setError('');
    setOpenedRevision(relation.revision);
  };
  if (!available && !reason) return null;
  return (
    <details>
      <summary>{t`Reverse this link`}</summary>
      <StyledDeliveryStack>
        {!available && (
          <p role="status">
            <Trans>
              Reversal is unavailable. Your unsaved reason is retained; you can
              discard it or wait for editing access.
            </Trans>
          </p>
        )}
        {stale && reason && (
          <DeliveryDraftConflict
            busy={busy || saving || !available}
            onReload={() => requestAction(reset)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        <form
          aria-label={t`Reverse payment link`}
          onSubmit={async (event) => {
            event.preventDefault();
            if (disabled || !reason.trim()) return;
            setSaving(true);
            setError('');
            try {
              const saved = await onReverse({
                id: relation.id,
                kind: relation.kind,
                revision: openedRevision,
                reason: reason.trim(),
              });
              if (saved) reset();
              else
                setError(
                  t`This reversal was not confirmed. Your reason is kept; refresh the source before retrying.`,
                );
            } catch {
              setError(t`The link could not be reversed. Your reason is kept.`);
            } finally {
              setSaving(false);
            }
          }}
        >
          <fieldset disabled={disabled}>
            <StyledDeliveryStack>
              <label>
                <Trans>Reason for reversing this link</Trans>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  maxLength={2000}
                />
              </label>
              <p>
                <Trans>
                  This changes the link only. Cash movements and posted monthly
                  revenue or costs remain recorded.
                </Trans>
              </p>
              <StyledDeliveryButton type="submit">
                <Trans>Reverse link and retain history</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </fieldset>
        </form>
        {reason && (
          <StyledDeliveryRow>
            <StyledDeliveryButton
              disabled={busy || saving}
              onClick={() => requestAction(reset)}
            >
              <Trans>Discard reversal draft</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        )}
      </StyledDeliveryStack>
    </details>
  );
};
