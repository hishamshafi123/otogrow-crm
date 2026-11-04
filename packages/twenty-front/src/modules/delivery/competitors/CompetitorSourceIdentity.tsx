import { type CompetitorSummary } from '@/delivery/competitors/competitor.types';
import { useCompetitorLabels } from '@/delivery/competitors/useCompetitorLabels';
import { StyledCompetitorText } from '@/delivery/competitors/competitorStyles';

type CompetitorSourceIdentityProps = { source: CompetitorSummary };
export const CompetitorSourceIdentity = ({
  source,
}: CompetitorSourceIdentityProps) => {
  const labels = useCompetitorLabels();
  return (
    <StyledCompetitorText>
      <strong>{source.label}</strong> · {labels.platform(source.platform)} ·{' '}
      <a
        href={source.canonicalReference}
        target="_blank"
        rel="noreferrer noopener"
      >
        {source.canonicalReference}
      </a>
    </StyledCompetitorText>
  );
};
