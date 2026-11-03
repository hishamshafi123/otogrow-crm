import { StrictMode, useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  RouterProvider,
  useNavigate,
} from 'react-router-dom';
import { Request } from 'cross-fetch';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftGuard,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { AdvertisingObservationPanel } from '@/delivery/advertising/workbench/AdvertisingObservationPanel';
import {
  observationReview,
  observationState,
  OBSERVATION_REQUEST,
} from '@/delivery/advertising/workbench/__tests__/advertising-observation.fixtures';
import { type AdvertisingCommand } from '@/delivery/advertising/workbench/useAdvertisingCommands';

const mockExecute = jest.fn();
const mockCheck = jest.fn();
jest.mock('@/delivery/advertising/workbench/useAdvertisingCommands', () => ({
  useAdvertisingCommands: () => ({
    execute: mockExecute,
    check: mockCheck,
    busy: false,
  }),
}));
jest.mock(
  '@/delivery/advertising/workbench/AdvertisingObservationHistory',
  () => ({
    AdvertisingObservationHistory: () => <p>Verified history component</p>,
  }),
);
jest.mock(
  '@/delivery/advertising/workbench/AdvertisingObservationSource',
  () => ({ AdvertisingObservationSource: () => <p>Verified report picker</p> }),
);
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock(
  '@/delivery/advertising/workbench/advertisingWorkbenchStyles',
  () => ({
    StyledAdvertisingBoundary: 'fieldset',
    StyledAdvertisingFacts: 'dl',
    StyledAdvertisingText: 'p',
  }),
);

