import { type ReactNode } from 'react';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { StyledCompetitorReview } from '@/delivery/competitors/competitorStyles';

type CompetitorSourceStageProps = {
  label: string;
  children: ReactNode;
  status?: boolean;
  restoreLogicalFocus: () => boolean;
};
export const CompetitorSourceStage = ({
  label,
  children,
  status,
  restoreLogicalFocus,
}: CompetitorSourceStageProps) => {
  const focus = useAssistantPanelFocus(restoreLogicalFocus);
  return (
    <StyledCompetitorReview
      ref={focus}
      tabIndex={-1}
      aria-label={label}
      role={status ? 'status' : undefined}
    >
      {children}
    </StyledCompetitorReview>
  );
};
