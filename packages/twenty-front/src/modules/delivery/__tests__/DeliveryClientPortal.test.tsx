import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { DeliveryClientPortal } from '@/delivery/DeliveryClientPortal';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCanvas: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@linaria/react', () => ({ styled: () => () => 'div' }));
const mockFetch = jest.fn();
const portal = {
  engagement: {
    name: 'Example brand',
    services: ['SEO'],
    scope: 'Monthly SEO',
    allowance: 'Weekly reports',
    contact: 'Account manager',
    revision: 1,
    fields: [{ id: 'website', label: 'Website', required: true }],
  },
  assets: [],
  submissions: [],
  shares: [
    {
      id: 'share-one',
      title: 'Report',
      kind: 'SUBMISSION',
      version: 3,
      content: 'Approved report',
      links: [],
      hasAsset: false,
      reviews: [],
    },
  ],
};
const originalFetch = global.fetch;
const setup = () => {
  window.history.replaceState(null, '', '/delivery-client#test-token');
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: '/delivery-client',
              element: (
                <>
                  <Link to="/outside">Leave workspace</Link>
                  <button type="button">Outside portal control</button>
                  <DeliveryClientPortal />
                </>
              ),
            },
            { path: '/outside', element: <h1>Outside workspace</h1> },
          ],
          { initialEntries: ['/delivery-client'] },
        )}
      />
    </I18nProvider>,
  );
};
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: async () => portal });
});
afterAll(() => {
  global.fetch = originalFetch;
});
it('requires a separate code and keeps the bearer credential out of the URL', async () => {
  setup();
  expect(mockFetch).not.toHaveBeenCalled();
  expect(window.location.hash).toBe('');
  await userEvent.type(screen.getByLabelText('Access code'), 'separate-code');
  await userEvent.click(screen.getByRole('button', { name: 'Open workspace' }));
  await screen.findByText('Example brand');
  expect(mockFetch.mock.calls[0][0]).toMatch(/\/delivery-client\/session$/);
  expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(
    'Bearer test-token:separate-code',
  );
  expect(screen.queryByText(/budget/i)).not.toBeInTheDocument();
});
it('submits the exact shared version identity and selected client decision', async () => {
  setup();
  await userEvent.type(screen.getByLabelText('Access code'), 'code');
  await userEvent.click(screen.getByRole('button', { name: 'Open workspace' }));
  await screen.findByText('Approved report');
  await userEvent.selectOptions(
    screen.getByLabelText('Your decision for this version'),
    'CHANGES_REQUESTED',
  );
  await userEvent.type(
    screen.getByLabelText('Comment', { exact: true }),
    'Please update the report',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Send review' }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toMatchObject({
    action: 'review',
    shareId: 'share-one',
    decision: 'CHANGES_REQUESTED',
    comment: 'Please update the report',
  });
});
it('clears the portal when access is revoked', async () => {
  setup();
  await userEvent.type(screen.getByLabelText('Access code'), 'code');
  await userEvent.click(screen.getByRole('button', { name: 'Open workspace' }));
  await screen.findByText('Approved report');
  mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Approved report')).not.toBeInTheDocument();
});
it('submits a scoped advertising request in cents and shows review status', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      ...portal,
      advertising: {
        currency: 'USD',
        channel: 'META',
        period: 'DAILY',
        requests: [
          {
            id: 'request',
            amount: 12345,
            currency: 'USD',
            channel: 'META',
            period: 'DAILY',
            status: 'REVIEW',
            createdAt: '2026-10-25T00:00:00Z',
          },
        ],
      },
    }),
  });
  setup();
  await userEvent.type(screen.getByLabelText('Access code'), 'code');
  await userEvent.click(screen.getByRole('button', { name: 'Open workspace' }));
  await screen.findByText('Advertising budget');
  await userEvent.type(
    screen.getByLabelText('Requested advertising budget'),
    '250.25',
  );
  await userEvent.type(
    screen.getByLabelText('Reason for change'),
    'Test campaign',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Request budget change' }),
  );
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toMatchObject({
    action: 'budget',
    amount: 25025,
    reason: 'Test campaign',
    revision: 1,
  });
});

const openPortal = async () => {
  const view = setup();
  await userEvent.type(screen.getByLabelText('Access code'), 'code');
  await userEvent.click(screen.getByRole('button', { name: 'Open workspace' }));
  await screen.findByText('Approved report');
  return view;
};
const result = (value: unknown) => ({ ok: true, json: async () => value });

