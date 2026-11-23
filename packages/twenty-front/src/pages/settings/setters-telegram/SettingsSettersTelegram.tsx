import { Controller, FormProvider } from 'react-hook-form';

import { SaveAndCancelButtons } from '@/settings/components/SaveAndCancelButtons/SaveAndCancelButtons';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsSkeletonLoader } from '@/settings/components/SettingsSkeletonLoader';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import {
  SettingsSetterTableHeaderRow,
  SettingsSetterTableRow,
} from '@/settings/setters/components/SettingsSetterTableRow';
import { useSetterProfiles } from '@/settings/setters/hooks/useSetterProfiles';
import { useTelegramConfigForm } from '@/settings/setters/hooks/useTelegramConfigForm';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { Button, Toggle } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const StyledActiveRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[3]};
  padding: 10px 14px;
  width: fit-content;
`;

const StyledTestConnectionRow = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledTableContainer = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px;
  box-shadow:
    0 1px 2px ${themeCssVariables.color.transparent.gray2},
    0 8px 24px -18px ${themeCssVariables.color.transparent.gray5},
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  overflow-x: auto;
`;

export const SettingsSettersTelegram = () => {
  const { t } = useLingui();
  const {
    formConfig,
    loading,
    canSave,
    handleSave,
    handleTestConnection,
    telegramConfig,
    isConfigExisting,
    error,
  } = useTelegramConfigForm();

  const {
    loading: isLoadingSetters,
    setterProfiles,
    savingMemberId,
    saveSetterProfile,
  } = useSetterProfiles();

  if (loading || isDefined(error)) {
    return <SettingsSkeletonLoader />;
  }

  const botTokenPlaceholder =
    telegramConfig?.hasBotToken === true &&
    isDefined(telegramConfig.botTokenLastFour)
      ? t`unchanged (••••${telegramConfig.botTokenLastFour})`
      : t`Telegram bot token`;

  return (
    // oxlint-disable-next-line react/jsx-props-no-spreading
    <FormProvider {...formConfig}>
      <SettingsPageLayout
        title={t`Setters & Telegram`}
        links={[
          {
            children: t`Workspace`,
            href: getSettingsPath(SettingsPath.General),
          },
          { children: t`Setters & Telegram` },
        ]}
        actionButton={
          <SaveAndCancelButtons
            isSaveDisabled={!canSave}
            isCancelDisabled={formConfig.formState.isSubmitting}
            onCancel={() => formConfig.reset()}
            onSave={formConfig.handleSubmit(handleSave)}
          />
        }
      >
        <SettingsPageContainer>
          <Section>
            <H2Title
              title={t`Telegram bot`}
              description={t`Connect a Telegram bot to ping setters when a new lead is assigned. Create one with @BotFather in Telegram.`}
            />
            <Controller
              name="botToken"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="telegram-bot-token"
                  label={t`Bot token`}
                  type="password"
                  placeholder={botTokenPlaceholder}
                  value={value ?? ''}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                  autoFocus={!isConfigExisting}
                />
              )}
            />
            <Controller
              name="botUsername"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="telegram-bot-username"
                  label={t`Bot username`}
                  placeholder="otogrow_bot"
                  value={value ?? ''}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                />
              )}
            />
            <StyledTestConnectionRow>
              <Button
                title={t`Test connection`}
                variant="secondary"
                disabled={!isConfigExisting}
                onClick={handleTestConnection}
              />
            </StyledTestConnectionRow>
          </Section>
          <Section>
            <H2Title
              title={t`Active`}
              description={t`Inactive configurations stop assignment pings and bot replies`}
            />
            <StyledActiveRow>
              <Controller
                name="isActive"
                control={formConfig.control}
                render={({ field: { onChange, value } }) => (
                  <Toggle value={value} onChange={onChange} />
                )}
              />
              <span>
                {formConfig.watch('isActive') ? t`Active` : t`Inactive`}
              </span>
            </StyledActiveRow>
          </Section>
          <Section>
            <H2Title
              title={t`Setters`}
              description={t`Workspace members eligible for round-robin lead assignment. Each setter opens their Telegram link and presses Start to receive pings.`}
            />
            {isLoadingSetters ? (
              <SettingsSkeletonLoader />
            ) : (
              <StyledTableContainer>
                <SettingsSetterTableHeaderRow />
                {setterProfiles.map((setterProfile) => (
                  <SettingsSetterTableRow
                    key={setterProfile.workspaceMemberId}
                    setterProfile={setterProfile}
                    botUsername={telegramConfig?.botUsername ?? null}
                    isSaving={
                      savingMemberId === setterProfile.workspaceMemberId
                    }
                    onSave={saveSetterProfile}
                  />
                ))}
              </StyledTableContainer>
            )}
          </Section>
          {!isConfigExisting && (
            <Section>
              <H2Title
                title={t`Setup`}
                description={t`1. Message @BotFather in Telegram and create a bot. 2. Paste the token above and save. 3. Mark members as setters. 4. Each setter copies their link, opens it in Telegram and presses Start.`}
              />
              <Trans>
                Save the bot token first — the per-setter Telegram links appear
                once the bot username is known (save, then Test connection).
              </Trans>
            </Section>
          )}
        </SettingsPageContainer>
      </SettingsPageLayout>
    </FormProvider>
  );
};
