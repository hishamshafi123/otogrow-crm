export type SetterEligibilityCandidate = {
  id: string;
  workspaceMemberId: string;
  telegramChatId: string | null;
  activeDays: string;
  activeStartHour: number;
  activeEndHour: number;
  dailyLeadCap: number | null;
  lastAssignedAt: Date | null;
  assignmentsToday: number;
};

const parseActiveDays = (activeDays: string): number[] =>
  activeDays
    .split(',')
    .map((day) => Number(day.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);

// Schedule and hours are evaluated in UTC: workspaces carry no timezone
// setting, so UTC is the only unambiguous clock available here.
export const computeEligibleSetters = (
  candidates: SetterEligibilityCandidate[],
  now: Date,
): SetterEligibilityCandidate[] => {
  const isoWeekday = ((now.getUTCDay() + 6) % 7) + 1;
  const hour = now.getUTCHours();

  return candidates
    .filter(
      (candidate) =>
        parseActiveDays(candidate.activeDays).includes(isoWeekday) &&
        hour >= candidate.activeStartHour &&
        hour < candidate.activeEndHour &&
        (candidate.dailyLeadCap === null ||
          candidate.assignmentsToday < candidate.dailyLeadCap),
    )
    .sort(
      (a, b) =>
        (a.lastAssignedAt?.getTime() ?? 0) - (b.lastAssignedAt?.getTime() ?? 0),
    );
};