it.each(['upload', 'download'] as const)(
  'clears private notes and data after a %s denial',
  async (operation) => {
    mockFetch.mockResolvedValue(
      result({
        ...portal,
        assets: [
          {
            id: 'asset',
            name: 'Brand guide.pdf',
            mimeType: 'application/pdf',
            size: 20,
            createdAt: '2026-11-03T00:00:00Z',
          },
        ],
      }),
    );
    await openPortal();
    await userEvent.type(
      screen.getByLabelText('Comment', { exact: true }),
      'Private local notes',
    );
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    if (operation === 'upload')
      await userEvent.upload(
        screen.getByLabelText(/Upload a logo/),
        new File(['pdf'], 'guide.pdf', { type: 'application/pdf' }),
      );
    else
      await userEvent.click(
        screen.getByRole('button', { name: 'Brand guide.pdf' }),
      );
    await screen.findByRole('button', { name: 'Open workspace' });
    expect(screen.queryByText('Approved report')).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue('Private local notes'),
    ).not.toBeInTheDocument();
    mockFetch.mockResolvedValueOnce(result(portal));
    await userEvent.click(
      screen.getByRole('button', { name: 'Open workspace' }),
    );
    expect(
      await screen.findByLabelText('Comment', { exact: true }),
    ).toHaveValue('');
  },
);

it('checks an exact saved review after a lost reply without sending a second response', async () => {
  await openPortal();
  await userEvent.type(
    screen.getByLabelText('Comment', { exact: true }),
    '  Exact original notes  ',
  );
  mockFetch.mockRejectedValueOnce(new Error('Network lost after commit'));
  await userEvent.click(screen.getByRole('button', { name: 'Send review' }));
  await screen.findByRole('button', {
    name: 'Check access and saved responses',
  });
  expect(screen.queryByText('Approved report')).not.toBeInTheDocument();
  expect(
    fireEvent(window, new Event('beforeunload', { cancelable: true })),
  ).toBe(false);
  const command = JSON.parse(mockFetch.mock.calls[1][1].body);
  mockFetch.mockResolvedValueOnce(
    result({
      ...portal,
      shares: [
        {
          ...portal.shares[0],
          reviews: [
            {
              id: command.requestId,
              decision: command.decision,
              comment: command.comment,
              at: '2026-11-03T00:00:00Z',
            },
          ],
        },
      ],
    }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Check access and saved responses' }),
  );
  await screen.findByText(
    'Your exact response is saved. You can review it in the history below.',
  );
  expect(screen.getByLabelText('Comment', { exact: true })).toHaveValue('');
  expect(
    mockFetch.mock.calls.filter(([, options]) => options.method === 'POST'),
  ).toHaveLength(1);
  expect(
    fireEvent(window, new Event('beforeunload', { cancelable: true })),
  ).toBe(true);
});

it('allows only the frozen original retry after a fresh exact not-found check', async () => {
  await openPortal();
  await userEvent.type(
    screen.getByLabelText('Comment', { exact: true }),
    'Original review',
  );
  mockFetch.mockRejectedValueOnce(new Error('Unknown response'));
  await userEvent.click(screen.getByRole('button', { name: 'Send review' }));
  const original = mockFetch.mock.calls[1][1].body;
  await screen.findByRole('button', {
    name: 'Check access and saved responses',
  });
  mockFetch.mockResolvedValueOnce(result(portal));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check access and saved responses' }),
  );
  await screen.findByRole('button', { name: 'Retry exact original response' });
  expect(screen.getByLabelText('Comment', { exact: true })).toBeDisabled();
  await userEvent.type(
    screen.getByLabelText('Comment', { exact: true }),
    'changed',
  );
  expect(screen.getByLabelText('Comment', { exact: true })).toHaveValue(
    'Original review',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry exact original response' }),
  );
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4));
  expect(mockFetch.mock.calls[3][1].body).toBe(original);
});

