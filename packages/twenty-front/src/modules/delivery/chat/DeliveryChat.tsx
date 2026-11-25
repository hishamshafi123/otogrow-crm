import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { Link, useSearchParams } from 'react-router-dom';
import {
  IconArrowBackUp,
  IconBell,
  IconCheck,
  IconChevronLeft,
  IconFile,
  IconFilter,
  IconMessage,
  IconMicrophone,
  IconPaperclip,
  IconPencil,
  IconPin,
  IconPinned,
  IconSearch,
  IconSend,
  IconTrash,
  IconX,
} from 'twenty-ui/icon';
import { ChatAttachmentView } from '@/delivery/chat/ChatAttachmentView';
import { ChatVoicePlayer } from '@/delivery/chat/ChatVoicePlayer';
import {
  ChatVoiceRecorder,
  type RecordedVoiceClip,
} from '@/delivery/chat/ChatVoiceRecorder';
import {
  StyledAddProjectSelect,
  StyledAvatar,
  StyledAvatarDot,
  StyledBubbleHeader,
  StyledBubbleMeta,
  StyledChatBoundary,
  StyledChatBubble,
  StyledChatLog,
  StyledChatMain,
  StyledChatPeopleList,
  StyledChatShell,
  StyledChatSidebar,
  StyledChatToolbarBar,
  StyledComposerArea,
  StyledComposerContextBar,
  StyledComposerDock,
  StyledComposerFooter,
  StyledConversationHeader,
  StyledDayDivider,
  StyledDropOverlay,
  StyledEmptyState,
  StyledFilterChip,
  StyledHeaderActions,
  StyledHeaderIdentity,
  StyledHeaderSubtext,
  StyledIconButton,
  StyledInlineAlert,
  StyledLoadMoreRow,
  StyledMessageActions,
  StyledMessageProjectTag,
  StyledMessageRow,
  StyledMessageText,
  StyledMobileBackButton,
  StyledPendingAttachmentBar,
  StyledPendingChip,
  StyledPersonBody,
  StyledPersonBottom,
  StyledPersonButton,
  StyledPersonMetaTag,
  StyledPersonName,
  StyledPersonPreview,
  StyledPersonTime,
  StyledPersonTop,
  StyledPillCountBadge,
  StyledPinnedBanner,
  StyledPinnedItem,
  StyledProjectContextSelect,
  StyledProjectDot,
  StyledProjectPill,
  StyledProjectPillBar,
  StyledProjectPillLabel,
  StyledReactionPill,
  StyledReactionsRow,
  StyledReplyQuote,
  StyledSearchWrap,
  StyledSendButton,
  StyledSidebarFilterRow,
  StyledSidebarFooter,
  StyledSidebarHeader,
  StyledSidebarTitleRow,
  StyledStatusBadge,
  StyledTelegramStatus,
  StyledUnreadDivider,
  StyledUnreadPill,
} from '@/delivery/chat/chatStyles';
import {
  DELETE_DELIVERY_CHAT,
  EDIT_DELIVERY_CHAT,
  GET_DELIVERY_CHAT,
  SEND_DELIVERY_CHAT,
  TOGGLE_DELIVERY_CHAT_PIN,
  TOGGLE_DELIVERY_CHAT_REACTION,
  VIEW_DELIVERY_CHAT,
} from '@/delivery/chat/deliveryChatGraphql';
import {
  computeTelegramPingCountdownMinutes,
  type DeliveryChatAttachment,
  type DeliveryChatFilter,
  type DeliveryChatMessage,
  type DeliveryChatReaction,
  type DeliveryChatSnapshot,
  formatDayHeading,
  formatDayKey,
  formatFileSize,
  formatMessageTime,
  formatRelativeTime,
  GENERAL_PROJECT_KEY,
  getInitials,
  getToneForKey,
  QUICK_REACTION_EMOJIS,
  tokenizeMessageText,
} from '@/delivery/chat/deliveryChatTypes';
import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_UPLOAD_BYTES,
  uploadChatFile,
} from '@/delivery/chat/useChatFileAuth';
import { useVisibleChatMessages } from '@/delivery/chat/useVisibleChatMessages';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';

type DeliveryChatQueryData = {
  deliveryChat: DeliveryChatSnapshot;
};

type DeliveryChatQueryVars = {
  input: {
    peerId?: string;
    projectId?: string;
    before?: string;
    search?: string;
    messageSearch?: string;
    filter?: string;
  };
};

type SendAttemptPayload = {
  requestId: string;
  recipientId: string;
  text: string;
  projectId?: string | null;
  replyToMessageId?: string | null;
  attachmentIds?: string[];
};

type PendingAttachmentItem = {
  attachment: DeliveryChatAttachment;
  localUrl?: string | null;
};

type ReplyDraftTarget = {
  id: string;
  senderName: string;
  text: string;
};

export const DeliveryChat = () => {
  const access = useWorkflowAccess();
  const [params] = useSearchParams();
  return (
    <ChatWorkspace
      key={`${access.scope}:${params.get('chatWith') ?? ''}:${params.get('chatProject') ?? ''}:${params.get('chatBefore') ?? ''}`}
      access={access}
    />
  );
};

type ChatWorkspaceProps = { access: ReturnType<typeof useWorkflowAccess> };

