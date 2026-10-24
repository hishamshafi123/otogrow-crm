import { DeliveryMedia } from '@/delivery/DeliveryMedia';
import { useEffect, useState, type FormEvent } from 'react';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import {
  type CreativeAsset,
  type CreativeBrief,
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
  task: DeliveryTask;
  workspace: DeliveryWorkspace;
  onChanged: () => Promise<unknown>;
  onOpenTask: () => void;
};

export const DeliveryCreative = ({
  task,
  workspace,
  onChanged,
  onOpenTask,
}: DeliveryCreativeProps) => {
  const { t } = useLingui();
  const store = useStore();
  const [mutate, mutation] = useMutation(CHANGE_CREATIVE);
  const [renderMedia, rendering] = useMutation(RENDER_CREATIVE);
  const [stage, setStage] = useState('brief');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedReferences, setSelectedReferences] = useState<string[]>([]);
  const [editingShot, setEditingShot] = useState<CreativeShot | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    asset: CreativeAsset;
  } | null>(null);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);
  const document = task.details.creative;
  const manager = workspace.actor.isManager;
  const locked = ['IN_REVIEW', 'APPROVED'].includes(task.details.state);
  const canEdit =
    !locked && (manager || task.assigneeId === workspace.actor.memberId);
  const busy = mutation.loading || uploading || rendering.loading;
  const labels: Record<string, string> = {
    brief: t`Brief`,
    references: t`References`,
    shots: t`Shots`,
    assets: t`Media review`,
    edit: t`Edit and variants`,
    final: t`Final review`,
    generate: t`Generation`,
  };
  const briefLabels: Record<string, string> = {
    audience: t`Audience`,
    painPoint: t`Customer pain point`,
    angle: t`Angle`,
    concept: t`Concept`,
    productFacts: t`Approved product facts`,
    mandatoryClaims: t`Required claims and disclaimers`,
    visualDirection: t`Visual direction`,
    format: t`Aspect ratio / format`,
    hook: t`Hook`,
    cta: t`Call to action`,
    music: t`Music notes`,
  };
  const kindLabels: Record<string, string> = {
    REFERENCE: t`Reference / brand asset`,
    IMAGE: t`Shot image`,
    CLIP: t`Shot clip`,
    BASE: t`Base video`,
    HOOK: t`Hook video`,
    CTA: t`CTA video`,
    FINAL: t`Final edit`,
    AUDIO: t`Audio`,
  };
  const headers = (): Record<string, string> => {
    if (store.get(isCookieAuthActiveState.atom)) return {};
    const token = store.get(tokenPairState.atom)?.accessOrWorkspaceAgnosticToken
      ?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const change = async (fields: Record<string, unknown>) => {
    setError('');
    try {
      await mutate({
        variables: {
          input: { ...fields, taskId: task.id, revision: task.revision },
        },
      });
      await onChanged();
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Unable to save creative work.`,
      );
      return false;
    }
  };
  const values = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return new FormData(event.currentTarget);
  };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    const data = values(event);
    data.set('revision', String(task.revision));
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
        const body = await response.json();
        throw new Error(
          typeof body.message === 'string'
            ? body.message
            : t`Upload failed. Refresh and try again.`,
        );
      }
      await onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t`Upload failed.`);
    } finally {
      setUploading(false);
    }
  };
  const openAsset = async (asset: CreativeAsset, download = false) => {
    setError('');
    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/delivery-creative/${task.id}/assets/${asset.id}`,
        { headers: headers(), credentials: 'include' },
      );
      if (!response.ok)
        throw new Error(
          t`Asset is unavailable. Your project access may have changed.`,
        );
      const url = URL.createObjectURL(await response.blob());
      if (download) {
        const link = window.document.createElement('a');
        link.href = url;
        link.download = asset.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        if (preview) URL.revokeObjectURL(preview.url);
        setPreview({ url, asset });
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t`Unable to open asset.`,
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
  const current = (asset: CreativeAsset) => {
    if (asset.storageState !== 'READY') return false;
    if (['REFERENCE', 'AUDIO'].includes(asset.kind)) return true;
    if (asset.briefVersion !== document.briefVersion) return false;
    if (
      ['BASE', 'FINAL'].includes(asset.kind) &&
      asset.productionVersion !== document.productionVersion
    )
      return false;
    if (
      asset.kind === 'FINAL' &&
      asset.assemblyVersion !== document.assemblyVersion
    )
      return false;
    const shot = document.shots.find((item) => item.id === asset.shotId);
    return (
      !asset.shotId ||
      (!!shot &&
        shot.version === asset.shotVersion &&
        (asset.kind !== 'CLIP' || shot.imageId === asset.parentAssetId))
    );
  };
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
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <div>
          <h3>
            <Trans>Creative production</Trans>
          </h3>
          <small>
            <Trans>One unique concept</Trans> · {selectedCount}{' '}
            <Trans>selected variants</Trans> · v{document.version}
          </small>
        </div>
        <StyledDeliveryButton onClick={exportManifest}>
          <Trans>Export edit manifest</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      <nav aria-label={t`Creative stages`}>
        <StyledDeliveryRow>
          {Object.entries(labels).map(([id, label]) => (
            <StyledDeliveryButton
              key={id}
              aria-current={stage === id ? 'step' : undefined}
              onClick={() => setStage(id)}
            >
              {label}
            </StyledDeliveryButton>
          ))}
        </StyledDeliveryRow>
      </nav>
      {error && <p role="alert">{error}</p>}
      {locked && (
        <p role="status">
          <Trans>
            Creative production is locked during final review or after approval.
          </Trans>
        </p>
      )}
      {preview && (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <strong>{preview.asset.name}</strong>
              <StyledDeliveryButton
                onClick={() => {
                  URL.revokeObjectURL(preview.url);
                  setPreview(null);
                }}
              >
                <Trans>Close preview</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
            {preview.asset.mimeType.startsWith('image/') ? (
              <img
                src={preview.url}
                alt={preview.asset.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: 480,
                  objectFit: 'contain',
                }}
              />
            ) : preview.asset.mimeType.startsWith('video/') ? (
              <video
                src={preview.url}
                controls
                style={{ maxWidth: '100%', maxHeight: 480 }}
              />
            ) : (
              <audio src={preview.url} controls />
            )}
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
      {stage === 'generate' && (
        <DeliveryMedia
          task={task}
          workspace={workspace}
          onChanged={onChanged}
        />
      )}
      {stage === 'brief' && (
        <StyledDeliveryCard>
          <form
            key={`brief-${document.briefVersion}`}
            onSubmit={(event) => {
              const data = values(event);
              const brief = {
                ...document.brief,
                ...Object.fromEntries(
                  Object.keys(briefLabels).map((key) => [
                    key,
                    String(data.get(key) ?? ''),
                  ]),
                ),
                objective: data.get('objective'),
                duration: Number(data.get('duration')),
                brandAssets: data.getAll('brandAssets'),
              };
              void change({ action: 'brief', brief });
            }}
          >
            <StyledDeliveryStack>
              <StyledDeliveryRow>
                <h4>
                  <Trans>Brief</Trans> · v{document.briefVersion}
                </h4>
                <StyledDeliveryBadge>
                  {document.approvedBriefVersion === document.briefVersion
                    ? t`Approved`
                    : t`Needs manager approval`}
                </StyledDeliveryBadge>
              </StyledDeliveryRow>
              <p>
                <Trans>
                  Leave unknown facts blank. Changing the brief makes dependent
                  production approvals outdated.
                </Trans>
              </p>
              <fieldset
                disabled={!manager || !canEdit || busy}
                style={{ border: 0, padding: 0 }}
              >
                <StyledDeliveryGrid>
                  <label>
                    <Trans>Objective</Trans>
                    <select
                      name="objective"
                      defaultValue={document.brief.objective}
                    >
                      <option value="ADS">{t`Performance ad`}</option>
                      <option value="ORGANIC">{t`Organic brand content`}</option>
                    </select>
                  </label>
                  <label>
                    <Trans>Duration in seconds</Trans>
                    <input
                      name="duration"
                      type="number"
                      min={1}
                      max={300}
                      defaultValue={document.brief.duration}
                    />
                  </label>
                  {Object.entries(briefLabels).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <textarea
                        name={key}
                        maxLength={6000}
                        rows={3}
                        defaultValue={String(
                          document.brief[key as keyof CreativeBrief] ?? '',
                        )}
                      />
                    </label>
                  ))}
                </StyledDeliveryGrid>
                <label>
                  <Trans>Brand assets</Trans>
                  <select
                    name="brandAssets"
                    multiple
                    defaultValue={document.brief.brandAssets}
                  >
                    {document.assets
                      .filter((asset) => asset.kind === 'REFERENCE')
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                  </select>
                </label>
                <StyledDeliveryButton type="submit">
                  <Trans>Save new brief version</Trans>
                </StyledDeliveryButton>
              </fieldset>
              {manager && (
                <StyledDeliveryButton
                  disabled={
                    !canEdit ||
                    busy ||
                    document.approvedBriefVersion === document.briefVersion
                  }
                  onClick={() => void change({ action: 'approveBrief' })}
                >
                  <Trans>Approve current brief</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryStack>
          </form>
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
            <form
              onSubmit={async (event) => {
                const form = event.currentTarget;
                const data = values(event);
                if (
                  await change({
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
                  })
                )
                  form.reset();
              }}
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
            </form>
          </StyledDeliveryCard>
          {manager && (
            <StyledDeliveryRow>
              <StyledDeliveryButton
                disabled={!canEdit || busy || !selectedReferences.length}
                onClick={async () => {
                  if (
                    await change({
                      action: 'reviewReferences',
                      ids: selectedReferences,
                      decision: 'APPROVED',
                      notes: '',
                    })
                  )
                    setSelectedReferences([]);
                }}
              >
                <Trans>Approve selected references</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                disabled={!canEdit || busy || !selectedReferences.length}
                onClick={() =>
                  void change({
                    action: 'reviewReferences',
                    ids: selectedReferences,
                    decision: 'REJECTED',
                    notes: '',
                  })
                }
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
                        checked={selectedReferences.includes(reference.id)}
                        onChange={(event) =>
                          setSelectedReferences(
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
            {workspace.tasks
              .filter(
                (source) =>
                  source.projectId === task.projectId && source.id !== task.id,
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
                    onClick={() => setEditingShot(shot)}
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
            <form
              key={
                editingShot
                  ? `${editingShot.id}-${editingShot.version}`
                  : 'new-shot'
              }
              onSubmit={async (event) => {
                const form = event.currentTarget;
                const data = values(event);
                if (
                  await change({
                    action: 'shot',
                    ...(editingShot ? { id: editingShot.id } : {}),
                    fields: {
                      title: data.get('title'),
                      imagePrompt: data.get('imagePrompt'),
                      animationPrompt: data.get('animationPrompt'),
                      duration: Number(data.get('duration')),
                      subject: data.get('subject'),
                      product: data.get('product'),
                      location: data.get('location'),
                      notes: data.get('notes'),
                      referenceId:
                        String(data.get('referenceId') ?? '') || null,
                    },
                  })
                ) {
                  setEditingShot(null);
                  form.reset();
                }
              }}
            >
              <StyledDeliveryStack>
                <h4>{editingShot ? t`Edit shot` : t`Add shot`}</h4>
                <fieldset disabled={!canEdit || busy}>
                  <StyledDeliveryGrid>
                    {[
                      ['title', t`Shot title`],
                      ['imagePrompt', t`Image prompt`],
                      ['animationPrompt', t`Animation prompt`],
                      ['subject', t`Subject`],
                      ['product', t`Product details`],
                      ['location', t`Location`],
                      ['notes', t`Notes`],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <textarea
                          name={name}
                          required={name === 'title'}
                          defaultValue={String(
                            editingShot?.[name as keyof CreativeShot] ?? '',
                          )}
                        />
                      </label>
                    ))}
                    <label>
                      <Trans>Duration in seconds</Trans>
                      <input
                        name="duration"
                        type="number"
                        min={1}
                        max={30}
                        defaultValue={editingShot?.duration ?? 5}
                      />
                    </label>
                    <label>
                      <Trans>Approved reference</Trans>
                      <select
                        name="referenceId"
                        defaultValue={editingShot?.referenceId ?? ''}
                      >
                        <option value="">{t`No reference`}</option>
                        {document.references
                          .filter(
                            (item) =>
                              item.reviews.at(-1)?.decision === 'APPROVED',
                          )
                          .map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.title}
                            </option>
                          ))}
                      </select>
                    </label>
                  </StyledDeliveryGrid>
                  <StyledDeliveryButton type="submit">
                    <Trans>Save shot</Trans>
                  </StyledDeliveryButton>
                </fieldset>
                {editingShot && (
                  <StyledDeliveryButton onClick={() => setEditingShot(null)}>
                    <Trans>Cancel editing</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryStack>
            </form>
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
            <form onSubmit={(event) => void upload(event)}>
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
            </form>
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
                    <StyledDeliveryButton onClick={() => void openAsset(asset)}>
                      <Trans>Preview</Trans>
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      onClick={() => void openAsset(asset, true)}
                    >
                      <Trans>Download</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                  {asset.kind !== 'FINAL' && (
                    <form
                      onSubmit={(event) => {
                        const data = values(event);
                        void change({
                          action: 'reviewAsset',
                          assetId: asset.id,
                          decision: data.get('decision'),
                          notes: data.get('notes'),
                        });
                      }}
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
                    </form>
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
            onClick={async () => {
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
            }}
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
            <form
              key={`assembly-${document.version}`}
              onSubmit={(event) => {
                const data = values(event);
                void change({
                  action: 'assembly',
                  assetIds: data.getAll('assetIds'),
                  overlayText: data.get('overlayText'),
                  audioId: String(data.get('audioId') ?? '') || null,
                  notes: data.get('notes'),
                });
              }}
            >
              <fieldset disabled={!canEdit || busy}>
                <label>
                  <Trans>Video assets in library order</Trans>
                  <select
                    name="assetIds"
                    multiple
                    defaultValue={document.assembly.assetIds}
                  >
                    {readyAssets
                      .filter((asset) =>
                        ['CLIP', 'BASE', 'HOOK', 'CTA'].includes(asset.kind),
                      )
                      .map((asset) => (
                        <option value={asset.id} key={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <Trans>Overlay text</Trans>
                  <textarea
                    name="overlayText"
                    defaultValue={document.assembly.overlayText}
                  />
                </label>
                <label>
                  <Trans>Audio</Trans>
                  <select
                    name="audioId"
                    defaultValue={document.assembly.audioId ?? ''}
                  >
                    <option value="">{t`No audio`}</option>
                    {readyAssets
                      .filter((asset) => asset.kind === 'AUDIO')
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <Trans>Editing notes</Trans>
                  <textarea
                    name="notes"
                    defaultValue={document.assembly.notes}
                  />
                </label>
                <StyledDeliveryButton type="submit">
                  <Trans>Save assembly plan</Trans>
                </StyledDeliveryButton>
              </fieldset>
            </form>
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
            <form
              onSubmit={(event) => {
                const data = values(event);
                void change({
                  action: 'variants',
                  baseId: data.get('baseId'),
                  hookIds: data.getAll('hookIds'),
                  ctaIds: data.getAll('ctaIds'),
                });
              }}
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
            </form>
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
          <StyledDeliveryButton onClick={onOpenTask}>
            <Trans>Open task submission and final approval</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryStack>
            <h4>
              <Trans>Ready for manager review?</Trans>
            </h4>
            <p>
              {document.finalAssetId
                ? t`A final edit is selected. Submit it from the task's delivery controls.`
                : t`Upload a final edit in Media review and choose “Use this version”.`}
            </p>
            <p>
              <Trans>
                The current brief and every shot image and clip must be approved
                before submission. Final approval stays with the assigned
                manager.
              </Trans>
            </p>
            <small>
              <Trans>Revision charge</Trans>: {document.revisionCharge} ·{' '}
              <Trans>Recorded only; not invoiced</Trans>
            </small>
            {manager && locked && (
              <form
                onSubmit={(event) => {
                  const data = values(event);
                  void change({
                    action: 'reopen',
                    notes: data.get('notes'),
                    revisionCharge: Number(data.get('revisionCharge')),
                  });
                }}
              >
                <label>
                  <Trans>Revision request</Trans>
                  <textarea name="notes" required />
                </label>
                <label>
                  <Trans>Optional revision charge</Trans>
                  <input
                    name="revisionCharge"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={0}
                  />
                </label>
                <StyledDeliveryButton type="submit" disabled={busy}>
                  <Trans>Reopen for revision</Trans>
                </StyledDeliveryButton>
              </form>
            )}
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
    </StyledDeliveryStack>
  );
};
