import { Trans, useLingui } from '@lingui/react/macro';
import { useCallback, type FormEvent } from 'react';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useKnowledgeCategories } from '@/delivery/knowledge/useKnowledgeCategories';
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
};
export const DeliveryKnowledgeForm = ({
  initial,
  busy,
  enabled,
  onSave,
  onClose,
  onSaved,
}: DeliveryKnowledgeFormProps) => {
  const { t } = useLingui();
  const draft = useDeliveryDraft({
    initialValues: initial,
    revision: initial.revision,
    busy,
  });
  const values = draft.values;
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
    if (!enabled || draft.stale) return;
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
          {draft.stale && (
            <DeliveryDraftConflict onReload={draft.reload} busy={busy} />
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
            disabled={!enabled || draft.saving}
            style={{ border: 0, padding: 0, minWidth: 0 }}
          >
            <StyledDeliveryStack>
              <label>
                <Trans>Knowledge category</Trans>
                <select
                  value={values.category ?? 'MEETING'}
                  onChange={(event) => update('category', event.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
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
                  are not fetched or inspected. Include a safe reference link in
                  the reviewed text if the project team should receive it.
                </Trans>
              </small>
              <label>
                {isMeeting
                  ? t`Transcript or meeting notes`
                  : t`Source evidence and notes`}
                <textarea
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
                    draft.stale ||
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
