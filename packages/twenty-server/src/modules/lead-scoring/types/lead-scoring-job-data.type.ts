export type LeadScoringRecomputePersonJobData = {
  workspaceId: string;
  personId: string;
};

export type LeadScoringFormSubmissionJobData = {
  workspaceId: string;
  noteId: string;
  personId: string;
};

export type LeadScoringChannelMessageJobData = {
  workspaceId: string;
  channelMessageId: string;
};

export type LeadScoringSequenceEnrollmentJobData = {
  workspaceId: string;
  sequenceEnrollmentId: string;
  trigger: 'ENROLLED' | 'STATUS_CHANGED';
};
