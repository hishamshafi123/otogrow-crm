import { type ReactNode } from 'react';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type ReleaseStageProps = {
  label: string;
  children: ReactNode;
  status?: boolean;
};
export const ReleaseStage = ({
  label,
  children,
  status,
}: ReleaseStageProps) => {
  const focus = useAssistantPanelFocus();
  return (
    <section
      ref={focus}
      tabIndex={-1}
      aria-label={label}
      role={status ? 'status' : undefined}
    >
      <StyledDeliveryStack>{children}</StyledDeliveryStack>
    </section>
  );
};
