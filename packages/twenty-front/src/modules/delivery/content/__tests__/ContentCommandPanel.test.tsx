import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { ContentCommandPanel } from '@/delivery/content/ContentCommandPanel';
import { useContentRead } from '@/delivery/content/useContentRead';
import { useContentCommands } from '@/delivery/content/useContentCommands';
import { type useContentAccess } from '@/delivery/content/useContentAccess';
import { type ContentIntent } from '@/delivery/content/content.types';
import {
  contentChoices,
  CONTENT_ACCOUNT_ID,
  CONTENT_PLAN_ID,
  CONTENT_REQUEST_ID,
} from '@/delivery/content/__tests__/content.fixtures';

jest.mock('@apollo/client/react', () => ({
  useApolloClient: jest.fn(),
  useQuery: jest.fn(),
}));
jest.mock('@/delivery/content/useContentRead', () => ({
  useContentRead: jest.fn(),
}));
jest.mock('@/delivery/content/useContentCommands', () => ({
  useContentCommands: jest.fn(),
}));

const execute = jest.fn();
const check = jest.fn();
const refetch = jest.fn().mockResolvedValue(undefined);
const replace = jest.fn();
const access = {
  source: 'current-authority',
  permission: { access: contentChoices, ready: true },
  matches: () => true,
} as unknown as ReturnType<typeof useContentAccess>;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'TextEncoder', {
    value: TextEncoder,
    configurable: true,
  });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest
    .mocked(useApolloClient)
    .mockReturnValue({} as ReturnType<typeof useApolloClient>);
  jest.mocked(useQuery).mockReturnValue({
    data: { deliveryContentProjectChoices: contentChoices },
    loading: false,
    refetch,
  } as unknown as ReturnType<typeof useQuery>);
  jest
    .mocked(useContentRead)
    .mockImplementation(
      ({ value }) =>
        ({ data: value ?? null }) as ReturnType<typeof useContentRead>,
    );
  jest
    .mocked(useContentCommands)
    .mockReturnValue({ busy: false, execute, check });
});

const mount = (mode = 'account', manager = true) => {
  const intent: ContentIntent = {
    requestId: CONTENT_REQUEST_ID,
    targetId: mode === 'plan' ? CONTENT_PLAN_ID : CONTENT_ACCOUNT_ID,
    mode,
    project: contentChoices.project,
    sourceScope: contentChoices.scope,
  };
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        initialEntries={[
          `/delivery?view=content&contentProject=${contentChoices.project.id}&contentMode=${mode}&contentRequest=${CONTENT_REQUEST_ID}&${mode === 'plan' ? 'contentPlanId' : 'contentAccountId'}=${intent.targetId}`,
        ]}
      >
        <ContentCommandPanel
          access={access}
          choices={{ ...contentChoices, isManager: manager }}
          intent={intent}
          enabled
          onDenied={jest.fn()}
          onSaved={refetch}
          onReplaceIntent={replace}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
};
const prepareAccount = async () => {
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Account name' }),
    'Otogrow social',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Account handle' }),
    '@otogrow',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Public profile or page link' }),
    'https://x.com/otogrow',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Review this action' }),
  );
  await screen.findByRole('button', { name: 'Save account metadata' });
};
it('shows initial preparation loading rather than a failure before current sources arrive', () => {
  jest.mocked(useQuery).mockReturnValue({
    loading: true,
    data: undefined,
    refetch,
  } as unknown as ReturnType<typeof useQuery>);
  mount();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Loading content preparation…',
  );
  expect(screen.queryByText(/could not be checked/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Check current preparation' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('textbox', { name: 'Account name' }),
  ).not.toBeInTheDocument();
});
it('restores editable fields after a definitive validation rejection', async () => {
  execute.mockResolvedValue({
    kind: 'REJECTED',
    message: 'Choose the public profile for this account.',
  });
  mount();
  await prepareAccount();
  expect(
    screen.getByRole('region', { name: 'Review prepared content action' }),
  ).toHaveFocus();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save account metadata' }),
  );
  expect(
    await screen.findByRole('textbox', { name: 'Account name' }),
  ).toHaveValue('Otogrow social');
  expect(
    screen.getByRole('textbox', { name: 'Public profile or page link' }),
  ).toHaveValue('https://x.com/otogrow');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Choose the public profile',
  );
  expect(
    screen.getByRole('region', { name: 'Prepare content fields' }),
  ).toHaveFocus();
  expect(
    screen.queryByRole('button', { name: 'Check saved content action' }),
  ).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Account name' }),
    ' revised',
  );
  expect(
    screen.getByRole('button', { name: 'Review this action' }),
  ).toBeEnabled();
});
it('returns focus to retained preparation after going back from preview', async () => {
  mount();
  await prepareAccount();
  await userEvent.click(
    screen.getByRole('button', { name: 'Back to preparation' }),
  );
  expect(
    screen.getByRole('region', { name: 'Prepare content fields' }),
  ).toHaveFocus();
  expect(screen.getByRole('textbox', { name: 'Account name' })).toHaveValue(
    'Otogrow social',
  );
});
it('focuses the saved stage only after the receipt refresh settles', async () => {
  let finishRefresh: () => void = () => undefined;
  const refreshed = new Promise<void>((resolve) => {
    finishRefresh = resolve;
  });
  refetch.mockReturnValueOnce(refreshed);
  execute.mockResolvedValue({
    kind: 'FOUND',
    receipt: {
      action: 'SAVE_ACCOUNT',
      version: null,
      revision: 1,
      targetKind: 'ACCOUNT',
      targetId: CONTENT_ACCOUNT_ID,
    },
  });
  mount();
  await prepareAccount();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save account metadata' }),
  );
  const saved = await screen.findByRole('region', {
    name: 'Saved content action',
  });
  expect(saved).not.toHaveFocus();
  await act(async () => {
    finishRefresh();
    await refreshed;
  });
  expect(saved).toHaveFocus();
});
it('requires an exact absent receipt before transferring a conflicted draft to a new request', async () => {
  execute.mockResolvedValue({
    kind: 'CONFLICT',
    message: 'The account changed.',
  });
  check.mockResolvedValue({ kind: 'NOT_FOUND' });
  mount();
  await prepareAccount();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save account metadata' }),
  );
  const retained = await screen.findByRole('button', {
    name: 'Review retained draft as a new request',
  });
  await userEvent.click(
    screen.getByRole('checkbox', { name: /Keep my entered fields/ }),
  );
  expect(retained).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check saved content action' }),
  );
  await waitFor(() => expect(retained).toBeEnabled());
  expect(
    screen.queryByRole('button', { name: 'Retry exact content action' }),
  ).not.toBeInTheDocument();
  await userEvent.click(retained);
  expect(replace).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: expect.not.stringMatching(CONTENT_REQUEST_ID),
      preparation: expect.objectContaining({
        account: expect.objectContaining({ name: 'Otogrow social' }),
      }),
    }),
  );
});
it('lets a scoped staff member prepare their own plan without manager access', async () => {
  mount('plan', false);
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Plan title' }),
    'A new content idea',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Review this action' }),
  );
  expect(
    await screen.findByRole('button', { name: 'Save content plan' }),
  ).toBeEnabled();
});
