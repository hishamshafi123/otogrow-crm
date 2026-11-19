import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { NetworkStatus } from '@apollo/client';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryFounderExceptions } from '@/delivery/founder/DeliveryFounderExceptions';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  type EscalationPreview,
  type EscalationSnapshot,
} from '@/delivery/founder/escalation/escalation.types';
import {
  ESCALATION_EPISODE_ID,
  ESCALATION_RULE_ID,
  escalationEpisodeFixture,
  escalationPreviewFixture,
  escalationRuleFixture,
  escalationSnapshotFixture,
} from '@/delivery/founder/escalation/__tests__/escalation.fixtures';
import { founderSnapshotFixture } from '@/delivery/founder/__tests__/founder.fixtures';

let mockSnapshot: EscalationSnapshot;
let mockPreview: EscalationPreview;
let mockError: Error | undefined;
let mockPreviewError: Error | undefined;
let mockLoading = false;
let mockPreviewLoading = false;
let mockReady = true;
let mockAdmin = true;
let mockFinance = true;
let mockScope = 'workspace:member';
let mockRefreshPage: () => void;
const mockSave = jest.fn();
const mockChange = jest.fn();
const mockAcknowledge = jest.fn();
const mockRefetch = jest.fn();
const mockPreviewRefetch = jest.fn();
const mockAccessRefetch = jest.fn();
const mockQuery = jest.fn();
const mockOperation = (document: DocumentNode) =>
  document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  )?.name?.value;
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliverySectionStack: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
}));
jest.mock('@/delivery/founder/founderStyles', () => ({
  StyledFounderFilters: 'div',
  StyledFounderList: 'ul',
  StyledFounderHeading: 'div',
  StyledFounderEvidence: 'dl',
}));
jest.mock('@/delivery/founder/escalation/escalationStyles', () => ({
  StyledEscalationBoundary: 'fieldset',
  StyledEscalationEntry: 'article',
  StyledEscalationFields: 'div',
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockQuery(...args),
  useMutation: (document: DocumentNode) => [
    mockOperation(document) === 'SaveDeliveryFounderEscalationRule'
      ? mockSave
      : mockOperation(document) === 'ChangeDeliveryFounderEscalationRule'
        ? mockChange
        : mockAcknowledge,
  ],
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    denied: false,
    canManageRoles: mockAdmin,
    canReadFinance: mockFinance,
    scope: mockScope,
    refetch: mockAccessRefetch,
    matches: (
      data:
        | { workspaceId: string; memberId: string; userWorkspaceId: string }
        | undefined,
    ) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === 'member' &&
      data.userWorkspaceId === 'membership',
  }),
}));
const setup = (extra = `&founderRule=${ESCALATION_RULE_ID}`) => {
  const Page = () => {
    const [, setVersion] = useState(0);
    mockRefreshPage = () => setVersion((value) => value + 1);
    return <DeliveryFounderExceptions />;
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Page />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    {
      initialEntries: [
        `/delivery?view=health&founderPanel=alerts&founderDomain=DELIVERY&founderCurrency=USD&founderMonth=2026-09${extra}`,
      ],
    },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return { router, refresh: () => act(() => mockRefreshPage()) };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockSnapshot = escalationSnapshotFixture();
  mockPreview = escalationPreviewFixture();
  mockError = undefined;
  mockPreviewError = undefined;
  mockLoading = false;
  mockPreviewLoading = false;
  mockReady = true;
  mockAdmin = true;
  mockFinance = true;
  mockScope = 'workspace:member';
  jest.clearAllMocks();
  mockAccessRefetch.mockResolvedValue(undefined);
  mockRefetch.mockImplementation(async () => ({
    data: { deliveryFounderEscalations: mockSnapshot },
  }));
  mockPreviewRefetch.mockImplementation(async () => ({
    data: { previewDeliveryFounderEscalationRule: mockPreview },
  }));
  mockSave.mockResolvedValue({
    data: {
      saveDeliveryFounderEscalationRule: {
        rule: escalationRuleFixture(),
        replayed: false,
      },
    },
  });
  mockChange.mockResolvedValue({
    data: {
      changeDeliveryFounderEscalationRule: {
        rule: { ...escalationRuleFixture(), enabled: true },
        replayed: false,
      },
    },
  });
  mockAcknowledge.mockResolvedValue({
    data: {
      acknowledgeDeliveryFounderEscalation: {
        episode: {
          ...escalationEpisodeFixture(),
          acknowledgedAt: '2026-10-28T13:00:00Z',
        },
        replayed: false,
      },
    },
  });
  mockQuery.mockImplementation((document: DocumentNode) =>
    mockOperation(document) === 'PreviewDeliveryFounderEscalationRule'
      ? {
          data: { previewDeliveryFounderEscalationRule: mockPreview },
          loading: mockPreviewLoading,
          networkStatus: mockPreviewLoading
            ? NetworkStatus.loading
            : NetworkStatus.ready,
          error: mockPreviewError,
          refetch: mockPreviewRefetch,
        }
      : mockOperation(document) === 'DeliveryFounderExceptions'
        ? {
            data: { deliveryFounderExceptions: founderSnapshotFixture() },
            loading: false,
            networkStatus: NetworkStatus.ready,
            refetch: mockRefetch,
          }
        : {
            data: { deliveryFounderEscalations: mockSnapshot },
            loading: mockLoading,
            networkStatus: mockLoading
              ? NetworkStatus.loading
              : NetworkStatus.ready,
            error: mockError,
            refetch: mockRefetch,
          },
  );
});

