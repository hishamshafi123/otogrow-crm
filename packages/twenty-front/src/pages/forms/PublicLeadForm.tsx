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
  background-color: ${themeCssVariables.background.secondary};
  background-image:
    radial-gradient(
      820px 420px at 20% 0%,
      ${themeCssVariables.color.transparent.iris3},
      transparent 58%
    ),
    radial-gradient(
      680px 360px at 84% 100%,
      ${themeCssVariables.color.transparent.cyan2},
      transparent 56%
    );
  display: flex;
  flex: 1;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]} ${themeCssVariables.spacing[4]};
  width: 100%;
`;

const StyledCard = styled.div`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    420px circle at 50% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 56%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 20px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 2px 4px ${themeCssVariables.boxShadow.color},
    0 24px 54px -26px ${themeCssVariables.boxShadow.color};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
  max-width: 500px;
  overflow: hidden;
  padding: 32px;
  position: relative;
  width: 100%;

  &::before {
    background: linear-gradient(
      90deg,
      transparent 0%,
      ${themeCssVariables.color.iris8} 35%,
      ${themeCssVariables.color.cyan8} 65%,
      transparent 100%
    );
    content: '';
    height: 2px;
    inset: 0 0 auto;
    pointer-events: none;
    position: absolute;
  }
`;

const StyledLogo = styled.img`
  align-self: center;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  box-shadow: 0 8px 20px -10px ${themeCssVariables.color.transparent.iris7};
  height: 52px;
  padding: 6px;
  width: 52px;
`;

const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: 24px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.025em;
  margin: 0;
  text-align: center;
`;

const StyledMessage = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1.5;
  text-align: center;
`;

const StyledErrorMessage = styled.div`
  background: ${themeCssVariables.color.transparent.red2};
  border: 1px solid ${themeCssVariables.color.transparent.red6};
  border-radius: 10px;
  color: ${themeCssVariables.color.red11};
  font-size: ${themeCssVariables.font.size.sm};
  padding: 10px 12px;
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
