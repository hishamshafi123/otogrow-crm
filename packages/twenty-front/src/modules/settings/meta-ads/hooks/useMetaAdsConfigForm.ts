import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import {
  metaAdsConfigFormSchema,
  type MetaAdsConfigFormValues,
} from '@/settings/meta-ads/validation-schemas/metaAdsConfigFormSchema';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useMutation, useQuery } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import {
  DeleteMetaAdsConfigDocument,
  GetMetaAdsConfigDocument,
  TestMetaAdsConnectionDocument,
  UpsertMetaAdsConfigDocument,
} from '~/generated-metadata/graphql';

const DEFAULT_FORM_VALUES: MetaAdsConfigFormValues = {
  appId: '',
  appSecret: '',
  pageId: '',
  pageAccessToken: '',
  verifyToken: '',
  formId: '',
  isActive: true,
};

export const useMetaAdsConfigForm = () => {
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const [upsertMetaAdsConfig] = useMutation(UpsertMetaAdsConfigDocument);
  const [deleteMetaAdsConfig] = useMutation(DeleteMetaAdsConfigDocument);
  const [testMetaAdsConnection] = useMutation(TestMetaAdsConnectionDocument);

  const formConfig = useForm<MetaAdsConfigFormValues>({
    mode: 'onTouched',
    resolver: zodResolver(metaAdsConfigFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const {
    loading,
    error,
    data: metaAdsConfigData,
  } = useQuery(GetMetaAdsConfigDocument);

  const metaAdsConfig = metaAdsConfigData?.metaAdsConfig;
  const isConfigExisting = isDefined(metaAdsConfig);

  useEffect(() => {
    if (!isDefined(metaAdsConfig)) return;

    formConfig.reset({
      appId: metaAdsConfig.appId,
      // The raw secrets never leave the server; an empty field means "keep".
      appSecret: '',
      pageId: metaAdsConfig.pageId,
      pageAccessToken: '',
      verifyToken: metaAdsConfig.verifyToken,
      formId: metaAdsConfig.formId ?? '',
      isActive: metaAdsConfig.isActive,
    });
  }, [metaAdsConfig, formConfig]);

  useSnackBarOnQueryError(error, t`Failed to load Meta ads configuration`);

  const { isDirty, isValid, isSubmitting } = formConfig.formState;
  const canSave = isConfigExisting
    ? isDirty && isValid && !isSubmitting
    : isValid && !isSubmitting;

  const handleSave = async (formValues: MetaAdsConfigFormValues) => {
    if (
      !isConfigExisting &&
      (!isNonEmptyString(formValues.appSecret) ||
        !isNonEmptyString(formValues.pageAccessToken))
    ) {
      formConfig.setError('appSecret', {
        message: t`App secret is required`,
      });
      return;
    }

    try {
      await upsertMetaAdsConfig({
        variables: {
          input: {
            appId: formValues.appId,
            ...(isNonEmptyString(formValues.appSecret)
              ? { appSecret: formValues.appSecret }
              : {}),
            pageId: formValues.pageId,
            ...(isNonEmptyString(formValues.pageAccessToken)
              ? { pageAccessToken: formValues.pageAccessToken }
              : {}),
            ...(isNonEmptyString(formValues.verifyToken)
              ? { verifyToken: formValues.verifyToken }
              : {}),
            ...(isNonEmptyString(formValues.formId)
              ? { formId: formValues.formId }
              : {}),
            isActive: formValues.isActive,
          },
        },
        refetchQueries: [GetMetaAdsConfigDocument],
        awaitRefetchQueries: true,
      });

      formConfig.reset({ ...formValues, appSecret: '', pageAccessToken: '' });

      enqueueSuccessSnackBar({
        message: t`Meta ads configuration saved successfully`,
      });
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  const handleTestConnection = async () => {
    try {
      const { data } = await testMetaAdsConnection();

      if (data?.testMetaAdsConnection === true) {
        enqueueSuccessSnackBar({ message: t`Meta connection successful` });
      } else {
        enqueueErrorSnackBar({ message: t`Meta connection failed` });
      }
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMetaAdsConfig({
        refetchQueries: [GetMetaAdsConfigDocument],
        awaitRefetchQueries: true,
      });

      formConfig.reset(DEFAULT_FORM_VALUES);

      enqueueSuccessSnackBar({
        message: t`Meta ads configuration deleted successfully`,
      });
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
    handleTestConnection,
    metaAdsConfig,
    isConfigExisting,
    error,
  };
};
