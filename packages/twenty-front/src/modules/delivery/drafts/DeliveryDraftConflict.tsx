import { Trans } from '@lingui/react/macro';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

type DeliveryDraftConflictProps = { onReload: () => void; busy: boolean };
export const DeliveryDraftConflict = ({
  onReload,
  busy,
}: DeliveryDraftConflictProps) => (
  <div role="alert">
    <p>
      <Trans>
        This record changed while you were editing. Your draft is preserved.
        Reload the latest version before saving.
      </Trans>
    </p>
    <StyledDeliveryButton type="button" disabled={busy} onClick={onReload}>
      <Trans>Reload latest version</Trans>
    </StyledDeliveryButton>
  </div>
);
