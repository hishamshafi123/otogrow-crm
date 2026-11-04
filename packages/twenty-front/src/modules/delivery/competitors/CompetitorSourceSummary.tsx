import { Trans, useLingui } from '@lingui/react/macro';
import { type CompetitorSavedBody } from '@/delivery/competitors/competitor.types';
import { useCompetitorLabels } from '@/delivery/competitors/useCompetitorLabels';
import {
  StyledCompetitorFacts,
  StyledCompetitorText,
} from '@/delivery/competitors/competitorStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type CompetitorSourceSummaryProps = { body: CompetitorSavedBody };
export const CompetitorSourceSummary = ({
  body,
}: CompetitorSourceSummaryProps) => {
  const { t } = useLingui();
  const labels = useCompetitorLabels();
  return (
    <StyledDeliveryStack>
      <StyledCompetitorFacts>
        <div>
          <dt>
            <Trans>Source</Trans>
          </dt>
          <dd>{body.label}</dd>
        </div>
        <div>
          <dt>
            <Trans>Platform</Trans>
          </dt>
          <dd>{labels.platform(body.platform)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Recognized reference</Trans>
          </dt>
          <dd>
            <a
              href={body.canonicalReference}
              target="_blank"
              rel="noreferrer noopener"
            >
              {body.canonicalReference}
            </a>
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Owner and reviewer</Trans>
          </dt>
          <dd>
            {body.ownerName} · {body.reviewerName}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Planned interval</Trans>
          </dt>
          <dd>{t`Every ${body.cadenceHours} hours`}</dd>
        </div>
        <div>
          <dt>
            <Trans>Lookback</Trans>
          </dt>
          <dd>{t`${body.lookbackDays} days`}</dd>
        </div>
      </StyledCompetitorFacts>
      <StyledCompetitorText>
        {body.purpose || t`No research purpose recorded.`}
      </StyledCompetitorText>
      <p>
        <Trans>
          Collection is OFF. Saving this source does not connect an account,
          retrieve posts or spend money.
        </Trans>
      </p>
    </StyledDeliveryStack>
  );
};
