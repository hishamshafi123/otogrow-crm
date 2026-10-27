import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { currentUserState } from '@/auth/states/currentUserState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { ClientConfigProvider } from '@/client-config/components/ClientConfigProvider';
import { ClientConfigProviderEffect } from '@/client-config/components/ClientConfigProviderEffect';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import { type ClientConfig } from '@/client-config/types/ClientConfig';
import { getClientConfig } from '@/client-config/utils/getClientConfig';
import { OnboardingStatus, SupportDriver } from '~/generated-metadata/graphql';

jest.mock('@/client-config/utils/getClientConfig', () => ({
  getClientConfig: jest.fn(),
}));

const mockGetClientConfig = jest.mocked(getClientConfig);
const mockMounted = jest.fn();
const mockUnmounted = jest.fn();
const configuration: ClientConfig = {
  aiModels: [],
  analyticsEnabled: false,
  api: { mutationMaximumAffectedRecords: 100 },
  authProviders: {
    google: false,
    microsoft: false,
    password: true,
    magicLink: false,
    sso: [],
  },
  billing: { isBillingEnabled: false, trialPeriods: [] },
  isBookCallOnboardingStepEnabled: false,
  isCompanyEnrichmentEnabled: false,
  canManageFeatureFlags: false,
  captcha: {},
  frontDomain: 'localhost',
  isAttachmentPreviewEnabled: false,
  isConfigVariablesInDbEnabled: false,
  isEmailVerificationRequired: false,
  isGoogleCalendarEnabled: false,
  isGoogleMessagingEnabled: false,
  isMicrosoftCalendarEnabled: false,
  isMicrosoftMessagingEnabled: false,
  isMultiWorkspaceEnabled: false,
  isImapSmtpCaldavEnabled: false,
  isEmailingDomainInDemoMode: false,
  isCloudflareIntegrationEnabled: false,
  isClickHouseConfigured: false,
  isWorkspaceSchemaDDLLocked: false,
  isOnboardingAiChatEnabled: false,
  onboarding: null,
  publicFeatureFlags: [],
  sentry: {},
  signInPrefilled: false,
  support: { supportDriver: SupportDriver.NONE },
  isTwoFactorAuthenticationEnabled: false,
  allowRequestsToTwentyIcons: false,
};

const PrivateWorkspace = () => {
  const [amount, setAmount] = useState('');
  useEffect(() => {
    mockMounted();
    return () => {
      mockUnmounted();
    };
  }, []);
  return (
    <>
      <p>Private financial figures</p>
      <label>
        Unsaved amount
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      {createPortal(<button>Private attachment preview</button>, document.body)}
    </>
  );
};

const setup = (loaded = true) => {
  const store = createStore();
  store.set(isCookieAuthActiveState.atom, true);
  store.set(currentUserState.atom, {
    id: 'first-user',
    email: 'first@example.com',
    firstName: 'First',
    lastName: 'User',
    supportUserHash: '',
    canAccessFullAdminPanel: false,
    canImpersonate: false,
    onboardingStatus: OnboardingStatus.COMPLETED,
    previousOnboardingStatus: null,
    isWorkspaceCreator: false,
    userVars: {},
    hasPassword: true,
  });
  if (loaded)
    store.set(clientConfigApiStatusState.atom, {
      isLoadedOnce: true,
      isSaved: true,
      isErrored: false,
      isLoading: false,
      data: { clientConfig: configuration },
    });
  render(
    <Provider store={store}>
      <I18nProvider i18n={i18n}>
        <ClientConfigProviderEffect />
        <ClientConfigProvider>
          <PrivateWorkspace />
        </ClientConfigProvider>
      </I18nProvider>
    </Provider>,
  );
  const failConnection = () =>
    act(() => {
      store.set(clientConfigApiStatusState.atom, (current) => ({
        ...current,
        isErrored: true,
        error: new Error('Offline'),
      }));
    });
  return { store, failConnection };
};

beforeEach(() => {
  localStorage.clear();
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockGetClientConfig.mockReset();
  mockMounted.mockClear();
  mockUnmounted.mockClear();
  HTMLDialogElement.prototype.showModal = jest.fn(
    function (this: HTMLDialogElement) {
      this.open = true;
    },
  );
  HTMLDialogElement.prototype.close = jest.fn(
    function (this: HTMLDialogElement) {
      this.open = false;
    },
  );
});

it('does not mount protected children before the first successful configuration, including after a first failure', async () => {
  mockGetClientConfig.mockRejectedValueOnce(new Error('Offline'));
  setup(false);
  expect(mockMounted).not.toHaveBeenCalled();
  expect(
    screen.queryByText('Private financial figures'),
  ).not.toBeInTheDocument();
  await screen.findByRole('button', { name: /^Retry connection/ });
  expect(mockGetClientConfig).toHaveBeenCalledTimes(1);
  expect(mockMounted).not.toHaveBeenCalled();
  mockGetClientConfig.mockResolvedValueOnce(configuration);
  await userEvent.click(
    screen.getByRole('button', { name: /^Retry connection/ }),
  );
  expect(await screen.findByText('Private financial figures')).toBeVisible();
  expect(mockMounted).toHaveBeenCalledTimes(1);
});

