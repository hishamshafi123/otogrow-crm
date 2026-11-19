import {
  StyledCreativeStageButtons,
  StyledCreativeStageSelect,
} from '@/delivery/creative/production/creative-production-styles';
import { DeliveryGuardedForm } from '@/delivery/drafts/DeliveryGuardedForm';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  DeliveryCreativeBriefForm,
  DeliveryCreativeAssemblyForm,
  DeliveryCreativeShotForm,
} from '@/delivery/DeliveryCreativeForms';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryVideoQa } from '@/delivery/creative/video-qa/DeliveryVideoQa';
import { isCreativeAssetCurrent } from '@/delivery/creative/creative-asset-current';
import { DeliveryMedia } from '@/delivery/DeliveryMedia';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isCreativeSourceUnavailable } from '@/delivery/creative/production/creative-production-errors';
import {
  type CreativeProductionActor,
  type CreativeProductionTask,
} from '@/delivery/creative/production/creative-production.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { Link, useSearchParams } from 'react-router-dom';
import { DeliveryCreativeReview } from '@/delivery/creative/review/DeliveryCreativeReview';
import { creativeReviewDestination } from '@/delivery/creative/review/creative-review-navigation';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  type CreativeAsset,
  type CreativeShot,
} from '@/delivery/delivery-creative.types';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const CHANGE_CREATIVE = gql`
  mutation ChangeDeliveryCreative($input: JSON!) {
    changeDeliveryCreative(input: $input)
  }
`;
const RENDER_CREATIVE = gql`
  mutation RenderDeliveryCreative($input: JSON!) {
    changeDeliveryMedia(input: $input)
  }
`;
type DeliveryCreativeProps = {
  task: CreativeProductionTask;
  workspace?: DeliveryWorkspace;
  actor?: CreativeProductionActor;
  canEdit?: boolean;
  stage?: string;
  onStageChange?: (stage: string) => void;
  onAuthorityLost?: () => void;
  renderApprovedReferences?: (
    reuse: (sourceTaskId: string, referenceId: string) => Promise<boolean>,
    disabled: boolean,
  ) => ReactNode;
  onChanged: () => Promise<unknown>;
  onOpenTask: () => void;
};

