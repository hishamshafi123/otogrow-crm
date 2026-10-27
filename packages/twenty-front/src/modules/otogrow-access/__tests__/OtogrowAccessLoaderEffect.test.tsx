import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { OtogrowAccessLoaderEffect } from '@/otogrow-access/OtogrowAccessLoaderEffect';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import { otogrowAccessState } from '@/otogrow-access/otogrowAccessState';
import { type OtogrowAccessQuery } from '~/generated-metadata/graphql';

const mockRefetch = jest.fn();
let mockQuery: {
  data: OtogrowAccessQuery;
  loading: boolean;
  error?: Error;
  refetch: typeof mockRefetch;
};
const mockUseQuery = jest.fn<unknown, unknown[]>(() => mockQuery);
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));
jest.mock('@/otogrow-access/useOtogrowIdentity', () => ({
  useOtogrowIdentity: () => ({
    identity: 'workspace:member:user',
    workspaceId: 'workspace',
    memberId: 'member',
  }),
}));
const PhoneConsumer = () => {
  const access = useOtogrowAccess();
  return (
    <button onClick={() => void access.refetch()}>
      {access.canUsePhone ? 'Phone available' : 'Phone unavailable'}
    </button>
  );
};
beforeEach(() => {
  mockRefetch.mockReset().mockResolvedValue(undefined);
  mockUseQuery.mockClear();
  mockQuery = {
    data: {
      otogrowAccess: {
        workspaceId: 'workspace',
        memberId: 'member',
        userWorkspaceId: 'membership',
        roleIds: [],
        capabilities: ['phone.use'],
        nativeAdministrator: false,
        grants: [],
      },
    },
    loading: false,
    refetch: mockRefetch,
  };
});
it('shares one polling query across many consumers, propagates revocation and clears access when the loader unmounts', async () => {
  const store = createStore();
  const content = () => (
    <Provider store={store}>
      <OtogrowAccessLoaderEffect />
      {Array.from({ length: 20 }, (_, index) => (
        <PhoneConsumer key={index} />
      ))}
    </Provider>
  );
  const view = render(content());
  expect(
    screen.getAllByRole('button', { name: 'Phone available' }),
  ).toHaveLength(20);
  expect(mockUseQuery).toHaveBeenCalledTimes(1);
  expect(mockUseQuery).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ pollInterval: 15000 }),
  );
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Phone available' })[0],
  );
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  mockQuery = {
    ...mockQuery,
    data: {
      otogrowAccess: { ...mockQuery.data.otogrowAccess, capabilities: [] },
    },
  };
  view.rerender(content());
  expect(
    screen.getAllByRole('button', { name: 'Phone unavailable' }),
  ).toHaveLength(20);
  mockQuery = {
    ...mockQuery,
    data: {
      otogrowAccess: {
        ...mockQuery.data.otogrowAccess,
        capabilities: ['phone.use'],
      },
    },
    error: new Error('Unavailable'),
  };
  view.rerender(content());
  expect(
    screen.getAllByRole('button', { name: 'Phone unavailable' }),
  ).toHaveLength(20);
  view.unmount();
  expect(store.get(otogrowAccessState.atom).identity).toBeNull();
  expect(store.get(otogrowAccessState.atom).access).toBeUndefined();
});