it('keeps a hidden noninteractive draft through failed and pending retries, then restores it without a reload', async () => {
  const page = setup();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Unsaved amount' }),
    '50',
  );
  const focusedAmount = screen.getByRole('textbox', { name: 'Unsaved amount' });
  jest
    .spyOn(focusedAmount, 'getClientRects')
    .mockReturnValue(
      Object.assign([new DOMRect()], { item: () => new DOMRect() }),
    );
  page.failConnection();
  const amount = screen.getByLabelText('Unsaved amount');
  expect(amount).toHaveValue('50');
  expect(amount).not.toBeVisible();
  expect(amount.closest('[inert]')).toHaveAttribute('aria-hidden', 'true');
  expect(
    screen.queryByRole('textbox', { name: 'Unsaved amount' }),
  ).not.toBeInTheDocument();
  expect(mockUnmounted).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Reload' }),
  ).not.toBeInTheDocument();
  mockGetClientConfig.mockRejectedValueOnce(new Error('Still offline'));
  await userEvent.click(
    screen.getByRole('button', { name: /^Retry connection/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /^Retry connection/ }),
    ).toBeEnabled(),
  );
  expect(amount).not.toBeVisible();
  let completeRetry: (value: ClientConfig) => void = () => undefined;
  mockGetClientConfig.mockImplementationOnce(
    () =>
      new Promise<ClientConfig>((resolve) => {
        completeRetry = resolve;
      }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: /^Retry connection/ }),
  );
  expect(screen.getByRole('button', { name: /^Retrying/ })).toBeDisabled();
  expect(amount).not.toBeVisible();
  await act(async () => {
    completeRetry(configuration);
  });
  expect(screen.getByRole('textbox', { name: 'Unsaved amount' })).toBe(amount);
  expect(amount).toBeVisible();
  expect(amount).toHaveValue('50');
  expect(amount).toHaveFocus();
  expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  expect(mockUnmounted).not.toHaveBeenCalled();
});

it.each(['user', 'logout'])(
  'discards the previous draft after a %s identity change while the tree is hidden',
  async (change) => {
    const page = setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Unsaved amount' }),
      '50',
    );
    page.failConnection();
    act(() => {
      if (change === 'logout')
        page.store.set(isCookieAuthActiveState.atom, false);
      else
        page.store.set(currentUserState.atom, (current) =>
          current ? { ...current, id: 'second-user' } : current,
        );
    });
    expect(screen.getByLabelText('Unsaved amount')).toHaveValue('');
    expect(screen.getByLabelText('Unsaved amount')).not.toBeVisible();
    expect(mockUnmounted).toHaveBeenCalledTimes(1);
    mockGetClientConfig.mockResolvedValueOnce(configuration);
    await userEvent.click(
      screen.getByRole('button', { name: /^Retry connection/ }),
    );
    expect(
      await screen.findByRole('textbox', { name: 'Unsaved amount' }),
    ).toHaveValue('');
  },
);

it('uses an undismissable native modal to shield document-body portals during an outage', () => {
  const page = setup();
  page.failConnection();
  const dialog = screen.getByRole('dialog', { name: 'Connection unavailable' });
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  expect(dialog).toHaveAttribute('open');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByText('Private attachment preview').parentElement).toBe(
    document.body,
  );
  expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(
    false,
  );
  expect(dialog).toHaveAttribute('open');
  expect(screen.getByText('Private financial figures')).not.toBeVisible();
});

it('prevents Escape and native cancellation from dismissing the initial configuration error', async () => {
  mockGetClientConfig.mockRejectedValueOnce(new Error('Offline'));
  setup(false);
  const retry = await screen.findByRole('button', {
    name: /^Retry connection/,
  });
  const dialog = screen.getByRole('dialog', { name: 'Connection unavailable' });
  retry.focus();
  expect(
    fireEvent.keyDown(retry, {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  ).toBe(false);
  expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(
    false,
  );
  expect(dialog).toHaveAttribute('open');
  expect(retry).toBeVisible();
  expect(mockMounted).not.toHaveBeenCalled();
});

it('restores an unexpectedly closed native error dialog and permits its intentional recovery close', async () => {
  mockGetClientConfig.mockRejectedValueOnce(new Error('Offline'));
  setup(false);
  await screen.findByRole('button', { name: /^Retry connection/ });
  const dialog = screen.getByRole('dialog', { name: 'Connection unavailable' });
  dialog.removeAttribute('open');
  fireEvent(dialog, new Event('close'));
  expect(dialog).toHaveAttribute('open');
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(2);
  mockGetClientConfig.mockResolvedValueOnce(configuration);
  await userEvent.click(
    screen.getByRole('button', { name: /^Retry connection/ }),
  );
  expect(await screen.findByText('Private financial figures')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(2);
});
