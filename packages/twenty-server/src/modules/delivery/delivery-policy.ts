import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';

export const canAccessDeliveryProject = (
  isManager: boolean,
  memberId: string,
  projectMemberIds: string[],
): boolean => isManager || projectMemberIds.includes(memberId);

export const assertDeliveryReview = (
  details: DeliveryDetails,
  assigneeId: string,
  actorId: string,
  isManager: boolean,
  feedback: string,
  decision: string,
): void => {
  if (!isManager || details.reviewerId !== actorId || assigneeId === actorId) {
    throw new ForbiddenException(
      'Only the assigned reviewer can review work submitted by another person.',
    );
  }
  if (details.state !== 'IN_REVIEW' || details.submissions.length === 0) {
    throw new BadRequestException('This task has no pending submission.');
  }
  if (decision === 'CHANGES_REQUESTED' && !feedback.trim()) {
    throw new BadRequestException('Explain the changes needed.');
  }
};
