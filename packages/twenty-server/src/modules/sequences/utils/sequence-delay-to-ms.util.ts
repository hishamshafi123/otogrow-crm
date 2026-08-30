import { type SequenceDelayUnit } from 'src/modules/sequences/constants/sequence-delay-unit.constant';

export const sequenceDelayToMs = (
  delayValue: number,
  delayUnit: SequenceDelayUnit,
): number => {
  switch (delayUnit) {
    case 'MINUTES':
      return delayValue * 60 * 1000;
    case 'HOURS':
      return delayValue * 60 * 60 * 1000;
    case 'DAYS':
      return delayValue * 24 * 60 * 60 * 1000;
  }
};
