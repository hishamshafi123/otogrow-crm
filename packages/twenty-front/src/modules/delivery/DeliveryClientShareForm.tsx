import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ClientEngagement } from '@/delivery/delivery-clients.types';
import { type DeliveryTask } from '@/delivery/delivery.types';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';

type DeliveryClientShareFormProps = {
  engagement: ClientEngagement;
  tasks: DeliveryTask[];
  busy: boolean;
  run: (input: Record<string, unknown>) => Promise<boolean>;
};
export const DeliveryClientShareForm = ({
  engagement,
  tasks,
  busy,
  run,
}: DeliveryClientShareFormProps) => {
  const { t } = useLingui();
  const [selected, setSelected] = useState<DeliveryTask | null>(null);
  const [saving, setSaving] = useState(false);
  const { requestAction } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({ dirty: selected !== null, saving: busy || saving });
  const current = tasks.find(
    (task) =>
      task.id === selected?.id && task.projectId === engagement.projectId,
  );
  const stale = Boolean(
    selected && (!current || current.revision !== selected.revision),
  );
  return (
    <StyledDeliveryStack>
      <h3>
        <Trans>Share an approved version</Trans>
      </h3>
      {stale && (
        <div role="alert">
          <p>
            <Trans>
              The selected task changed. Review the latest version before
              sharing it with the client.
            </Trans>
          </p>
          <StyledDeliveryButton
            disabled={busy || saving || !current}
            onClick={() => requestAction(() => setSelected(current ?? null))}
          >
            <Trans>Reload selected version</Trans>
          </StyledDeliveryButton>
        </div>
      )}
      <label>
        <Trans>Task</Trans>
        <select
          disabled={busy || saving}
          value={selected?.id ?? ''}
          onChange={(event) =>
            setSelected(
              tasks.find(
                (task) =>
                  task.id === event.target.value &&
                  task.projectId === engagement.projectId,
              ) ?? null,
            )
          }
        >
          <option value="">{t`Choose a task`}</option>
          {tasks
            .filter((task) => task.projectId === engagement.projectId)
            .map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <small>
          {t`Selected task version`}: {selected.revision}
        </small>
      )}
      {(['BRIEF', 'SUBMISSION'] as const).map((kind) => {
        const eligible =
          selected &&
          (kind === 'BRIEF'
            ? Boolean(selected.details.creative) &&
              selected.details.creative?.approvedBriefVersion ===
                selected.details.creative?.briefVersion
            : selected.details.state === 'APPROVED');
        return (
          <StyledDeliveryButton
            key={kind}
            disabled={!eligible || stale || busy || saving}
            onClick={async () => {
              if (!selected || !eligible || stale || busy || saving) return;
              setSaving(true);
              try {
                if (
                  await run({
                    action: 'share',
                    engagementId: engagement.id,
                    taskId: selected.id,
                    revision: selected.revision,
                    kind,
                  })
                )
                  setSelected(null);
              } finally {
                setSaving(false);
              }
            }}
          >
            {kind === 'BRIEF'
              ? t`Share approved brief`
              : t`Share approved submission`}
          </StyledDeliveryButton>
        );
      })}
      <small>
        <Trans>
          Only the selected approved version is visible to the client. Internal
          notes and generated candidates stay private.
        </Trans>
      </small>
    </StyledDeliveryStack>
  );
};
