import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type BusinessRecord } from '@/delivery/delivery-business.types';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';

type DeliveryInboxFormProps = {
  initialText: string;
  record: BusinessRecord;
  admin: boolean;
  busy: boolean;
  run: (input: Record<string, unknown>) => Promise<boolean>;
};
export const DeliveryInboxForm = ({
  initialText,
  record,
  admin,
  busy,
  run,
}: DeliveryInboxFormProps) => {
  const { t } = useLingui();
  const [notice, setNotice] = useState('');
  const draft = useDeliveryDraft({
    initialValues: { kind: 'DRAFT', text: initialText, sourceUrl: '' },
    revision: record.revision,
    busy,
  });
  const update = (field: keyof typeof draft.values, value: string) => {
    draft.update({ ...draft.values, [field]: value });
    setNotice('');
  };
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (draft.stale || draft.saving || !draft.dirty) return;
        draft.setSaving(true);
        setNotice('');
        try {
          if (
            await run({
              action: 'inboxEntry',
              id: record.id,
              revision: draft.revision,
              entryKind: draft.values.kind,
              text: draft.values.text,
              sourceUrl: draft.values.sourceUrl || null,
            })
          ) {
            draft.markSaved();
            setNotice(t`Saved inside OS. Nothing was sent to the client.`);
          }
        } finally {
          draft.setSaving(false);
        }
      }}
    >
      <StyledDeliveryStack>
        {draft.stale && (
          <DeliveryDraftConflict onReload={draft.reload} busy={draft.saving} />
        )}
        <fieldset disabled={draft.saving}>
          <StyledDeliveryStack>
            <label>
              <Trans>Entry type</Trans>
              <select
                value={draft.values.kind}
                onChange={(event) => update('kind', event.target.value)}
              >
                <option value="DRAFT">{t`Reply draft — not sent`}</option>
                {admin && (
                  <option value="INBOUND_NOTE">{t`Record an inbound note manually`}</option>
                )}
              </select>
            </label>
            <label>
              <Trans>Message</Trans>
              <textarea
                required
                maxLength={12000}
                value={draft.values.text}
                onChange={(event) => update('text', event.target.value)}
              />
            </label>
            <label>
              <Trans>Source link (optional)</Trans>
              <input
                type="url"
                value={draft.values.sourceUrl}
                onChange={(event) => update('sourceUrl', event.target.value)}
              />
            </label>
            {notice && <p role="status">{notice}</p>}
            <StyledDeliveryButton
              disabled={draft.saving || draft.stale || !draft.dirty}
            >
              <Trans>Save inside OS</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
      </StyledDeliveryStack>
    </form>
  );
};