const ChatWorkspace = ({ access }: ChatWorkspaceProps) => {
  const { t } = useLingui();
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const peerId = params.get('chatWith') ?? undefined;
  const projectId = params.get('chatProject') ?? undefined;
  const before = params.get('chatBefore') ?? undefined;

  const [search, setSearch] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchInput, setMessageSearchInput] = useState('');
  const [debouncedMessageSearch, setDebouncedMessageSearch] = useState('');
  const [messageFilter, setMessageFilter] = useState<DeliveryChatFilter>('ALL');
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [composerProjectId, setComposerProjectId] = useState<string>('');
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedMessageSearch(messageSearchInput.trim());
    }, 240);
    return () => window.clearTimeout(timer);
  }, [messageSearchInput]);

  const query = useQuery<DeliveryChatQueryData, DeliveryChatQueryVars>(
    GET_DELIVERY_CHAT,
    {
      variables: {
        input: {
          peerId,
          projectId,
          before,
          search,
          messageSearch: debouncedMessageSearch || undefined,
          filter: messageFilter === 'ALL' ? undefined : messageFilter,
        },
      },
      skip: !access.ready,
      fetchPolicy: 'no-cache',
      pollInterval: 8000,
    },
  );
  const { refetch } = query;
  const candidate = query.data?.deliveryChat;
  const queryDenied = access.denied || isOtogrowAccessDenied(query.error);
  const [localDenied, setLocalDenied] = useState(false);
  const denied = queryDenied || localDenied;

  const candidateMatchesProject =
    projectId === undefined
      ? !candidate?.projectId
      : (candidate?.projectId ?? undefined) === projectId;

  const available =
    !denied &&
    access.matches(candidate) &&
    !query.error &&
    (candidate?.peer?.id ?? undefined) === peerId &&
    (candidate?.before ?? undefined) === before &&
    candidateMatchesProject;

  const [lastData, setLastData] = useState<DeliveryChatSnapshot>();
  if (available && candidate !== lastData) setLastData(candidate);
  const data = denied ? undefined : available ? candidate : lastData;

  const [send, sending] = useMutation<
    { sendDeliveryChatMessage: string },
    { input: SendAttemptPayload }
  >(SEND_DELIVERY_CHAT);
  const [view] = useMutation<
    { viewDeliveryChatMessages: number },
    { input: { messageIds: string[] } }
  >(VIEW_DELIVERY_CHAT);
  const [editMessage, editing] = useMutation<
    { editDeliveryChatMessage: boolean },
    { input: { messageId: string; text: string } }
  >(EDIT_DELIVERY_CHAT);
  const [deleteMessage] = useMutation<
    { deleteDeliveryChatMessage: boolean },
    { input: { messageId: string } }
  >(DELETE_DELIVERY_CHAT);
  const [toggleReaction] = useMutation<
    { toggleDeliveryChatReaction: boolean },
    { input: { messageId: string; emoji: string } }
  >(TOGGLE_DELIVERY_CHAT_REACTION);
  const [togglePin] = useMutation<
    { toggleDeliveryChatPin: boolean },
    { input: { messageId: string } }
  >(TOGGLE_DELIVERY_CHAT_PIN);

  const [draft, setDraft] = useState('');
  const [attempt, setAttempt] = useState<SendAttemptPayload | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachmentItem[]
  >([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [replyTarget, setReplyTarget] = useState<ReplyDraftTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState<{
    id: string;
    originalText: string;
  } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [error, setError] = useState('');
  const [readError, setReadError] = useState(false);
  const [viewedRetry, setViewedRetry] = useState(0);
  const [notice, setNotice] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();

  // oxlint-disable-next-line twenty/no-state-useref -- Late responses must verify the current identity, conversation, project pill and denial lifetime before restoring private state.
  const lifetime = useRef({
    epoch: 0,
    active: true,
    access,
    peerId,
    projectId,
    before,
  });

  useLayoutEffect(() => {
    lifetime.current.access = access;
    lifetime.current.peerId = peerId;
    lifetime.current.projectId = projectId;
    lifetime.current.before = before;
  }, [access, peerId, projectId, before]);

  useLayoutEffect(() => {
    const current = lifetime.current;
    current.epoch += 1;
    current.active = true;
    return () => {
      current.epoch += 1;
      current.active = false;
    };
  }, [access.scope, peerId, projectId, before]);

  // Revoke any local voice preview object URLs on unmount
  // oxlint-disable-next-line twenty/no-state-useref -- Tracks created object URLs for reliable cleanup on unmount.
  const objectUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const startRequest = useCallback(() => {
    const current = lifetime.current;
    const epoch = current.epoch;
    return () => current.active && current.epoch === epoch;
  }, []);

  const matchesCurrent = useCallback(
    (snapshot: DeliveryChatSnapshot | null | undefined) => {
      const current = lifetime.current;
      const snapshotMatchesProject =
        current.projectId === undefined
          ? !snapshot?.projectId
          : (snapshot?.projectId ?? undefined) === current.projectId;
      return (
        current.access.matches(snapshot) &&
        (snapshot?.peer?.id ?? undefined) === current.peerId &&
        (snapshot?.before ?? undefined) === current.before &&
        snapshotMatchesProject
      );
    },
    [],
  );

  const clearComposerState = useCallback(() => {
    setDraft('');
    setAttempt(null);
    setPendingAttachments((prev) => {
      prev.forEach((item) => {
        if (item.localUrl) {
          URL.revokeObjectURL(item.localUrl);
          objectUrlsRef.current.delete(item.localUrl);
        }
      });
      return [];
    });
    setReplyTarget(null);
    setEditingTarget(null);
    setIsRecording(false);
    setError('');
  }, []);

  const loseAuthority = useCallback(() => {
    lifetime.current.epoch += 1;
    cancelPendingNavigation();
    setLocalDenied(true);
    setLastData(undefined);
    clearComposerState();
    setSearch('');
    setMessageSearchInput('');
    setDebouncedMessageSearch('');
    setMessageSearchOpen(false);
    setMessageFilter('ALL');
    setPinnedOpen(false);
    setNotice('');
    setReadError(false);
    setViewedRetry(0);
  }, [cancelPendingNavigation, clearComposerState]);

  useLayoutEffect(() => {
    if (queryDenied) loseAuthority();
  }, [queryDenied, loseAuthority]);

  useDeliveryDraftStatus({
    dirty:
      Boolean(draft.trim()) ||
      pendingAttachments.length > 0 ||
      Boolean(editingTarget) ||
      Boolean(attempt),
    saving: sending.loading || editing.loading || uploadingCount > 0,
  });

  const changeConversation = (id: string | null) =>
    requestAction(() => {
      clearComposerState();
      setNotice('');
      setReadError(false);
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (id) next.set('chatWith', id);
        else next.delete('chatWith');
        next.delete('chatProject');
        next.delete('chatBefore');
        return next;
      });
    });

  const changeProject = (nextProject: string | null) =>
    requestAction(() => {
      clearComposerState();
      setNotice('');
      setReadError(false);
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (nextProject) next.set('chatProject', nextProject);
        else next.delete('chatProject');
        next.delete('chatBefore');
        return next;
      });
    });

  const page = (cursor: string | null) =>
    requestAction(() => {
      clearComposerState();
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (cursor) next.set('chatBefore', cursor);
        else next.delete('chatBefore');
        return next;
      });
    });

  const markViewed = useCallback(
    async (ids: string[]) => {
      if (!available) return false;
      const current = startRequest();
      try {
        await view({ variables: { input: { messageIds: ids } } });
      } catch (failure) {
        if (!current()) return false;
        if (isOtogrowAccessDenied(failure)) {
          loseAuthority();
          return false;
        }
        setReadError(true);
        return false;
      }
      if (!current()) return false;
      setReadError(false);
      try {
        await refetch();
      } catch (failure) {
        if (!current()) return false;
        if (isOtogrowAccessDenied(failure)) {
          loseAuthority();
          return false;
        }
        setNotice(
          t`Viewed status saved. The conversation could not refresh yet.`,
        );
      }
      return current();
    },
    [available, view, refetch, t, loseAuthority, startRequest],
  );

  const effectiveSendProjectId = useMemo<string | null>(() => {
    if (projectId === GENERAL_PROJECT_KEY) return null;
    if (projectId) return projectId;
    return composerProjectId || null;
  }, [projectId, composerProjectId]);

  const activeProjectName = useMemo(() => {
    if (!projectId || projectId === GENERAL_PROJECT_KEY) return null;
    const fromPills = data?.projects?.find((p) => p.id === projectId)?.name;
    if (fromPills) return fromPills;
    return (
      data?.allWorkspaceProjects?.find((p) => p.id === projectId)?.name ?? null
    );
  }, [projectId, data?.projects, data?.allWorkspaceProjects]);

  const submitSendPayload = useCallback(
    async (payload: SendAttemptPayload) => {
      if (!available || !data?.peer?.active || sending.loading) return;
      setAttempt(payload);
      setError('');
      setNotice('');
      const current = startRequest();
      try {
        await send({ variables: { input: payload } });
      } catch (failure) {
        if (!current()) return;
        if (isOtogrowAccessDenied(failure)) {
          loseAuthority();
          return;
        }
        setError(
          t`Could not confirm delivery. Retry send safely with the same message; it will not create a duplicate.`,
        );
        return;
      }
      if (!current()) return;
      clearComposerState();
      setNotice(t`Message sent.`);
      try {
        await refetch();
      } catch (failure) {
        if (!current()) return;
        if (isOtogrowAccessDenied(failure)) {
          loseAuthority();
          return;
        }
        setNotice(t`Message sent. The conversation could not refresh yet.`);
      }
    },
    [
      available,
      data?.peer?.active,
      sending.loading,
      startRequest,
      send,
      loseAuthority,
      t,
      clearComposerState,
      refetch,
    ],
  );

  const submit = async () => {
    if (!available || !data?.peer?.active) return;

    if (editingTarget) {
      const nextText = draft.trim();
      if (!nextText || editing.loading) return;
      setError('');
      const current = startRequest();
      try {
        await editMessage({
          variables: { input: { messageId: editingTarget.id, text: nextText } },
        });
      } catch (failure) {
        if (!current()) return;
        if (isOtogrowAccessDenied(failure)) {
          loseAuthority();
          return;
        }
        setError(t`Could not update message. Please try again.`);
        return;
      }
      if (!current()) return;
      clearComposerState();
      setNotice(t`Message updated.`);
      try {
        await refetch();
      } catch (failure) {
        if (!current()) return;
        if (isOtogrowAccessDenied(failure)) loseAuthority();
      }
      return;
    }

    if (sending.loading || uploadingCount > 0) return;
    const trimmed = draft.trim();
    const attachmentIds = pendingAttachments.map((item) => item.attachment.id);
    if (!attempt && !trimmed && attachmentIds.length === 0) return;

    const input: SendAttemptPayload = attempt ?? {
      requestId: crypto.randomUUID(),
      recipientId: data.peer.id,
      text: trimmed,
      ...(effectiveSendProjectId ? { projectId: effectiveSendProjectId } : {}),
      ...(replyTarget ? { replyToMessageId: replyTarget.id } : {}),
      ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
    };

    await submitSendPayload(input);
  };

  const handleFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      if (!available || !data?.peer?.active) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      setError('');

      const remaining = CHAT_MAX_ATTACHMENTS - pendingAttachments.length;
      if (remaining <= 0) {
        setError(
          t`You can attach up to ${CHAT_MAX_ATTACHMENTS} files per message.`,
        );
        return;
      }
      const batch = list.slice(0, remaining);
      const current = startRequest();
      setUploadingCount((count) => count + batch.length);

      try {
        for (const file of batch) {
          if (file.size > CHAT_MAX_UPLOAD_BYTES) {
            setError(t`${file.name} exceeds the 25 MB upload limit.`);
            continue;
          }
          const result = await uploadChatFile({
            store,
            recipientId: data.peer.id,
            file,
            kind: 'AUTO',
          });
          if (!current()) return;
          if (result.status === 401 || result.status === 403) {
            loseAuthority();
            return;
          }
          if (!result.attachment) {
            setError(result.error ?? t`Could not upload ${file.name}.`);
            continue;
          }
          const uploaded = result.attachment;
          setPendingAttachments((prev) => [...prev, { attachment: uploaded }]);
        }
      } finally {
        if (current()) {
          setUploadingCount((count) => Math.max(0, count - batch.length));
        }
      }
    },
    [
      available,
      data?.peer?.active,
      data?.peer?.id,
      pendingAttachments.length,
      startRequest,
      store,
      loseAuthority,
      t,
    ],
  );

  const handleVoiceComplete = useCallback(
    async (clip: RecordedVoiceClip, sendImmediately: boolean) => {
      setIsRecording(false);
      if (!available || !data?.peer?.active) return;
      if (pendingAttachments.length >= CHAT_MAX_ATTACHMENTS) {
        setError(
          t`You can attach up to ${CHAT_MAX_ATTACHMENTS} files per message.`,
        );
        return;
      }
      const current = startRequest();
      setUploadingCount((count) => count + 1);
      setError('');
      try {
        const result = await uploadChatFile({
          store,
          recipientId: data.peer.id,
          file: clip.blob,
          kind: 'VOICE',
          durationMs: clip.durationMs,
          waveform: clip.waveform,
        });
        if (!current()) return;
        if (result.status === 401 || result.status === 403) {
          loseAuthority();
          return;
        }
        if (!result.attachment) {
          setError(result.error ?? t`Could not upload voice message.`);
          return;
        }
        const uploaded = result.attachment;
        if (sendImmediately) {
          const allAttachmentIds = [
            ...pendingAttachments.map((item) => item.attachment.id),
            uploaded.id,
          ];
          await submitSendPayload({
            requestId: crypto.randomUUID(),
            recipientId: data.peer.id,
            text: draft.trim(),
            ...(effectiveSendProjectId
              ? { projectId: effectiveSendProjectId }
              : {}),
            ...(replyTarget ? { replyToMessageId: replyTarget.id } : {}),
            attachmentIds: allAttachmentIds,
          });
        } else {
          const localUrl = URL.createObjectURL(clip.blob);
          objectUrlsRef.current.add(localUrl);
          setPendingAttachments((prev) => [
            ...prev,
            { attachment: uploaded, localUrl },
          ]);
        }
      } finally {
        if (current()) {
          setUploadingCount((count) => Math.max(0, count - 1));
        }
      }
    },
    [
      available,
      data?.peer?.active,
      data?.peer?.id,
      pendingAttachments,
      startRequest,
      store,
      loseAuthority,
      t,
      submitSendPayload,
      draft,
      effectiveSendProjectId,
      replyTarget,
    ],
  );

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!available) return;
      const current = startRequest();
      try {
        await toggleReaction({ variables: { input: { messageId, emoji } } });
        if (!current()) return;
        await refetch();
      } catch (failure) {
        if (!current()) return;
        if (isOtogrowAccessDenied(failure)) loseAuthority();
      }
    },
    [available, startRequest, toggleReaction, refetch, loseAuthority],
  );

  const handleTogglePin = useCallback(
    async (messageId: string) => {
      if (!available) return;
      const current = startRequest();
      try {
        await togglePin({ variables: { input: { messageId } } });
        if (!current()) return;
        await refetch();
      } catch (failure) {
        if (!current()) return;
        if (isOtogrowAccessDenied(failure)) loseAuthority();
      }
    },
    [available, startRequest, togglePin, refetch, loseAuthority],
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!available) return;
      const current = startRequest();
      try {
        await deleteMessage({ variables: { input: { messageId } } });
        if (!current()) return;
        setNotice(t`Message deleted.`);
        await refetch();
      } catch (failure) {
        if (!current()) return;
        if (isOtogrowAccessDenied(failure)) loseAuthority();
        else setError(t`Could not delete message.`);
      }
    },
    [available, startRequest, deleteMessage, refetch, loseAuthority, t],
  );

  const jumpToMessage = useCallback((messageId: string) => {
    const element = document.querySelector(`[data-message-id="${messageId}"]`);
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === messageId ? null : current,
      );
    }, 2000);
  }, []);

  const retry = async () => {
    const current = startRequest();
    try {
      await access.refetch();
      if (!current()) return;
      const result = await refetch();
      if (!current() || !matchesCurrent(result.data?.deliveryChat)) return;
      setLocalDenied(false);
      setLastData(result.data?.deliveryChat);
    } catch (failure) {
      if (current() && isOtogrowAccessDenied(failure)) loseAuthority();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = event.clipboardData?.files;
    if (files && files.length > 0) {
      event.preventDefault();
      void handleFilesSelected(files);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      void handleFilesSelected(event.dataTransfer.files);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      if (editingTarget) {
        setEditingTarget(null);
        setDraft('');
      } else if (replyTarget) {
        setReplyTarget(null);
      }
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const people = useMemo(() => {
    const raw = data?.people ?? [];
    if (sidebarFilter === 'UNREAD') {
      return raw.filter((person) => person.unread > 0 || person.id === peerId);
    }
    return raw;
  }, [data?.people, sidebarFilter, peerId]);

  const totalUnreadAllPeople = useMemo(
    () => (data?.people ?? []).reduce((sum, person) => sum + person.unread, 0),
    [data?.people],
  );

  const projectPills = useMemo(() => data?.projects ?? [], [data?.projects]);
  const allWorkspaceProjects = useMemo(
    () => data?.allWorkspaceProjects ?? [],
    [data?.allWorkspaceProjects],
  );
  const extraWorkspaceProjects = useMemo(() => {
    const existingIds = new Set(projectPills.map((p) => p.id));
    return allWorkspaceProjects.filter((p) => !existingIds.has(p.id));
  }, [projectPills, allWorkspaceProjects]);

  const composerProjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projectPills) map.set(p.id, p.name);
    for (const p of allWorkspaceProjects) map.set(p.id, p.name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [projectPills, allWorkspaceProjects]);

  const pinnedMessages = data?.pinnedMessages ?? [];
  const totalUnreadWithPeer =
    data?.totalUnreadWithPeer ?? data?.peer?.unread ?? 0;

  const canSend =
    Boolean(data?.peer?.active) &&
    !sending.loading &&
    !editing.loading &&
    uploadingCount === 0 &&
    (Boolean(draft.trim()) ||
      pendingAttachments.length > 0 ||
      Boolean(attempt));

  return (
    <StyledDeliveryStack>
      {!available && (
        <StyledDeliveryCard>
          <p role={denied || query.error || access.error ? 'alert' : 'status'}>
            {denied
              ? t`Chat access changed. Private messages and unsent preparation are no longer available. Check access to reopen the conversation.`
              : query.error || access.error
                ? t`Could not load your chat. Your draft is kept while you retry.`
                : t`Loading your conversations…`}
          </p>
          {(denied || query.error || access.error) && (
            <StyledDeliveryButton onClick={() => void retry()}>
              <Trans>Try again</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryCard>
      )}

      <StyledChatBoundary
        hidden={!available}
        disabled={!available || sending.loading}
      >
        <StyledChatShell>
          <StyledChatSidebar data-mobile-hidden={Boolean(peerId)}>
            <StyledSidebarHeader>
              <StyledSidebarTitleRow>
                <h2>
                  <Trans>Team Chat</Trans>
                </h2>
                {totalUnreadAllPeople > 0 && (
                  <StyledUnreadPill
                    aria-label={t`${totalUnreadAllPeople} unread messages`}
                  >
                    {totalUnreadAllPeople}
                  </StyledUnreadPill>
                )}
              </StyledSidebarTitleRow>
              <StyledSearchWrap>
                <IconSearch size={15} />
                <input
                  type="search"
                  aria-label={t`Find a teammate`}
                  placeholder={t`Find a teammate…`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </StyledSearchWrap>
              <StyledSidebarFilterRow>
                <StyledFilterChip
                  type="button"
                  aria-pressed={sidebarFilter === 'ALL'}
                  onClick={() => setSidebarFilter('ALL')}
                >
                  <Trans>All</Trans>
                </StyledFilterChip>
                <StyledFilterChip
                  type="button"
                  aria-pressed={sidebarFilter === 'UNREAD'}
                  onClick={() => setSidebarFilter('UNREAD')}
                >
                  <Trans>Unread</Trans>
                  {totalUnreadAllPeople > 0 && ` (${totalUnreadAllPeople})`}
                </StyledFilterChip>
              </StyledSidebarFilterRow>
            </StyledSidebarHeader>

            <StyledChatPeopleList aria-label={t`Team conversations`}>
              {people.map((person) => {
                const accessibleName =
                  person.name +
                  (!person.active ? ` · ${t`Inactive`}` : '') +
                  (person.unread > 0 ? ` · ${t`${person.unread} unread`}` : '');
                const preview = person.lastMessagePreview
                  ? person.lastMessageProjectName
                    ? `[${person.lastMessageProjectName}] ${person.lastMessagePreview}`
                    : person.lastMessagePreview
                  : person.active
                    ? t`Start a conversation`
                    : t`Inactive teammate`;
                return (
                  <StyledPersonButton
                    key={person.id}
                    type="button"
                    aria-label={accessibleName}
                    aria-pressed={person.id === peerId}
                    onClick={() => changeConversation(person.id)}
                  >
                    <StyledAvatar
                      aria-hidden="true"
                      data-tone={getToneForKey(person.id)}
                    >
                      {getInitials(person.name)}
                      <StyledAvatarDot data-active={String(person.active)} />
                    </StyledAvatar>
                    <StyledPersonBody aria-hidden="true">
                      <StyledPersonTop>
                        <StyledPersonName>{person.name}</StyledPersonName>
                        {person.lastMessageAt && (
                          <StyledPersonTime>
                            {formatRelativeTime(person.lastMessageAt)}
                          </StyledPersonTime>
                        )}
                      </StyledPersonTop>
                      <StyledPersonBottom>
                        <StyledPersonPreview
                          data-unread={String(person.unread > 0)}
                        >
                          {preview}
                        </StyledPersonPreview>
                        {person.unread > 0 && (
                          <StyledUnreadPill>{person.unread}</StyledUnreadPill>
                        )}
                      </StyledPersonBottom>
                      {typeof person.projectCount === 'number' &&
                        person.projectCount > 0 && (
                          <StyledPersonMetaTag>
                            {person.projectCount === 1
                              ? t`1 project`
                              : t`${person.projectCount} projects`}
                          </StyledPersonMetaTag>
                        )}
                    </StyledPersonBody>
                  </StyledPersonButton>
                );
              })}

              {people.length === 0 && (
                <StyledEmptyState>
                  <p>
                    {sidebarFilter === 'UNREAD' ? (
                      <Trans>You are all caught up — no unread chats.</Trans>
                    ) : (
                      <Trans>
                        No teammates found. Invite teammates through workspace
                        settings to start chatting.
                      </Trans>
                    )}
                  </p>
                </StyledEmptyState>
              )}

              {data && data.peopleTotal > data.people.length && (
                <StyledPersonMetaTag style={{ padding: '6px 10px' }}>
                  <Trans>
                    Showing the first 50 teammates. Search by name to find
                    someone else.
                  </Trans>
                </StyledPersonMetaTag>
              )}
            </StyledChatPeopleList>

            <StyledSidebarFooter>
              {data && !data.telegramReady ? (
                <StyledTelegramStatus data-ready="false">
                  <IconBell size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <Trans>
                      Your Telegram reminders are not ready. Link your Telegram
                      account in Delivery &amp; reminders and ask an
                      administrator to enable the bot.
                    </Trans>{' '}
                    <Link to="/delivery?view=operations">
                      <Trans>Open settings</Trans>
                    </Link>
                  </span>
                </StyledTelegramStatus>
              ) : (
                <StyledTelegramStatus data-ready="true">
                  <IconBell size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <Trans>
                      Telegram 5-min unread pings active at any hour.
                    </Trans>
                  </span>
                </StyledTelegramStatus>
              )}
            </StyledSidebarFooter>
          </StyledChatSidebar>

          <StyledChatMain
            data-mobile-hidden={!peerId}
            onDragOver={(event) => {
              if (!data?.peer?.active) return;
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setIsDragOver(false);
            }}
            onDrop={handleDrop}
          >
            {isDragOver && (
              <StyledDropOverlay>
                <Trans>Drop files to attach to this conversation</Trans>
              </StyledDropOverlay>
            )}

            {data?.peer ? (
              <>
                <StyledConversationHeader>
                  <StyledHeaderIdentity>
                    <StyledMobileBackButton
                      type="button"
                      onClick={() => changeConversation(null)}
                    >
                      <IconChevronLeft size={15} />
                      <Trans>Team</Trans>
                    </StyledMobileBackButton>
                    <StyledAvatar
                      aria-hidden="true"
                      data-tone={getToneForKey(data.peer.id)}
                    >
                      {getInitials(data.peer.name)}
                      <StyledAvatarDot data-active={String(data.peer.active)} />
                    </StyledAvatar>
                    <div style={{ minWidth: 0 }}>
                      <h3>{data.peer.name}</h3>
                      <StyledHeaderSubtext>
                        <span>
                          {data.peer.active ? (
                            <Trans>Private direct chat</Trans>
                          ) : (
                            <Trans>Inactive teammate (read-only)</Trans>
                          )}
                        </span>
                        {typeof data.peerTelegramReady === 'boolean' && (
                          <span>
                            ·{' '}
                            {data.peerTelegramReady ? (
                              <Trans>Telegram 5m ping ready</Trans>
                            ) : (
                              <Trans>Telegram not linked</Trans>
                            )}
                          </span>
                        )}
                      </StyledHeaderSubtext>
                    </div>
                  </StyledHeaderIdentity>

                  <StyledHeaderActions>
                    {pinnedMessages.length > 0 && (
                      <StyledIconButton
                        type="button"
                        aria-pressed={pinnedOpen}
                        aria-label={t`Pinned messages (${pinnedMessages.length})`}
                        onClick={() => setPinnedOpen((open) => !open)}
                      >
                        <IconPinned size={16} />
                        <span style={{ fontSize: 12, fontWeight: 600 }}>
                          {pinnedMessages.length}
                        </span>
                      </StyledIconButton>
                    )}
                    <StyledIconButton
                      type="button"
                      aria-pressed={messageSearchOpen}
                      aria-label={t`Search and filter messages`}
                      onClick={() => setMessageSearchOpen((open) => !open)}
                    >
                      <IconSearch size={16} />
                    </StyledIconButton>
                  </StyledHeaderActions>
                </StyledConversationHeader>

                <StyledProjectPillBar
                  role="tablist"
                  aria-label={t`Project conversations`}
                >
                  <StyledProjectPill
                    type="button"
                    role="tab"
                    aria-selected={projectId === undefined}
                    onClick={() => changeProject(null)}
                  >
                    <StyledProjectPillLabel>
                      <Trans>All</Trans>
                    </StyledProjectPillLabel>
                    {totalUnreadWithPeer > 0 && (
                      <StyledPillCountBadge data-pill-badge="true">
                        {totalUnreadWithPeer}
                      </StyledPillCountBadge>
                    )}
                  </StyledProjectPill>

                  <StyledProjectPill
                    type="button"
                    role="tab"
                    aria-selected={projectId === GENERAL_PROJECT_KEY}
                    onClick={() => changeProject(GENERAL_PROJECT_KEY)}
                  >
                    <StyledProjectPillLabel>
                      <Trans>General</Trans>
                    </StyledProjectPillLabel>
                    {(data.generalUnread ?? 0) > 0 && (
                      <StyledPillCountBadge data-pill-badge="true">
                        {data.generalUnread}
                      </StyledPillCountBadge>
                    )}
                  </StyledProjectPill>

                  {projectPills.map((project) => (
                    <StyledProjectPill
                      key={project.id}
                      type="button"
                      role="tab"
                      title={project.name}
                      aria-selected={projectId === project.id}
                      onClick={() => changeProject(project.id)}
                    >
                      <StyledProjectDot
                        data-project-dot="true"
                        data-tone={getToneForKey(project.id)}
                      />
                      <StyledProjectPillLabel>
                        {project.name}
                      </StyledProjectPillLabel>
                      {project.unread > 0 && (
                        <StyledPillCountBadge data-pill-badge="true">
                          {project.unread}
                        </StyledPillCountBadge>
                      )}
                    </StyledProjectPill>
                  ))}

                  {extraWorkspaceProjects.length > 0 && (
                    <StyledAddProjectSelect
                      aria-label={t`Start a project thread`}
                      value=""
                      onChange={(event) => {
                        if (event.target.value) {
                          changeProject(event.target.value);
                        }
                      }}
                    >
                      <option value="">{t`+ Project`}</option>
                      {extraWorkspaceProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </StyledAddProjectSelect>
                  )}
                </StyledProjectPillBar>

                {messageSearchOpen && (
                  <StyledChatToolbarBar>
                    <StyledSearchWrap style={{ flex: 1, minWidth: 180 }}>
                      <IconSearch size={14} />
                      <input
                        type="search"
                        aria-label={t`Search messages in this chat`}
                        placeholder={t`Search messages…`}
                        value={messageSearchInput}
                        onChange={(event) =>
                          setMessageSearchInput(event.target.value)
                        }
                      />
                    </StyledSearchWrap>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        flexWrap: 'wrap',
                      }}
                    >
                      <IconFilter size={14} />
                      {(
                        [
                          { id: 'ALL', label: t`All` },
                          { id: 'FILES', label: t`Files` },
                          { id: 'VOICE', label: t`Voice` },
                          { id: 'PINNED', label: t`Pinned` },
                        ] as const
                      ).map((chip) => (
                        <StyledFilterChip
                          key={chip.id}
                          type="button"
                          aria-pressed={messageFilter === chip.id}
                          onClick={() => setMessageFilter(chip.id)}
                        >
                          {chip.label}
                        </StyledFilterChip>
                      ))}
                    </div>
                  </StyledChatToolbarBar>
                )}

                {pinnedOpen && pinnedMessages.length > 0 && (
                  <StyledPinnedBanner aria-label={t`Pinned messages`}>
                    {pinnedMessages.map((pinned) => (
                      <StyledPinnedItem
                        key={pinned.id}
                        type="button"
                        onClick={() => jumpToMessage(pinned.id)}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <IconPinned
                            size={13}
                            style={{ marginRight: 6, verticalAlign: 'middle' }}
                          />
                          <strong>{pinned.senderName}:</strong>{' '}
                          {pinned.text ||
                            (pinned.attachments?.length
                              ? t`Attachment`
                              : t`Message`)}
                        </span>
                        <small>{formatRelativeTime(pinned.createdAt)}</small>
                      </StyledPinnedItem>
                    ))}
                  </StyledPinnedBanner>
                )}

                <ChatMessages
                  key={`${data.peer.id}:${projectId ?? 'all'}:${data.before ?? 'latest'}`}
                  data={data}
                  enabled={available}
                  activeProjectFilter={projectId}
                  highlightedMessageId={highlightedMessageId}
                  onViewed={markViewed}
                  viewedRetry={viewedRetry}
                  onLoadOlder={
                    data.olderCursor ? () => page(data.olderCursor) : undefined
                  }
                  onLoadLatest={before ? () => page(null) : undefined}
                  onSelectProject={(nextProjectId) =>
                    changeProject(nextProjectId)
                  }
                  onJumpToMessage={jumpToMessage}
                  onReply={(message) => {
                    setEditingTarget(null);
                    setReplyTarget({
                      id: message.id,
                      senderName:
                        message.senderId === data.memberId
                          ? t`You`
                          : message.senderName,
                      text:
                        message.text ||
                        (message.attachments?.some((a) => a.kind === 'VOICE')
                          ? t`Voice message`
                          : t`Attachment`),
                    });
                    textareaRef.current?.focus();
                  }}
                  onEdit={(message) => {
                    setReplyTarget(null);
                    setEditingTarget({
                      id: message.id,
                      originalText: message.text,
                    });
                    setDraft(message.text);
                    textareaRef.current?.focus();
                  }}
                  onDelete={(messageId) => void handleDeleteMessage(messageId)}
                  onToggleReaction={(messageId, emoji) =>
                    void handleToggleReaction(messageId, emoji)
                  }
                  onTogglePin={(messageId) => void handleTogglePin(messageId)}
                  onAuthorityLost={loseAuthority}
                />

                {readError && (
                  <StyledInlineAlert role="alert">
                    <span>
                      <Trans>
                        Viewed status could not be saved. A Telegram ping may
                        still be sent.
                      </Trans>
                    </span>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => setViewedRetry((current) => current + 1)}
                    >
                      <Trans>Retry viewed status</Trans>
                    </StyledDeliveryButton>
                  </StyledInlineAlert>
                )}

                {!data.peer.active ? (
                  <StyledComposerArea>
                    <p style={{ margin: 0, fontSize: 13 }}>
                      <Trans>
                        This teammate is inactive. Previous messages remain
                        available, but you cannot send new messages.
                      </Trans>
                    </p>
                  </StyledComposerArea>
                ) : (
                  <StyledComposerArea>
                    {replyTarget && (
                      <StyledComposerContextBar>
                        <div style={{ minWidth: 0 }}>
                          <strong>
                            {t`Replying to ${replyTarget.senderName}`}
                          </strong>
                          <div
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {replyTarget.text}
                          </div>
                        </div>
                        <StyledIconButton
                          type="button"
                          aria-label={t`Cancel reply`}
                          onClick={() => setReplyTarget(null)}
                        >
                          <IconX size={15} />
                        </StyledIconButton>
                      </StyledComposerContextBar>
                    )}

                    {editingTarget && (
                      <StyledComposerContextBar>
                        <div>
                          <strong>
                            <Trans>Editing message</Trans>
                          </strong>
                        </div>
                        <StyledIconButton
                          type="button"
                          aria-label={t`Cancel edit`}
                          onClick={() => {
                            setEditingTarget(null);
                            setDraft('');
                          }}
                        >
                          <IconX size={15} />
                        </StyledIconButton>
                      </StyledComposerContextBar>
                    )}

                    {pendingAttachments.length > 0 && (
                      <StyledPendingAttachmentBar>
                        {pendingAttachments.map((item) =>
                          item.attachment.kind === 'VOICE' ? (
                            <div
                              key={item.attachment.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <ChatVoicePlayer
                                attachment={item.attachment}
                                localUrl={item.localUrl}
                              />
                              <StyledIconButton
                                type="button"
                                aria-label={t`Remove voice note`}
                                onClick={() => {
                                  if (item.localUrl) {
                                    URL.revokeObjectURL(item.localUrl);
                                    objectUrlsRef.current.delete(item.localUrl);
                                  }
                                  setPendingAttachments((prev) =>
                                    prev.filter(
                                      (entry) =>
                                        entry.attachment.id !==
                                        item.attachment.id,
                                    ),
                                  );
                                }}
                              >
                                <IconX size={14} />
                              </StyledIconButton>
                            </div>
                          ) : (
                            <StyledPendingChip key={item.attachment.id}>
                              <IconFile size={14} />
                              <span title={item.attachment.name}>
                                {item.attachment.name} (
                                {formatFileSize(item.attachment.size)})
                              </span>
                              <StyledIconButton
                                type="button"
                                aria-label={t`Remove ${item.attachment.name}`}
                                onClick={() =>
                                  setPendingAttachments((prev) =>
                                    prev.filter(
                                      (entry) =>
                                        entry.attachment.id !==
                                        item.attachment.id,
                                    ),
                                  )
                                }
                              >
                                <IconX size={13} />
                              </StyledIconButton>
                            </StyledPendingChip>
                          ),
                        )}
                      </StyledPendingAttachmentBar>
                    )}

                    {error && (
                      <StyledInlineAlert role="alert">
                        <span>{error}</span>
                      </StyledInlineAlert>
                    )}

                    {isRecording ? (
                      <ChatVoiceRecorder
                        onCancel={() => setIsRecording(false)}
                        onComplete={(clip, sendImmediately) =>
                          void handleVoiceComplete(clip, sendImmediately)
                        }
                        onError={(message) => setError(message)}
                      />
                    ) : (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submit();
                        }}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          hidden
                          aria-label={t`Attach files`}
                          onChange={(event) => {
                            if (event.target.files) {
                              void handleFilesSelected(event.target.files);
                              event.target.value = '';
                            }
                          }}
                        />

                        <StyledComposerDock>
                          {!editingTarget && (
                            <StyledIconButton
                              type="button"
                              aria-label={t`Attach file`}
                              title={t`Attach file (up to 25 MB)`}
                              disabled={
                                Boolean(attempt) ||
                                pendingAttachments.length >=
                                  CHAT_MAX_ATTACHMENTS
                              }
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <IconPaperclip size={18} />
                            </StyledIconButton>
                          )}

                          <textarea
                            ref={textareaRef}
                            aria-label={t`Message`}
                            placeholder={
                              activeProjectName
                                ? t`Message ${data.peer.name} in ${activeProjectName}…`
                                : t`Message ${data.peer.name}…`
                            }
                            value={draft}
                            maxLength={4000}
                            rows={1}
                            disabled={Boolean(attempt)}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={handleComposerKeyDown}
                            onPaste={handlePaste}
                          />

                          {!editingTarget && !attempt && (
                            <StyledIconButton
                              type="button"
                              aria-label={t`Record voice message`}
                              title={t`Record voice note`}
                              disabled={
                                pendingAttachments.length >=
                                CHAT_MAX_ATTACHMENTS
                              }
                              onClick={() => setIsRecording(true)}
                            >
                              <IconMicrophone size={18} />
                            </StyledIconButton>
                          )}

                          <StyledSendButton type="submit" disabled={!canSend}>
                            <IconSend size={15} />
                            {sending.loading
                              ? t`Sending…`
                              : editing.loading
                                ? t`Saving…`
                                : editingTarget
                                  ? t`Save edit`
                                  : attempt
                                    ? t`Retry send`
                                    : t`Send message`}
                          </StyledSendButton>
                        </StyledComposerDock>

                        <StyledComposerFooter style={{ marginTop: 6 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flexWrap: 'wrap',
                            }}
                          >
                            {!editingTarget &&
                              (projectId === undefined ? (
                                <label
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                  }}
                                >
                                  <span>
                                    <Trans>Project:</Trans>
                                  </span>
                                  <StyledProjectContextSelect
                                    aria-label={t`Message project`}
                                    value={composerProjectId}
                                    disabled={Boolean(attempt)}
                                    onChange={(event) =>
                                      setComposerProjectId(event.target.value)
                                    }
                                  >
                                    <option value="">
                                      {t`General (no project)`}
                                    </option>
                                    {composerProjectOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.name}
                                      </option>
                                    ))}
                                  </StyledProjectContextSelect>
                                </label>
                              ) : (
                                <span>
                                  {activeProjectName
                                    ? t`Posting in ${activeProjectName}`
                                    : t`Posting in General`}
                                </span>
                              ))}

                            {uploadingCount > 0 && (
                              <span>
                                <Trans>Uploading attachment…</Trans>
                              </span>
                            )}

                            {attempt && (
                              <StyledDeliveryButton
                                type="button"
                                onClick={() =>
                                  requestAction(() => {
                                    clearComposerState();
                                  })
                                }
                              >
                                <Trans>Discard draft</Trans>
                              </StyledDeliveryButton>
                            )}
                          </div>

                          <span>
                            {draft.length > 0 && `${draft.length}/4000 · `}
                            <Trans>Enter to send, Shift+Enter new line</Trans>
                          </span>
                        </StyledComposerFooter>
                      </form>
                    )}

                    {notice && (
                      <p role="status" style={{ margin: 0, fontSize: 12 }}>
                        {notice}
                      </p>
                    )}
                  </StyledComposerArea>
                )}
              </>
            ) : (
              <StyledEmptyState>
                <IconMessage size={38} />
                <h3>
                  <Trans>Choose a teammate to open a conversation.</Trans>
                </h3>
                <p>
                  <Trans>
                    Every direct chat organizes discussions by project, supports
                    voice notes and files, and pings Telegram automatically if
                    unread for 5 minutes.
                  </Trans>
                </p>
              </StyledEmptyState>
            )}
          </StyledChatMain>
        </StyledChatShell>
      </StyledChatBoundary>
    </StyledDeliveryStack>
  );
};

