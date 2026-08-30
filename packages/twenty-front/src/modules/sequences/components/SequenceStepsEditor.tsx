import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';

import { SequenceStepEditor } from '@/sequences/components/SequenceStepEditor';
import { useSequenceStepMutations } from '@/sequences/hooks/useSequenceStepMutations';
import { useSequenceSteps } from '@/sequences/hooks/useSequenceSteps';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const StyledStepList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

export const SequenceStepsEditor = ({ sequenceId }: { sequenceId: string }) => {
  const { t } = useLingui();
  const { steps, loading } = useSequenceSteps({ sequenceId });
  const { addStep, deleteStep } = useSequenceStepMutations({
    sequenceId,
    steps,
  });

  if (loading) {
    return null;
  }

  return (
    <Section>
      <H2Title title={t`Steps`} />
      <StyledStepList>
        {steps.map((step) => (
          <SequenceStepEditor key={step.id} step={step} onDelete={deleteStep} />
        ))}
        <div>
          <Button
            Icon={IconPlus}
            title={t`Add step`}
            variant="secondary"
            onClick={addStep}
          />
        </div>
      </StyledStepList>
    </Section>
  );
};
