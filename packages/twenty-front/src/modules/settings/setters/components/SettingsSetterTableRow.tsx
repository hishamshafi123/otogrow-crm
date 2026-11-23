import { useState } from 'react';

import {
  type SetterProfileDraft,
  toSetterProfileDraft,
} from '@/settings/setters/hooks/useSetterProfiles';
import { type SetterProfile } from '@/settings/setters/types/setters.types';
import { TextInput } from '@/ui/input/components/TextInput';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { IconCopy, IconSend } from 'twenty-ui/icon';
import { Button, Toggle } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Status } from 'twenty-ui/data-display';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

const StyledRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: 1.4fr 0.5fr 0.9fr 0.7fr 0.7fr 0.7fr 1.3fr auto;
  padding: 12px 14px;
  transition: background-color 140ms ease;

  &:first-child {
    background: ${themeCssVariables.background.secondary};
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  &:not(:first-child):hover {
    background: ${themeCssVariables.color.transparent.iris1};
  }

  &:last-child {
    border-bottom: 0;
  }
`;

const StyledMemberCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;

  > span:first-child {
    color: ${themeCssVariables.font.color.primary};
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

const StyledMemberEmail = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledTelegramCell = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

type SettingsSetterTableRowProps = {
  setterProfile: SetterProfile;
  botUsername: string | null;
  isSaving: boolean;
  onSave: (workspaceMemberId: string, draft: SetterProfileDraft) => void;
};

export const SettingsSetterTableRow = ({
  setterProfile,
  botUsername,
  isSaving,
  onSave,
}: SettingsSetterTableRowProps) => {
  const { t } = useLingui();
  const { copyToClipboard } = useCopyToClipboard();
  const [draft, setDraft] = useState<SetterProfileDraft>(() =>
    toSetterProfileDraft(setterProfile),
  );

  const telegramLink = isNonEmptyString(botUsername)
    ? `https://t.me/${botUsername}?start=${setterProfile.workspaceMemberId}`
    : null;

  return (
    <StyledRow>
      <StyledMemberCell>
        <span>{setterProfile.memberName}</span>
        {isNonEmptyString(setterProfile.memberEmail) && (
          <StyledMemberEmail>{setterProfile.memberEmail}</StyledMemberEmail>
        )}
      </StyledMemberCell>
      <Toggle
        value={draft.isSetter}
        onChange={(isSetter) => setDraft({ ...draft, isSetter })}
      />
      <TextInput
        value={draft.activeDays}
        onChange={(activeDays) => setDraft({ ...draft, activeDays })}
        placeholder="1,2,3,4,5"
      />
      <TextInput
        value={draft.activeStartHour}
        onChange={(activeStartHour) => setDraft({ ...draft, activeStartHour })}
        placeholder="9"
      />
      <TextInput
        value={draft.activeEndHour}
        onChange={(activeEndHour) => setDraft({ ...draft, activeEndHour })}
        placeholder="18"
      />
      <TextInput
        value={draft.dailyLeadCap}
        onChange={(dailyLeadCap) => setDraft({ ...draft, dailyLeadCap })}
        placeholder={t`No cap`}
      />
      <StyledTelegramCell>
        {setterProfile.hasTelegramChatId ? (
          <Status color="green" text={t`Linked`} />
        ) : (
          <Status color="gray" text={t`Not linked`} />
        )}
        {telegramLink !== null && (
          <Button
            title={t`Copy link`}
            variant="tertiary"
            Icon={IconCopy}
            onClick={() =>
              copyToClipboard(telegramLink, t`Telegram link copied`)
            }
          />
        )}
      </StyledTelegramCell>
      <Button
        title={isSaving ? t`Saving…` : t`Save`}
        variant="secondary"
        Icon={IconSend}
        disabled={isSaving}
        onClick={() => onSave(setterProfile.workspaceMemberId, draft)}
      />
    </StyledRow>
  );
};

export const SettingsSetterTableHeaderRow = () => {
  const { t } = useLingui();

  return (
    <StyledRow>
      <span>
        <Trans>Member</Trans>
      </span>
      <span>
        <Trans>Setter</Trans>
      </span>
      <span title={t`Comma-separated ISO weekdays, 1 = Monday`}>
        <Trans>Days</Trans>
      </span>
      <span>
        <Trans>Start hour</Trans>
      </span>
      <span>
        <Trans>End hour</Trans>
      </span>
      <span title={t`Maximum leads per day, empty for no cap`}>
        <Trans>Cap</Trans>
      </span>
      <span>
        <Trans>Telegram</Trans>
      </span>
      <span />
    </StyledRow>
  );
};
