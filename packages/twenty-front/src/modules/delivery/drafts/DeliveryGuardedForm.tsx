import { useState, type ReactNode } from 'react';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';

type DeliveryGuardedFormProps = {
  children: ReactNode;
  revision: number;
  snapshot?: string;
  busy: boolean;
  disabled?: boolean;
  visible?: boolean;
  onSave: (data: FormData, revision: number) => Promise<boolean>;
};

export const DeliveryGuardedForm = ({
  children,
  revision,
  snapshot = String(revision),
  busy,
  disabled = false,
  visible = true,
  onSave,
}: DeliveryGuardedFormProps) => {
  const [openedRevision, setOpenedRevision] = useState(revision);
  const [openedSnapshot, setOpenedSnapshot] = useState(snapshot);
  const [resetVersion, setResetVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const draft = useDeliveryNativeDraft({
    extraValues: null,
    busy: busy || saving,
  });
  const { requestAction } = useDeliveryDraftGuard();
  const stale = openedRevision !== revision || openedSnapshot !== snapshot;
  const reload = () => {
    setOpenedRevision(revision);
    setOpenedSnapshot(snapshot);
    setResetVersion((previous) => previous + 1);
  };
  if (stale && !draft.dirty && !busy && !saving) reload();
  if (!visible && !draft.dirty && !saving) return null;
  return (
    <form
      key={resetVersion}
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || saving || stale || disabled || !visible) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        setSaving(true);
        try {
          if (await onSave(data, openedRevision)) {
            form.reset();
            draft.resetFormBaseline(form);
          }
        } finally {
          setSaving(false);
        }
      }}
    >
      {stale && draft.dirty && (
        <DeliveryDraftConflict
          onReload={() => requestAction(reload)}
          busy={busy || saving}
        />
      )}
      <fieldset disabled={busy || saving || disabled || stale || !visible}>
        {children}
      </fieldset>
    </form>
  );
};
