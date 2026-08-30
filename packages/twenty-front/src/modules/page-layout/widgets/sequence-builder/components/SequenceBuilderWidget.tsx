import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';

import { SequenceAnalyticsStrip } from '@/sequences/components/SequenceAnalyticsStrip';
import { SequenceSettingsSection } from '@/sequences/components/SequenceSettingsSection';
import { SequenceStepsEditor } from '@/sequences/components/SequenceStepsEditor';
import { useTargetSequence } from '@/sequences/hooks/useTargetSequence';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  width: 100%;
`;

export const SequenceBuilderWidget = () => {
  const { sequence } = useTargetSequence();

  if (!isDefined(sequence)) {
    return null;
  }

  return (
    <StyledContainer>
      <SequenceAnalyticsStrip sequenceId={sequence.id} />
      <SequenceStepsEditor sequenceId={sequence.id} />
      <SequenceSettingsSection sequence={sequence} />
    </StyledContainer>
  );
};
