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
  gap: 6px;
  grid-template-columns: repeat(3, 1fr);
`;

const StyledKey = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.medium};
  height: 40px;
  justify-content: center;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    transform 120ms ease;

  &:hover {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.transparent.iris6};
  }

  &:active {
    transform: scale(0.96);
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
        <StyledKey key={digit} type="button" onClick={() => handleDigit(digit)}>
          {digit}
        </StyledKey>
      ))}
    </StyledPad>
  );
};
