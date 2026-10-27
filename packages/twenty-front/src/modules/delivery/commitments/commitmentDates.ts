import { Temporal } from 'temporal-polyfill';
import { isDateWithoutTime } from 'twenty-shared/utils';

const shiftCommitmentDate = (
  value: string | null | undefined,
  days: number,
) => {
  if (!value || !isDateWithoutTime(value)) return null;
  try {
    const shifted = Temporal.PlainDate.from(value).add({ days }).toString();
    return isDateWithoutTime(shifted) ? shifted : null;
  } catch {
    return null;
  }
};
export const commitmentLastDay = (
  endDateExclusive: string | null | undefined,
) => shiftCommitmentDate(endDateExclusive, -1);
export const commitmentEndExclusive = (lastDay: string | null | undefined) =>
  shiftCommitmentDate(lastDay, 1);
