import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { IconPhone, IconPhoneOff } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  acceptIncomingCall,
  declineIncomingCall,
} from '@/calling/services/twilio-device-manager';
import { dialerNumberState } from '@/calling/states/dialerNumberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const StyledContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[2]} 0;
`;

const StyledLabel = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledNumber = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledControls = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledRoundButton = styled.button<{ variant: 'success' | 'danger' }>`
  align-items: center;
  background: ${({ variant }) =>
    variant === 'danger'
      ? themeCssVariables.color.red
      : themeCssVariables.color.green};
  border: none;
  border-radius: 50%;
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  display: flex;
  height: ${themeCssVariables.spacing[10]};
  justify-content: center;
  width: ${themeCssVariables.spacing[10]};
`;

export const IncomingCallControls = () => {
  const { t } = useLingui();
  const dialerNumber = useAtomStateValue(dialerNumberState);

  return (
    <StyledContainer>
      <StyledLabel>{t`Incoming call`}</StyledLabel>
      <StyledNumber>{dialerNumber}</StyledNumber>
      <StyledControls>
        <StyledRoundButton
          variant="success"
          onClick={acceptIncomingCall}
          aria-label={t`Accept call`}
        >
          <IconPhone />
        </StyledRoundButton>
        <StyledRoundButton
          variant="danger"
          onClick={declineIncomingCall}
          aria-label={t`Decline call`}
        >
          <IconPhoneOff />
        </StyledRoundButton>
      </StyledControls>
    </StyledContainer>
  );
};
