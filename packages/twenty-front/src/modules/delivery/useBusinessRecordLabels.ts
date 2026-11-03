import { useLingui } from '@lingui/react/macro';
import { type BusinessKind } from '@/delivery/delivery-business.types';

export const useBusinessRecordLabels = () => {
  const { t } = useLingui();
  const create: Record<BusinessKind, string> = {
    CONVERSATION: t`New conversation`,
    AD_REPORT: t`New advertising report`,
    BUDGET: t`New advertising budget request`,
    FINANCE: t`New financial entry`,
    CONTENT: t`New content item`,
    COMPETITOR: t`New competitor finding`,
    RELEASE: t`New release`,
  };
  const edit: Record<BusinessKind, string> = {
    CONVERSATION: t`Edit conversation`,
    AD_REPORT: t`Edit advertising report`,
    BUDGET: t`Edit advertising budget request`,
    FINANCE: t`Edit financial entry`,
    CONTENT: t`Edit content item`,
    COMPETITOR: t`Edit competitor finding`,
    RELEASE: t`Edit release`,
  };
  const save: Record<BusinessKind, string> = {
    CONVERSATION: t`Save conversation`,
    AD_REPORT: t`Save advertising report`,
    BUDGET: t`Save advertising budget request`,
    FINANCE: t`Save financial entry`,
    CONTENT: t`Save content item`,
    COMPETITOR: t`Save competitor finding`,
    RELEASE: t`Save release`,
  };
  const empty: Record<BusinessKind, string> = {
    CONVERSATION: t`No client conversations yet. Add a conversation to keep its notes and replies together.`,
    AD_REPORT: t`No advertising reports yet. Add a report to review its results.`,
    BUDGET: t`No advertising budget requests yet. Add a request for review.`,
    FINANCE: t`No financial entries yet. Add an opening balance, receipt, expense or receivable.`,
    CONTENT: t`No content planned yet. Add a content item to prepare it for review.`,
    COMPETITOR: t`No competitor findings yet. Add evidence and explain what your team can learn.`,
    RELEASE: t`No releases planned yet. Add a release to prepare its checks and handover.`,
  };
  return { create, edit, save, empty };
};
