import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { IconPhone, IconX } from 'twenty-ui/icon';
import { GRAY_SCALE_LIGHT } from 'twenty-ui/theme';
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
  background: linear-gradient(
    135deg,
    ${themeCssVariables.color.iris9} 0%,
    ${themeCssVariables.color.violet9} 100%
  );
  border: 1px solid ${themeCssVariables.color.transparent.iris8};
  border-radius: 50%;
  bottom: ${themeCssVariables.spacing[5]};
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray4},
    0 12px 28px -8px ${themeCssVariables.color.iris9};
  color: ${GRAY_SCALE_LIGHT.gray1};
  cursor: pointer;
  display: flex;
  height: 52px;
  justify-content: center;
  position: fixed;
  right: ${themeCssVariables.spacing[5]};
  transition:
    box-shadow 160ms ease,
    transform 160ms ease;
  width: 52px;
  z-index: 1000;

  &:hover {
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray5},
      0 16px 34px -8px ${themeCssVariables.color.iris9};
    transform: translateY(-2px);
  }
`;

const StyledPanel = styled.div`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    280px circle at 100% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 56%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 20px;
  bottom: ${themeCssVariables.spacing[5]};
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 24px 56px -18px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: 18px;
  position: fixed;
  right: ${themeCssVariables.spacing[5]};
  width: 312px;
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
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.015em;
`;

const StyledCloseButton = styled.button`
  align-items: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: flex;
  justify-content: center;
  padding: 6px;
  transition:
    background-color 140ms ease,
    color 140ms ease;

  &:hover {
    background: ${themeCssVariables.background.tertiary};
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledNumberInput = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-variant-numeric: tabular-nums;
  padding: 10px 12px;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
  width: 100%;

  &:focus {
    border-color: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 0 3px ${themeCssVariables.color.transparent.iris3};
    outline: none;
  }
`;

const StyledCallButton = styled.button`
  align-items: center;
  background: linear-gradient(
    135deg,
    ${themeCssVariables.color.jade9} 0%,
    ${themeCssVariables.color.green9} 100%
  );
  border: 1px solid ${themeCssVariables.color.transparent.jade8};
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray4},
    0 8px 20px -10px ${themeCssVariables.color.jade9};
  color: ${GRAY_SCALE_LIGHT.gray1};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  padding: 10px 14px;
  transition:
    box-shadow 150ms ease,
    transform 150ms ease;

  &:hover:not(:disabled) {
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray5},
      0 10px 24px -10px ${themeCssVariables.color.jade9};
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const StyledError = styled.div`
  color: ${themeCssVariables.color.red11};
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
