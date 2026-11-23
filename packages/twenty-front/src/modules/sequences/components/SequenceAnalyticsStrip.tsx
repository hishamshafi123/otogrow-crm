import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';

import { useSequenceAnalytics } from '@/sequences/hooks/useSequenceAnalytics';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledStrip = styled.div`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    420px circle at 0% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 56%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 10px 24px -18px ${themeCssVariables.boxShadow.color};
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  padding: 14px;
`;

const StyledMetric = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
`;

const StyledMetricValue = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.025em;
`;

const StyledMetricLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 10.5px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: 0.06em;
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
