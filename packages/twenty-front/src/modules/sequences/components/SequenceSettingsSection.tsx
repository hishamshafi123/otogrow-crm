import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import {
  SEQUENCE_STATUSES,
  type Sequence,
  type SequenceStatus,
} from '@/sequences/types/Sequence';
import { AVAILABLE_TIMEZONE_OPTIONS } from '@/settings/experience/constants/AvailableTimezoneOptions';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';
import { TextInput } from '@/ui/input/components/TextInput';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { type SelectOption } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const StyledForm = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px;
  box-shadow:
    0 1px 2px ${themeCssVariables.color.transparent.gray2},
    0 8px 24px -18px ${themeCssVariables.color.transparent.gray5},
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  padding: 18px 20px;
`;

export const SequenceSettingsSection = ({
  sequence,
}: {
  sequence: Sequence;
}) => {
  const { t } = useLingui();
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueErrorSnackBar } = useSnackBar();

  const [dailySendCap, setDailySendCap] = useState(
    sequence.dailySendCap?.toString() ?? '',
  );

  const updateSequence = (
    updateOneRecordInput: Partial<Omit<Sequence, 'id'>>,
  ) => {
    updateOneRecord<Sequence>({
      objectNameSingular: CoreObjectNameSingular.Sequence,
      idToUpdate: sequence.id,
      updateOneRecordInput,
    }).catch(() =>
      enqueueErrorSnackBar({ message: t`Failed to save the sequence` }),
    );
  };

  const statusOptions: SelectOption<SequenceStatus>[] = SEQUENCE_STATUSES.map(
    (status) => ({ label: status, value: status }),
  );

  const persistDailySendCap = () => {
    const parsedValue = dailySendCap === '' ? null : Number(dailySendCap);

    if (parsedValue !== null && Number.isNaN(parsedValue)) {
      enqueueErrorSnackBar({ message: t`Daily send cap must be a number` });

      return;
    }

    if (parsedValue === sequence.dailySendCap) {
      return;
    }

    updateSequence({ dailySendCap: parsedValue });
  };

  return (
    <Section>
      <H2Title title={t`Settings`} />
      <StyledForm>
        <Select
          dropdownId="sequence-settings-status"
          label={t`Status`}
          fullWidth
          value={sequence.status}
          options={statusOptions}
          onChange={(status) => updateSequence({ status })}
        />
        <TextInput
          label={t`Daily send cap`}
          placeholder={t`Unlimited`}
          value={dailySendCap}
          onChange={setDailySendCap}
          onBlur={persistDailySendCap}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              persistDailySendCap();
            }
          }}
          fullWidth
        />
        <Select
          dropdownId="sequence-settings-timezone"
          label={t`Business hours time zone`}
          dropdownWidthAuto
          fullWidth
          value={sequence.businessHoursTimeZone ?? ''}
          emptyOption={{ label: t`No business hours`, value: '' }}
          options={AVAILABLE_TIMEZONE_OPTIONS as SelectOption<string>[]}
          onChange={(timeZone) =>
            updateSequence({
              businessHoursTimeZone: timeZone === '' ? null : timeZone,
            })
          }
          withSearchInput
        />
      </StyledForm>
    </Section>
  );
};
