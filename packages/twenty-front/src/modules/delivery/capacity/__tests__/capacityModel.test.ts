import {
  capacityDates,
  capacityDay,
  capacityLoads,
} from '@/delivery/capacity/capacityModel';
import { type DeliveryTask } from '@/delivery/delivery.types';
import { EMPTY_TASK_PLAN } from '@/delivery/capacity/capacity.types';
const makeTask = (
  overrides: Partial<DeliveryTask['details']> = {},
): DeliveryTask => ({
  id: 'video',
  title: 'Unique video',
  assigneeId: 'editor',
  projectId: 'brand',
  revision: 1,
  dueAt: null,
  details: {
    brief: '',
    service: 'Video',
    priority: 'NORMAL',
    scheduledDate: '2026-11-01',
    reviewerId: 'reviewer',
    state: 'PLANNED',
    blocker: '',
    checklist: [],
    evidence: [],
    submissions: [],
    events: [],
    plan: {
      workMinutes: 120,
      revisionMinutes: 30,
      waitMinutes: 180,
      reviewMinutes: 20,
      reviewDate: '2026-11-01',
      complexity: 'COMPLEX',
    },
    ...overrides,
  },
});
it('counts explicit original/variation effort and revision allowances, not waiting or arbitrary video quotas', () => {
  const original = makeTask();
  const variant = {
    ...makeTask({
      plan: {
        ...EMPTY_TASK_PLAN,
        workMinutes: 10,
        revisionMinutes: 5,
        waitMinutes: 30,
      },
    }),
    id: 'variant',
    title: 'Hook variation',
  };
  const before = JSON.stringify([original, variant]);
  const day = capacityDay(
    capacityLoads([original, variant], 'editor'),
    '2026-11-01',
    150,
  );
  expect(day).toMatchObject({
    workMinutes: 165,
    productionMinutes: 130,
    revisionMinutes: 35,
    waitMinutes: 210,
    overloadMinutes: 15,
    unknownCount: 0,
  });
  expect(JSON.stringify([original, variant])).toBe(before);
});
it('combines production and review commitments for the same person and excludes approved work', () => {
  const production = makeTask();
  const review = {
    ...makeTask({ reviewerId: 'editor', state: 'IN_REVIEW' }),
    id: 'other',
    assigneeId: 'other-editor',
  };
  const approved = makeTask({ state: 'APPROVED' });
  const day = capacityDay(
    capacityLoads([production, review, approved], 'editor'),
    '2026-11-01',
    160,
  );
  expect(day).toMatchObject({
    workMinutes: 170,
    reviewMinutes: 20,
    productionMinutes: 120,
    overloadMinutes: 10,
  });
  expect(capacityLoads([review], 'other-editor')).toEqual([]);
});
it('distinguishes unknown from zero and does not treat unplanned work as available capacity', () => {
  const task = makeTask({ plan: undefined });
  const loads = capacityLoads([task], 'editor');
  expect(capacityDay(loads, '2026-11-01', null)).toMatchObject({
    unknownCount: 1,
    unknownWait: true,
    overloadMinutes: 0,
  });
  expect(
    capacityDay(capacityLoads([makeTask()], 'editor'), '2026-11-01', 0)
      .overloadMinutes,
  ).toBe(150);
  const missing = capacityLoads(
    [makeTask({ scheduledDate: null, plan: undefined })],
    'editor',
  );
  expect(missing[0].date).toBeNull();
  expect(capacityDay(missing, '2026-11-01', 480).loads).toEqual([]);
  expect(capacityLoads([task], 'reviewer')[0]).toMatchObject({
    date: null,
    unknownEffort: true,
  });
});
it('uses seven calendar dates across month and year boundaries and rejects impossible ranges', () => {
  expect(capacityDates('2026-12-29')).toEqual([
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
    '2027-01-04',
  ]);
  expect(capacityDates('2026-02-30')).toEqual([]);
  expect(capacityDates('9999-12-31')).toEqual([]);
  expect(capacityDates('no date')).toEqual([]);
});
export { makeTask };
