import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { StyledDeliveryCard } from '@/delivery/deliveryStyles';
export const StyledReviewQueueCard = styled(StyledDeliveryCard)`
  @media (max-width: 700px) {
    padding: 14px;
  }
`;
export const StyledReviewQueueHeading = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  button {
    flex-shrink: 0;
  }
`;
export const StyledReviewQueueItem = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  overflow-wrap: anywhere;
  padding: 16px 0;
  > a {
    align-items: center;
    display: inline-flex;
    min-height: 36px;
  }
  @media (max-width: 700px) {
    padding: 12px 0;
  }
`;
export const StyledReviewQueueStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  @media (max-width: 700px) {
    gap: 8px;
  }
`;
export const StyledAssignmentBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
