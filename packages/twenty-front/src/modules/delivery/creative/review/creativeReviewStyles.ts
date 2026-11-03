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
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 12px;
  img,
  video {
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
  border-top: 1px solid ${themeCssVariables.border.color.light};
  overflow-wrap: anywhere;
  padding: 12px 0;
`;
