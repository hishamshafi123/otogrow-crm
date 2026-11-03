import {
  advertisingCloseCommand,
  advertisingDestination,
  readAdvertisingNavigation,
} from '@/delivery/advertising/workbench/advertising-navigation';

const SOURCE_ID = '30000000-0000-4000-8000-000000000001';
const REQUEST_ID = '30000000-0000-4000-8000-000000000002';
it('keeps report and library filters when closing a command', () => {
  const params = new URLSearchParams(
    `view=ads&adSource=META&adReport=${SOURCE_ID}&adRequest=${REQUEST_ID}&adMode=review&adSearch=launch&adAfter=page`,
  );
  const result = new URL(
    advertisingDestination(params, advertisingCloseCommand),
    'http://local',
  );
  expect(result.searchParams.get('adReport')).toBe(SOURCE_ID);
  expect(result.searchParams.get('adSearch')).toBe('launch');
  expect(result.searchParams.get('adAfter')).toBe('page');
  expect(result.searchParams.has('adRequest')).toBe(false);
});
it.each([
  `adReport=${SOURCE_ID}`,
  `adSource=META&adReport=${SOURCE_ID}&adMode=review`,
  'adFrom=2026-02-30',
  'adFrom=2026-11-01&adThrough=2026-10-31',
])(
  'rejects incomplete command/source selections or invalid calendars: %s',
  (query) => {
    expect(readAdvertisingNavigation(new URLSearchParams(query)).success).toBe(
      false,
    );
  },
);
it('accepts a stable command identity before any save occurs', () => {
  expect(
    readAdvertisingNavigation(
      new URLSearchParams(
        `adSource=MANUAL&adReport=${SOURCE_ID}&adReview=${SOURCE_ID}&adRequest=${REQUEST_ID}&adMode=review`,
      ),
    ).success,
  ).toBe(true);
});
