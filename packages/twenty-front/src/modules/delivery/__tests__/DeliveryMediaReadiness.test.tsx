import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryMedia } from '@/delivery/DeliveryMedia';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';

jest.mock('@/delivery/creative/atlas/AtlasProductionTools', () => ({
  AtlasProductionTools: () => <section>Atlas generation tools</section>,
}));

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));

type MediaModel = {
  id: string;
  kind: 'IMAGE' | 'CLIP' | 'INSPECTION';
  cost: null;
};
const MODEL_FIXTURE: MediaModel[] = [
  { id: 'google/inspection', kind: 'INSPECTION', cost: null },
  { id: 'google/image', kind: 'IMAGE', cost: null },
  { id: 'google/clip', kind: 'CLIP', cost: null },
];
let mockModels: MediaModel[] | undefined;
let mockLoading: boolean;
let mockQueryError: Error | undefined;
const mockRefetch = jest.fn();
const mockMutate = jest.fn();
const mockChanged = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: mockModels ? { deliveryMediaModels: mockModels } : undefined,
    loading: mockLoading,
    error: mockQueryError,
    refetch: mockRefetch,
  }),
  useMutation: () => [mockMutate, { loading: false }],
}));

const task: DeliveryTask = {
  id: 'task',
  title: 'Product creative',
  projectId: 'project',
  assigneeId: 'editor',
  dueAt: null,
  revision: 3,
  details: {
    brief: 'Preserve product details',
    service: 'AI video',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'manager',
    state: 'PLANNED',
    blocker: '',
    evidence: [],
    checklist: [],
    events: [],
    submissions: [],
    creative: {
      version: 1,
      productionVersion: 1,
      assemblyVersion: 1,
      briefVersion: 1,
      approvedBriefVersion: 1,
      brief: {
        objective: 'ADS',
        duration: 30,
        audience: '',
        painPoint: '',
        angle: '',
        concept: 'Launch',
        productFacts: '',
        mandatoryClaims: '',
        visualDirection: '',
        format: '9:16',
        hook: '',
        cta: '',
        music: '',
        brandAssets: [],
      },
      briefHistory: [],
      references: [],
      shots: [
        {
          id: 'shot',
          version: 1,
          title: 'Reveal',
          imagePrompt: 'Show product',
          animationPrompt: 'Turn product',
          duration: 5,
          subject: '',
          product: '',
          location: '',
          notes: '',
          referenceId: null,
          history: [],
          imageId: 'image',
          clipId: null,
        },
      ],
      assets: [
        {
          id: 'image',
          name: 'Product image',
          kind: 'IMAGE',
          mimeType: 'image/png',
          size: 100,
          createdAt: '2026-10-27T00:00:00Z',
          uploadedBy: 'editor',
          briefVersion: 1,
          productionVersion: 1,
          assemblyVersion: 1,
          shotId: 'shot',
          shotVersion: 1,
          storageState: 'READY',
          parentAssetId: null,
          reviews: [
            {
              memberId: 'manager',
              at: '2026-10-27T00:00:00Z',
              decision: 'APPROVED',
              notes: 'Product details checked',
            },
          ],
        },
      ],
      finalAssetId: null,
      assembly: { assetIds: [], overlayText: '', audioId: null, notes: '' },
      variants: [],
      revisionCharge: 0,
      mediaSettings: {
        version: 1,
        enabled: true,
        modelIds: MODEL_FIXTURE.map((model) => model.id),
        roles: ['ADMIN'],
        dailyRunLimit: 3,
        allowUnknownCost: false,
      },
    },
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'manager', isAdmin: true, isManager: true },
  tasks: [task],
  projects: [],
  members: [],
  companies: [],
};
const setup = (value = task) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const content = () => (
    <I18nProvider i18n={i18n}>
      <DeliveryMedia
        task={value}
        workspace={workspace}
        onChanged={mockChanged}
      />
    </I18nProvider>
  );
  const rendered = render(content());
  return { rerender: () => rendered.rerender(content()) };
};
const selectInspection = async () => {
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Shot' }),
    'shot',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Model' }),
    'google/inspection',
  );
  await userEvent.selectOptions(
    screen.getByRole('listbox', {
      name: 'Reference images — up to three, under 6 MB each',
    }),
    'image',
  );
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed these inputs and authorize this generation request',
    }),
  );
};
beforeEach(() => {
  mockModels = MODEL_FIXTURE;
  mockLoading = false;
  mockQueryError = undefined;
  mockRefetch.mockReset().mockResolvedValue({});
  mockMutate.mockReset().mockResolvedValue({});
  mockChanged.mockReset().mockResolvedValue(undefined);
});

