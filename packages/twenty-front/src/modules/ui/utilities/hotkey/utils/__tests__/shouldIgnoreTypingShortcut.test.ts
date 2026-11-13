import { shouldIgnoreTypingShortcut } from '@/ui/utilities/hotkey/utils/shouldIgnoreTypingShortcut';

describe('typing shortcut policy', () => {
  it.each([
    ...`abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/@?.,-_=+`,
  ])('leaves %s to normal typing', (key) => {
    expect(
      shouldIgnoreTypingShortcut(new KeyboardEvent('keydown', { key })),
    ).toBe(true);
    expect(
      shouldIgnoreTypingShortcut(
        new KeyboardEvent('keydown', { key, shiftKey: true }),
      ),
    ).toBe(true);
    expect(
      shouldIgnoreTypingShortcut(
        new KeyboardEvent('keydown', { key, altKey: true }),
      ),
    ).toBe(true);
  });
  it.each(['metaKey', 'ctrlKey'])('allows explicit %s commands', (modifier) => {
    expect(
      shouldIgnoreTypingShortcut(
        new KeyboardEvent('keydown', { key: 'k', [modifier]: true }),
      ),
    ).toBe(false);
  });
  it.each([
    'Enter',
    'Escape',
    'Tab',
    'Backspace',
    'Delete',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    ' ',
  ])('preserves normal %s interaction', (key) => {
    expect(
      shouldIgnoreTypingShortcut(new KeyboardEvent('keydown', { key })),
    ).toBe(false);
  });
  it('protects input method composition even with modifiers', () => {
    expect(
      shouldIgnoreTypingShortcut(
        new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: true,
          isComposing: true,
        }),
      ),
    ).toBe(true);
  });
});
