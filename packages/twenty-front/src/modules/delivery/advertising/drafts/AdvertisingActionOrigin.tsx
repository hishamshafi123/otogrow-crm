import { Link, useSearchParams } from 'react-router-dom';
import { Trans } from '@lingui/react/macro';
import {
  advertisingDestination,
  advertisingCloseCommand,
} from '@/delivery/advertising/workbench/advertising-navigation';
import { advertisingDraftClose } from '@/delivery/advertising/drafts/advertising-draft-navigation';

export const AdvertisingActionOrigin = ({
  origin,
  humanEdited = false,
  canOpen = false,
}: {
  origin?: {
    runId: string;
    suggestionId: string;
    humanEdited?: boolean;
  } | null;
  humanEdited?: boolean;
  canOpen?: boolean;
}) => {
  if (!origin) return null;
  return (
    <p>
      <Trans>AI-assisted proposal; not independently verified.</Trans>{' '}
      {(humanEdited || origin.humanEdited) && (
        <>
          <Trans>Edited by a person.</Trans>{' '}
        </>
      )}
      {canOpen && <AdvertisingOriginLink runId={origin.runId} />}
    </p>
  );
};

const AdvertisingOriginLink = ({ runId }: { runId: string }) => {
  const [params] = useSearchParams();
  return (
    <Link
      to={advertisingDestination(params, {
        ...(params.get('adMode') === 'review' ? {} : advertisingCloseCommand),
        ...advertisingDraftClose,
        adDraftView: 'history',
        adDraftRun: runId,
      })}
    >
      <Trans>Review saved AI source</Trans>
    </Link>
  );
};
