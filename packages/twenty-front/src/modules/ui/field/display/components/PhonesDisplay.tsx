import { t } from '@lingui/core/macro';
import React, { useMemo } from 'react';

import { type FieldPhonesValue } from '@/object-record/record-field/ui/types/FieldMetadata';
import { ExpandableList } from '@/ui/layout/expandable-list/components/ExpandableList';

import { styled } from '@linaria/react';
import { parsePhoneNumber } from 'libphonenumber-js';
import { isDefined } from 'twenty-shared/utils';
import { IconPhone } from 'twenty-ui/icon';
import { RoundedLink } from 'twenty-ui/navigation';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { logError } from '~/utils/logError';

type PhonesDisplayProps = {
  value?: FieldPhonesValue;
  isFocused?: boolean;
  onPhoneNumberClick?: (
    phoneNumber: string,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  onCallNumberClick?: (phoneNumber: string) => void;
};

const StyledContainer = styled.div`
  align-items: center;
  display: flex;
  gap: 4px;
  justify-content: flex-start;

  max-width: 100%;

  overflow: hidden;

  width: 100%;
`;

const StyledNumberRow = styled.span`
  align-items: center;
  display: inline-flex;
  gap: 2px;
`;

const StyledCallButton = styled.button`
  align-items: center;
  background: transparent;
  border: none;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: inline-flex;
  padding: 2px;

  &:hover {
    color: ${themeCssVariables.color.blue};
  }
`;

export const PhonesDisplay = ({
  value,
  isFocused,
  onPhoneNumberClick,
  onCallNumberClick,
}: PhonesDisplayProps) => {
  const phones = useMemo(
    () =>
      [
        value?.primaryPhoneNumber
          ? {
              number: value.primaryPhoneNumber,
              callingCode:
                value.primaryPhoneCallingCode ||
                value.primaryPhoneCountryCode ||
                '',
            }
          : null,
        ...parseAdditionalPhones(value?.additionalPhones),
      ]
        .filter(isDefined)
        .map(({ number, callingCode }) => {
          return {
            number,
            callingCode,
          };
        }),
    [
      value?.primaryPhoneNumber,
      value?.primaryPhoneCallingCode,
      value?.primaryPhoneCountryCode,
      value?.additionalPhones,
    ],
  );
  const parsePhoneNumberOrReturnInvalidValue = (number: string) => {
    try {
      return { parsedPhone: parsePhoneNumber(number) };
    } catch {
      return { invalidPhone: number };
    }
  };

  return isFocused ? (
    <ExpandableList isChipCountDisplayed>
      {phones.map(({ number, callingCode }, index) => {
        const { parsedPhone, invalidPhone } =
          parsePhoneNumberOrReturnInvalidValue(callingCode + number);
        const URI = parsedPhone?.getURI();
        return (
          <StyledNumberRow key={index}>
            <RoundedLink
              href={URI || ''}
              label={
                parsedPhone ? parsedPhone.formatInternational() : invalidPhone
              }
              onClick={(event) =>
                onPhoneNumberClick?.(callingCode + number, event)
              }
            />
            {isDefined(onCallNumberClick) && (
              <StyledCallButton
                type="button"
                onClick={() => onCallNumberClick(callingCode + number)}
                aria-label={t`Call this number`}
              >
                <IconPhone size={14} />
              </StyledCallButton>
            )}
          </StyledNumberRow>
        );
      })}
    </ExpandableList>
  ) : (
    <StyledContainer>
      {phones.map(({ number, callingCode }, index) => {
        const { parsedPhone, invalidPhone } =
          parsePhoneNumberOrReturnInvalidValue(callingCode + number);
        const URI = parsedPhone?.getURI();
        return (
          <StyledNumberRow key={index}>
            <RoundedLink
              href={URI || ''}
              label={
                parsedPhone ? parsedPhone.formatInternational() : invalidPhone
              }
              onClick={(event) =>
                onPhoneNumberClick?.(callingCode + number, event)
              }
            />
            {isDefined(onCallNumberClick) && (
              <StyledCallButton
                type="button"
                onClick={() => onCallNumberClick(callingCode + number)}
                aria-label={t`Call this number`}
              >
                <IconPhone size={14} />
              </StyledCallButton>
            )}
          </StyledNumberRow>
        );
      })}
    </StyledContainer>
  );
};

const parseAdditionalPhones = (additionalPhones?: any) => {
  if (!additionalPhones) {
    return [];
  }

  if (typeof additionalPhones === 'object') {
    return additionalPhones;
  }

  if (typeof additionalPhones === 'string') {
    try {
      return JSON.parse(additionalPhones);
    } catch (error) {
      logError(t`Error parsing additional phones: ${String(error)}`);
    }
  }

  return [];
};
