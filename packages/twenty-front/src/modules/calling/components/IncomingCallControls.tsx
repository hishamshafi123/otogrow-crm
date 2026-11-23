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
  background:
    radial-gradient(
      ellipse 80% 75% at 50% 0%,
      ${themeCssVariables.color.transparent.iris2} 0%,
      transparent 75%
    ),
    ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.color.iris5};
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[3]};
`;

const StyledLabel = styled.div`
  background: ${themeCssVariables.color.transparent.iris2};
  border: 1px solid ${themeCssVariables.color.iris5};
  border-radius: 999px;
  color: ${themeCssVariables.color.iris11};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 3px 10px;
  text-transform: uppercase;
`;

const StyledNumber = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.01em;
`;

const StyledControls = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledRoundButton = styled.button<{ variant: 'success' | 'danger' }>`
  align-items: center;
  background: ${({ variant }) =>
    variant === 'danger'
      ? `linear-gradient(135deg, ${themeCssVariables.color.red9}, ${themeCssVariables.color.red10})`
      : `linear-gradient(135deg, ${themeCssVariables.color.jade9}, ${themeCssVariables.color.jade10})`};
  border: 1px solid
    ${({ variant }) =>
      variant === 'danger'
        ? themeCssVariables.color.red8
        : themeCssVariables.color.jade8};
  border-radius: 50%;
  box-shadow: ${({ variant }) =>
    variant === 'danger'
      ? `0 6px 16px -6px ${themeCssVariables.color.transparent.red6}`
      : `0 6px 16px -6px ${themeCssVariables.color.transparent.jade6}`};
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  display: flex;
  height: 44px;
  justify-content: center;
  transition:
    box-shadow 150ms ease,
    transform 150ms ease;
  width: 44px;

  &:hover {
    transform: translateY(-1px) scale(1.04);
  }

  &:active {
    transform: scale(0.97);
  }
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
