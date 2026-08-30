import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { TextArea } from '@/ui/input/components/TextArea';
import { TextInput } from '@/ui/input/components/TextInput';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

type PublicFormField = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea';
  required: boolean;
};

type PublicFormDefinition = {
  name: string;
  fields: PublicFormField[];
  successMessage: string | null;
};

type PageState = 'loading' | 'not-found' | 'ready' | 'submitted';

const StyledPage = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledCard = styled.div`
  background-color: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  max-width: 480px;
  padding: ${themeCssVariables.spacing[6]};
  width: 100%;
`;

const StyledLogo = styled.img`
  align-self: center;
  height: 48px;
  width: 48px;
`;

const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
  text-align: center;
`;

const StyledMessage = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  text-align: center;
`;

const StyledErrorMessage = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.sm};
  text-align: center;
`;

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledHoneypotField = styled.div`
  display: none;
`;

export const PublicLeadForm = () => {
  const { t } = useLingui();
  const { publicId } = useParams<{ publicId: string }>();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [formDefinition, setFormDefinition] =
    useState<PublicFormDefinition | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Honeypot: bots fill it, humans never see it
  const [honeypot, setHoneypot] = useState('');

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const response = await fetch(
          `${REACT_APP_SERVER_BASE_URL}/forms/${publicId}`,
        );

        if (!response.ok) {
          setPageState('not-found');
          return;
        }

        const data = (await response.json()) as PublicFormDefinition;
        setFormDefinition(data);
        setPageState('ready');
      } catch {
        setPageState('not-found');
      }
    };

    fetchForm();
  }, [publicId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isDefined(formDefinition)) {
      return;
    }

    const requiredFieldError = t`This field is required`;
    const newFieldErrors: Record<string, string> = {};

    for (const field of formDefinition.fields) {
      if (field.required && !isNonEmptyString(values[field.key]?.trim())) {
        newFieldErrors[field.key] = requiredFieldError;
      }
    }

    setFieldErrors(newFieldErrors);

    if (Object.keys(newFieldErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/forms/${publicId}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values, _hp: honeypot }),
        },
      );

      if (response.ok) {
        setPageState('submitted');
        return;
      }

      if (response.status === 429) {
        setSubmitError(
          t`Too many attempts. Please wait a few minutes and try again.`,
        );
        return;
      }

      setSubmitError(t`Something went wrong. Please try again.`);
    } catch {
      setSubmitError(t`Something went wrong. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: PublicFormField) => {
    const value = values[field.key] ?? '';
    const error = fieldErrors[field.key];
    const label = field.required ? `${field.label} *` : field.label;

    const handleChange = (newValue: string) =>
      setValues((currentValues) => ({
        ...currentValues,
        [field.key]: newValue,
      }));

    if (field.type === 'textarea') {
      return (
        <TextArea
          key={field.key}
          textAreaId={`public-form-${field.key}`}
          label={label}
          value={value}
          onChange={handleChange}
          minRows={4}
          maxRows={8}
        />
      );
    }

    const inputType =
      field.type === 'email'
        ? 'email'
        : field.type === 'phone'
          ? 'tel'
          : 'text';

    return (
      <TextInput
        key={field.key}
        label={label}
        type={inputType}
        value={value}
        onChange={handleChange}
        error={error}
        fullWidth
      />
    );
  };

  const renderContent = () => {
    if (pageState === 'loading') {
      return (
        <StyledMessage>
          <Trans>Loading…</Trans>
        </StyledMessage>
      );
    }

    if (pageState === 'not-found' || !isDefined(formDefinition)) {
      return (
        <>
          <StyledTitle>{t`Form unavailable`}</StyledTitle>
          <StyledMessage>
            <Trans>This form does not exist or is no longer active.</Trans>
          </StyledMessage>
        </>
      );
    }

    if (pageState === 'submitted') {
      return (
        <>
          <StyledTitle>{formDefinition.name}</StyledTitle>
          <StyledMessage>
            {isNonEmptyString(formDefinition.successMessage)
              ? formDefinition.successMessage
              : t`Thank you! Your submission has been received.`}
          </StyledMessage>
        </>
      );
    }

    return (
      <>
        <StyledTitle>{formDefinition.name}</StyledTitle>
        <StyledForm onSubmit={handleSubmit}>
          {formDefinition.fields.map(renderField)}
          <StyledHoneypotField aria-hidden="true">
            <input
              type="text"
              name="_hp"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />
          </StyledHoneypotField>
          {isDefined(submitError) && (
            <StyledErrorMessage>{submitError}</StyledErrorMessage>
          )}
          <Button
            title={isSubmitting ? t`Submitting…` : t`Submit`}
            type="submit"
            variant="primary"
            fullWidth
            disabled={isSubmitting}
          />
        </StyledForm>
      </>
    );
  };

  return (
    <StyledPage>
      <StyledCard>
        <StyledLogo
          src="/images/brand/otogrow-logo-192.png"
          alt={t`Otogrow logo`}
        />
        {renderContent()}
      </StyledCard>
    </StyledPage>
  );
};
