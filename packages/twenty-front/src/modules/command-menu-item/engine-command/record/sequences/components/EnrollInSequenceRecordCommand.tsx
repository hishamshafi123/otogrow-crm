import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useEffect, useState } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useUnmountCommand } from '@/command-menu-item/engine-command/hooks/useUnmountEngineCommand';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { CommandComponentInstanceContext } from '@/command-menu-item/engine-command/states/contexts/CommandComponentInstanceContext';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useEnrollInSequence } from '@/sequences/hooks/useEnrollInSequence';
import { type Sequence } from '@/sequences/types/Sequence';
import { Select } from '@/ui/input/components/Select';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H1Title, H1TitleFontColor } from 'twenty-ui/typography';

const ENROLL_IN_SEQUENCE_MODAL_ID = 'enroll-in-sequence-modal';

const StyledBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  margin-top: ${themeCssVariables.spacing[4]};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[6]};

  > div {
    flex: 1;
  }
`;

export const EnrollInSequenceRecordCommand = () => {
  const { t } = useLingui();
  const { selectedRecords } = useHeadlessCommandContextApi();
  const { openModal, closeModal } = useModal();
  const commandMenuItemId = useAvailableComponentInstanceIdOrThrow(
    CommandComponentInstanceContext,
  );
  const unmountCommand = useUnmountCommand();

  const [selectedSequenceId, setSelectedSequenceId] = useState('');

  const { records: activeSequences } = useFindManyRecords<Sequence>({
    objectNameSingular: CoreObjectNameSingular.Sequence,
    filter: { status: { eq: 'ACTIVE' } },
    orderBy: [{ name: 'AscNullsFirst' }],
  });

  const { enrollInSequence, loading } = useEnrollInSequence();

  const personIds = selectedRecords.map((record) => record.id);

  const closeAndUnmount = () => {
    closeModal(ENROLL_IN_SEQUENCE_MODAL_ID);
    unmountCommand(commandMenuItemId);
  };

  useEffect(() => {
    openModal(ENROLL_IN_SEQUENCE_MODAL_ID);
    // The modal is opened once on command mount; later renders must not
    // re-open it after the user closed it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    const enrolled = await enrollInSequence({
      sequenceId: selectedSequenceId,
      personIds,
    });

    if (enrolled) {
      closeAndUnmount();
    }
  };

  const sequenceOptions: SelectOption<string>[] = (activeSequences ?? []).map(
    (sequence) => ({ label: sequence.name, value: sequence.id }),
  );

  return (
    <ModalStatefulWrapper
      modalInstanceId={ENROLL_IN_SEQUENCE_MODAL_ID}
      isClosable={true}
      onClose={closeAndUnmount}
      size="medium"
      padding="large"
      dataGloballyPreventClickOutside
      renderInDocumentBody
    >
      <H1Title
        title={t`Enroll in sequence`}
        fontColor={H1TitleFontColor.Primary}
      />
      <StyledBody>
        <Select
          dropdownId="enroll-in-sequence-picker"
          label={t`Sequence`}
          fullWidth
          value={selectedSequenceId}
          emptyOption={{ label: t`Select a sequence`, value: '' }}
          options={sequenceOptions}
          onChange={setSelectedSequenceId}
          withSearchInput
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
          title={t`Enroll`}
          fullWidth
          justify="center"
          disabled={!isNonEmptyString(selectedSequenceId) || loading}
          onClick={handleConfirm}
        />
      </StyledActions>
    </ModalStatefulWrapper>
  );
};
