import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type CreativeBrief,
  type CreativeDocument,
  type CreativeShot,
  type CreativeShotFields,
} from '@/delivery/delivery-creative.types';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';

type CreativeDraftFormProps = {
  document: CreativeDocument;
  revision: number;
  canEdit: boolean;
  busy: boolean;
  save: (fields: Record<string, unknown>, revision: number) => Promise<boolean>;
};
type DeliveryCreativeBriefFormProps = CreativeDraftFormProps & {
  manager: boolean;
  onApprove: () => Promise<boolean>;
};
type BriefTextField = Exclude<
  keyof CreativeBrief,
  'objective' | 'duration' | 'brandAssets' | 'outputKind'
>;

export const DeliveryCreativeBriefForm = ({
  document,
  revision,
  canEdit,
  busy,
  manager,
  save,
  onApprove,
}: DeliveryCreativeBriefFormProps) => {
  const { t } = useLingui();
  const draft = useDeliveryDraft({
    initialValues: document.brief,
    revision,
    busy,
  });
  const [notice, setNotice] = useState('');
  const labels: Record<BriefTextField, string> = {
    audience: t`Audience`,
    painPoint: t`Customer pain point`,
    angle: t`Angle`,
    concept: t`Concept`,
    productFacts: t`Verified product facts`,
    mandatoryClaims: t`Required claims and disclaimers`,
    visualDirection: t`Visual direction`,
    format: t`Aspect ratio / format`,
    hook: t`Hook`,
    cta: t`Call to action`,
    music: t`Music notes`,
  };
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (draft.saving || draft.stale || !draft.dirty || !canEdit || !manager)
          return;
        draft.setSaving(true);
        setNotice('');
        try {
          if (
            await save({ action: 'brief', brief: draft.values }, draft.revision)
          ) {
            draft.markSaved();
            setNotice(t`Brief saved.`);
          }
        } finally {
          draft.setSaving(false);
        }
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
        {draft.stale && (
          <DeliveryDraftConflict onReload={draft.reload} busy={draft.saving} />
        )}
        <fieldset disabled={!manager || !canEdit || draft.saving}>
          <StyledDeliveryStack>
            <StyledDeliveryGrid>
              <label>
                <Trans>Final deliverable</Trans>
                <select
                  value={draft.values.outputKind ?? 'VIDEO'}
                  onChange={(event) =>
                    draft.update({
                      ...draft.values,
                      outputKind:
                        event.target.value === 'IMAGE' ? 'IMAGE' : 'VIDEO',
                    })
                  }
                >
                  <option value="VIDEO">{t`Video`}</option>
                  <option value="IMAGE">{t`Still image / static ad`}</option>
                </select>
              </label>
              <label>
                <Trans>Objective</Trans>
                <select
                  value={draft.values.objective}
                  onChange={(event) =>
                    draft.update({
                      ...draft.values,
                      objective: event.target.value as 'ADS' | 'ORGANIC',
                    })
                  }
                >
                  <option value="ADS">{t`Performance ad`}</option>
                  <option value="ORGANIC">{t`Organic brand content`}</option>
                </select>
              </label>
              {draft.values.outputKind !== 'IMAGE' && (
                <label>
                  <Trans>Duration in seconds</Trans>
                  <input
                    required
                    type="number"
                    min={1}
                    max={300}
                    value={draft.values.duration}
                    onChange={(event) =>
                      draft.update({
                        ...draft.values,
                        duration: Number(event.target.value),
                      })
                    }
                  />
                </label>
              )}
              {(Object.entries(labels) as [BriefTextField, string][])
                .filter(
                  ([field]) =>
                    draft.values.outputKind !== 'IMAGE' || field !== 'music',
                )
                .map(([field, label]) => (
                  <label key={field}>
                    {label}
                    <textarea
                      maxLength={6000}
                      rows={3}
                      value={draft.values[field]}
                      onChange={(event) =>
                        draft.update({
                          ...draft.values,
                          [field]: event.target.value,
                        })
                      }
                    />
                  </label>
                ))}
            </StyledDeliveryGrid>
            <label>
              <Trans>Brand assets</Trans>
              <select
                multiple
                value={draft.values.brandAssets}
                onChange={(event) =>
                  draft.update({
                    ...draft.values,
                    brandAssets: Array.from(
                      event.target.selectedOptions,
                      (option) => option.value,
                    ),
                  })
                }
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
            <StyledDeliveryButton
              type="submit"
              disabled={!draft.dirty || draft.stale}
            >
              <Trans>Save new brief version</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        {notice && !draft.dirty && <p role="status">{notice}</p>}
        {manager && (
          <>
            {draft.dirty && (
              <small>
                <Trans>Save your edits before approving the brief.</Trans>
              </small>
            )}
            <StyledDeliveryButton
              type="button"
              disabled={
                !canEdit ||
                draft.saving ||
                draft.dirty ||
                document.approvedBriefVersion === document.briefVersion
              }
              onClick={() => void onApprove()}
            >
              <Trans>Approve current brief</Trans>
            </StyledDeliveryButton>
          </>
        )}
      </StyledDeliveryStack>
    </form>
  );
};

type DeliveryCreativeAssemblyFormProps = CreativeDraftFormProps;

