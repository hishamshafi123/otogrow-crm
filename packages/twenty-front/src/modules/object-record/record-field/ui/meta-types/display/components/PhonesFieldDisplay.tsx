import { useFieldFocus } from '@/object-record/record-field/ui/hooks/useFieldFocus';
import { usePhonesFieldDisplay } from '@/object-record/record-field/ui/meta-types/hooks/usePhonesFieldDisplay';
import { PhonesDisplay } from '@/ui/field/display/components/PhonesDisplay';
import { useLingui } from '@lingui/react/macro';
import React, { useContext } from 'react';
import {
  CoreObjectNameSingular,
  FieldMetadataSettingsOnClickAction,
} from 'twenty-shared/types';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

import { useOpenDialer } from '@/calling/hooks/useOpenDialer';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';

export const PhonesFieldDisplay = () => {
  const { fieldValue, fieldDefinition } = usePhonesFieldDisplay();
  const { copyToClipboard } = useCopyToClipboard();
  const { isFocused } = useFieldFocus();
  const { openDialer } = useOpenDialer();
  const { recordId } = useContext(FieldContext);
  const { objectNameSingular } = useRecordIndexContextOrThrow();

  const { t } = useLingui();

  const onClickAction = fieldDefinition.metadata.settings?.clickAction;

  const handleClick = async (
    phoneNumber: string,
    event: React.MouseEvent<HTMLElement>,
  ) => {
    if (onClickAction === FieldMetadataSettingsOnClickAction.COPY) {
      event.preventDefault();
      copyToClipboard(phoneNumber, t`Phone number copied to clipboard`);
    }
  };

  const handleCallClick = (phoneNumber: string) => {
    openDialer({
      phoneNumber,
      personId:
        objectNameSingular === CoreObjectNameSingular.Person ? recordId : null,
    });
  };

  return (
    <PhonesDisplay
      value={fieldValue}
      isFocused={isFocused}
      onPhoneNumberClick={handleClick}
      onCallNumberClick={handleCallClick}
    />
  );
};
