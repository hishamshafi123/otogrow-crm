import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Request } from 'cross-fetch';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryCreative } from '@/delivery/DeliveryCreative';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import { type CreativeDocument } from '@/delivery/delivery-creative.types';
import {
  REVIEW_ASSET_ID,
  REVIEW_TASK_ID,
  targetFixture,
} from '@/delivery/creative/review/__tests__/creative-review.fixtures';
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryBadge: 'span',
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryGrid: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));
jest.mock('@/delivery/DeliveryCreativeForms', () => ({
  DeliveryCreativeBriefForm: () => <p>Brief editor</p>,
  DeliveryCreativeAssemblyForm: () => null,
  DeliveryCreativeShotForm: () => null,
}));
jest.mock('@/delivery/DeliveryMedia', () => ({ DeliveryMedia: () => null }));
jest.mock('@/delivery/creative/review/DeliveryCreativeReview', () => ({
  DeliveryCreativeReview: () => (
    <section aria-label="Exact asset review">
      <video aria-label="Selected file" />
      <video aria-label="Compared file" />
    </section>
  ),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({ ready: true, scope: 'workspace:member' }),
}));
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [jest.fn(), { loading: false }],
}));
jest.mock('jotai', () => ({ useStore: () => ({ get: () => null }) }));
const asset = targetFixture().asset;
if (!asset) throw new Error('Fixture needs its exact media');
const creative: CreativeDocument = {
  version: 2,
  productionVersion: 2,
  assemblyVersion: 2,
  briefVersion: 1,
  approvedBriefVersion: 1,
  briefHistory: [],
  references: [],
  shots: [],
  assets: [
    {
      ...asset,
      kind: 'FINAL',
      storageState: 'READY',
      shotId: asset.shotId ?? null,
      shotVersion: asset.shotVersion ?? null,
      parentAssetId: asset.parentAssetId ?? null,
      reviews: [],
      uploadedBy: 'editor',
    },
  ],
  finalAssetId: REVIEW_ASSET_ID,
  assembly: { assetIds: [], audioId: null, overlayText: '', notes: '' },
  variants: [],
  revisionCharge: 0,
  brief: {
    objective: 'ADS',
    outputKind: 'VIDEO',
    audience: '',
    painPoint: '',
    angle: '',
    concept: '',
    productFacts: '',
    mandatoryClaims: '',
    visualDirection: '',
    format: '9:16',
    duration: 30,
    hook: '',
    cta: '',
    music: '',
    brandAssets: [],
  },
};
const task: DeliveryTask = {
  id: REVIEW_TASK_ID,
  title: 'Launch video',
  projectId: 'project',
  assigneeId: 'editor',
  dueAt: null,
  revision: 4,
  details: {
    creative,
    brief: '',
    service: 'Creative',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'reviewer',
    state: 'IN_REVIEW',
    blocker: '',
    checklist: [],
    evidence: [],
    submissions: [],
    events: [],
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'reviewer', isManager: true, isAdmin: true },
  tasks: [task],
  projects: [],
  companies: [],
  members: [],
};
const mockFetch = jest.fn();
const mockCreateUrl = jest.fn();
const setup = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <DeliveryCreative
                task={task}
                workspace={workspace}
                onChanged={jest.fn()}
                onOpenTask={jest.fn()}
              />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    {
      initialEntries: [
        `/delivery?view=creative&task=${REVIEW_TASK_ID}&project=keep-filter`,
      ],
    },
  );
  const view = render(<RouterProvider router={router} />);
  return { ...view, router };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.clearAllMocks();
  Object.assign(globalThis, { Request, fetch: mockFetch });
  Object.assign(URL, { createObjectURL: mockCreateUrl });
});
it('routes Preview to exact review without loading a third legacy inline player', async () => {
  const { router } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Media review' }));
  const preview = screen.getByRole('link', { name: 'Preview' });
  expect(preview).toHaveAttribute(
    'href',
    expect.stringContaining(`creativeAsset=${REVIEW_ASSET_ID}`),
  );
  await userEvent.click(preview);
  expect(router.state.location.search).toContain('project=keep-filter');
  expect(
    screen.getByRole('region', { name: 'Exact asset review' }),
  ).toBeInTheDocument();
  expect(document.querySelectorAll('video')).toHaveLength(2);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Close preview' }),
  ).not.toBeInTheDocument();
});
it('aborts an original download on removal and does not publish a late response', async () => {
  let finish: (value: {
    ok: boolean;
    blob: () => Promise<Blob>;
  }) => void = () => undefined;
  mockFetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Media review' }));
  await userEvent.click(screen.getByRole('button', { name: 'Download' }));
  view.unmount();
  expect(mockFetch.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () =>
    finish({ ok: true, blob: async () => new Blob(['test']) }),
  );
  expect(mockCreateUrl).not.toHaveBeenCalled();
});
