import { type CountryCode } from 'libphonenumber-js';

import {
  buildE164FromPhones,
  getE164MatchVariants,
  normalizeToE164,
  stripWhatsappPrefix,
} from 'src/modules/messaging/channels/utils/normalize-phone-number.util';

describe('stripWhatsappPrefix', () => {
  it('should strip the whatsapp: prefix case-insensitively', () => {
    expect(stripWhatsappPrefix('whatsapp:+14155551234')).toBe('+14155551234');
    expect(stripWhatsappPrefix('WhatsApp:+14155551234')).toBe('+14155551234');
    expect(stripWhatsappPrefix('+14155551234')).toBe('+14155551234');
  });
});

describe('normalizeToE164', () => {
  it('should normalize an E.164 number', () => {
    expect(normalizeToE164('+14155551234')).toBe('+14155551234');
  });

  it('should normalize a whatsapp:-prefixed number', () => {
    expect(normalizeToE164('whatsapp:+14155551234')).toBe('+14155551234');
  });

  it('should normalize digits without a leading plus as international', () => {
    expect(normalizeToE164('14155551234')).toBe('+14155551234');
  });

  it('should return null for invalid numbers', () => {
    expect(normalizeToE164('not-a-number')).toBeNull();
    expect(normalizeToE164('')).toBeNull();
    expect(normalizeToE164('+1')).toBeNull();
  });
});

describe('buildE164FromPhones', () => {
  it('should combine calling code and national number', () => {
    expect(
      buildE164FromPhones({
        primaryPhoneNumber: '4155551234',
        primaryPhoneCountryCode: 'US' as CountryCode,
        primaryPhoneCallingCode: '+1',
        additionalPhones: null,
      }),
    ).toBe('+14155551234');
  });

  it('should accept a number already stored with a leading plus', () => {
    expect(
      buildE164FromPhones({
        primaryPhoneNumber: '+14155551234',
        primaryPhoneCountryCode: 'US' as CountryCode,
        primaryPhoneCallingCode: '+1',
        additionalPhones: null,
      }),
    ).toBe('+14155551234');
  });

  it('should return null when the person has no phone number', () => {
    expect(buildE164FromPhones(null)).toBeNull();
    expect(
      buildE164FromPhones({
        primaryPhoneNumber: '',
        primaryPhoneCountryCode: '' as CountryCode,
        primaryPhoneCallingCode: '',
        additionalPhones: null,
      }),
    ).toBeNull();
  });
});

describe('getE164MatchVariants', () => {
  it('should expose national number and calling code for matching', () => {
    expect(getE164MatchVariants('whatsapp:+14155551234')).toEqual({
      e164: '+14155551234',
      nationalNumber: '4155551234',
      countryCallingCode: '1',
    });
  });

  it('should return null for unparseable numbers', () => {
    expect(getE164MatchVariants('whatsapp:abc')).toBeNull();
  });
});
