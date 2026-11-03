import { useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { Request } from 'cross-fetch';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

const COMPANY_REQUEST = '149ad9a9-b94f-42b1-a201-b39ab778993b';
const SETUP_REQUEST = '98ea6298-fc0b-4367-bc7c-b4bf5f96e713';
let recordEarlier: ReturnType<
  typeof useDeliveryDraftGuard
>['recordSetupRecoveryId'];
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
}));
const Draft = () => {
  const [value, setValue] = useState('');
  const [result, setResult] = useState('');
  const [saving, setSaving] = useState(false);
  const guard = useDeliveryDraftGuard();
  const location = useLocation();
  useDeliveryDraftStatus({ dirty: value !== '', saving });
  return (
    <>
      <label>
        Private setup draft
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button
        onClick={() =>
          setResult(
            String(guard.recordSetupRecoveryId('company', COMPANY_REQUEST)),
          )
        }
      >
        Record company recovery
      </button>
      <button
        onClick={() =>
          setResult(String(guard.recordSetupRecoveryId('setup', SETUP_REQUEST)))
        }
      >
        Record setup recovery
      </button>
      <button
        onClick={() =>
          setResult(
            String(guard.recordSetupRecoveryId('company', 'not-a-uuid')),
          )
        }
      >
        Invalid recovery
      </button>
      <button
        onClick={() => {
          recordEarlier = guard.recordSetupRecoveryId;
        }}
      >
        Remember delayed caller
      </button>
      <button onClick={() => setSaving(true)}>Begin save</button>
      <Link to="/delivery?view=clients">Leave setup</Link>
      <Link to="/delivery?view=onboarding&setupCompany=66d26d1f-c69e-44da-96af-b4f6dc1920cf">
        Change company source
      </Link>
      <output aria-label="Recovery result">{result}</output>
      <output aria-label="Location">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
    </>
  );
};
const setup = (entry = '/delivery?view=onboarding&search=retained#review') => {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Draft />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: ['/before', entry], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
};
const unloadProtected = () =>
  !fireEvent(window, new Event('beforeunload', { cancelable: true }));
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
it('records only validated recovery IDs with replace, preserves mounted dirty inputs and leaves route/source navigation protected', async () => {
  const router = setup();
  const user = userEvent.setup();
  const input = screen.getByLabelText('Private setup draft');
  await user.type(input, 'Private company and service terms');
  expect(unloadProtected()).toBe(true);
  await user.click(
    screen.getByRole('button', { name: 'Record company recovery' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Record setup recovery' }),
  );
  expect(screen.getByLabelText('Recovery result')).toHaveTextContent('true');
  expect(router.state.location.pathname).toBe('/delivery');
  expect(router.state.location.hash).toBe('#review');
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('setupCompanyRequest')).toBe(COMPANY_REQUEST);
  expect(params.get('setupRequest')).toBe(SETUP_REQUEST);
  expect(params.get('search')).toBe('retained');
  expect(screen.getByLabelText('Private setup draft')).toBe(input);
  expect(input).toHaveValue('Private company and service terms');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(unloadProtected()).toBe(true);
  await user.click(screen.getByRole('link', { name: 'Change company source' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    new URLSearchParams(router.state.location.search).get('setupCompany'),
  ).toBeNull();
  await user.click(screen.getByRole('link', { name: 'Leave setup' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(input).toHaveValue('Private company and service terms');
  await act(async () => {
    await router.navigate(-1);
  });
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(router.state.location.pathname).toBe('/before');
});
it('rejects invalid IDs and other views without bypassing draft navigation protection', async () => {
  const router = setup('/delivery?view=clients');
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Private setup draft'),
    'Keep existing plan',
  );
  await user.click(
    screen.getByRole('button', { name: 'Record company recovery' }),
  );
  expect(screen.getByLabelText('Recovery result')).toHaveTextContent('false');
  expect(router.state.location.search).toBe('?view=clients');
  await user.click(screen.getByRole('button', { name: 'Invalid recovery' }));
  expect(router.state.location.search).toBe('?view=clients');
  expect(unloadProtected()).toBe(true);
});
it('refuses a delayed recovery caller during a pending confirmation or after navigation to another view', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Remember delayed caller' }),
  );
  await user.type(
    screen.getByLabelText('Private setup draft'),
    'Keep current draft',
  );
  await user.click(screen.getByRole('link', { name: 'Leave setup' }));
  let recorded = true;
  act(() => {
    recorded = recordEarlier('company', COMPANY_REQUEST);
  });
  expect(recorded).toBe(false);
  expect(
    new URLSearchParams(router.state.location.search).has(
      'setupCompanyRequest',
    ),
  ).toBe(false);
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  act(() => {
    recorded = recordEarlier('setup', SETUP_REQUEST);
  });
  expect(recorded).toBe(false);
  expect(router.state.location.search).toBe('?view=clients');
});
it('retains saving and unload protection when recording an exact request ID', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Begin save' }));
  await user.click(
    screen.getByRole('button', { name: 'Record setup recovery' }),
  );
  expect(screen.getByLabelText('Recovery result')).toHaveTextContent('true');
  expect(unloadProtected()).toBe(true);
  await user.click(screen.getByRole('link', { name: 'Leave setup' }));
  expect(
    screen.getByRole('button', { name: 'Discard and continue' }),
  ).toBeDisabled();
});
