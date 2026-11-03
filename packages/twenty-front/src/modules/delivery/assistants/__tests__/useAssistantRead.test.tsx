import { renderHook } from '@testing-library/react';
import { NetworkStatus } from '@apollo/client';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';

type Reading = { memberId: string; privateText: string };
const sourceValue: Reading = {
  memberId: 'current',
  privateText: 'Saved private finding',
};
const initial = {
  value: sourceValue,
  source: 'identity:filter',
  enabled: true,
  loading: false,
  error: undefined as Error | undefined,
  networkStatus: NetworkStatus.ready,
  matches: (value: Reading) => value.memberId === 'current',
};
it('retains verified reading during a same-query poll and clears it throughout failed-source retry', () => {
  const { result, rerender } = renderHook((props) => useAssistantRead(props), {
    initialProps: initial,
  });
  expect(result.current.data?.privateText).toBe('Saved private finding');
  rerender({
    ...initial,
    value: { ...sourceValue },
    loading: true,
    networkStatus: NetworkStatus.poll,
  });
  expect(result.current.data?.privateText).toBe('Saved private finding');
  rerender({ ...initial, error: new Error('Disconnected') });
  expect(result.current.data).toBeNull();
  rerender({ ...initial, loading: true, networkStatus: NetworkStatus.refetch });
  expect(result.current.data).toBeNull();
  rerender(initial);
  expect(result.current.data?.privateText).toBe('Saved private finding');
});
it('never retains an earlier identity, filter, authority or mismatched source as current', () => {
  const { result, rerender } = renderHook((props) => useAssistantRead(props), {
    initialProps: initial,
  });
  rerender({
    ...initial,
    source: 'identity:other-filter',
    loading: true,
    networkStatus: NetworkStatus.setVariables,
  });
  expect(result.current.data).toBeNull();
  rerender(initial);
  rerender({ ...initial, enabled: false });
  expect(result.current.data).toBeNull();
  rerender({ ...initial, loading: true, networkStatus: NetworkStatus.refetch });
  expect(result.current.data).toBeNull();
  rerender({ ...initial, value: { ...sourceValue, memberId: 'foreign' } });
  expect(result.current.data).toBeNull();
});
it('handles equivalent newly allocated payloads without render loops', () => {
  const { result, rerender } = renderHook((props) => useAssistantRead(props), {
    initialProps: initial,
  });
  for (let count = 0; count < 4; count += 1)
    rerender({ ...initial, value: { ...sourceValue } });
  expect(result.current.data).toEqual(sourceValue);
});
