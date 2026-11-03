import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryAtlasProductionAccessInput } from '~/generated-metadata/graphql';
import { type AtlasProduction } from '@/delivery/creative/atlas/atlas.types';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { StyledAtlasForm } from '@/delivery/creative/atlas/atlasStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
type AtlasProductionAccessFormProps = {
  opened: AtlasProduction;
  current: AtlasProduction | null;
  busy: boolean;
  onSave: (input: DeliveryAtlasProductionAccessInput) => Promise<boolean>;
  onClose: () => void;
  onReload: () => void;
};
export const AtlasProductionAccessForm = ({
  opened,
  current,
  busy,
  onSave,
  onClose,
  onReload,
}: AtlasProductionAccessFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const initial = {
    enabled: opened.enabled,
    roles: [...opened.roles],
    profileIds: [...opened.allowedProfileIds],
    dailyRunLimit: String(opened.dailyRunLimit),
  };
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  useDeliveryDraftStatus({
    dirty: JSON.stringify(values) !== JSON.stringify(initial),
    saving: busy || saving,
  });
  const stale =
    !current ||
    current.taskRevision !== opened.taskRevision ||
    current.settingsVersion !== opened.settingsVersion;
  const complete =
    values.roles.length > 0 &&
    /^\d+$/.test(values.dailyRunLimit) &&
    Number(values.dailyRunLimit) >= 1 &&
    Number(values.dailyRunLimit) <= 50 &&
    (!values.enabled || values.profileIds.length > 0);
  return (
    <StyledAtlasForm
      aria-label={t`Production media access`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!current?.canManageAccess || stale || !complete || busy || saving)
          return;
        setSaving(true);
        try {
          if (
            await onSave({
              taskId: opened.taskId,
              taskRevision: opened.taskRevision,
              ...values,
              dailyRunLimit: Number(values.dailyRunLimit),
            })
          )
            onClose();
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3>
        <Trans>Media access for this production</Trans>
      </h3>
      <p>
        <Trans>
          Enablement, access levels and the daily limit also apply to existing
          media tools for this production. Selecting Atlas models here preserves
          previously configured inspection models. Workspace restrictions still
          apply.
        </Trans>
      </p>
      <label>
        <input
          type="checkbox"
          checked={values.enabled}
          onChange={(event) =>
            setValues({ ...values, enabled: event.target.checked })
          }
        />
        <Trans>Enable media requests for this production</Trans>
      </label>
      <StyledDeliveryGrid>
        <label>
          <Trans>Allowed Atlas operations</Trans>
          <select
            aria-label={t`Allowed Atlas operations`}
            multiple
            value={values.profileIds}
            onChange={(event) =>
              setValues({
                ...values,
                profileIds: Array.from(
                  event.target.selectedOptions,
                  (option) => option.value,
                ),
              })
            }
          >
            {values.profileIds
              .filter(
                (id) => !opened.profiles.some((profile) => profile.id === id),
              )
              .map((id) => (
                <option key={id} value={id}>
                  {t`Saved operation unavailable`} · {id}
                </option>
              ))}
            {opened.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
                {!profile.enabled ? ` · ${t`Workspace access is paused`}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Trans>Allowed production access levels</Trans>
          <select
            aria-label={t`Allowed production access levels`}
            multiple
            value={values.roles}
            onChange={(event) =>
              setValues({
                ...values,
                roles: Array.from(
                  event.target.selectedOptions,
                  (option) => option.value,
                ),
              })
            }
          >
            <option value="ADMIN">{t`Administrator`}</option>
            <option value="MANAGER">{t`Production manager`}</option>
            <option value="MEMBER">{t`Assigned employee`}</option>
          </select>
        </label>
        <label>
          <Trans>Daily media request limit for this production (UTC)</Trans>
          <input
            aria-label={t`Daily media request limit for this production (UTC)`}
            type="number"
            min={1}
            max={50}
            value={values.dailyRunLimit}
            onChange={(event) =>
              setValues({ ...values, dailyRunLimit: event.target.value })
            }
          />
        </label>
      </StyledDeliveryGrid>
      {stale && (
        <p role="alert">
          <Trans>
            The production source changed. Your access choices are kept; reload
            before saving.
          </Trans>
        </p>
      )}
      <StyledDeliveryRow>
        <StyledDeliveryButton
          type="submit"
          disabled={
            stale || !current?.canManageAccess || !complete || busy || saving
          }
        >
          <Trans>Save production media access</Trans>
        </StyledDeliveryButton>
        {stale && (
          <StyledDeliveryButton
            type="button"
            onClick={() => requestAction(onReload)}
          >
            <Trans>Reload production access</Trans>
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
