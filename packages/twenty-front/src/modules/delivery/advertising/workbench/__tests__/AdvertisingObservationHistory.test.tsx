import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { NetworkStatus } from '@apollo/client';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvertisingObservationHistory } from '@/delivery/advertising/workbench/AdvertisingObservationHistory';
import {
  observationHistoryItem,
  observationReview,
  observationState,
  OBSERVATION_ACTOR,
  OBSERVATION_IDENTITY,
} from '@/delivery/advertising/workbench/__tests__/advertising-observation.fixtures';

let mockError: Error | undefined;
let mockForeignActor = false;
const mockRefetch = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    _query: unknown,
    options: { variables: { input: { after?: string | null } } },
  ) => {
    const after = options.variables.input.after;
    const items = after
      ? [
          {
            ...observationHistoryItem(),
            id: 'older',
            evidence: 'Earlier retained evidence',
          },
        ]
      : Array.from({ length: 25 }, (_, index) => ({
          ...observationHistoryItem(),
          id: `observation-${index}`,
          evidence: `Private evidence ${index}`,
          correctedById: index === 0 ? 'newer-correction' : null,
        }));
    return {
      loading: false,
      error: mockError,
      networkStatus: NetworkStatus.ready,
      refetch: mockRefetch,
      data: {
        deliveryAdvertisingObservations: {
          ...OBSERVATION_IDENTITY,
          actor: mockForeignActor
            ? { ...OBSERVATION_ACTOR, memberId: 'foreign' }
            : OBSERVATION_ACTOR,
          observedAt: '2020-02-23T00:00:00.000Z',
          scope: 'history',
          totalCount: 26,
          nextCursor: after ? null : 'opaque-next-page',
          items,
        },
      },
    };
  },
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock(
  '@/delivery/advertising/workbench/advertisingWorkbenchStyles',
  () => ({
    StyledAdvertisingFacts: 'dl',
    StyledAdvertisingText: 'p',
    StyledAdvertisingItem: 'article',
  }),
);
jest.mock('@/ui/field/display/components/DateTimeDisplay', () => ({
  DateTimeDisplay: ({ value }: { value: string }) => <time>{value}</time>,
}));
const properties = () => {
  const review = observationReview();
  return {
    state: observationState(),
    review,
    actionId: review.actions[0].id,
    enabled: true,
    onCorrect: jest.fn(),
  };
};
const view = (props: ReturnType<typeof properties>) => (
  <I18nProvider i18n={i18n}>
    <AdvertisingObservationHistory
      state={props.state}
      review={props.review}
      actionId={props.actionId}
      enabled={props.enabled}
      onCorrect={props.onCorrect}
    />
  </I18nProvider>
);
beforeEach(() => {
  i18n.load('en', {});
  i18n.activate('en');
  mockError = undefined;
  mockForeignActor = false;
  mockRefetch.mockReset();
});
it('pages bounded immutable history and offers corrections only for entries not already corrected', async () => {
  const props = properties();
  render(view(props));
  const user = userEvent.setup();
  expect(
    screen.getByText('Showing 25 of 26 observations, newest first.'),
  ).toBeInTheDocument();
  const entries = screen.getAllByRole('article');
  expect(
    within(entries[0]).queryByRole('button', {
      name: 'Correct this observation',
    }),
  ).not.toBeInTheDocument();
  await user.click(
    within(entries[1]).getByRole('button', {
      name: 'Correct this observation',
    }),
  );
  expect(props.onCorrect).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'observation-1', correctedById: null }),
  );
  await user.click(screen.getByRole('button', { name: 'Older observations' }));
  expect(
    screen.getByText('Showing 1 of 26 observations, newest first.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Earlier retained evidence')).toBeInTheDocument();
  expect(screen.queryByText('Private evidence 1')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Newest observations' }));
  expect(screen.getByText('Private evidence 1')).toBeInTheDocument();
});
it('never resurrects retained history under a failed read or mismatched identity', () => {
  const props = properties();
  const rendered = render(view(props));
  expect(screen.getByText('Private evidence 1')).toBeInTheDocument();
  mockError = new Error('Transport unavailable');
  rendered.rerender(view(props));
  expect(screen.queryByText('Private evidence 1')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('could not be verified');
  mockError = undefined;
  mockForeignActor = true;
  rendered.rerender(view(props));
  expect(screen.queryByText('Private evidence 1')).not.toBeInTheDocument();
  mockForeignActor = false;
  rendered.rerender(view({ ...props, enabled: false }));
  expect(screen.queryByText('Private evidence 1')).not.toBeInTheDocument();
});
