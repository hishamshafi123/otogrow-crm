export type TelegramConfig = {
  id: string;
  hasBotToken: boolean;
  botTokenLastFour: string | null;
  botUsername: string | null;
  isActive: boolean;
};

export type SetterProfile = {
  id: string | null;
  workspaceMemberId: string;
  memberName: string;
  memberEmail: string | null;
  isSetter: boolean;
  activeDays: string;
  activeStartHour: number;
  activeEndHour: number;
  dailyLeadCap: number | null;
  hasTelegramChatId: boolean;
};
