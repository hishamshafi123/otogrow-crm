import { Controller, FormProvider } from 'react-hook-form';

import { SaveAndCancelButtons } from '@/settings/components/SaveAndCancelButtons/SaveAndCancelButtons';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsSkeletonLoader } from '@/settings/components/SettingsSkeletonLoader';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { type LeadFormFormMode } from '@/settings/forms/constants/LeadFormFormMode';
import { useLeadFormForm } from '@/settings/forms/hooks/useLeadFormForm';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { TextArea } from '@/ui/input/components/TextArea';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { IconCopy, IconTrash } from 'twenty-ui/icon';
import { Button, Toggle } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

const DELETE_FORM_MODAL_ID = 'delete-lead-form-modal';

type SettingsLeadFormFormProps = {
  formId?: string;
  mode: LeadFormFormMode;
};

const StyledFieldRow = styled.div`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 40px 2fr 80px 1fr;
  padding: ${themeCssVariables.spacing[2]} 0;
`;

const StyledFieldRowHeader = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  display: grid;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 40px 2fr 80px 1fr;
  padding-bottom: ${themeCssVariables.spacing[1]};
  text-transform: uppercase;
`;

const StyledFieldType = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledFieldRowError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledActiveRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledEmbedSnippet = styled.pre`
  background-color: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[2]};
  white-space: pre-wrap;
  word-break: break-all;
`;

const StyledEmbedContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledEmbedRow = styled.div`
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

