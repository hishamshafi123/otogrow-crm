import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type Fulfilment } from 'src/modules/delivery/operations/delivery-operations.types';
import { type DeliveryCommitmentAllocationEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-allocation.entity';

export const currentCommitmentEvidence = (
  details: Pick<DeliveryDetails, 'state' | 'submissions'> | null,
  fulfilment: Fulfilment | undefined,
) => {
  const submission = details?.submissions[details.submissions.length - 1];
  const latestHistory = fulfilment?.history[fulfilment.history.length - 1];
  if (
    !details ||
    details.state !== 'APPROVED' ||
    submission?.decision !== 'APPROVED' ||
    !submission.reviewedAt
  )
    return {
      valid: false as const,
      reason: 'The current submission must have independent final approval.',
    };
  if (
    fulfilment?.status !== 'FULFILLED' ||
    latestHistory?.action !== 'FULFILLED'
  )
    return {
      valid: false as const,
      reason:
        'Delivery must be confirmed fulfilled; internal approval alone does not count.',
    };
  if (fulfilment.deliveredSubmissionVersion !== submission.version)
    return {
      valid: false as const,
      reason:
        'Reconfirm delivery and fulfilment for the current approved submission.',
    };
  if (
    !Number.isFinite(Date.parse(submission.reviewedAt)) ||
    !Number.isFinite(Date.parse(fulfilment.deliveredAt)) ||
    !Number.isFinite(Date.parse(latestHistory.at)) ||
    Date.parse(submission.reviewedAt) > Date.parse(fulfilment.deliveredAt) ||
    Date.parse(latestHistory.at) < Date.parse(fulfilment.deliveredAt)
  )
    return {
      valid: false as const,
      reason:
        'Reconfirm delivery and fulfilment for the current approved submission.',
    };
  return {
    valid: true as const,
    cycle: fulfilment.cycle,
    submissionVersion: submission.version,
    fulfilledAt: new Date(latestHistory.at),
  };
};

export const commitmentCredit = (
  allocation: Pick<
    DeliveryCommitmentAllocationEntity,
    'state' | 'creditedCycle' | 'creditedSubmissionVersion'
  >,
  details: Pick<DeliveryDetails, 'state' | 'submissions'> | null,
  fulfilment: Fulfilment | undefined,
) => {
  if (allocation.state === 'REMOVED')
    return { credited: false, reason: 'Removed from this commitment.' };
  const evidence = currentCommitmentEvidence(details, fulfilment);
  if (!evidence.valid) return { credited: false, reason: evidence.reason };
  if (
    allocation.state !== 'FULFILLED' ||
    allocation.creditedCycle !== evidence.cycle ||
    allocation.creditedSubmissionVersion !== evidence.submissionVersion
  )
    return {
      credited: false,
      reason:
        'Reconfirm fulfilment for this allocated task and current delivery cycle.',
    };
  return { credited: true, reason: null };
};
