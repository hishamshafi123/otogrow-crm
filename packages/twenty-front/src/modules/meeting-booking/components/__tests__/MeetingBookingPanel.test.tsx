import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { MeetingBookingPanel } from '@/meeting-booking/components/MeetingBookingPanel';
import { GET_MEETING_AVAILABILITY } from '@/meeting-booking/graphql/meetingAvailability';

const mockMutate = jest.fn();
const mockRefetch = jest.fn();
const mockOnBooked = jest.fn();
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ mutate: mockMutate }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (query: unknown) =>
    query === GET_MEETING_AVAILABILITY
      ? {
          data: {
            meetingAvailability: {
              timeZone: 'UTC',
              slots: [
                {
                  startTime: '2030-01-07T09:00:00Z',
                  endTime: '2030-01-07T09:30:00Z',
                },
              ],
            },
          },
          refetch: mockRefetch,
          loading: false,
        }
      : { data: { setterProfiles: [] }, loading: false },
}));

const setup = () =>
  render(
    <Provider store={createStore()}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider colorScheme="light">
          <MeetingBookingPanel personId="person-1" onBooked={mockOnBooked} />
        </ThemeProvider>
      </I18nProvider>
    </Provider>,
  );

describe('Meeting slot picker', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockRefetch.mockReset();
    mockOnBooked.mockReset();
  });

  it('requires a selected slot and submits the exact available time', async () => {
    mockMutate.mockResolvedValue({
      data: {
        bookMeeting: {
          eventId: 'event',
          meetLink: 'https://meet.google.com/example',
          htmlLink: null,
        },
      },
    });
    setup();
    const user = userEvent.setup();
    expect(
      screen.getByRole('button', { name: /Book meeting & send invitation/ }),
    ).toBeDisabled();
    await user.click(
      within(screen.getByRole('group', { name: 'Available times' })).getByRole(
        'button',
        { name: /9:00/ },
      ),
    );
    await user.click(
      screen.getByRole('button', { name: /Book meeting & send invitation/ }),
    );
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: {
            personId: 'person-1',
            startTime: '2030-01-07T09:00:00Z',
            durationMinutes: 30,
          },
        },
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Meeting booked' }),
    ).toBeInTheDocument();
    expect(mockOnBooked).toHaveBeenCalledTimes(1);
  });

  it('shows a booking conflict and requires a new slot selection', async () => {
    mockMutate.mockRejectedValue(
      new Error('This time is no longer available.'),
    );
    setup();
    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole('group', { name: 'Available times' })).getByRole(
        'button',
        { name: /9:00/ },
      ),
    );
    await user.click(
      screen.getByRole('button', { name: /Book meeting & send invitation/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'no longer available',
    );
    expect(
      screen.getByRole('button', { name: /Book meeting & send invitation/ }),
    ).toBeDisabled();
    expect(mockRefetch).toHaveBeenCalled();
    expect(mockOnBooked).not.toHaveBeenCalled();
  });
});
