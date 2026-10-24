import { BadRequestException } from '@nestjs/common';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';

export const clientShareContent = (
  details: DeliveryDetails,
  kind: 'BRIEF' | 'SUBMISSION',
) => {
  if (kind === 'BRIEF') {
    const document = details.creative;
    if (!document || document.approvedBriefVersion !== document.briefVersion)
      throw new BadRequestException(
        'Approve the current brief before sharing.',
      );
    const fields = [
      'audience',
      'painPoint',
      'angle',
      'concept',
      'productFacts',
      'visualDirection',
      'hook',
      'cta',
      'music',
    ] as const;
    // Candidate assets, prompts and internal feedback must never enter the client payload.
    return {
      version: document.briefVersion,
      content: fields
        .map((key) => `${key}: ${document.brief[key]}`)
        .join('\n\n'),
      links: [] as string[],
      assetId: null as string | null,
    };
  }
  const submission = details.submissions[details.submissions.length - 1];
  if (details.state !== 'APPROVED' || submission?.decision !== 'APPROVED')
    throw new BadRequestException(
      'Approve the current submission before sharing.',
    );
  return {
    version: submission.version,
    content: submission.description,
    links: [...submission.evidence],
    assetId: submission.finalAssetId ?? null,
  };
};
