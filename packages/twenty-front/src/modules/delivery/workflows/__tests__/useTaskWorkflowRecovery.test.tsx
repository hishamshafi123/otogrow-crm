import { type ReactNode } from 'react';
import { ApolloLink, Observable } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTaskWorkflow } from '@/delivery/workflows/useTaskWorkflow';
import { type TaskWorkflow } from '@/delivery/workflows/workflow.types';

let mockReady = true;
let mockCapabilities = ['delivery.manage'];
let mockDenied = false;
const mockCancelNavigation = jest.fn();
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    denied: mockDenied,
    manager: true,
    loading: !mockReady,
    scope: 'workspace:member:membership',
    access: mockReady
      ? { capabilities: mockCapabilities, roleIds: [], grants: [] }
      : undefined,
    matches: (
      data?: Pick<
        TaskWorkflow,
        'workspaceId' | 'memberId' | 'userWorkspaceId'
      > | null,
    ) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === 'member' &&
      data.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftGuard: () => ({
    requestAction: (action: () => void) => action(),
    cancelPendingNavigation: mockCancelNavigation,
  }),
  useDeliveryDraftStatus: () => undefined,
}));
const fixture = (): TaskWorkflow => ({
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  taskId: 'task',
  taskRevision: 4,
  canManage: true,
  canEdit: true,
  locked: false,
  workflow: {
    templateId: 'template',
    version: 1,
    revision: 1,
    definition: {
      name: 'Submitted service requirements',
      description: '',
      service: 'SEO',
      definitionOfDone: 'Review the exact submitted evidence.',
      checklist: [{ id: 'check', label: 'Inspect evidence', required: true }],
      evidence: [],
      reviewChecks: [
        { id: 'quality', label: 'Confirm quality', required: true },
      ],
    },
    checkedIds: [],
    evidence: [],
    appliedAt: '2026-10-29T08:00:00Z',
    appliedByName: 'Manager',
  },
  previousApplications: [],
  missingRequirements: [],
  nextHistoryCursor: null,
});
type PendingRead = {
  succeed: (snapshot: TaskWorkflow) => void;
  fail: (error: Error) => void;
};
const setup = () => {
  const reads: PendingRead[] = [];
  const writes: PendingRead[] = [];
  const unavailable = jest.fn();
  const operations: string[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable<ApolloLink.Result>((observer) => {
        operations.push(operation.operationName ?? '');
        const writing = operation.operationName !== 'DeliveryTaskWorkflow';
        (writing ? writes : reads).push({
          succeed: (snapshot) => {
            observer.next({
              data: {
                [writing
                  ? 'saveDeliveryWorkflowProgress'
                  : 'deliveryTaskWorkflow']: snapshot,
              },
            });
            observer.complete();
          },
          fail: (error) => observer.error(error),
        });
      }),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MockedProvider link={link}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </MockedProvider>
  );
  const view = renderHook(
    () =>
      useTaskWorkflow({
        taskId: 'task',
        taskRevision: 4,
        onUnavailable: unavailable,
      }),
    { wrapper },
  );
  return { ...view, reads, writes, operations, unavailable };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockReady = true;
  mockCapabilities = ['delivery.manage'];
  mockDenied = false;
  mockCancelNavigation.mockClear();
});
afterEach(() => jest.useRealTimers());
it('automatically recovers identical verified requirements after access skip/unskip and explicit failed-read retry without resetting a draft', async () => {
  const view = setup();
  await waitFor(() => expect(view.reads).toHaveLength(1));
  await act(async () => view.reads[0].succeed(fixture()));
  await waitFor(() => expect(view.result.current.data?.taskRevision).toBe(4));
  act(() =>
    view.result.current.draft.update({ checkedIds: ['check'], evidence: [] }),
  );
  mockReady = false;
  view.rerender();
  expect(view.result.current.data).toBeUndefined();
  expect(view.result.current.draft.values.checkedIds).toEqual(['check']);
  mockReady = true;
  view.rerender();
  await waitFor(() => expect(view.reads).toHaveLength(2));
  await act(async () => view.reads[1].succeed(fixture()));
  await waitFor(() => expect(view.result.current.data?.taskRevision).toBe(4));
  expect(view.result.current.loading).toBe(false);
  expect(view.result.current.draft.values.checkedIds).toEqual(['check']);
  act(() => {
    void view.result.current.retry();
  });
  await waitFor(() => expect(view.reads).toHaveLength(3));
  expect(view.result.current.data?.taskRevision).toBe(4);
  await act(async () => view.reads[2].fail(new Error('Offline')));
  await waitFor(() => expect(view.result.current.readError).toBeDefined());
  expect(view.result.current.data).toBeUndefined();
  expect(view.result.current.draft.values.checkedIds).toEqual(['check']);
  act(() => {
    void view.result.current.retry();
  });
  await waitFor(() => expect(view.reads).toHaveLength(4));
  expect(view.result.current.data).toBeUndefined();
  await act(async () => view.reads[3].succeed(fixture()));
  await waitFor(() => expect(view.result.current.data?.taskRevision).toBe(4));
  expect(view.result.current.loading).toBe(false);
  expect(view.result.current.draft.values.checkedIds).toEqual(['check']);
  expect(view.result.current.draft.dirty).toBe(true);
  expect(view.operations.every((name) => name === 'DeliveryTaskWorkflow')).toBe(
    true,
  );
});
it('keeps verified requirements available during a benign real Apollo poll', async () => {
  jest.useFakeTimers();
  const view = setup();
  await waitFor(() => expect(view.reads).toHaveLength(1));
  await act(async () => view.reads[0].succeed(fixture()));
  await waitFor(() => expect(view.result.current.data?.taskRevision).toBe(4));
  await act(async () => {
    jest.advanceTimersByTime(30000);
  });
  await waitFor(() => expect(view.reads).toHaveLength(2));
  expect(view.result.current.data?.taskRevision).toBe(4);
  expect(view.result.current.readyToSubmit).toBe(true);
  await act(async () => view.reads[1].succeed(fixture()));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  expect(view.result.current.readyToSubmit).toBe(true);
});
it('hides requirements across a known authority change and rejects a mismatched successful response', async () => {
  const view = setup();
  await waitFor(() => expect(view.reads).toHaveLength(1));
  await act(async () => view.reads[0].succeed(fixture()));
  await waitFor(() => expect(view.result.current.data?.taskRevision).toBe(4));
  mockCapabilities = ['delivery.review'];
  view.rerender();
  await waitFor(() => expect(view.reads).toHaveLength(2));
  expect(view.result.current.data).toBeUndefined();
  await act(async () =>
    view.reads[1].succeed({ ...fixture(), userWorkspaceId: 'foreign' }),
  );
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  expect(view.result.current.data).toBeUndefined();
  expect(view.result.current.readyToSubmit).toBe(false);
});

