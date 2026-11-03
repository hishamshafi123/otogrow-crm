type TaskApprovalCelebrationInput = {
  memberId: string;
  taskId: string;
  assigneeId: string | null | undefined;
  state: string;
  submissionVersion: number | null | undefined;
};
export const claimTaskApprovalCelebration = ({
  memberId,
  taskId,
  assigneeId,
  state,
  submissionVersion,
}: TaskApprovalCelebrationInput) => {
  if (
    state !== 'APPROVED' ||
    assigneeId !== memberId ||
    submissionVersion == null ||
    !Number.isSafeInteger(submissionVersion) ||
    submissionVersion <= 0
  )
    return false;
  try {
    const key = `delivery-approved:${memberId}:${taskId}:${submissionVersion}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, 'seen');
    return true;
  } catch {
    return false;
  }
};
