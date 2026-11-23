import { act, fireEvent, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { useGoToHotkeys } from '@/ui/utilities/hotkey/hooks/useGoToHotkeys';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter
    initialEntries={['/one', '/two', { pathname: '/three' }]}
    initialIndex={1}
  >
    {children}
  </MemoryRouter>
);
const renderHookConfig = {
  wrapper: Wrapper,
};

describe('useGoToHotkeys', () => {
  it('does not navigate on legacy unmodified letter sequences', () => {
    const { result } = renderHook(() => {
      useGoToHotkeys({ key: 'a', location: '/three' });

      const location = useLocation();

      return {
        pathname: location.pathname,
      };
    }, renderHookConfig);

    expect(result.current.pathname).toBe('/two');

    act(() => {
      fireEvent.keyDown(document, { key: 'g', code: 'KeyG' });
    });

    act(() => {
      fireEvent.keyDown(document, { key: 'a', code: 'KeyA' });
    });

    expect(result.current.pathname).toBe('/two');
  });
});
