import { isNonEmptyString } from '@sniptt/guards';
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { type PhonesMetadata } from 'twenty-shared/types';

export const stripWhatsappPrefix = (address: string): string =>
  address.replace(/^whatsapp:/i, '');

// Twilio addresses arrive as "whatsapp:+1415..." while stored person phones are
// split into calling code + national number; everything funnels through E.164.
export const normalizeToE164 = (rawNumber: string): string | null => {
  const withoutPrefix = stripWhatsappPrefix(rawNumber).trim();

  if (!isNonEmptyString(withoutPrefix)) {
    return null;
  }

  const candidate = withoutPrefix.startsWith('+')
    ? withoutPrefix
    : `+${withoutPrefix.replace(/\D/g, '')}`;

  try {
    const phone = parsePhoneNumberWithError(candidate);

    return phone.isValid() ? phone.number : null;
  } catch {
    return null;
  }
};

export const buildE164FromPhones = (
  phones: PhonesMetadata | null | undefined,
): string | null => {
  const number = phones?.primaryPhoneNumber;

  if (!isNonEmptyString(number)) {
    return null;
  }

  if (number.trim().startsWith('+')) {
    return normalizeToE164(number);
  }

  const callingCodeDigits = (phones?.primaryPhoneCallingCode ?? '').replace(
    /\D/g,
    '',
  );

  return normalizeToE164(`+${callingCodeDigits}${number.replace(/\D/g, '')}`);
};

export type E164MatchVariants = {
  e164: string;
  nationalNumber: string;
  countryCallingCode: string;
};

// Person rows predate strict E.164 storage, so inbound matching tries the
// national number against phonesPrimaryPhoneNumber as well as the full form.
export const getE164MatchVariants = (
  rawNumber: string,
): E164MatchVariants | null => {
  const e164 = normalizeToE164(rawNumber);

  if (!e164) {
    return null;
  }

  const phone = parsePhoneNumberWithError(e164);

  return {
    e164,
    nationalNumber: phone.nationalNumber,
    countryCallingCode: phone.countryCallingCode,
  };
};
