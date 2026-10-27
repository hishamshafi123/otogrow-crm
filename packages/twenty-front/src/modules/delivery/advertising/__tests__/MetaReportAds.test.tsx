import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetaReportAds } from '@/delivery/advertising/MetaReportAds';
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
let mockReady = true;
let mockError: Error | undefined;
let mockStalePage = false;
const mockVariables = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    scope: 'workspace',
    matches: () => mockReady,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    _document: unknown,
    options: { variables: { input: { id: string; offset: number } } },
  ) => {
    mockVariables(options.variables);
    const offset = mockStalePage ? 0 : options.variables.input.offset;
    return {
      error: mockError,
      refetch: mockRefetch,
      data: {
        deliveryMetaReport: {
          id: 'report',
          currency: 'USD',
          account: { actions: [{ action_type: 'lead', value: '3' }] },
          ads: [
            {
              ad_id: String(offset),
              ad_name: `Creative ${offset + 1}`,
              campaign_name: 'Fixture campaign',
              spend: '5',
              impressions: '100',
              clicks: '8',
              actions: [],
            },
          ],
          adCount: 51,
          adOffset: offset,
          nextOffset: offset === 0 ? 50 : null,
        },
      },
    };
  },
}));
const setup = () => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  render(
    <I18nProvider i18n={i18n}>
      <MetaReportAds id="report" />
    </I18nProvider>,
  );
};
beforeEach(() => {
  mockReady = true;
  mockError = undefined;
  mockStalePage = false;
  mockVariables.mockClear();
  mockRefetch.mockClear();
});
it('requests ad pages without changing report review and shows account events separately', async () => {
  setup();
  expect(screen.getByText('lead: 3')).toBeVisible();
  expect(screen.getByText('Creative 1')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Next ads' }));
  expect(mockVariables).toHaveBeenLastCalledWith(
    expect.objectContaining({ input: { id: 'report', offset: 50 } }),
  );
  expect(screen.getByText('Creative 51')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Next ads' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Previous ads' }));
  expect(screen.getByText('Creative 1')).toBeVisible();
});
it('does not show a prior page while the new page has not arrived', async () => {
  setup();
  mockStalePage = true;
  await userEvent.click(screen.getByRole('button', { name: 'Next ads' }));
  expect(screen.getByRole('status')).toHaveTextContent('Loading ad details');
  expect(screen.queryByText('Creative 1')).not.toBeInTheDocument();
});
it('hides stale details after a read failure and offers retry', async () => {
  mockError = new Error('Connection unavailable');
  setup();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'decision has not changed',
  );
  expect(screen.queryByText('Creative 1')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry ad details' }),
  );
  expect(mockRefetch).toHaveBeenCalled();
});
it('does not show report values while fresh access is unavailable', () => {
  mockReady = false;
  setup();
  expect(screen.getByRole('status')).toHaveTextContent('Loading ad details');
  expect(screen.queryByText('Creative 1')).not.toBeInTheDocument();
});
