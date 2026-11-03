import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type DeliveryAtlasQuoteInput } from '~/generated-metadata/graphql';
import { AtlasProductionTools } from '@/delivery/creative/atlas/AtlasProductionTools';
import { type AtlasRun } from '@/delivery/creative/atlas/atlas.types';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  atlasProductionFixture,
  atlasQuoteFixture,
  atlasRunFixture,
  atlasRunsFixture,
} from '@/delivery/creative/atlas/__tests__/atlas.fixtures';
import { MANAGER_ID, TASK_ID } from '@/delivery/tasks/__tests__/tasks.fixtures';

let mockProduction = atlasProductionFixture();
let mockRuns = atlasRunsFixture();
let mockReady = true;
let mockAdministrator = true;
let mockMembership = 'membership';
let mockError: Error | undefined;
let mockLoading = false;
let mockNetworkStatus = NetworkStatus.ready;
let mockRefresh: () => void;
const mockRefetch = jest.fn();
const mockQuote = jest.fn();
const mockStart = jest.fn();
const mockConfigure = jest.fn();
const mockCancel = jest.fn();
const mockResume = jest.fn();
const mockCheck = jest.fn();
const mockChanged = jest.fn();
const mockQuery = jest.fn();
const mockRefetchQueries = jest.fn();

jest.mock('@/delivery/creative/atlas/atlasStyles', () => ({
  StyledAtlasForm: 'form',
  StyledAtlasBoundary: 'fieldset',
  StyledAtlasProfile: 'section',
  StyledAtlasPrompt: 'pre',
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryCard: 'section',
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    loading: !mockReady,
    scope: `workspace:${MANAGER_ID}:${mockMembership}`,
    access: mockReady
      ? {
          capabilities: mockAdministrator ? ['workspace.admin'] : [],
          roleIds: [],
          grants: [],
        }
      : undefined,
    error: mockError,
    refetch: mockRefetch,
    matches: (
      data?: {
        workspaceId: string;
        memberId: string;
        userWorkspaceId: string;
      } | null,
    ) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === MANAGER_ID &&
      data.userWorkspaceId === mockMembership,
  }),
}));
const operationName = (document: DocumentNode) => {
  const operation = document.definitions.find(
    (entry) => entry.kind === 'OperationDefinition',
  );
  return operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
};
jest.mock('@apollo/client/react', () => ({
  useQuery: (document: DocumentNode, options: unknown) => {
    const name = operationName(document);
    mockQuery(name, options);
    if (!['DeliveryAtlasProduction', 'DeliveryAtlasRuns'].includes(name ?? ''))
      throw new Error(`Unexpected legacy read: ${name}`);
    return {
      data:
        name === 'DeliveryAtlasProduction'
          ? { deliveryAtlasProduction: structuredClone(mockProduction) }
          : { deliveryAtlasRuns: structuredClone(mockRuns) },
      loading: mockLoading,
      networkStatus: mockNetworkStatus,
      error: mockError,
      refetch: mockRefetch,
      client: { query: mockCheck, refetchQueries: mockRefetchQueries },
    };
  },
  useMutation: (document: DocumentNode) => {
    const name = operationName(document);
    if (name === 'QuoteDeliveryAtlasGeneration') return [mockQuote];
    if (name === 'StartDeliveryAtlasGeneration') return [mockStart];
    if (name === 'ConfigureDeliveryAtlasProductionAccess')
      return [mockConfigure];
    if (name === 'CancelDeliveryAtlasGeneration') return [mockCancel];
    if (name === 'ResumeDeliveryAtlasGeneration') return [mockResume];
    throw new Error(`Unexpected legacy mutation: ${name}`);
  },
}));
const setup = (
  entry = `/delivery?view=creative&task=${TASK_ID}&search=keep`,
) => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return (
      <AtlasProductionTools
        taskId={TASK_ID}
        taskRevision={4}
        onChanged={mockChanged}
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
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
};
const preparePrice = async () => {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Prepare image or video request' }),
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Image or animation prompt' }),
    'Retained approved product image',
  );
  await user.click(
    screen.getByRole('button', { name: 'Review price and reservation' }),
  );
  await screen.findByText('Price and spending review');
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed this exact model/ }),
  );
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockProduction = atlasProductionFixture();
  mockRuns = atlasRunsFixture();
  mockReady = true;
  mockAdministrator = true;
  mockMembership = 'membership';
  mockError = undefined;
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  mockRefetch.mockResolvedValue({});
  mockRefetchQueries.mockResolvedValue([]);
  mockChanged.mockResolvedValue(undefined);
  mockQuote.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliveryAtlasQuoteInput };
    }) => ({
      data: {
        quoteDeliveryAtlasGeneration: {
          ...atlasQuoteFixture(),
          requestId: input.requestId,
          profileId: input.profileId,
        },
      },
    }),
  );
  mockStart.mockResolvedValue({
    data: { startDeliveryAtlasGeneration: atlasRunFixture() },
  });
  mockCancel.mockResolvedValue({
    data: {
      cancelDeliveryAtlasGeneration: {
        ...atlasRunFixture(),
        publicationCancelled: true,
        canCancel: false,
      },
    },
  });
  mockResume.mockResolvedValue({
    data: { resumeDeliveryAtlasGeneration: atlasRunFixture() },
  });
});

