import { useCallback, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryAtlasSettingsInput } from '~/generated-metadata/graphql';
import { type AtlasSettings } from '@/delivery/creative/atlas/atlas.types';
import {
  parseFinanceAmountMicros,
  financeAmountMicrosToDecimal,
} from '@/delivery/finance/finance-money';
import {
  useDeliveryDraftStatus,
  useDeliveryDraftGuard,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledAtlasForm,
  StyledAtlasProfile,
} from '@/delivery/creative/atlas/atlasStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { useAtlasLabels } from '@/delivery/creative/atlas/useAtlasLabels';
import { AtlasProfileReadiness } from '@/delivery/creative/atlas/AtlasProfileReadiness';
type AtlasSettingsFormProps = {
  opened: AtlasSettings;
  current: AtlasSettings | null;
  busy: boolean;
  onSave: (input: DeliveryAtlasSettingsInput) => Promise<boolean>;
  onClose: () => void;
  onReload: () => void;
};
const initialValues = (opened: AtlasSettings) => ({
  enabled: opened.enabled,
  enabledProfileIds: [...opened.enabledProfileIds],
  defaultImageFamilyId: opened.defaultImageFamilyId ?? '',
  defaultClipProfileId: opened.defaultClipProfileId ?? '',
  limits: opened.profiles.map((profile) => {
    const saved = opened.reservationLimits.find(
      (limit) => limit.profileId === profile.id,
    );
    return {
      profileId: profile.id,
      maximumCostUsd: saved?.maximumCostUsd ?? '',
      source: saved?.source ?? '',
      verifiedAt: saved?.verifiedAt ?? '',
    };
  }),
});
export const AtlasSettingsForm = ({
  opened,
  current,
  busy,
  onSave,
  onClose,
  onReload,
}: AtlasSettingsFormProps) => {
  const { t } = useLingui();
  const labels = useAtlasLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [values, setValues] = useState(() => initialValues(opened));
  const [catalogOpen, setCatalogOpen] = useState(
    opened.enabledProfileIds.length === 0,
  );
  const [saving, setSaving] = useState(false);
  const focusEditor = useCallback((element: HTMLFormElement | null) => {
    element?.focus();
    element?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const stale = current?.revision !== opened.revision;
  useDeliveryDraftStatus({
    dirty: JSON.stringify(values) !== JSON.stringify(initialValues(opened)),
    saving: saving || busy,
  });
  const enabled = (id: string | null | undefined) =>
    id != null && values.enabledProfileIds.includes(id);
  const validFamily =
    !values.defaultImageFamilyId ||
    opened.families.some(
      (family) =>
        family.id === values.defaultImageFamilyId &&
        (enabled(family.textToImageProfileId) ||
          enabled(family.imageEditProfileId)),
    );
  const validClip =
    !values.defaultClipProfileId ||
    opened.profiles.some(
      (profile) =>
        profile.id === values.defaultClipProfileId &&
        profile.kind === 'CLIP' &&
        profile.operation === 'IMAGE_TO_VIDEO' &&
        enabled(profile.id),
    );
  const unknownProfiles = values.enabledProfileIds.filter(
    (id) => !opened.profiles.some((profile) => profile.id === id),
  );
  const hasEvidence = (limit: (typeof values.limits)[number]) =>
    limit.maximumCostUsd !== '' ||
    limit.source !== '' ||
    limit.verifiedAt !== '';
  const validLimit = (limit: (typeof values.limits)[number]) => {
    const amount = parseFinanceAmountMicros(limit.maximumCostUsd);
    return (
      amount !== null &&
      BigInt(amount) > 0n &&
      limit.source.trim() !== '' &&
      Number.isFinite(Date.parse(limit.verifiedAt))
    );
  };
  const validLimits = values.limits.every(
    (limit) =>
      (!enabled(limit.profileId) && !hasEvidence(limit)) || validLimit(limit),
  );
  const complete =
    validFamily &&
    validClip &&
    validLimits &&
    unknownProfiles.length === 0 &&
    (!values.enabled || values.enabledProfileIds.length > 0);
  const updateLimit = (
    id: string,
    change: Partial<(typeof values.limits)[number]>,
  ) =>
    setValues({
      ...values,
      limits: values.limits.map((limit) =>
        limit.profileId === id ? { ...limit, ...change } : limit,
      ),
    });
  return (
    <StyledAtlasForm
      aria-label={t`Media model access and defaults`}
      tabIndex={-1}
      ref={focusEditor}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!current || stale || busy || saving || !complete) return;
        setSaving(true);
        try {
          const saved = await onSave({
            revision: opened.revision,
            enabled: values.enabled,
            enabledProfileIds: values.enabledProfileIds,
            defaultImageFamilyId: values.defaultImageFamilyId || null,
            defaultClipProfileId: values.defaultClipProfileId || null,
            reservationLimits: values.limits
              .filter((limit) => limit.maximumCostUsd !== '')
              .map((limit) => ({
                ...limit,
                maximumCostUsd: financeAmountMicrosToDecimal(
                  parseFinanceAmountMicros(limit.maximumCostUsd)!,
                ),
                source: limit.source.trim(),
              })),
          });
          if (saved) onClose();
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3>
        <Trans>Workspace media access and defaults</Trans>
      </h3>
      <label>
        <input
          type="checkbox"
          checked={values.enabled}
          onChange={(event) =>
            setValues({ ...values, enabled: event.target.checked })
          }
        />
        <Trans>Allow new Atlas generation requests</Trans>
      </label>
      <p role="status">
        {t`Current saved connection`}:{' '}
        {opened.keyConfigured
          ? labels.verification(opened.verificationStatus)
          : t`API key needed`}
        {' · '}
        {opened.enabled
          ? t`Workspace requests allowed; model and spending checks still apply.`
          : t`Workspace requests paused.`}
      </p>
      <p>
        <Trans>
          Defaults apply to new requests only. Existing drafts and submitted
          jobs keep their exact selected model and parameters. Pausing stops new
          dispatch; existing provider requests may still incur charges.
        </Trans>
      </p>
      <StyledDeliveryGrid>
        <label>
          <Trans>Default image family</Trans>
          <select
            aria-label={t`Default image family`}
            value={values.defaultImageFamilyId}
            onChange={(event) =>
              setValues({ ...values, defaultImageFamilyId: event.target.value })
            }
          >
            <option value="">{t`Unset — choose for each new request`}</option>
            {!validFamily && (
              <option
                value={values.defaultImageFamilyId}
              >{t`Saved image default unavailable`}</option>
            )}
            {opened.families
              .filter(
                (family) =>
                  enabled(family.textToImageProfileId) ||
                  enabled(family.imageEditProfileId),
              )
              .map((family) => (
                <option key={family.id} value={family.id}>
                  {family.label}
                </option>
              ))}
          </select>
        </label>
        <label>
          <Trans>Default image-to-video model</Trans>
          <select
            aria-label={t`Default image-to-video model`}
            value={values.defaultClipProfileId}
            onChange={(event) =>
              setValues({ ...values, defaultClipProfileId: event.target.value })
            }
          >
            <option value="">{t`Unset — choose for each new request`}</option>
            {!validClip && (
              <option
                value={values.defaultClipProfileId}
              >{t`Saved video default unavailable`}</option>
            )}
            {opened.profiles
              .filter(
                (profile) =>
                  profile.kind === 'CLIP' &&
                  profile.operation === 'IMAGE_TO_VIDEO' &&
                  enabled(profile.id),
              )
              .map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
          </select>
        </label>
      </StyledDeliveryGrid>
      {(!validFamily || !validClip) && (
        <p role="alert">
          <Trans>
            A saved default is no longer permitted. Explicitly choose another
            default or leave it unset; no fallback is selected automatically.
          </Trans>
        </p>
      )}
      <details
        open={catalogOpen}
        onToggle={(event) => setCatalogOpen(event.currentTarget.open)}
      >
        <summary>
          <Trans>Permitted model operations and reservation evidence</Trans> ·{' '}
          {values.enabledProfileIds.length}
        </summary>
        <StyledDeliveryStack>
          <p>
            <Trans>
              Only supported catalog operations are listed. An allowed model can
              still be blocked by connection, pricing, budget or production
              access. Maximum reservation is an OS spending hold, not a
              guaranteed upper limit on the provider’s bill.
            </Trans>
          </p>
          {unknownProfiles.map((id) => (
            <StyledAtlasProfile key={id}>
              <p>
                <Trans>
                  A saved model operation is no longer in the supported catalog.
                </Trans>
              </p>
              <code>{id}</code>
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  setValues({
                    ...values,
                    enabledProfileIds: values.enabledProfileIds.filter(
                      (value) => value !== id,
                    ),
                  })
                }
              >
                <Trans>Remove unavailable operation</Trans>
              </StyledDeliveryButton>
            </StyledAtlasProfile>
          ))}
          {opened.profiles.map((profile) => {
            const limit = values.limits.find(
              (item) => item.profileId === profile.id,
            )!;
            const touched = hasEvidence(limit);
            return (
              <StyledAtlasProfile key={profile.id} aria-label={profile.label}>
                <label>
                  <input
                    type="checkbox"
                    checked={enabled(profile.id)}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        enabledProfileIds: event.target.checked
                          ? [...values.enabledProfileIds, profile.id]
                          : values.enabledProfileIds.filter(
                              (id) => id !== profile.id,
                            ),
                      })
                    }
                  />
                  {profile.label}
                </label>
                <small>
                  {labels.operation(profile.operation)} ·{' '}
                  {profile.maximumReferences === 0
                    ? t`No reference image needed`
                    : profile.maximumReferences === 1
                      ? t`One approved image required`
                      : t`Up to ${profile.maximumReferences} approved images`}
                </small>
                <small>
                  {validLimit(limit)
                    ? t`Reservation USD ${limit.maximumCostUsd} · Evidence recorded`
                    : enabled(profile.id) || touched
                      ? t`Reservation evidence needs review`
                      : t`No reservation evidence recorded`}
                </small>
                <AtlasProfileReadiness profile={profile} />
                {(enabled(profile.id) || touched) && (
                  <StyledDeliveryGrid>
                    <label>
                      {t`Maximum reservation in USD for ${profile.label}`}
                      <input
                        aria-label={t`Maximum reservation in USD for ${profile.label}`}
                        inputMode="decimal"
                        value={limit.maximumCostUsd}
                        onChange={(event) =>
                          updateLimit(profile.id, {
                            maximumCostUsd: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t`Pricing evidence for ${profile.label}`}
                      <textarea
                        aria-label={t`Pricing evidence for ${profile.label}`}
                        maxLength={2000}
                        value={limit.source}
                        onChange={(event) =>
                          updateLimit(profile.id, {
                            source: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t`Evidence verified at UTC for ${profile.label}`}
                      <input
                        aria-label={t`Evidence verified at UTC for ${profile.label}`}
                        type="datetime-local"
                        value={limit.verifiedAt.slice(0, 16)}
                        onChange={(event) =>
                          updateLimit(profile.id, {
                            verifiedAt: event.target.value
                              ? `${event.target.value}:00.000Z`
                              : '',
                          })
                        }
                      />
                    </label>
                  </StyledDeliveryGrid>
                )}
              </StyledAtlasProfile>
            );
          })}
        </StyledDeliveryStack>
      </details>
      {!validLimits && (
        <p role="status">
          <Trans>
            Each selected operation needs a positive exact USD reservation,
            pricing evidence and a verification date. Partial evidence must be
            completed before saving.
          </Trans>
        </p>
      )}
      {stale && (
        <p role="alert">
          <Trans>
            The workspace configuration changed. Your choices are kept; reload
            before saving.
          </Trans>
        </p>
      )}
      <StyledDeliveryRow>
        <StyledDeliveryButton
          type="submit"
          disabled={!current || stale || busy || saving || !complete}
        >
          <Trans>Save media access and defaults</Trans>
        </StyledDeliveryButton>
        {stale && (
          <StyledDeliveryButton
            type="button"
            onClick={() => requestAction(onReload)}
          >
            <Trans>Reload current configuration</Trans>
          </StyledDeliveryButton>
        )}
        <StyledDeliveryButton
          type="button"
          onClick={() => requestAction(onClose)}
        >
          <Trans>Cancel</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
    </StyledAtlasForm>
  );
};