it('shows a pending check without calling the models disconnected or offering stale choices', () => {
  mockLoading = true;
  setup();
  expect(screen.getByText('Checking media model access…')).toBeVisible();
  expect(
    screen.queryByText(/No supported Google media models are configured/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'Model' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Select a model to continue' }),
  ).not.toBeInTheDocument();
  expect(mockMutate).not.toHaveBeenCalled();
});
it('hides stale model options after a failed check and offers a retry', async () => {
  mockQueryError = new Error('Synthetic model discovery failure');
  setup();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Media model access could not be checked. Your draft is kept.',
  );
  expect(
    screen.queryByText(/No supported Google media models are configured/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'google/inspection' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save generation access' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry media model check' }),
  );
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(mockMutate).not.toHaveBeenCalled();
});
it('distinguishes a verified empty configuration from loading and failure', () => {
  mockModels = [];
  setup();
  expect(
    screen.getByText(/No supported Google media models are configured/),
  ).toBeVisible();
  expect(
    screen.queryByText('Checking media model access…'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry media model check' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/earlier testing key/)).not.toBeInTheDocument();
});
it('distinguishes Google inspection from Atlas generation and independent human review', () => {
  setup();
  expect(
    screen.getByText(
      /Selected still images can be inspected with a permitted Google model/,
    ),
  ).toBeVisible();
  expect(
    screen.getByText(/Use Atlas above for supported image\/video generation/),
  ).toBeVisible();
  expect(
    screen.getByText(/motion and audio require human review/),
  ).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Google still-image inspection' }),
  ).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Model' })).toBeEnabled();
  expect(
    screen.getByRole('button', { name: 'Select a model to continue' }),
  ).toBeDisabled();
});
it('preserves configured Atlas models when saving Google inspection access', async () => {
  const value = structuredClone(task);
  value.details.creative!.mediaSettings!.modelIds.push(
    'atlascloud/google/nano-banana-pro/text-to-image',
  );
  setup(value);
  await userEvent.click(
    screen.getByText('Generation access for this production'),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save generation access' }),
  );
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(mockMutate.mock.calls[0][0].variables.input).toMatchObject({
    action: 'configure',
    modelIds: [
      ...MODEL_FIXTURE.map((model) => model.id),
      'atlascloud/google/nano-banana-pro/text-to-image',
    ],
    allowUnknownCost: false,
  });
});
it('allows a reviewed still-image inspection request without granting final approval', async () => {
  setup();
  await selectInspection();
  await userEvent.click(
    screen.getByRole('button', { name: 'Inspect selected images' }),
  );
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(mockMutate.mock.calls[0][0].variables.input).toMatchObject({
    action: 'generate',
    taskId: 'task',
    revision: 3,
    shotId: 'shot',
    modelId: 'google/inspection',
    kind: 'INSPECTION',
    referenceAssetIds: ['image'],
    confirm: true,
  });
  expect(mockMutate.mock.calls[0][0].variables.input.action).not.toBe(
    'approve',
  );
});
it.each(['google/image', 'google/clip'])(
  'keeps %s generation blocked despite configured access and confirmed inputs',
  async (modelId) => {
    setup();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Shot' }),
      'shot',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Model' }),
      modelId,
    );
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'I reviewed these inputs and authorize this generation request',
      }),
    );
    const button = screen.getByRole('button', {
      name: 'Generation unavailable',
    });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(mockMutate).not.toHaveBeenCalled();
  },
);
it('restores generation and configuration drafts after retrying a failed model check', async () => {
  const rendered = setup();
  await selectInspection();
  await userEvent.click(
    screen.getByText('Generation access for this production'),
  );
  const limit = screen.getByRole('spinbutton', {
    name: 'Daily run limit for this production (UTC)',
  });
  await userEvent.clear(limit);
  await userEvent.type(limit, '5');
  mockQueryError = new Error('Synthetic model discovery failure');
  rendered.rerender();
  expect(
    screen.queryByRole('combobox', { name: 'Model' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('listbox', { name: 'Allowed models' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry media model check' }),
  );
  mockQueryError = undefined;
  rendered.rerender();
  expect(screen.getByRole('combobox', { name: 'Shot' })).toHaveValue('shot');
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue(
    'google/inspection',
  );
  expect(
    screen.getByRole('checkbox', {
      name: 'I reviewed these inputs and authorize this generation request',
    }),
  ).toBeChecked();
  expect(
    screen.getByRole('spinbutton', {
      name: 'Daily run limit for this production (UTC)',
    }),
  ).toHaveValue(5);
  expect(screen.getByRole('listbox', { name: 'Allowed models' })).toHaveValue(
    MODEL_FIXTURE.map((model) => model.id),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save generation access' }),
  );
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(mockMutate.mock.calls[0][0].variables.input).toMatchObject({
    action: 'configure',
    dailyRunLimit: 5,
  });
});
it('initializes saved model selections after the first successful asynchronous check', async () => {
  mockModels = undefined;
  mockLoading = true;
  const rendered = setup();
  mockModels = MODEL_FIXTURE;
  mockLoading = false;
  rendered.rerender();
  await userEvent.click(
    screen.getByText('Generation access for this production'),
  );
  expect(screen.getByRole('listbox', { name: 'Allowed models' })).toHaveValue(
    MODEL_FIXTURE.map((model) => model.id),
  );
});
it('keeps cancellation of an existing run available during a model-discovery outage', async () => {
  mockQueryError = new Error('Synthetic model discovery failure');
  const value = structuredClone(task);
  value.details.creative!.mediaRuns = [
    {
      id: 'run',
      requestId: 'request',
      modelId: 'google/inspection',
      kind: 'INSPECTION',
      shotId: 'shot',
      shotVersion: 1,
      briefVersion: 1,
      settingsVersion: 1,
      prompt: 'Inspect approved product still',
      referenceAssetIds: ['image'],
      initiatorId: 'manager',
      userWorkspaceId: 'membership',
      status: 'RUNNING',
      createdAt: '2026-10-27T00:00:00Z',
      updatedAt: '2026-10-27T00:00:00Z',
      error: null,
      providerJobId: null,
      assetId: null,
      cost: null,
    },
  ];
  setup(value);
  const button = screen.getByRole('button', { name: 'Cancel this request' });
  expect(button).toBeEnabled();
  await userEvent.click(button);
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(mockMutate.mock.calls[0][0].variables.input).toMatchObject({
    action: 'cancel',
    runId: 'run',
    taskId: 'task',
    revision: 3,
  });
});

it('refreshes model access and current task/run data together from the header', async () => {
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh media status' }),
  );
  await waitFor(() => {
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(mockChanged).toHaveBeenCalledTimes(1);
  });
  expect(mockMutate).not.toHaveBeenCalled();
});

it('reports an incomplete refresh while retaining the prepared inspection draft', async () => {
  mockChanged.mockRejectedValueOnce(
    new Error('Synthetic task refresh failure'),
  );
  setup();
  await selectInspection();
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh media status' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Media status could not be fully refreshed. Your draft is kept.',
  );
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue(
    'google/inspection',
  );
  expect(
    screen.getByRole('checkbox', {
      name: 'I reviewed these inputs and authorize this generation request',
    }),
  ).toBeChecked();
  expect(
    screen.getByRole('button', { name: 'Refresh media status' }),
  ).toBeEnabled();
  expect(mockMutate).not.toHaveBeenCalled();
});
