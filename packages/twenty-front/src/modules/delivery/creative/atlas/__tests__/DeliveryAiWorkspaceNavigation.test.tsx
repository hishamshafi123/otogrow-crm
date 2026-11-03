import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom';
import { DeliveryAiWorkspaceNavigation } from '@/delivery/creative/atlas/DeliveryAiWorkspaceNavigation';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
jest.mock('@/delivery/creative/atlas/atlasStyles', () => ({
  StyledAtlasNavigation: 'nav',
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
}));
const Draft = () => {
  const [value, setValue] = useState('');
  useDeliveryDraftStatus({ dirty: value !== '', saving: false });
  return (
    <label>
      Prepared request
      <input value={value} onChange={(event) => setValue(event.target.value)} />
    </label>
  );
};
const setup = (administrator = true) => {
  const Page = () => {
    const [params] = useSearchParams();
    return (
      <>
        <DeliveryAiWorkspaceNavigation administrator={administrator} />
        {params.get('agentView') === 'assistants' && <Draft />}
      </>
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
    {
      initialEntries: [
        '/delivery?view=agents&agentView=assistants&search=keep&task=old-task&creativeSubmission=2&reviewBatch=old-batch',
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return router;
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
});
it('links to the existing workspace sections and clears task-only selection when opening global media settings', async () => {
  const router = setup();
  expect(screen.getByRole('link', { name: 'Assistants' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('link', { name: 'AI spending' })).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Media models' }));
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('view')).toBe('agents');
  expect(params.get('agentView')).toBe('media');
  expect(params.get('search')).toBe('keep');
  expect(params.has('task')).toBe(false);
  expect(params.has('creativeSubmission')).toBe(false);
  expect(params.has('reviewBatch')).toBe(false);
  expect(screen.getByRole('link', { name: 'Media models' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
it('protects a prepared request until an explicit discard before changing the setup view', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Prepared request'),
    'Keep model and prompt',
  );
  await user.click(screen.getByRole('link', { name: 'Media models' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    new URLSearchParams(router.state.location.search).get('agentView'),
  ).toBe('assistants');
  expect(screen.getByLabelText('Prepared request')).toHaveValue(
    'Keep model and prompt',
  );
  await user.click(screen.getByRole('link', { name: 'Media models' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    new URLSearchParams(router.state.location.search).get('agentView'),
  ).toBe('media');
  expect(screen.queryByLabelText('Prepared request')).not.toBeInTheDocument();
});
it('offers no administrator setup navigation to a non-administrator', () => {
  setup(false);
  expect(
    screen.queryByRole('navigation', { name: 'AI workspace views' }),
  ).not.toBeInTheDocument();
});
