import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_MEETING_AVAILABILITY } from '@/meeting-booking/graphql/meetingAvailability';
import { BOOK_MEETING } from '@/meeting-booking/graphql/mutations/bookMeeting';
import { type BookMeetingResult } from '@/meeting-booking/types/BookMeetingResult';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { Select } from '@/ui/input/components/Select';
import { GET_SETTER_PROFILES } from '@/settings/setters/graphql/queries/getSetterProfiles';
import { type SetterProfile } from '@/settings/setters/types/setters.types';

const StyledPanel = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: grid;
  gap: 16px;
  padding-top: 20px;
`;
const StyledFields = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
`;
const StyledSlots = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  max-height: 240px;
  overflow: auto;
`;
const StyledSlot = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font: inherit;
  padding: 12px;
  &[aria-pressed='true'] {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.color.blue};
  }
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
  }
`;
const StyledError = styled.p`
  color: ${themeCssVariables.color.red};
`;

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

type MeetingBookingPanelProps = { personId: string; onBooked: () => void };

export const MeetingBookingPanel = ({
  personId,
  onBooked,
}: MeetingBookingPanelProps) => {
  const { t } = useLingui();
  const client = useApolloCoreClient();
  const [date, setDate] = useState(today);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  const [selectedTime, setSelectedTime] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BookMeetingResult | null>(null);
  const members = useQuery<{ setterProfiles: SetterProfile[] }>(
    GET_SETTER_PROFILES,
  );
  const availability = useQuery<{
    meetingAvailability: {
      timeZone: string;
      slots: { startTime: string; endTime: string }[];
    };
  }>(GET_MEETING_AVAILABILITY, {
    client,
    variables: { input: { date, durationMinutes, startHour, endHour } },
    skip: !date || endHour <= startHour,
    fetchPolicy: 'network-only',
  });
  const timeZone = availability.data?.meetingAvailability.timeZone;
  const slots =
    date && endHour > startHour && !availability.error
      ? (availability.data?.meetingAvailability.slots ?? [])
      : [];
  const chosenSlot = slots.find((slot) => slot.startTime === selectedTime);
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(new Date(value));

  const book = async () => {
    if (!chosenSlot || booking) return;
    setBooking(true);
    setError('');
    try {
      const response = await client.mutate<{ bookMeeting: BookMeetingResult }>({
        mutation: BOOK_MEETING,
        variables: {
          input: {
            personId,
            startTime: chosenSlot.startTime,
            durationMinutes,
            ...(assigneeId ? { assigneeWorkspaceMemberId: assigneeId } : {}),
          },
        },
      });
      if (response.error) throw response.error;
      if (!response.data?.bookMeeting)
        throw new Error(
          t`The booking was not confirmed. Check your calendar before retrying.`,
        );
      setResult(response.data.bookMeeting);
      onBooked();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t`Could not book the meeting.`,
      );
      setSelectedTime('');
      void availability.refetch();
    } finally {
      setBooking(false);
    }
  };

  if (result)
    return (
      <StyledPanel>
        <h3>
          <Trans>Meeting booked</Trans>
        </h3>
        <p>
          {date} · {formatTime(selectedTime)} · {timeZone}
        </p>
        <p>
          <Trans>The calendar invitation has been sent.</Trans>
        </p>
        {result.warning && (
          <StyledError role="alert">{result.warning}</StyledError>
        )}
        {result.meetLink && (
          <a href={result.meetLink} target="_blank" rel="noreferrer">
            <Trans>Open Google Meet</Trans>
          </a>
        )}
        {result.htmlLink && (
          <a href={result.htmlLink} target="_blank" rel="noreferrer">
            <Trans>View calendar event</Trans>
          </a>
        )}
      </StyledPanel>
    );

  return (
    <StyledPanel aria-label={t`Book a meeting`}>
      <div>
        <h3>
          <Trans>Find a time to meet</Trans>
        </h3>
        <p>
          <Trans>
            Available times come from your primary Google calendar. The calendar
            is checked again before booking.
          </Trans>
        </p>
      </div>
      <StyledFields>
        <label>
          <Trans>Date</Trans>
          <SettingsTextInput
            instanceId="meta-meeting-date"
            type="date"
            value={date}
            disabled={booking}
            onChange={(value) => {
              setDate(value);
              setSelectedTime('');
            }}
          />
        </label>
        <Select
          dropdownId="meta-meeting-duration"
          label={t`Duration`}
          value={durationMinutes}
          disabled={booking}
          options={[15, 30, 45, 60].map((value) => ({
            value,
            label: t`${value} minutes`,
          }))}
          onChange={(value) => {
            setDurationMinutes(value);
            setSelectedTime('');
          }}
        />
        <Select
          dropdownId="meta-meeting-assignee"
          label={t`Assign meeting to`}
          disabled={booking || members.loading}
          value={assigneeId}
          options={[
            { value: '', label: t`Me — my calendar` },
            ...(members.data?.setterProfiles ?? []).map((member) => ({
              value: member.workspaceMemberId,
              label: member.memberName,
            })),
          ]}
          onChange={setAssigneeId}
        />
      </StyledFields>
      {assigneeId && (
        <p>
          <Trans>
            Your teammate will be invited and assigned a meeting task. Available
            times reflect your calendar only; their availability is not checked.
          </Trans>
        </p>
      )}
      {members.error && (
        <StyledError role="alert">
          <Trans>Could not load teammates. Retry by reopening this lead.</Trans>
        </StyledError>
      )}
      <details>
        <summary>
          <Trans>Meeting hours</Trans>
        </summary>
        <StyledFields>
          <Select
            dropdownId="meta-meeting-start"
            label={t`From`}
            value={startHour}
            disabled={booking}
            options={Array.from({ length: 24 }, (_, value) => ({
              value,
              label: `${String(value).padStart(2, '0')}:00`,
            }))}
            onChange={(value) => {
              setStartHour(value);
              setSelectedTime('');
            }}
          />
          <Select
            dropdownId="meta-meeting-end"
            label={t`Until`}
            value={endHour}
            disabled={booking}
            options={Array.from({ length: 24 }, (_, index) => ({
              value: index + 1,
              label: `${String(index + 1).padStart(2, '0')}:00`,
            }))}
            onChange={(value) => {
              setEndHour(value);
              setSelectedTime('');
            }}
          />
        </StyledFields>
      </details>
      {endHour <= startHour && (
        <StyledError role="alert">
          <Trans>End time must be after start time.</Trans>
        </StyledError>
      )}
      {availability.loading ? (
        <p role="status">
          <Trans>Checking your calendar…</Trans>
        </p>
      ) : availability.error ? (
        <StyledError role="alert">{availability.error.message}</StyledError>
      ) : (
        <>
          {timeZone && <p>{t`Times shown in ${timeZone}`}</p>}
          <StyledSlots role="group" aria-label={t`Available times`}>
            {slots.map((slot) => (
              <StyledSlot
                key={slot.startTime}
                type="button"
                disabled={booking}
                aria-pressed={slot.startTime === selectedTime}
                onClick={() => setSelectedTime(slot.startTime)}
              >
                {formatTime(slot.startTime)}
              </StyledSlot>
            ))}
          </StyledSlots>
          {date && slots.length === 0 && (
            <p>
              <Trans>
                No available times. Choose another day or adjust meeting hours.
              </Trans>
            </p>
          )}
        </>
      )}
      <Button
        title={t`Refresh availability`}
        disabled={
          booking || availability.loading || !date || endHour <= startHour
        }
        onClick={() => {
          setSelectedTime('');
          void availability.refetch();
        }}
      />
      {error && <StyledError role="alert">{error}</StyledError>}
      {chosenSlot && (
        <p>{t`Book ${date} at ${formatTime(chosenSlot.startTime)} for ${durationMinutes} minutes. Invitations will be emailed to the lead and selected teammate.`}</p>
      )}
      <Button
        title={booking ? t`Booking…` : t`Book meeting & send invitation`}
        variant="primary"
        disabled={
          booking ||
          availability.loading ||
          !!availability.error ||
          !chosenSlot ||
          endHour <= startHour
        }
        onClick={() => void book()}
      />
    </StyledPanel>
  );
};
