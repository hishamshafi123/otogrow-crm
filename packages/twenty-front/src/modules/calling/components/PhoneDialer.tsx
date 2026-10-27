import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { IconPhone, IconX } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ActiveCallControls } from '@/calling/components/ActiveCallControls';
import { DialPad } from '@/calling/components/DialPad';
import { IncomingCallControls } from '@/calling/components/IncomingCallControls';
import { RecentCallsList } from '@/calling/components/RecentCallsList';
import {
  initializeCallingDevice,
  setCallingAccess,
  runVoicePreflight,
  startOutgoingCall,
} from '@/calling/services/twilio-device-manager';
import { activeCallPersonIdState } from '@/calling/states/activeCallPersonIdState';
import { callStatusState } from '@/calling/states/callStatusState';
import { dialerErrorState } from '@/calling/states/dialerErrorState';
import { dialerNumberState } from '@/calling/states/dialerNumberState';
import { isDialerOpenState } from '@/calling/states/isDialerOpenState';
import { preflightReportState } from '@/calling/states/preflightReportState';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const StyledFab = styled.button`
  align-items: center;
  background: ${themeCssVariables.color.blue};
  border: none;
  border-radius: 50%;
  bottom: ${themeCssVariables.spacing[5]};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  display: flex;
  height: ${themeCssVariables.spacing[12]};
  justify-content: center;
  position: fixed;
  right: ${themeCssVariables.spacing[5]};
  width: ${themeCssVariables.spacing[12]};
  z-index: 1000;
`;

const StyledPanel = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  bottom: ${themeCssVariables.spacing[5]};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
  position: fixed;
  right: ${themeCssVariables.spacing[5]};
  width: 300px;
  z-index: 1000;
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StyledTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledCloseButton = styled.button`
  background: transparent;
  border: none;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: flex;
  padding: ${themeCssVariables.spacing[1]};
`;

const StyledNumberInput = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  padding: ${themeCssVariables.spacing[2]};
  width: 100%;
`;

const StyledCallButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.color.green};
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.inverted};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  padding: ${themeCssVariables.spacing[2]};

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StyledError = styled.div`
  color: ${themeCssVariables.color.red};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledPreflightLink = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.xs};
  padding: 0;
  text-decoration: underline;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const StyledPreflightReport = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  word-break: break-word;
`;

const toE164 = (rawNumber: string): string => {
  const trimmed = rawNumber.trim();

  if (trimmed.startsWith('+')) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');

  // A bare 10-digit number is almost certainly NANP; without this,
  // "+905…" silently dials Turkey instead of Ontario.
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
};

export const PhoneDialer = () => {
  const { t } = useLingui();
  const { canUsePhone, scopeKey } = useOtogrowAccess();
  const [isDialerOpen, setIsDialerOpen] = useAtomState(isDialerOpenState);
  const [dialerNumber, setDialerNumber] = useAtomState(dialerNumberState);
  const callStatus = useAtomStateValue(callStatusState);
  const activeCallPersonId = useAtomStateValue(activeCallPersonIdState);
  const dialerError = useAtomStateValue(dialerErrorState);
  const preflightReport = useAtomStateValue(preflightReportState);

  // Registering the Twilio device is what makes inbound PSTN calls ring
  // this browser; it must happen on mount, not on the first outbound call.
  useEffect(() => {
    setCallingAccess(canUsePhone ? scopeKey : null);
    if (canUsePhone) void initializeCallingDevice();
    return () => setCallingAccess(null);
  }, [canUsePhone, scopeKey]);

  if (!canUsePhone) {
    return null;
  }

  if (!isDialerOpen) {
    return (
      <StyledFab
        onClick={() => setIsDialerOpen(true)}
        aria-label={t`Open phone dialer`}
      >
        <IconPhone />
      </StyledFab>
    );
  }

  const isIncomingCall = callStatus === 'INCOMING';
  const isInActiveCall =
    callStatus === 'CONNECTING' ||
    callStatus === 'RINGING' ||
    callStatus === 'IN_CALL';

  const handleCall = () => {
    if (!isNonEmptyString(dialerNumber)) {
      return;
    }

    startOutgoingCall({
      toNumber: toE164(dialerNumber),
      personId: activeCallPersonId,
    });
  };

  return (
    <StyledPanel>
      <StyledHeader>
        <StyledTitle>{t`Phone`}</StyledTitle>
        <StyledCloseButton
          onClick={() => setIsDialerOpen(false)}
          aria-label={t`Close phone dialer`}
        >
          <IconX size={16} />
        </StyledCloseButton>
      </StyledHeader>
      {isDefined(dialerError) && <StyledError>{dialerError}</StyledError>}
      {isIncomingCall ? (
        <IncomingCallControls />
      ) : isInActiveCall ? (
        <>
          <ActiveCallControls />
          <DialPad />
        </>
      ) : (
        <>
          <StyledNumberInput
            value={dialerNumber}
            onChange={(event) => setDialerNumber(event.target.value)}
            placeholder={t`+15551234567`}
            aria-label={t`Phone number`}
          />
          <DialPad onDigit={(digit) => setDialerNumber(dialerNumber + digit)} />
          <StyledCallButton
            onClick={handleCall}
            disabled={!isNonEmptyString(dialerNumber)}
          >
            <IconPhone size={16} />
            {t`Call`}
          </StyledCallButton>
          <StyledPreflightLink
            onClick={() => runVoicePreflight()}
            disabled={preflightReport.status === 'RUNNING'}
          >
            {preflightReport.status === 'RUNNING'
              ? t`Testing connection…`
              : t`Test connection`}
          </StyledPreflightLink>
          {isDefined(preflightReport.detail) && (
            <StyledPreflightReport>
              {preflightReport.status === 'PASSED' ? '✓ ' : ''}
              {preflightReport.detail}
            </StyledPreflightReport>
          )}
          <RecentCallsList />
        </>
      )}
    </StyledPanel>
  );
};
