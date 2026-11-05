import { useLayoutEffect, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { KnowledgeAssetFile } from '@/delivery/knowledge/assets/KnowledgeAssetFile';
import { KnowledgeUnusedUploads } from '@/delivery/knowledge/assets/KnowledgeUnusedUploads';
import {
  StyledKnowledgeAttachments,
  StyledKnowledgeSelectedFile,
} from '@/delivery/knowledge/assets/knowledgeAssetStyles';
import { useKnowledgeUpload } from '@/delivery/knowledge/assets/useKnowledgeUpload';
import {
  type KnowledgeAssetContext,
  type KnowledgeAssetSelection,
  type KnowledgeUploadReceipt,
  knowledgeAssetMetadata,
  knowledgeUploadMatchesContext,
} from '@/delivery/knowledge/assets/knowledge-assets.types';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type KnowledgeAssetAttachmentsProps = {
  context: KnowledgeAssetContext;
  selections: KnowledgeAssetSelection[];
  enabled: boolean;
  onChange: (selections: KnowledgeAssetSelection[]) => void;
  onBlockingChange: (blocked: boolean) => void;
  onAuthorityLost: () => void;
};
export const KnowledgeAssetAttachments = ({
  context,
  selections,
  enabled,
  onChange,
  onBlockingChange,
  onAuthorityLost,
}: KnowledgeAssetAttachmentsProps) => {
  const { t } = useLingui();
  const upload = useKnowledgeUpload(context, enabled, onAuthorityLost);
  const identity = JSON.stringify(context);
  // oxlint-disable-next-line twenty/no-state-useref -- Async file actions need to restore their keyboard target without taking focus from another control.
  const pendingFocus = useRef<{
    identity: string;
    opener: Element | null;
    target: 'ACTION' | 'ATTACHED' | 'CHOOSER';
    assetId?: string;
  } | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- These are native focus targets, not render state.
  const controls = useRef<HTMLDivElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- File selection transitions need stable native focus targets after their previous button is removed.
  const selectedFileNodes = useRef(new Map<string, HTMLDivElement>());
  // oxlint-disable-next-line twenty/no-state-useref -- This is a native focus target, not render state.
  const chooser = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    if (!enabled || request.identity !== identity) {
      pendingFocus.current = null;
      return;
    }
    if (upload.busy) return;
    pendingFocus.current = null;
    const active = document.activeElement;
    const target =
      request.target === 'ATTACHED'
        ? selectedFileNodes.current.get(request.assetId ?? '')
        : request.target === 'CHOOSER'
          ? chooser.current?.disabled
            ? selectedFileNodes.current.values().next().value
            : chooser.current
          : controls.current?.querySelector<HTMLButtonElement>(
              '[data-upload-next]:not(:disabled)',
            );
    if (
      target &&
      !target.closest('[hidden], [inert]') &&
      (active === request.opener ||
        active === document.body ||
        active === document.documentElement)
    )
      target.focus();
  }, [
    enabled,
    identity,
    upload.busy,
    upload.unknown,
    upload.receipt,
    upload.canRetry,
    upload.selected,
    selections,
  ]);
  const runFileAction = (
    opener: HTMLButtonElement,
    action: () => Promise<void>,
  ) => {
    pendingFocus.current = { identity, opener, target: 'ACTION' };
    void action();
  };
  const [message, setMessage] = useState('');
  const blocked = upload.busy || upload.unknown || upload.selected !== null;
  useLayoutEffect(() => {
    onBlockingChange(blocked);
  }, [blocked, onBlockingChange]);
  useDeliveryDraftStatus({
    dirty: upload.selected !== null || upload.unknown,
    saving: upload.busy,
  });
  const attachUpload = (receipt: KnowledgeUploadReceipt) => {
    if (
      !enabled ||
      receipt.state !== 'READY' ||
      !receipt.canAttach ||
      receipt.availability !== 'CURRENT' ||
      !knowledgeUploadMatchesContext(receipt, context) ||
      selections.length >= 10 ||
      selections.some((item) => item.asset.id === receipt.id)
    )
      return;
    pendingFocus.current = {
      identity,
      opener: document.activeElement,
      target: 'ATTACHED',
      assetId: receipt.id,
    };
    onChange([
      ...selections,
      { asset: knowledgeAssetMetadata(receipt), version: null },
    ]);
    if (upload.receipt?.id === receipt.id) upload.clear();
    setMessage(
      t`File added to this draft. Save the draft, then have a manager review and publish the exact version.`,
    );
  };
  return (
    <StyledKnowledgeAttachments
      aria-label={t`Brand files for this knowledge version`}
    >
      <StyledDeliveryStack>
        <h3>
          <Trans>Brand files</Trans>
        </h3>
        <p>
          <Trans>
            Add up to 10 images or PDFs, 20 MiB each. Upload privately, add the
            files to this draft, then save for manager review and publication.
          </Trans>
        </p>
        <details>
          <summary>
            <Trans>File access and limits</Trans>
          </summary>
          <p>
            <Trans>
              PNG, JPEG, WebP and PDF files are supported. Published files are
              available to authorized project staff. Agents receive your
              reviewed text; they do not read the file contents.
            </Trans>
          </p>
          <p>
            <Trans>
              Each project can retain up to 1 GiB or 500 files. Discard unused
              uploads to free space. Saved knowledge history is preserved.
            </Trans>
          </p>
          <p>
            <Trans>
              Unused uploads are limited to 20 per source and 100 per person.
            </Trans>
          </p>
        </details>
        {message && <p role="status">{message}</p>}
        {selections.map((selection) => (
          <StyledKnowledgeSelectedFile
            key={`${selection.asset.id}:${selection.asset.sha256}`}
            ref={(element) => {
              if (element)
                selectedFileNodes.current.set(selection.asset.id, element);
              else selectedFileNodes.current.delete(selection.asset.id);
            }}
            role="group"
            tabIndex={-1}
            aria-label={t`Attached file ${selection.asset.name}`}
          >
            <KnowledgeAssetFile
              sourceId={context.sourceId}
              selection={selection}
              scope={context.scope}
              enabled={enabled}
              onAuthorityLost={onAuthorityLost}
            />
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || upload.busy || upload.unknown}
              onClick={() => {
                onChange(
                  selections.filter(
                    (item) => item.asset.id !== selection.asset.id,
                  ),
                );
                setMessage(
                  t`File removed from this draft. Earlier saved versions and their files are unchanged.`,
                );
              }}
            >{t`Remove ${selection.asset.name} from draft`}</StyledDeliveryButton>
          </StyledKnowledgeSelectedFile>
        ))}
        <label>
          <Trans>Choose a brand file</Trans>
          <input
            ref={chooser}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.pdf"
            disabled={
              !enabled ||
              upload.busy ||
              upload.unknown ||
              selections.length >= 10
            }
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = '';
              void upload.select(file);
            }}
          />
        </label>
        {upload.validationMessage && (
          <p role="alert">{upload.validationMessage}</p>
        )}
        {upload.message && <p role="status">{upload.message}</p>}
        {upload.selected && (
          <>
            <p>
              {upload.selected.file.name} ·{' '}
              {t`${Math.ceil(upload.selected.file.size / 1024)} KB`}
            </p>
            <StyledDeliveryRow ref={controls}>
              {!upload.receipt && !upload.unknown && !upload.canRetry && (
                <StyledDeliveryButton
                  type="button"
                  disabled={!enabled || upload.busy}
                  onClick={(event) =>
                    runFileAction(event.currentTarget, () => upload.upload())
                  }
                >
                  <Trans>Upload privately</Trans>
                </StyledDeliveryButton>
              )}
              {upload.canRetry && !upload.unknown && (
                <StyledDeliveryButton
                  type="button"
                  disabled={!enabled || upload.busy}
                  data-upload-next="retry"
                  onClick={(event) =>
                    runFileAction(event.currentTarget, () =>
                      upload.upload(true),
                    )
                  }
                >
                  <Trans>Start a new upload attempt</Trans>
                </StyledDeliveryButton>
              )}
              {(upload.unknown || upload.receipt?.state === 'PENDING') && (
                <StyledDeliveryButton
                  type="button"
                  disabled={!enabled || upload.busy}
                  data-upload-next="check"
                  onClick={(event) =>
                    runFileAction(event.currentTarget, () => upload.check())
                  }
                >
                  <Trans>Check this upload</Trans>
                </StyledDeliveryButton>
              )}
              {upload.receipt?.canRecover && !upload.unknown && (
                <StyledDeliveryButton
                  type="button"
                  disabled={!enabled || upload.busy}
                  onClick={(event) =>
                    runFileAction(event.currentTarget, () => upload.check(true))
                  }
                >
                  <Trans>Recover stored upload</Trans>
                </StyledDeliveryButton>
              )}
              {upload.receipt?.state === 'READY' &&
                upload.receipt.canAttach &&
                !upload.unknown && (
                  <StyledDeliveryButton
                    type="button"
                    data-upload-next="use"
                    disabled={
                      !enabled || upload.busy || selections.length >= 10
                    }
                    onClick={() =>
                      upload.receipt && attachUpload(upload.receipt)
                    }
                  >
                    <Trans>Use uploaded file in this draft</Trans>
                  </StyledDeliveryButton>
                )}
              {!upload.unknown && (
                <StyledDeliveryButton
                  type="button"
                  disabled={upload.busy}
                  onClick={(event) => {
                    pendingFocus.current = {
                      identity,
                      opener: event.currentTarget,
                      target: 'CHOOSER',
                    };
                    upload.clear();
                  }}
                >
                  <Trans>Clear file selection</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </>
        )}
        {blocked && (
          <p>
            <Trans>
              Finish or clear the selected file before saving this draft. An
              uncertain upload must be checked first.
            </Trans>
          </p>
        )}
        <KnowledgeUnusedUploads
          context={context}
          enabled={enabled && !upload.busy && !upload.unknown}
          selectedIds={selections.map((item) => item.asset.id)}
          onUse={attachUpload}
          onAuthorityLost={onAuthorityLost}
        />
      </StyledDeliveryStack>
    </StyledKnowledgeAttachments>
  );
};
