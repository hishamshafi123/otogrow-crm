import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, renderHook } from '@testing-library/react';
import { useServiceCatalog } from '@/delivery/onboarding/useServiceCatalog';
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
let mockManager = true;
let mockError: Error | undefined;
let mockScope = 'workspace';
let mockData:
  | {
      deliveryClientServiceCatalog: { workspaceId: string; services: string[] };
    }
  | undefined;
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: mockData,
    error: mockError,
    loading: false,
    refetch: mockRefetch,
  }),
  useMutation: () => [mockMutate],
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    manager: mockManager,
    refetch: jest.fn(),
    scope: mockScope,
    matches: (data?: { workspaceId: string }) =>
      data?.workspaceId === mockScope,
  }),
}));
beforeEach(() => {
  mockManager = true;
  mockScope = 'workspace';
  mockData = undefined;
  mockError = undefined;
  mockMutate.mockReset();
});
it('hides catalog data belonging to a different workspace or an unauthorized viewer', () => {
  mockData = {
    deliveryClientServiceCatalog: {
      workspaceId: 'other',
      services: ['Private service'],
    },
  };
  const view = renderHook(useServiceCatalog);
  expect(view.result.current.services).toEqual([]);
  mockData = {
    deliveryClientServiceCatalog: {
      workspaceId: 'workspace',
      services: ['Saved service'],
    },
  };
  mockManager = false;
  view.rerender();
  expect(view.result.current.services).toEqual([]);
  expect(view.result.current.canAdd).toBe(false);
});
it('publishes a confirmed saved catalog immediately', async () => {
  mockMutate.mockResolvedValue({
    data: {
      addDeliveryClientService: {
        workspaceId: 'workspace',
        services: ['Brand strategy'],
      },
    },
  });
  const view = renderHook(useServiceCatalog);
  await act(async () => {
    await view.result.current.add('Brand strategy');
  });
  expect(view.result.current.services).toEqual(['Brand strategy']);
});
it('does not publish a save that finishes after switching workspace', async () => {
  let resolve: (value: unknown) => void = () => {};
  mockMutate.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = renderHook(useServiceCatalog);
  const saving = view.result.current.add('Brand strategy');
  mockScope = 'other';
  view.rerender();
  await act(async () => {
    resolve({
      data: {
        addDeliveryClientService: {
          workspaceId: 'workspace',
          services: ['Brand strategy'],
        },
      },
    });
    expect(await saving).toBeNull();
  });
  expect(view.result.current.services).toEqual([]);
});
it('refuses to save without manager access', async () => {
  mockManager = false;
  const view = renderHook(useServiceCatalog);
  expect(await view.result.current.add('Service')).toBeNull();
  expect(mockMutate).not.toHaveBeenCalled();
});

it('hides a previously saved catalog when a fresh query denies access', async () => {
  mockMutate.mockResolvedValue({
    data: {
      addDeliveryClientService: {
        workspaceId: 'workspace',
        services: ['Brand strategy'],
      },
    },
  });
  const view = renderHook(useServiceCatalog);
  await act(async () => {
    await view.result.current.add('Brand strategy');
  });
  mockError = new CombinedGraphQLErrors({
    errors: [{ message: 'Denied', extensions: { code: 'FORBIDDEN' } }],
  });
  view.rerender();
  expect(view.result.current.services).toEqual([]);
  expect(view.result.current.canAdd).toBe(false);
  expect(view.result.current.unavailable).toBe(true);
});
it('keeps confirmed services during a transient query error but exposes retry', async () => {
  mockMutate.mockResolvedValue({
    data: {
      addDeliveryClientService: {
        workspaceId: 'workspace',
        services: ['Brand strategy'],
      },
    },
  });
  const view = renderHook(useServiceCatalog);
  await act(async () => {
    await view.result.current.add('Brand strategy');
  });
  mockError = new Error('Offline');
  view.rerender();
  expect(view.result.current.services).toEqual(['Brand strategy']);
  expect(view.result.current.unavailable).toBe(true);
});
