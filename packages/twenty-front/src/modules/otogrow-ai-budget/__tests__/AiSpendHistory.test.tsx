import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiSpendHistory } from '@/otogrow-ai-budget/AiSpendHistory';
import { type OtogrowAiSpendHistoryQuery } from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
}));
jest.mock('@/otogrow-ai-budget/aiBudgetStyles', () => ({
  StyledAiBudgetActions: 'div',
  StyledAiBudgetList: 'ul',
}));
jest.mock('@/otogrow-activity/activityStyles', () => ({
  StyledActivityChanges: 'dl',
}));
jest.mock('@/otogrow-activity/ActivityEvent', () => ({
  formatActivityTime: (value: string) => value,
}));
let mockHistory: OtogrowAiSpendHistoryQuery['otogrowAiSpendHistory'];
let mockError: Error | undefined;
const mockRefetch = jest.fn();
const mockQuery = jest.fn((_document: unknown, _options: unknown) => ({
  data: { otogrowAiSpendHistory: mockHistory },
  loading: false,
  error: mockError,
  refetch: mockRefetch,
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: Parameters<typeof mockQuery>) => mockQuery(...args),
}));
let mockPermission = {
  scopeKey: 'workspace:admin:membership',
  canManageRoles: true,
  loading: false,
  error: undefined as Error | undefined,
  access: {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
  },
};
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => mockPermission,
}));
const Content = () => (
  <I18nProvider i18n={i18n}>
    <AiSpendHistory spendId="spend" />
  </I18nProvider>
);
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockQuery.mockClear();
  mockRefetch.mockReset().mockResolvedValue({});
  mockError = undefined;
  mockPermission = {
    scopeKey: 'workspace:admin:membership',
    canManageRoles: true,
    loading: false,
    error: undefined,
    access: {
      workspaceId: 'workspace',
      memberId: 'admin',
      userWorkspaceId: 'membership',
    },
  };
  mockHistory = {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
    spendId: 'spend',
    sourceKind: 'TASK_AGENT',
    sourceRunId: 'run',
    modelId: 'model',
    kind: 'TEXT',
    clientName: null,
    taskName: null,
    priceSource: 'Verified provider pricing',
    priceRevision: 1,
    priceVerifiedAt: '2026-10-25T00:00:00.000Z',
    nextCursor: 'older',
    events: [
      {
        id: 'event',
        action: 'MANUALLY_RECONCILED',
        actorId: 'admin',
        actorName: 'Founder',
        actorAttribution: 'ADMINISTRATOR',
        createdAt: '2026-10-25T00:00:00.000Z',
        before: {
          state: 'UNCERTAIN',
          revision: 1,
          reservedUsd: '0.200000',
          actualUsd: null,
          reportedActualUsd: null,
        },
        after: {
          state: 'SETTLED',
          revision: 2,
          reservedUsd: '0.200000',
          actualUsd: '0.000001',
          reportedActualUsd: null,
        },
        evidenceReference: 'https://provider.example/receipt',
        reason: 'Invoice checked against this run.',
      },
    ],
  };
});

it('loads only opened history, shows exact changes and evidence as plain text', async () => {
  const user = userEvent.setup();
  render(<Content />);
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ skip: true, fetchPolicy: 'no-cache' }),
  );
  expect(screen.queryByText('Founder')).not.toBeInTheDocument();
  await user.click(screen.getByText('Charge history'));
  expect(await screen.findByText('Founder')).toBeVisible();
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ skip: false }),
  );
  expect(screen.getByText('USD 0.000001')).toBeVisible();
  expect(screen.getByText('Not recorded')).toBeVisible();
  expect(screen.getByText('Needs reconciliation')).toBeVisible();
  expect(screen.getByText('Recorded')).toBeVisible();
  expect(screen.getByText('https://provider.example/receipt')).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  await user.click(screen.getByText('Charge history'));
  await waitFor(() =>
    expect(screen.queryByText('Founder')).not.toBeInTheDocument(),
  );
});

it.each([
  'workspace',
  'member',
  'membership',
  'spend',
  'permission',
  'loading',
  'error',
])(
  'hides previously visible financial history when %s changes',
  async (mode) => {
    const user = userEvent.setup();
    const view = render(<Content />);
    await user.click(screen.getByText('Charge history'));
    expect(await screen.findByText('Founder')).toBeVisible();
    if (mode === 'workspace')
      mockHistory = { ...mockHistory, workspaceId: 'other' };
    else if (mode === 'member')
      mockHistory = { ...mockHistory, memberId: 'other' };
    else if (mode === 'membership')
      mockHistory = { ...mockHistory, userWorkspaceId: 'other' };
    else if (mode === 'spend')
      mockHistory = { ...mockHistory, spendId: 'other' };
    else if (mode === 'permission')
      mockPermission = { ...mockPermission, canManageRoles: false };
    else if (mode === 'loading')
      mockPermission = { ...mockPermission, loading: true };
    else mockError = new Error('Access changed');
    view.rerender(<Content />);
    expect(screen.queryByText('Founder')).not.toBeInTheDocument();
    expect(screen.queryByText('USD 0.000001')).not.toBeInTheDocument();
    expect(
      screen.queryByText('https://provider.example/receipt'),
    ).not.toBeInTheDocument();
  },
);

it('requests bounded older pages and can return to the latest history', async () => {
  const user = userEvent.setup();
  render(<Content />);
  await user.click(screen.getByText('Charge history'));
  await user.click(await screen.findByRole('button', { name: 'Older events' }));
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      variables: {
        input: { spendId: 'spend', cursor: 'older', limit: 10 },
        identity: 'workspace:admin:membership',
      },
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Latest events' }));
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      variables: {
        input: { spendId: 'spend', cursor: undefined, limit: 10 },
        identity: 'workspace:admin:membership',
      },
    }),
  );
});
