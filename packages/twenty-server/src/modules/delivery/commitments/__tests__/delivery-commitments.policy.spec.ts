import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type Fulfilment } from 'src/modules/delivery/operations/delivery-operations.types';
import {
  commitmentCredit,
  currentCommitmentEvidence,
} from 'src/modules/delivery/commitments/delivery-commitments.policy';
import { commitmentPeriodSchema } from 'src/modules/delivery/commitments/delivery-commitments.types';
const details: Pick<DeliveryDetails, 'state' | 'submissions'> = {
  state: 'APPROVED',
  submissions: [
    {
      version: 2,
      description: 'Approved work',
      evidence: [],
      submittedBy: 'editor',
      submittedAt: '2026-10-25T08:00:00.000Z',
      reviewedBy: 'manager',
      reviewedAt: '2026-10-25T09:00:00.000Z',
      decision: 'APPROVED',
    },
  ],
};
const fulfilment: Fulfilment = {
  taskId: 'task',
  status: 'FULFILLED',
  deliveredAt: '2026-10-25T10:00:00.000Z',
  cycle: 2,
  deliveredSubmissionVersion: 2,
  nextCheckAt: null,
  history: [
    {
      at: '2026-10-25T22:00:00.000Z',
      actorId: 'manager',
      action: 'FULFILLED',
      note: 'Client has no objection.',
    },
  ],
};
const allocation = {
  state: 'FULFILLED' as const,
  creditedCycle: 2,
  creditedSubmissionVersion: 2,
};
describe('service commitment fulfilment evidence', () => {
  test('requires actual fulfilled delivery, not internal approval or sending', () => {
    expect(currentCommitmentEvidence(details, undefined).valid).toBe(false);
    expect(
      currentCommitmentEvidence(details, { ...fulfilment, status: 'WAITING' })
        .valid,
    ).toBe(false);
    expect(commitmentCredit(allocation, details, fulfilment).credited).toBe(
      true,
    );
  });
  test('removes current credit after client objection, reopening, deletion or a newer submission', () => {
    expect(
      commitmentCredit(allocation, details, {
        ...fulfilment,
        status: 'WAITING',
      }).credited,
    ).toBe(false);
    expect(
      commitmentCredit(
        allocation,
        { ...details, state: 'CHANGES_REQUESTED' },
        fulfilment,
      ).credited,
    ).toBe(false);
    expect(commitmentCredit(allocation, null, fulfilment).credited).toBe(false);
    expect(
      commitmentCredit(
        allocation,
        {
          ...details,
          submissions: [{ ...details.submissions[0], version: 3 }],
        },
        fulfilment,
      ).credited,
    ).toBe(false);
  });
  test('legacy delivery without submission identity requires reconfirmation', () => {
    expect(
      currentCommitmentEvidence(details, {
        ...fulfilment,
        deliveredSubmissionVersion: undefined,
      }).valid,
    ).toBe(false);
  });
  test('does not carry credit into another delivery cycle or re-add a removed task', () => {
    expect(
      commitmentCredit(allocation, details, { ...fulfilment, cycle: 3 })
        .credited,
    ).toBe(false);
    expect(
      commitmentCredit({ ...allocation, state: 'REMOVED' }, details, fulfilment)
        .credited,
    ).toBe(false);
  });
  test('does not infer fulfilment from approval newer than delivery or malformed dates', () => {
    expect(
      currentCommitmentEvidence(
        {
          ...details,
          submissions: [
            {
              ...details.submissions[0],
              reviewedAt: '2026-10-25T11:00:00.000Z',
            },
          ],
        },
        fulfilment,
      ).valid,
    ).toBe(false);
    expect(
      currentCommitmentEvidence(details, {
        ...fulfilment,
        deliveredAt: 'invalid',
      }).valid,
    ).toBe(false);
    expect(
      currentCommitmentEvidence(details, {
        ...fulfilment,
        history: [{ ...fulfilment.history[0], at: '2026-10-25T09:00:00.000Z' }],
      }).valid,
    ).toBe(false);
  });
  test('latest history must confirm fulfilment and latest submission must be approved', () => {
    expect(
      currentCommitmentEvidence(details, {
        ...fulfilment,
        history: [
          ...fulfilment.history,
          { ...fulfilment.history[0], action: 'CLIENT_OBJECTION' },
        ],
      }).valid,
    ).toBe(false);
    expect(
      currentCommitmentEvidence(
        {
          ...details,
          submissions: [
            { ...details.submissions[0], decision: 'CHANGES_REQUESTED' },
          ],
        },
        fulfilment,
      ).valid,
    ).toBe(false);
  });
  test('rejects invalid dates/timezones, zero-length periods and unknown fields', () => {
    const period = {
      id: '11111111-1111-4111-8111-111111111111',
      engagementId: '22222222-2222-4222-8222-222222222222',
      revision: 0,
      label: 'October',
      startDate: '2026-10-01',
      endDateExclusive: '2026-11-01',
      timezone: 'Asia/Qatar',
      reason: 'Agreed monthly scope',
    };
    expect(commitmentPeriodSchema.safeParse(period).success).toBe(true);
    expect(
      commitmentPeriodSchema.safeParse({
        ...period,
        timezone: 'Invalid/Timezone',
      }).success,
    ).toBe(false);
    expect(
      commitmentPeriodSchema.safeParse({
        ...period,
        endDateExclusive: '2026-10-01',
      }).success,
    ).toBe(false);
    expect(
      commitmentPeriodSchema.safeParse({ ...period, startDate: '2026-02-30' })
        .success,
    ).toBe(false);
    expect(
      commitmentPeriodSchema.safeParse({ ...period, amount: 100 }).success,
    ).toBe(false);
  });
});
