import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconKey,
  IconRefresh,
  IconUserPlus,
  IconX,
} from 'twenty-ui/icon';
import { GRAY_SCALE_LIGHT } from 'twenty-ui/theme';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

import {
  CREATE_OTOGROW_EMPLOYEE_LOGIN,
  RESET_OTOGROW_EMPLOYEE_PASSWORD,
  type CreatedOtogrowEmployeeLogin,
  type ResetOtogrowEmployeePasswordResult,
} from '@/otogrow-access/employee-login/employee-login.graphql';
import {
  evaluatePasswordStrength,
  formatEmployeeLoginMessage,
  generateEmployeePassword,
  type PasswordStrengthLevel,
} from '@/otogrow-access/employee-login/employee-login.utils';
import { type OtogrowRole } from '@/otogrow-access/otogrow-access.types';

export type EmployeeLoginCrmRoleOption = {
  id: string;
  label: string;
};

export type EmployeeLoginResetTarget = {
  workspaceMemberId: string;
  name: string;
  email?: string;
};

export type EmployeeLoginModalProps = {
  open: boolean;
  mode?: 'create' | 'reset';
  targetMember?: EmployeeLoginResetTarget | null;
  crmRoles?: EmployeeLoginCrmRoleOption[];
  otogrowRoles?: OtogrowRole[];
  onClose: () => void;
  onSuccess?: () => void | Promise<unknown>;
};

type CompletedCredentials = {
  fullName: string;
  firstName: string;
  email: string;
  password: string;
  signInUrl: string;
  otogrowRoleNames: string[];
  isReset: boolean;
};

const StyledBackdrop = styled.div`
  align-items: center;
  backdrop-filter: blur(4px);
  background: ${themeCssVariables.background.overlayPrimary};
  box-sizing: border-box;
  display: flex;
  inset: 0;
  justify-content: center;
  padding: ${themeCssVariables.spacing[4]};
  position: fixed;
  z-index: 1200;
`;

const StyledDialog = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 16px;
  box-shadow: ${themeCssVariables.boxShadow.strong};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-direction: column;
  font-family: ${themeCssVariables.font.family};
  font-size: 14px;
  line-height: 1.5;
  max-height: calc(100vh - 32px);
  max-width: 540px;
  overflow: hidden;
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: flex-start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: 20px 24px 16px;
`;

const StyledHeaderLeft = styled.div`
  align-items: flex-start;
  display: flex;
  gap: 12px;
  min-width: 0;
`;

const StyledIconBadge = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.transparent.iris3};
  border: 1px solid ${themeCssVariables.color.transparent.iris6};
  border-radius: 12px;
  color: ${themeCssVariables.color.iris10};
  display: inline-flex;
  flex: 0 0 auto;
  height: 40px;
  justify-content: center;
  width: 40px;
`;

const StyledHeaderText = styled.div`
  min-width: 0;

  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.3;
    margin: 0;
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
    line-height: 1.45;
    margin: 4px 0 0;
  }
`;

const StyledCloseButton = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  height: 32px;
  justify-content: center;
  padding: 0;
  width: 32px;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 2px;
  }
`;

const StyledBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding: 20px 24px;
`;

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const StyledTwoColumn = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const StyledLabelRow = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
`;

const StyledLabel = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 13px;
  font-weight: 500;
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: 14px;
  height: 40px;
  min-width: 0;
  padding: 0 12px;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
  width: 100%;

  &::placeholder {
    color: ${themeCssVariables.font.color.light};
  }

  &:hover:not(:disabled) {
    border-color: ${themeCssVariables.border.color.strong};
  }

  &:focus {
    border-color: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 0 3px ${themeCssVariables.color.transparent.iris3};
    outline: none;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: 14px;
  height: 40px;
  min-width: 0;
  padding: 0 12px;
  width: 100%;

  &:focus {
    border-color: ${themeCssVariables.color.iris9};
    box-shadow: 0 0 0 3px ${themeCssVariables.color.transparent.iris3};
    outline: none;
  }
`;

const StyledPasswordRow = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
`;

const StyledPasswordInputWrap = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  position: relative;

  input {
    font-family: ${themeCssVariables.code.font.family};
    padding-right: 40px;
  }
`;

const StyledEyeButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  padding: 0;
  position: absolute;
  right: 5px;
  top: 5px;
  width: 30px;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 1px;
  }
`;

const StyledGenerateButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  gap: 6px;
  height: 40px;
  padding: 0 12px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.border.color.strong};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 2px;
  }
`;

