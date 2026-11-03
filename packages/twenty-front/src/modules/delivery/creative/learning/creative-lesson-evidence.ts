import { type CreativeLearningBody } from '@/delivery/creative/learning/creative-learning.types';
export type CreativeLessonSelection = {
  id: string;
  version: number;
  fingerprint: string;
  body: CreativeLearningBody;
  title: string;
};
export const areCreativeLessonMeasuresComparable = (
  items: CreativeLessonSelection[],
) => {
  if (items.length === 0) return false;
  const signatures = items.map(({ body }) => {
    const goal = body.goalSnapshot,
      source = body.source;
    if (
      goal.provenance !== 'REPORT' ||
      goal.value == null ||
      goal.metricProvenance !== 'PLATFORM_REPORTED' ||
      !source.accountId ||
      !source.timezone
    )
      return null;
    const metric = goal.metricKey?.match(
      /^ad:[a-f0-9]{24}:(actions|action_values):([a-f0-9]{32})$/,
    );
    if (!metric) return null;
    return JSON.stringify([
      goal.kind,
      goal.metricUnit,
      goal.metricProvenance,
      source.currency,
      source.accountId,
      source.timezone,
      metric[1],
      metric[2],
    ]);
  });
  return (
    signatures[0] !== null &&
    signatures.every((signature) => signature === signatures[0])
  );
};
