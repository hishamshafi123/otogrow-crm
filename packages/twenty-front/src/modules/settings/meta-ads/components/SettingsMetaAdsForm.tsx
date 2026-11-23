import { Controller, FormProvider } from 'react-hook-form';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { SaveAndCancelButtons } from '@/settings/components/SaveAndCancelButtons/SaveAndCancelButtons';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsSkeletonLoader } from '@/settings/components/SettingsSkeletonLoader';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { useMetaAdsConfigForm } from '@/settings/meta-ads/hooks/useMetaAdsConfigForm';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { IconCopy, IconTrash } from 'twenty-ui/icon';
import { Button, Toggle } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

const DELETE_META_ADS_CONFIG_MODAL_ID = 'delete-meta-ads-config-modal';

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

export const SettingsMetaAdsForm = () => {
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
    metaAdsConfig,
    isConfigExisting,
    error,
  } = useMetaAdsConfigForm();

  const leadgenWebhookUrl = isDefined(currentWorkspace?.id)
    ? `${REACT_APP_SERVER_BASE_URL}/webhooks/meta/${currentWorkspace.id}/leadgen`
    : undefined;

  if (loading || isDefined(error)) {
    return <SettingsSkeletonLoader />;
  }

  const appSecretPlaceholder =
    metaAdsConfig?.hasAppSecret === true &&
    isDefined(metaAdsConfig.appSecretLastFour)
      ? t`unchanged (••••${metaAdsConfig.appSecretLastFour})`
      : t`Meta app secret`;

  const pageAccessTokenPlaceholder =
    metaAdsConfig?.hasPageAccessToken === true &&
    isDefined(metaAdsConfig.pageAccessTokenLastFour)
      ? t`unchanged (••••${metaAdsConfig.pageAccessTokenLastFour})`
      : t`Page access token`;

  return (
    // oxlint-disable-next-line react/jsx-props-no-spreading
    <FormProvider {...formConfig}>
      <SettingsPageLayout
        title={t`Meta ads`}
        links={[
          {
            children: t`Workspace`,
            href: getSettingsPath(SettingsPath.General),
          },
          { children: t`Meta ads` },
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
              description={t`Connect your Meta app and Facebook page to import lead ad submissions`}
            />
            <Controller
              name="appId"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="meta-ads-app-id"
                  label={t`App ID`}
                  placeholder="1234567890123456"
                  value={value}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                  autoFocus={!isConfigExisting}
                />
              )}
            />
            <Controller
              name="appSecret"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="meta-ads-app-secret"
                  label={t`App secret`}
                  type="password"
                  placeholder={appSecretPlaceholder}
                  value={value ?? ''}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                />
              )}
            />
            <Controller
              name="pageId"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="meta-ads-page-id"
                  label={t`Page ID`}
                  placeholder="109876543210987"
                  value={value}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                />
              )}
            />
            <Controller
              name="pageAccessToken"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="meta-ads-page-access-token"
                  label={t`Page access token`}
                  type="password"
                  placeholder={pageAccessTokenPlaceholder}
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
              title={t`Lead ads`}
              description={t`Optionally restrict intake to a single lead ad form; leave empty to accept every form of the page`}
            />
            <Controller
              name="formId"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId="meta-ads-form-id"
                  label={t`Lead form ID`}
                  placeholder={t`All forms`}
                  value={value ?? ''}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                />
              )}
            />
          </Section>
          <Section>
            <H2Title
              title={t`Verify token`}
              description={t`Paste this token in the Meta webhook subscription; it is generated automatically when you save`}
            />
            <SettingsTextInput
              instanceId="meta-ads-verify-token"
              value={metaAdsConfig?.verifyToken ?? ''}
              placeholder={t`Generated automatically on save`}
              onChange={() => {}}
              readOnly
              fullWidth
              RightIcon={
                isDefined(metaAdsConfig?.verifyToken) ? IconCopy : undefined
              }
              onRightIconClick={() =>
                copyToClipboard(
                  metaAdsConfig?.verifyToken ?? '',
                  t`Verify token copied to clipboard`,
                )
              }
            />
          </Section>
          {isDefined(leadgenWebhookUrl) && (
            <Section>
              <H2Title
                title={t`Leadgen webhook`}
                description={t`Set this URL as the callback of the leadgen webhook subscription in your Meta app`}
              />
              <SettingsTextInput
                instanceId="meta-ads-leadgen-webhook-url"
                value={leadgenWebhookUrl}
                onChange={() => {}}
                readOnly
                fullWidth
                RightIcon={IconCopy}
                onRightIconClick={() =>
                  copyToClipboard(
                    leadgenWebhookUrl,
                    t`Webhook URL copied to clipboard`,
                  )
                }
              />
            </Section>
          )}
          <Section>
            <H2Title
              title={t`Active`}
              description={t`Inactive configurations no longer accept lead ad submissions`}
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
                description={t`Delete this Meta ads configuration`}
              />
              <Button
                accent="danger"
                variant="secondary"
                title={t`Delete`}
                Icon={IconTrash}
                onClick={() => openModal(DELETE_META_ADS_CONFIG_MODAL_ID)}
              />
            </Section>
          )}
        </SettingsPageContainer>
      </SettingsPageLayout>
      {isConfigExisting && (
        <ConfirmationModal
          confirmationPlaceholder={t`yes`}
          confirmationValue={t`yes`}
          modalInstanceId={DELETE_META_ADS_CONFIG_MODAL_ID}
          title={t`Delete Meta ads configuration`}
          subtitle={
            <Trans>
              Please type "yes" to confirm you want to delete this Meta ads
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
