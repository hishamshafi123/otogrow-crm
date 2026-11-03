import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { NetworkStatus } from '@apollo/client';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryCreativeReview } from '@/delivery/creative/review/DeliveryCreativeReview';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type CreativeReviewSnapshot } from '@/delivery/creative/review/creative-review.types';
import {
  FEEDBACK_ID,
  PREVIOUS_ASSET_ID,
  REVIEW_ASSET_ID,
  REVIEW_TASK_ID,
  feedbackFixture,
  reviewFixture,
  targetFixture,
} from '@/delivery/creative/review/__tests__/creative-review.fixtures';

let mockSnapshot: CreativeReviewSnapshot;
let mockReady = true;
let mockManager = true;
let mockReviewCapability = true;
let mockParentEnabled = true;
let mockError: Error | undefined;
let mockLoading = false;
let mockOlderSubmissions: CreativeReviewSnapshot['submissions'] | undefined;
let mockRefresh: () => void;
const mockRefetch = jest.fn();
const mockCreate = jest.fn();
const mockChange = jest.fn();
const mockAccessRefetch = jest.fn();
const operation = (document: DocumentNode) =>
  document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  )?.name?.value;
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCard: 'section',
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/creative/review/creativeReviewStyles', () => ({
  StyledReviewBoundary: 'fieldset',
  StyledFeedback: 'article',
}));
jest.mock('@/delivery/creative/review/CreativeReviewPlayer', () => ({
  CreativeReviewPlayer: ({ label }: { label: string }) => (
    <section aria-label={label}>Protected player: {label}</section>
  ),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    denied: false,
    manager: mockManager,
    access: { capabilities: mockReviewCapability ? ['delivery.review'] : [] },
    scope: 'workspace:member',
    refetch: mockAccessRefetch,
    matches: (
      data?: {
        workspaceId: string;
        memberId: string;
        userWorkspaceId: string;
      } | null,
    ) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === 'member' &&
      data.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useMutation: (document: DocumentNode) => [
    operation(document) === 'CreateDeliveryCreativeFeedback'
      ? mockCreate
      : mockChange,
  ],
  useQuery: (
    document: DocumentNode,
    options: {
      variables: {
        input?: {
          submissionVersion?: number;
          targetKind?: string;
          assetId?: string;
          compareSubmissionVersion?: number;
          compareAssetId?: string;
          selectedFeedbackId?: string;
          beforeSubmissionVersion?: number;
        };
      };
    },
  ) => {
    if (operation(document) === 'DeliveryCreativeFeedbackHistory')
      return {
        data: {
          deliveryCreativeFeedbackHistory: {
            workspaceId: 'workspace',
            memberId: 'member',
            userWorkspaceId: 'membership',
            taskId: REVIEW_TASK_ID,
            feedbackId: FEEDBACK_ID,
            events: [],
            nextBeforeId: null,
          },
        },
        loading: false,
        refetch: mockRefetch,
      };
    const input = options.variables.input;
    const version = input?.submissionVersion ?? 2;
    const selected =
      version === 2 ? mockSnapshot.selected : targetFixture(version);
    const data = {
      ...mockSnapshot,
      selected:
        input?.targetKind === 'ASSET'
          ? {
              ...selected,
              targetKind: 'ASSET',
              submissionVersion: null,
              assetId: input.assetId,
              asset: mockSnapshot.assets.find(
                (asset) => asset.id === input.assetId,
              ),
            }
          : selected,
      comparison: input?.compareSubmissionVersion
        ? targetFixture(input.compareSubmissionVersion)
        : input?.compareAssetId
          ? {
              ...targetFixture(1),
              targetKind: 'ASSET',
              submissionVersion: null,
            }
          : mockSnapshot.comparison,
      selectedFeedback: input?.selectedFeedbackId ? feedbackFixture() : null,
      submissions: input?.beforeSubmissionVersion
        ? (mockOlderSubmissions ?? mockSnapshot.submissions)
        : mockSnapshot.submissions,
    };
    return {
      data: { deliveryCreativeReview: data },
      loading: mockLoading,
      error: mockError,
      networkStatus: mockLoading ? NetworkStatus.loading : NetworkStatus.ready,
      refetch: mockRefetch,
    };
  },
}));
const setup = (
  search = '',
  targetKind: 'SUBMISSION' | 'ASSET' = 'SUBMISSION',
) => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return (
      <DeliveryCreativeReview
        taskId={REVIEW_TASK_ID}
        taskRevision={4}
        targetKind={targetKind}
        enabled={mockParentEnabled}
      />
    );
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
        `/delivery?view=reviews&task=${REVIEW_TASK_ID}&project=client-filter${search}`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return { router, refresh: () => act(() => mockRefresh()) };
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
  jest.clearAllMocks();
  mockSnapshot = reviewFixture();
  mockReady = true;
  mockManager = true;
  mockReviewCapability = true;
  mockParentEnabled = true;
  mockError = undefined;
  mockLoading = false;
  mockOlderSubmissions = undefined;
  mockRefetch.mockResolvedValue({
    data: { deliveryCreativeReview: reviewFixture() },
  });
  mockCreate.mockResolvedValue({
    data: {
      createDeliveryCreativeFeedback: {
        feedback: feedbackFixture(),
        replayed: false,
      },
    },
  });
  mockChange.mockResolvedValue({
    data: {
      changeDeliveryCreativeFeedback: {
        feedback: feedbackFixture(),
        replayed: false,
      },
    },
  });
});
it('shows the exact submitted and compared versions with unresolved earlier feedback counts', () => {
  setup('&creativeSubmission=2&creativeCompare=1');
  expect(
    screen.getByRole('region', { name: 'Submission 2' }),
  ).toHaveTextContent('Protected player');
  expect(
    screen.getByRole('region', { name: 'Comparison: Submission 1' }),
  ).toHaveTextContent('Protected player');
  expect(
    screen.getByText(/Unresolved on earlier targets: 1/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Go to 0:12.500' }),
  ).toBeInTheDocument();
  expect(mockCreate).not.toHaveBeenCalled();
});
it('waits safely through initial loading before any retained target or selected feedback exists', () => {
  mockLoading = true;
  const view = setup();
  expect(screen.getByText('Checking exact review source…')).toBeInTheDocument();
  expect(screen.queryByText(/Protected player/)).not.toBeInTheDocument();
  mockLoading = false;
  view.refresh();
  expect(
    screen.getByRole('region', { name: 'Submission 2' }),
  ).toBeInTheDocument();
});
it('pins the exact selected and compared versions across source pages without inventing off-page submitter metadata', async () => {
  const firstPage = reviewFixture().submissions;
  mockOlderSubmissions = [firstPage[1]];
  mockSnapshot.submissions = [firstPage[0]];
  const { router } = setup(
    '&creativeSubmission=2&creativeCompare=1&creativeSubmissionsBefore=2',
  );
  const selected = screen.getByRole('combobox', {
    name: 'Submission to review',
  });
  expect(selected).toHaveValue('2');
  expect(
    within(selected).getByRole('option', { selected: true }),
  ).toHaveTextContent('Submission 2 · Selected source, not on this page');
  expect(
    within(selected).getByRole('option', { selected: true }),
  ).not.toHaveTextContent('Editor');
  expect(screen.getByRole('combobox', { name: 'Compare with' })).toHaveValue(
    '1',
  );
  await userEvent.click(
    screen.getByRole('link', { name: 'Latest submission choices' }),
  );
  expect(router.state.location.search).toContain('creativeSubmission=2');
  expect(router.state.location.search).toContain('creativeCompare=1');
  expect(router.state.location.search).toContain('project=client-filter');
  expect(
    screen.getByRole('combobox', { name: 'Submission to review' }),
  ).toHaveValue('2');
  const compared = screen.getByRole('combobox', { name: 'Compare with' });
  expect(compared).toHaveValue('1');
  expect(
    within(compared).getByRole('option', { selected: true }),
  ).toHaveTextContent('Submission 1 · Compared source, not on this page');
  expect(
    screen.getByRole('region', { name: 'Comparison: Submission 1' }),
  ).toBeInTheDocument();
});
it('does not substitute current media for a legacy submission without frozen identity', () => {
  mockSnapshot.selected = {
    ...targetFixture(),
    availability: 'LEGACY_IDENTITY_MISSING',
    assetId: null,
    asset: null,
    targetToken: null,
  };
  setup();
  expect(
    screen.getByText(/older submission has no frozen asset identity/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Protected player/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Add precise feedback' }),
  ).not.toBeInTheDocument();
});
it('supports an exact intermediate asset and comparison without inventing a submission', () => {
  setup(
    `&creativeAsset=${REVIEW_ASSET_ID}&creativeCompare=${PREVIOUS_ASSET_ID}`,
    'ASSET',
  );
  expect(
    screen.getByLabelText('Production asset to review', { exact: true }),
  ).toHaveValue(REVIEW_ASSET_ID);
  expect(
    screen.getByRole('region', { name: 'Production asset: Launch v2.mp4' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('region', {
      name: 'Comparison: Production asset: Launch v1.mp4',
    }),
  ).toBeInTheDocument();
});
it('saves precise range feedback with the exact immutable target and keeps same-command retry after a lost response', async () => {
  mockCreate.mockRejectedValueOnce(new Error('Connection lost'));
  const view = setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Add precise feedback' }),
  );
  const editor = screen.getByRole('region', { name: 'Add precise feedback' });
  await userEvent.selectOptions(
    within(editor).getByLabelText('Feedback location', { exact: true }),
    'RANGE',
  );
  await userEvent.type(
    screen.getByLabelText('Start time (minutes:seconds)'),
    '0:12.500',
  );
  await userEvent.type(
    screen.getByLabelText('End time (minutes:seconds)'),
    '0:14',
  );
  await userEvent.type(
    screen.getByLabelText('Feedback or explanation'),
    'Keep the product label visible throughout',
  );
  await userEvent.click(
    within(editor).getByRole('button', { name: 'Add precise feedback' }),
  );
  await screen.findByRole('button', { name: 'Check earlier feedback request' });
  const original = mockCreate.mock.calls[0][0];
  expect(original.variables.input).toEqual(
    expect.objectContaining({
      assetId: REVIEW_ASSET_ID,
      submissionVersion: 2,
      targetToken: '2'.repeat(64),
      startMs: 12500,
      endMs: 14000,
      anchorKind: 'RANGE',
    }),
  );
  mockSnapshot.selected = {
    ...mockSnapshot.selected,
    targetToken: 'b'.repeat(64),
  };
  view.refresh();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check earlier feedback request' }),
  );
  expect(mockCreate.mock.calls[1][0]).toEqual(original);
  expect(await screen.findByText(/Feedback saved/)).toBeInTheDocument();
});
it('hides players and saved evidence during outage while preserving the protected draft through recovery', async () => {
  const view = setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Add precise feedback' }),
  );
  await userEvent.type(
    screen.getByLabelText('Feedback or explanation'),
    'Retain this exact draft',
  );
  const input = screen.getByLabelText('Feedback or explanation');
  mockError = new Error('offline');
  view.refresh();
  expect(screen.queryByText(/Protected player/)).not.toBeInTheDocument();
  expect(
    screen.queryByText('Keep the product label readable'),
  ).not.toBeInTheDocument();
  expect(input).not.toBeVisible();
  expect(input).toBeDisabled();
  mockError = undefined;
  mockReady = false;
  view.refresh();
  expect(screen.queryByText(/Protected player/)).not.toBeInTheDocument();
  mockReady = true;
  view.refresh();
  expect(screen.getByLabelText('Feedback or explanation')).toBe(input);
  expect(input).toHaveValue('Retain this exact draft');
  expect(input).toBeVisible();
});
it('hides a foreign-identity response and exposes retry without cached evidence', () => {
  mockSnapshot.userWorkspaceId = 'different-membership';
  setup();
  expect(screen.queryByText(/Protected player/)).not.toBeInTheDocument();
  expect(
    screen.queryByText('Keep the product label readable'),
  ).not.toBeInTheDocument();
});
it('remounts selected media when the exact target token changes and removes it on unverified identity', () => {
  const view = setup();
  const original = screen.getByRole('region', { name: 'Submission 2' });
  mockSnapshot.selected = {
    ...mockSnapshot.selected,
    targetToken: 'f'.repeat(64),
  };
  view.refresh();
  expect(screen.getByRole('region', { name: 'Submission 2' })).not.toBe(
    original,
  );
  mockSnapshot.userWorkspaceId = 'different-membership';
  view.refresh();
  expect(
    screen.queryByRole('region', { name: 'Submission 2' }),
  ).not.toBeInTheDocument();
});
it('protects version navigation and preserves queue filters after deliberate discard', async () => {
  const { router } = setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Add precise feedback' }),
  );
  await userEvent.type(
    screen.getByLabelText('Feedback or explanation'),
    'Unsaved review note',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Submission to review' }),
    '1',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Feedback or explanation')).toHaveValue(
    'Unsaved review note',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Submission to review' }),
    '1',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  await waitFor(() =>
    expect(router.state.location.search).toContain('creativeSubmission=1'),
  );
  expect(router.state.location.search).toContain('project=client-filter');
  expect(
    screen.queryByLabelText('Feedback or explanation'),
  ).not.toBeInTheDocument();
});
it('requires independent reviewer authority and explicit correction evidence before resolving', async () => {
  setup('&creativeCompare=1');
  await userEvent.click(
    screen.getByRole('button', { name: 'Verify and resolve' }),
  );
  const editor = screen.getByRole('region', {
    name: 'Verify and resolve feedback',
  });
  await userEvent.type(
    within(editor).getByLabelText('Feedback or explanation'),
    'Checked the original label; this request was mistaken',
  );
  expect(
    within(editor).getByRole('button', { name: 'Verify and resolve feedback' }),
  ).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Correction evidence' }),
    'ORIGINAL',
  );
  await userEvent.click(
    within(editor).getByRole('button', { name: 'Verify and resolve feedback' }),
  );
  expect(mockChange).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        feedbackId: FEEDBACK_ID,
        revision: 1,
        action: 'RESOLVED',
        evidenceAssetId: REVIEW_ASSET_ID,
        evidenceTargetToken: '2'.repeat(64),
      }),
    },
  });
});
it('uses current scoped server resolution authority without requiring global manager access', () => {
  mockManager = false;
  setup();
  expect(
    screen.getByRole('button', { name: 'Verify and resolve' }),
  ).toBeInTheDocument();
});
it('removes resolution controls when scoped server authority is absent', () => {
  mockSnapshot.canResolve = false;
  setup();
  expect(
    screen.queryByRole('button', { name: 'Verify and resolve' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reply' })).toBeEnabled();
});
it('hides stale resolution authority after current review capability is revoked while retaining reader comments', () => {
  const view = setup();
  mockReviewCapability = false;
  view.refresh();
  expect(
    screen.queryByRole('button', { name: 'Verify and resolve' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reply' })).toBeEnabled();
});
it('hides media and retains a protected feedback draft when the parent current-review check fails', async () => {
  const view = setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Add precise feedback' }),
  );
  await userEvent.type(
    screen.getByLabelText('Feedback or explanation'),
    'Retain while review authority is unknown',
  );
  const input = screen.getByLabelText('Feedback or explanation');
  mockParentEnabled = false;
  view.refresh();
  expect(input).not.toBeVisible();
  expect(input).toBeDisabled();
  expect(screen.queryByText(/Protected player/)).not.toBeInTheDocument();
  mockParentEnabled = true;
  view.refresh();
  expect(screen.getByLabelText('Feedback or explanation')).toBe(input);
  expect(input).toHaveValue('Retain while review authority is unknown');
});
it('lets the reviewer reopen a failed addressed correction directly without falsely resolving it', async () => {
  mockSnapshot.feedback = [
    { ...feedbackFixture(), status: 'ADDRESSED', correction: targetFixture(1) },
  ];
  setup();
  expect(
    screen.getByRole('button', { name: 'Verify and resolve' }),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reopen feedback' }),
  );
  const editor = screen.getByRole('region', { name: 'Reopen feedback' });
  expect(
    within(editor).getByRole('button', { name: 'Reopen feedback' }),
  ).toBeDisabled();
  expect(
    within(editor).queryByRole('combobox', { name: 'Correction evidence' }),
  ).not.toBeInTheDocument();
  await userEvent.type(
    within(editor).getByLabelText('Feedback or explanation'),
    'The correction still hides the label',
  );
  await userEvent.click(
    within(editor).getByRole('button', { name: 'Reopen feedback' }),
  );
  expect(mockChange).toHaveBeenCalledTimes(1);
  expect(mockChange).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        action: 'REOPENED',
        body: 'The correction still hides the label',
        evidenceAssetId: null,
        evidenceTargetKind: null,
        evidenceSubmissionVersion: null,
        evidenceTargetToken: null,
      }),
    },
  });
});
it('shows production feedback during review of the same submitted file and replies to its original thread', async () => {
  const assetThread = {
    ...feedbackFixture(),
    id: '5d10ea9e-0907-439f-8edc-36bd826afdd9',
    createdByName: 'Editor',
    body: 'Production note on this exact file',
    targetKind: 'ASSET',
    submissionVersion: null,
    target: {
      ...targetFixture(),
      targetKind: 'ASSET',
      submissionVersion: null,
      creativeVersion: null,
    },
  };
  mockSnapshot.feedback = [feedbackFixture(), assetThread];
  mockSnapshot.feedbackCount = 2;
  setup('&creativeSubmission=2');
  const row = screen.getByRole('article', { name: 'Feedback by Editor' });
  expect(row).toHaveTextContent('Production asset: Launch v2.mp4');
  expect(row).toHaveTextContent('Production note on this exact file');
  expect(
    within(row).getByRole('link', { name: 'Open exact feedback and history' }),
  ).toHaveAttribute(
    'href',
    expect.stringContaining(`creativeAsset=${REVIEW_ASSET_ID}`),
  );
  await userEvent.click(within(row).getByRole('button', { name: 'Reply' }));
  const editor = screen.getByRole('region', { name: 'Reply to feedback' });
  await userEvent.type(
    within(editor).getByLabelText('Feedback or explanation'),
    'Checked alongside the submitted file',
  );
  await userEvent.click(
    within(editor).getByRole('button', { name: 'Reply to feedback' }),
  );
  expect(mockChange).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        feedbackId: assetThread.id,
        action: 'REPLY',
      }),
    },
  });
  expect(assetThread.targetKind).toBe('ASSET');
  expect(assetThread.submissionVersion).toBeNull();
});
it('uses general feedback for a static image and saves no invented timestamps', async () => {
  const image = {
    ...targetFixture().asset,
    mimeType: 'image/png',
    name: 'Static ad.png',
  };
  mockSnapshot.selected = {
    ...mockSnapshot.selected,
    asset: { ...mockSnapshot.assets[0], ...image },
  };
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Add precise feedback' }),
  );
  const editor = screen.getByRole('region', { name: 'Add precise feedback' });
  expect(
    within(editor).queryByRole('option', { name: 'At a time' }),
  ).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByLabelText('Feedback or explanation'),
    'Increase the product label contrast',
  );
  await userEvent.click(
    within(editor).getByRole('button', { name: 'Add precise feedback' }),
  );
  expect(mockCreate).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        anchorKind: 'GENERAL',
        startMs: null,
        endMs: null,
        assetId: REVIEW_ASSET_ID,
      }),
    },
  });
});
it('marks an earlier thread addressed only with explicit correction evidence and keeps its original target', async () => {
  const original = {
    ...feedbackFixture(),
    target: targetFixture(1),
    submissionVersion: 1,
    assetId: PREVIOUS_ASSET_ID,
  };
  mockSnapshot.feedback = [original];
  setup('&creativeSubmission=1&creativeCompare=2');
  await userEvent.click(screen.getByRole('button', { name: 'Mark addressed' }));
  const editor = screen.getByRole('region', {
    name: 'Mark feedback addressed',
  });
  await userEvent.type(
    screen.getByLabelText('Feedback or explanation'),
    'Corrected label in the second submitted version',
  );
  expect(
    within(editor).getByRole('button', { name: 'Mark feedback addressed' }),
  ).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Correction evidence' }),
    'COMPARISON',
  );
  await userEvent.click(
    within(editor).getByRole('button', { name: 'Mark feedback addressed' }),
  );
  expect(mockChange).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        feedbackId: FEEDBACK_ID,
        action: 'ADDRESSED',
        evidenceSubmissionVersion: 2,
        evidenceAssetId: REVIEW_ASSET_ID,
      }),
    },
  });
  expect(original.submissionVersion).toBe(1);
  expect(original.assetId).toBe(PREVIOUS_ASSET_ID);
});
