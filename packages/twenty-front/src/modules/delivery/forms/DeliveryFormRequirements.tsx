import { Trans } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type DeliveryFormRequirementsProps = {
  requirements: { targetId: string; message: string }[];
};

const StyledRequirements = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
  ul {
    margin: 4px 0 0;
    padding-left: 20px;
  }
`;

const StyledRequirementAction = styled.button`
  background: none;
  border: 0;
  color: ${themeCssVariables.color.blue11};
  min-height: 32px;
  padding: 4px 0;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
`;

export const DeliveryFormRequirements = ({
  requirements,
}: DeliveryFormRequirementsProps) => {
  if (!requirements.length) return null;

  return (
    <StyledRequirements>
      <p>
        <Trans>Before saving:</Trans>
      </p>
      <ul>
        {requirements.map(({ targetId, message }) => (
          <li key={targetId}>
            <StyledRequirementAction
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;
                const target = form?.ownerDocument.getElementById(targetId);
                if (!(target instanceof HTMLElement) || !form?.contains(target))
                  return;

                let section = target.closest('details');
                while (section && form.contains(section)) {
                  section.open = true;
                  section = section.parentElement?.closest('details') ?? null;
                }
                target.focus();
              }}
            >
              {message}
            </StyledRequirementAction>
          </li>
        ))}
      </ul>
    </StyledRequirements>
  );
};
