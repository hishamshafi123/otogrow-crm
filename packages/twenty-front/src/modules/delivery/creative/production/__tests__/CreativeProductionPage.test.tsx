import { type ReactNode } from 'react';
import type * as ReactTypes from 'react';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { getOperationAST, type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import type * as DeliveryDraftGuardTypes from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryCreativeProductionPage } from '@/delivery/creative/production/DeliveryCreativeProductionPage';
import {
  type CreativeProductionActor,
  type CreativeProductionTask,
} from '@/delivery/creative/production/creative-production.types';

const TASK = '10000000-0000-4000-8000-000000000001';
const OTHER_TASK = '10000000-0000-4000-8000-000000000002';
const PROJECT = '10000000-0000-4000-8000-000000000003';
const IDENTITY = {
  workspaceId: 'workspace',
  memberId: 'editor',
  userWorkspaceId: 'membership',
};
let mockRevision = 1;
let mockDetailRevision = 1;
let mockCanEdit = true;
let mockReady = true;
let mockContextError: Error | undefined;
let mockStateError: Error | undefined;
let mockDetailError: Error | undefined;
let mockVersion = 0;
const mockSubscribers = new Set<() => void>();
const mockCalls = jest.fn();
const mockLegacyProps = jest.fn();
const actor = {
  memberId: IDENTITY.memberId,
  isAdmin: false,
  isManager: false,
  roleIds: [],
  capabilities: [],
};
const identity = () => ({
  ...IDENTITY,
  actor,
  scope: 'current-scope',
  observedAt: '2026-11-03T00:00:00.000Z',
});
const task = (id = TASK) => ({
  id,
  title: id === TASK ? 'Launch product film' : 'Off-page film',
  projectId: PROJECT,
  projectName: 'Brand project',
  projectRevision: 1,
  revision: mockRevision,
  assigneeId: mockCanEdit ? IDENTITY.memberId : 'new-editor',
  assigneeName: 'Editor',
  assignmentKey: `${mockCanEdit ? IDENTITY.memberId : 'new-editor'}:legacy`,
  dueAt: null,
  state: 'IN_PROGRESS',
  service: 'VIDEO',
  hasProduction: true,
  canEdit: mockCanEdit,
});
const document = () => ({
  version: 1,
  productionVersion: 1,
  assemblyVersion: 1,
  briefVersion: 1,
  approvedBriefVersion: null,
  revisionCharge: 0,
  finalAssetId: null,
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
    duration: 15,
    hook: '',
    cta: '',
    music: '',
    brandAssets: [],
  },
  briefHistory: [],
  references: [],
  shots: [],
  assets: [],
  assembly: { assetIds: [], overlayText: '', audioId: null, notes: '' },
  variants: [],
  mediaSettings: null,
  mediaRuns: [],
});
const emit = () => {
  mockVersion += 1;
  mockSubscribers.forEach((listener) => listener());
};

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryGrid: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));
jest.mock('@/delivery/creative/production/creative-production-styles', () => ({
  StyledCreativeBoundary: 'fieldset',
  StyledCreativeText: 'div',
}));
jest.mock('@/delivery/tasks/DeliveryTaskAssignmentRead', () => ({
  DeliveryTaskAssignmentRead: ({ enabled }: { enabled: boolean }) =>
    enabled ? <p>Your visible assignment</p> : null,
}));
jest.mock('@/delivery/operations-pages/DeliveryOperationalPage', () => ({
  DeliveryOperationalPage: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => {
    const { useSyncExternalStore } =
      jest.requireActual<typeof ReactTypes>('react');
    useSyncExternalStore(
      (listener) => {
        mockSubscribers.add(listener);
        return () => {
          mockSubscribers.delete(listener);
        };
      },
      () => mockVersion,
    );
    return {
      ready: mockReady,
      scope: 'current-member',
      manager: false,
      canManageRoles: false,
      denied: false,
      access: { ...IDENTITY, roleIds: [], capabilities: [], grants: [] },
      matches: (value: typeof IDENTITY | null | undefined) =>
        mockReady &&
        value?.workspaceId === IDENTITY.workspaceId &&
        value.memberId === IDENTITY.memberId &&
        value.userWorkspaceId === IDENTITY.userWorkspaceId,
    };
  },
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    query: DocumentNode,
    options: {
      variables?: { input?: Record<string, unknown> };
      skip?: boolean;
    },
  ) => {
    const { useSyncExternalStore } =
      jest.requireActual<typeof ReactTypes>('react');
    useSyncExternalStore(
      (listener) => {
        mockSubscribers.add(listener);
        return () => {
          mockSubscribers.delete(listener);
        };
      },
      () => mockVersion,
    );
    const name = getOperationAST(query)?.name?.value;
    mockCalls(name, options);
    const input = options.variables?.input ?? {};
    const selectedId = typeof input.taskId === 'string' ? input.taskId : TASK;
    const response = () => {
      switch (name) {
        case 'DeliveryCreativeContext':
          return { deliveryCreativeContext: identity() };
        case 'DeliveryCreativeTasks':
          return {
            deliveryCreativeTasks: {
              ...identity(),
              items: [task(input.after ? OTHER_TASK : TASK)],
              selectedProject: null,
              totalCount: 51,
              nextCursor: input.after ? null : 'next-page',
            },
          };
        case 'DeliveryCreativeProjects':
          return {
            deliveryCreativeProjects: {
              ...identity(),
              items: [{ id: PROJECT, name: 'Brand project', revision: 1 }],
              totalCount: 1,
              nextCursor: null,
            },
          };
        case 'DeliveryCreativeState':
          return {
            deliveryCreativeState: { ...identity(), task: task(selectedId) },
          };
        case 'DeliveryCreativeDetail':
          return {
            deliveryCreativeDetail: {
              ...identity(),
              task: { ...task(selectedId), revision: mockDetailRevision },
              document: document(),
            },
          };
        case 'DeliveryCreativeReferences':
          return {
            deliveryCreativeReferences: {
              ...identity(),
              taskId: selectedId,
              projectId: PROJECT,
              projectRevision: 1,
              totalCount: 1,
              nextCursor: null,
              items: [
                {
                  id: OTHER_TASK,
                  version: 2,
                  title: 'Approved product reference',
                  url: 'https://example.com/reference',
                  summaryPreview: 'A concise product scene',
                  summaryTruncated: false,
                  sourceTaskId: OTHER_TASK,
                  sourceTaskTitle: 'Earlier campaign',
                  sourceTaskRevision: 4,
                  approvedAt: '2026-11-02T00:00:00Z',
                },
              ],
            },
          };
        default:
          throw new Error(`Unexpected broad or unrelated read: ${name}`);
      }
    };
    const error =
      name === 'DeliveryCreativeContext'
        ? mockContextError
        : name === 'DeliveryCreativeState'
          ? mockStateError
          : name === 'DeliveryCreativeDetail'
            ? mockDetailError
            : undefined;
    return {
      data: options.skip ? undefined : response(),
      loading: false,
      error,
      networkStatus: NetworkStatus.ready,
      refetch: async () => {
        if (error) throw error;
        if (name === 'DeliveryCreativeDetail')
          mockDetailRevision = mockRevision;
        emit();
        return { data: response() };
      },
    };
  },
}));
jest.mock('@/delivery/DeliveryCreative', () => ({
  DeliveryCreative: (props: {
    task: CreativeProductionTask;
    actor: CreativeProductionActor;
    stage: string;
    onStageChange: (stage: string) => void;
    onChanged: () => Promise<unknown>;
    onAuthorityLost: () => void;
    onOpenTask: () => void;
    renderApprovedReferences: (
      reuse: () => Promise<boolean>,
      disabled: boolean,
    ) => ReactNode;
  }) => {
    const { useState } = jest.requireActual<typeof ReactTypes>('react');
    const { useDeliveryDraftStatus, useDeliveryDraftGuard } =
      jest.requireActual<typeof DeliveryDraftGuardTypes>(
        '@/delivery/drafts/DeliveryDraftGuard',
      );
    const [notes, setNotes] = useState('');
    const { requestAction } = useDeliveryDraftGuard();
    useDeliveryDraftStatus({ dirty: notes !== '', saving: false });
    mockLegacyProps(props);
    return (
      <section>
        <p>Current stage: {props.stage}</p>
        <label>
          Production notes
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <button
          onClick={() => requestAction(() => props.onStageChange('references'))}
        >
          References stage
        </button>
        <button
          onClick={() => requestAction(() => props.onStageChange('shots'))}
        >
          Shots stage
        </button>
        <button onClick={() => props.onOpenTask()}>
          Open final task approval
        </button>
        <button onClick={() => props.onAuthorityLost()}>
          Simulate denied save
        </button>
        {props.stage === 'references' &&
          props.renderApprovedReferences(async () => true, false)}
      </section>
    );
  },
}));

