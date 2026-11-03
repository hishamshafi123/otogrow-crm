import { type ComponentProps } from 'react';
import { NetworkStatus } from '@apollo/client';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdvertisingReviewEditor } from '@/delivery/advertising/workbench/AdvertisingReviewEditor';
import { type AdvertisingReviewForm } from '@/delivery/advertising/workbench/AdvertisingReviewForm';
import {
  advertisingDraftInput,
  newAdvertisingReviewDraft,
} from '@/delivery/advertising/workbench/advertising-draft';
import { useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import {
  type AdvertisingCommand,
  type AdvertisingReceipt,
} from '@/delivery/advertising/workbench/useAdvertisingCommands';
import {
  ADVERTISING_IDENTITY,
  ADVERTISING_REPORT_ID,
  ADVERTISING_REQUEST_ID,
  ADVERTISING_REVIEW_ID,
  advertisingContext,
  advertisingSource,
} from '@/delivery/advertising/workbench/__tests__/advertising-workbench.fixtures';
import { type DeliveryAdvertisingReviewStateQuery } from '~/generated-metadata/graphql';

type ReviewStatus =
  DeliveryAdvertisingReviewStateQuery['deliveryAdvertisingReviewState']['review'];
let mockReviewStatus: ReviewStatus = null;
const mockExecute = jest.fn<
  Promise<AdvertisingReceipt | null>,
  [AdvertisingCommand]
>();
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { deliveryAdvertisingContext: advertisingContext() },
    loading: false,
    networkStatus: NetworkStatus.ready,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/delivery/assistants/useAssistantAccess', () => ({
  useAssistantAccess: () => ({
    source: 'verified-editor-context',
    administrator: true,
    permission: {
      ready: true,
      denied: false,
      manager: true,
      canManageRoles: true,
      scope: 'editor-workspace',
      matches: () => true,
      access: { roleIds: ['admin-role'], capabilities: ['workspace.admin'] },
    },
  }),
}));
jest.mock('@/delivery/advertising/workbench/useAdvertisingReview', () => ({
  useAdvertisingReview: () => ({
    data: { review: mockReviewStatus },
    denied: false,
  }),
}));
jest.mock('@/delivery/advertising/workbench/useAdvertisingCommands', () => ({
  useAdvertisingCommands: () => ({
    execute: mockExecute,
    check: jest.fn(),
    busy: false,
  }),
}));
jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftGuard: () => ({
    requestAction: (action: () => void) => action(),
    cancelPendingNavigation: jest.fn(),
  }),
  useDeliveryDraftStatus: jest.fn(),
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock(
  '@/delivery/advertising/workbench/advertisingWorkbenchStyles',
  () => ({ StyledAdvertisingBoundary: 'fieldset' }),
);
jest.mock('@/delivery/advertising/workbench/AdvertisingReviewForm', () => ({
  AdvertisingReviewForm: ({
    initial,
    stale,
    onSave,
  }: ComponentProps<typeof AdvertisingReviewForm>) => (
    <button
      disabled={stale}
      onClick={() => void onSave(advertisingDraftInput(initial))}
    >
      Save reviewed draft
    </button>
  ),
}));

const savedReceipt = (): AdvertisingReceipt => ({
  requestId: ADVERTISING_REQUEST_ID,
  reviewId: ADVERTISING_REVIEW_ID,
  action: 'SAVED',
  actorId: ADVERTISING_IDENTITY.memberId,
  createdAt: '2026-11-01T00:00:00.000Z',
  revision: 1,
  state: 'DRAFT',
  actionTasks: [],
  observationId: null,
});
const status = (): NonNullable<ReviewStatus> => ({
  id: ADVERTISING_REVIEW_ID,
  revision: 1,
  state: 'DRAFT',
  sourceKind: 'META',
  sourceId: ADVERTISING_REPORT_ID,
});
const properties = () => {
  const source = advertisingSource();
  const draft = newAdvertisingReviewDraft(
    ADVERTISING_REVIEW_ID,
    ADVERTISING_REQUEST_ID,
    source,
  );
  const { result } = renderHook(() => useAdvertisingContext(true));
  return {
    state: result.current,
    selection: { kind: 'META' as const, id: ADVERTISING_REPORT_ID },
    source,
    scope: 'verified-source',
    reviewId: ADVERTISING_REVIEW_ID,
    requestId: ADVERTISING_REQUEST_ID,
    intent: {
      mode: 'review' as const,
      requestId: ADVERTISING_REQUEST_ID,
      reviewId: ADVERTISING_REVIEW_ID,
      draft,
    },
    consumeIntent: jest.fn(),
    enabled: true,
    authorityLost: false,
    onAuthorityLost: jest.fn(),
    onClose: jest.fn(),
    onSaved: jest.fn(async () => {
      mockReviewStatus = status();
    }),
  };
};
const view = (props: ReturnType<typeof properties>) => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter>
      <AdvertisingReviewEditor
        state={props.state}
        selection={props.selection}
        source={props.source}
        scope={props.scope}
        reviewId={props.reviewId}
        requestId={props.requestId}
        intent={props.intent}
        consumeIntent={props.consumeIntent}
        enabled={props.enabled}
        authorityLost={props.authorityLost}
        onAuthorityLost={props.onAuthorityLost}
        onClose={props.onClose}
        onSaved={props.onSaved}
      />
    </MemoryRouter>
  </I18nProvider>
);

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockReviewStatus = null;
  mockExecute.mockReset();
  mockExecute.mockResolvedValue(savedReceipt());
});

it('acknowledges its confirmed save without treating the refreshed saved revision as a conflicting edit', async () => {
  const props = properties();
  const rendered = render(view(props));
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Save reviewed draft' }));
  rendered.rerender(view(props));
  expect(
    screen.getByText(
      'Recommendations saved as a draft. Review the recipients and evidence before assigning work.',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Open saved recommendations' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Save reviewed draft' }),
  ).not.toBeInTheDocument();
  expect(mockExecute).toHaveBeenCalledTimes(1);
});

it('still blocks an original draft when the current revision changed before any confirmed save', () => {
  const props = properties();
  mockReviewStatus = status();
  render(view(props));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This plan changed or was assigned elsewhere.',
  );
  expect(
    screen.getByRole('button', { name: 'Save reviewed draft' }),
  ).toBeDisabled();
  expect(mockExecute).not.toHaveBeenCalled();
});