export const DeliveryCreative = ({
  task,
  workspace,
  actor: currentActor,
  canEdit: currentCanEdit,
  stage: currentStage,
  onStageChange,
  onAuthorityLost,
  renderApprovedReferences,
  onChanged,
  onOpenTask,
}: DeliveryCreativeProps) => {
  const { t } = useLingui();
  const store = useStore();
  const [params] = useSearchParams();
  const [mutate, mutation] = useMutation(CHANGE_CREATIVE);
  const [renderMedia, rendering] = useMutation(RENDER_CREATIVE);
  const [localStage, setStage] = useState('brief');
  const stage = currentStage ?? localStage;
  const actor = currentActor ?? workspace?.actor;
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingShot, setEditingShot] = useState<CreativeShot | null>(null);
  const permission = useWorkflowAccess();
  // oxlint-disable-next-line twenty/no-state-useref -- A stale download must not publish after its current access scope ends.
  const downloadController = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    downloadController.current?.abort();
    return () => downloadController.current?.abort();
  }, [permission.scope, permission.ready, task.id]);
  const document = task.details.creative;
  const manager = actor?.isManager === true;
  const locked = ['IN_REVIEW', 'APPROVED'].includes(task.details.state);
  const canEdit =
    currentCanEdit !== false &&
    !locked &&
    (manager || task.assigneeId === actor?.memberId);
  const [changing, setChanging] = useState(false);
  const busy = changing || mutation.loading || uploading || rendering.loading;
  const referenceDraft = useDeliveryDraft({
    initialValues: [] as string[],
    revision: task.revision,
    busy,
  });
  const selectedReferences = referenceDraft.values;
  const { requestAction } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({ dirty: false, saving: busy });
  const labels: Record<string, string> = {
    brief: t`Brief`,
    references: t`References`,
    shots: t`Shots`,
    assets: t`Media review`,
    edit: t`Edit and variants`,
    final: t`Final review`,
    generate: t`Generation`,
  };
  const kindLabels: Record<string, string> = {
    REFERENCE: t`Reference / brand asset`,
    IMAGE: t`Shot image`,
    CLIP: t`Shot clip`,
    BASE: t`Base video`,
    HOOK: t`Hook video`,
    CTA: t`CTA video`,
    FINAL:
      document?.brief.outputKind === 'IMAGE' ? t`Final image` : t`Final edit`,
    AUDIO: t`Audio`,
  };
  const headers = (): Record<string, string> => {
    if (store.get(isCookieAuthActiveState.atom)) return {};
    const token = store.get(tokenPairState.atom)?.accessOrWorkspaceAgnosticToken
      ?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const change = async (
    fields: Record<string, unknown>,
    revision = task.revision,
  ) => {
    setError('');
    setChanging(true);
    try {
      await mutate({
        variables: {
          input: { ...fields, taskId: task.id, revision },
        },
      });
    } catch (failure) {
      if (isCreativeSourceUnavailable(failure)) {
        // Reopening can deny a native status write while the creative remains readable.
        try {
          await onChanged();
        } catch (readFailure) {
          if (isCreativeSourceUnavailable(readFailure)) onAuthorityLost?.();
        }
      }
      setError(
        failure instanceof Error
          ? failure.message
          : t`Unable to save creative work.`,
      );
      setChanging(false);
      return false;
    }
    try {
      await onChanged();
    } catch {
      setError(
        t`Creative work was saved, but this page could not refresh. Refresh before making another change.`,
      );
    }
    setChanging(false);
    return true;
  };
  const upload = async (data: FormData, revision: number) => {
    data.set('revision', String(revision));
    if (!String(data.get('shotId') ?? '')) data.delete('shotId');
    setUploading(true);
    setError('');
    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/delivery-creative/${task.id}/assets`,
        {
          method: 'POST',
          headers: headers(),
          credentials: 'include',
          body: data,
        },
      );
      if (!response.ok) {
        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404
        )
          onAuthorityLost?.();
        const body = await response.json();
        throw new Error(
          typeof body.message === 'string'
            ? body.message
            : t`Upload failed. Refresh and try again.`,
        );
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t`Upload failed.`);
      setUploading(false);
      return false;
    }
    try {
      await onChanged();
    } catch {
      setError(
        t`Asset uploaded, but this page could not refresh. Refresh before making another change.`,
      );
    }
    setUploading(false);
    return true;
  };
  const downloadAsset = async (asset: CreativeAsset) => {
    if (!permission.ready) return;
    downloadController.current?.abort();
    const controller = new AbortController();
    downloadController.current = controller;
    setError('');
    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/delivery-creative/${task.id}/assets/${asset.id}`,
        {
          headers: headers(),
          credentials: 'include',
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) onAuthorityLost?.();
        throw new Error(
          t`Asset is unavailable. Your project access may have changed.`,
        );
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (
        !blob.size ||
        blob.size !== asset.size ||
        blob.size > 100 * 1024 * 1024
      )
        throw new Error(
          t`The asset could not be downloaded completely. Refresh before retrying.`,
        );
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = asset.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : t`Unable to download asset.`,
        );
    }
  };
  if (!document)
    return (
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <h3>
            <Trans>From idea to final creative</Trans>
          </h3>
          <p>
            <Trans>
              Build a brief, approve references and organize each shot. Your
              task owner and final reviewer stay the same.
            </Trans>
          </p>
          <StyledDeliveryButton
            disabled={!canEdit || busy}
            onClick={() => void change({ action: 'initialize' })}
          >
            <Trans>Start creative production</Trans>
          </StyledDeliveryButton>
          {error && <p role="alert">{error}</p>}
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    );
  const approved = (asset: CreativeAsset) =>
    asset.reviews.at(-1)?.decision === 'APPROVED';
  const current = (asset: CreativeAsset) =>
    isCreativeAssetCurrent(document, asset);
  const readyAssets = document.assets.filter(
    (asset) => approved(asset) && current(asset),
  );
  const selectedCount = document.variants.filter(
    (variant) => variant.selected,
  ).length;
  const exportManifest = () => {
    const manifest = {
      taskId: task.id,
      title: task.title,
      projectId: task.projectId,
      creativeVersion: document.version,
      brief: document.brief,
      shots: document.shots,
      references: document.references,
      assets: readyAssets,
      assembly: document.assembly,
      variants: document.variants.filter((variant) => variant.selected),
      note: 'Asset downloads require current project access. References are uninspected links unless reviewed by a person. Final manager approval is separate.',
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(manifest, null, 2)], {
        type: 'application/json',
      }),
    );
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `creative-${task.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const selectStage = (nextStage: string) => {
    if (nextStage === stage) return;
    requestAction(() => {
      referenceDraft.markSaved([]);
      if (onStageChange) onStageChange(nextStage);
      else setStage(nextStage);
    });
  };
  return (
    <StyledDeliveryStack>
      <nav aria-label={t`Creative stages`}>
        <StyledCreativeStageButtons>
          {Object.entries(labels).map(([id, label]) => (
            <StyledDeliveryButton
              key={id}
              type="button"
              aria-current={stage === id ? 'step' : undefined}
              onClick={() => selectStage(id)}
            >
              {label}
            </StyledDeliveryButton>
          ))}
        </StyledCreativeStageButtons>
        <StyledCreativeStageSelect>
          <Trans>Production stage</Trans>
          <select
            value={stage}
            onChange={(event) => selectStage(event.target.value)}
          >
            {Object.entries(labels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </StyledCreativeStageSelect>
      </nav>
      {error && <p role="alert">{error}</p>}
      {params.has('creativeAsset') && (
        <DeliveryCreativeReview
          taskId={task.id}
          taskRevision={task.revision}
          targetKind="ASSET"
        />
      )}
      {locked && (
        <p role="status">
          <Trans>
            Creative production is locked during final review or after approval.
          </Trans>
        </p>
      )}
      {(stage === 'generate' ||
        stage === 'final' ||
        params.has('creativeQaRequest') ||
        params.has('creativeQaRun')) && (
        <DeliveryVideoQa
          key={stage}
          task={task}
          onChanged={onChanged}
          onAuthorityLost={onAuthorityLost}
        />
      )}
      {stage === 'generate' && (
        <DeliveryMedia
          task={task}
          actor={actor}
          onAuthorityLost={onAuthorityLost}
          onChanged={onChanged}
        />
      )}
      {stage === 'brief' && (
        <StyledDeliveryCard>
          <DeliveryCreativeBriefForm
            document={document}
            revision={task.revision}
            canEdit={canEdit}
            busy={busy}
            manager={manager}
            save={change}
            onApprove={() => change({ action: 'approveBrief' })}
          />
        </StyledDeliveryCard>
      )}
      {stage === 'brief' && document.briefHistory.length > 0 && (
        <details>
          <summary>{t`Previous brief versions`}</summary>
          {document.briefHistory.map((previous) => (
            <StyledDeliveryCard key={previous.version}>
              <strong>
                v{previous.version} ·{' '}
                {previous.approved ? t`Previously approved` : t`Draft`}
              </strong>
              <pre style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(previous.brief, null, 2)}
              </pre>
            </StyledDeliveryCard>
          ))}
        </details>
      )}
      {stage === 'references' && (
        <>
          <StyledDeliveryCard>
            <DeliveryGuardedForm
              revision={task.revision}
              busy={busy}
              disabled={!canEdit}
              onSave={(data, revision) =>
                change(
                  {
                    action: 'reference',
                    fields: {
                      title: data.get('title'),
                      url: String(data.get('url') ?? '') || null,
                      assetId: String(data.get('assetId') ?? '') || null,
                      summary: data.get('summary'),
                      angle: data.get('angle'),
                      tags: String(data.get('tags') ?? '')
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    },
                  },
                  revision,
                )
              }
            >
              <StyledDeliveryStack>
                <h4>
                  <Trans>Propose a reference</Trans>
                </h4>
                <fieldset disabled={!canEdit || busy}>
                  <StyledDeliveryGrid>
                    {[
                      ['title', t`Title`],
                      ['url', t`Reference URL`],
                      ['summary', t`Summary`],
                      ['angle', t`Angle`],
                      ['tags', t`Tags, separated by commas`],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <input
                          name={name}
                          required={name === 'title'}
                          type={name === 'url' ? 'url' : 'text'}
                        />
                      </label>
                    ))}
                    <label>
                      <Trans>Or uploaded reference</Trans>
                      <select name="assetId">
                        <option value="">{t`Choose asset`}</option>
                        {document.assets
                          .filter((asset) => asset.kind === 'REFERENCE')
                          .map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </StyledDeliveryGrid>
                  <StyledDeliveryButton type="submit">
                    <Trans>Add reference</Trans>
                  </StyledDeliveryButton>
                </fieldset>
              </StyledDeliveryStack>
            </DeliveryGuardedForm>
          </StyledDeliveryCard>
          {referenceDraft.stale && (
            <DeliveryDraftConflict
              onReload={referenceDraft.reload}
              busy={busy}
            />
          )}
          {manager && (
            <StyledDeliveryRow>
              <StyledDeliveryButton
                disabled={
                  !canEdit ||
                  busy ||
                  referenceDraft.stale ||
                  !selectedReferences.length
                }
                onClick={async () => {
                  if (
                    await change(
                      {
                        action: 'reviewReferences',
                        ids: selectedReferences,
                        decision: 'APPROVED',
                        notes: '',
                      },
                      referenceDraft.revision,
                    )
                  )
                    referenceDraft.markSaved([]);
                }}
              >
                <Trans>Approve selected references</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                disabled={
                  !canEdit ||
                  busy ||
                  referenceDraft.stale ||
                  !selectedReferences.length
                }
                onClick={async () => {
                  if (
                    await change(
                      {
                        action: 'reviewReferences',
                        ids: selectedReferences,
                        decision: 'REJECTED',
                        notes: '',
                      },
                      referenceDraft.revision,
                    )
                  )
                    referenceDraft.markSaved([]);
                }}
              >
                <Trans>Reject selected</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          )}
          <StyledDeliveryGrid>
            {document.references.map((reference) => (
              <StyledDeliveryCard key={reference.id}>
                <StyledDeliveryStack>
                  {manager && (
                    <label>
                      <input
                        type="checkbox"
                        disabled={!canEdit || busy || referenceDraft.stale}
                        checked={selectedReferences.includes(reference.id)}
                        onChange={(event) =>
                          referenceDraft.update(
                            event.target.checked
                              ? [...selectedReferences, reference.id]
                              : selectedReferences.filter(
                                  (id) => id !== reference.id,
                                ),
                          )
                        }
                      />
                      {t`Select`} {reference.title}
                    </label>
                  )}
                  <strong>{reference.title}</strong>
                  <p>{reference.summary}</p>
                  <small>
                    {reference.angle} · {reference.tags.join(', ')}
                  </small>
                  {reference.url && (
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer"
                    >{t`Open reference · content not automatically inspected`}</a>
                  )}
                  <StyledDeliveryBadge>
                    {reference.reviews.at(-1)?.decision === 'APPROVED'
                      ? t`Approved reference`
                      : reference.reviews.at(-1)?.decision === 'REJECTED'
                        ? t`Rejected`
                        : t`Awaiting approval`}
                  </StyledDeliveryBadge>
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            ))}
          </StyledDeliveryGrid>
          <StyledDeliveryCard>
            <h4>
              <Trans>Reuse an approved reference</Trans>
            </h4>
            {renderApprovedReferences
              ? renderApprovedReferences(
                  (sourceTaskId, referenceId) =>
                    change({
                      action: 'reuseReference',
                      sourceTaskId,
                      referenceId,
                    }),
                  !canEdit || busy,
                )
              : workspace?.tasks
                  .filter(
                    (source) =>
                      source.projectId === task.projectId &&
                      source.id !== task.id,
                  )
                  .flatMap((source) =>
                    (source.details.creative?.references ?? [])
                      .filter(
                        (reference) =>
                          Boolean(reference.url) &&
                          reference.reviews.at(-1)?.decision === 'APPROVED',
                      )
                      .map((reference) => (
                        <StyledDeliveryButton
                          key={reference.id}
                          disabled={!canEdit || busy}
                          onClick={() =>
                            void change({
                              action: 'reuseReference',
                              sourceTaskId: source.id,
                              referenceId: reference.id,
                            })
                          }
                        >
                          {source.title} · {reference.title}
                        </StyledDeliveryButton>
                      )),
                  )}
          </StyledDeliveryCard>
        </>
      )}
      {stage === 'shots' && (
        <>
          <p>
            <Trans>
              Approve an image and select it before uploading its animated clip.
              Shot changes preserve previous versions and invalidate dependent
              work.
            </Trans>
          </p>
          <StyledDeliveryGrid>
            {document.shots.map((shot, index) => (
              <StyledDeliveryCard key={shot.id}>
                <StyledDeliveryStack>
                  <strong>
                    {index + 1}. {shot.title} · v{shot.version}
                  </strong>
                  {shot.history.length > 0 && (
                    <details>
                      <summary>{t`Previous shot versions`}</summary>
                      {shot.history.map((previous) => (
                        <div key={previous.version}>
                          <strong>
                            v{previous.version} · {previous.title}
                          </strong>
                          <p>{previous.imagePrompt}</p>
                          <p>{previous.animationPrompt}</p>
                        </div>
                      ))}
                    </details>
                  )}
                  <p>{shot.imagePrompt}</p>
                  <p>{shot.animationPrompt}</p>
                  <small>
                    {shot.duration}s ·{' '}
                    {shot.imageId ? t`Image selected` : t`Needs image`} ·{' '}
                    {shot.clipId ? t`Clip selected` : t`Needs clip`}
                  </small>
                  <StyledDeliveryButton
                    disabled={!canEdit}
                    onClick={() => requestAction(() => setEditingShot(shot))}
                  >
                    <Trans>Edit shot</Trans>
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    disabled={!canEdit || busy || index === 0}
                    onClick={() => {
                      const ids = document.shots.map((item) => item.id);
                      [ids[index - 1], ids[index]] = [
                        ids[index],
                        ids[index - 1],
                      ];
                      void change({ action: 'order', ids });
                    }}
                  >
                    <Trans>Move up</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            ))}
          </StyledDeliveryGrid>
          <StyledDeliveryCard>
            <DeliveryCreativeShotForm
              key={editingShot?.id ?? 'new-shot'}
              shot={document.shots.find((shot) => shot.id === editingShot?.id)}
              document={document}
              revision={task.revision}
              canEdit={canEdit}
              busy={busy}
              save={change}
              onSaved={() => setEditingShot(null)}
              onCancel={() => requestAction(() => setEditingShot(null))}
            />
          </StyledDeliveryCard>
        </>
      )}
      {stage === 'assets' && (
        <>
          <StyledDeliveryCard>
            <h4>
              <Trans>Upload production assets</Trans>
            </h4>
            <p>
              <Trans>
                PNG, JPEG, WebP, MP4, WebM, MOV or audio. Maximum 100 MB per
                file. No generation connection is needed.
              </Trans>
            </p>
            <DeliveryGuardedForm
              revision={task.revision}
              busy={busy}
              disabled={!canEdit}
              onSave={upload}
            >
              <fieldset disabled={!canEdit || busy}>
                <StyledDeliveryRow>
                  <label>
                    <Trans>File</Trans>
                    <input
                      type="file"
                      name="file"
                      required
                      accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/*"
                    />
                  </label>
                  <label>
                    <Trans>Asset type</Trans>
                    <select name="kind">
                      {Object.entries(kindLabels).map(([kind, label]) => (
                        <option key={kind} value={kind}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <Trans>Shot, for images and clips</Trans>
                    <select name="shotId">
                      <option value="">{t`Not a shot asset`}</option>
                      {document.shots.map((shot) => (
                        <option value={shot.id} key={shot.id}>
                          {shot.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <StyledDeliveryButton type="submit">
                    {uploading ? t`Uploading…` : t`Upload asset`}
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
              </fieldset>
            </DeliveryGuardedForm>
          </StyledDeliveryCard>
          <p>
            <Trans>
              Check realism, product accuracy, anatomy and teeth when relevant,
              and physical plausibility. With a supported connected model, use
              Generation to inspect selected still images. Motion and audio
              still require human review.
            </Trans>
          </p>
          <StyledDeliveryGrid>
            {document.assets.map((asset) => (
              <StyledDeliveryCard key={asset.id}>
                <StyledDeliveryStack>
                  <strong>{asset.name}</strong>
                  <small>
                    {kindLabels[asset.kind]} ·{' '}
                    {(asset.size / 1024 / 1024).toFixed(1)} MB ·{' '}
                    {current(asset) ? t`Current version` : t`Outdated`}
                  </small>
                  <StyledDeliveryBadge>
                    {asset.reviews.at(-1)?.decision === 'APPROVED'
                      ? t`Approved intermediate asset`
                      : asset.reviews.at(-1)?.decision === 'ESCALATED'
                        ? t`Needs manager review`
                        : asset.reviews.at(-1)?.decision === 'REJECTED'
                          ? t`Rejected`
                          : t`Not reviewed`}
                  </StyledDeliveryBadge>
                  <StyledDeliveryRow>
                    <Link
                      to={creativeReviewDestination(params, {
                        panel: 'creative',
                        creativeAsset: asset.id,
                        creativeSubmission: null,
                        creativeCompare: null,
                        creativeFeedback: null,
                        creativeFeedbackAfter: null,
                        creativeFeedbackBefore: null,
                        creativeSubmissionsBefore: null,
                      })}
                    >
                      <Trans>Review asset and precise feedback</Trans>
                    </Link>
                    <Link
                      to={creativeReviewDestination(params, {
                        panel: 'creative',
                        creativeAsset: asset.id,
                        creativeSubmission: null,
                        creativeCompare: null,
                        creativeFeedback: null,
                        creativeFeedbackAfter: null,
                        creativeFeedbackBefore: null,
                        creativeSubmissionsBefore: null,
                      })}
                    >
                      <Trans>Preview</Trans>
                    </Link>
                    <StyledDeliveryButton
                      disabled={!permission.ready}
                      onClick={() => void downloadAsset(asset)}
                    >
                      <Trans>Download</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                  {asset.kind !== 'FINAL' && (
                    <DeliveryGuardedForm
                      revision={task.revision}
                      busy={busy}
                      disabled={
                        !canEdit ||
                        !current(asset) ||
                        (!manager &&
                          asset.reviews.at(-1)?.decision === 'ESCALATED')
                      }
                      onSave={(data, revision) =>
                        change(
                          {
                            action: 'reviewAsset',
                            assetId: asset.id,
                            decision: data.get('decision'),
                            notes: data.get('notes'),
                          },
                          revision,
                        )
                      }
                    >
                      <fieldset
                        disabled={
                          !canEdit ||
                          busy ||
                          !current(asset) ||
                          (!manager &&
                            asset.reviews.at(-1)?.decision === 'ESCALATED')
                        }
                      >
                        <label>
                          <Trans>Review notes</Trans>
                          <textarea name="notes" />
                        </label>
                        <label>
                          <Trans>Decision</Trans>
                          <select name="decision">
                            <option value="APPROVED">{t`Approve intermediate asset`}</option>
                            <option value="REJECTED">{t`Reject`}</option>
                            <option value="ESCALATED">{t`Ask project manager`}</option>
                          </select>
                        </label>
                        <StyledDeliveryButton type="submit">
                          <Trans>Save review</Trans>
                        </StyledDeliveryButton>
                      </fieldset>
                    </DeliveryGuardedForm>
                  )}
                  {['IMAGE', 'CLIP', 'FINAL'].includes(asset.kind) && (
                    <StyledDeliveryButton
                      disabled={
                        !canEdit ||
                        busy ||
                        !current(asset) ||
                        (asset.kind !== 'FINAL' && !approved(asset))
                      }
                      onClick={() =>
                        void change({
                          action: 'selectAsset',
                          assetId: asset.id,
                        })
                      }
                    >
                      <Trans>Use this version</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            ))}
          </StyledDeliveryGrid>
        </>
      )}
      {stage === 'edit' && (
        <>
          <StyledDeliveryButton
            disabled={!canEdit || busy || !document.assembly.assetIds.length}
            onClick={() =>
              requestAction(async () => {
                setError('');
                try {
                  await renderMedia({
                    variables: {
                      input: {
                        action: 'render',
                        taskId: task.id,
                        revision: task.revision,
                        requestId: crypto.randomUUID(),
                        confirm: true,
                      },
                    },
                  });
                  await onChanged();
                  setStage('generate');
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : t`Unable to queue draft render.`,
                  );
                }
              })
            }
          >
            <Trans>Render saved assembly as a draft</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryCard>
            <h4>
              <Trans>Assembly plan</Trans>
            </h4>
            <p>
              <Trans>
                Choose approved clips in playback order. Export the manifest and
                assets for editing. Draft rendering joins up to 12 clips, using
                at most 10 seconds of each. It removes source audio and uses
                only your selected soundtrack. Text overlays require external
                editing.
              </Trans>
            </p>
            <DeliveryCreativeAssemblyForm
              document={document}
              revision={task.revision}
              canEdit={canEdit}
              busy={busy}
              save={change}
            />
          </StyledDeliveryCard>
          {document.assembly.assetIds.map((id, index) => (
            <StyledDeliveryRow key={`${id}-${index}`}>
              <span>
                {index + 1}.{' '}
                {document.assets.find((asset) => asset.id === id)?.name}
              </span>
              <StyledDeliveryButton
                disabled={!canEdit || busy || index === 0}
                onClick={() => {
                  const assetIds = [...document.assembly.assetIds];
                  [assetIds[index - 1], assetIds[index]] = [
                    assetIds[index],
                    assetIds[index - 1],
                  ];
                  void change({
                    action: 'assembly',
                    ...document.assembly,
                    assetIds,
                  });
                }}
              >
                <Trans>Move earlier in edit</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          ))}
          <StyledDeliveryCard>
            <h4>
              <Trans>Hook × CTA variants</Trans>
            </h4>
            <DeliveryGuardedForm
              revision={task.revision}
              busy={busy}
              disabled={!canEdit}
              onSave={(data, revision) =>
                change(
                  {
                    action: 'variants',
                    baseId: data.get('baseId'),
                    hookIds: data.getAll('hookIds'),
                    ctaIds: data.getAll('ctaIds'),
                  },
                  revision,
                )
              }
            >
              <fieldset disabled={!canEdit || busy}>
                <StyledDeliveryGrid>
                  {[
                    ['BASE', 'baseId', t`Base video`],
                    ['HOOK', 'hookIds', t`Hooks — up to three`],
                    ['CTA', 'ctaIds', t`CTAs — up to three`],
                  ].map(([kind, name, label]) => (
                    <label key={kind}>
                      {label}
                      <select name={name} multiple={kind !== 'BASE'} required>
                        {readyAssets
                          .filter((asset) => asset.kind === kind)
                          .map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </StyledDeliveryGrid>
                <StyledDeliveryButton type="submit">
                  <Trans>Build variant matrix</Trans>
                </StyledDeliveryButton>
              </fieldset>
            </DeliveryGuardedForm>
            {document.variants.map((variant) => (
              <StyledDeliveryRow key={variant.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={variant.selected}
                    disabled={!canEdit || busy}
                    onChange={(event) =>
                      void change({
                        action: 'selectVariants',
                        ids: document.variants
                          .filter((item) =>
                            item.id === variant.id
                              ? event.target.checked
                              : item.selected,
                          )
                          .map((item) => item.id),
                      })
                    }
                  />
                  {
                    document.assets.find((asset) => asset.id === variant.hookId)
                      ?.name
                  }{' '}
                  +{' '}
                  {
                    document.assets.find((asset) => asset.id === variant.baseId)
                      ?.name
                  }{' '}
                  +{' '}
                  {
                    document.assets.find((asset) => asset.id === variant.ctaId)
                      ?.name
                  }
                </label>
                <StyledDeliveryButton
                  disabled={!canEdit || busy || !variant.selected}
                  onClick={() =>
                    void change({
                      action: 'assembly',
                      assetIds: [variant.hookId, variant.baseId, variant.ctaId],
                      audioId: document.assembly.audioId,
                      overlayText: '',
                      notes: `Variant ${variant.id}`,
                    })
                  }
                >
                  <Trans>Use this variant as the edit plan</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            ))}
          </StyledDeliveryCard>
        </>
      )}
      {stage === 'final' && (
        <StyledDeliveryCard>
          <StyledDeliveryButton onClick={() => requestAction(onOpenTask)}>
            <Trans>Open task submission and final approval</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryStack>
            <h4>
              <Trans>Ready for manager review?</Trans>
            </h4>
            <p>
              {document.finalAssetId
                ? document.brief.outputKind === 'IMAGE'
                  ? t`A final image is selected. Submit it from the task's delivery controls.`
                  : t`A final edit is selected. Submit it from the task's delivery controls.`
                : document.brief.outputKind === 'IMAGE'
                  ? t`Upload a final image in Media review and choose “Use this version”.`
                  : t`Upload a final edit in Media review and choose “Use this version”.`}
            </p>
            <p>
              {document.brief.outputKind === 'IMAGE'
                ? t`The current brief and selected final image must be ready before submission. No video clips are required. Final approval stays with the assigned manager.`
                : t`The current brief and every shot image and clip must be approved before submission. Final approval stays with the assigned manager.`}
            </p>
            {document.revisionCharge > 0 && (
              <small>
                <Trans>Legacy revision amount</Trans>: {document.revisionCharge}{' '}
                ·{' '}
                <Trans>
                  Currency was not recorded; excluded from cost reports.
                </Trans>
              </small>
            )}
            <small>
              <Trans>
                Track the reason, effort and optional charge in the task's
                Revision rounds after reopening. New charges default to zero.
              </Trans>
            </small>
            <DeliveryGuardedForm
              revision={task.revision}
              busy={busy}
              visible={manager && locked}
              onSave={(data, revision) =>
                change(
                  {
                    action: 'reopen',
                    notes: data.get('notes'),
                  },
                  revision,
                )
              }
            >
              <label>
                <Trans>Revision request</Trans>
                <textarea name="notes" required />
              </label>
              <StyledDeliveryButton type="submit" disabled={busy}>
                <Trans>Reopen for revision</Trans>
              </StyledDeliveryButton>
            </DeliveryGuardedForm>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
      <StyledDeliveryRow>
        <small>
          <Trans>One unique concept</Trans>, {selectedCount}{' '}
          <Trans>selected variants</Trans> · v{document.version}
        </small>
        <StyledDeliveryButton onClick={exportManifest} data-variant="quiet">
          <Trans>Export edit manifest</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
    </StyledDeliveryStack>
  );
};