const denied = () =>
  new CombinedGraphQLErrors({
    errors: [
      { message: 'Task access denied', extensions: { code: 'FORBIDDEN' } },
    ],
  });
it('clears preparation and pending navigation on confirmed read loss, fences a late save, and requires an explicit checked reopen', async () => {
  const view = setup();
  await waitFor(() => expect(view.reads).toHaveLength(1));
  await act(async () => view.reads[0].succeed(fixture()));
  act(() =>
    view.result.current.draft.update({ checkedIds: ['check'], evidence: [] }),
  );
  let saving: Promise<boolean>;
  act(() => {
    saving = view.result.current.saveProgress();
  });
  await waitFor(() => expect(view.writes).toHaveLength(1));
  act(() => {
    void view.result.current.retry();
  });
  await waitFor(() => expect(view.reads).toHaveLength(2));
  await act(async () => view.reads[1].fail(denied()));
  await waitFor(() => expect(view.result.current.unavailable).toBe(true));
  expect(view.result.current.snapshot).toBeUndefined();
  expect(view.result.current.draft.values.checkedIds).toEqual([]);
  expect(mockCancelNavigation).toHaveBeenCalled();
  expect(view.unavailable).toHaveBeenCalled();
  await act(async () =>
    view.writes[0].succeed({ ...fixture(), taskRevision: 5 }),
  );
  expect(await saving!).toBe(false);
  expect(view.result.current.notice).toBe('');
  expect(view.result.current.snapshot).toBeUndefined();
  act(() => {
    void view.result.current.retry();
  });
  await waitFor(() => expect(view.reads).toHaveLength(3));
  await act(async () => view.reads[2].succeed(fixture()));
  await waitFor(() => expect(view.result.current.unavailable).toBe(false));
  expect(view.result.current.draft.values.checkedIds).toEqual([]);
});
it('retains a draft after a write denial when a fresh exact read confirms access', async () => {
  const view = setup();
  await waitFor(() => expect(view.reads).toHaveLength(1));
  await act(async () => view.reads[0].succeed(fixture()));
  act(() =>
    view.result.current.draft.update({ checkedIds: ['check'], evidence: [] }),
  );
  let saving: Promise<boolean>;
  act(() => {
    saving = view.result.current.saveProgress();
  });
  await waitFor(() => expect(view.writes).toHaveLength(1));
  await act(async () => view.writes[0].fail(denied()));
  await waitFor(() => expect(view.reads).toHaveLength(2));
  await act(async () =>
    view.reads[1].succeed({ ...fixture(), canEdit: false }),
  );
  expect(await saving!).toBe(false);
  expect(view.result.current.unavailable).toBe(false);
  expect(view.result.current.data?.canEdit).toBe(false);
  expect(view.result.current.draft.values.checkedIds).toEqual(['check']);
  expect(view.unavailable).not.toHaveBeenCalled();
});
it('disposes preparation when the access check itself denies the task before detail can refresh', async () => {
  const view = setup();
  await waitFor(() => expect(view.reads).toHaveLength(1));
  await act(async () => view.reads[0].succeed(fixture()));
  act(() =>
    view.result.current.draft.update({ checkedIds: ['check'], evidence: [] }),
  );
  mockReady = false;
  mockDenied = true;
  view.rerender();
  expect(view.result.current.unavailable).toBe(true);
  expect(view.result.current.draft.values.checkedIds).toEqual([]);
  expect(view.unavailable).toHaveBeenCalled();
});
