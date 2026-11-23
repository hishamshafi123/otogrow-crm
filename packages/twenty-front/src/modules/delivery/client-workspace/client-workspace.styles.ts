import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledClientLayout = styled.div`
  align-items: start;
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(220px, 272px) minmax(0, 1fr);
  min-width: 0;

  @media (max-width: 900px) {
    gap: 20px;
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledClientDirectory = styled.aside`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    320px circle at 0% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 56%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 10px 26px -18px ${themeCssVariables.boxShadow.color};
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
    gap: 14px;
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
    border: 1px solid transparent;
    border-radius: 10px;
    color: inherit;
    display: block;
    overflow-wrap: anywhere;
    padding: 10px 12px;
    text-decoration: none;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }

  li a:hover {
    background: ${themeCssVariables.background.secondary};
    border-color: ${themeCssVariables.border.color.light};
  }

  li a[aria-current='page'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet2} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    box-shadow: inset 3px 0 0 ${themeCssVariables.color.iris9};
    color: ${themeCssVariables.color.iris11};
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
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 13px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 4px 14px -8px ${themeCssVariables.boxShadow.color};
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  padding: 4px;
  width: fit-content;

  a {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 14px;
    text-decoration: none;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease;
  }

  a:hover {
    background: ${themeCssVariables.background.secondary};
    color: ${themeCssVariables.font.color.primary};
  }

  a[aria-current='page'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }
`;

export const StyledClientProject = styled.article`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-wrap: anywhere;
  padding: 18px 20px;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
    box-shadow: 0 8px 20px -14px ${themeCssVariables.boxShadow.color};
  }

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
  gap: 12px 20px;

  > a {
    align-items: center;
    display: inline-flex;
    min-height: 40px;
  }
`;
