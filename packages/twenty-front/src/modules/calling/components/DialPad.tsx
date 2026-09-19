import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';

import { sendCallDigits } from '@/calling/services/twilio-device-manager';
import { callStatusState } from '@/calling/states/callStatusState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const DIAL_PAD_KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '*',
  '0',
  '#',
];

const StyledPad = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  grid-template-columns: repeat(3, 1fr);
`;

const StyledKey = styled.button`
  align-items: center;
  background: transparent;
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.lg};
  height: ${themeCssVariables.spacing[8]};
  justify-content: center;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

type DialPadProps = {
  onDigit?: (digit: string) => void;
};

export const DialPad = ({ onDigit }: DialPadProps) => {
  const { t } = useLingui();
  const callStatus = useAtomStateValue(callStatusState);
  const isInCall = callStatus === 'IN_CALL';

  const handleDigit = (digit: string) => {
    if (isInCall) {
      sendCallDigits(digit);
    } else {
      onDigit?.(digit);
    }
  };

  return (
    <StyledPad aria-label={t`Dial pad`}>
      {DIAL_PAD_KEYS.map((digit) => (
        <StyledKey
          key={digit}
          type="button"
          onClick={() => handleDigit(digit)}
        >
          {digit}
        </StyledKey>
      ))}
    </StyledPad>
  );
};
