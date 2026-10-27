import { renderHook } from '@testing-library/react';
import { type DeliveryFinanceRecognitionAvailabilityQuery } from '~/generated-metadata/graphql';
import { useFinanceRecognitionAvailability } from '@/delivery/finance/useFinanceRecognitionAvailability';

let mockData: DeliveryFinanceRecognitionAvailabilityQuery;
let mockError: Error | undefined;
let mockReady = true;
let mockCanRead = true;
let mockCanManage = true;
const mockRefetch = jest.fn();
const mockUseQuery = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canReadFinance: mockCanRead,
    canManageFinance: mockCanManage,
    scope: 'workspace:member:membership',
    matches: (
      value:
        | { workspaceId: string; memberId: string; userWorkspaceId: string }
        | null
        | undefined,
    ) =>
      mockReady &&
      value?.workspaceId === 'workspace' &&
      value.memberId === 'finance-member' &&
      value.userWorkspaceId === 'membership',
  }),
}));
const state = (month: string, status = 'OPEN') => ({
  workspaceId: 'workspace',
  memberId: 'finance-member',
  userWorkspaceId: 'membership',
  canManage: true,
  period: { month, status },
});
beforeEach(() => {
  mockData = {
    deliveryFinancePeriod: state('2026-10'),
    replacedPeriod: state('2026-09'),
  };
  mockError = undefined;
  mockReady = true;
  mockCanRead = true;
  mockCanManage = true;
  mockRefetch.mockReset().mockResolvedValue({});
  mockUseQuery
    .mockReset()
    .mockImplementation(() => ({
      data: mockData,
      loading: false,
      error: mockError,
      refetch: mockRefetch,
    }));
});
it('checks the chosen and prior correction months with an identity-scoped read-only operation', () => {
  const hook = renderHook(() =>
    useFinanceRecognitionAvailability('2026-10', '2026-09'),
  );
  expect(hook.result.current.available).toBe(true);
  expect(hook.result.current.canManage).toBe(true);
  expect(mockUseQuery).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      variables: {
        input: { month: '2026-10' },
        replacedInput: { month: '2026-09' },
        includeReplaced: true,
        identity: 'workspace:member:membership',
      },
      fetchPolicy: 'no-cache',
      skip: false,
    }),
  );
});
it('reports both locked months and avoids a duplicate prior-month read when periods match', () => {
  mockData = {
    deliveryFinancePeriod: state('2026-10', 'LOCKED'),
    replacedPeriod: state('2026-09', 'LOCKED'),
  };
  const hook = renderHook(() =>
    useFinanceRecognitionAvailability('2026-10', '2026-09'),
  );
  expect(hook.result.current.lockedMonths).toEqual(['2026-10', '2026-09']);
  renderHook(() => useFinanceRecognitionAvailability('2026-10', '2026-10'));
  expect(mockUseQuery).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      variables: expect.objectContaining({ includeReplaced: false }),
    }),
  );
});
it('fails closed after verified read revocation even when skipped Apollo data still matches the same identity', () => {
  mockData.deliveryFinancePeriod = state('2026-10', 'LOCKED');
  const hook = renderHook(() => useFinanceRecognitionAvailability('2026-10'));
  expect(hook.result.current.available).toBe(true);
  mockCanRead = false;
  hook.rerender();
  expect(hook.result.current.available).toBe(false);
  expect(hook.result.current.canManage).toBe(false);
  expect(hook.result.current.lockedMonths).toEqual([]);
  expect(mockUseQuery).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ skip: true }),
  );
});
it('keeps writes unavailable during source errors and unknown authority until a matching fresh result returns', () => {
  const hook = renderHook(() => useFinanceRecognitionAvailability('2026-10'));
  mockError = new Error('Offline');
  hook.rerender();
  expect(hook.result.current.available).toBe(false);
  expect(hook.result.current.canManage).toBe(false);
  expect(hook.result.current.refetch).toBe(mockRefetch);
  mockError = undefined;
  mockReady = false;
  hook.rerender();
  expect(hook.result.current.available).toBe(false);
  mockReady = true;
  hook.rerender();
  expect(hook.result.current.available).toBe(true);
});
it.each(['foreign-prior', 'unknown-status'])(
  'rejects %s instead of assuming that recognition is open',
  (failure) => {
    if (failure === 'foreign-prior')
      mockData.replacedPeriod = {
        ...state('2026-09'),
        workspaceId: 'other-workspace',
      };
    else mockData.deliveryFinancePeriod = state('2026-10', 'UNKNOWN');
    const hook = renderHook(() =>
      useFinanceRecognitionAvailability('2026-10', '2026-09'),
    );
    expect(hook.result.current.available).toBe(false);
    expect(hook.result.current.canManage).toBe(false);
  },
);
it('skips partial or invalid month inputs without enabling a financial write', () => {
  const hook = renderHook(() => useFinanceRecognitionAvailability('2026-1'));
  expect(hook.result.current.monthValid).toBe(false);
  expect(hook.result.current.available).toBe(false);
  expect(mockUseQuery).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ skip: true }),
  );
});
