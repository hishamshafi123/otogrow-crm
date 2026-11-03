import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
  type DeliveryDraftNavigationRetention,
} from '@/delivery/drafts/DeliveryDraftGuard';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
}));

const retainsResult: DeliveryDraftNavigationRetention = (current, next) => {
  const currentParams = new URLSearchParams(current.search);
  const nextParams = new URLSearchParams(next.search);
  currentParams.delete('result');
  nextParams.delete('result');
  return (
    current.pathname === next.pathname &&
    currentParams.toString() === nextParams.toString()
  );
};
const rejectsNavigation: DeliveryDraftNavigationRetention = () => {
  throw new Error('Unavailable ownership');
};
type NavigationRequest = ReturnType<
  typeof useDeliveryDraftGuard
>['requestNavigation'];

const NavigationDraft = ({ broken }: { broken: boolean }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { requestAction, requestNavigation, cancelPendingNavigation } =
    useDeliveryDraftGuard();
  const [review, setReview] = useState('');
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(false);
  const [prepared, setPrepared] = useState<NavigationRequest | null>(null);
  useDeliveryDraftStatus({
    dirty: review.length > 0,
    saving,
    retainsNavigation: broken ? rejectsNavigation : retainsResult,
  });
  useDeliveryDraftStatus({ dirty: other.length > 0, saving: false });
  const destination = {
    pathname: '/delivery',
    search: '?source=one&result=two',
  };
  const openResult = (request: NavigationRequest) =>
    request(destination, () => navigate('/delivery?source=one&result=two'));
  return (
    <>
      <output aria-label="Location">{location.search}</output>
      <label>
        Prepared review
        <input
          value={review}
          onChange={(event) => setReview(event.target.value)}
        />
      </label>
      <label>
        Other private draft
        <input
          value={other}
          onChange={(event) => setOther(event.target.value)}
        />
      </label>
      <label>
        Saving review
        <input
          type="checkbox"
          checked={saving}
          onChange={(event) => setSaving(event.target.checked)}
        />
      </label>
      <Link to="/delivery?source=one&result=two">Open retained result</Link>
      <Link to="/delivery?source=two">Open another report</Link>
      <button onClick={() => openResult(requestNavigation)}>
        Record result
      </button>
      <button onClick={() => setPrepared(() => requestNavigation)}>
        Prepare navigation
      </button>
      <button onClick={() => prepared && openResult(prepared)}>
        Complete prepared navigation
      </button>
      <button onClick={() => requestAction(() => setClosed(true))}>
        Close preparation
      </button>
      <button onClick={cancelPendingNavigation}>
        Cancel pending navigation
      </button>
      {closed && <p>Preparation closed</p>}
    </>
  );
};
const setup = (broken = false) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <DeliveryDraftGuardProvider>
            <NavigationDraft broken={broken} />
          </DeliveryDraftGuardProvider>
        ),
      },
    ],
    {
      initialEntries: ['/delivery?source=two', '/delivery?source=one'],
      initialIndex: 1,
    },
  );
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <RouterProvider router={router} />
      </ThemeProvider>
    </I18nProvider>,
  );
  return { router, user: userEvent.setup() };
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

it('retains owned inputs during result navigation but still protects source changes and local closes', async () => {
  const { user } = setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Prepared review' }),
    'Reviewed recommendation',
  );
  await user.click(screen.getByRole('link', { name: 'Open retained result' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('result=two');
  expect(screen.getByRole('textbox', { name: 'Prepared review' })).toHaveValue(
    'Reviewed recommendation',
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Open another report' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await user.click(screen.getByRole('button', { name: 'Close preparation' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.queryByText('Preparation closed')).not.toBeInTheDocument();
});

it('requires every dirty registration to retain the destination', async () => {
  const { user } = setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Prepared review' }),
    'Manual work',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Other private draft' }),
    'Unowned work',
  );
  await user.click(screen.getByRole('button', { name: 'Record result' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByLabelText('Location')).not.toHaveTextContent('result=two');
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    screen.getByRole('textbox', { name: 'Other private draft' }),
  ).toHaveValue('Unowned work');
});

it('never relaxes an in-progress save or before-unload protection', async () => {
  const { user } = setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Prepared review' }),
    'Unsaved work',
  );
  const beforeUnload = new Event('beforeunload', { cancelable: true });
  fireEvent(window, beforeUnload);
  expect(beforeUnload.defaultPrevented).toBe(true);
  await user.click(screen.getByRole('checkbox', { name: 'Saving review' }));
  await user.click(screen.getByRole('button', { name: 'Record result' }));
  expect(
    screen.getByText(
      'A save is in progress. Wait for the result before leaving.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Discard and continue' }),
  ).toBeDisabled();
});

it('uses current registrations even when an async caller retained an older navigation function', async () => {
  const { user } = setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Prepared review' }),
    'Manual work',
  );
  await user.click(screen.getByRole('button', { name: 'Prepare navigation' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Other private draft' }),
    'New private preparation',
  );
  await user.click(
    screen.getByRole('button', { name: 'Complete prepared navigation' }),
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByLabelText('Location')).not.toHaveTextContent('result=two');
});

it('applies retention to browser Back and Forward without weakening source protection', async () => {
  const { user, router } = setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Prepared review' }),
    'Keep this review',
  );
  await user.click(screen.getByRole('button', { name: 'Record result' }));
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Location')).toHaveTextContent('?source=one');
  await act(async () => {
    await router.navigate(1);
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => {
    await router.navigate(-2);
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox', { name: 'Prepared review' })).toHaveValue(
    'Keep this review',
  );
});

it('does not replace an existing pending decision with a late retained navigation', async () => {
  const { user } = setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Prepared review' }),
    'Manual work',
  );
  await user.click(screen.getByRole('button', { name: 'Close preparation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Record result' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByText('Preparation closed')).toBeVisible();
  expect(screen.getByLabelText('Location')).not.toHaveTextContent('result=two');
});

it('fails closed when a retention policy cannot verify ownership', async () => {
  const { user } = setup(true);
  await user.type(
    screen.getByRole('textbox', { name: 'Prepared review' }),
    'Manual work',
  );
  await user.click(screen.getByRole('button', { name: 'Record result' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByLabelText('Location')).not.toHaveTextContent('result=two');
});
