import { StrictMode, useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';

type PanelProps = { name: string; close: () => void; focusOther: () => void };
const Panel = ({ name, close, focusOther }: PanelProps) => {
  const attach = useAssistantPanelFocus();
  return (
    <section ref={attach} tabIndex={-1} aria-label={`Saved run ${name}`}>
      <button onClick={close}>Close run</button>
      <button onClick={focusOther}>Close and edit search</button>
    </section>
  );
};
const Harness = () => {
  const [selected, setSelected] = useState<string | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Native focus restoration needs the current input element.
  const search = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button onClick={() => setSelected('A')}>Open run A</button>
      <button onClick={() => setSelected('B')}>Open run B</button>
      <label>
        Find another run
        <input ref={search} />
      </label>
      {selected !== null && (
        <Panel
          key={selected}
          name={selected}
          close={() => setSelected(null)}
          focusOther={() => {
            setSelected(null);
            search.current?.focus();
          }}
        />
      )}
    </>
  );
};
it('keeps focus in a newly opened/replaced panel through StrictMode effect replay and returns it after genuine close', async () => {
  render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open run A' }));
  expect(screen.getByRole('region', { name: 'Saved run A' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Open run B' }));
  expect(screen.getByRole('region', { name: 'Saved run B' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Close run' }));
  expect(screen.getByRole('button', { name: 'Open run B' })).toHaveFocus();
});
it('does not overwrite another deliberate focus target when the old panel leaves', async () => {
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open run A' }));
  await user.click(
    screen.getByRole('button', { name: 'Close and edit search' }),
  );
  expect(
    screen.getByRole('textbox', { name: 'Find another run' }),
  ).toHaveFocus();
});