export const DeliveryCreativeAssemblyForm = ({
  document,
  revision,
  canEdit,
  busy,
  save,
}: DeliveryCreativeAssemblyFormProps) => {
  const { t } = useLingui();
  const draft = useDeliveryDraft({
    initialValues: document.assembly,
    revision,
    busy,
  });
  const [notice, setNotice] = useState('');
  const readyAssets = document.assets.filter(
    (asset) => asset.storageState === 'READY',
  );
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (draft.saving || draft.stale || !draft.dirty || !canEdit) return;
        draft.setSaving(true);
        setNotice('');
        try {
          if (
            await save({ action: 'assembly', ...draft.values }, draft.revision)
          ) {
            draft.markSaved();
            setNotice(t`Assembly plan saved.`);
          }
        } finally {
          draft.setSaving(false);
        }
      }}
    >
      <StyledDeliveryStack>
        {draft.stale && (
          <DeliveryDraftConflict onReload={draft.reload} busy={draft.saving} />
        )}
        <fieldset disabled={!canEdit || draft.saving}>
          <StyledDeliveryStack>
            <label>
              <Trans>Video assets in library order</Trans>
              <select
                multiple
                value={draft.values.assetIds}
                onChange={(event) =>
                  draft.update({
                    ...draft.values,
                    assetIds: Array.from(
                      event.target.selectedOptions,
                      (option) => option.value,
                    ),
                  })
                }
              >
                {readyAssets
                  .filter((asset) =>
                    ['CLIP', 'BASE', 'HOOK', 'CTA'].includes(asset.kind),
                  )
                  .map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <Trans>Overlay text</Trans>
              <textarea
                value={draft.values.overlayText}
                onChange={(event) =>
                  draft.update({
                    ...draft.values,
                    overlayText: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <Trans>Audio</Trans>
              <select
                value={draft.values.audioId ?? ''}
                onChange={(event) =>
                  draft.update({
                    ...draft.values,
                    audioId: event.target.value || null,
                  })
                }
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
                value={draft.values.notes}
                onChange={(event) =>
                  draft.update({ ...draft.values, notes: event.target.value })
                }
              />
            </label>
            <StyledDeliveryButton
              type="submit"
              disabled={!draft.dirty || draft.stale}
            >
              <Trans>Save assembly plan</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        {notice && !draft.dirty && <p role="status">{notice}</p>}
      </StyledDeliveryStack>
    </form>
  );
};

type DeliveryCreativeShotFormProps = CreativeDraftFormProps & {
  shot?: CreativeShot;
  onSaved: () => void;
  onCancel: () => void;
};

export const DeliveryCreativeShotForm = ({
  shot,
  document,
  revision,
  canEdit,
  busy,
  save,
  onSaved,
  onCancel,
}: DeliveryCreativeShotFormProps) => {
  const { t } = useLingui();
  const draft = useDeliveryDraft<CreativeShotFields>({
    initialValues: {
      title: shot?.title ?? '',
      imagePrompt: shot?.imagePrompt ?? '',
      animationPrompt: shot?.animationPrompt ?? '',
      duration: shot?.duration ?? 5,
      subject: shot?.subject ?? '',
      product: shot?.product ?? '',
      location: shot?.location ?? '',
      notes: shot?.notes ?? '',
      referenceId: shot?.referenceId ?? null,
    },
    revision,
    busy,
  });
  const labels: Record<
    Exclude<keyof CreativeShotFields, 'duration' | 'referenceId'>,
    string
  > = {
    title: t`Shot title`,
    imagePrompt: t`Image prompt`,
    animationPrompt: t`Animation prompt`,
    subject: t`Subject`,
    product: t`Product details`,
    location: t`Location`,
    notes: t`Notes`,
  };
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canEdit || draft.saving || draft.stale || !draft.dirty) return;
        draft.setSaving(true);
        try {
          if (
            await save(
              {
                action: 'shot',
                ...(shot ? { id: shot.id } : {}),
                fields: draft.values,
              },
              draft.revision,
            )
          ) {
            draft.markSaved({
              title: '',
              imagePrompt: '',
              animationPrompt: '',
              duration: 5,
              subject: '',
              product: '',
              location: '',
              notes: '',
              referenceId: null,
            });
            onSaved();
          }
        } finally {
          draft.setSaving(false);
        }
      }}
    >
      <StyledDeliveryStack>
        <h4>{shot ? t`Edit shot` : t`Add shot`}</h4>
        {draft.stale && (
          <DeliveryDraftConflict onReload={draft.reload} busy={draft.saving} />
        )}
        <fieldset disabled={!canEdit || draft.saving}>
          <StyledDeliveryGrid>
            {(Object.entries(labels) as [keyof typeof labels, string][]).map(
              ([field, label]) => (
                <label key={field}>
                  {label}
                  <textarea
                    required={field === 'title'}
                    value={draft.values[field]}
                    onChange={(event) =>
                      draft.update({
                        ...draft.values,
                        [field]: event.target.value,
                      })
                    }
                  />
                </label>
              ),
            )}
            <label>
              <Trans>Duration in seconds</Trans>
              <input
                type="number"
                min={1}
                max={30}
                value={draft.values.duration}
                onChange={(event) =>
                  draft.update({
                    ...draft.values,
                    duration: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <Trans>Approved reference</Trans>
              <select
                value={draft.values.referenceId ?? ''}
                onChange={(event) =>
                  draft.update({
                    ...draft.values,
                    referenceId: event.target.value || null,
                  })
                }
              >
                <option value="">{t`No reference`}</option>
                {document.references
                  .filter(
                    (item) => item.reviews.at(-1)?.decision === 'APPROVED',
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
          </StyledDeliveryGrid>
          <StyledDeliveryButton
            type="submit"
            disabled={!draft.dirty || draft.stale}
          >
            <Trans>Save shot</Trans>
          </StyledDeliveryButton>
        </fieldset>
        {shot && (
          <StyledDeliveryButton
            type="button"
            disabled={draft.saving}
            onClick={onCancel}
          >
            <Trans>Cancel editing</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryStack>
    </form>
  );
};
