import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import {
  twilioConfigFormSchema,
  type TwilioConfigFormValues,
} from '@/settings/twilio/validation-schemas/twilioConfigFormSchema';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useMutation, useQuery } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import {
  DeleteTwilioConfigDocument,
  GetTwilioConfigDocument,
  ProvisionTwilioCallingDocument,
  TestTwilioConnectionDocument,
  UpsertTwilioConfigDocument,
} from '~/generated-metadata/graphql';

const DEFAULT_FORM_VALUES: TwilioConfigFormValues = {
  accountSid: '',
  authToken: '',
  whatsappSenderNumber: '',
  smsNumber: '',
  isActive: true,
};

export const useTwilioConfigForm = () => {
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const [upsertTwilioConfig] = useMutation(UpsertTwilioConfigDocument);
  const [deleteTwilioConfig] = useMutation(DeleteTwilioConfigDocument);
  const [testTwilioConnection] = useMutation(TestTwilioConnectionDocument);

  const formConfig = useForm<TwilioConfigFormValues>({
    mode: 'onTouched',
    resolver: zodResolver(twilioConfigFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const {
    loading,
    error,
    data: twilioConfigData,
  } = useQuery(GetTwilioConfigDocument);

  const twilioConfig = twilioConfigData?.twilioConfig;
  const isConfigExisting = isDefined(twilioConfig);

  useEffect(() => {
    if (!isDefined(twilioConfig)) return;

    formConfig.reset({
      accountSid: twilioConfig.accountSid,
      // The raw token never leaves the server; an empty field means "keep".
      authToken: '',
      whatsappSenderNumber: twilioConfig.whatsappSenderNumber ?? '',
      smsNumber: twilioConfig.smsNumber ?? '',
      isActive: twilioConfig.isActive,
    });
  }, [twilioConfig, formConfig]);

  useSnackBarOnQueryError(error, t`Failed to load Twilio configuration`);

  const { isDirty, isValid, isSubmitting } = formConfig.formState;
  const canSave = isConfigExisting
    ? isDirty && isValid && !isSubmitting
    : isValid && !isSubmitting;

  const handleSave = async (formValues: TwilioConfigFormValues) => {
    if (!isConfigExisting && !isNonEmptyString(formValues.authToken)) {
      formConfig.setError('authToken', {
        message: t`Auth token is required`,
      });
      return;
    }

    try {
      await upsertTwilioConfig({
        variables: {
          input: {
            accountSid: formValues.accountSid,
            ...(isNonEmptyString(formValues.authToken)
              ? { authToken: formValues.authToken }
              : {}),
            ...(isNonEmptyString(formValues.whatsappSenderNumber)
              ? { whatsappSenderNumber: formValues.whatsappSenderNumber }
              : {}),
            ...(isNonEmptyString(formValues.smsNumber)
              ? { smsNumber: formValues.smsNumber }
              : {}),
            isActive: formValues.isActive,
          },
        },
        refetchQueries: [GetTwilioConfigDocument],
        awaitRefetchQueries: true,
      });

      formConfig.reset({ ...formValues, authToken: '' });

      enqueueSuccessSnackBar({
        message: t`Twilio configuration saved successfully`,
      });
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  const handleTestConnection = async () => {
    try {
      const { data } = await testTwilioConnection();

      if (data?.testTwilioConnection === true) {
        enqueueSuccessSnackBar({ message: t`Twilio connection successful` });
      } else {
        enqueueErrorSnackBar({ message: t`Twilio connection failed` });
      }
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  const [provisionTwilioCalling, { loading: isProvisioningCalling }] =
    useMutation(ProvisionTwilioCallingDocument);

  const handleEnableCalling = async () => {
    try {
      await provisionTwilioCalling({
        refetchQueries: [GetTwilioConfigDocument],
        awaitRefetchQueries: true,
      });

      enqueueSuccessSnackBar({
        message: t`Calling enabled — browser calls are ready`,
      });
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTwilioConfig({
        refetchQueries: [GetTwilioConfigDocument],
        awaitRefetchQueries: true,
      });

      formConfig.reset(DEFAULT_FORM_VALUES);

      enqueueSuccessSnackBar({
        message: t`Twilio configuration deleted successfully`,
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
    handleEnableCalling,
    isProvisioningCalling,
    twilioConfig,
    isConfigExisting,
    error,
  };
};
