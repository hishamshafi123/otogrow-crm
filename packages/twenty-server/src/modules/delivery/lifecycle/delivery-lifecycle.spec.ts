import {
  getDeliveryLifecycle,
  matchesApprovedDelivery,
} from 'src/modules/delivery/lifecycle/delivery-lifecycle';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type Fulfilment } from 'src/modules/delivery/operations/delivery-operations.types';
const details: Pick<DeliveryDetails, 'state' | 'submissions'> = {
  state: 'APPROVED',
  submissions: [
    {
      version: 2,
      description: '',
      evidence: [],
      submittedBy: 'editor',
      submittedAt: '2026-10-25T10:00:00Z',
      decision: 'APPROVED',
      reviewedBy: 'manager',
      reviewedAt: '2026-10-25T11:00:00Z',
    },
  ],
};
const delivery: Fulfilment = {
  taskId: 'task',
  status: 'WAITING',
  cycle: 2,
  deliveredSubmissionVersion: 2,
  deliveredAt: '2026-10-25T12:00:00Z',
  nextCheckAt: '2026-10-26T00:00:00Z',
  history: [
    {
      at: '2026-10-25T12:00:00Z',
      actorId: 'manager',
      action: 'DELIVERED',
      note: '',
    },
  ],
};
it('separates internal approval, recorded delivery and explicit fulfilment', () => {
  expect(getDeliveryLifecycle(details, undefined).status).toBe('NOT_DELIVERED');
  expect(getDeliveryLifecycle(details, delivery).status).toBe('WAITING');
  expect(
    getDeliveryLifecycle(details, { ...delivery, status: 'FULFILLED' }).status,
  ).toBe('NEEDS_RECONFIRMATION');
  expect(
    getDeliveryLifecycle(details, {
      ...delivery,
      status: 'FULFILLED',
      nextCheckAt: null,
      history: [
        ...delivery.history,
        {
          at: '2026-10-25T13:00:00Z',
          actorId: 'manager',
          action: 'FULFILLED',
          note: '',
        },
      ],
    }).status,
  ).toBe('FULFILLED');
});
it.each([undefined, 1])(
  'requires renewed delivery when the recorded version is %s',
  (version) => {
    expect(
      matchesApprovedDelivery(details, {
        ...delivery,
        deliveredSubmissionVersion: version,
      }),
    ).toBe(false);
    expect(
      getDeliveryLifecycle(details, {
        ...delivery,
        deliveredSubmissionVersion: version,
      }),
    ).toMatchObject({ status: 'NEEDS_RECONFIRMATION', nextCheckAt: null });
  },
);
it('returns revised production to its work stage while preserving delivery history identity', () => {
  expect(
    getDeliveryLifecycle({ ...details, state: 'CHANGES_REQUESTED' }, delivery),
  ).toMatchObject({
    status: 'REDOING',
    cycle: 2,
    deliveredSubmissionVersion: 2,
    nextCheckAt: null,
  });
});
it('rejects delivery before approval or without an actual approval decision', () => {
  expect(
    matchesApprovedDelivery(details, {
      ...delivery,
      deliveredAt: '2026-10-25T10:30:00Z',
    }),
  ).toBe(false);
  expect(
    matchesApprovedDelivery(
      {
        ...details,
        submissions: [{ ...details.submissions[0], decision: undefined }],
      },
      delivery,
    ),
  ).toBe(false);
});