describe('founder alert rules workspace', () => {
  it('opens the focused panel with preserved queue context and truthful setup/worker status', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: 'Founder alert rules' }),
    ).toBeInTheDocument();
    const setupStatus = screen.getByRole('region', {
      name: 'Founder alert setup status',
    });
    expect(setupStatus).toHaveTextContent(
      'Legacy founder routing is still active',
    );
    expect(setupStatus).toHaveTextContent('Workspace Telegram channel paused');
    expect(setupStatus).toHaveTextContent('Workspace bot not configured');
    expect(setupStatus).toHaveTextContent('Telegram not linked');
    expect(setupStatus).toHaveTextContent(
      'Worker evaluation has not been observed',
    );
    expect(setupStatus).toHaveTextContent(
      'independently of Delivery task scheduling',
    );
    expect(
      screen.getByRole('link', { name: 'Back to Needs attention' }),
    ).toHaveAttribute('href', expect.stringContaining('founderMonth=2026-09'));
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockChange).not.toHaveBeenCalled();
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });
  it('keeps preview read-only and explains missing setup before enabling', async () => {
    setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Review and enable' }),
    );
    expect(screen.getByText('Current matching issues: 1')).toBeInTheDocument();
    expect(
      screen.getByText(/Configure an active workspace Telegram bot/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Enable this rule' }),
    ).toBeDisabled();
    expect(mockChange).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('waits for a fresh enabling preview instead of mounting from old data during initial loading', async () => {
    mockPreviewLoading = true;
    const view = setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Review and enable' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Enable this rule' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Current matching issues: 1'),
    ).not.toBeInTheDocument();
    mockPreviewLoading = false;
    view.refresh();
    expect(
      screen.getByRole('button', { name: 'Enable this rule' }),
    ).toBeDisabled();
  });
  it('shows the saved condition, company scope, follow-up owner, priority and repeat policy before enabling', async () => {
    mockSnapshot.rules[0] = {
      ...mockSnapshot.rules[0],
      projectIds: [],
      includeCompany: true,
      priority: 'URGENT',
      repeatMode: 'INTERVAL',
      repeatHours: 12,
      maxSends: 3,
    };
    setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Review and enable' }),
    );
    const review = screen.getByRole('region', {
      name: 'Enable founder alert rule',
    });
    const summary = within(review).getByRole('region', {
      name: 'Saved rule to enable',
    });
    expect(summary).toHaveTextContent('Work is past its due date');
    expect(summary).toHaveTextContent('No client projects; company-only scope');
    expect(summary).toHaveTextContent('Company / unassigned included');
    expect(summary).toHaveTextContent(
      'Alert follow-up owner and Telegram recipient: Amna',
    );
    expect(summary).toHaveTextContent('Urgent');
    expect(summary).toHaveTextContent(
      'Repeat after 12 hours following a successful send, up to 3 sends per issue.',
    );
    expect(
      summary.compareDocumentPosition(
        within(review).getByRole('button', { name: 'Enable this rule' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mockChange).not.toHaveBeenCalled();
  });
  it('enables only through explicit review and legacy-adoption acknowledgements with the saved revision token', async () => {
    mockPreview.canEnable = true;
    mockPreview.warnings = [];
    mockSnapshot.botConfigured = true;
    mockSnapshot.telegramEnabled = true;
    mockSnapshot.linkedRecipientIds = [mockSnapshot.rules[0].recipientId];
    setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Review and enable' }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for this change'),
      'Enable reviewed overdue rule',
    );
    await userEvent.click(
      screen.getByLabelText(/I reviewed the condition, scope/),
    );
    expect(
      screen.getByRole('button', { name: 'Enable this rule' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByLabelText(/Adopt configurable founder routing/),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Enable this rule' }),
    );
    expect(mockChange).toHaveBeenCalledWith({
      variables: {
        input: expect.objectContaining({
          ruleId: ESCALATION_RULE_ID,
          revision: 1,
          previewToken: 'a'.repeat(64),
          enabled: true,
          adoptLegacyRouting: true,
        }),
      },
    });
  });
  it('retains an unsaved enable reason through failed source preview and blocks changed evidence', async () => {
    const view = setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Review and enable' }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for this change'),
      'Retain enable review',
    );
    const reason = screen.getByLabelText('Reason for this change');
    mockPreviewError = new Error('offline');
    view.refresh();
    expect(reason).not.toBeVisible();
    expect(reason).toBeDisabled();
    expect(
      screen.queryByText('Current matching issues: 1'),
    ).not.toBeInTheDocument();
    mockPreviewError = undefined;
    mockPreview = { ...mockPreview, previewToken: 'b'.repeat(64) };
    view.refresh();
    expect(screen.getByLabelText('Reason for this change')).toBe(reason);
    expect(reason).toHaveValue('Retain enable review');
    expect(
      screen.getByRole('button', { name: 'Enable this rule' }),
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('record changed');
  });
  it('protects an editor draft through API/access outage and requires explicit discard for panel navigation', async () => {
    const { router, refresh } = setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit and save paused' }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Keep my configuration',
    );
    const reason = screen.getByLabelText('Reason for rule configuration');
    mockError = new Error('API offline');
    refresh();
    expect(reason).not.toBeVisible();
    expect(reason).toBeDisabled();
    expect(
      screen.queryByRole('region', { name: 'Founder alert setup status' }),
    ).not.toBeInTheDocument();
    mockReady = false;
    refresh();
    expect(reason).toBeInTheDocument();
    mockReady = true;
    mockError = undefined;
    refresh();
    expect(screen.getByLabelText('Reason for rule configuration')).toBe(reason);
    await userEvent.click(
      screen.getByRole('link', { name: 'Back to Needs attention' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Keep editing' }),
    );
    expect(reason).toHaveValue('Keep my configuration');
    expect(router.state.location.search).toContain('founderPanel=alerts');
    await userEvent.click(
      screen.getByRole('link', { name: 'Back to Needs attention' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Needs attention' }),
    ).toBeInTheDocument();
    expect(router.state.location.search).toContain('founderMonth=2026-09');
  });
  it('clears old drafts after verified administrator revocation', async () => {
    const view = setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit and save paused' }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Private old session note',
    );
    const reason = screen.getByLabelText('Reason for rule configuration');
    mockAdmin = false;
    view.refresh();
    expect(reason).not.toBeInTheDocument();
    mockAdmin = true;
    view.refresh();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit and save paused' }),
    );
    expect(screen.getByLabelText('Reason for rule configuration')).toHaveValue(
      '',
    );
  });
  it.each(['workspaceId', 'memberId', 'userWorkspaceId'] as const)(
    'hides all receipt and source data for foreign %s',
    (field) => {
      const view = setup();
      mockSnapshot = { ...mockSnapshot, [field]: 'foreign' };
      view.refresh();
      expect(
        screen.queryByRole('region', { name: 'Founder alert setup status' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', {
          name: 'Founder alert occurrence history',
        }),
      ).not.toBeInTheDocument();
    },
  );
  it('acknowledges an issue without pretending its original source was resolved', async () => {
    mockAcknowledge.mockImplementation(async () => {
      const acknowledged = {
        ...escalationEpisodeFixture(),
        revision: 3,
        acknowledgedAt: '2026-10-28T13:00:00Z',
        acknowledgedByName: 'Founder',
        acknowledgementReason: 'Taking ownership of follow-up',
      };
      mockSnapshot = { ...mockSnapshot, episodes: [acknowledged] };
      return {
        data: {
          acknowledgeDeliveryFounderEscalation: {
            episode: acknowledged,
            replayed: false,
          },
        },
      };
    });
    setup(
      `&founderRule=${ESCALATION_RULE_ID}&founderIssue=${ESCALATION_EPISODE_ID}`,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Acknowledge and stop repeats' }),
    );
    expect(
      screen.getByText(/does not mark work delivered/),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText('Reason for this change'),
      'Taking ownership of follow-up',
    );
    await userEvent.click(
      screen.getByLabelText(
        'Stop repeats without marking the original source resolved.',
      ),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Acknowledge issue' }),
    );
    expect(mockAcknowledge).toHaveBeenCalledWith({
      variables: {
        input: expect.objectContaining({
          episodeId: ESCALATION_EPISODE_ID,
          revision: 2,
          reason: 'Taking ownership of follow-up',
        }),
      },
    });
    expect(mockChange).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSnapshot.episodes[0].status).toBe('OPEN');
    expect(
      await screen.findByText(
        /Acknowledgement stops repeats; it does not resolve the source/,
      ),
    ).toBeInTheDocument();
  });
  it('preserves exact selected identity and filters in bounded occurrence pagination', async () => {
    mockSnapshot.nextNoticeId = '88888888-1111-4111-8111-111111111111';
    const { router } = setup(
      `&founderRule=${ESCALATION_RULE_ID}&founderIssue=${ESCALATION_EPISODE_ID}`,
    );
    await userEvent.click(
      screen.getByRole('link', { name: 'Older occurrence receipts' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain(
        'founderNoticesAfter=88888888',
      ),
    );
    expect(router.state.location.search).toContain(
      `founderRule=${ESCALATION_RULE_ID}`,
    );
    expect(router.state.location.search).toContain(
      `founderIssue=${ESCALATION_EPISODE_ID}`,
    );
    expect(router.state.location.search).toContain('founderDomain=DELIVERY');
  });
  it('does not silently select another rule for an unavailable exact link', () => {
    setup('&founderRule=77777777-1111-4111-8111-111111111111');
    expect(screen.getByRole('alert')).toHaveTextContent('rule is unavailable');
    expect(
      screen.queryByRole('button', { name: 'Review and enable' }),
    ).not.toBeInTheDocument();
  });
  it('focuses a newly opened editor once and keeps field focus through equivalent fresh DTO objects', async () => {
    mockQuery.mockImplementation((document: DocumentNode) =>
      mockOperation(document) === 'PreviewDeliveryFounderEscalationRule'
        ? {
            data: {
              previewDeliveryFounderEscalationRule: escalationPreviewFixture(),
            },
            loading: false,
            networkStatus: NetworkStatus.ready,
            refetch: mockPreviewRefetch,
          }
        : {
            data: { deliveryFounderEscalations: escalationSnapshotFixture() },
            loading: false,
            networkStatus: NetworkStatus.ready,
            refetch: mockRefetch,
          },
    );
    const view = setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'New paused rule' }),
    );
    const region = screen.getByRole('region', {
      name: 'New founder alert rule',
    });
    expect(region).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Rule name'), 'Keep this draft');
    view.refresh();
    expect(screen.getByLabelText('Rule name')).toHaveValue('Keep this draft');
    expect(screen.getByLabelText('Rule name')).toHaveFocus();
    expect(screen.getByRole('region', { name: 'New founder alert rule' })).toBe(
      region,
    );
  });
  it('distinguishes current alert follow-up responsibility from unassigned source work and old receipts', async () => {
    mockSnapshot.episodes[0].source = {
      ...mockSnapshot.episodes[0].source,
      ownerId: null,
      ownerName: null,
      ownerState: 'UNASSIGNED',
    };
    const { refresh } = setup(
      `&founderRule=${ESCALATION_RULE_ID}&founderIssue=${ESCALATION_EPISODE_ID}`,
    );
    const issues = screen.getByRole('region', {
      name: 'Observed alert issues',
    });
    expect(
      within(issues)
        .getByText(/Current alert follow-up owner/)
        .closest('p'),
    ).toHaveTextContent('Amna');
    await userEvent.click(
      within(issues).getByText('Last observed issue evidence', {
        selector: 'summary',
      }),
    );
    expect(
      within(issues).getByText('Unassigned — review ownership in the source'),
    ).toBeInTheDocument();
    mockSnapshot = {
      ...mockSnapshot,
      rules: [
        {
          ...mockSnapshot.rules[0],
          recipientName: 'New current administrator',
          revision: 2,
        },
      ],
    };
    refresh();
    expect(
      within(issues)
        .getByText(/Current alert follow-up owner/)
        .closest('p'),
    ).toHaveTextContent('New current administrator');
    const history = screen.getByRole('region', {
      name: 'Founder alert occurrence history',
    });
    expect(history).toHaveTextContent('Recorded recipient: Amna');
    expect(history).not.toHaveTextContent('New current administrator');
  });
  it('offers a guarded clear-selection recovery for a stale valid rule link while preserving queue filters', async () => {
    const { router, refresh } = setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit and save paused' }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Preserve until deliberate discard',
    );
    mockError = new Error('Selected rule no longer exists');
    refresh();
    const clear = screen.getByRole('link', { name: 'All alert rules' });
    expect(clear).toHaveAttribute(
      'href',
      expect.not.stringContaining('founderRule='),
    );
    expect(clear).toHaveAttribute(
      'href',
      expect.stringContaining('founderMonth=2026-09'),
    );
    await userEvent.click(clear);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Keep editing' }),
    );
    expect(screen.getByLabelText('Reason for rule configuration')).toHaveValue(
      'Preserve until deliberate discard',
    );
    await userEvent.click(
      screen.getByRole('link', { name: 'All alert rules' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).not.toContain('founderRule='),
    );
    expect(router.state.location.search).toContain('founderMonth=2026-09');
    expect(
      screen.queryByLabelText('Reason for rule configuration'),
    ).not.toBeInTheDocument();
  });
});
