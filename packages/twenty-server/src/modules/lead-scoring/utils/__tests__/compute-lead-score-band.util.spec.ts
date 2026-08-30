import { computeLeadScoreBand } from 'src/modules/lead-scoring/utils/compute-lead-score-band.util';

describe('computeLeadScoreBand', () => {
  it.each([
    [null, 'COLD'],
    [undefined, 'COLD'],
    [-10, 'COLD'],
    [0, 'COLD'],
    [19, 'COLD'],
    [20, 'WARM'],
    [49, 'WARM'],
    [50, 'HOT'],
    [120, 'HOT'],
  ] as const)('maps score %s to %s', (leadScore, expectedBand) => {
    expect(computeLeadScoreBand(leadScore)).toBe(expectedBand);
  });
});