it('retains raw onboarding notes across a revision refresh until explicit replacement', async () => {
  await openPortal();
  await userEvent.type(screen.getByLabelText('Website *'), 'My original notes');
  mockFetch.mockResolvedValueOnce(
    result({
      ...portal,
      engagement: {
        ...portal.engagement,
        revision: 2,
        fields: [
          { id: 'positioning', label: 'Brand positioning', required: true },
        ],
      },
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText(/Your account manager updated this form/);
  expect(screen.getByLabelText('Website *')).toHaveValue('My original notes');
  expect(
    screen.queryByLabelText('Brand positioning *'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Submit brand information' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Discard answers and load current form',
    }),
  );
  expect(screen.getByLabelText('Brand positioning *')).toHaveValue('');
  expect(
    screen.queryByDisplayValue('My original notes'),
  ).not.toBeInTheDocument();
});

it('keeps hidden drafts through an outage and a cancelled navigation, then restores them on verification', async () => {
  await openPortal();
  await userEvent.type(
    screen.getByLabelText('Comment', { exact: true }),
    'Keep this review',
  );
  mockFetch.mockRejectedValueOnce(new Error('Offline'));
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByRole('button', {
    name: 'Check access and saved responses',
  });
  expect(
    screen.queryByDisplayValue('Keep this review'),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Leave workspace' }));
  await screen.findByRole('dialog', { name: 'Leave this client workspace?' });
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    screen.queryByRole('heading', { name: 'Outside workspace' }),
  ).not.toBeInTheDocument();
  mockFetch.mockResolvedValueOnce(result(portal));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check access and saved responses' }),
  );
  expect(await screen.findByLabelText('Comment', { exact: true })).toHaveValue(
    'Keep this review',
  );
});

it('cancels an already blocked navigation when a pending read confirms access loss', async () => {
  await openPortal();
  await userEvent.type(
    screen.getByLabelText('Comment', { exact: true }),
    'Private review',
  );
  let deny: (value: { ok: boolean; status: number }) => void = () => undefined;
  mockFetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        deny = resolve;
      }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await userEvent.click(screen.getByRole('link', { name: 'Leave workspace' }));
  await screen.findByRole('dialog', { name: 'Leave this client workspace?' });
  await act(async () => {
    deny({ ok: false, status: 404 });
  });
  await screen.findByRole('button', { name: 'Open workspace' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Outside workspace' }),
  ).not.toBeInTheDocument();
  expect(
    fireEvent(window, new Event('beforeunload', { cancelable: true })),
  ).toBe(true);
});

it('does not call an unmatched successful response saved or unlock a changed response', async () => {
  await openPortal();
  await userEvent.type(
    screen.getByLabelText('Comment', { exact: true }),
    'Requested wording',
  );
  mockFetch.mockImplementationOnce(
    async (_url: string, options: { body: string }) => {
      const command = JSON.parse(options.body);
      return result({
        ...portal,
        shares: [
          {
            ...portal.shares[0],
            reviews: [
              {
                id: command.requestId,
                at: '2026-11-03T00:00:00Z',
                decision: 'COMMENT',
                comment: 'Different saved wording',
              },
            ],
          },
        ],
      });
    },
  );
  await userEvent.click(screen.getByRole('button', { name: 'Send review' }));
  await screen.findByText(
    /This request identity has a different saved response/,
  );
  expect(
    screen.queryByText(/Your exact response is saved/),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Comment', { exact: true })).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Retry exact original response' }),
  ).not.toBeInTheDocument();
});

it('does not resurrect a withdrawn share draft if the same source later returns', async () => {
  await openPortal();
  await userEvent.type(
    screen.getByLabelText('Comment', { exact: true }),
    'Withdrawn private draft',
  );
  mockFetch.mockResolvedValueOnce(result({ ...portal, shares: [] }));
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText(
    'Your account manager will share approved work here.',
  );
  mockFetch.mockResolvedValueOnce(result(portal));
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByLabelText('Comment', { exact: true })).toHaveValue(
    '',
  );
});

