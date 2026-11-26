import { createHash } from 'node:crypto';

export const CLIENT_BUSINESS_PAYMENT_REF_TYPE = 'CLIENT_BUSINESS_PAYMENT';
export const CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX = 'client-business:';

const MICROS_PER_MINOR_UNIT = BigInt('10000');
const HALF_MINOR_UNIT_MICROS = BigInt('5000');

export const deterministicClientReceivableInvoiceId = (
  workspaceId: string,
  recordId: string,
): string => {
  const bytes = createHash('sha256')
    .update(`client-business-receivable:${workspaceId}:${recordId}`)
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const minorUnitsToMicros = (amountMinor: number): bigint =>
  BigInt(Math.round(amountMinor)) * MICROS_PER_MINOR_UNIT;

export const microsToMinorUnits = (amountMicros: string | bigint): number => {
  const value =
    typeof amountMicros === 'bigint' ? amountMicros : BigInt(amountMicros);
  if (value === BigInt('0')) return 0;
  const negative = value < BigInt('0');
  const abs = negative ? -value : value;
  const minor = (abs + HALF_MINOR_UNIT_MICROS) / MICROS_PER_MINOR_UNIT;
  return negative ? -Number(minor) : Number(minor);
};
