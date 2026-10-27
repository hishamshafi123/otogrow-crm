import { renderHook } from '@testing-library/react';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { type OtogrowAccess } from '@/otogrow-access/otogrow-access.types';
import { CombinedGraphQLErrors } from '@apollo/client/errors';

let mockIdentity: string | null;
let mockUnavailable = false;
let mockLoading = false;
let mockFinanceAllowed = true;
let mockDenied: Error | undefined;
const mockAccessData: OtogrowAccess = {
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  capabilities: ['finance.read', 'finance.manage', 'delivery.manage'],
  grants: [],
  roleIds: [],
  nativeAdministrator: false,
};
jest.mock('@/otogrow-access/useOtogrowIdentity', () => ({
  useOtogrowIdentity: () => ({ identity: mockIdentity }),
}));
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => {
    const verified = !mockUnavailable && !mockLoading && !mockDenied;
    return {
      access: verified
        ? {
            ...mockAccessData,
            capabilities: mockFinanceAllowed ? mockAccessData.capabilities : [],
          }
        : undefined,
      scopeKey: verified ? `${mockIdentity}:membership` : null,
      canReadFinance: verified && mockFinanceAllowed,
      canManageFinance: verified && mockFinanceAllowed,
      loading: mockLoading,
      error:
        mockDenied ?? (mockUnavailable ? { message: 'Offline' } : undefined),
    };
  },
}));
beforeEach(() => {
  mockIdentity = 'workspace:member:user';
  mockUnavailable = false;
  mockLoading = false;
  mockFinanceAllowed = true;
  mockDenied = undefined;
});

it.each(['error', 'loading'])(
  'retains an ownership key through %s without treating a remembered grant as current authority',
  (failure) => {
    const hook = renderHook(useWorkflowAccess);
    const scope = hook.result.current.scope;
    expect(hook.result.current.matches(mockAccessData)).toBe(true);
    if (failure === 'error') mockUnavailable = true;
    else mockLoading = true;
    hook.rerender();
    expect(hook.result.current.scope).toBe(scope);
    expect(hook.result.current.lastVerifiedCanReadFinance).toBe(true);
    expect(hook.result.current.ready).toBe(false);
    expect(hook.result.current.canReadFinance).toBe(false);
    expect(hook.result.current.canManageFinance).toBe(false);
    expect(hook.result.current.manager).toBe(false);
    expect(hook.result.current.matches(mockAccessData)).toBe(false);
    mockUnavailable = false;
    mockLoading = false;
    mockFinanceAllowed = false;
    hook.rerender();
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.lastVerifiedCanReadFinance).toBe(false);
  },
);

it('clears remembered membership and read capability on identity change or logout', () => {
  const hook = renderHook(useWorkflowAccess);
  const scope = hook.result.current.scope;
  mockUnavailable = true;
  mockIdentity = 'workspace:another-member:another-user';
  hook.rerender();
  expect(hook.result.current.scope).not.toBe(scope);
  expect(hook.result.current.lastVerifiedCanReadFinance).toBe(false);
  mockIdentity = null;
  hook.rerender();
  expect(hook.result.current.scope).toBe('null:null');
  expect(hook.result.current.lastVerifiedCanReadFinance).toBe(false);
  mockIdentity = 'workspace:member:user';
  hook.rerender();
  expect(hook.result.current.scope).not.toBe(scope);
  expect(hook.result.current.lastVerifiedCanReadFinance).toBe(false);
});

it.each(['FORBIDDEN', 'UNAUTHENTICATED'])(
  'clears remembered ownership after an authoritative %s response and does not revive it on a later transport failure',
  (code) => {
    const hook = renderHook(useWorkflowAccess);
    const previousScope = hook.result.current.scope;
    mockDenied = new CombinedGraphQLErrors({
      data: null,
      errors: [{ message: 'Membership denied', extensions: { code } }],
    });
    hook.rerender();
    expect(hook.result.current.denied).toBe(true);
    expect(hook.result.current.lastVerifiedCanReadFinance).toBe(false);
    expect(hook.result.current.scope).not.toBe(previousScope);
    mockDenied = undefined;
    mockUnavailable = true;
    hook.rerender();
    expect(hook.result.current.lastVerifiedCanReadFinance).toBe(false);
    expect(hook.result.current.scope).not.toBe(previousScope);
    expect(hook.result.current.matches(mockAccessData)).toBe(false);
    mockUnavailable = false;
    hook.rerender();
    expect(hook.result.current.scope).toBe(previousScope);
    expect(hook.result.current.lastVerifiedCanReadFinance).toBe(true);
  },
);
