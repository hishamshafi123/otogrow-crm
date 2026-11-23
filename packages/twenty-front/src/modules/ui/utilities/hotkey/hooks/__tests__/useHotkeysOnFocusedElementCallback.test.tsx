import { renderHook } from '@testing-library/react';
import { useHotkeysOnFocusedElementCallback } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElementCallback';

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => ({ get: () => 'editor' }),
}));

it.each([...`abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ/@?`])(
  'does not intercept scoped typing of %s',
  (key) => {
    const { result } = renderHook(() => useHotkeysOnFocusedElementCallback());
    const callback = jest.fn();
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    result.current({
      keyboardEvent: event,
      hotkeysEvent: { keys: [key], hotkey: key },
      callback,
      focusId: 'editor',
      preventDefault: true,
    });
    expect(callback).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  },
);
it.each([
  { key: 'k', metaKey: true },
  { key: 'Enter' },
  { key: 'Escape' },
  { key: 'ArrowDown' },
])('retains explicit commands and editing keys: %p', (input) => {
  const { result } = renderHook(() => useHotkeysOnFocusedElementCallback());
  const callback = jest.fn();
  const event = new KeyboardEvent('keydown', { ...input, cancelable: true });
  result.current({
    keyboardEvent: event,
    hotkeysEvent: { keys: [input.key], hotkey: input.key },
    callback,
    focusId: 'editor',
    preventDefault: true,
  });
  expect(callback).toHaveBeenCalledTimes(1);
});
