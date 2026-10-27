import { type ComponentProps, useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { FinancePeriodReviewForm } from '@/delivery/finance/FinancePeriodReviewForm';
import {
  financePeriodLockedFixture,
  financePeriodSnapshotFixture,
} from '@/delivery/finance/__tests__/finance-period.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
type ReviewProps = ComponentProps<typeof FinancePeriodReviewForm>;
const mockSave = jest.fn();
const mockCancel = jest.fn();
const mockReload = jest.fn();
const propsFixture = (): ReviewProps => ({
  snapshot: financePeriodSnapshotFixture(),
  intent: 'LOCK',
  busy: false,
  readOnly: false,
  onSave: mockSave,
  onCancel: mockCancel,
  onReload: mockReload,
});
const setup = (initial = propsFixture()) => {
  let update: (props: ReviewProps) => void = () => undefined;
  const Page = () => {
    const [props, setProps] = useState(initial);
    update = setProps;
    return (
      <FinancePeriodReviewForm
        snapshot={props.snapshot}
        intent={props.intent}
        busy={props.busy}
        readOnly={props.readOnly}
        checking={props.checking}
        onSave={props.onSave}
        onCancel={props.onCancel}
        onReload={props.onReload}
      />
    );
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Page />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: ['/delivery?view=finance&financeView=monthly'] },
  );
  render(<RouterProvider router={router} />);
  return { update: (props: ReviewProps) => act(() => update(props)) };
};
const fillReview = async () => {
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for locking' }),
    'Reviewed every recorded currency.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockSave.mockReset().mockResolvedValue(false);
  mockCancel.mockReset();
  mockReload.mockReset();
});

it('requires a reason and explicit limitations review, sends the exact preview and keeps a stable retry identity', async () => {
  const props = propsFixture();
  setup(props);
  expect(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  ).toBeDisabled();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for locking' }),
    '  Reviewed every recorded currency.  ',
  );
  expect(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  const first = mockSave.mock.calls[0][0];
  expect(first).toMatchObject({
    month: '2026-10',
    revision: 0,
    expectedPreviewToken: props.snapshot.previewToken,
    status: 'LOCKED',
    reason: 'Reviewed every recorded currency.',
    acknowledgeLimitations: true,
  });
  expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(screen.getByRole('checkbox')).toBeChecked();
  await userEvent.click(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  expect(mockSave.mock.calls[1][0].id).toBe(first.id);
});

it('requires a reopening reason without asking for a locking acknowledgement', async () => {
  const props = propsFixture();
  props.intent = 'REOPEN';
  props.snapshot = {
    ...props.snapshot,
    period: financePeriodLockedFixture(),
    canLock: false,
    canReopen: true,
  };
  setup(props);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for reopening' }),
    'Correct an omitted supplier cost.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Reopen monthly results' }),
  );
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'OPEN',
      revision: 1,
      acknowledgeLimitations: false,
      reason: 'Correct an omitted supplier cost.',
    }),
  );
});

it('preserves the reason and acknowledgement after a changed preview and guards an explicit reload', async () => {
  const props = propsFixture();
  const page = setup(props);
  await fillReview();
  page.update({
    ...props,
    snapshot: { ...props.snapshot, previewToken: 'c'.repeat(64) },
  });
  expect(
    screen.getByText(/This record changed while you were editing/),
  ).toBeVisible();
  expect(
    screen.getByRole('textbox', { name: 'Reason for locking' }),
  ).toHaveValue('Reviewed every recorded currency.');
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  expect(mockReload).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(mockReload).toHaveBeenCalledTimes(1);
  expect(mockSave).not.toHaveBeenCalled();
});

it('retains an opened review read-only through authority loss and resumes without submitting', async () => {
  const props = propsFixture();
  const page = setup(props);
  await fillReview();
  page.update({ ...props, readOnly: true });
  expect(
    screen.getByRole('textbox', { name: 'Reason for locking' }),
  ).toBeDisabled();
  expect(screen.getByRole('checkbox')).toBeChecked();
  page.update({ ...props, checking: true });
  expect(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  ).toBeDisabled();
  page.update(props);
  expect(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  ).toBeEnabled();
  expect(mockSave).not.toHaveBeenCalled();
});

it('keeps blocker policy authoritative and protects a dirty cancellation', async () => {
  const props = propsFixture();
  props.snapshot = { ...props.snapshot, blockerCount: 1, canLock: false };
  setup(props);
  await fillReview();
  expect(
    screen.getByText(
      'Resolve every blocking draft or correction before locking this month.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Lock monthly results' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel month review' }),
  );
  expect(mockCancel).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(mockCancel).toHaveBeenCalledTimes(1);
});
