import { type ReactNode } from 'react';
import { ApolloLink, Observable } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useOrphanCleanup } from '@/delivery/commitments/useOrphanCleanup';
import {
  readOrphanCleanupRecovery,
  saveOrphanCleanupRecovery,
} from '@/delivery/commitments/orphanCleanupStorage';
import { type DeliveryCommitmentOrphanCleanupFieldsFragment } from '~/generated-metadata/graphql';

jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftStatus: () => undefined,
}));
const owner = {
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
};
const input = {
  requestId: '10000000-0000-4000-8000-000000000001',
  engagementId: '10000000-0000-4000-8000-000000000002',
  periodId: '10000000-0000-4000-8000-000000000003',
  periodRevision: 2,
  allocationId: '10000000-0000-4000-8000-000000000004',
  allocationRevision: 3,
  confirm: true,
};
const storageKey = 'orphan-cleanup-test';
const receipt = (
  state: 'REMOVED' | 'CANCELLED' | 'NOT_FOUND' = 'REMOVED',
): DeliveryCommitmentOrphanCleanupFieldsFragment => ({
  ...owner,
  engagementId: input.engagementId,
  periodId: input.periodId,
  requestId: input.requestId,
  allocationId: input.allocationId,
  requestedAllocationRevision: input.allocationRevision,
  periodRevision: input.periodRevision,
  state,
  removedAllocationRevision: state === 'REMOVED' ? 4 : null,
  occurredAt: state === 'NOT_FOUND' ? null : '2026-11-05T08:00:00Z',
});
type PendingOperation = {
  name: string;
  input: unknown;
  signal: AbortSignal;
  succeed: (result: DeliveryCommitmentOrphanCleanupFieldsFragment) => void;
  fail: () => void;
};
const setup = (restore = false) => {
  if (restore) saveOrphanCleanupRecovery(storageKey, { owner, input });
  const operations: PendingOperation[] = [];
  const changed = jest.fn().mockResolvedValue(undefined);
  const link = new ApolloLink(
    (operation) =>
      new Observable<ApolloLink.Result>((observer) => {
        const name = operation.operationName ?? '';
        const field =
          name === 'RemoveDeliveryOrphanCommitmentAllocation'
            ? 'removeDeliveryOrphanCommitmentAllocation'
            : name === 'CancelDeliveryOrphanCommitmentCleanup'
              ? 'cancelDeliveryOrphanCommitmentCleanup'
              : 'deliveryOrphanCommitmentCleanupReceipt';
        operations.push({
          name,
          input: operation.variables.input,
          signal: operation.getContext().fetchOptions.signal as AbortSignal,
          succeed: (result) => {
            observer.next({ data: { [field]: result } });
            observer.complete();
          },
          fail: () => observer.error(new Error('Connection lost')),
        });
      }),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MockedProvider link={link}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </MockedProvider>
  );
  const view = renderHook(
    ({ available, denied, currentOwner }) =>
      useOrphanCleanup({
        storageKey,
        owner: currentOwner,
        engagementId: input.engagementId,
        available,
        denied,
        onChanged: changed,
      }),
    {
      wrapper,
      initialProps: { available: true, denied: false, currentOwner: owner },
    },
  );
  return { ...view, operations, changed };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  sessionStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('keeps an immutable recovery request across a lost response and reload, then checks the recorded result without resubmitting', async () => {
  const view = setup();
  act(() => {
    void view.result.current.submit(input);
  });
  await waitFor(() => expect(view.operations).toHaveLength(1));
  expect(readOrphanCleanupRecovery(storageKey)).toEqual({ owner, input });
  await act(async () => view.operations[0].fail());
  expect(view.result.current.error).toMatch(/not confirmed/);
  view.unmount();
  const restored = setup();
  expect(restored.result.current.recovery?.input).toEqual(input);
  expect(restored.operations).toHaveLength(0);
  act(() => {
    void restored.result.current.check();
  });
  await waitFor(() => expect(restored.operations).toHaveLength(1));
  expect(restored.operations[0].name).toBe(
    'DeliveryOrphanCommitmentCleanupReceipt',
  );
  expect(restored.operations[0].input).toEqual(input);
  await act(async () => restored.operations[0].succeed(receipt()));
  expect(restored.result.current.receipt?.state).toBe('REMOVED');
  expect(readOrphanCleanupRecovery(storageKey)).toBeNull();
  expect(restored.changed).toHaveBeenCalledTimes(1);
});

it('keeps NOT_FOUND uncertain and retries only the identical original request', async () => {
  const view = setup(true);
  act(() => {
    void view.result.current.check();
  });
  await waitFor(() => expect(view.operations).toHaveLength(1));
  await act(async () => view.operations[0].succeed(receipt('NOT_FOUND')));
  expect(view.result.current.checkedAbsent).toBe(true);
  expect(view.result.current.recovery?.input).toEqual(input);
  await act(async () => {
    await view.result.current.submit({
      ...input,
      requestId: '10000000-0000-4000-8000-000000000099',
    });
  });
  expect(view.operations).toHaveLength(1);
  act(() => {
    void view.result.current.submit(input);
  });
  await waitFor(() => expect(view.operations).toHaveLength(2));
  expect(view.operations[1].input).toEqual(input);
  await act(async () => view.operations[1].succeed(receipt()));
  expect(view.result.current.receipt?.state).toBe('REMOVED');
});

it.each(['CANCELLED', 'REMOVED'] as const)(
  'stops the exact request and reports %s when cancellation or the original removal won',
  async (state) => {
    const view = setup(true);
    act(() => {
      void view.result.current.stop();
    });
    await waitFor(() => expect(view.operations).toHaveLength(1));
    expect(view.operations[0].name).toBe(
      'CancelDeliveryOrphanCommitmentCleanup',
    );
    expect(view.operations[0].input).toEqual(input);
    await act(async () => view.operations[0].succeed(receipt(state)));
    expect(view.result.current.receipt?.state).toBe(state);
    expect(view.result.current.recovery).toBeNull();
    expect(readOrphanCleanupRecovery(storageKey)).toBeNull();
  },
);

it.each([
  { memberId: 'another-member' },
  { requestId: '10000000-0000-4000-8000-000000000099' },
  { requestedAllocationRevision: 8 },
  { periodRevision: 9 },
  { removedAllocationRevision: 6 },
])(
  'rejects a receipt that does not prove this original request: %j',
  async (patch) => {
    const view = setup(true);
    act(() => {
      void view.result.current.check();
    });
    await waitFor(() => expect(view.operations).toHaveLength(1));
    await act(async () =>
      view.operations[0].succeed({ ...receipt(), ...patch }),
    );
    expect(view.result.current.receipt).toBeNull();
    expect(view.result.current.recovery?.input).toEqual(input);
    expect(view.result.current.error).toMatch(/could not be checked/);
    expect(view.changed).not.toHaveBeenCalled();
  },
);

it('keeps a confirmed historical receipt when refreshing current totals fails', async () => {
  const view = setup(true);
  view.changed.mockRejectedValue(new Error('Totals offline'));
  act(() => {
    void view.result.current.check();
  });
  await waitFor(() => expect(view.operations).toHaveLength(1));
  await act(async () => view.operations[0].succeed(receipt()));
  expect(view.result.current.receipt?.state).toBe('REMOVED');
  expect(view.result.current.recovery).toBeNull();
  expect(view.result.current.error).toMatch(
    /result is recorded.*could not refresh/,
  );
  expect(view.result.current.error).not.toMatch(/original request is kept/);
});

it('purges recovery on confirmed contract denial and fences a late successful reply after regrant', async () => {
  const view = setup(true);
  act(() => {
    void view.result.current.check();
  });
  await waitFor(() => expect(view.operations).toHaveLength(1));
  view.rerender({ available: false, denied: true, currentOwner: owner });
  expect(view.result.current.recovery).toBeNull();
  expect(readOrphanCleanupRecovery(storageKey)).toBeNull();
  view.rerender({ available: true, denied: false, currentOwner: owner });
  await act(async () => view.operations[0].succeed(receipt()));
  expect(view.result.current.receipt).toBeNull();
  expect(view.changed).not.toHaveBeenCalled();
});

it('keeps the same request during a temporary access outage and refuses a different signed-in owner', async () => {
  const view = setup(true);
  view.rerender({ available: false, denied: false, currentOwner: owner });
  expect(view.result.current.recovery?.input).toEqual(input);
  await act(async () => {
    await view.result.current.check();
  });
  expect(view.operations).toHaveLength(0);
  view.rerender({
    available: true,
    denied: false,
    currentOwner: { ...owner, userWorkspaceId: 'other-membership' },
  });
  expect(view.result.current.recovery).toBeNull();
  expect(readOrphanCleanupRecovery(storageKey)).toBeNull();
});

it('does not dispatch a cleanup if this browser cannot retain its recovery request', async () => {
  const view = setup();
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage blocked');
  });
  await act(async () => {
    await view.result.current.submit(input);
  });
  expect(view.operations).toHaveLength(0);
  expect(view.result.current.error).toMatch(/browser could not keep/);
});

it('ends a stalled request after thirty seconds, aborts transport, keeps uncertainty and allows recorded cancellation', async () => {
  jest.useFakeTimers();
  const view = setup();
  act(() => {
    void view.result.current.submit(input);
  });
  await waitFor(() => expect(view.operations).toHaveLength(1));
  await act(async () => {
    jest.advanceTimersByTime(30000);
  });
  expect(view.operations[0].signal.aborted).toBe(true);
  expect(view.result.current.busy).toBe(false);
  expect(view.result.current.error).toMatch(/not confirmed/);
  expect(view.result.current.recovery?.input).toEqual(input);
  act(() => {
    void view.result.current.stop();
  });
  await waitFor(() => expect(view.operations).toHaveLength(2));
  await act(async () => view.operations[1].succeed(receipt('CANCELLED')));
  expect(view.result.current.receipt?.state).toBe('CANCELLED');
  await act(async () => view.operations[0].succeed(receipt()));
  expect(view.result.current.receipt?.state).toBe('CANCELLED');
});
