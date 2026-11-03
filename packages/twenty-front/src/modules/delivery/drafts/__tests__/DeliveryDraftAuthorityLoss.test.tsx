import { useLayoutEffect, useRef, useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
}));
const duplicate = jest.fn();
let changeAuthority: (authorized: boolean) => void;
let changeOutage: (outage: boolean) => void;
let finishSave: () => void;
const PrivateForm = ({ saved }: { saved: boolean }) => {
  const [name, setName] = useState('');
  const { requestAction } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({ dirty: name !== '' && !saved, saving: false });
  return (
    <>
      <label>
        Private assistant instructions
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button onClick={() => requestAction(() => duplicate(name))}>
        Duplicate prepared assistant
      </button>
    </>
  );
};
const OtherDraft = () => {
  const [value, setValue] = useState('');
  useDeliveryDraftStatus({ dirty: value !== '', saving: false });
  return (
    <label>
      Unrelated delivery draft
      <input value={value} onChange={(event) => setValue(event.target.value)} />
    </label>
  );
};
const Harness = ({ otherDraft }: { otherDraft: boolean }) => {
  const [authorized, setAuthorized] = useState(true);
  const [outage, setOutage] = useState(false);
  const [saved, setSaved] = useState(false);
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const location = useLocation();
  // oxlint-disable-next-line twenty/no-state-useref -- Permission transitions must cancel imperatively before the provider's passive continuation.
  const previousAuthority = useRef(authorized);
  useLayoutEffect(() => {
    const lostAuthority = previousAuthority.current && !authorized;
    previousAuthority.current = authorized;
    if (lostAuthority) cancelPendingNavigation();
  }, [authorized, cancelPendingNavigation]);
  changeAuthority = setAuthorized;
  changeOutage = setOutage;
  finishSave = () => setSaved(true);
  return (
    <>
      <Link to="/other">Other workflow</Link>
      <output aria-label="Current location">
        {location.pathname}
        {location.search}
      </output>
      {authorized ? (
        <fieldset hidden={outage} disabled={outage}>
          <PrivateForm saved={saved} />
        </fieldset>
      ) : (
        <p>Configuration access was revoked</p>
      )}
      {otherDraft && <OtherDraft />}
    </>
  );
};
const setup = ({ otherDraft = false } = {}) => {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Harness otherDraft={otherDraft} />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: ['/earlier', '/delivery?view=agents'], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup() };
};
const unloadProtected = () =>
  !fireEvent(window, new Event('beforeunload', { cancelable: true }));
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  duplicate.mockClear();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

it('cancels a queued private duplicate before confirmed permission loss unmounts its last dirty form', async () => {
  const { user, router } = setup();
  await user.type(
    screen.getByLabelText('Private assistant instructions'),
    'Private client strategy',
  );
  await user.click(
    screen.getByRole('button', { name: 'Duplicate prepared assistant' }),
  );
  expect(
    screen.getByRole('dialog', { name: 'Keep your changes?' }),
  ).toBeVisible();
  act(() => changeAuthority(false));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(screen.getByText('Configuration access was revoked')).toBeVisible();
  expect(duplicate).not.toHaveBeenCalled();
  expect(router.state.location.search).toBe('?view=agents');
  act(() => changeAuthority(true));
  expect(screen.getByLabelText('Private assistant instructions')).toHaveValue(
    '',
  );
  expect(duplicate).not.toHaveBeenCalled();
});

it('resets blocked browser Back when authority disappears without replaying that navigation after regrant', async () => {
  const { user, router } = setup();
  await user.type(
    screen.getByLabelText('Private assistant instructions'),
    'Retain until access is checked',
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(
    screen.getByRole('dialog', { name: 'Keep your changes?' }),
  ).toBeVisible();
  act(() => changeAuthority(false));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText('Current location')).toHaveTextContent(
    '/delivery?view=agents',
  );
  expect(
    [...router.state.blockers.values()].every(
      (blocker) => blocker.state === 'unblocked',
    ),
  ).toBe(true);
  act(() => changeAuthority(true));
  expect(router.state.location.pathname).toBe('/delivery');
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByLabelText('Current location')).toHaveTextContent(
    '/earlier',
  );
  expect(duplicate).not.toHaveBeenCalled();
});

it('cancels pending navigation without clearing an unrelated form’s dirty registration', async () => {
  const { user } = setup({ otherDraft: true });
  await user.type(
    screen.getByLabelText('Private assistant instructions'),
    'Private pending configuration',
  );
  await user.type(
    screen.getByLabelText('Unrelated delivery draft'),
    'Keep the next creative plan',
  );
  await user.click(
    screen.getByRole('button', { name: 'Duplicate prepared assistant' }),
  );
  act(() => changeAuthority(false));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(unloadProtected()).toBe(true);
  await user.click(screen.getByRole('link', { name: 'Other workflow' }));
  expect(
    screen.getByRole('dialog', { name: 'Keep your changes?' }),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Unrelated delivery draft')).toHaveValue(
    'Keep the next creative plan',
  );
  expect(duplicate).not.toHaveBeenCalled();
});

it('cancels a browser attempt captured before revocation even when their blocked state commits together', async () => {
  const { user, router } = setup();
  await user.type(
    screen.getByLabelText('Private assistant instructions'),
    'Private intent before the same commit',
  );
  await act(async () => {
    const navigation = router.navigate(-1);
    changeAuthority(false);
    await navigation;
  });
  await waitFor(() =>
    expect(screen.getByText('Configuration access was revoked')).toBeVisible(),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText('Current location')).toHaveTextContent(
    '/delivery?view=agents',
  );
  expect(
    [...router.state.blockers.values()].every(
      (blocker) => blocker.state === 'unblocked',
    ),
  ).toBe(true);
  expect(duplicate).not.toHaveBeenCalled();
});

it('keeps a temporary outage draft and continues an uncancelled action once its save marks it clean', async () => {
  const { user } = setup();
  await user.type(
    screen.getByLabelText('Private assistant instructions'),
    'Verified same-identity draft',
  );
  const input = screen.getByLabelText('Private assistant instructions');
  act(() => changeOutage(true));
  expect(input).not.toBeVisible();
  expect(unloadProtected()).toBe(true);
  act(() => changeOutage(false));
  expect(input).toHaveValue('Verified same-identity draft');
  await user.click(
    screen.getByRole('button', { name: 'Duplicate prepared assistant' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(input).toHaveValue('Verified same-identity draft');
  await user.click(
    screen.getByRole('button', { name: 'Duplicate prepared assistant' }),
  );
  act(() => finishSave());
  await waitFor(() => expect(duplicate).toHaveBeenCalledTimes(1));
  expect(duplicate).toHaveBeenCalledWith('Verified same-identity draft');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(unloadProtected()).toBe(false);
});
