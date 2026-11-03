import { useLingui } from '@lingui/react/macro';
export const useAtlasLabels = () => {
  const { t } = useLingui();
  const operations: Record<string, string> = {
    TEXT_TO_IMAGE: t`Text to image`,
    IMAGE_EDIT: t`Edit approved images`,
    IMAGE_TO_VIDEO: t`Animate an approved image`,
  };
  const verification: Record<string, string> = {
    MISSING: t`API key needed`,
    NOT_CONFIGURED: t`API key needed`,
    UNVERIFIED: t`Key saved; connection not verified`,
    VERIFIED: t`Connection check passed`,
    FAILED: t`Connection check failed`,
  };
  const statuses: Record<string, string> = {
    QUOTED: t`Price review prepared; generation not started`,
    QUEUED: t`Queued for generation`,
    SUBMITTING: t`Submitting to Atlas`,
    POLLING: t`Waiting for Atlas output`,
    DOWNLOADING: t`Copying output into this production`,
    SUCCEEDED: t`Output ready for media review`,
    FAILED: t`Request failed; review its recorded result`,
    UNCERTAIN: t`Submission or cost needs review`,
    CANCELLED: t`Local publication cancelled`,
  };
  const reasons: Record<string, string> = {
    CONNECTION_PAUSED: t`New Atlas generation is paused for this workspace.`,
    MODEL_DISABLED: t`This model operation is not enabled for the workspace.`,
    PRODUCTION_MISSING: t`Set up this production and approve its brief before preparing generation.`,
    PRODUCTION_ROLE_DISABLED: t`Your current access level is not enabled for media requests on this production.`,
    NOT_PRODUCTION_ASSIGNEE: t`Only the current production assignee or a production manager can prepare this request.`,
    PRODUCTION_LOCKED: t`The submitted production is locked. Reopen it before preparing another output.`,
    PRODUCTION_MODEL_DISABLED: t`An administrator must explicitly permit this Atlas operation for this production.`,
    UNBOUNDED_ESTIMATED_BILLING: t`This model’s estimated billing has no supported finite reservation. It is listed for visibility; generation remains blocked.`,
    CONNECTION_MISSING: t`An administrator must save the Atlas API key.`,
    KEY_NOT_CONFIGURED: t`An administrator must save the Atlas API key.`,
    CONNECTION_UNVERIFIED: t`The saved Atlas connection has not passed a connection check.`,
    CONNECTION_FAILED: t`The Atlas connection check failed. An administrator must review it.`,
    WORKSPACE_DISABLED: t`Atlas generation is paused for this workspace.`,
    PROVIDER_DISABLED: t`Atlas generation is paused for this workspace.`,
    PROFILE_DISABLED: t`This model operation is not enabled for the workspace.`,
    PRODUCTION_DISABLED: t`Generation is disabled for this production.`,
    ROLE_NOT_ALLOWED: t`Your current role is not permitted to generate for this production.`,
    PROFILE_NOT_ALLOWED: t`This model operation is not permitted for this production.`,
    BRIEF_NOT_APPROVED: t`A manager must approve the current brief before generation.`,
    TASK_LOCKED: t`This submission is locked. Reopen production before preparing a new output.`,
    RESERVATION_LIMIT_MISSING: t`An administrator must record a maximum reservation and supporting pricing evidence for this model operation.`,
    UNSUPPORTED_BILLING: t`This billing method has no supported finite reservation. Generation remains unavailable.`,
    UNBOUNDED_BILLING: t`This billing method has no supported finite reservation. Generation remains unavailable.`,
    BUDGET_NOT_CONFIGURED: t`An administrator must configure the existing production AI spending limits.`,
    BUDGET_DISABLED: t`Paid production AI requests are paused.`,
    BUDGET_EXCEEDED: t`The request does not fit within the available production AI spending limit.`,
    SOURCE_CHANGED: t`The production source changed. Review the current inputs before preparing a new price review.`,
    QUOTE_EXPIRED: t`This price review expired. Review price again for the same selected inputs.`,
  };
  const costs: Record<string, string> = {
    UNRESERVED: t`No spending hold recorded`,
    RESERVED: t`Spending hold reserved`,
    DISPATCHED: t`Submitted; charge not yet confirmed`,
    UNCERTAIN: t`Charge needs reconciliation`,
    RELEASED: t`Spending hold released`,
    SETTLED: t`Charge recorded`,
  };
  return {
    operation: (code: string) =>
      operations[code] ?? t`Unsupported model operation`,
    verification: (code: string) =>
      verification[code] ?? t`Connection status needs review`,
    status: (code: string) => statuses[code] ?? t`Request status needs review`,
    reason: (code: string) =>
      reasons[code] ??
      t`This request is unavailable under the current media configuration. Refresh the setup and review the model’s requirements.`,
    cost: (code: string) => costs[code] ?? t`Cost status needs review`,
  };
};
