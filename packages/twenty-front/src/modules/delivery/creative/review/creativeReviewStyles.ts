import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledReviewBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;

  &[hidden] {
    display: none;
  }
`;

export const StyledReviewPlayer = styled.section`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  box-shadow: inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  padding: 14px;

  img,
  video {
    border-radius: 10px;
    display: block;
    max-height: 480px;
    max-width: 100%;
    object-fit: contain;
  }

  audio {
    max-width: 100%;
    width: 100%;
  }
`;

export const StyledFeedback = styled.article`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  overflow-wrap: anywhere;
  padding: 12px 14px;
`;