export const SettingsLeadFormForm = ({
  formId,
  mode,
}: SettingsLeadFormFormProps) => {
  const { t } = useLingui();
  const navigate = useNavigateSettings();
  const { openModal } = useModal();
  const { copyToClipboard } = useCopyToClipboard();
  const {
    formConfig,
    loading,
    canSave,
    handleSave,
    handleDelete,
    isCreationMode,
    error,
    publicId,
  } = useLeadFormForm({ formId, mode });

  const name = formConfig.watch('name');
  const fields = formConfig.watch('fields');

  const getTitle = () => {
    if (isCreationMode) {
      return t`New form`;
    }

    return name;
  };

  if ((loading && !isCreationMode) || isDefined(error)) {
    return <SettingsSkeletonLoader />;
  }

  const nameTextInputId = `${formId ?? 'new'}-name`;
  const hostedFormUrl = isDefined(publicId)
    ? `${window.location.origin}/forms/${publicId}`
    : undefined;
  const iframeSnippet = isDefined(hostedFormUrl)
    ? `<iframe src="${hostedFormUrl}" width="100%" height="600" frameborder="0"></iframe>`
    : undefined;

  const fieldsError = formConfig.formState.errors.fields;

  return (
    // oxlint-disable-next-line react/jsx-props-no-spreading
    <FormProvider {...formConfig}>
      <SettingsPageLayout
        title={getTitle()}
        links={[
          {
            children: t`Workspace`,
            href: getSettingsPath(SettingsPath.General),
          },
          {
            children: t`Lead forms`,
            href: getSettingsPath(SettingsPath.LeadForms),
          },
          { children: isCreationMode ? t`New` : name },
        ]}
        actionButton={
          <SaveAndCancelButtons
            isSaveDisabled={!canSave}
            isCancelDisabled={formConfig.formState.isSubmitting}
            onCancel={() => navigate(SettingsPath.LeadForms)}
            onSave={formConfig.handleSubmit(handleSave)}
          />
        }
      >
        <SettingsPageContainer>
          <Section>
            <H2Title
              title={t`Name`}
              description={t`The name of this form, displayed on the hosted page`}
            />
            <Controller
              name="name"
              control={formConfig.control}
              render={({
                field: { onChange, value },
                fieldState: { error },
              }) => (
                <SettingsTextInput
                  instanceId={nameTextInputId}
                  placeholder={t`Contact us`}
                  value={value}
                  onChange={onChange}
                  error={error?.message}
                  fullWidth
                  autoFocus={isCreationMode}
                />
              )}
            />
          </Section>
          <Section>
            <H2Title
              title={t`Fields`}
              description={t`Choose which fields to collect and which are required`}
            />
            <StyledFieldRowHeader>
              <span>{t`On`}</span>
              <span>{t`Label`}</span>
              <span>{t`Type`}</span>
              <span>{t`Required`}</span>
            </StyledFieldRowHeader>
            {fields.map((field, index) => (
              <StyledFieldRow key={field.key}>
                <Toggle
                  value={field.enabled}
                  onChange={(enabled) =>
                    formConfig.setValue(`fields.${index}.enabled`, enabled, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
                <Controller
                  name={`fields.${index}.label`}
                  control={formConfig.control}
                  render={({
                    field: { onChange, value },
                    fieldState: { error },
                  }) => (
                    <SettingsTextInput
                      instanceId={`${formId ?? 'new'}-field-${field.key}`}
                      value={value}
                      onChange={onChange}
                      error={field.enabled ? error?.message : undefined}
                      disabled={!field.enabled}
                      fullWidth
                    />
                  )}
                />
                <StyledFieldType>{field.type}</StyledFieldType>
                <Toggle
                  value={field.required}
                  disabled={!field.enabled}
                  onChange={(required) =>
                    formConfig.setValue(`fields.${index}.required`, required, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </StyledFieldRow>
            ))}
            {isDefined(fieldsError?.root?.message) && (
              <StyledFieldRowError>
                {fieldsError.root.message}
              </StyledFieldRowError>
            )}
          </Section>
          <Section>
            <H2Title
              title={t`Success message`}
              description={t`Shown to visitors after they submit the form`}
            />
            <Controller
              name="successMessage"
              control={formConfig.control}
              render={({ field: { onChange, value } }) => (
                <TextArea
                  textAreaId={`${formId ?? 'new'}-success-message`}
                  placeholder={t`Thank you! Your submission has been received.`}
                  minRows={3}
                  maxRows={5}
                  value={value || ''}
                  onChange={onChange}
                />
              )}
            />
          </Section>
          {!isCreationMode && (
            <Section>
              <H2Title
                title={t`Active`}
                description={t`Inactive forms no longer accept submissions`}
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
          )}
          {!isCreationMode && isDefined(hostedFormUrl) && (
            <Section>
              <H2Title
                title={t`Share & embed`}
                description={t`Link to the hosted form or embed it on your website`}
              />
              <StyledEmbedContainer>
                <StyledEmbedRow>
                  <SettingsTextInput
                    instanceId={`${formId}-hosted-url`}
                    value={hostedFormUrl}
                    onChange={() => {}}
                    readOnly
                    fullWidth
                    RightIcon={IconCopy}
                    onRightIconClick={() =>
                      copyToClipboard(
                        hostedFormUrl,
                        t`Form URL copied to clipboard`,
                      )
                    }
                  />
                </StyledEmbedRow>
                {isDefined(iframeSnippet) && (
                  <StyledEmbedRow>
                    <StyledEmbedSnippet>{iframeSnippet}</StyledEmbedSnippet>
                    <Button
                      Icon={IconCopy}
                      title={t`Copy embed code`}
                      size="small"
                      variant="secondary"
                      onClick={() =>
                        copyToClipboard(
                          iframeSnippet,
                          t`Embed code copied to clipboard`,
                        )
                      }
                    />
                  </StyledEmbedRow>
                )}
              </StyledEmbedContainer>
            </Section>
          )}
          {!isCreationMode && (
            <Section>
              <H2Title
                title={t`Danger zone`}
                description={t`Delete this form`}
              />
              <Button
                accent="danger"
                variant="secondary"
                title={t`Delete`}
                Icon={IconTrash}
                onClick={() => openModal(DELETE_FORM_MODAL_ID)}
              />
            </Section>
          )}
        </SettingsPageContainer>
      </SettingsPageLayout>
      {!isCreationMode && (
        <ConfirmationModal
          confirmationPlaceholder={t`yes`}
          confirmationValue={t`yes`}
          modalInstanceId={DELETE_FORM_MODAL_ID}
          title={t`Delete form`}
          subtitle={
            <Trans>
              Please type "yes" to confirm you want to delete this form.
            </Trans>
          }
          onConfirmClick={handleDelete}
          confirmButtonText={t`Delete`}
        />
      )}
    </FormProvider>
  );
};
