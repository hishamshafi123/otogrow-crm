import { useCallback, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryAtlasSettingsInput } from '~/generated-metadata/graphql';
import { type AtlasSettings } from '@/delivery/creative/atlas/atlas.types';
import { atlasSettingsInput } from '@/delivery/creative/atlas/atlas-settings-input';
import {
  useDeliveryDraftStatus,
  useDeliveryDraftGuard,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { StyledAtlasForm } from '@/delivery/creative/atlas/atlasStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
type AtlasConnectionFormProps = {
  opened: AtlasSettings;
  current: AtlasSettings | null;
  busy: boolean;
  onSave: (input: DeliveryAtlasSettingsInput) => Promise<boolean>;
  onClose: () => void;
  onReload: () => void;
};
export const AtlasConnectionForm = ({
  opened,
  current,
  busy,
  onSave,
  onClose,
  onReload,
}: AtlasConnectionFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const focusEditor = useCallback((element: HTMLFormElement | null) => {
    element?.focus();
    element?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const stale = current?.revision !== opened.revision;
  useDeliveryDraftStatus({ dirty: apiKey !== '', saving: saving || busy });
  return (
    <StyledAtlasForm
      aria-label={t`Atlas API key`}
      tabIndex={-1}
      ref={focusEditor}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!current || stale || saving || busy || !apiKey.trim()) return;
        setSaving(true);
        try {
          if (
            await onSave({
              ...atlasSettingsInput(opened),
              apiKey: apiKey.trim(),
            })
          ) {
            setApiKey('');
            onClose();
          }
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3>
        {opened.keyConfigured
          ? t`Replace Atlas API key`
          : t`Save Atlas API key`}
      </h3>
      <p>
        <Trans>
          The key is stored encrypted and is never returned to this screen.
          Saving it does not verify the connection or start generation. Ordinary
          rotation preserves accepted jobs’ recorded credential version.
        </Trans>
      </p>
      <label>
        <Trans>New Atlas API key</Trans>
        <input
          aria-label={t`New Atlas API key`}
          type="password"
          autoComplete="new-password"
          value={apiKey}
          maxLength={2000}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      {stale && (
        <p role="alert">
          <Trans>
            The media configuration changed. Your key input is kept; reload the
            current configuration before saving.
          </Trans>
        </p>
      )}
      <StyledDeliveryRow>
        <StyledDeliveryButton
          type="submit"
          disabled={!current || stale || saving || busy || !apiKey.trim()}
        >
          <Trans>Save API key</Trans>
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
