import { ClientWorkspaceReturnLink } from '@/delivery/client-workspace/ClientWorkspaceReturnLink';
import { styled } from '@linaria/react';
import { type ReactNode, type Ref } from 'react';
import { IconChevronDown } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type DeliveryPageHeaderProps = {
  title: string;
  titleControl?: ReactNode;
  description?: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
};

const StyledHeader = styled.header`
  align-items: flex-start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 14px 20px;
  justify-content: space-between;
  min-width: 0;
  padding-bottom: 18px;
  position: relative;

  &::after {
    background: linear-gradient(
      90deg,
      ${themeCssVariables.color.transparent.iris7} 0%,
      ${themeCssVariables.color.transparent.cyan6} 40%,
      transparent 100%
    );
    bottom: -1px;
    content: '';
    height: 1px;
    left: 0;
    pointer-events: none;
    position: absolute;
    width: min(260px, 45%);
  }
`;

const StyledIdentity = styled.div`
  align-items: flex-start;
  display: flex;
  flex: 1 1 120px;
  gap: 12px;
  min-width: 0;
`;

const StyledNavigation = styled.div`
  display: flex;
  flex: 0 0 auto;
  padding-top: 4px;
`;

const StyledHeading = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const StyledTitle = styled.h1`
  && {
    color: ${themeCssVariables.font.color.primary};
    font-size: 32px;
    font-weight: 650;
    letter-spacing: -0.035em;
    line-height: 1.12;
    margin: 0;
    overflow-wrap: anywhere;
  }

  &:focus-visible {
    border-radius: 6px;
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 4px;
  }

  @media (max-width: 700px) {
    && {
      font-size: 26px;
      letter-spacing: -0.025em;
    }
  }

  @media (max-width: 360px) {
    && {
      font-size: 23px;
      letter-spacing: -0.02em;
    }
  }
`;

const StyledTitleControl = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 2px 8px -4px ${themeCssVariables.boxShadow.color};
  display: inline-flex;
  gap: 8px;
  min-height: 44px;
  padding: 2px 14px;
  position: relative;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;

  &:hover {
    border-color: ${themeCssVariables.color.iris7};
    box-shadow: 0 4px 14px -6px ${themeCssVariables.color.transparent.iris5};
  }

  svg {
    color: ${themeCssVariables.color.iris10};
    flex: 0 0 auto;
  }

  select {
    cursor: pointer;
    height: 100%;
    inset: 0;
    opacity: 0;
    position: absolute;
    width: 100%;
  }

  &:focus-within {
    border-color: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 0 3px ${themeCssVariables.color.transparent.iris3};
    outline: none;
  }
`;

const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 13.5px;
  line-height: 1.5;
  max-width: 72ch;
  overflow-wrap: anywhere;
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  max-width: 100%;
  min-width: 0;

  @media (max-width: 700px) {
    justify-content: flex-start;
  }
`;

export const DeliveryPageHeader = ({
  title,
  titleControl,
  description,
  navigation,
  actions,
  headingRef,
  headingTabIndex,
}: DeliveryPageHeaderProps) => (
  <StyledHeader>
    <StyledIdentity>
      {Boolean(navigation) && <StyledNavigation>{navigation}</StyledNavigation>}
      <StyledHeading>
        <ClientWorkspaceReturnLink />
        <StyledTitle
          ref={headingRef}
          tabIndex={headingTabIndex}
          aria-label={Boolean(titleControl) ? title : undefined}
        >
          {Boolean(titleControl) ? (
            <StyledTitleControl>
              <span aria-hidden>{title}</span>
              <IconChevronDown size={18} aria-hidden />
              {titleControl}
            </StyledTitleControl>
          ) : (
            title
          )}
        </StyledTitle>
        {Boolean(description) && (
          <StyledDescription>{description}</StyledDescription>
        )}
      </StyledHeading>
    </StyledIdentity>
    {Boolean(actions) && <StyledActions>{actions}</StyledActions>}
  </StyledHeader>
);