const properties = () => {
  const review = observationReview();
  return {
    state: observationState(),
    review,
    actionId: review.actions[0].id,
    requestId: OBSERVATION_REQUEST,
    fresh: true,
    consumeIntent: jest.fn(),
    enabled: true,
    onClose: jest.fn(),
    onSaved: jest.fn().mockResolvedValue(undefined),
    onAuthorityLost: jest.fn(),
  };
};
const view = (props: ReturnType<typeof properties>) => (
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <AdvertisingObservationPanel
        state={props.state}
        review={props.review}
        actionId={props.actionId}
        requestId={props.requestId}
        fresh={props.fresh}
        consumeIntent={props.consumeIntent}
        enabled={props.enabled}
        onClose={props.onClose}
        onSaved={props.onSaved}
        onAuthorityLost={props.onAuthorityLost}
      />
    </I18nProvider>
  </StrictMode>
);
beforeEach(() => {
  i18n.load('en', {});
  i18n.activate('en');
  mockExecute.mockReset().mockResolvedValue(null);
  mockCheck.mockReset().mockResolvedValue({ kind: 'NOT_FOUND' });
});
beforeAll(() => {
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
const GuardedObservation = () => {
  const [props] = useState(properties);
  const [outage, setOutage] = useState(false);
  const [denied, setDenied] = useState(false);
  const navigate = useNavigate();
  const guard = useDeliveryDraftGuard();
  // oxlint-disable-next-line twenty/no-navigate-prefer-link -- Browser POP semantics are required to verify unsaved navigation protection.
  const goBack = () => navigate(-1);
  return (
    <>
      {/* oxlint-disable-next-line twenty/no-navigate-prefer-link -- A browser POP transition is required to verify unsaved navigation protection. */}
      <button onClick={goBack}>Browser Back</button>
      <button onClick={() => setOutage((value) => !value)}>
        Toggle transport outage
      </button>
      <button onClick={() => setDenied((value) => !value)}>
        Toggle confirmed access loss
      </button>
      <AdvertisingObservationPanel
        review={props.review}
        actionId={props.actionId}
        requestId={props.requestId}
        fresh={props.fresh}
        consumeIntent={props.consumeIntent}
        onSaved={props.onSaved}
        onAuthorityLost={props.onAuthorityLost}
        enabled={!outage && !denied}
        state={
          outage ? { ...props.state, data: null } : { ...props.state, denied }
        }
        onClose={() => guard.requestAction(() => navigate('/other'))}
      />
    </>
  );
};
const guardedView = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/form',
        element: (
          <DeliveryDraftGuardProvider>
            <GuardedObservation />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other page</p> },
    ],
    { initialEntries: ['/other', '/form'], initialIndex: 1 },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return router;
};
const fill = async () => {
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText('First observed day'), {
    target: { value: '2020-02-21' },
  });
  fireEvent.change(screen.getByLabelText('Last observed day'), {
    target: { value: '2020-02-22' },
  });
  await user.type(screen.getByLabelText('Observed outcome count'), '0');
  await user.type(
    screen.getByLabelText('Evidence and how it was verified'),
    'Private verification notes',
  );
  await user.type(
    screen.getByLabelText('Interpretation, limitations and correction reason'),
    'The period is limited; no causal claim.',
  );
  return user;
};
it('freezes an interrupted save and only retries the identical body after a missing-receipt check', async () => {
  const props = properties();
  render(view(props));
  const user = await fill();
  await user.click(screen.getByRole('button', { name: 'Record observation' }));
  expect(mockExecute).toHaveBeenCalledTimes(1);
  const original: AdvertisingCommand = mockExecute.mock.calls[0][0];
  expect(original.input).toMatchObject({
    requestId: OBSERVATION_REQUEST,
    value: '0',
    assessment: 'INCONCLUSIVE',
    sourceId: null,
  });
  expect(
    screen.getByLabelText('Evidence and how it was verified'),
  ).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Retry this exact observation' }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Check saved observation' }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Retry this exact observation' }),
  );
  expect(mockExecute).toHaveBeenCalledTimes(2);
  expect(mockExecute.mock.calls[1][0]).toEqual(original);
});
it('a reopened request remains check-only even when no saved receipt exists', async () => {
  const props = { ...properties(), fresh: false };
  render(view(props));
  const user = userEvent.setup();
  expect(
    screen.queryByLabelText('Evidence and how it was verified'),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Check saved observation' }),
  );
  expect(
    await screen.findByText(/original submitted body is not available/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry this exact observation' }),
  ).not.toBeInTheDocument();
  expect(mockExecute).not.toHaveBeenCalled();
});
it('hides a mounted draft during a transport outage and retains it after the same access is verified', async () => {
  const props = properties();
  const rendered = render(view(props));
  await fill();
  rendered.rerender(view({ ...props, enabled: false, fresh: false }));
  expect(
    screen.queryByDisplayValue('Private verification notes'),
  ).not.toBeInTheDocument();
  rendered.rerender(view({ ...props, fresh: false }));
  expect(
    screen.getByDisplayValue('Private verification notes'),
  ).toBeInTheDocument();
  expect(mockExecute).not.toHaveBeenCalled();
});
it('drops owned notes after confirmed access loss and never restores editing on regrant', async () => {
  const props = properties();
  const rendered = render(view(props));
  await fill();
  rendered.rerender(
    view({
      ...props,
      state: { ...props.state, denied: true },
      enabled: false,
      fresh: false,
    }),
  );
  rendered.rerender(view({ ...props, fresh: false }));
  expect(
    screen.queryByDisplayValue('Private verification notes'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved observation' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Record observation' }),
  ).not.toBeInTheDocument();
});
it('does not accept a receipt belonging to another observation body or author', async () => {
  const props = properties();
  render(view(props));
  const user = await fill();
  await user.click(screen.getByRole('button', { name: 'Record observation' }));
  mockCheck.mockResolvedValue({
    kind: 'FOUND',
    receipt: {
      observationId: 'different-observation',
      actorId: props.state.data?.memberId,
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved observation' }),
  );
  await waitFor(() =>
    expect(
      screen.getByText(/does not match the original observation attempt/),
    ).toBeInTheDocument(),
  );
  expect(props.onSaved).not.toHaveBeenCalled();
});
it('protects notes from browser Back even while a transport outage hides the form', async () => {
  const router = guardedView();
  const user = await fill();
  await user.click(
    screen.getByRole('button', { name: 'Toggle transport outage' }),
  );
  expect(
    screen.queryByDisplayValue('Private verification notes'),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Browser Back' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'Keep your changes?',
  );
  expect(router.state.location.pathname).toBe('/form');
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await user.click(
    screen.getByRole('button', { name: 'Toggle transport outage' }),
  );
  expect(
    screen.getByDisplayValue('Private verification notes'),
  ).toBeInTheDocument();
});
it('cancels blocked navigation before confirmed authority loss disposes the owned notes', async () => {
  const router = guardedView();
  const user = await fill();
  await user.click(screen.getByRole('button', { name: 'Browser Back' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Toggle confirmed access loss' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(router.state.location.pathname).toBe('/form');
  await user.click(
    screen.getByRole('button', { name: 'Toggle confirmed access loss' }),
  );
  expect(
    screen.queryByDisplayValue('Private verification notes'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved observation' }),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/form');
});
