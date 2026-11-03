type EmailAddress = string | string[];

export type SendMessageInput = {
  headerMessageId?: string;
  body: string;
  subject: string;
  to: EmailAddress;
  cc?: EmailAddress;
  bcc?: EmailAddress;
  html: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[];
  inReplyTo?: string;
  threadExternalId?: string;
  references?: string[];
};