type ChatMessagesProps = {
  data: DeliveryChatSnapshot;
  enabled: boolean;
  activeProjectFilter?: string;
  highlightedMessageId: string | null;
  onViewed: (ids: string[]) => Promise<boolean>;
  viewedRetry: number;
  onLoadOlder?: () => void;
  onLoadLatest?: () => void;
  onSelectProject: (projectId: string) => void;
  onJumpToMessage: (messageId: string) => void;
  onReply: (message: DeliveryChatMessage) => void;
  onEdit: (message: DeliveryChatMessage) => void;
  onDelete: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onTogglePin: (messageId: string) => void;
  onAuthorityLost: () => void;
};

const groupReactions = (
  reactions: DeliveryChatReaction[],
  currentMemberId: string,
) => {
  const map = new Map<
    string,
    { emoji: string; count: number; reactedByMe: boolean; names: string[] }
  >();
  for (const reaction of reactions) {
    const existing = map.get(reaction.emoji);
    if (existing) {
      existing.count += 1;
      existing.names.push(reaction.memberName);
      if (reaction.memberId === currentMemberId) existing.reactedByMe = true;
    } else {
      map.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        reactedByMe: reaction.memberId === currentMemberId,
        names: [reaction.memberName],
      });
    }
  }
  return Array.from(map.values());
};

