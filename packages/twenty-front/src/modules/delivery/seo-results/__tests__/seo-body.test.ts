import {
  canonicalSeoBody,
  newSeoBody,
  seoBodyValid,
} from '@/delivery/seo-results/seo-body';
import {
  seoDestination,
  seoSelectionValid,
} from '@/delivery/seo-results/seo-navigation';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const METRIC_ID = '22222222-2222-4222-8222-222222222222';
const body = () => ({
  ...newSeoBody(),
  title: 'Weekly report',
  ownerId: OWNER_ID,
  periodStart: '2026-10-19',
  periodEnd: '2026-10-25',
});
const metric = () => ({
  id: METRIC_ID,
  key: 'CLICKS',
  label: 'Organic clicks',
  unit: 'COUNT',
  value: '0',
  unknownReason: '',
  source: 'SEARCH_CONSOLE',
  sourceUrl: 'https://search.google.com/search-console',
  property: 'https://example.com',
  segment: 'All web search',
  definition: 'Reported clicks in the selected period',
  observedAt: '2026-10-26T06:00:00+03:00',
});
it('distinguishes recorded zero from unknown and requires evidence for either', () => {
  expect(seoBodyValid({ ...body(), metrics: [metric()] })).toBe(true);
  expect(
    seoBodyValid({ ...body(), metrics: [{ ...metric(), value: null }] }),
  ).toBe(false);
  expect(
    seoBodyValid({
      ...body(),
      metrics: [
        {
          ...metric(),
          value: null,
          unknownReason: 'Property access is pending',
        },
      ],
    }),
  ).toBe(true);
  expect(
    seoBodyValid({ ...body(), metrics: [{ ...metric(), value: '1.2' }] }),
  ).toBe(false);
});
it('accepts a real calendar month and refuses incomplete windows', () => {
  expect(
    seoBodyValid({
      ...body(),
      period: 'MONTHLY',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    }),
  ).toBe(true);
  expect(seoBodyValid({ ...body(), periodEnd: '2026-10-24' })).toBe(false);
  expect(seoBodyValid({ ...body(), timezone: 'Unknown/Timezone' })).toBe(false);
});
it('creates strict canonical input without transporting GraphQL response metadata', () => {
  const taggedBody = {
    ...body(),
    __typename: 'DeliverySeoBody',
    metrics: [{ ...metric(), __typename: 'DeliverySeoMetric' }],
    tasks: [
      {
        taskId: METRIC_ID,
        revision: 3,
        __typename: 'DeliverySeoTaskReference',
      },
    ],
  };
  const result = canonicalSeoBody(taggedBody);
  expect(JSON.stringify(result)).not.toContain('__typename');
  expect(result.metrics[0].value).toBe('0');
  expect(result.tasks).toEqual([{ taskId: METRIC_ID, revision: 3 }]);
});
it('binds command recovery to a valid selected project and report', () => {
  expect(
    seoSelectionValid(
      new URLSearchParams(
        `view=seo&seoProject=${OWNER_ID}&seoReport=${METRIC_ID}&seoRequest=${OWNER_ID}&seoMode=new`,
      ),
    ),
  ).toBe(true);
  expect(
    seoSelectionValid(new URLSearchParams(`view=seo&seoReport=${METRIC_ID}`)),
  ).toBe(false);
  expect(
    seoSelectionValid(
      new URLSearchParams(
        `seoProject=${OWNER_ID}&seoReport=${METRIC_ID}&seoVersion=1&seoRequest=${OWNER_ID}&seoMode=edit`,
      ),
    ),
  ).toBe(false);
  expect(
    seoDestination(
      new URLSearchParams(
        `view=seo&seoProject=${OWNER_ID}&seoAfter=${METRIC_ID}`,
      ),
      { seoAfter: null },
    ),
  ).toContain(`seoProject=${OWNER_ID}`);
});
