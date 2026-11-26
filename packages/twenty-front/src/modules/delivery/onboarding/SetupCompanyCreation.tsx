import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type useClientSetup } from '@/delivery/onboarding/useClientSetup';
import { useSetupCompanyCreation } from '@/delivery/onboarding/useSetupCompanyCreation';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type SetupCompanyCreationProps = {
  state: ReturnType<typeof useClientSetup>;
  recoveryId: string | null;
  onSelected: (id: string) => void;
  onRecoveryChecked: () => void;
  onCancel?: () => void;
};
export const SetupCompanyCreation = ({
  state,
  recoveryId,
  onSelected,
  onRecoveryChecked,
  onCancel,
}: SetupCompanyCreationProps) => {
  const { t } = useLingui();
  const native = useSetupCompanyCreation(state);
  const { recordSetupRecoveryId } = useDeliveryDraftGuard();
  const [name, setName] = useState('');
  const [attempt, setAttempt] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [outcome, setOutcome] = useState<Awaited<
    ReturnType<typeof state.checkCompany>
  > | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const id = attempt?.id ?? recoveryId;
  const locked = id !== null && !editing;
  useDeliveryDraftStatus({
    dirty: (name !== '' || attempt !== null) && outcome?.kind !== 'FOUND',
    saving: native.busy || checking,
  });
  const check = async () => {
    if (!id) return;
    setChecking(true);
    try {
      const result = await state.checkCompany(id);
      setOutcome(result);
      if (result.kind === 'FOUND') {
        setEditing(false);
        onRecoveryChecked();
      }
    } finally {
      setChecking(false);
    }
  };
  const submit = async (prepared: { id: string; name: string }) => {
    if (!recordSetupRecoveryId('company', prepared.id)) {
      setError(
        t`The recovery link could not be recorded. No company was created; keep your inputs and try again.`,
      );
      return;
    }
    setAttempt(prepared);
    setEditing(false);
    setError('');
    setOutcome(null);
    const result = await native.create(prepared);
    setOutcome(result);
    if (result.kind === 'FOUND') onRecoveryChecked();
  };
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h3>
          <Trans>Create a client company</Trans>
        </h3>
        <p>
          <Trans>
            This saves a CRM company separately. The project, service plan and
            optional first task remain unsaved until final review.
          </Trans>
        </p>
        {!native.allowed && (
          <p role="status">
            <Trans>
              Your current Company permissions do not permit creation. Choose an
              existing company or ask an administrator to review your CRM
              permissions.
            </Trans>
          </p>
        )}
        <label>
          <Trans>Company name</Trans>
          <input
            aria-label={t`Company name`}
            placeholder={t`e.g. Acme Studio`}
            maxLength={200}
            value={name}
            disabled={locked || !native.allowed || native.busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {!id && (
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              data-primary="true"
              disabled={
                !native.allowed || !name.trim() || native.busy || checking
              }
              onClick={async () => {
                const prepared = {
                  id: crypto.randomUUID(),
                  name: name.trim(),
                };
                await submit(prepared);
              }}
            >
              <Trans>Create company</Trans>
            </StyledDeliveryButton>
            {onCancel && (
              <StyledDeliveryButton
                type="button"
                disabled={native.busy || checking}
                onClick={onCancel}
              >
                <Trans>Cancel</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        )}
        {error && <p role="alert">{error}</p>}
        {id && (
          <>
            <small>
              {t`Company recovery ID`}: {id}
            </small>
            {outcome?.kind !== 'FOUND' && (
              <>
                <p role="status">
                  <Trans>
                    The company outcome is not confirmed. Check this exact ID
                    before preparing another company; an optimistic result is
                    not proof of a saved record.
                  </Trans>
                </p>
                <StyledDeliveryButton
                  type="button"
                  disabled={
                    checking ||
                    native.busy ||
                    state.busy ||
                    !state.permission.manager
                  }
                  onClick={() => void check()}
                >
                  <Trans>Check company request</Trans>
                </StyledDeliveryButton>
              </>
            )}
            {outcome?.kind === 'NOT_FOUND' && (
              <p>
                <Trans>
                  No company was found at this ID in the fresh authorized check.
                  This does not start another create request.
                </Trans>
              </p>
            )}
            {outcome?.kind === 'NOT_FOUND' && attempt && !editing && (
              <StyledDeliveryButton
                type="button"
                data-primary="true"
                disabled={!native.allowed || checking || native.busy}
                onClick={() => void submit(attempt)}
              >
                <Trans>Retry the same company request</Trans>
              </StyledDeliveryButton>
            )}
            {outcome?.kind === 'NOT_FOUND' && !attempt && (
              <p>
                <Trans>
                  The original company name is not stored in this link. Any
                  deliberate retry keeps this same company ID to prevent
                  duplicates.
                </Trans>
              </p>
            )}
            {outcome?.kind === 'NOT_FOUND' && (
              <StyledDeliveryButton
                type="button"
                disabled={checking || native.busy}
                onClick={() => setEditing(true)}
              >
                <Trans>Edit company name with this same recovery ID</Trans>
              </StyledDeliveryButton>
            )}
            {editing && (
              <StyledDeliveryButton
                type="button"
                data-primary="true"
                disabled={
                  !native.allowed || !name.trim() || checking || native.busy
                }
                onClick={() => void submit({ id, name: name.trim() })}
              >
                <Trans>Submit this same company request</Trans>
              </StyledDeliveryButton>
            )}
            {outcome?.kind === 'FOUND' && (
              <>
                <strong>
                  {t`Saved company found`}: {outcome.company.name}
                </strong>
                {attempt && outcome.company.name !== attempt.name && (
                  <p role="alert">{t`Your prepared name was ${attempt.name}. The current saved company is named ${outcome.company.name}. Review this difference before choosing the saved company.`}</p>
                )}
                <p>
                  <Trans>
                    The company is saved. Continue only after reviewing its
                    current name; client delivery setup is still separate.
                  </Trans>
                </p>
                <StyledDeliveryRow>
                  <StyledDeliveryButton
                    type="button"
                    data-primary="true"
                    onClick={() => onSelected(outcome.company.id)}
                  >
                    <Trans>Use this saved company</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
              </>
            )}
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
