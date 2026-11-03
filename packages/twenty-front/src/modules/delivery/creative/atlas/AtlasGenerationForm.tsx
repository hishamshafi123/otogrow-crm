import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryAtlasQuoteInput,
  type DeliveryAtlasStartInput,
} from '~/generated-metadata/graphql';
import {
  type AtlasProduction,
  type AtlasQuote,
  type AtlasRun,
} from '@/delivery/creative/atlas/atlas.types';
import {
  atlasInitialRequest,
  atlasRequestProfile,
  atlasParameterDefaults,
  atlasParameterInput,
  atlasQuoteInput,
  type AtlasRequestValues,
} from '@/delivery/creative/atlas/atlas-request';
import { AtlasParameterFields } from '@/delivery/creative/atlas/AtlasParameterFields';
import { useAtlasLabels } from '@/delivery/creative/atlas/useAtlasLabels';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { formatAiAmount } from '@/otogrow-ai-budget/formatAiAmount';
import {
  StyledAtlasForm,
  StyledAtlasBoundary,
} from '@/delivery/creative/atlas/atlasStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
type AtlasGenerationFormProps = {
  opened: AtlasProduction;
  current: AtlasProduction | null;
  busy: boolean;
  onQuote: (input: DeliveryAtlasQuoteInput) => Promise<AtlasQuote | null>;
  onStart: (input: DeliveryAtlasStartInput) => Promise<AtlasRun | null>;
  onCheck: (runId: string, requestId: string) => Promise<AtlasRun | null>;
  onClose: () => void;
  onReload: () => void;
};
export const AtlasGenerationForm = ({
  opened,
  current,
  busy,
  onQuote,
  onStart,
  onCheck,
  onClose,
  onReload,
}: AtlasGenerationFormProps) => {
  const { t } = useLingui();
  const labels = useAtlasLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const initial = atlasInitialRequest(opened);
  const [values, setValues] = useState(initial);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [quote, setQuote] = useState<{
    data: AtlasQuote;
    configurationRevision: number;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [savedRun, setSavedRun] = useState<AtlasRun | null>(null);
  const [message, setMessage] = useState('');
  const [preparedDefault, setPreparedDefault] = useState({
    image: opened.defaultImageFamilyId ?? '',
    clip: opened.defaultClipProfileId ?? '',
  });
  const source = current ?? opened;
  const profile = atlasRequestProfile(source, values);
  const stale =
    !current ||
    current.taskRevision !== opened.taskRevision ||
    current.briefVersion !== opened.briefVersion ||
    current.settingsVersion !== opened.settingsVersion;
  const configurationChanged =
    quote !== null &&
    current?.configurationRevision !== quote.configurationRevision;
  const quoteInput =
    current && !stale ? atlasQuoteInput(current, values, requestId) : null;
  const currentDefault =
    values.kind === 'IMAGE'
      ? (current?.defaultImageFamilyId ?? '')
      : (current?.defaultClipProfileId ?? '');
  const capturedDefault =
    values.kind === 'IMAGE' ? preparedDefault.image : preparedDefault.clip;
  const defaultChanged = current !== null && currentDefault !== capturedDefault;
  const selection =
    values.kind === 'IMAGE' ? values.imageSelection : values.clipSelection;
  const selectedShot = source.shots.find((shot) => shot.id === values.shotId);
  const profilePermitted =
    profile != null &&
    profile.enabled &&
    source.allowedProfileIds.includes(profile.id);
  const availableFamilies = source.families.filter((family) => {
    const id =
      values.imageMode === 'IMAGE_EDIT'
        ? family.imageEditProfileId
        : family.textToImageProfileId;
    return source.profiles.some(
      (item) =>
        item.id === id &&
        item.enabled &&
        source.allowedProfileIds.includes(item.id),
    );
  });
  const availableClips = source.profiles.filter(
    (item) =>
      item.kind === 'CLIP' &&
      item.operation === 'IMAGE_TO_VIDEO' &&
      item.enabled &&
      source.allowedProfileIds.includes(item.id),
  );
  const dirty =
    !savedRun &&
    (JSON.stringify(values) !== JSON.stringify(initial) ||
      quote !== null ||
      confirmed ||
      uncertain);
  useDeliveryDraftStatus({ dirty, saving: busy });
  const change = (next: AtlasRequestValues, resetModel = false) => {
    if (uncertain || savedRun) return;
    setValues(
      resetModel
        ? {
            ...next,
            parameters: atlasParameterDefaults(
              atlasRequestProfile(source, next),
            ),
          }
        : next,
    );
    setQuote(null);
    setConfirmed(false);
    setRequestId(crypto.randomUUID());
    setMessage('');
  };
  const useDefault = () => {
    const next =
      values.kind === 'IMAGE'
        ? {
            ...values,
            imageFamilyId: currentDefault,
            imageSelection: 'DEFAULT' as const,
          }
        : {
            ...values,
            clipProfileId: currentDefault,
            clipSelection: 'DEFAULT' as const,
          };
    change(next, true);
    setPreparedDefault({
      ...preparedDefault,
      [values.kind === 'IMAGE' ? 'image' : 'clip']: currentDefault,
    });
  };
  return (
    <StyledAtlasForm
      aria-label={t`Prepare Atlas generation`}
      onSubmit={(event) => event.preventDefault()}
    >
      <h3>
        <Trans>Prepare one Atlas request</Trans>
      </h3>
      <p>
        <Trans>
          Review the exact model, inputs and spending hold before starting.
          Generated output still needs media review and independent final
          approval.
        </Trans>
      </p>
      {message && <p role="status">{message}</p>}
      {savedRun && (
        <StyledDeliveryCard>
          <p>
            <Trans>Status when this request was confirmed</Trans>
          </p>
          <strong>{labels.status(savedRun.status)}</strong>
          <small>
            {new Date(savedRun.updatedAt).toLocaleString(undefined, {
              timeZone: 'UTC',
            })}{' '}
            UTC
          </small>
          <p>
            {t`Saved request`}: {savedRun.id}
          </p>
          <p>
            <Trans>
              Actual provider charge may still be unconfirmed. Model/default
              changes do not rewrite this recorded request. Review Saved Atlas
              requests below for current status.
            </Trans>
          </p>
        </StyledDeliveryCard>
      )}
      {stale && !savedRun && (
        <p role="alert">
          <Trans>
            The production source changed or is unverified. Your prepared model
            and inputs are kept. Refresh or explicitly reload the current source
            before preparing a new price review.
          </Trans>
        </p>
      )}
      <StyledAtlasBoundary
        disabled={busy || stale || uncertain || savedRun !== null}
      >
        <StyledDeliveryGrid>
          <label>
            <Trans>Output to generate</Trans>
            <select
              aria-label={t`Output to generate`}
              value={values.kind}
              onChange={(event) => {
                const kind = event.target.value === 'CLIP' ? 'CLIP' : 'IMAGE';
                const shot = source.shots.find(
                  (item) => item.id === values.shotId,
                );
                change(
                  {
                    ...values,
                    kind,
                    target:
                      kind === 'CLIP'
                        ? 'SHOT'
                        : source.outputKind === 'IMAGE'
                          ? 'BRIEF'
                          : 'SHOT',
                    prompt: shot
                      ? kind === 'CLIP'
                        ? shot.animationPrompt
                        : shot.imagePrompt
                      : values.prompt,
                  },
                  true,
                );
              }}
            >
              <option value="IMAGE">{t`Image`}</option>
              {source.outputKind !== 'IMAGE' && (
                <option value="CLIP">{t`Video from an approved image`}</option>
              )}
            </select>
          </label>
          {values.kind === 'IMAGE' && (
            <label>
              <Trans>Image operation</Trans>
              <select
                aria-label={t`Image operation`}
                value={values.imageMode}
                onChange={(event) =>
                  change(
                    {
                      ...values,
                      imageMode:
                        event.target.value === 'IMAGE_EDIT'
                          ? 'IMAGE_EDIT'
                          : 'TEXT_TO_IMAGE',
                    },
                    true,
                  )
                }
              >
                <option value="TEXT_TO_IMAGE">{t`Text to image`}</option>
                <option value="IMAGE_EDIT">{t`Edit approved images`}</option>
              </select>
            </label>
          )}
          {values.kind === 'IMAGE' ? (
            <label>
              <Trans>Image model family</Trans>
              <select
                aria-label={t`Image model family`}
                value={values.imageFamilyId}
                onChange={(event) =>
                  change(
                    {
                      ...values,
                      imageFamilyId: event.target.value,
                      imageSelection: 'OVERRIDE',
                    },
                    true,
                  )
                }
              >
                <option value="">{t`Choose an image family`}</option>
                {values.imageFamilyId &&
                  !availableFamilies.some(
                    (family) => family.id === values.imageFamilyId,
                  ) && (
                    <option
                      value={values.imageFamilyId}
                    >{t`Prepared image family unavailable`}</option>
                  )}
                {availableFamilies.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <Trans>Image-to-video model</Trans>
              <select
                aria-label={t`Image-to-video model`}
                value={values.clipProfileId}
                onChange={(event) =>
                  change(
                    {
                      ...values,
                      clipProfileId: event.target.value,
                      clipSelection: 'OVERRIDE',
                    },
                    true,
                  )
                }
              >
                <option value="">{t`Choose an image-to-video model`}</option>
                {values.clipProfileId &&
                  !availableClips.some(
                    (item) => item.id === values.clipProfileId,
                  ) && (
                    <option
                      value={values.clipProfileId}
                    >{t`Prepared video model unavailable`}</option>
                  )}
                {availableClips.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </StyledDeliveryGrid>
        <p>
          {selection === 'DEFAULT'
            ? t`Prepared from the workspace default`
            : t`Explicit model override`}
          {profile ? ` · ${profile.label}` : ''}
        </p>
        {defaultChanged && (
          <p role="status">
            <Trans>
              The workspace default changed. This prepared request keeps its
              selected model until you explicitly choose the updated default.
            </Trans>
          </p>
        )}
        {(defaultChanged || selection === 'OVERRIDE') && (
          <StyledDeliveryButton type="button" onClick={useDefault}>
            <Trans>Use updated default</Trans>
          </StyledDeliveryButton>
        )}
        {profile && (
          <p>
            {t`Exact model operation`}: {profile.label} ·{' '}
            {labels.operation(profile.operation)}
          </p>
        )}
        {!profilePermitted && (
          <p role="status">
            <Trans>
              The prepared model is not currently permitted for this operation.
              Its selection has been retained; explicitly choose a compatible
              model or ask an administrator to review access.
            </Trans>
          </p>
        )}
        {profile?.blockedReasons.map((reason) => (
          <p key={reason} role="status">
            {labels.reason(reason)}
          </p>
        ))}
        {values.target === 'SHOT' ? (
          <label>
            <Trans>Production shot</Trans>
            <select
              aria-label={t`Production shot`}
              value={values.shotId}
              onChange={(event) => {
                const shot = source.shots.find(
                  (item) => item.id === event.target.value,
                );
                change({
                  ...values,
                  shotId: event.target.value,
                  prompt: shot
                    ? values.kind === 'CLIP'
                      ? shot.animationPrompt
                      : shot.imagePrompt
                    : '',
                });
              }}
            >
              <option value="">{t`Choose the actual production shot`}</option>
              {values.shotId &&
                !source.shots.some((shot) => shot.id === values.shotId) && (
                  <option
                    value={values.shotId}
                  >{t`Prepared shot unavailable`}</option>
                )}
              {source.shots.map((shot) => (
                <option key={shot.id} value={shot.id}>
                  {shot.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>
            <Trans>
              Static image from the approved brief. No video storyboard or shot
              is required.
            </Trans>
          </p>
        )}
        <label>
          <Trans>Image or animation prompt</Trans>
          <textarea
            aria-label={t`Image or animation prompt`}
            readOnly={values.target === 'SHOT'}
            maxLength={12000}
            value={values.prompt}
            onChange={(event) =>
              change({ ...values, prompt: event.target.value })
            }
          />
        </label>
        {values.target === 'SHOT' && (
          <small>
            <Trans>
              This is the saved shot prompt. Edit the shot itself if its
              instructions need to change.
            </Trans>
          </small>
        )}
        {values.kind === 'CLIP' ? (
          <p>
            {t`Approved source image`}:{' '}
            {source.assets.find((asset) => asset.id === selectedShot?.imageId)
              ?.name ?? t`Choose and approve the current shot image first`}
          </p>
        ) : (
          values.imageMode === 'IMAGE_EDIT' && (
            <label>
              {t`Approved image references — ${profile?.minimumReferences ?? 1} to ${profile?.maximumReferences ?? 0}`}
              <select
                aria-label={t`Approved image references`}
                multiple
                value={values.referenceAssetIds}
                onChange={(event) =>
                  change({
                    ...values,
                    referenceAssetIds: Array.from(
                      event.target.selectedOptions,
                      (option) => option.value,
                    ),
                  })
                }
              >
                {values.referenceAssetIds
                  .filter(
                    (id) => !source.assets.some((asset) => asset.id === id),
                  )
                  .map((id) => (
                    <option
                      key={id}
                      value={id}
                    >{t`Prepared reference unavailable`}</option>
                  ))}
                {source.assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
          )
        )}
        {(values.kind === 'CLIP' || values.imageMode === 'IMAGE_EDIT') && (
          <small>
            <Trans>
              The selected provider may reject an image’s dimensions or aspect
              ratio; approval and file checks do not verify those requirements.
            </Trans>
          </small>
        )}
        {profile && (
          <>
            <AtlasParameterFields
              profile={profile}
              values={values.parameters}
              onChange={(parameters) => change({ ...values, parameters })}
            />
            {atlasParameterInput(profile, values.parameters) === null && (
              <p role="status">
                <Trans>
                  Review all required supported settings. Prepared values are
                  not silently converted to a different option.
                </Trans>
              </p>
            )}
            <StyledDeliveryButton
              type="button"
              onClick={() =>
                change({
                  ...values,
                  parameters: atlasParameterDefaults(profile),
                })
              }
            >
              <Trans>Use current model settings</Trans>
            </StyledDeliveryButton>
            <small>
              <Trans>
                This explicitly resets model-specific options only. Your prompt
                and reference choices are retained.
              </Trans>
            </small>
          </>
        )}
      </StyledAtlasBoundary>
      {!savedRun && (
        <p>
          <Trans>
            Reviewing price sends the displayed prompt, approved brief and
            selected approved images to Atlas for estimation. It does not start
            a generation job.
          </Trans>
        </p>
      )}
      {!savedRun && (
        <StyledDeliveryButton
          type="button"
          disabled={busy || uncertain || stale || !quoteInput}
          onClick={async () => {
            if (!quoteInput || !current) return;
            const nextId = quote !== null ? crypto.randomUUID() : requestId;
            if (nextId !== requestId) setRequestId(nextId);
            setQuote(null);
            setConfirmed(false);
            setMessage('');
            const result = await onQuote({ ...quoteInput, requestId: nextId });
            if (result)
              setQuote({
                data: result,
                configurationRevision: current.configurationRevision,
              });
          }}
        >
          {quote
            ? t`Review price again for these inputs`
            : t`Review price and reservation`}
        </StyledDeliveryButton>
      )}
      {quote && !savedRun && (
        <StyledDeliveryCard>
          <strong>
            <Trans>Price and spending review</Trans>
          </strong>
          <p>
            {t`Atlas estimate`}: USD {formatAiAmount(quote.data.quotedCostUsd)}
          </p>
          <p>
            {t`Maximum OS reservation`}: USD{' '}
            {formatAiAmount(quote.data.maximumCostUsd)}
          </p>
          <p>
            <Trans>Actual provider charge: unconfirmed.</Trans>
          </p>
          <p>
            <Trans>
              The estimate is not a price lock. This configured OS hold is not a
              guarantee of the provider’s maximum bill. Budget eligibility is
              rechecked and a hold is recorded when you start.
            </Trans>
          </p>
          <small>
            {t`Price review expires`}:{' '}
            {new Date(quote.data.expiresAt).toLocaleString(undefined, {
              timeZone: 'UTC',
            })}{' '}
            UTC
          </small>
          {quote.data.blockedReason && (
            <p role="status">{quote.data.blockedReason}</p>
          )}
          {configurationChanged && (
            <p role="status">
              <Trans>
                Workspace settings changed after this price review. This exact
                request keeps its selected model. Current access and reservation
                policy are checked again when you start.
              </Trans>
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={
                busy ||
                stale ||
                uncertain ||
                !quoteInput ||
                !quote.data.budgetReady
              }
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <Trans>
              I reviewed this exact model, inputs, estimate and reservation and
              authorize one generation request.
            </Trans>
          </label>
          <StyledDeliveryButton
            type="button"
            disabled={
              busy ||
              stale ||
              uncertain ||
              !quoteInput ||
              !quote.data.budgetReady ||
              !confirmed
            }
            onClick={async () => {
              if (!confirmed || stale || !quoteInput || uncertain) return;
              const result = await onStart({
                taskId: opened.taskId,
                runId: quote.data.runId,
                requestId: quote.data.requestId,
                quoteToken: quote.data.quoteToken,
              });
              if (result) {
                setSavedRun(result);
                setConfirmed(false);
              } else setUncertain(true);
            }}
          >
            <Trans>Start this generation request</Trans>
          </StyledDeliveryButton>
          {uncertain && (
            <>
              <p role="alert">
                <Trans>
                  The start response is unconfirmed. Keep this request identity
                  and check its saved state; no provider submission is retried
                  automatically.
                </Trans>
              </p>
              <StyledDeliveryButton
                type="button"
                disabled={busy}
                onClick={async () => {
                  const run = await onCheck(
                    quote.data.runId,
                    quote.data.requestId,
                  );
                  if (!run)
                    setMessage(
                      t`The saved request could not be verified. Keep its identity and try checking again.`,
                    );
                  else if (run.status === 'QUOTED') {
                    setUncertain(false);
                    setMessage(
                      t`The saved request is still only a price review. Review its expiry and current source before an explicit start or new price review.`,
                    );
                  } else {
                    setSavedRun(run);
                    setUncertain(false);
                    setConfirmed(false);
                  }
                }}
              >
                <Trans>Check this saved request</Trans>
              </StyledDeliveryButton>
            </>
          )}
        </StyledDeliveryCard>
      )}
      <StyledDeliveryRow>
        {stale && !uncertain && !savedRun && (
          <StyledDeliveryButton
            type="button"
            onClick={() => requestAction(onReload)}
          >
            <Trans>Reload current production</Trans>
          </StyledDeliveryButton>
        )}
        <StyledDeliveryButton
          type="button"
          onClick={() => requestAction(onClose)}
        >
          {savedRun
            ? t`Close request review`
            : uncertain
              ? t`Close pending request review`
              : t`Cancel preparation`}
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {uncertain && (
        <p>
          <Trans>
            Closing this review does not stop a request Atlas may have accepted
            or release its spending hold. Use Check this saved request above
            before preparing another generation.
          </Trans>
        </p>
      )}
    </StyledAtlasForm>
  );
};
