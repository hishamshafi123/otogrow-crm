import { deliveryNoticeDestination } from 'src/modules/delivery/operations/delivery-notice-destination';

const REPORT = '5a5adf3e-cbb0-4235-8de7-25d5b5072943';
const BASE = 'https://example.invalid';
it('takes a daily reporting notice to its exact typed workbench source', () => {
  expect(
    deliveryNoticeDestination(
      { kind: 'MESSAGE', taskId: `meta-report:${REPORT}` },
      BASE,
    ).toString(),
  ).toBe(`${BASE}/delivery?view=ads&adSource=META&adReport=${REPORT}`);
});
it('does not turn a malformed legacy report notice into a report selection', () => {
  expect(
    deliveryNoticeDestination(
      { kind: 'MESSAGE', taskId: `meta-report:${REPORT}&adMode=assign` },
      BASE,
    ).toString(),
  ).toBe(`${BASE}/delivery?view=ads`);
});
it('preserves regular task notification destinations', () => {
  expect(
    deliveryNoticeDestination(
      { kind: 'ASSIGNMENT', taskId: REPORT },
      BASE,
    ).toString(),
  ).toBe(`${BASE}/delivery?task=${REPORT}`);
});
it('preserves the exact independently assigned submission review', () => {
  const destination = deliveryNoticeDestination(
    {
      kind: 'REVIEW_ASSIGNMENT',
      taskId: REPORT,
      reviewAssignment: {
        submissionVersion: 3,
        assignmentId: null,
        assignmentRevision: 2,
        recipientId: 'reviewer',
      },
    },
    BASE,
  );
  expect(destination.searchParams.get('task')).toBe(REPORT);
  expect(destination.searchParams.get('view')).toBe('reviews');
  expect(destination.searchParams.get('panel')).toBe('task');
  expect(destination.searchParams.get('creativeSubmission')).toBe('3');
  expect(destination.searchParams.has('adReport')).toBe(false);
});
