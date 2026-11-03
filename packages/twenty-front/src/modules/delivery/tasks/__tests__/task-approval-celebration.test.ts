import { claimTaskApprovalCelebration } from '@/delivery/tasks/task-approval-celebration';
beforeEach(() => localStorage.clear());
it('does not claim an unknown version, unfinished task or another producer’s approval', () => {
  const input = {
    memberId: 'producer',
    taskId: 'task',
    assigneeId: 'producer',
    state: 'APPROVED',
    submissionVersion: 2,
  };
  expect(
    claimTaskApprovalCelebration({ ...input, submissionVersion: null }),
  ).toBe(false);
  expect(claimTaskApprovalCelebration({ ...input, state: 'IN_REVIEW' })).toBe(
    false,
  );
  expect(
    claimTaskApprovalCelebration({ ...input, assigneeId: 'someone-else' }),
  ).toBe(false);
  expect(localStorage.length).toBe(0);
  expect(claimTaskApprovalCelebration(input)).toBe(true);
  expect(claimTaskApprovalCelebration(input)).toBe(false);
});
