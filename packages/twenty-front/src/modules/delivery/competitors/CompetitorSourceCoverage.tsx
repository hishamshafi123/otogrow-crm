import { Trans } from '@lingui/react/macro';
import { type CompetitorPlatform } from '@/delivery/competitors/competitor.types';

type CompetitorSourceCoverageProps = { platform: CompetitorPlatform };
export const CompetitorSourceCoverage = ({
  platform,
}: CompetitorSourceCoverageProps) => (
  <p>
    {platform === 'MANUAL' ? (
      <Trans>
        Manual only. Your team records evidence; this source has no automatic
        collection.
      </Trans>
    ) : platform === 'X' ? (
      <Trans>
        Connection needed. X public-post collection is not connected. Its
        separate data budget remains unfunded until an allowance and rate are
        configured.
      </Trans>
    ) : platform === 'INSTAGRAM' ? (
      <Trans>
        Connection needed. Official discovery requires an authorized account and
        eligible public Professional accounts. Consumer and private accounts are
        unavailable.
      </Trans>
    ) : (
      <Trans>
        Manual only for this registry. Official Ad Library API coverage is
        limited by ad category, country and period. Unsupported commercial-ad
        research requires manual evidence from the official library.
      </Trans>
    )}
  </p>
);
