import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import {
  IconDownload,
  IconFile,
  IconFileText,
  IconPhoto,
  IconX,
} from 'twenty-ui/icon';
import {
  StyledAttachmentStack,
  StyledFileCard,
  StyledFileIconBox,
  StyledFileMeta,
  StyledIconButton,
  StyledImagePreviewButton,
  StyledLightboxBackdrop,
  StyledLightboxCard,
} from '@/delivery/chat/chatStyles';
import { ChatVoicePlayer } from '@/delivery/chat/ChatVoicePlayer';
import {
  type DeliveryChatAttachment,
  formatFileSize,
} from '@/delivery/chat/deliveryChatTypes';
import {
  downloadChatFileToDisk,
  useChatAuthenticatedBlobUrl,
} from '@/delivery/chat/useChatFileAuth';

type ChatAttachmentViewProps = {
  attachments: DeliveryChatAttachment[];
  onAuthorityLost: () => void;
};

const ImageAttachmentCard = ({
  attachment,
  onDownload,
}: {
  attachment: DeliveryChatAttachment;
  onDownload: () => void;
}) => {
  const { t } = useLingui();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { url, loading, error } = useChatAuthenticatedBlobUrl(
    attachment.id,
    true,
  );

  if (error || (!loading && !url)) {
    return (
      <StyledFileCard>
        <StyledFileIconBox>
          <IconPhoto size={18} />
        </StyledFileIconBox>
        <StyledFileMeta>
          <strong>{attachment.name}</strong>
          <small>{formatFileSize(attachment.size)}</small>
        </StyledFileMeta>
        <StyledIconButton
          type="button"
          aria-label={t`Download ${attachment.name}`}
          onClick={onDownload}
        >
          <IconDownload size={16} />
        </StyledIconButton>
      </StyledFileCard>
    );
  }

  return (
    <>
      <StyledImagePreviewButton
        type="button"
        aria-label={t`Preview ${attachment.name}`}
        onClick={() => setLightboxOpen(true)}
      >
        {url ? (
          <img src={url} alt={attachment.name} />
        ) : (
          <span style={{ display: 'block', padding: '18px 24px' }}>
            {t`Loading image…`}
          </span>
        )}
      </StyledImagePreviewButton>
      {lightboxOpen && url && (
        <StyledLightboxBackdrop
          role="dialog"
          aria-modal="true"
          aria-label={attachment.name}
          onClick={() => setLightboxOpen(false)}
        >
          <StyledLightboxCard onClick={(event) => event.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <strong>{attachment.name}</strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <StyledIconButton
                  type="button"
                  aria-label={t`Download ${attachment.name}`}
                  onClick={onDownload}
                >
                  <IconDownload size={16} />
                </StyledIconButton>
                <StyledIconButton
                  type="button"
                  aria-label={t`Close preview`}
                  onClick={() => setLightboxOpen(false)}
                >
                  <IconX size={16} />
                </StyledIconButton>
              </div>
            </div>
            <img src={url} alt={attachment.name} />
          </StyledLightboxCard>
        </StyledLightboxBackdrop>
      )}
    </>
  );
};

export const ChatAttachmentView = ({
  attachments,
  onAuthorityLost,
}: ChatAttachmentViewProps) => {
  const { t } = useLingui();
  const store = useStore();
  if (!attachments.length) return null;

  const triggerDownload = async (attachment: DeliveryChatAttachment) => {
    const result = await downloadChatFileToDisk({
      store,
      attachmentId: attachment.id,
      filename: attachment.name,
    });
    if (result.unauthorized) onAuthorityLost();
  };

  return (
    <StyledAttachmentStack>
      {attachments.map((attachment) => {
        if (attachment.kind === 'VOICE') {
          return (
            <ChatVoicePlayer key={attachment.id} attachment={attachment} />
          );
        }
        if (attachment.kind === 'IMAGE') {
          return (
            <ImageAttachmentCard
              key={attachment.id}
              attachment={attachment}
              onDownload={() => void triggerDownload(attachment)}
            />
          );
        }
        const isDoc =
          attachment.mimeType === 'application/pdf' ||
          attachment.mimeType.startsWith('text/');
        return (
          <StyledFileCard key={attachment.id}>
            <StyledFileIconBox>
              {isDoc ? <IconFileText size={18} /> : <IconFile size={18} />}
            </StyledFileIconBox>
            <StyledFileMeta>
              <strong title={attachment.name}>{attachment.name}</strong>
              <small>{formatFileSize(attachment.size)}</small>
            </StyledFileMeta>
            <StyledIconButton
              type="button"
              aria-label={t`Download ${attachment.name}`}
              onClick={() => void triggerDownload(attachment)}
            >
              <IconDownload size={16} />
            </StyledIconButton>
          </StyledFileCard>
        );
      })}
    </StyledAttachmentStack>
  );
};
