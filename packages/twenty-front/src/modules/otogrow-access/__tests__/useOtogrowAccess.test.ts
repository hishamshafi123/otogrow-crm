import { act, renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { createElement, type ReactNode } from 'react';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import { otogrowAccessState } from '@/otogrow-access/otogrowAccessState';

let mockIdentity = {
  identity: 'workspace:member:user' as string | null,
  workspaceId: 'workspace',
  memberId: 'member',
};
jest.mock('@/otogrow-access/useOtogrowIdentity', () => ({
  useOtogrowIdentity: () => mockIdentity,
}));
const createAccessStore = () => {
  const store = createStore();
  store.set(otogrowAccessState.atom, {
    identity: 'workspace:member:user',
    loading: false,
    refetch: async () => undefined,
    access: {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      roleIds: [],
      capabilities: ['phone.use'],
      nativeAdministrator: false,
      grants: [],
    },
  });
  return store;
};
beforeEach(() => {
  mockIdentity = {
    identity: 'workspace:member:user',
    workspaceId: 'workspace',
    memberId: 'member',
  };
});
it('fails closed on loading, failed requests, logout and another workspace or identity', () => {
  const store = createAccessStore();
  const { result, rerender } = renderHook(() => useOtogrowAccess(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store }, children),
  });
  expect(result.current.canUsePhone).toBe(true);
  act(() =>
    store.set(otogrowAccessState.atom, (value) => ({
      ...value,
      loading: true,
    })),
  );
  expect(result.current.canUsePhone).toBe(false);
  act(() =>
    store.set(otogrowAccessState.atom, (value) => ({
      ...value,
      loading: false,
      error: new Error('Unavailable'),
    })),
  );
  expect(result.current.canUsePhone).toBe(false);
  act(() =>
    store.set(otogrowAccessState.atom, (value) => ({
      ...value,
      error: undefined,
    })),
  );
  mockIdentity.identity = null;
  rerender();
  expect(result.current.scopeKey).toBeNull();
  mockIdentity.identity = 'workspace:member:user';
  mockIdentity.workspaceId = 'other';
  rerender();
  expect(result.current.canUsePhone).toBe(false);
  mockIdentity.workspaceId = 'workspace';
  mockIdentity.memberId = 'other-person';
  rerender();
  expect(result.current.canUsePhone).toBe(false);
  mockIdentity.memberId = 'member';
  mockIdentity.identity = 'workspace:member:other-user';
  rerender();
  expect(result.current.canUsePhone).toBe(false);
});
it('uses capability grants rather than assuming all administrators can call', () => {
  const store = createAccessStore();
  store.set(otogrowAccessState.atom, (value) => ({
    ...value,
    access: { ...value.access!, capabilities: ['workspace.admin'] },
  }));
  const { result } = renderHook(() => useOtogrowAccess(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store }, children),
  });
  expect(result.current.canManageRoles).toBe(true);
  expect(result.current.canUsePhone).toBe(false);
});
