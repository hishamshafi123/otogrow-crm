import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
} from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  hangUpCall,
  toggleCallMute,
} from '@/calling/services/twilio-device-manager';
import { callAnsweredAtState } from '@/calling/states/callAnsweredAtState';
import { callStatusState } from '@/calling/states/callStatusState';
import { dialerNumberState } from '@/calling/states/dialerNumberState';
import { isCallMutedState } from '@/calling/states/isCallMutedState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const StyledContainer = styled.div`
  align-items: center;
  background:
    radial-gradient(
      ellipse 80% 70% at 50% 0%,
      ${themeCssVariables.color.transparent.jade2} 0%,
      transparent 75%
    ),
    ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[3]};
`;

const StyledNumber = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.01em;
`;

const StyledStatus = styled.div`
  background: ${themeCssVariables.color.transparent.jade2};
  border: 1px solid ${themeCssVariables.color.jade5};
  border-radius: 999px;
  color: ${themeCssVariables.color.jade11};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 3px 10px;
  text-transform: uppercase;
`;

const StyledControls = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledRoundButton = styled.button<{ variant: 'neutral' | 'danger' }>`
  align-items: center;
  background: ${({ variant }) =>
    variant === 'danger'
      ? `linear-gradient(135deg, ${themeCssVariables.color.red9}, ${themeCssVariables.color.red10})`
      : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ variant }) =>
      variant === 'danger'
        ? themeCssVariables.color.red8
        : themeCssVariables.border.color.medium};
  border-radius: 50%;
  box-shadow: ${({ variant }) =>
    variant === 'danger'
      ? `0 6px 16px -6px ${themeCssVariables.color.transparent.red6}`
      : `0 2px 6px ${themeCssVariables.color.transparent.gray2}`};
  color: ${({ variant }) =>
    variant === 'danger'
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  height: 44px;
  justify-content: center;
  transition:
    box-shadow 150ms ease,
    transform 150ms ease;
  width: 44px;

  &:hover {
    transform: translateY(-1px) scale(1.03);
  }

  &:active {
    transform: scale(0.97);
  }
`;

const formatDuration = (elapsedSeconds: number): string => {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const ActiveCallControls = () => {
  const { t } = useLingui();
  const callStatus = useAtomStateValue(callStatusState);
  const dialerNumber = useAtomStateValue(dialerNumberState);
  const isCallMuted = useAtomStateValue(isCallMutedState);
  const callAnsweredAt = useAtomStateValue(callAnsweredAtState);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isDefined(callAnsweredAt)) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - callAnsweredAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [callAnsweredAt]);

  const statusLabel =
    callStatus === 'CONNECTING'
      ? t`Connecting…`
      : callStatus === 'RINGING'
        ? t`Ringing…`
        : callStatus === 'IN_CALL'
          ? formatDuration(elapsedSeconds)
          : t`Call ended`;

  return (
    <StyledContainer>
      <StyledNumber>{dialerNumber}</StyledNumber>
      <StyledStatus>{statusLabel}</StyledStatus>
      <StyledControls>
        <StyledRoundButton
          variant="neutral"
          onClick={toggleCallMute}
          aria-label={isCallMuted ? t`Unmute` : t`Mute`}
        >
          {isCallMuted ? <IconMicrophoneOff /> : <IconMicrophone />}
        </StyledRoundButton>
        <StyledRoundButton
          variant="danger"
          onClick={hangUpCall}
          aria-label={t`Hang up`}
        >
          <IconPhoneOff />
        </StyledRoundButton>
      </StyledControls>
    </StyledContainer>
  );
};
