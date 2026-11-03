import { advertisingReportDestination } from '@/delivery/advertising/advertising-report-destination';

const REPORT = '5a5adf3e-cbb0-4235-8de7-25d5b5072943';
it.each(['META', 'MANUAL'] as const)(
  'opens the exact %s report using the workbench contract',
  (kind) => {
    const destination = advertisingReportDestination(kind, REPORT);
    expect(destination).toBe(
      `/delivery?view=ads&adSource=${kind}&adReport=${REPORT}`,
    );
    const parameters = new URL(destination!, 'http://localhost').searchParams;
    expect(parameters.has('metaReport')).toBe(false);
    expect(parameters.has('businessRecord')).toBe(false);
    expect(parameters.has('adView')).toBe(false);
  },
);
it.each([null, undefined, 'not-a-report', `${REPORT}&adMode=assign`])(
  'does not construct an actionable report selection from %s',
  (id) => {
    expect(advertisingReportDestination('META', id)).toBeNull();
  },
);
