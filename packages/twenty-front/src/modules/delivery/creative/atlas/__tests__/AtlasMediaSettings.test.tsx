import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { NetworkStatus } from '@apollo/client';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type DeliveryAtlasSettingsInput } from '~/generated-metadata/graphql';
import { AtlasMediaSettings } from '@/delivery/creative/atlas/AtlasMediaSettings';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  atlasSettingsFixture,
  ATLAS_IMAGE_PROFILE_ID,
  ATLAS_EDIT_PROFILE_ID,
} from '@/delivery/creative/atlas/__tests__/atlas.fixtures';
import { MANAGER_ID } from '@/delivery/tasks/__tests__/tasks.fixtures';
let mockSnapshot = atlasSettingsFixture();
let mockReady = true;
let mockAdministrator = true;
let mockError: Error | undefined;
let mockLoading = false;
let mockNetworkStatus = NetworkStatus.ready;
let mockMembership = 'membership';
let mockRefresh: () => void;
const mockRefetch = jest.fn();
const mockSave = jest.fn();
const mockVerify = jest.fn();
const mockRemove = jest.fn();
const mockQuery = jest.fn();
jest.mock('@/delivery/creative/atlas/atlasStyles', () => ({
  StyledAtlasForm: 'form',
  StyledAtlasBoundary: 'fieldset',
  StyledAtlasProfile: 'section',
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
    if (operationName(document) !== 'DeliveryAtlasSettings')
      throw new Error('Unexpected legacy workspace read');
    mockQuery(options);
    return {
      data: { deliveryAtlasSettings: mockSnapshot },
      loading: mockLoading,
      networkStatus: mockNetworkStatus,
      error: mockError,
      refetch: mockRefetch,
    };
  },
  useMutation: (document: DocumentNode) => {
    const name = operationName(document);
    if (name === 'SaveDeliveryAtlasSettings') return [mockSave];
    if (name === 'VerifyDeliveryAtlasConnection') return [mockVerify];
    if (name === 'RemoveDeliveryAtlasConnection') return [mockRemove];
    throw new Error(`Unexpected paid or legacy mutation: ${name}`);
  },
}));
const setup = () => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return <AtlasMediaSettings />;
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
    { initialEntries: ['/delivery?view=agents&agentView=media'] },
  );
  render(<RouterProvider router={router} />);
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
  mockSnapshot = atlasSettingsFixture();
  mockReady = true;
  mockAdministrator = true;
  mockError = undefined;
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  mockMembership = 'membership';
  mockRefetch.mockResolvedValue({});
  mockSave.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliveryAtlasSettingsInput };
    }) => {
      mockSnapshot = {
        ...mockSnapshot,
        enabled: input.enabled,
        enabledProfileIds: [...input.enabledProfileIds],
        reservationLimits: input.reservationLimits.map((limit) => ({
          ...limit,
        })),
        revision: input.revision + 1,
        keyConfigured: input.apiKey ? true : mockSnapshot.keyConfigured,
        verificationStatus: input.apiKey
          ? 'UNVERIFIED'
          : mockSnapshot.verificationStatus,
        verifiedAt: input.apiKey ? null : mockSnapshot.verifiedAt,
        defaultImageFamilyId: input.defaultImageFamilyId ?? null,
        defaultClipProfileId: input.defaultClipProfileId ?? null,
      };
      mockRefresh();
      return { data: { saveDeliveryAtlasSettings: mockSnapshot } };
    },
  );
  mockVerify.mockImplementation(async () => {
    mockSnapshot = {
      ...mockSnapshot,
      verificationStatus: 'VERIFIED',
      verifiedAt: '2026-10-30T08:00:00Z',
    };
    mockRefresh();
    return { data: { verifyDeliveryAtlasConnection: mockSnapshot } };
  });
  mockRemove.mockImplementation(async () => {
    mockSnapshot = {
      ...mockSnapshot,
      keyConfigured: false,
      enabled: false,
      revision: mockSnapshot.revision + 1,
      verifiedAt: null,
      verificationStatus: 'MISSING',
    };
    mockRefresh();
    return { data: { removeDeliveryAtlasConnection: mockSnapshot } };
  });
});
it('keeps defaults unset and a missing key distinct from verified connection or paid generation', () => {
  mockSnapshot = {
    ...mockSnapshot,
    keyConfigured: false,
    verificationStatus: 'MISSING',
    verifiedAt: null,
    defaultImageFamilyId: null,
    defaultClipProfileId: null,
    enabled: false,
  };
  setup();
  expect(screen.getByText('API key needed')).toBeVisible();
  expect(screen.getAllByText(/Unset — editor chooses explicitly/)).toHaveLength(
    2,
  );
  expect(screen.getByText('New Atlas requests paused')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Check connection' }),
  ).toBeDisabled();
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockVerify).not.toHaveBeenCalled();
});
it('writes a new key without revealing an existing credential, then requires a separate connection check', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Replace API key' }));
  const key = screen.getByLabelText('New Atlas API key');
  expect(screen.getByRole('form', { name: 'Atlas API key' })).toHaveFocus();
  expect(key).toHaveValue('');
  expect(key).toHaveAttribute('type', 'password');
  await user.type(key, 'synthetic-new-key');
  await user.click(screen.getByRole('button', { name: 'Save API key' }));
  expect(
    await screen.findByText('Key saved; connection not verified'),
  ).toBeVisible();
  expect(mockSave).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        apiKey: 'synthetic-new-key',
        revision: 4,
        defaultImageFamilyId: 'nano-banana-pro',
      }),
    },
  });
  expect(screen.queryByLabelText('New Atlas API key')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Replace API key' })).toHaveFocus();
  expect(mockVerify).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Check connection' }));
  expect(await screen.findByText('Connection check passed')).toBeVisible();
  expect(mockVerify).toHaveBeenCalledWith({
    variables: { input: { revision: 5 } },
  });
});
it('hides and retains a same-identity key draft through failed access retry until fresh recovery', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Replace API key' }));
  const key = screen.getByLabelText('New Atlas API key');
  await user.type(key, 'keep-synthetic-private-input');
  mockError = new Error('Offline');
  mockReady = false;
  act(mockRefresh);
  expect(key).not.toBeVisible();
  expect(key).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Retry media settings' }),
  );
  expect(key).not.toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
  mockReady = true;
  mockError = undefined;
  mockLoading = true;
  mockNetworkStatus = NetworkStatus.refetch;
  act(mockRefresh);
  expect(key).not.toBeVisible();
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  act(mockRefresh);
  expect(screen.getByLabelText('New Atlas API key')).toBe(key);
  expect(key).toHaveValue('keep-synthetic-private-input');
  expect(key).toBeVisible();
  expect(screen.getByRole('form', { name: 'Atlas API key' })).not.toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(key).toHaveValue('keep-synthetic-private-input');
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    screen.queryByRole('form', { name: 'Atlas API key' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Replace API key' })).toHaveFocus();
});
it('focuses a model editor once, leaves polling focus alone, and focuses a deliberate reload before returning to its launcher', async () => {
  setup();
  const user = userEvent.setup();
  const launcher = screen.getByRole('button', {
    name: 'Edit model access and defaults',
  });
  await user.click(launcher);
  const originalForm = screen.getByRole('form', {
    name: 'Media model access and defaults',
  });
  expect(originalForm).toHaveFocus();
  await user.tab();
  expect(
    within(originalForm).getByRole('checkbox', {
      name: 'Allow new Atlas generation requests',
    }),
  ).toHaveFocus();
  const defaultImage = within(originalForm).getByRole('combobox', {
    name: 'Default image family',
  });
  await user.click(defaultImage);
  mockLoading = true;
  mockNetworkStatus = NetworkStatus.poll;
  act(mockRefresh);
  expect(defaultImage).toHaveFocus();
  expect(
    screen.getByRole('form', { name: 'Media model access and defaults' }),
  ).toBe(originalForm);
  mockSnapshot = { ...mockSnapshot, revision: mockSnapshot.revision + 1 };
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  act(mockRefresh);
  expect(defaultImage).toHaveFocus();
  await user.click(
    screen.getByRole('button', { name: 'Reload current configuration' }),
  );
  const reloadedForm = screen.getByRole('form', {
    name: 'Media model access and defaults',
  });
  expect(reloadedForm).not.toBe(originalForm);
  expect(reloadedForm).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(launcher).toHaveFocus();
  expect(mockSave).not.toHaveBeenCalled();
});
it('returns focus to the model launcher after a confirmed settings save', async () => {
  setup();
  const user = userEvent.setup();
  const launcher = screen.getByRole('button', {
    name: 'Edit model access and defaults',
  });
  await user.click(launcher);
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Default image family' }),
    'gpt-image-2',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save media access and defaults' }),
  );
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('form', { name: 'Media model access and defaults' }),
  ).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
});
it('does not substitute a different default when its permitted operations are unchecked', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Edit model access and defaults' }),
  );
  const form = screen.getByRole('form', {
    name: 'Media model access and defaults',
  });
  await user.click(
    within(form).getByText(
      /Permitted model operations and reservation evidence/,
    ),
  );
  await user.click(
    within(form).getByRole('checkbox', {
      name: 'Nano Banana Pro · Text to image',
    }),
  );
  await user.click(
    within(form).getByRole('checkbox', {
      name: 'Nano Banana Pro · Image edit',
    }),
  );
  expect(within(form).getByLabelText('Default image family')).toHaveValue(
    'nano-banana-pro',
  );
  expect(
    within(form).getByLabelText('Default image family'),
  ).toHaveDisplayValue('Saved image default unavailable');
  expect(
    within(form).getByRole('button', {
      name: 'Save media access and defaults',
    }),
  ).toBeDisabled();
  await user.selectOptions(
    within(form).getByLabelText('Default image family'),
    'gpt-image-2',
  );
  await user.click(
    within(form).getByRole('button', {
      name: 'Save media access and defaults',
    }),
  );
  expect(mockSave).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        defaultImageFamilyId: 'gpt-image-2',
        enabledProfileIds: expect.not.arrayContaining([
          ATLAS_IMAGE_PROFILE_ID,
          ATLAS_EDIT_PROFILE_ID,
        ]),
      }),
    },
  });
});
it('keeps the initially empty catalog and pricing inputs visible after permitting its first model', async () => {
  mockSnapshot = {
    ...mockSnapshot,
    enabledProfileIds: [],
    defaultImageFamilyId: null,
    defaultClipProfileId: null,
    reservationLimits: [],
  };
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Edit model access and defaults' }),
  );
  const model = screen.getByRole('checkbox', {
    name: 'Nano Banana Pro · Text to image',
  });
  await user.click(model);
  expect(model).toBeVisible();
  expect(model).toBeChecked();
  expect(
    screen.getByLabelText(
      'Maximum reservation in USD for Nano Banana Pro · Text to image',
    ),
  ).toBeVisible();
});
it('requires a positive exact reservation and supporting evidence before saving an enabled model', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Edit model access and defaults' }),
  );
  await user.click(
    screen.getByText(/^Permitted model operations and reservation evidence/),
  );
  const limit = screen.getByLabelText(
    'Maximum reservation in USD for Nano Banana Pro · Text to image',
  );
  await user.clear(limit);
  await user.type(limit, '0');
  expect(
    screen.getByRole('button', { name: 'Save media access and defaults' }),
  ).toBeDisabled();
  await user.clear(limit);
  await user.type(limit, '0.375');
  const evidence = screen.getByLabelText(
    'Pricing evidence for Nano Banana Pro · Text to image',
  );
  await user.clear(evidence);
  expect(
    screen.getByRole('button', { name: 'Save media access and defaults' }),
  ).toBeDisabled();
  await user.type(evidence, 'Finite request tariff reviewed by administrator');
  await user.click(
    screen.getByRole('button', { name: 'Save media access and defaults' }),
  );
  expect(mockSave).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        reservationLimits: expect.arrayContaining([
          expect.objectContaining({
            profileId: ATLAS_IMAGE_PROFILE_ID,
            maximumCostUsd: '0.375',
            source: 'Finite request tariff reviewed by administrator',
          }),
        ]),
      }),
    },
  });
});
it('summarizes shared setup once while keeping model-specific estimated billing visible and saved readiness discoverable', async () => {
  const template = mockSnapshot.profiles[0];
  mockSnapshot = {
    ...mockSnapshot,
    keyConfigured: false,
    enabled: false,
    verificationStatus: 'MISSING',
    defaultImageFamilyId: null,
    defaultClipProfileId: null,
    enabledProfileIds: [],
    reservationLimits: [],
    profiles: Array.from({ length: 14 }, (_, index) => ({
      ...template,
      id: `catalog-model-${index}`,
      label: `Catalog image ${index + 1}`,
      enabled: false,
      available: false,
      blockedReasons: [
        'CONNECTION_MISSING',
        'CONNECTION_PAUSED',
        'CONNECTION_UNVERIFIED',
        'MODEL_DISABLED',
        'RESERVATION_LIMIT_MISSING',
        ...(index === 13 ? ['UNBOUNDED_ESTIMATED_BILLING'] : []),
      ],
    })),
  };
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Edit model access and defaults' }),
  );
  const form = screen.getByRole('form', {
    name: 'Media model access and defaults',
  });
  expect(within(form).getAllByText(/Current saved connection/)).toHaveLength(1);
  expect(within(form).getByLabelText('Default image family')).toBeVisible();
  expect(
    within(form).getByLabelText('Default image-to-video model'),
  ).toBeVisible();
  expect(
    within(form).queryByText('An administrator must save the Atlas API key.'),
  ).not.toBeInTheDocument();
  expect(
    within(form).queryByLabelText(/^Maximum reservation in USD/),
  ).not.toBeInTheDocument();
  expect(
    within(form).getByText(
      /This model’s estimated billing has no supported finite reservation/,
    ),
  ).toBeVisible();
  const first = within(form).getByRole('region', { name: 'Catalog image 1' });
  await user.click(within(first).getByText('Current saved model readiness'));
  expect(
    await within(first).findByText(
      'An administrator must save the Atlas API key.',
    ),
  ).toBeVisible();
  expect(
    within(form).getAllByText('An administrator must save the Atlas API key.'),
  ).toHaveLength(1);
  await user.click(
    within(first).getByRole('checkbox', { name: 'Catalog image 1' }),
  );
  expect(
    within(first).getByLabelText(
      'Maximum reservation in USD for Catalog image 1',
    ),
  ).toBeVisible();
  expect(
    within(first).getByText('Reservation evidence needs review'),
  ).toBeVisible();
});
it('keeps partial reservation evidence visible and repairable after an operation is disabled and its maximum is cleared', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Edit model access and defaults' }),
  );
  await user.click(
    screen.getByText(/^Permitted model operations and reservation evidence/),
  );
  await user.click(
    screen.getByRole('checkbox', { name: 'Nano Banana Pro · Text to image' }),
  );
  const limit = screen.getByLabelText(
    'Maximum reservation in USD for Nano Banana Pro · Text to image',
  );
  await user.clear(limit);
  const evidence = screen.getByLabelText(
    'Pricing evidence for Nano Banana Pro · Text to image',
  );
  expect(evidence).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Save media access and defaults' }),
  ).toBeDisabled();
  await user.clear(evidence);
  await user.clear(
    screen.getByLabelText(
      'Evidence verified at UTC for Nano Banana Pro · Text to image',
    ),
  );
  expect(
    screen.getByRole('button', { name: 'Save media access and defaults' }),
  ).toBeEnabled();
  await user.click(
    screen.getByRole('button', { name: 'Save media access and defaults' }),
  );
  expect(mockSave).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        enabledProfileIds: expect.not.arrayContaining([ATLAS_IMAGE_PROFILE_ID]),
        reservationLimits: expect.not.arrayContaining([
          expect.objectContaining({ profileId: ATLAS_IMAGE_PROFILE_ID }),
        ]),
      }),
    },
  });
});
it('keeps the saved-connection check separate from an unsaved key replacement', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Replace API key' }));
  await user.type(screen.getByLabelText('New Atlas API key'), 'not-saved');
  expect(
    screen.getByRole('button', { name: 'Check connection' }),
  ).toBeDisabled();
  expect(mockVerify).not.toHaveBeenCalled();
});
it('requires explicit connection-removal confirmation and pauses new generation without claiming a refund', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByText('Connection removal and existing provider jobs'),
  );
  expect(
    screen.getByRole('button', { name: 'Remove Atlas connection' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', {
      name: /I understand removal revokes saved key access/,
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Remove Atlas connection' }),
  );
  expect(await screen.findByText('API key needed')).toBeVisible();
  expect(screen.getByText('New Atlas requests paused')).toBeVisible();
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
it('disposes a key draft on current administrator revocation instead of reviving it after a regrant', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Replace API key' }));
  await user.type(screen.getByLabelText('New Atlas API key'), 'do-not-revive');
  mockAdministrator = false;
  act(mockRefresh);
  expect(screen.queryByLabelText('New Atlas API key')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('current administrators');
  mockAdministrator = true;
  act(mockRefresh);
  await user.click(screen.getByRole('button', { name: 'Replace API key' }));
  expect(screen.getByLabelText('New Atlas API key')).toHaveValue('');
});