it('loads only bounded typed production/run sources and never starts generation from a read', () => {
  setup();
  expect(
    screen.getByRole('heading', { name: 'Atlas image and video' }),
  ).toBeVisible();
  expect(
    mockQuery.mock.calls.every(([name]) =>
      ['DeliveryAtlasProduction', 'DeliveryAtlasRuns'].includes(name),
    ),
  ).toBe(true);
  expect(mockQuote).not.toHaveBeenCalled();
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockCheck).not.toHaveBeenCalled();
});
it('retains a prepared prompt, price and consent through benign polls and hidden failed reads, without automatic writes', async () => {
  setup();
  await preparePrice();
  const prompt = screen.getByRole('textbox', {
    name: 'Image or animation prompt',
  });
  mockLoading = true;
  mockNetworkStatus = NetworkStatus.poll;
  act(mockRefresh);
  expect(prompt).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: /I reviewed this exact model/ }),
  ).toBeChecked();
  mockLoading = false;
  mockReady = false;
  mockError = new Error('Synthetic outage');
  mockNetworkStatus = NetworkStatus.error;
  act(mockRefresh);
  expect(prompt).not.toBeVisible();
  expect(
    screen.queryByText('Recorded original image prompt'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry Atlas production access' }),
  ).toBeEnabled();
  mockReady = true;
  mockError = undefined;
  mockLoading = true;
  mockNetworkStatus = NetworkStatus.refetch;
  act(mockRefresh);
  expect(prompt).not.toBeVisible();
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  act(mockRefresh);
  expect(
    screen.getByRole('textbox', { name: 'Image or animation prompt' }),
  ).toHaveValue('Retained approved product image');
  expect(
    screen.getByRole('checkbox', { name: /I reviewed this exact model/ }),
  ).toBeChecked();
  expect(mockQuote).toHaveBeenCalledTimes(1);
  expect(mockStart).not.toHaveBeenCalled();
});
it('rejects a mismatched price response without presenting its price or enabling Start', async () => {
  mockQuote.mockResolvedValue({
    data: {
      quoteDeliveryAtlasGeneration: {
        ...atlasQuoteFixture(),
        memberId: 'another-person',
      },
    },
  });
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Prepare image or video request' }),
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Image or animation prompt' }),
    'Product image',
  );
  await user.click(
    screen.getByRole('button', { name: 'Review price and reservation' }),
  );
  expect(
    await screen.findByText(/The price review was not confirmed/),
  ).toBeVisible();
  expect(
    screen.queryByText('Price and spending review'),
  ).not.toBeInTheDocument();
  expect(mockStart).not.toHaveBeenCalled();
});
it('retains a known committed generation receipt during an access outage and prevents another Start for that draft', async () => {
  let complete:
    | ((value: { data: { startDeliveryAtlasGeneration: AtlasRun } }) => void)
    | undefined;
  mockStart.mockImplementation(
    () =>
      new Promise<{ data: { startDeliveryAtlasGeneration: AtlasRun } }>(
        (resolve) => {
          complete = resolve;
        },
      ),
  );
  setup();
  await preparePrice();
  await userEvent.click(
    screen.getByRole('button', { name: 'Start this generation request' }),
  );
  mockReady = false;
  mockError = new Error('Access polling interrupted after the request');
  act(mockRefresh);
  const input = mockQuote.mock.calls[0][0].variables.input;
  if (!complete)
    throw new Error('The explicit generation request was not attempted');
  const finish = complete;
  await act(async () =>
    finish({
      data: {
        startDeliveryAtlasGeneration: {
          ...atlasRunFixture(),
          requestId: input.requestId,
          status: 'QUEUED',
        },
      },
    }),
  );
  expect(
    screen.queryByRole('button', { name: 'Start this generation request' }),
  ).not.toBeInTheDocument();
  mockReady = true;
  mockError = undefined;
  act(mockRefresh);
  expect(screen.getByText('Queued for generation')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Start this generation request' }),
  ).not.toBeInTheDocument();
  expect(mockStart).toHaveBeenCalledTimes(1);
});
it('disposes a private prepared request on a real membership change and does not revive it when access returns', async () => {
  setup();
  await preparePrice();
  mockMembership = 'new-membership';
  act(mockRefresh);
  expect(
    screen.queryByDisplayValue('Retained approved product image'),
  ).not.toBeInTheDocument();
  mockProduction = { ...mockProduction, userWorkspaceId: mockMembership };
  mockRuns = { ...mockRuns, userWorkspaceId: mockMembership, items: [] };
  act(mockRefresh);
  await userEvent.click(
    screen.getByRole('button', { name: 'Prepare image or video request' }),
  );
  expect(
    screen.getByRole('textbox', { name: 'Image or animation prompt' }),
  ).toHaveValue('');
});
it('disposes the prepared source after confirmed forbidden access rather than recovering it from cached data', async () => {
  setup();
  await preparePrice();
  mockError = new CombinedGraphQLErrors({
    errors: [
      {
        message: 'No current project access',
        extensions: { code: 'FORBIDDEN' },
      },
    ],
  });
  act(mockRefresh);
  expect(
    screen.queryByDisplayValue('Retained approved product image'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('Recorded original image prompt'),
  ).not.toBeInTheDocument();
  mockError = undefined;
  act(mockRefresh);
  await userEvent.click(
    screen.getByRole('button', { name: 'Prepare image or video request' }),
  );
  expect(
    screen.getByRole('textbox', { name: 'Image or animation prompt' }),
  ).toHaveValue('');
});
it('removes administrator access controls and an opened access draft after verified role loss', async () => {
  setup();
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Configure this production’s media access',
    }),
  );
  expect(
    screen.getByRole('button', { name: 'Save production media access' }),
  ).toBeVisible();
  mockAdministrator = false;
  act(mockRefresh);
  expect(
    screen.queryByRole('button', { name: 'Save production media access' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', {
      name: 'Configure this production’s media access',
    }),
  ).not.toBeInTheDocument();
  expect(mockConfigure).not.toHaveBeenCalled();
});
it('keeps the original model, zero/false parameters and unconfirmed actual distinct from the estimate and reservation', async () => {
  setup();
  const run = screen.getByRole('region', {
    name: /Nano Banana Pro.*Waiting for Atlas output/,
  });
  expect(
    within(run).getByText('Atlas estimate at request: USD 0.12'),
  ).toBeVisible();
  expect(
    within(run).getByText('Maximum OS reservation at request: USD 0.50'),
  ).toBeVisible();
  expect(
    within(run).getByText('Actual provider charge: unconfirmed.'),
  ).toBeVisible();
  await userEvent.click(
    within(run).getByText('Recorded model, inputs and source versions'),
  );
  expect(within(run).getByText('Recorded original image prompt')).toBeVisible();
  expect(within(run).getByText('Generate audio: No')).toBeVisible();
  expect(within(run).getByText('Seed: 0')).toBeVisible();
  mockRuns = {
    ...mockRuns,
    items: [{ ...atlasRunFixture(), actualCostUsd: '0', costState: 'SETTLED' }],
  };
  act(mockRefresh);
  expect(
    screen.getByText('Recorded actual provider charge: USD 0.00'),
  ).toBeVisible();
});
it('shows the current spending state outside history details for cancelled jobs, without turning an unknown charge into zero', () => {
  mockRuns = {
    ...mockRuns,
    items: [
      {
        ...atlasRunFixture(),
        status: 'CANCELLED',
        publicationCancelled: true,
        canCancel: false,
        canResume: false,
        costState: 'RELEASED',
      },
    ],
  };
  setup();
  expect(
    screen.getByText('Current spending status: Spending hold released'),
  ).toBeVisible();
  expect(
    screen.getByText('Actual provider charge: unconfirmed.'),
  ).toBeVisible();
  mockRuns = {
    ...mockRuns,
    items: [{ ...mockRuns.items[0], costState: 'UNCERTAIN' }],
  };
  act(mockRefresh);
  expect(
    screen.getByText('Current spending status: Charge needs reconciliation'),
  ).toBeVisible();
  expect(
    screen.queryByText('Recorded actual provider charge: USD 0.00'),
  ).not.toBeInTheDocument();
});
it('checks only a known prediction and explains local cancellation without promising a stopped provider or refund', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Check known Atlas job' }),
  );
  expect(mockResume).toHaveBeenCalledWith({
    variables: { input: { taskId: TASK_ID, runId: atlasRunFixture().id } },
  });
  expect(
    await screen.findByText(/No generation submission was repeated/),
  ).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Stop local publication' }),
  );
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(
    await screen.findByText(/Atlas may continue processing or charging/),
  ).toBeVisible();
  expect(mockStart).not.toHaveBeenCalled();
  mockRuns = {
    ...mockRuns,
    items: [
      { ...atlasRunFixture(), providerPredictionId: null, canCancel: false },
    ],
  };
  act(mockRefresh);
  expect(
    screen.queryByRole('button', { name: 'Check known Atlas job' }),
  ).not.toBeInTheDocument();
});
it('preserves task and filter context in bounded history pages and exact output/reference links', () => {
  mockRuns = {
    ...mockRuns,
    items: [
      {
        ...atlasRunFixture(),
        assetId: atlasProductionFixture().assets[0].id,
        referenceAssetIds: [atlasProductionFixture().assets[0].id],
      },
    ],
  };
  setup();
  const older = new URL(
    screen
      .getByRole('link', { name: 'Earlier saved requests' })
      .getAttribute('href') ?? '',
    'https://example.test',
  );
  expect(older.searchParams.get('atlasRunsBefore')).toBe(mockRuns.nextBeforeId);
  expect(older.searchParams.get('search')).toBe('keep');
  expect(older.searchParams.get('task')).toBe(TASK_ID);
  const output = new URL(
    screen
      .getByRole('link', { name: 'Review this exact output' })
      .getAttribute('href') ?? '',
    'https://example.test',
  );
  expect(output.searchParams.get('creativeAsset')).toBe(
    mockProduction.assets[0].id,
  );
  expect(output.searchParams.has('creativeSubmission')).toBe(false);
  expect(output.searchParams.get('search')).toBe('keep');
});
