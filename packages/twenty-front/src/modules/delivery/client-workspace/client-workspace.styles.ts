import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledClientLayout = styled.div`
  align-items: start;
  display: grid;
  gap: 28px;
  grid-template-columns: minmax(210px, 260px) minmax(0, 1fr);
  min-width: 0;
  @media (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
`;
export const StyledClientDirectory = styled.aside`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 20px;
  .client-directory-toggle {
    display: none;
  }
  .client-directory-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  @media (max-width: 900px) {
    .client-directory-toggle {
      display: block;
      width: 100%;
    }
    &[data-collapsed='true'] .client-directory-content {
      display: none;
    }
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    max-height: 480px;
    overflow: auto;
    padding: 0;
  }
  li + li {
    margin-top: 4px;
  }
  li a {
    border-radius: 8px;
    color: inherit;
    display: block;
    overflow-wrap: anywhere;
    padding: 12px;
    text-decoration: none;
  }
  li a:hover {
    background: ${themeCssVariables.background.secondary};
  }
  li a[aria-current='page'] {
    background: ${themeCssVariables.background.secondary};
    box-shadow: inset 3px 0 ${themeCssVariables.color.blue11};
    font-weight: 600;
  }
  @media (max-width: 900px) {
    ul {
      max-height: 180px;
    }
  }
`;
export const StyledClientMain = styled.section`
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  > header {
    align-items: start;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: space-between;
  }
  h2 {
    overflow-wrap: anywhere;
  }
`;
export const StyledClientTabs = styled.nav`
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  a {
    border-bottom: 2px solid transparent;
    color: ${themeCssVariables.font.color.secondary};
    padding: 12px 0;
    text-decoration: none;
  }
  a[aria-current='page'] {
    border-bottom-color: ${themeCssVariables.color.blue11};
    color: ${themeCssVariables.font.color.primary};
    font-weight: 600;
  }
`;
export const StyledClientProject = styled.article`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-wrap: anywhere;
  padding: 20px 0;
  p {
    max-width: 68ch;
  }
`;

export const StyledClientBoundary = styled.fieldset`
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
  > header {
    align-items: start;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: space-between;
  }
`;

export const StyledClientActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  > a {
    align-items: center;
    display: inline-flex;
    min-height: 44px;
  }
`;