const ChatMessages = ({
  data,
  enabled,
  activeProjectFilter,
  highlightedMessageId,
  onViewed,
  viewedRetry,
  onLoadOlder,
  onLoadLatest,
  onSelectProject,
  onJumpToMessage,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
  onTogglePin,
  onAuthorityLost,
}: ChatMessagesProps) => {
  const { t } = useLingui();
  const log = useRef<HTMLDivElement>(null);
  const [followLatest, setFollowLatest] = useState(!data.before);
  const latestMessageId = data.messages.at(-1)?.id;

  useEffect(() => {
    if (log.current && followLatest) {
      log.current.scrollTop = log.current.scrollHeight;
    }
  }, [latestMessageId, followLatest]);

  const messageKey =
    `${viewedRetry}:` +
    data.messages
      .map((message) => `${message.id}:${message.viewedAt}`)
      .join('|');
  useVisibleChatMessages(log, messageKey, enabled, onViewed);

  const firstUnreadId = useMemo(
    () =>
      data.messages.find(
        (message) =>
          message.recipientId === data.memberId &&
          !message.viewedAt &&
          !message.deletedAt,
      )?.id ?? null,
    [data.messages, data.memberId],
  );

  const renderReminderStatus = (message: DeliveryChatMessage) => {
    if (message.viewedAt) {
      return (
        <StyledStatusBadge data-state="VIEWED">
          <IconCheck size={12} />
          {t`Viewed ${formatMessageTime(message.viewedAt)}`}
        </StyledStatusBadge>
      );
    }
    const countdown =
      message.reminderState === 'WAITING'
        ? computeTelegramPingCountdownMinutes(message.createdAt)
        : null;
    const labels: Record<string, string> = {
      WAITING: countdown ? t`Telegram ping in ~${countdown}m` : t`Not viewed`,
      QUEUED: t`Telegram ping queued`,
      SENDING: t`Sending Telegram ping`,
      SENT: t`Telegram ping sent`,
      FAILED: t`Telegram ping failed`,
      UNCERTAIN: t`Telegram delivery uncertain; no automatic resend`,
      UNCONFIGURED: t`Telegram not connected`,
      SUPPRESSED: t`Telegram ping no longer needed`,
      VIEWED: t`Viewed`,
    };
    return (
      <StyledStatusBadge data-state={message.reminderState}>
        {labels[message.reminderState] ?? t`Not viewed`}
      </StyledStatusBadge>
    );
  };

  return (
    <StyledChatLog
      ref={log}
      onScroll={(event) => {
        const element = event.currentTarget;
        setFollowLatest(
          element.scrollHeight - element.scrollTop - element.clientHeight < 48,
        );
      }}
      role="log"
      aria-label={t`Conversation messages`}
      aria-live="polite"
    >
      {(onLoadOlder || onLoadLatest) && (
        <StyledLoadMoreRow>
          {onLoadOlder && (
            <StyledDeliveryButton type="button" onClick={onLoadOlder}>
              <Trans>Older messages</Trans>
            </StyledDeliveryButton>
          )}
          {onLoadLatest && (
            <StyledDeliveryButton type="button" onClick={onLoadLatest}>
              <Trans>Latest messages</Trans>
            </StyledDeliveryButton>
          )}
        </StyledLoadMoreRow>
      )}

      {data.messages.length === 0 && (
        <StyledEmptyState>
          <p>
            <Trans>No messages yet. Start the conversation below.</Trans>
          </p>
        </StyledEmptyState>
      )}

      {data.messages.map((message, index) => {
        const previous = index > 0 ? data.messages[index - 1] : null;
        const outgoing = message.senderId === data.memberId;
        const deleted = Boolean(message.deletedAt);
        const dayKey = formatDayKey(message.createdAt);
        const showDayDivider =
          !previous || formatDayKey(previous.createdAt) !== dayKey;
        const showUnreadDivider = firstUnreadId === message.id;
        const isGrouped =
          Boolean(previous) &&
          !showDayDivider &&
          !showUnreadDivider &&
          previous?.senderId === message.senderId &&
          previous?.projectId === message.projectId &&
          Math.abs(
            new Date(message.createdAt).getTime() -
              new Date(previous?.createdAt ?? 0).getTime(),
          ) <
            5 * 60 * 1000;

        const attachments = message.attachments ?? [];
        const reactions = groupReactions(
          message.reactions ?? [],
          data.memberId,
        );
        const parts = tokenizeMessageText(message.text);

        return (
          <div key={message.id}>
            {showDayDivider && (
              <StyledDayDivider>
                <span>{formatDayHeading(message.createdAt)}</span>
              </StyledDayDivider>
            )}
            {showUnreadDivider && (
              <StyledUnreadDivider>
                <Trans>New messages</Trans>
              </StyledUnreadDivider>
            )}

            <StyledMessageRow
              data-outgoing={outgoing}
              data-grouped={isGrouped}
              data-message-id={message.id}
            >
              {!outgoing && (
                <StyledAvatar
                  aria-hidden="true"
                  data-size="sm"
                  data-tone={getToneForKey(message.senderId)}
                  style={{ visibility: isGrouped ? 'hidden' : 'visible' }}
                >
                  {getInitials(message.senderName)}
                </StyledAvatar>
              )}

              <StyledChatBubble
                data-outgoing={outgoing}
                data-deleted={deleted}
                data-highlighted={highlightedMessageId === message.id}
                data-unread-message={
                  message.recipientId === data.memberId && !message.viewedAt
                    ? message.id
                    : undefined
                }
              >
                {(!isGrouped ||
                  (!activeProjectFilter && message.projectName) ||
                  message.pinnedAt) && (
                  <StyledBubbleHeader>
                    <strong>{outgoing ? t`You` : message.senderName}</strong>
                    {!activeProjectFilter &&
                      message.projectId &&
                      message.projectName && (
                        <StyledMessageProjectTag
                          type="button"
                          onClick={() => onSelectProject(message.projectId!)}
                        >
                          <StyledProjectDot
                            data-tone={getToneForKey(message.projectId)}
                          />
                          {message.projectName}
                        </StyledMessageProjectTag>
                      )}
                    {message.pinnedAt && (
                      <span
                        title={t`Pinned message`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 11,
                        }}
                      >
                        <IconPinned size={12} />
                        <Trans>Pinned</Trans>
                      </span>
                    )}
                  </StyledBubbleHeader>
                )}

                {message.replyTo && !deleted && (
                  <StyledReplyQuote
                    type="button"
                    onClick={() => onJumpToMessage(message.replyTo!.id)}
                  >
                    <strong>
                      {message.replyTo.senderId === data.memberId
                        ? t`You`
                        : message.replyTo.senderName}
                    </strong>
                    <span>
                      {message.replyTo.deleted
                        ? t`Original message deleted`
                        : message.replyTo.text ||
                          (message.replyTo.hasVoice
                            ? t`Voice message`
                            : t`Attachment`)}
                    </span>
                  </StyledReplyQuote>
                )}

                {deleted ? (
                  <StyledMessageText>
                    <Trans>This message was deleted.</Trans>
                  </StyledMessageText>
                ) : (
                  <>
                    {message.text && (
                      <StyledMessageText>
                        {parts.map((part, partIndex) =>
                          part.type === 'link' ? (
                            <a
                              key={`${message.id}-link-${partIndex}`}
                              href={part.value}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {part.value}
                            </a>
                          ) : (
                            <span key={`${message.id}-text-${partIndex}`}>
                              {part.value}
                            </span>
                          ),
                        )}
                      </StyledMessageText>
                    )}

                    {attachments.length > 0 && (
                      <ChatAttachmentView
                        attachments={attachments}
                        onAuthorityLost={onAuthorityLost}
                      />
                    )}
                  </>
                )}

                {reactions.length > 0 && !deleted && (
                  <StyledReactionsRow>
                    {reactions.map((group) => (
                      <StyledReactionPill
                        key={`${message.id}-${group.emoji}`}
                        type="button"
                        aria-pressed={group.reactedByMe}
                        title={group.names.join(', ')}
                        onClick={() =>
                          onToggleReaction(message.id, group.emoji)
                        }
                      >
                        <span>{group.emoji}</span>
                        <span>{group.count}</span>
                      </StyledReactionPill>
                    ))}
                  </StyledReactionsRow>
                )}

                <StyledBubbleMeta>
                  <span title={new Date(message.createdAt).toLocaleString()}>
                    {formatMessageTime(message.createdAt)}
                  </span>
                  {message.editedAt && !deleted && (
                    <span>
                      · <Trans>edited</Trans>
                    </span>
                  )}
                  {outgoing && !deleted && renderReminderStatus(message)}
                </StyledBubbleMeta>
              </StyledChatBubble>

              {!deleted && (
                <StyledMessageActions
                  data-message-actions="true"
                  aria-label={t`Message actions`}
                >
                  {QUICK_REACTION_EMOJIS.slice(0, 4).map((emoji) => (
                    <button
                      key={`${message.id}-react-${emoji}`}
                      type="button"
                      aria-label={t`React with ${emoji}`}
                      onClick={() => onToggleReaction(message.id, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label={t`Reply to message`}
                    title={t`Reply`}
                    onClick={() => onReply(message)}
                  >
                    <IconArrowBackUp size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={
                      message.pinnedAt ? t`Unpin message` : t`Pin message`
                    }
                    title={message.pinnedAt ? t`Unpin` : t`Pin`}
                    onClick={() => onTogglePin(message.id)}
                  >
                    {message.pinnedAt ? (
                      <IconPinned size={15} />
                    ) : (
                      <IconPin size={15} />
                    )}
                  </button>
                  {outgoing && (
                    <>
                      <button
                        type="button"
                        aria-label={t`Edit message`}
                        title={t`Edit`}
                        onClick={() => onEdit(message)}
                      >
                        <IconPencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={t`Delete message`}
                        title={t`Delete`}
                        onClick={() => onDelete(message.id)}
                      >
                        <IconTrash size={15} />
                      </button>
                    </>
                  )}
                </StyledMessageActions>
              )}
            </StyledMessageRow>
          </div>
        );
      })}
    </StyledChatLog>
  );
};
