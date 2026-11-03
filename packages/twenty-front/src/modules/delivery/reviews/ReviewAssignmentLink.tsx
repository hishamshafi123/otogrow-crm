import { Link, useSearchParams } from 'react-router-dom';
import { Trans } from '@lingui/react/macro';
import { reviewItemDestination } from '@/delivery/reviews/review-navigation';
type ReviewAssignmentLinkProps = {
  taskId: string;
  submissionVersion: number;
};
export const ReviewAssignmentLink = ({
  taskId,
  submissionVersion,
}: ReviewAssignmentLinkProps) => {
  const [params] = useSearchParams();
  return (
    <Link to={reviewItemDestination(params, { taskId, submissionVersion })}>
      <Trans>Open assigned submission review</Trans>
    </Link>
  );
};
