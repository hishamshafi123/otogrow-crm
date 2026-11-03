import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryNotice } from 'src/modules/delivery/operations/delivery-operations.types';

export const deliveryNoticeDestination = (
  notice: Pick<DeliveryNotice, 'taskId' | 'kind' | 'reviewAssignment'>,
  base: string | undefined,
) => {
  const url = new URL('/delivery', base);
  if (notice.taskId.startsWith('meta-report:')) {
    url.searchParams.set('view', 'ads');
    const reportId = notice.taskId.slice('meta-report:'.length);
    if (isValidUuid(reportId)) {
      url.searchParams.set('adSource', 'META');
      url.searchParams.set('adReport', reportId);
    }
  } else url.searchParams.set('task', notice.taskId);
  if (notice.kind === 'REVIEW_ASSIGNMENT') {
    url.searchParams.set('view', 'reviews');
    url.searchParams.set('panel', 'task');
    url.searchParams.set(
      'creativeSubmission',
      String(notice.reviewAssignment!.submissionVersion),
    );
  }
  return url;
};
