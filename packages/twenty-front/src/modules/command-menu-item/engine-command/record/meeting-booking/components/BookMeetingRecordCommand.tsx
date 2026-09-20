import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';

import { useUnmountCommand } from '@/command-menu-item/engine-command/hooks/useUnmountEngineCommand';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { CommandComponentInstanceContext } from '@/command-menu-item/engine-command/states/contexts/CommandComponentInstanceContext';
import { useBookMeeting } from '@/meeting-booking/hooks/useBookMeeting';
import { Select } from '@/ui/input/components/Select';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';

const BOOK_MEETING_MODAL_ID = 'book-meeting-modal';

const DURATION_OPTIONS: SelectOption<string>[] = [
  { label: '15 min', value: '15' },
  { label: '30 min', value: '30' },
  { label: '45 min', value: '45' },
  { label: '60 min', value: '60' },
];

// datetime-local inputs work on local wall-clock time without a timezone
// designator, so the default is formatted from local parts.
const getDefaultStartTime = () => {
  const nextRoundHour = new Date();

  nextRoundHour.setMinutes(0, 0, 0);
  nextRoundHour.setHours(nextRoundHour.getHours() + 1);

  const pad = (value: number) => String(value).padStart(2, '0');

  return `${nextRoundHour.getFullYear()}-${pad(nextRoundHour.getMonth() + 1)}-${pad(nextRoundHour.getDate())}T${pad(nextRoundHour.getHours())}:${pad(nextRoundHour.getMinutes())}`;
};

const StyledBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  margin-top: ${themeCssVariables.spacing[4]};
`;

const StyledFieldLabel = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledDateTimeInput = styled.input`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  margin-top: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
  width: 100%;
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[6]};

  > div {
    flex: 1;
  }
`;

export const BookMeetingRecordCommand = () => {
  const { t } = useLingui();
  const { selectedRecords } = useHeadlessCommandContextApi();
  const { openModal, closeModal } = useModal();
  const commandMenuItemId = useAvailableComponentInstanceIdOrThrow(
    CommandComponentInstanceContext,
  );
  const unmountCommand = useUnmountCommand();

  const [startTime, setStartTime] = useState(getDefaultStartTime);
  const [durationMinutes, setDurationMinutes] = useState('30');

  const { bookMeeting, loading } = useBookMeeting();

  const personId = selectedRecords[0]?.id;

  const closeAndUnmount = () => {
    closeModal(BOOK_MEETING_MODAL_ID);
    unmountCommand(commandMenuItemId);
  };

  useEffect(() => {
    openModal(BOOK_MEETING_MODAL_ID);
    // The modal is opened once on command mount; later renders must not
    // re-open it after the user closed it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBook = async () => {
    const booked = await bookMeeting({
      personId,
      startTime: new Date(startTime).toISOString(),
      durationMinutes: Number(durationMinutes),
    });

    if (booked !== null) {
      closeAndUnmount();
    }
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={BOOK_MEETING_MODAL_ID}
      isClosable={true}
      onClose={closeAndUnmount}
      size="medium"
      padding="large"
      dataGloballyPreventClickOutside
      renderInDocumentBody
    >
      <H1Title title={t`Book meeting`} fontColor={H1TitleFontColor.Primary} />
      <StyledBody>
        <div>
          <StyledFieldLabel htmlFor="book-meeting-start-time">
            {t`Date and time`}
          </StyledFieldLabel>
          <StyledDateTimeInput
            id="book-meeting-start-time"
            type="datetime-local"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </div>
        <Select
          dropdownId="book-meeting-duration"
          label={t`Duration`}
          fullWidth
          value={durationMinutes}
          options={DURATION_OPTIONS}
          onChange={setDurationMinutes}
          isDropdownInModal
        />
      </StyledBody>
      <StyledActions>
        <Button
          variant="secondary"
          title={t`Cancel`}
          fullWidth
          justify="center"
          onClick={closeAndUnmount}
        />
        <Button
          variant="primary"
          title={t`Book`}
          fullWidth
          justify="center"
          disabled={loading || startTime.length === 0}
          onClick={handleBook}
        />
      </StyledActions>
    </ModalStatefulWrapper>
  );
};
