import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryGuardedForm } from '@/delivery/drafts/DeliveryGuardedForm';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
}));
const save = jest.fn<Promise<boolean>, [FormData, number]>();
const Harness = () => {
  const [revision, setRevision] = useState(3);
  const [visible, setVisible] = useState(true);
  return (
    <>
      <Link to="/other">Other view</Link>
      <button onClick={() => setRevision((previous) => previous + 1)}>
        Refresh revision
      </button>
      <button
        onClick={() => {
          setVisible(false);
          setRevision((previous) => previous + 1);
        }}
      >
        Action no longer available
      </button>
      <DeliveryGuardedForm
        revision={revision}
        busy={false}
        visible={visible}
        onSave={save}
      >
        <label>
          Review notes
          <textarea name="notes" />
        </label>
        <label>
          Decision
          <select name="decision">
            <option value="APPROVED">Approve</option>
            <option value="REJECTED">Reject</option>
          </select>
        </label>
        <button type="submit">Save review</button>
      </DeliveryGuardedForm>
    </>
  );
};
const setup = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other view opened</p> },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return userEvent.setup();
};
beforeAll(() => {
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  save.mockReset().mockResolvedValue(true);
});

it('retains a failed review, blocks stale submission and adopts the latest revision only after explicit discard', async () => {
  save.mockResolvedValueOnce(false);
  const user = setup();
  await user.type(
    screen.getByLabelText('Review notes'),
    'Product label is wrong',
  );
  await user.selectOptions(screen.getByLabelText('Decision'), 'REJECTED');
  await user.click(screen.getByRole('button', { name: 'Save review' }));
  expect(save.mock.calls[0][0].get('notes')).toBe('Product label is wrong');
  expect(save.mock.calls[0][1]).toBe(3);
  expect(screen.getByLabelText('Review notes')).toHaveValue(
    'Product label is wrong',
  );
  await user.click(screen.getByRole('button', { name: 'Refresh revision' }));
  expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Review notes')).toHaveValue(
    'Product label is wrong',
  );
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Review notes')).toHaveValue('');
  await user.type(screen.getByLabelText('Review notes'), 'Corrected');
  await user.click(screen.getByRole('button', { name: 'Save review' }));
  expect(save.mock.calls[1][1]).toBe(4);
  expect(screen.getByLabelText('Review notes')).toHaveValue('');
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByText('Other view opened')).toBeInTheDocument();
});

it('holds navigation while a write is pending and continues cleanly once it succeeds', async () => {
  let finish: (value: boolean) => void = () => undefined;
  save.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const user = setup();
  await user.type(screen.getByLabelText('Review notes'), 'Checked');
  await user.click(screen.getByRole('button', { name: 'Save review' }));
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(
    screen.getByRole('button', { name: 'Discard and continue' }),
  ).toBeDisabled();
  await act(async () => finish(true));
  expect(screen.getByText('Other view opened')).toBeInTheDocument();
});

it('keeps notes visible when an external transition removes the available action', async () => {
  const user = setup();
  await user.type(screen.getByLabelText('Review notes'), 'Still needed');
  await user.click(
    screen.getByRole('button', { name: 'Action no longer available' }),
  );
  expect(screen.getByLabelText('Review notes')).toHaveValue('Still needed');
  expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.queryByLabelText('Review notes')).not.toBeInTheDocument();
});

it('unregisters the previous route blocker when the authenticated scope remounts', async () => {
  const warnings = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  const ScopedHarness = () => {
    const [scope, setScope] = useState(1);
    return (
      <>
        <button onClick={() => setScope((value) => value + 1)}>
          Change authenticated scope
        </button>
        <DeliveryDraftGuardProvider key={scope}>
          <Harness />
        </DeliveryDraftGuardProvider>
      </>
    );
  };
  const router = createMemoryRouter(
    [
      { path: '/delivery', element: <ScopedHarness /> },
      { path: '/other', element: <p>Other view opened</p> },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Review notes'), 'Old scope draft');
  await user.click(
    screen.getByRole('button', { name: 'Change authenticated scope' }),
  );
  expect(screen.getByLabelText('Review notes')).toHaveValue('');
  await user.type(screen.getByLabelText('Review notes'), 'Current scope draft');
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Review notes')).toHaveValue(
    'Current scope draft',
  );
  expect(
    warnings.mock.calls.some((args) => String(args[0]).includes('one blocker')),
  ).toBe(false);
  warnings.mockRestore();
});