const StyledStrengthTrack = styled.div`
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
`;

const StyledStrengthBar = styled.div<{
  active: boolean;
  level: PasswordStrengthLevel;
}>`
  background: ${({ active, level }) => {
    if (!active) return themeCssVariables.background.tertiary;
    if (level === 'strong') return themeCssVariables.color.green9;
    if (level === 'good') return themeCssVariables.color.iris9;
    if (level === 'fair') return themeCssVariables.color.amber9;
    return themeCssVariables.color.red9;
  }};
  border-radius: 999px;
  height: 4px;
  transition: background-color 150ms ease;
`;

const StyledHelperText = styled.small`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: 12px;
  line-height: 1.45;
`;

const StyledRoleList = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 168px;
  overflow-y: auto;
  padding: 8px;
`;

const StyledRoleOption = styled.label<{ checked: boolean }>`
  align-items: flex-start;
  background: ${({ checked }) =>
    checked ? themeCssVariables.color.transparent.iris2 : 'transparent'};
  border: 1px solid
    ${({ checked }) =>
      checked ? themeCssVariables.color.transparent.iris6 : 'transparent'};
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  gap: 10px;
  padding: 8px 10px;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;

  &:hover {
    background: ${({ checked }) =>
      checked
        ? themeCssVariables.color.transparent.iris3
        : themeCssVariables.background.secondary};
  }

  input {
    accent-color: ${themeCssVariables.color.iris9};
    margin: 3px 0 0;
  }
`;

const StyledRoleCopy = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    font-weight: 600;
  }

  small {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    line-height: 1.35;
  }
`;

const StyledErrorBanner = styled.div`
  background: ${themeCssVariables.color.transparent.red2};
  border: 1px solid ${themeCssVariables.color.transparent.red6};
  border-radius: 10px;
  color: ${themeCssVariables.color.red11};
  font-size: 13px;
  line-height: 1.45;
  padding: 10px 12px;
`;

const StyledSuccessBanner = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.transparent.green2};
  border: 1px solid ${themeCssVariables.color.transparent.green6};
  border-radius: 12px;
  color: ${themeCssVariables.color.green11};
  display: flex;
  gap: 10px;
  padding: 12px 14px;

  strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
  }

  span {
    display: block;
    font-size: 12.5px;
    opacity: 0.9;
  }
`;

const StyledSuccessIcon = styled.div`
  align-items: center;
  background: ${themeCssVariables.color.green9};
  border-radius: 999px;
  color: ${GRAY_SCALE_LIGHT.gray1};
  display: inline-flex;
  flex: 0 0 auto;
  height: 26px;
  justify-content: center;
  width: 26px;
`;

const StyledCredentialsBox = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StyledCredentialRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 12px 14px;

  &:last-child {
    border-bottom: 0;
  }
`;

const StyledCredentialMeta = styled.div`
  min-width: 0;

  small {
    color: ${themeCssVariables.font.color.tertiary};
    display: block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
`;

const StyledCredentialValue = styled.div<{ monospace?: boolean }>`
  color: ${themeCssVariables.font.color.primary};
  font-family: ${({ monospace }) =>
    monospace ? themeCssVariables.code.font.family : 'inherit'};
  font-size: 13.5px;
  font-weight: 500;
  margin-top: 2px;
  overflow-wrap: anywhere;

  a {
    align-items: center;
    color: ${themeCssVariables.color.iris10};
    display: inline-flex;
    gap: 4px;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const StyledCredentialActions = styled.div`
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
`;

const StyledTinyButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  white-space: nowrap;

  &:hover {
    background: ${themeCssVariables.background.tertiary};
    color: ${themeCssVariables.font.color.primary};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 1px;
  }
`;

const StyledSecurityNote = styled.div`
  background: ${themeCssVariables.color.transparent.amber2};
  border: 1px solid ${themeCssVariables.color.transparent.amber5};
  border-radius: 10px;
  color: ${themeCssVariables.color.amber11};
  font-size: 12.5px;
  line-height: 1.45;
  padding: 10px 12px;
`;

const StyledFooter = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 24px;
`;

const StyledPrimaryButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.color.iris9};
  border: 1px solid ${themeCssVariables.color.iris10};
  border-radius: 10px;
  color: ${GRAY_SCALE_LIGHT.gray1};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  gap: 7px;
  height: 38px;
  justify-content: center;
  padding: 0 16px;
  transition:
    background-color 140ms ease,
    opacity 140ms ease;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.color.iris10};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 2px;
  }
`;

const StyledSecondaryButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  gap: 7px;
  height: 38px;
  justify-content: center;
  padding: 0 14px;

  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.tertiary};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 2px;
  }
`;

const extractMutationErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (CombinedGraphQLErrors.is(error) && error.errors.length > 0) {
    return error.errors[0].message || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

export const EmployeeLoginModal = ({
  open,
  mode = 'create',
  targetMember = null,
  crmRoles,
  otogrowRoles,
  onClose,
  onSuccess,
}: EmployeeLoginModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <EmployeeLoginModalContent
      mode={mode}
      targetMember={targetMember}
      crmRoles={crmRoles}
      otogrowRoles={otogrowRoles}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
};

type EmployeeLoginModalContentProps = Omit<EmployeeLoginModalProps, 'open'>;

const EmployeeLoginModalContent = ({
  mode = 'create',
  targetMember = null,
  crmRoles,
  otogrowRoles,
  onClose,
  onSuccess,
}: EmployeeLoginModalContentProps) => {
  const { t } = useLingui();
  const titleId = useId();
  const firstNameId = useId();
  const lastNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const crmRoleIdField = useId();
  const firstInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [selectedCrmRoleId, setSelectedCrmRoleId] = useState('');
  const [selectedOtogrowRoleIds, setSelectedOtogrowRoleIds] = useState<
    string[]
  >([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [completed, setCompleted] = useState<CompletedCredentials | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showCompletedPassword, setShowCompletedPassword] = useState(true);

  const [createEmployeeLogin, createState] = useMutation<{
    createOtogrowEmployeeLogin: CreatedOtogrowEmployeeLogin;
  }>(CREATE_OTOGROW_EMPLOYEE_LOGIN);

  const [resetEmployeePassword, resetState] = useMutation<{
    resetOtogrowEmployeePassword: ResetOtogrowEmployeePasswordResult;
  }>(RESET_OTOGROW_EMPLOYEE_PASSWORD);

  const submitting = createState.loading || resetState.loading;
  const isResetMode = mode === 'reset' && Boolean(targetMember);

  const resetFormState = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setShowPassword(true);
    setSelectedCrmRoleId('');
    setSelectedOtogrowRoleIds([]);
    setErrorMessage('');
    setCompleted(null);
    setCopiedKey(null);
    setShowCompletedPassword(true);
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      firstInputRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [submitting, onClose]);

  const strength = evaluatePasswordStrength(password);
  const strengthLabel =
    strength.level === 'strong'
      ? t`Strong password`
      : strength.level === 'good'
        ? t`Good password`
        : strength.level === 'fair'
          ? t`Fair password`
          : strength.level === 'weak'
            ? t`Use 8 to 50 characters`
            : t`Use at least 8 characters or click Generate`;

  const canSubmit = isResetMode
    ? strength.validLength && !submitting
    : firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      email.trim().length > 0 &&
      strength.validLength &&
      !submitting;

  const handleGeneratePassword = () => {
    setPassword(generateEmployeePassword(14));
    setShowPassword(true);
    setErrorMessage('');
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.clipboard?.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => {
          setCopiedKey((current) => (current === key ? null : current));
        }, 2000);
      }
    } catch {
      setErrorMessage(
        t`Could not copy automatically. Select the text and copy it manually.`,
      );
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setErrorMessage('');

    try {
      if (isResetMode && targetMember) {
        const result = await resetEmployeePassword({
          variables: {
            input: {
              workspaceMemberId: targetMember.workspaceMemberId,
              password,
            },
          },
        });

        const payload = result.data?.resetOtogrowEmployeePassword;
        if (!payload) {
          setErrorMessage(t`Could not update the employee password.`);
          return;
        }

        const resolvedFullName =
          `${payload.firstName} ${payload.lastName}`.trim() ||
          targetMember.name;

        setCompleted({
          fullName: resolvedFullName,
          firstName: payload.firstName || targetMember.name.split(' ')[0] || '',
          email: payload.email,
          password,
          signInUrl: payload.signInUrl,
          otogrowRoleNames: [],
          isReset: true,
        });
        await onSuccess?.();
        return;
      }

      const result = await createEmployeeLogin({
        variables: {
          input: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            password,
            ...(selectedCrmRoleId ? { crmRoleId: selectedCrmRoleId } : {}),
            ...(selectedOtogrowRoleIds.length > 0
              ? { otogrowRoleIds: selectedOtogrowRoleIds }
              : {}),
          },
        },
      });

      const payload = result.data?.createOtogrowEmployeeLogin;
      if (!payload) {
        setErrorMessage(t`Could not create the employee login.`);
        return;
      }

      setCompleted({
        fullName: `${payload.firstName} ${payload.lastName}`.trim(),
        firstName: payload.firstName,
        email: payload.email,
        password,
        signInUrl: payload.signInUrl,
        otogrowRoleNames: payload.otogrowRoleNames ?? [],
        isReset: false,
      });
      await onSuccess?.();
    } catch (error) {
      setErrorMessage(
        extractMutationErrorMessage(
          error,
          isResetMode
            ? t`Could not update the employee password. Try again.`
            : t`Could not create the employee login. Check the details and try again.`,
        ),
      );
    }
  };

  const handoffMessage = completed
    ? formatEmployeeLoginMessage({
        firstName: completed.firstName,
        email: completed.email,
        password: completed.password,
        signInUrl: completed.signInUrl,
        isReset: completed.isReset,
      })
    : '';

  const dialog = (
    <StyledBackdrop
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <StyledDialog role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <StyledHeader>
          <StyledHeaderLeft>
            <StyledIconBadge aria-hidden="true">
              {isResetMode ? <IconKey size={20} /> : <IconUserPlus size={20} />}
            </StyledIconBadge>
            <StyledHeaderText>
              <h2 id={titleId}>
                {completed ? (
                  completed.isReset ? (
                    <Trans>New password ready</Trans>
                  ) : (
                    <Trans>Employee login ready</Trans>
                  )
                ) : isResetMode ? (
                  <Trans>Set new password</Trans>
                ) : (
                  <Trans>Create employee login</Trans>
                )}
              </h2>
              <p>
                {completed ? (
                  completed.isReset ? (
                    t`Share the updated password with ${completed.fullName} so they can sign in.`
                  ) : (
                    t`${completed.fullName} can sign in immediately with these credentials.`
                  )
                ) : isResetMode && targetMember ? (
                  t`Set a new sign-in password for ${targetMember.name}.`
                ) : (
                  <Trans>
                    Create an email and password directly so your teammate can
                    sign in right away without waiting for an invite email.
                  </Trans>
                )}
              </p>
            </StyledHeaderText>
          </StyledHeaderLeft>
          <StyledCloseButton
            type="button"
            aria-label={t`Close`}
            disabled={submitting}
            onClick={onClose}
          >
            <IconX size={18} />
          </StyledCloseButton>
        </StyledHeader>

        {completed ? (
          <>
            <StyledBody>
              <StyledSuccessBanner role="status">
                <StyledSuccessIcon aria-hidden="true">
                  <IconCheck size={15} />
                </StyledSuccessIcon>
                <div>
                  <strong>
                    {completed.isReset
                      ? t`Password updated for ${completed.fullName}`
                      : t`${completed.fullName} added to workspace`}
                  </strong>
                  <span>
                    {completed.otogrowRoleNames.length > 0
                      ? t`Assigned roles: ${completed.otogrowRoleNames.join(', ')}`
                      : t`Ready to sign in immediately — no invite email required.`}
                  </span>
                </div>
              </StyledSuccessBanner>

              <StyledCredentialsBox>
                <StyledCredentialRow>
                  <StyledCredentialMeta>
                    <small>
                      <Trans>Sign-in link</Trans>
                    </small>
                    <StyledCredentialValue>
                      <a
                        href={completed.signInUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {completed.signInUrl}
                        <IconExternalLink size={13} />
                      </a>
                    </StyledCredentialValue>
                  </StyledCredentialMeta>
                  <StyledCredentialActions>
                    <StyledTinyButton
                      type="button"
                      onClick={() => handleCopy('url', completed.signInUrl)}
                    >
                      {copiedKey === 'url' ? (
                        <>
                          <IconCheck size={13} />
                          <Trans>Copied</Trans>
                        </>
                      ) : (
                        <>
                          <IconCopy size={13} />
                          <Trans>Copy</Trans>
                        </>
                      )}
                    </StyledTinyButton>
                  </StyledCredentialActions>
                </StyledCredentialRow>

                <StyledCredentialRow>
                  <StyledCredentialMeta>
                    <small>
                      <Trans>Email</Trans>
                    </small>
                    <StyledCredentialValue monospace>
                      {completed.email}
                    </StyledCredentialValue>
                  </StyledCredentialMeta>
                  <StyledCredentialActions>
                    <StyledTinyButton
                      type="button"
                      onClick={() => handleCopy('email', completed.email)}
                    >
                      {copiedKey === 'email' ? (
                        <>
                          <IconCheck size={13} />
                          <Trans>Copied</Trans>
                        </>
                      ) : (
                        <>
                          <IconCopy size={13} />
                          <Trans>Copy</Trans>
                        </>
                      )}
                    </StyledTinyButton>
                  </StyledCredentialActions>
                </StyledCredentialRow>

                <StyledCredentialRow>
                  <StyledCredentialMeta>
                    <small>
                      <Trans>Password</Trans>
                    </small>
                    <StyledCredentialValue monospace>
                      {showCompletedPassword
                        ? completed.password
                        : '••••••••••••••'}
                    </StyledCredentialValue>
                  </StyledCredentialMeta>
                  <StyledCredentialActions>
                    <StyledTinyButton
                      type="button"
                      aria-label={
                        showCompletedPassword
                          ? t`Hide password`
                          : t`Show password`
                      }
                      onClick={() =>
                        setShowCompletedPassword((visible) => !visible)
                      }
                    >
                      {showCompletedPassword ? (
                        <IconEyeOff size={13} />
                      ) : (
                        <IconEye size={13} />
                      )}
                    </StyledTinyButton>
                    <StyledTinyButton
                      type="button"
                      onClick={() => handleCopy('password', completed.password)}
                    >
                      {copiedKey === 'password' ? (
                        <>
                          <IconCheck size={13} />
                          <Trans>Copied</Trans>
                        </>
                      ) : (
                        <>
                          <IconCopy size={13} />
                          <Trans>Copy</Trans>
                        </>
                      )}
                    </StyledTinyButton>
                  </StyledCredentialActions>
                </StyledCredentialRow>
              </StyledCredentialsBox>

              {errorMessage && (
                <StyledErrorBanner role="alert">
                  {errorMessage}
                </StyledErrorBanner>
              )}

              <StyledSecurityNote>
                <Trans>
                  Copy and send these credentials privately now. For security,
                  this password won’t be shown again once you close this window.
                  The employee can change it anytime in Settings → Account.
                </Trans>
              </StyledSecurityNote>
            </StyledBody>

            <StyledFooter>
              {!completed.isReset && (
                <StyledSecondaryButton
                  type="button"
                  onClick={() => {
                    resetFormState();
                    requestAnimationFrame(() => firstInputRef.current?.focus());
                  }}
                >
                  <Trans>Create another</Trans>
                </StyledSecondaryButton>
              )}
              <StyledSecondaryButton type="button" onClick={onClose}>
                <Trans>Done</Trans>
              </StyledSecondaryButton>
              <StyledPrimaryButton
                type="button"
                onClick={() => handleCopy('message', handoffMessage)}
              >
                {copiedKey === 'message' ? (
                  <>
                    <IconCheck size={15} />
                    <Trans>Login info copied</Trans>
                  </>
                ) : (
                  <>
                    <IconCopy size={15} />
                    <Trans>Copy login message</Trans>
                  </>
                )}
              </StyledPrimaryButton>
            </StyledFooter>
          </>
        ) : (
          <StyledForm onSubmit={(event) => void handleSubmit(event)}>
            <StyledBody>
              {!isResetMode && (
                <>
                  <StyledTwoColumn>
                    <StyledField>
                      <StyledLabel htmlFor={firstNameId}>
                        <Trans>First name</Trans>
                      </StyledLabel>
                      <StyledInput
                        ref={firstInputRef}
                        id={firstNameId}
                        type="text"
                        required
                        autoComplete="given-name"
                        maxLength={80}
                        disabled={submitting}
                        placeholder={t`e.g. Sarah`}
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                      />
                    </StyledField>
                    <StyledField>
                      <StyledLabel htmlFor={lastNameId}>
                        <Trans>Last name</Trans>
                      </StyledLabel>
                      <StyledInput
                        id={lastNameId}
                        type="text"
                        required
                        autoComplete="family-name"
                        maxLength={80}
                        disabled={submitting}
                        placeholder={t`e.g. Chen`}
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                      />
                    </StyledField>
                  </StyledTwoColumn>

                  <StyledField>
                    <StyledLabel htmlFor={emailId}>
                      <Trans>Work email</Trans>
                    </StyledLabel>
                    <StyledInput
                      id={emailId}
                      type="email"
                      required
                      autoComplete="off"
                      maxLength={254}
                      disabled={submitting}
                      placeholder={t`sarah@company.com`}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </StyledField>
                </>
              )}

              <StyledField>
                <StyledLabelRow>
                  <StyledLabel htmlFor={passwordId}>
                    {isResetMode ? (
                      <Trans>New password</Trans>
                    ) : (
                      <Trans>Password</Trans>
                    )}
                  </StyledLabel>
                  <StyledHelperText>{strengthLabel}</StyledHelperText>
                </StyledLabelRow>
                <StyledPasswordRow>
                  <StyledPasswordInputWrap>
                    <StyledInput
                      ref={isResetMode ? firstInputRef : undefined}
                      id={passwordId}
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={50}
                      disabled={submitting}
                      placeholder={t`Enter or generate a password`}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <StyledEyeButton
                      type="button"
                      disabled={submitting}
                      aria-label={
                        showPassword ? t`Hide password` : t`Show password`
                      }
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? (
                        <IconEyeOff size={16} />
                      ) : (
                        <IconEye size={16} />
                      )}
                    </StyledEyeButton>
                  </StyledPasswordInputWrap>
                  <StyledGenerateButton
                    type="button"
                    disabled={submitting}
                    onClick={handleGeneratePassword}
                  >
                    <IconRefresh size={14} />
                    <Trans>Generate</Trans>
                  </StyledGenerateButton>
                </StyledPasswordRow>
                <StyledStrengthTrack aria-hidden="true">
                  {[1, 2, 3, 4].map((segment) => (
                    <StyledStrengthBar
                      key={segment}
                      active={strength.score >= segment}
                      level={strength.level}
                    />
                  ))}
                </StyledStrengthTrack>
              </StyledField>

              {!isResetMode && crmRoles && crmRoles.length > 0 && (
                <StyledField>
                  <StyledLabel htmlFor={crmRoleIdField}>
                    <Trans>Workspace role</Trans>
                  </StyledLabel>
                  <StyledSelect
                    id={crmRoleIdField}
                    disabled={submitting}
                    value={selectedCrmRoleId}
                    onChange={(event) =>
                      setSelectedCrmRoleId(event.target.value)
                    }
                  >
                    <option value="">{t`Default role`}</option>
                    {crmRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </StyledSelect>
                  <StyledHelperText>
                    <Trans>
                      Controls CRM permissions. You can change this anytime.
                    </Trans>
                  </StyledHelperText>
                </StyledField>
              )}

              {!isResetMode && otogrowRoles && otogrowRoles.length > 0 && (
                <StyledField>
                  <StyledLabel>
                    <Trans>Business roles (optional)</Trans>
                  </StyledLabel>
                  <StyledRoleList>
                    {otogrowRoles.map((role) => {
                      const checked = selectedOtogrowRoleIds.includes(role.id);
                      return (
                        <StyledRoleOption key={role.id} checked={checked}>
                          <input
                            type="checkbox"
                            disabled={submitting}
                            checked={checked}
                            onChange={(event) => {
                              setSelectedOtogrowRoleIds((current) =>
                                event.target.checked
                                  ? [...current, role.id]
                                  : current.filter((id) => id !== role.id),
                              );
                            }}
                          />
                          <StyledRoleCopy>
                            <strong>{role.name}</strong>
                            {role.description && (
                              <small>{role.description}</small>
                            )}
                          </StyledRoleCopy>
                        </StyledRoleOption>
                      );
                    })}
                  </StyledRoleList>
                  <StyledHelperText>
                    <Trans>
                      Leave unchecked for standard team access (assigned
                      projects only).
                    </Trans>
                  </StyledHelperText>
                </StyledField>
              )}

              {errorMessage && (
                <StyledErrorBanner role="alert">
                  {errorMessage}
                </StyledErrorBanner>
              )}
            </StyledBody>

            <StyledFooter>
              <StyledSecondaryButton
                type="button"
                disabled={submitting}
                onClick={onClose}
              >
                <Trans>Cancel</Trans>
              </StyledSecondaryButton>
              <StyledPrimaryButton type="submit" disabled={!canSubmit}>
                {submitting ? (
                  isResetMode ? (
                    <Trans>Updating password…</Trans>
                  ) : (
                    <Trans>Creating login…</Trans>
                  )
                ) : isResetMode ? (
                  <Trans>Update password</Trans>
                ) : (
                  <Trans>Create employee login</Trans>
                )}
              </StyledPrimaryButton>
            </StyledFooter>
          </StyledForm>
        )}
      </StyledDialog>
    </StyledBackdrop>
  );

  if (typeof document === 'undefined') {
    return dialog;
  }

  return createPortal(dialog, document.body);
};
