import { type ReactNode } from 'react';
import { ApolloLink, Observable } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTaskWorkflow } from '@/delivery/workflows/useTaskWorkflow';
import { type TaskWorkflow } from '@/delivery/workflows/workflow.types';

let mockReady = true;
let mockCapabilities = ['delivery.manage'];
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
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
  const operations: string[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable<ApolloLink.Result>((observer) => {
        if (operation.operationName !== 'DeliveryTaskWorkflow') {
          observer.error(
            new Error(
              `Unexpected workflow write or legacy read: ${operation.operationName}`,
            ),
          );
          return;
        }
        operations.push(operation.operationName);
        reads.push({
          succeed: (snapshot) => {
            observer.next({ data: { deliveryTaskWorkflow: snapshot } });
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
    () => useTaskWorkflow({ taskId: 'task', taskRevision: 4 }),
    { wrapper },
  );
  return { ...view, reads, operations };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockReady = true;
  mockCapabilities = ['delivery.manage'];
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
  act(() => view.result.current.retry());
  await waitFor(() => expect(view.reads).toHaveLength(3));
  expect(view.result.current.data?.taskRevision).toBe(4);
  await act(async () => view.reads[2].fail(new Error('Offline')));
  await waitFor(() => expect(view.result.current.readError).toBeDefined());
  expect(view.result.current.data).toBeUndefined();
  expect(view.result.current.draft.values.checkedIds).toEqual(['check']);
  act(() => view.result.current.retry());
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