const renderPage = (url = '/delivery?view=creative') => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <DeliveryCreativeProductionPage />
          </DeliveryDraftGuardProvider>
        ),
      },
    ],
    { initialEntries: [url] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return router;
};
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  global.Request = Request as unknown as typeof global.Request;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockRevision = 1;
  mockDetailRevision = 1;
  mockCanEdit = true;
  mockReady = true;
  mockContextError = undefined;
  mockStateError = undefined;
  mockDetailError = undefined;
  mockCalls.mockClear();
  mockLegacyProps.mockClear();
});

describe('Canonical creative production journey', () => {
  it.each([
    ['panel=task&creativeSubmission=1', 'final'],
    ['creativeCompare=1&creativeSubmission=2', 'final'],
    ['panel=creative&creativeAsset=image', 'assets'],
    ['creativeQaRun=run', 'final'],
    ['creativeStage=references&panel=task', 'references'],
  ])(
    'preserves the intended stage in an earlier link: %s',
    async (query, stage) => {
      renderPage(`/delivery?view=creative&task=${TASK}&${query}`);
      expect(await screen.findByText(`Current stage: ${stage}`)).toBeVisible();
      expect(mockCalls).not.toHaveBeenCalledWith('DeliveryWorkspace');
    },
  );
  it('passes current read-only authority to the production editor', async () => {
    mockCanEdit = false;
    renderPage(`/delivery?view=creative&task=${TASK}`);
    await screen.findByText('Current stage: brief');
    expect(mockLegacyProps.mock.calls.at(-1)?.[0]).toMatchObject({
      canEdit: false,
    });
  });
  it('shows complete counts, paginates, and opens an off-page task without broad workspace hydration', async () => {
    const user = userEvent.setup();
    const router = renderPage();
    expect(
      await screen.findByText('1 shown of 51 matching tasks'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Next tasks' }));
    expect(router.state.location.search).toContain('creativeAfter=next-page');
    await user.click(screen.getByRole('button', { name: 'Open production' }));
    expect(
      await screen.findByRole('heading', { name: 'Off-page film' }),
    ).toBeVisible();
    expect(mockLegacyProps.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'workspace',
    );
    expect(screen.getByText('Your visible assignment')).toBeVisible();
    expect(
      mockCalls.mock.calls.every(([name]) => name !== 'DeliveryWorkspace'),
    ).toBe(true);
    await user.click(
      screen.getByRole('button', { name: 'Back to production queue' }),
    );
    expect(router.state.location.search).toContain('creativeAfter=next-page');
  });
  it('stores filters and stage in the URL, with real Back restoring the earlier stage', async () => {
    const user = userEvent.setup();
    const router = renderPage();
    await user.type(screen.getByLabelText('Search tasks'), 'product');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(router.state.location.search).toContain('creativeSearch=product');
    await user.click(screen.getByRole('button', { name: 'Open production' }));
    await user.click(
      await screen.findByRole('button', { name: 'References stage' }),
    );
    expect(
      await screen.findByText('Approved product reference · v2'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Shots stage' }));
    expect(router.state.location.search).toContain('creativeStage=shots');
    // oxlint-disable-next-line twenty/no-navigate-prefer-link -- This exercises a browser POP, not an application navigation control.
    await act(async () => {
      await router.navigate(-1);
    });
    expect(await screen.findByText('Current stage: references')).toBeVisible();
    expect(router.state.location.search).toContain('creativeSearch=product');
  });
  it('keeps an owned dirty body through an ordinary outage, hidden until current reads recover', async () => {
    const user = userEvent.setup();
    renderPage(`/delivery?view=creative&task=${TASK}`);
    await user.type(
      await screen.findByLabelText('Production notes'),
      'Keep the warm lighting',
    );
    act(() => {
      mockStateError = new Error('Network unavailable');
      emit();
    });
    expect(screen.getByLabelText('Production notes')).not.toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('unsaved work is kept');
    act(() => {
      mockStateError = undefined;
      emit();
    });
    expect(await screen.findByLabelText('Production notes')).toBeVisible();
    expect(screen.getByLabelText('Production notes')).toHaveValue(
      'Keep the warm lighting',
    );
  });
  it('cancels pending navigation and clears private edits on confirmed reassignment', async () => {
    const user = userEvent.setup();
    const router = renderPage(`/delivery?view=creative&task=${TASK}`);
    await user.type(
      await screen.findByLabelText('Production notes'),
      'Private editor note',
    );
    await user.click(
      screen.getByRole('button', { name: 'Back to production queue' }),
    );
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeVisible();
    act(() => {
      mockCanEdit = false;
      mockRevision = 2;
      emit();
    });
    expect(
      screen.queryByRole('button', { name: 'Keep editing' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Production notes')).not.toBeInTheDocument();
    expect(router.state.location.search).toContain(TASK);
    act(() => {
      mockCanEdit = true;
      emit();
    });
    await user.click(
      screen.getByRole('button', { name: 'Refresh production' }),
    );
    expect(await screen.findByLabelText('Production notes')).toHaveValue('');
  });
  it('requires explicit fresh verification after an exact source denial', async () => {
    const user = userEvent.setup();
    renderPage(`/delivery?view=creative&task=${TASK}`);
    await user.type(
      await screen.findByLabelText('Production notes'),
      'Old private text',
    );
    act(() => {
      mockStateError = new CombinedGraphQLErrors({
        errors: [{ message: 'Unavailable', extensions: { code: 'NOT_FOUND' } }],
      });
      emit();
    });
    expect(screen.queryByLabelText('Production notes')).not.toBeInTheDocument();
    act(() => {
      mockStateError = undefined;
      emit();
    });
    expect(screen.queryByLabelText('Production notes')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Refresh production' }),
    );
    expect(await screen.findByLabelText('Production notes')).toHaveValue('');
  });
  it.each([false, true])(
    'requires an explicit context recheck after native denial and recovers lost focus without stealing an external focus (%s)',
    async (keepExternalFocus) => {
      const user = userEvent.setup();
      renderPage(`/delivery?view=creative&task=${TASK}`);
      await user.type(
        await screen.findByLabelText('Production notes'),
        'PRIVATE_CONTEXT_NOTE',
      );
      const learning = screen.getByRole('link', {
        name: 'Inspect creative and ad learning',
      });
      if (keepExternalFocus) {
        await user.tab({ shift: true });
        await user.tab({ shift: true });
        await user.tab({ shift: true });
        expect(learning).toHaveFocus();
      }
      act(() => {
        mockContextError = new CombinedGraphQLErrors({
          errors: [
            {
              message: 'Native task object denied',
              extensions: { code: 'FORBIDDEN' },
            },
          ],
        });
        emit();
      });
      expect(
        screen.queryByLabelText('Production notes'),
      ).not.toBeInTheDocument();
      const check = screen.getByRole('button', {
        name: 'Check creative access',
      });
      expect(keepExternalFocus ? learning : check).toHaveFocus();
      act(() => {
        mockContextError = undefined;
        emit();
      });
      expect(
        screen.queryByLabelText('Production notes'),
      ).not.toBeInTheDocument();
      expect(keepExternalFocus ? learning : check).toHaveFocus();
      await user.click(check);
      expect(await screen.findByLabelText('Production notes')).toHaveValue('');
    },
  );
  it('does not poll the production document and marks changed revisions for explicit refresh', async () => {
    renderPage(`/delivery?view=creative&task=${TASK}`);
    expect(await screen.findByLabelText('Production notes')).toBeVisible();
    act(() => {
      mockRevision = 2;
      emit();
    });
    expect(screen.getByLabelText('Production notes')).not.toBeVisible();
    expect(screen.getByText(/This task has changed/)).toBeVisible();
    expect(
      mockCalls.mock.calls
        .filter(([name]) => name === 'DeliveryCreativeDetail')
        .every(([, options]) => !('pollInterval' in options)),
    ).toBe(true);
  });
});
