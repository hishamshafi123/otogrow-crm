import { Trans, useLingui } from '@lingui/react/macro';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useKnowledgeCategories } from '@/delivery/knowledge/useKnowledgeCategories';
import { DeliveryTranscriptImport } from '@/delivery/knowledge/transcript/DeliveryTranscriptImport';
import { DeliveryFathomImport } from '@/delivery/knowledge/fathom/DeliveryFathomImport';
import { KnowledgeAssetAttachments } from '@/delivery/knowledge/assets/KnowledgeAssetAttachments';
import {
  type KnowledgeAssetContext,
  type KnowledgeAssetSelection,
} from '@/delivery/knowledge/assets/knowledge-assets.types';
import { type FathomContext } from '@/delivery/knowledge/fathom/fathom.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryKnowledgeSaveInput } from '~/generated-metadata/graphql';

type DeliveryKnowledgeFormProps = {
  initial: DeliveryKnowledgeSaveInput;
  busy: boolean;
  enabled: boolean;
  onSave: (input: DeliveryKnowledgeSaveInput) => Promise<boolean>;
  onClose: () => void;
  onSaved: () => void;
  latestRevision?: number;
  readOnly?: boolean;
  onReload?: () => void;
  fathomContext?: FathomContext;
  assetContext?: KnowledgeAssetContext;
  initialAssets?: KnowledgeAssetSelection[];
  onAuthorityLost?: () => void;
};
export const DeliveryKnowledgeForm = ({
  initial,
  busy,
  enabled,
  onSave,
  onClose,
  onSaved,
  latestRevision,
  readOnly = false,
  onReload,
  fathomContext,
  assetContext,
  initialAssets = [],
  onAuthorityLost,
}: DeliveryKnowledgeFormProps) => {
  const { t } = useLingui();
  const [assetSelections, setAssetSelections] = useState(initialAssets);
  const [assetBlocked, setAssetBlocked] = useState(false);
  const [fathomExpiresAt, setFathomExpiresAt] = useState<string | null>(null);
  const [fathomExpired, setFathomExpired] = useState(false);
  const draft = useDeliveryDraft({
    initialValues: initial,
    revision: initial.revision,
    busy,
  });
  const values = draft.values;
  const stale =
    draft.stale ||
    (latestRevision !== undefined && latestRevision > initial.revision);
  const sourceIdentity = `${initial.projectId}:${initial.id}:${initial.revision}`;
  // oxlint-disable-next-line twenty/no-state-useref -- Successful local import returns keyboard focus to the exact evidence field.
  const transcriptInput = useRef<HTMLTextAreaElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- A local file preview may finish after its target draft, permission or notes changed.
  const importTarget = useRef({
    sourceIdentity,
    transcript: values.transcript,
    enabled: enabled && !stale && !readOnly && !draft.saving,
  });
  useLayoutEffect(() => {
    importTarget.current = {
      sourceIdentity,
      transcript: values.transcript,
      enabled: enabled && !stale && !readOnly && !draft.saving,
    };
  }, [
    sourceIdentity,
    values.transcript,
    enabled,
    stale,
    readOnly,
    draft.saving,
  ]);
  const categories = useKnowledgeCategories();
  const focusCategory = useCallback(
    (form: HTMLFormElement | null) => form?.querySelector('select')?.focus(),
    [],
  );
  const isMeeting = !values.category || values.category === 'MEETING';
  const update = (
    field:
      | 'title'
      | 'meetingDate'
      | 'sourceUrl'
      | 'transcript'
      | 'knowledge'
      | 'category',
    value: string,
  ) => draft.update({ ...values, [field]: value });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!enabled || stale || readOnly || draft.saving || assetBlocked) return;
    if (fathomExpiresAt !== null && Date.parse(fathomExpiresAt) <= Date.now()) {
      setFathomExpired(true);
      return;
    }
    draft.setSaving(true);
    try {
      if (await onSave({ ...values, revision: draft.revision })) {
        draft.markSaved();
        onSaved();
      }
    } finally {
      draft.setSaving(false);
    }
  };
  return (
    <StyledDeliveryCard>
      <form
        ref={focusCategory}
        onSubmit={submit}
        aria-label={t`Brand knowledge draft`}
      >
        <StyledDeliveryStack>
          <h2>
            {initial.revision
              ? t`Edit knowledge draft`
              : t`Add brand knowledge`}
          </h2>
          <p>
            <Trans>
              Add source evidence, then write the facts, rules, references or
              decisions that staff and assistants should use. Saving creates a
              draft; a manager publishes it after review.
            </Trans>
          </p>
          {stale && (
            <DeliveryDraftConflict
              onReload={onReload ?? draft.reload}
              busy={busy}
            />
          )}
          {!enabled && (
            <p role="alert">
              <Trans>
                Access could not be verified. Your draft is retained; saving is
                unavailable.
              </Trans>
            </p>
          )}
          <fieldset
            disabled={!enabled || readOnly || draft.saving}
            style={{ border: 0, padding: 0, minWidth: 0 }}
          >
            <StyledDeliveryStack>
              <label>
                <Trans>Knowledge category</Trans>
                <select
                  value={values.category ?? 'MEETING'}
                  disabled={assetSelections.length > 0 || assetBlocked}
                  onChange={(event) => update('category', event.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              {(assetSelections.length > 0 || assetBlocked) && (
                <small>
                  <Trans>
                    Remove draft files and finish pending uploads before
                    changing this source category.
                  </Trans>
                </small>
              )}
              <label>
                {isMeeting ? t`Meeting title` : t`Knowledge title`}
                <input
                  required
                  maxLength={160}
                  value={values.title}
                  onChange={(event) => update('title', event.target.value)}
                />
              </label>
              <label>
                {isMeeting ? t`Meeting date` : t`Source date`}
                <input
                  type="date"
                  required
                  value={values.meetingDate}
                  onChange={(event) =>
                    update('meetingDate', event.target.value)
                  }
                />
              </label>
              <label>
                {isMeeting
                  ? t`Fathom or recording link (optional)`
                  : t`Original source link (optional)`}
                <input
                  type="url"
                  pattern="https://.*"
                  maxLength={2000}
                  value={values.sourceUrl}
                  onChange={(event) => update('sourceUrl', event.target.value)}
                />
              </label>
              <small>
                <Trans>
                  Original links are private to managers and the author. Links
                  are reference-only unless you explicitly import from Fathom
                  below. Include a safe reference link in the reviewed text if
                  the project team should receive it.
                </Trans>
              </small>
              {isMeeting && (
                <DeliveryTranscriptImport
                  sourceIdentity={sourceIdentity}
                  transcript={values.transcript}
                  disabled={!enabled || stale || readOnly || draft.saving}
                  onImport={(text, target) => {
                    const current = importTarget.current;
                    if (
                      !current.enabled ||
                      current.sourceIdentity !== target.sourceIdentity ||
                      current.transcript !== target.transcript
                    )
                      return false;
                    update('transcript', text);
                    transcriptInput.current?.focus();
                    return true;
                  }}
                />
              )}
              {isMeeting && fathomContext?.actor.isAdmin && onAuthorityLost && (
                <DeliveryFathomImport
                  key={JSON.stringify([fathomContext, sourceIdentity])}
                  context={fathomContext}
                  projectId={initial.projectId}
                  sourceId={initial.id}
                  sourceIdentity={sourceIdentity}
                  transcript={values.transcript}
                  enabled={enabled && !stale && !readOnly && !draft.saving}
                  onAuthorityLost={onAuthorityLost}
                  onImport={(preview, target) => {
                    const current = importTarget.current;
                    if (
                      !current.enabled ||
                      current.sourceIdentity !== target.sourceIdentity ||
                      current.transcript !== target.transcript
                    )
                      return false;
                    setFathomExpiresAt(preview.expiresAt);
                    setFathomExpired(false);
                    draft.update({
                      ...values,
                      transcript: preview.transcript,
                      fathomImportProof: preview.proof,
                      fathomImportHash: preview.proofHash,
                    });
                    transcriptInput.current?.focus();
                    return true;
                  }}
                />
              )}
              {values.fathomImportHash && (
                <p role="status">
                  <Trans>
                    Fathom provenance is attached to these notes. Edited notes
                    remain labelled as human-edited; the original provider
                    title, date and recording ID are preserved separately.
                  </Trans>
                </p>
              )}
              {fathomExpired && (
                <p role="alert">
                  <Trans>
                    The Fathom import preview expired before saving. Your notes
                    are retained. Fetch a new preview, review it, and use it
                    before saving this import.
                  </Trans>
                </p>
              )}
              {values.category === 'ASSET_REFERENCE' &&
                assetContext &&
                onAuthorityLost && (
                  <KnowledgeAssetAttachments
                    context={assetContext}
                    selections={assetSelections}
                    enabled={enabled && !stale && !readOnly && !draft.saving}
                    onAuthorityLost={onAuthorityLost}
                    onBlockingChange={setAssetBlocked}
                    onChange={(selections) => {
                      if (!enabled || stale || readOnly || draft.saving) return;
                      setAssetSelections(selections);
                      draft.update({
                        ...values,
                        attachments: selections.map(({ asset }) => ({
                          id: asset.id,
                          sha256: asset.sha256,
                        })),
                      });
                    }}
                  />
                )}
              <label>
                {isMeeting
                  ? t`Transcript or meeting notes`
                  : t`Source evidence and notes`}
                <textarea
                  ref={transcriptInput}
                  rows={10}
                  maxLength={200000}
                  value={values.transcript}
                  onChange={(event) => update('transcript', event.target.value)}
                />
              </label>
              <small>
                <Trans>
                  Raw notes are visible only to managers and the person who
                  added this source. Paste up to 200,000 characters.
                </Trans>
              </small>
              <label>
                <Trans>Knowledge to publish</Trans>
                <textarea
                  rows={7}
                  maxLength={8000}
                  value={values.knowledge}
                  onChange={(event) => update('knowledge', event.target.value)}
                  placeholder={t`Decisions, confirmed brand facts, changed requirements, action items and unresolved questions. Include transcript timestamps or quotes where helpful.`}
                />
              </label>
              <small>
                <Trans>
                  Once published, this text is shared with authorized project
                  teammates and task assistants. Proposed task changes still
                  need review.
                </Trans>
              </small>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  type="submit"
                  data-primary="true"
                  disabled={
                    stale ||
                    assetBlocked ||
                    !values.title.trim() ||
                    (!values.sourceUrl.trim() && !values.transcript.trim())
                  }
                >
                  {draft.saving
                    ? t`Saving…`
                    : isMeeting
                      ? t`Save meeting draft`
                      : t`Save knowledge draft`}
                </StyledDeliveryButton>
                <StyledDeliveryButton type="button" onClick={onClose}>
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledDeliveryStack>
          </fieldset>
        </StyledDeliveryStack>
      </form>
    </StyledDeliveryCard>
  );
};
