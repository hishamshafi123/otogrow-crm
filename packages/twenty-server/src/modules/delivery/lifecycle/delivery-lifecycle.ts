import { currentCommitmentEvidence } from 'src/modules/delivery/commitments/delivery-commitments.policy';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type Fulfilment } from 'src/modules/delivery/operations/delivery-operations.types';

type DeliveryEvidence = Pick<
  Fulfilment,
  | 'status'
  | 'cycle'
  | 'deliveredAt'
  | 'nextCheckAt'
  | 'deliveredSubmissionVersion'
>;
export const matchesApprovedDelivery = (
  details: Pick<DeliveryDetails, 'state' | 'submissions'>,
  delivery: DeliveryEvidence | undefined,
) => {
  const submission = details.submissions[details.submissions.length - 1];
  return (
    details.state === 'APPROVED' &&
    submission?.decision === 'APPROVED' &&
    submission.version === delivery?.deliveredSubmissionVersion &&
    Boolean(submission.reviewedAt) &&
    Number.isFinite(Date.parse(submission.reviewedAt!)) &&
    Number.isFinite(Date.parse(delivery?.deliveredAt ?? '')) &&
    Date.parse(submission.reviewedAt!) <=
      Date.parse(delivery?.deliveredAt ?? '')
  );
};

export const getDeliveryLifecycle = (
  details: Pick<DeliveryDetails, 'state' | 'submissions'>,
  delivery: Fulfilment | undefined,
) => ({
  status: !delivery
    ? ('NOT_DELIVERED' as const)
    : delivery.status === 'REDOING' || details.state !== 'APPROVED'
      ? ('REDOING' as const)
      : !matchesApprovedDelivery(details, delivery) ||
          (delivery.status === 'FULFILLED' &&
            !currentCommitmentEvidence(details, delivery).valid)
        ? ('NEEDS_RECONFIRMATION' as const)
        : delivery.status,
  cycle: delivery?.cycle ?? 0,
  deliveredAt: delivery?.deliveredAt ?? null,
  nextCheckAt: matchesApprovedDelivery(details, delivery)
    ? (delivery?.nextCheckAt ?? null)
    : null,
  deliveredSubmissionVersion: delivery?.deliveredSubmissionVersion ?? null,
});
