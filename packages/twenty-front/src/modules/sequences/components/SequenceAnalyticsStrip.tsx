import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';

import { useSequenceAnalytics } from '@/sequences/hooks/useSequenceAnalytics';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledStrip = styled.div`
  background-color: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[6]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledMetric = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledMetricValue = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledMetricLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  text-transform: uppercase;
`;

export const SequenceAnalyticsStrip = ({
  sequenceId,
}: {
  sequenceId: string;
}) => {
  const { t } = useLingui();
  const { analytics } = useSequenceAnalytics({ sequenceId });

  const metrics = [
    { label: t`Active`, value: analytics?.activeCount },
    { label: t`Replied`, value: analytics?.repliedCount },
    { label: t`Unsubscribed`, value: analytics?.unsubscribedCount },
    { label: t`Completed`, value: analytics?.completedCount },
    { label: t`Error`, value: analytics?.errorCount },
    { label: t`Sent`, value: analytics?.sentCount },
  ];

  return (
    <StyledStrip>
      {metrics.map((metric) => (
        <StyledMetric key={metric.label}>
          <StyledMetricValue>{metric.value ?? '–'}</StyledMetricValue>
          <StyledMetricLabel>{metric.label}</StyledMetricLabel>
        </StyledMetric>
      ))}
    </StyledStrip>
  );
};
