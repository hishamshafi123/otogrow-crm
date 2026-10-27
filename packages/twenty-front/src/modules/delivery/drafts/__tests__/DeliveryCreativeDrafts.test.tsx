import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryCreative } from '@/delivery/DeliveryCreative';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryBadge: 'span',
}));
const mockMutate = jest.fn();
const changed = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate, { loading: false }],
  useQuery: () => ({
    data: {
      deliveryMediaModels: [{ id: 'image-model', kind: 'IMAGE', cost: null }],
    },
  }),
}));
const task: DeliveryTask = {
  id: 'task',
  title: 'Brand video',
  projectId: 'project',
  assigneeId: 'editor',
  dueAt: null,
  revision: 3,
  details: {
    brief: '',
    service: 'Video',
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
      approvedBriefVersion: null,
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
          animationPrompt: '',
          duration: 5,
          subject: '',
          product: '',
          location: '',
          notes: '',
          referenceId: null,
          history: [],
          imageId: null,
          clipId: null,
        },
      ],
      assets: [],
      finalAssetId: null,
      assembly: { assetIds: [], overlayText: '', audioId: null, notes: '' },
      variants: [],
      revisionCharge: 0,
      mediaSettings: {
        version: 1,
        enabled: true,
        modelIds: ['image-model'],
        roles: ['ADMIN'],
        dailyRunLimit: 3,
        allowUnknownCost: true,
      },
    },
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'manager', isAdmin: true, isManager: true },
  tasks: [task],
  companies: [],
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Brand',
      companyId: null,
      memberIds: ['editor'],
    },
  ],
  members: [],
};
const Harness = () => {
  const [revision, setRevision] = useState(3);
  return (
    <>
      <button onClick={() => setRevision(4)}>Refresh creative</button>
      <DeliveryCreative
        task={{ ...task, revision }}
        workspace={workspace}
        onChanged={changed}
        onOpenTask={jest.fn()}
      />
    </>
  );
};
const setup = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness />
          </DeliveryDraftGuardProvider>
        ),
      },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return userEvent.setup();
};
beforeAll(() => {
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockMutate.mockReset().mockResolvedValue({ data: {} });
  changed.mockReset().mockResolvedValue(undefined);
});

it('protects reference proposals across stages and keeps an unsuccessful submission for retry', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'References' }));
  await user.type(screen.getByLabelText('Title'), 'Product inspiration');
  await user.type(
    screen.getByLabelText('Reference URL'),
    'https://example.com/reference',
  );
  await user.click(screen.getByRole('button', { name: 'Shots' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Title')).toHaveValue('Product inspiration');
  mockMutate.mockRejectedValueOnce(new Error('Reference not saved'));
  await user.click(screen.getByRole('button', { name: 'Add reference' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Reference not saved');
  expect(screen.getByLabelText('Reference URL')).toHaveValue(
    'https://example.com/reference',
  );
  await user.click(screen.getByRole('button', { name: 'Add reference' }));
  expect(mockMutate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      variables: {
        input: expect.objectContaining({
          action: 'reference',
          taskId: 'task',
          revision: 3,
        }),
      },
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Shots' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save shot' })).toBeInTheDocument();
});

it('protects shot Cancel and blocks submitting prompts against a refreshed revision', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Shots' }));
  await user.click(screen.getByRole('button', { name: 'Edit shot' }));
  await user.type(screen.getByLabelText('Image prompt'), ' close up');
  await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Image prompt')).toHaveValue(
    'Show product close up',
  );
  await user.click(screen.getByRole('button', { name: 'Refresh creative' }));
  expect(screen.getByRole('button', { name: 'Save shot' })).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Image prompt')).toHaveValue('Show product');
  await user.type(screen.getByLabelText('Image prompt'), ' accurate');
  await user.click(screen.getByRole('button', { name: 'Save shot' }));
  expect(mockMutate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      variables: {
        input: expect.objectContaining({
          action: 'shot',
          id: 'shot',
          revision: 4,
        }),
      },
    }),
  );
  expect(
    screen.queryByRole('button', { name: 'Cancel editing' }),
  ).not.toBeInTheDocument();
});

it('removes unknown-cost permission and blocks image generation until billing support exists', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Generation' }));
  await user.click(screen.getByText('Generation access for this production'));
  expect(
    screen.queryByLabelText(
      'Allow bounded runs when monetary pricing is unknown',
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Paid requests require supported pricing/),
  ).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Shot'), 'shot');
  await user.selectOptions(screen.getByLabelText('Model'), 'image-model');
  await user.click(
    screen.getByLabelText(
      'I reviewed these inputs and authorize this generation request',
    ),
  );
  expect(
    screen.getByRole('button', { name: 'Generation unavailable' }),
  ).toBeDisabled();
  expect(
    screen.getByText(/Image and video generation are unavailable/),
  ).toBeVisible();
  expect(mockMutate).not.toHaveBeenCalled();
});

it('protects prepared media inputs on stage changes and requires reselecting a refreshed source version', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Generation' }));
  await user.selectOptions(screen.getByLabelText('Shot'), 'shot');
  await user.selectOptions(screen.getByLabelText('Model'), 'image-model');
  await user.click(screen.getByRole('button', { name: 'Brief' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Shot')).toHaveValue('shot');
  await user.click(screen.getByRole('button', { name: 'Refresh creative' }));
  expect(
    screen.getByRole('button', { name: 'Generation unavailable' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Shot')).toHaveValue('');
  expect(screen.getByLabelText('Model')).toHaveValue('');
  await user.click(screen.getByRole('button', { name: 'Brief' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mockMutate).not.toHaveBeenCalled();
});
