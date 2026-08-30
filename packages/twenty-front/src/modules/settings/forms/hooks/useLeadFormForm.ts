import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import { LeadFormFormMode } from '@/settings/forms/constants/LeadFormFormMode';
import { LEAD_FORM_FIELD_DEFINITIONS } from '@/settings/forms/constants/LeadFormFieldDefinitions';
import {
  leadFormFormSchema,
  type LeadFormFormValues,
} from '@/settings/forms/validation-schemas/leadFormFormSchema';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useMutation, useQuery } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { SettingsPath } from 'twenty-shared/types';
import {
  CreateFormDocument,
  DeleteFormDocument,
  GetFormDocument,
  UpdateFormDocument,
} from '~/generated-metadata/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

type UseLeadFormFormProps = {
  formId?: string;
  mode: LeadFormFormMode;
};

const DEFAULT_ENABLED_KEYS = ['firstName', 'lastName', 'email'];

const DEFAULT_FORM_VALUES: LeadFormFormValues = {
  name: '',
  successMessage: '',
  isActive: true,
  fields: LEAD_FORM_FIELD_DEFINITIONS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    type: definition.type,
    enabled: DEFAULT_ENABLED_KEYS.includes(definition.key),
    required: definition.key === 'email',
  })),
};

export const useLeadFormForm = ({ formId, mode }: UseLeadFormFormProps) => {
  const navigate = useNavigateSettings();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const isCreationMode = mode === LeadFormFormMode.Create;

  const [createForm] = useMutation(CreateFormDocument);
  const [updateForm] = useMutation(UpdateFormDocument);
  const [deleteForm] = useMutation(DeleteFormDocument);

  const formConfig = useForm<LeadFormFormValues>({
    mode: isCreationMode ? 'onSubmit' : 'onTouched',
    resolver: zodResolver(leadFormFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const {
    loading,
    error,
    data: formData,
  } = useQuery(GetFormDocument, {
    skip: isCreationMode || !formId,
    variables: {
      id: formId || '',
    },
  });

  useEffect(() => {
    const form = formData?.form;
    if (!form) return;

    formConfig.reset({
      name: form.name,
      successMessage: form.successMessage ?? '',
      isActive: form.isActive,
      fields: LEAD_FORM_FIELD_DEFINITIONS.map((definition) => {
        const existingField = form.fields.find(
          (field) => field.key === definition.key,
        );

        return {
          key: definition.key,
          label: existingField?.label ?? definition.label,
          type: definition.type,
          enabled: !!existingField,
          required: existingField?.required ?? false,
        };
      }),
    });
  }, [formData, formConfig]);

  useSnackBarOnQueryError(error, t`Failed to load form`);

  const { isDirty, isValid, isSubmitting } = formConfig.formState;
  const canSave = isCreationMode
    ? isValid && !isSubmitting
    : isDirty && isValid && !isSubmitting;

  const buildFieldsInput = (formValues: LeadFormFormValues) =>
    formValues.fields
      .filter((field) => field.enabled)
      .map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
      }));

  const handleCreate = async (formValues: LeadFormFormValues) => {
    try {
      const { data } = await createForm({
        variables: {
          input: {
            name: formValues.name,
            fields: buildFieldsInput(formValues),
            successMessage: formValues.successMessage || undefined,
            isActive: formValues.isActive,
          },
        },
      });

      const createdForm = data?.createForm;

      enqueueSuccessSnackBar({
        message: t`Form ${formValues.name} created successfully`,
      });

      navigate(
        createdForm ? SettingsPath.LeadFormDetail : SettingsPath.LeadForms,
        createdForm ? { formId: createdForm.id } : undefined,
      );
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  const handleUpdate = async (formValues: LeadFormFormValues) => {
    if (!formId) {
      enqueueErrorSnackBar({
        message: t`Form ID is required for updates`,
      });
      return;
    }

    try {
      await updateForm({
        variables: {
          input: {
            id: formId,
            update: {
              name: formValues.name,
              fields: buildFieldsInput(formValues),
              successMessage: formValues.successMessage || undefined,
              isActive: formValues.isActive,
            },
          },
        },
      });

      formConfig.reset(formValues);

      enqueueSuccessSnackBar({
        message: t`Form ${formValues.name} updated successfully`,
      });
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  const handleSave = isCreationMode ? handleCreate : handleUpdate;

  const handleDelete = async () => {
    if (!formId) {
      enqueueErrorSnackBar({
        message: t`Form ID is required for deletion`,
      });
      return;
    }

    try {
      await deleteForm({
        variables: { id: formId },
      });
      enqueueSuccessSnackBar({
        message: t`Form deleted successfully`,
      });

      navigate(SettingsPath.LeadForms);
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  return {
    formConfig,
    loading,
    canSave,
    handleSave,
    handleDelete,
    isCreationMode,
    error,
    publicId: formData?.form?.publicId,
  };
};
