export type DeliveryChatAttachmentKind = 'IMAGE' | 'VOICE' | 'FILE';

export type DeliveryChatFilter = 'ALL' | 'FILES' | 'VOICE' | 'PINNED';

export type DeliveryChatAttachment = {
  id: string;
  kind: string;
  name: string;
  mimeType: string;
  size: number;
  durationMs?: number | null;
  waveform?: number[] | null;
};

export type DeliveryChatReaction = {
  emoji: string;
  memberId: string;
  memberName: string;
  createdAt: string;
};

export type DeliveryChatReplyPreview = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  hasAttachments: boolean;
  hasVoice: boolean;
  deleted: boolean;
};

export type DeliveryChatPerson = {
  id: string;
  name: string;
  active: boolean;
  unread: number;
  lastMessageAt: string | null;
  lastMessagePreview?: string | null;
  lastMessageProjectName?: string | null;
  projectCount?: number;
};

export type DeliveryChatProjectPill = {
  id: string;
  name: string;
  unread: number;
  messageCount: number;
  lastMessageAt: string | null;
  isMember: boolean;
};

export type DeliveryChatProjectOption = {
  id: string;
  name: string;
};

export type DeliveryChatMessage = {
  id: string;
  position: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  text: string;
  projectId?: string | null;
  projectName?: string | null;
  replyTo?: DeliveryChatReplyPreview | null;
  attachments?: DeliveryChatAttachment[];
  reactions?: DeliveryChatReaction[];
  createdAt: string;
  viewedAt: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  pinnedById?: string | null;
  reminderState: string;
};

export type DeliveryChatSnapshot = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  people: DeliveryChatPerson[];
  peopleTotal: number;
  peer: DeliveryChatPerson | null;
  projectId?: string | null;
  projects?: DeliveryChatProjectPill[];
  allWorkspaceProjects?: DeliveryChatProjectOption[];
  generalUnread?: number;
  generalMessageCount?: number;
  totalUnreadWithPeer?: number;
  messages: DeliveryChatMessage[];
  pinnedMessages?: DeliveryChatMessage[];
  olderCursor: string | null;
  before: string | null;
  telegramReady: boolean;
  peerTelegramReady?: boolean;
};

export type ChatPaletteTone =
  | 'iris'
  | 'blue'
  | 'cyan'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'pink'
  | 'orange';

const PALETTE_TONES: ChatPaletteTone[] = [
  'iris',
  'blue',
  'cyan',
  'emerald',
  'amber',
  'violet',
  'pink',
  'orange',
];

export const QUICK_REACTION_EMOJIS = [
  '👍',
  '❤️',
  '🔥',
  '✅',
  '👀',
  '🙌',
] as const;

export const GENERAL_PROJECT_KEY = 'GENERAL';

export const hashString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

export const getToneForKey = (key: string): ChatPaletteTone =>
  PALETTE_TONES[hashString(key) % PALETTE_TONES.length];

export const getInitials = (name: string): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
};

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatVoiceDuration = (
  durationMs: number | null | undefined,
): string => {
  if (!durationMs || durationMs <= 0) return '0:00';
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const formatMessageTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const formatDayKey = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export const formatDayHeading = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (formatDayKey(date.toISOString()) === formatDayKey(today.toISOString())) {
    return 'Today';
  }
  if (
    formatDayKey(date.toISOString()) === formatDayKey(yesterday.toISOString())
  ) {
    return 'Yesterday';
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

export const buildFallbackWaveform = (seed: string, bars = 28): number[] => {
  let state = hashString(seed) || 1337;
  const result: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const envelope = Math.sin(((i + 1) / (bars + 1)) * Math.PI);
    const val =
      18 + Math.round(((state % 72) * 0.7 + 25) * (0.45 + 0.55 * envelope));
    result.push(Math.max(12, Math.min(96, val)));
  }
  return result;
};

export type MessageTextPart =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string };

const URL_PATTERN = /(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"])/g;

export const tokenizeMessageText = (text: string): MessageTextPart[] => {
  if (!text) return [];
  const parts: MessageTextPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    const url = match[0];
    parts.push({ type: 'link', value: url });
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return parts;
};

export const computeTelegramPingCountdownMinutes = (
  createdAtIso: string,
  nowMs = Date.now(),
): number | null => {
  const created = new Date(createdAtIso).getTime();
  if (Number.isNaN(created)) return null;
  const remainingMs = created + 5 * 60 * 1000 - nowMs;
  if (remainingMs <= 0) return null;
  return Math.max(1, Math.ceil(remainingMs / 60000));
};
