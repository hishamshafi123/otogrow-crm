import { BadRequestException, ConflictException } from '@nestjs/common';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type DeliveryCommand } from 'src/modules/delivery/delivery-validation';
import { assertCreativeSubmission } from 'src/modules/delivery/creative/delivery-creative.policy';

export const assertDeliveryCreativeReview = (
  details: DeliveryDetails,
  command: Extract<DeliveryCommand, { action: 'review' }>,
) => {
  const submission = details.submissions[details.submissions.length - 1];
  if (!submission)
    throw new BadRequestException('There is no submission to review.');
  const isCreative =
    isDefined(details.creative) ||
    isDefined(submission.creativeVersion) ||
    isDefined(submission.finalAssetId);
  if (
    (isCreative || isDefined(command.selectedSubmissionVersion)) &&
    command.selectedSubmissionVersion !== submission.version
  )
    throw new ConflictException(
      'Select the latest submitted version before recording its decision.',
    );
  if (!isCreative) {
    if (isDefined(command.creativeVersion) || isDefined(command.finalAssetId))
      throw new ConflictException(
        'This submission has no recorded creative identity.',
      );
    return;
  }
  const hasFrozenIdentity =
    isDefined(submission.creativeVersion) &&
    Number.isSafeInteger(submission.creativeVersion) &&
    submission.creativeVersion > 0 &&
    isDefined(submission.finalAssetId) &&
    isValidUuid(submission.finalAssetId);
  if (
    hasFrozenIdentity &&
    (command.creativeVersion !== submission.creativeVersion ||
      command.finalAssetId !== submission.finalAssetId)
  )
    throw new ConflictException(
      'Review the exact submitted creative file before recording its decision.',
    );
  if (command.decision !== 'APPROVED') return;
  if (!hasFrozenIdentity || !details.creative)
    throw new BadRequestException(
      'The submitted creative file cannot be confirmed. Request a new submission.',
    );
  if (
    details.creative.version !== submission.creativeVersion ||
    details.creative.finalAssetId !== submission.finalAssetId
  )
    throw new ConflictException(
      'The creative work changed after submission. Request a new submission.',
    );
  assertCreativeSubmission(details.creative);
};
