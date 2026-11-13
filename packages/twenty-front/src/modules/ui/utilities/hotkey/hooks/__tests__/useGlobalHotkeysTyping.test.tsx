import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'jotai';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { useGlobalHotkeys } from '@/ui/utilities/hotkey/hooks/useGlobalHotkeys';
import { useGoToHotkeys } from '@/ui/utilities/hotkey/hooks/useGoToHotkeys';

const ShortcutForm = ({ onCreate }: { onCreate: () => void }) => {
  useGoToHotkeys({ key: 'w', location: '/work' });
  useGlobalHotkeys({ keys: 'c', callback: onCreate, containsModifier: false });
  useGlobalHotkeys({
    keys: 'ctrl+enter',
    callback: onCreate,
    containsModifier: true,
  });
  const location = useLocation();

  return (
    <>
      <input aria-label="Client name" />
      <textarea aria-label="Brief" />
      <div
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Rich brief"
      >
        <span>Brief: </span>
      </div>
      <button>Outside form</button>
      <output aria-label="Current page">{location.pathname}</output>
    </>
  );
};

const setup = () => {
  const onCreate = jest.fn();
  render(
    <Provider>
      <MemoryRouter initialEntries={['/clients']}>
        <ShortcutForm onCreate={onCreate} />
      </MemoryRouter>
    </Provider>,
  );
  return { user: userEvent.setup(), onCreate };
};

describe('global shortcuts while typing', () => {
  it.each(['Client name', 'Brief', 'Rich brief'])(
    'preserves the full alphabet, digits and punctuation in %s',
    async (label) => {
      const { user, onCreate } = setup();
      const field = screen.getByRole('textbox', { name: label });
      await user.click(field);
      await user.keyboard(
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/@?',
      );
      if (label === 'Rich brief') {
        expect(field).toHaveTextContent(
          'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/@?',
        );
      } else {
        expect(field).toHaveValue(
          'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/@?',
        );
      }
      expect(screen.getByLabelText('Current page')).toHaveTextContent(
        '/clients',
      );
      expect(onCreate).not.toHaveBeenCalled();
    },
  );

  it('cancels a pending navigation when a shortcut letter is typed in a field', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button'));
    await user.keyboard('g');
    await user.type(screen.getByRole('textbox', { name: 'Client name' }), 'w');
    await user.click(screen.getByRole('button'));
    await user.keyboard('w');
    expect(screen.getByLabelText('Current page')).toHaveTextContent('/clients');
  });

  it('ignores legacy letter shortcuts even outside editable controls', async () => {
    const { user, onCreate } = setup();
    await user.click(screen.getByRole('button'));
    await user.keyboard('cgw');
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Current page')).toHaveTextContent('/clients');
  });

  it('does not intercept a shortcut during IME composition', () => {
    setup();
    const allowed = fireEvent.keyDown(document, {
      key: 'g',
      code: 'KeyG',
      isComposing: true,
    });
    fireEvent.keyDown(document, { key: 'w', code: 'KeyW' });
    expect(allowed).toBe(true);
    expect(screen.getByLabelText('Current page')).toHaveTextContent('/clients');
  });

  it('preserves explicitly registered modifier shortcuts in a field', async () => {
    const { user, onCreate } = setup();
    await user.click(screen.getByRole('textbox', { name: 'Brief' }));
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('protects descendants of a rich text editor', () => {
    setup();
    const nestedText = screen.getByText('Brief:');
    expect(fireEvent.keyDown(nestedText, { key: 'g', code: 'KeyG' })).toBe(
      true,
    );
    expect(fireEvent.keyDown(nestedText, { key: 'w', code: 'KeyW' })).toBe(
      true,
    );
    expect(screen.getByLabelText('Current page')).toHaveTextContent('/clients');
  });
});
