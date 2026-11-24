import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { EmployeeLoginModal } from '@/otogrow-access/employee-login/EmployeeLoginModal';
import {
  evaluatePasswordStrength,
  formatEmployeeLoginMessage,
  generateEmployeePassword,
} from '@/otogrow-access/employee-login/employee-login.utils';

const mockMutation = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutation, { loading: false }],
}));

describe('employee-login utils', () => {
  it('generates a strong readable password meeting length and character variety', () => {
    const password = generateEmployeePassword(14);
    expect(password).toHaveLength(14);
    expect(evaluatePasswordStrength(password)).toEqual({
      validLength: true,
      score: 4,
      level: 'strong',
    });
  });

  it('formats a clean shareable handoff message', () => {
    const message = formatEmployeeLoginMessage({
      firstName: 'Sarah',
      email: 'sarah@acme.com',
      password: 'Strong#Password9',
      signInUrl: 'https://acme.example.com/welcome',
    });

    expect(message).toContain('Hi Sarah,');
    expect(message).toContain('Sign in: https://acme.example.com/welcome');
    expect(message).toContain('Email: sarah@acme.com');
    expect(message).toContain('Password: Strong#Password9');
  });
});

describe('EmployeeLoginModal', () => {
  beforeEach(() => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    mockMutation.mockReset();
  });

  it('creates an employee login, generates a password, and displays copyable credentials', async () => {
    const user = userEvent.setup();
    const onSuccess = jest.fn();
    const onClose = jest.fn();

    mockMutation.mockResolvedValue({
      data: {
        createOtogrowEmployeeLogin: {
          userId: 'user-1',
          workspaceMemberId: 'member-1',
          email: 'sarah@acme.com',
          firstName: 'Sarah',
          lastName: 'Chen',
          signInUrl: 'https://acme.example.com/welcome',
          otogrowRoleNames: ['Project Manager'],
        },
      },
    });

    render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <EmployeeLoginModal
            open
            mode="create"
            otogrowRoles={[
              {
                id: 'role-pm',
                name: 'Project Manager',
                description: 'Plan and review projects',
                capabilities: ['delivery.manage'],
                revision: 0,
              },
            ]}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </ThemeProvider>
      </I18nProvider>,
    );

    await user.type(screen.getByLabelText('First name'), 'Sarah');
    await user.type(screen.getByLabelText('Last name'), 'Chen');
    await user.type(screen.getByLabelText('Work email'), 'sarah@acme.com');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.click(screen.getByLabelText(/Project Manager/));
    await user.click(
      screen.getByRole('button', { name: 'Create employee login' }),
    );

    await waitFor(() => {
      expect(mockMutation).toHaveBeenCalledWith({
        variables: {
          input: expect.objectContaining({
            firstName: 'Sarah',
            lastName: 'Chen',
            email: 'sarah@acme.com',
            otogrowRoleIds: ['role-pm'],
          }),
        },
      });
    });

    expect(
      await screen.findByText('Sarah Chen added to workspace'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('https://acme.example.com/welcome'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy login message' }),
    ).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('supports resetting an existing employee password', async () => {
    const user = userEvent.setup();
    mockMutation.mockResolvedValue({
      data: {
        resetOtogrowEmployeePassword: {
          workspaceMemberId: 'member-1',
          email: 'sarah@acme.com',
          firstName: 'Sarah',
          lastName: 'Chen',
          signInUrl: 'https://acme.example.com/welcome',
        },
      },
    });

    render(
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <EmployeeLoginModal
            open
            mode="reset"
            targetMember={{
              workspaceMemberId: 'member-1',
              name: 'Sarah Chen',
              email: 'sarah@acme.com',
            }}
            onClose={jest.fn()}
          />
        </ThemeProvider>
      </I18nProvider>,
    );

    await user.type(screen.getByLabelText('New password'), 'Updated#Password9');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => {
      expect(mockMutation).toHaveBeenCalledWith({
        variables: {
          input: {
            workspaceMemberId: 'member-1',
            password: 'Updated#Password9',
          },
        },
      });
    });

    expect(
      await screen.findByText('Password updated for Sarah Chen'),
    ).toBeInTheDocument();
  });
});
