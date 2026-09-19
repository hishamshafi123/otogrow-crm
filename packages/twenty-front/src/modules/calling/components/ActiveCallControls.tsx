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
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[2]} 0;
`;

const StyledNumber = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-variant-numeric: tabular-nums;
`;

const StyledControls = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledRoundButton = styled.button<{ variant: 'neutral' | 'danger' }>`
  align-items: center;
  background: ${({ variant }) =>
    variant === 'danger'
      ? themeCssVariables.color.red
      : themeCssVariables.background.transparent.light};
  border: none;
  border-radius: 50%;
  color: ${({ variant }) =>
    variant === 'danger'
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  height: ${themeCssVariables.spacing[10]};
  justify-content: center;
  width: ${themeCssVariables.spacing[10]};
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
  const isMuted = useAtomStateValue(isCallMutedState);
  const answeredAt = useAtomStateValue(callAnsweredAtState);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isDefined(answeredAt)) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - answeredAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [answeredAt]);

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
          aria-label={isMuted ? t`Unmute` : t`Mute`}
        >
          {isMuted ? <IconMicrophoneOff /> : <IconMicrophone />}
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
