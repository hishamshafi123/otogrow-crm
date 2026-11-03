import { useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { type AtlasProfile } from '@/delivery/creative/atlas/atlas.types';
import { useAtlasLabels } from '@/delivery/creative/atlas/useAtlasLabels';

type AtlasProfileReadinessProps = { profile: AtlasProfile };
export const AtlasProfileReadiness = ({
  profile,
}: AtlasProfileReadinessProps) => {
  const labels = useAtlasLabels();
  const [open, setOpen] = useState(false);
  const reasons = profile.blockedReasons.filter(
    (reason) => reason !== 'UNBOUNDED_ESTIMATED_BILLING',
  );
  return (
    <>
      {profile.blockedReasons.includes('UNBOUNDED_ESTIMATED_BILLING') && (
        <p>{labels.reason('UNBOUNDED_ESTIMATED_BILLING')}</p>
      )}
      {reasons.length > 0 && (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary>
            <Trans>Current saved model readiness</Trans>
          </summary>
          {open &&
            reasons.map((reason) => (
              <p key={reason}>{labels.reason(reason)}</p>
            ))}
        </details>
      )}
    </>
  );
};
