import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
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
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryClientPortal />
    </I18nProvider>,
  );
};
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
