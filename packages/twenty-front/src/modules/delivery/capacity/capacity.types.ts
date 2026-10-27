export type TaskPlan = {
  workMinutes: number | null;
  revisionMinutes: number | null;
  waitMinutes: number | null;
  reviewMinutes: number | null;
  reviewDate: string | null;
  complexity: 'STANDARD' | 'INVOLVED' | 'COMPLEX' | null;
};
export const EMPTY_TASK_PLAN: TaskPlan = {
  workMinutes: null,
  revisionMinutes: null,
  waitMinutes: null,
  reviewMinutes: null,
  reviewDate: null,
  complexity: null,
};
