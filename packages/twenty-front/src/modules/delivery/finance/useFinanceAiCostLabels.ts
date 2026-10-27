import { useLingui } from '@lingui/react/macro';
import { type FinanceAiCostSource } from '@/delivery/finance/finance-ai-cost.types';

export const useFinanceAiCostLabels = () => {
  const { t } = useLingui();
  const filters: Record<string, string> = {
    UNRECOGNIZED: t`Not imported`,
    RECOGNIZED: t`Drafts and imported history`,
    NEEDS_REVIEW: t`Awaiting finance review`,
    ALL: t`All recorded requests`,
  };
  const bases: Record<string, string> = {
    PRICED_USAGE: t`Recorded usage at the saved model price`,
    MANUAL_EVIDENCE: t`Administrator-recorded charge`,
    LATE_PRICED_USAGE: t`Later usage at the saved model price`,
  };
  const states: Record<string, string> = {
    RESERVED: t`Amount not confirmed`,
    DISPATCHED: t`Request processing`,
    UNCERTAIN: t`Needs administrator reconciliation`,
    RELEASED: t`Released before charging`,
    SETTLED: t`Recorded charge`,
  };
  const sourceKinds: Record<string, string> = {
    TASK_AGENT: t`Task assistant`,
    INBOX_DRAFT: t`Inbox draft`,
    MEDIA: t`Creative production`,
  };
  const warnings: Record<string, string> = {
    SOURCE_NOT_SETTLED: t`This request has no settled charge. An amount held for a request cannot be imported as a cost.`,
    SOURCE_AMOUNT_INVALID: t`The recorded amount is unavailable or invalid. Correct the source before importing it.`,
    SETTLEMENT_EVIDENCE_UNAVAILABLE: t`The original financial evidence is unavailable. An administrator must review the charge.`,
    LATE_EVIDENCE_AVAILABLE: t`Later usage evidence is available. Choose the recorded amount to use; earlier entries stay unchanged until a reviewed correction is posted.`,
    SOURCE_PROJECT_UNAVAILABLE: t`The original project is unavailable. Choose an available client or an explicit company allocation.`,
    SOURCE_CLIENT_CHANGED: t`The source client changed. Review the original financial evidence and choose the allocation explicitly.`,
    SOURCE_TASK_MOVED: t`The source task moved. Its financial evidence is retained; review the client allocation.`,
    INVALID_SOURCE_EVIDENCE: t`Some financial evidence is invalid or unavailable. Review the source before importing a cost.`,
    CLAIM_UNAVAILABLE: t`The current recognition links need review. Refresh the source before preparing another cost.`,
    SOURCE_MODEL_UNAVAILABLE: t`The saved model identity is unavailable. An administrator must review the source before import.`,
  };
  return {
    filters,
    basis: (value: string) => bases[value] ?? t`Recorded financial evidence`,
    state: (value: string) => states[value] ?? t`Source unavailable`,
    sourceKind: (value: string) =>
      sourceKinds[value] ?? t`Production AI request`,
    warning: (value: string) =>
      warnings[value] ?? t`This AI charge needs review before posting.`,
    status: (source: FinanceAiCostSource) => {
      if (source.claim.replacementEntry?.status === 'DRAFT')
        return t`Correction draft ready for review`;
      if (source.claim.currentEntry?.status === 'DRAFT')
        return t`Draft ready for review`;
      if (source.claim.currentEntry?.status === 'POSTED')
        return t`Posted to monthly results`;
      if (!source.eligible)
        return source.state === 'SETTLED'
          ? t`Source needs review`
          : (states[source.state] ?? t`Source unavailable`);
      return t`Ready for a monthly draft`;
    },
  };
};
