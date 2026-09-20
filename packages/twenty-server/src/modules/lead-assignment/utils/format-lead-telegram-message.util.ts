export type LeadTelegramMessageInput = {
  leadName: string;
  leadPhone: string | null;
  leadSource: string;
  personUrl: string;
};

export const formatLeadTelegramMessage = ({
  leadName,
  leadPhone,
  leadSource,
  personUrl,
}: LeadTelegramMessageInput): string =>
  [
    `New lead assigned to you: ${leadName}`,
    `Phone: ${leadPhone ?? '—'}`,
    `Source: ${leadSource}`,
    personUrl,
  ].join('\n');
