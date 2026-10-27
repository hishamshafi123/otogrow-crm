import {
  readMetaReportCursorHistory,
  readMetaReportNavigation,
  writeMetaReportNavigation,
} from '@/delivery/advertising/meta-report-navigation';

it('round trips reporting context without replacing task or workspace parameters', () => {
  const value = {
    archive: 'ARCHIVED' as const,
    accountId: '12345678',
    fromDate: '2026-10-01',
    throughDate: '2026-10-27',
    status: 'APPROVED' as const,
    after: 'bounded-cursor',
    selectedId: 'a43f6f23-54ed-4230-b5ae-c050d2c65000',
  };
  const params = writeMetaReportNavigation(
    new URLSearchParams('view=ads&task=existing&metaAccount=old'),
    value,
  );
  expect(params.get('view')).toBe('ads');
  expect(params.get('task')).toBe('existing');
  expect(readMetaReportNavigation(params)).toMatchObject({
    success: true,
    data: value,
  });
  const reset = writeMetaReportNavigation(params, { archive: 'ACTIVE' });
  expect(reset.toString()).toBe('view=ads&task=existing');
});

it.each([
  'metaArchive=unknown',
  'metaDecision=unknown',
  'metaAccount=123',
  'metaFrom=2026-02-30',
  'metaFrom=2026-10-27&metaThrough=2026-10-01',
  'metaReport=not-an-id',
  `metaAfter=${'a'.repeat(1001)}`,
])('rejects an invalid report link before querying: %s', (query) => {
  expect(readMetaReportNavigation(new URLSearchParams(query)).success).toBe(
    false,
  );
});

it('ignores a previous-page trail from another identity or query', () => {
  const value = { archive: 'ACTIVE' as const, after: 'cursor' };
  const state = {
    deliveryMetaPages: {
      scope: 'member',
      query: JSON.stringify(value),
      previous: ['', 'earlier'],
    },
  };
  expect(readMetaReportCursorHistory(state, 'member', value)).toEqual([
    '',
    'earlier',
  ]);
  expect(readMetaReportCursorHistory(state, 'other', value)).toEqual([]);
  expect(
    readMetaReportCursorHistory(state, 'member', { archive: 'ALL' }),
  ).toEqual([]);
  expect(
    readMetaReportCursorHistory(
      {
        deliveryMetaPages: {
          ...state.deliveryMetaPages,
          previous: Array(101).fill(''),
        },
      },
      'member',
      value,
    ),
  ).toEqual([]);
});
