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
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  justify-content: space-between;
  min-width: 0;
  padding-bottom: 4px;
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
  gap: 8px;
  min-width: 0;
`;

const StyledTitle = styled.h1`
  && {
    color: ${themeCssVariables.font.color.primary};
    font-size: 34px;
    font-weight: 600;
    letter-spacing: -1px;
    line-height: 1.12;
    margin: 0;
    overflow-wrap: anywhere;
  }
  &:focus-visible {
    border-radius: 4px;
    outline: 3px solid ${themeCssVariables.color.blue11};
    outline-offset: 4px;
  }
  @media (max-width: 700px) {
    && {
      font-size: 28px;
      letter-spacing: -0.7px;
    }
  }
  @media (max-width: 360px) {
    && {
      font-size: 24px;
      letter-spacing: -0.5px;
    }
  }
`;

const StyledTitleControl = styled.span`
  align-items: center;
  display: inline-flex;
  gap: 6px;
  min-height: 44px;
  position: relative;

  svg {
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
    border-radius: 4px;
    outline: 3px solid ${themeCssVariables.color.blue11};
    outline-offset: 4px;
  }
`;

const StyledDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 14px;
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
