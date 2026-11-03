import { isValidUuid } from 'twenty-shared/utils';
export const INBOX_CLOSE_COMMAND = {
  inboxMode: null,
  inboxRequest: null,
  inboxCommandId: null,
};
export const INBOX_CLOSE_CONVERSATION = {
  ...INBOX_CLOSE_COMMAND,
  inboxConversation: null,
  inboxReply: null,
  inboxMessagesAfter: null,
  inboxRepliesAfter: null,
};
export const inboxDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'inbox');
  next.delete('inboxView');
  for (const [key, value] of Object.entries(changes)) {
    if (typeof value === 'string' && value !== '') next.set(key, value);
    else next.delete(key);
  }
  return `/delivery?${next}`;
};
export const inboxSelectionValid = (params: URLSearchParams) =>
  ['inboxConversation', 'inboxReply', 'inboxRequest', 'inboxCommandId'].every(
    (key) => !params.has(key) || isValidUuid(params.get(key) ?? ''),
  ) &&
  (!params.has('inboxMode') ||
    ['consent', 'revoke', 'prepare', 'send', 'cancel'].includes(
      params.get('inboxMode') ?? '',
    )) &&
  (params.get('inboxSearch') ?? '').length <= 160;

export const retainsInboxReader = (
  current: { pathname: string; search: string },
  next: { pathname: string; search: string },
  allowReply: boolean,
) => {
  if (current.pathname !== next.pathname) return false;
  const retained = (search: string) => {
    const params = new URLSearchParams(search);
    for (const key of [
      'inboxMessagesAfter',
      'inboxRepliesAfter',
      ...(allowReply ? ['inboxReply'] : []),
    ])
      params.delete(key);
    params.sort();
    return params.toString();
  };
  return retained(current.search) === retained(next.search);
};
