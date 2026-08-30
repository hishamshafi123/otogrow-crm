import {
  LEAD_SCORE_BAND_HOT_MIN,
  LEAD_SCORE_BAND_WARM_MIN,
  type LeadScoreBand,
} from 'src/modules/lead-scoring/constants/lead-scoring.constant';

export const computeLeadScoreBand = (
  leadScore: number | null | undefined,
): LeadScoreBand => {
  const score = leadScore ?? 0;

  if (score >= LEAD_SCORE_BAND_HOT_MIN) {
    return 'HOT';
  }

  if (score >= LEAD_SCORE_BAND_WARM_MIN) {
    return 'WARM';
  }

  return 'COLD';
};
