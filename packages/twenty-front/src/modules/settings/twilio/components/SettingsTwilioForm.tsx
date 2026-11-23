import { Controller, FormProvider } from 'react-hook-form';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { SaveAndCancelButtons } from '@/settings/components/SaveAndCancelButtons/SaveAndCancelButtons';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsSkeletonLoader } from '@/settings/components/SettingsSkeletonLoader';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { useTwilioConfigForm } from '@/settings/twilio/hooks/useTwilioConfigForm';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { IconCopy, IconPhone, IconTrash } from 'twenty-ui/icon';
import { Button, Toggle } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { Status } from 'twenty-ui/data-display';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

const DELETE_TWILIO_CONFIG_MODAL_ID = 'delete-twilio-config-modal';

const StyledActiveRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
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

export const SettingsTwilioForm = () => {
  const { t } = useLingui();
  const { openModal } = useModal();
  const { copyToClipboard } = useCopyToClipboard();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const {
    formConfig,
    loading,
    canSave,
    handleSave,
    handleDelete,
    handleTestConnection,
    handleEnableCalling,
    isProvisioningCalling,
    twilioConfig,
    isConfigExisting,
    error,
  } = useTwilioConfigForm();

  const inboundWebhookUrl = isDefined(currentWorkspace?.id)
    ? `${REACT_APP_SERVER_BASE_URL}/webhooks/twilio/${currentWorkspace.id}/inbound`
    : undefined;

  if (loading || isDefined(error)) {
    return <SettingsSkeletonLoader />;
  }

  const authTokenPlaceholder =
    twilioConfig?.hasAuthToken === true &&
    isDefined(twilioConfig.authTokenLastFour)
      ? t`unchanged (••••${twilioConfig.authTokenLastFour})`
      : t`Twilio auth token`;

  return (
    // oxlint-disable-next-line react/jsx-props-no-spreading
    <FormProvider {...formConfig}>
      <SettingsPageLayout
        title={t`Twilio`}
        links={[
          {
            children: t`Workspace`,
            href: getSettingsPath(SettingsPath.General),
          },
          { children: t`Twilio` },
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
              title={t`Credentials`}
              description={t`Connect your Twilio account to send WhatsApp and SMS messages`}
            />
            <Controller
              name="accountSid"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="twilio-account-sid"
                  label={t`Account SID`}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={value}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                  autoFocus={!isConfigExisting}
                />
              )}
            />
            <Controller
              name="authToken"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="twilio-auth-token"
                  label={t`Auth token`}
                  type="password"
                  placeholder={authTokenPlaceholder}
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
              title={t`Sender numbers`}
              description={t`Phone numbers used for WhatsApp and SMS sequence steps, in E.164 format`}
            />
            <Controller
              name="whatsappSenderNumber"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="twilio-whatsapp-sender-number"
                  label={t`WhatsApp sender number`}
                  placeholder="+15551234567"
                  value={value ?? ''}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                />
              )}
            />
            <Controller
              name="smsNumber"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="twilio-sms-number"
                  label={t`SMS number`}
                  placeholder="+15551234567"
                  value={value ?? ''}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                />
              )}
            />
          </Section>
          {isDefined(inboundWebhookUrl) && (
            <Section>
              <H2Title
                title={t`Inbound webhook`}
                description={t`Set this URL in your Twilio console to receive replies`}
              />
              <SettingsTextInput
                instanceId="twilio-inbound-webhook-url"
                value={inboundWebhookUrl}
                onChange={() => {}}
                readOnly
                fullWidth
                RightIcon={IconCopy}
                onRightIconClick={() =>
                  copyToClipboard(
                    inboundWebhookUrl,
                    t`Webhook URL copied to clipboard`,
                  )
                }
              />
            </Section>
          )}
          <Section>
            <H2Title
              title={t`Calling`}
              description={t`Make and receive phone calls from the browser through your Twilio account`}
            />
            {twilioConfig?.callingEnabled === true ? (
              <StyledActiveRow>
                <Status color="green" text={t`Calling enabled`} />
                {isDefined(twilioConfig.voiceNumber) && (
                  <span>{twilioConfig.voiceNumber}</span>
                )}
              </StyledActiveRow>
            ) : (
              <Button
                title={isProvisioningCalling ? t`Enabling…` : t`Enable calling`}
                variant="secondary"
                Icon={IconPhone}
                disabled={!isConfigExisting || isProvisioningCalling}
                onClick={handleEnableCalling}
              />
            )}
          </Section>
          <Section>
            <H2Title
              title={t`Active`}
              description={t`Inactive configurations no longer send or receive messages`}
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
          {isConfigExisting && (
            <Section>
              <H2Title
                title={t`Danger zone`}
                description={t`Delete this Twilio configuration`}
              />
              <Button
                accent="danger"
                variant="secondary"
                title={t`Delete`}
                Icon={IconTrash}
                onClick={() => openModal(DELETE_TWILIO_CONFIG_MODAL_ID)}
              />
            </Section>
          )}
        </SettingsPageContainer>
      </SettingsPageLayout>
      {isConfigExisting && (
        <ConfirmationModal
          confirmationPlaceholder={t`yes`}
          confirmationValue={t`yes`}
          modalInstanceId={DELETE_TWILIO_CONFIG_MODAL_ID}
          title={t`Delete Twilio configuration`}
          subtitle={
            <Trans>
              Please type "yes" to confirm you want to delete this Twilio
              configuration.
            </Trans>
          }
          onConfirmClick={handleDelete}
          confirmButtonText={t`Delete`}
        />
      )}
    </FormProvider>
  );
};