it('recovers a budget by its client request UUID and original values without re-submitting', async () => {
  const advertising = {
    currency: 'USD',
    channel: 'META',
    period: 'DAILY',
    requests: [],
  };
  mockFetch.mockResolvedValue(result({ ...portal, advertising }));
  await openPortal();
  await userEvent.type(
    screen.getByLabelText('Requested advertising budget'),
    '1.01',
  );
  await userEvent.type(
    screen.getByLabelText('Reason for change'),
    'Original reason',
  );
  mockFetch.mockRejectedValueOnce(new Error('Reply lost'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Request budget change' }),
  );
  await screen.findByRole('button', {
    name: 'Check access and saved responses',
  });
  const command = JSON.parse(mockFetch.mock.calls[1][1].body);
  mockFetch.mockResolvedValueOnce(
    result({
      ...portal,
      advertising: {
        ...advertising,
        requests: [
          {
            id: 'internal-row',
            clientRequestId: command.requestId,
            clientRequestRevision: command.revision,
            amount: command.amount,
            reason: command.reason,
            channel: 'META',
            currency: 'USD',
            period: 'DAILY',
            status: 'REVIEW',
            createdAt: '2026-11-03T00:00:00Z',
          },
        ],
      },
    }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Check access and saved responses' }),
  );
  await screen.findByText(
    'Your exact response is saved. You can review it in the history below.',
  );
  expect(screen.getByLabelText('Requested advertising budget')).toHaveValue('');
  expect(
    mockFetch.mock.calls.filter(([, options]) => options.method === 'POST'),
  ).toHaveLength(1);
});

it('does not silently retarget a budget draft when currency or period changes', async () => {
  mockFetch.mockResolvedValue(
    result({
      ...portal,
      advertising: {
        currency: 'USD',
        channel: 'META',
        period: 'DAILY',
        requests: [],
      },
    }),
  );
  await openPortal();
  await userEvent.type(
    screen.getByLabelText('Requested advertising budget'),
    '250',
  );
  await userEvent.type(
    screen.getByLabelText('Reason for change'),
    'My daily campaign',
  );
  mockFetch.mockResolvedValueOnce(
    result({
      ...portal,
      engagement: { ...portal.engagement, revision: 2 },
      advertising: {
        currency: 'EUR',
        channel: 'META',
        period: 'LIFETIME',
        requests: [],
      },
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText(/The advertising settings changed/);
  expect(screen.getByLabelText('Requested advertising budget')).toHaveValue(
    '250',
  );
  expect(
    screen.getByRole('button', { name: 'Request budget change' }),
  ).toBeDisabled();
  expect(screen.getByText('META · USD · DAILY')).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Discard budget draft and use current settings',
    }),
  );
  expect(screen.getByLabelText('Requested advertising budget')).toHaveValue('');
  expect(screen.getByText('META · EUR · LIFETIME')).toBeInTheDocument();
});

it('cannot download an old portal response after its mounted credential owner is disposed', async () => {
  mockFetch.mockResolvedValue(
    result({ ...portal, shares: [{ ...portal.shares[0], hasAsset: true }] }),
  );
  const view = await openPortal();
  let finishBlob: (value: Blob) => void = () => undefined;
  mockFetch.mockResolvedValueOnce({
    ok: true,
    blob: () =>
      new Promise<Blob>((resolve) => {
        finishBlob = resolve;
      }),
  });
  const original = URL.createObjectURL;
  const createObjectURL = jest.fn();
  URL.createObjectURL = createObjectURL;
  try {
    await userEvent.click(
      screen.getByRole('button', { name: 'Download approved file' }),
    );
    view.unmount();
    await act(async () => {
      finishBlob(new Blob(['private previous portal']));
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  } finally {
    URL.createObjectURL = original;
  }
});

it('does not move initial page focus into an unchecked portal', () => {
  setup();
  expect(
    screen.getByRole('button', { name: 'Open workspace' }),
  ).not.toHaveFocus();
  expect(screen.getByLabelText('Access code')).not.toHaveFocus();
});

it.each([
  ['outage', 'Check access and saved responses'],
  ['denied', 'Open workspace'],
] as const)(
  'restores lost focus to the enabled recovery action when %s removes private content',
  async (failure, label) => {
    await openPortal();
    if (failure === 'outage')
      mockFetch.mockRejectedValueOnce(new Error('Offline'));
    else mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    const recovery = await screen.findByRole('button', { name: label });
    await waitFor(() => expect(recovery).toHaveFocus());
    expect(recovery).toBeEnabled();
    expect(screen.queryByText('Approved report')).not.toBeInTheDocument();
  },
);

it.each([
  ['outage', 'Check access and saved responses'],
  ['denied', 'Open workspace'],
] as const)(
  'preserves focus deliberately moved outside while a pending %s removes private content',
  async (failure, label) => {
    await openPortal();
    let finish: () => void = () => undefined;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = () =>
            failure === 'outage'
              ? reject(new Error('Offline'))
              : resolve({ ok: false, status: 403 });
        }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    const outside = screen.getByRole('button', {
      name: 'Outside portal control',
    });
    await userEvent.click(outside);
    expect(outside).toHaveFocus();
    await act(async () => finish());
    await screen.findByRole('button', { name: label });
    expect(outside).toHaveFocus();
    expect(screen.queryByText('Approved report')).not.toBeInTheDocument();
  },
);
