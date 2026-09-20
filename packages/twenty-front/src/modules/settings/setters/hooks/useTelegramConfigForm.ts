import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useSnackBarOnQueryError } from '@/apollo/hooks/useSnackBarOnQueryError';
import { GET_TELEGRAM_CONFIG } from '@/settings/setters/graphql/queries/getTelegramConfig';
import { TEST_TELEGRAM_CONNECTION } from '@/settings/setters/graphql/mutations/testTelegramConnection';
import { UPSERT_TELEGRAM_CONFIG } from '@/settings/setters/graphql/mutations/upsertTelegramConfig';
import { type TelegramConfig } from '@/settings/setters/types/setters.types';
import {
  telegramConfigFormSchema,
  type TelegramConfigFormValues,
} from '@/settings/setters/validation-schemas/telegramConfigFormSchema';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useMutation, useQuery } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

const DEFAULT_FORM_VALUES: TelegramConfigFormValues = {
  botToken: '',
  botUsername: '',
  isActive: true,
};

export const useTelegramConfigForm = () => {
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const [upsertTelegramConfig] = useMutation<{
    upsertTelegramConfig: TelegramConfig;
  }>(UPSERT_TELEGRAM_CONFIG);
  const [testTelegramConnection] = useMutation<{
    testTelegramConnection: boolean;
  }>(TEST_TELEGRAM_CONNECTION);

  const formConfig = useForm<TelegramConfigFormValues>({
    mode: 'onTouched',
    resolver: zodResolver(telegramConfigFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const {
    loading,
    error,
    data: telegramConfigData,
  } = useQuery<{ telegramConfig: TelegramConfig | null }>(GET_TELEGRAM_CONFIG);

  const telegramConfig = telegramConfigData?.telegramConfig;
  const isConfigExisting = isDefined(telegramConfig);

  useEffect(() => {
    if (!isDefined(telegramConfig)) return;

    formConfig.reset({
      // The raw token never leaves the server; an empty field means "keep".
      botToken: '',
      botUsername: telegramConfig.botUsername ?? '',
      isActive: telegramConfig.isActive,
    });
  }, [telegramConfig, formConfig]);

  useSnackBarOnQueryError(error, t`Failed to load Telegram configuration`);

  const { isDirty, isValid, isSubmitting } = formConfig.formState;
  const canSave = isConfigExisting
    ? isDirty && isValid && !isSubmitting
    : isValid && !isSubmitting;

  const handleSave = async (formValues: TelegramConfigFormValues) => {
    if (!isConfigExisting && !isNonEmptyString(formValues.botToken)) {
      formConfig.setError('botToken', {
        message: t`Bot token is required`,
      });
      return;
    }

    try {
      await upsertTelegramConfig({
        variables: {
          input: {
            ...(isNonEmptyString(formValues.botToken)
              ? { botToken: formValues.botToken }
              : {}),
            ...(isNonEmptyString(formValues.botUsername)
              ? { botUsername: formValues.botUsername }
              : {}),
            isActive: formValues.isActive,
          },
        },
        refetchQueries: [GET_TELEGRAM_CONFIG],
        awaitRefetchQueries: true,
      });

      formConfig.reset({ ...formValues, botToken: '' });

      enqueueSuccessSnackBar({
        message: t`Telegram configuration saved successfully`,
      });
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  const handleTestConnection = async () => {
    try {
      const { data } = await testTelegramConnection({
        refetchQueries: [GET_TELEGRAM_CONFIG],
        awaitRefetchQueries: true,
      });

      if (data?.testTelegramConnection === true) {
        enqueueSuccessSnackBar({ message: t`Telegram connection successful` });
      } else {
        enqueueErrorSnackBar({ message: t`Telegram connection failed` });
      }
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
    handleTestConnection,
    telegramConfig,
    isConfigExisting,
    error,
  };
};
