import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledAiBudgetActions } from '@/otogrow-ai-budget/aiBudgetStyles';
import { type AiPrice } from '@/otogrow-ai-budget/aiBudget.types';
import { type OtogrowAiPriceSaveInput } from '~/generated-metadata/graphql';

type AiPriceFormProps = {
  profile?: AiPrice;
  busy: boolean;
  save: (input: OtogrowAiPriceSaveInput) => Promise<boolean>;
  close: () => void;
};
export const AiPriceForm = ({
  profile,
  busy,
  save,
  close,
}: AiPriceFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const pricing = profile?.pricing;
  const draft = useDeliveryDraft({
    initialValues: {
      modelId: profile?.modelId ?? '',
      kind: profile?.kind ?? 'TEXT',
      source: profile?.source ?? '',
      verifiedDate: profile?.verifiedAt.slice(0, 10) ?? '',
      enabled: profile?.enabled ?? false,
      inputUsdPerMillionTokens: pricing?.inputUsdPerMillionTokens ?? '',
      outputUsdPerMillionTokens: pricing?.outputUsdPerMillionTokens ?? '',
      reasoningUsdPerMillionTokens: pricing?.reasoningUsdPerMillionTokens ?? '',
      cacheReadUsdPerMillionTokens: pricing?.cacheReadUsdPerMillionTokens ?? '',
      cacheWriteUsdPerMillionTokens:
        pricing?.cacheWriteUsdPerMillionTokens ?? '',
      maxInputTokens: pricing?.maxInputTokens.toString() ?? '',
      maxOutputTokens: pricing?.maxOutputTokens.toString() ?? '',
      maxReasoningTokens: pricing?.maxReasoningTokens.toString() ?? '',
      outputIncludesReasoning: pricing?.outputIncludesReasoning ?? false,
      longContextThresholdTokens:
        pricing?.longContextThresholdTokens?.toString() ?? '',
      longInputUsdPerMillionTokens: pricing?.longInputUsdPerMillionTokens ?? '',
      longOutputUsdPerMillionTokens:
        pricing?.longOutputUsdPerMillionTokens ?? '',
      longReasoningUsdPerMillionTokens:
        pricing?.longReasoningUsdPerMillionTokens ?? '',
      longCacheReadUsdPerMillionTokens:
        pricing?.longCacheReadUsdPerMillionTokens ?? '',
      longCacheWriteUsdPerMillionTokens:
        pricing?.longCacheWriteUsdPerMillionTokens ?? '',
    },
    revision: profile?.revision ?? 0,
    busy,
  });
  const values = draft.values;
  const update = (next: Partial<typeof values>) =>
    draft.update({ ...values, ...next });
  const rateFields = [
    { field: 'inputUsdPerMillionTokens', label: t`Input` },
    { field: 'outputUsdPerMillionTokens', label: t`Output` },
    { field: 'reasoningUsdPerMillionTokens', label: t`Reasoning` },
    { field: 'cacheReadUsdPerMillionTokens', label: t`Cache read` },
    { field: 'cacheWriteUsdPerMillionTokens', label: t`Cache write` },
  ] as const;
  const longRateFields = [
    { field: 'longInputUsdPerMillionTokens', label: t`Long-context input` },
    { field: 'longOutputUsdPerMillionTokens', label: t`Long-context output` },
    {
      field: 'longReasoningUsdPerMillionTokens',
      label: t`Long-context reasoning`,
    },
    {
      field: 'longCacheReadUsdPerMillionTokens',
      label: t`Long-context cache read`,
    },
    {
      field: 'longCacheWriteUsdPerMillionTokens',
      label: t`Long-context cache write`,
    },
  ] as const;
  const complete = Boolean(
    values.modelId.trim() &&
    values.source.trim() &&
    values.verifiedDate &&
    values.maxInputTokens &&
    values.maxOutputTokens &&
    values.maxReasoningTokens &&
    rateFields.every(({ field }) => values[field].trim()) &&
    (!values.longContextThresholdTokens ||
      longRateFields.every(({ field }) => values[field].trim())),
  );
  return (
    <form
      aria-label={t`Model pricing`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (draft.saving || draft.stale || !complete) return;
        draft.setSaving(true);
        try {
          const saved = await save({
            id: profile?.id,
            revision: draft.revision,
            modelId: values.modelId,
            kind: values.kind,
            source: values.source,
            verifiedAt: `${values.verifiedDate}T00:00:00.000Z`,
            enabled: values.enabled,
            pricing: {
              inputUsdPerMillionTokens: values.inputUsdPerMillionTokens,
              outputUsdPerMillionTokens: values.outputUsdPerMillionTokens,
              reasoningUsdPerMillionTokens: values.reasoningUsdPerMillionTokens,
              cacheReadUsdPerMillionTokens: values.cacheReadUsdPerMillionTokens,
              cacheWriteUsdPerMillionTokens:
                values.cacheWriteUsdPerMillionTokens,
              maxInputTokens: Number(values.maxInputTokens),
              maxOutputTokens: Number(values.maxOutputTokens),
              maxReasoningTokens: Number(values.maxReasoningTokens),
              outputIncludesReasoning: values.outputIncludesReasoning,
              longContextThresholdTokens: values.longContextThresholdTokens
                ? Number(values.longContextThresholdTokens)
                : null,
              longInputUsdPerMillionTokens: values.longContextThresholdTokens
                ? values.longInputUsdPerMillionTokens
                : null,
              longOutputUsdPerMillionTokens: values.longContextThresholdTokens
                ? values.longOutputUsdPerMillionTokens
                : null,
              longReasoningUsdPerMillionTokens:
                values.longContextThresholdTokens
                  ? values.longReasoningUsdPerMillionTokens
                  : null,
              longCacheReadUsdPerMillionTokens:
                values.longContextThresholdTokens
                  ? values.longCacheReadUsdPerMillionTokens
                  : null,
              longCacheWriteUsdPerMillionTokens:
                values.longContextThresholdTokens
                  ? values.longCacheWriteUsdPerMillionTokens
                  : null,
            },
          });
          if (saved) {
            draft.markSaved();
            close();
          }
        } finally {
          draft.setSaving(false);
        }
      }}
    >
      <StyledDeliveryStack>
        <h3>{profile ? t`Edit verified pricing` : t`Add verified pricing`}</h3>
        <p>
          <Trans>
            Copy rates and token limits from this model's provider
            documentation. Enter 0 only for a verified free or unused category.
            Pricing changes apply to future requests; existing requests retain
            their original price version.
          </Trans>
        </p>
        {draft.stale && (
          <DeliveryDraftConflict busy={draft.saving} onReload={draft.reload} />
        )}
        <fieldset disabled={draft.saving}>
          <StyledDeliveryStack>
            <StyledDeliveryGrid>
              <label>
                <Trans>Model ID</Trans>
                <input
                  required
                  value={values.modelId}
                  disabled={Boolean(profile)}
                  onChange={(event) => update({ modelId: event.target.value })}
                />
                <small>
                  <Trans>
                    Exact provider model identifier used by the assistant.
                  </Trans>
                </small>
              </label>
              <label>
                <Trans>Use</Trans>
                <select
                  value={values.kind}
                  disabled={Boolean(profile)}
                  onChange={(event) => update({ kind: event.target.value })}
                >
                  <option value="TEXT">
                    <Trans>Text assistance</Trans>
                  </option>
                  <option value="INSPECTION">
                    <Trans>Image inspection</Trans>
                  </option>
                  <option value="VIDEO_QA">
                    <Trans>Video and audio inspection</Trans>
                  </option>
                </select>
              </label>
              <label>
                <Trans>Pricing evidence</Trans>
                <input
                  required
                  value={values.source}
                  onChange={(event) => update({ source: event.target.value })}
                />
                <small>
                  <Trans>
                    Provider pricing URL or a traceable contract reference.
                  </Trans>
                </small>
              </label>
              <label>
                <Trans>Verified on (UTC date)</Trans>
                <input
                  type="date"
                  required
                  value={values.verifiedDate}
                  onChange={(event) =>
                    update({ verifiedDate: event.target.value })
                  }
                />
              </label>
            </StyledDeliveryGrid>
            <h3>
              <Trans>USD per million tokens</Trans>
            </h3>
            <StyledDeliveryGrid>
              {rateFields.map(({ field, label }) => (
                <label key={field}>
                  {label}
                  <input
                    required
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,6})?"
                    value={values[field]}
                    onChange={(event) =>
                      update({ [field]: event.target.value })
                    }
                  />
                </label>
              ))}
            </StyledDeliveryGrid>
            <h3>
              <Trans>Verified maximum token counts</Trans>
            </h3>
            <p>
              <Trans>
                These are billing bounds, not expected usage. The OS holds a
                conservative maximum before a request, then records reported
                usage.
              </Trans>
            </p>
            <StyledDeliveryGrid>
              <label>
                <Trans>Maximum input tokens</Trans>
                <input
                  type="number"
                  required
                  min="1"
                  max="2147483647"
                  step="1"
                  value={values.maxInputTokens}
                  onChange={(event) =>
                    update({ maxInputTokens: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Maximum output tokens</Trans>
                <input
                  type="number"
                  required
                  min="1"
                  max="2147483647"
                  step="1"
                  value={values.maxOutputTokens}
                  onChange={(event) =>
                    update({ maxOutputTokens: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Maximum reasoning tokens</Trans>
                <input
                  type="number"
                  required
                  min="0"
                  max="2147483647"
                  step="1"
                  value={values.maxReasoningTokens}
                  onChange={(event) =>
                    update({ maxReasoningTokens: event.target.value })
                  }
                />
              </label>
            </StyledDeliveryGrid>
            <label>
              <input
                type="checkbox"
                checked={values.outputIncludesReasoning}
                onChange={(event) =>
                  update({ outputIncludesReasoning: event.target.checked })
                }
              />
              <Trans>
                The provider's reported output token count includes reasoning
                tokens.
              </Trans>
            </label>
            <details
              open={Boolean(pricing?.longContextThresholdTokens) || undefined}
            >
              <summary>
                <Trans>Long-context pricing tier</Trans>
              </summary>
              <StyledDeliveryStack>
                <p>
                  <Trans>
                    Fill in all rates when this provider charges differently
                    above an input threshold. Leave the threshold empty only
                    when the standard rates cover the full context.
                  </Trans>
                </p>
                <label>
                  <Trans>Input token threshold</Trans>
                  <input
                    type="number"
                    min="1"
                    max="2147483647"
                    step="1"
                    value={values.longContextThresholdTokens}
                    onChange={(event) =>
                      update({ longContextThresholdTokens: event.target.value })
                    }
                  />
                </label>
                {values.longContextThresholdTokens && (
                  <StyledDeliveryGrid>
                    {longRateFields.map(({ field, label }) => (
                      <label key={field}>
                        {label}
                        <input
                          required
                          inputMode="decimal"
                          pattern="[0-9]+([.][0-9]{1,6})?"
                          value={values[field]}
                          onChange={(event) =>
                            update({ [field]: event.target.value })
                          }
                        />
                      </label>
                    ))}
                  </StyledDeliveryGrid>
                )}
              </StyledDeliveryStack>
            </details>
            <label>
              <input
                type="checkbox"
                checked={values.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
              <Trans>Use this verified pricing for new requests</Trans>
            </label>
            {!complete && (
              <small>
                <Trans>
                  Complete the provider evidence, all billing rates and verified
                  token limits before saving.
                </Trans>
              </small>
            )}
            <StyledAiBudgetActions>
              <StyledDeliveryButton
                type="submit"
                data-primary="true"
                disabled={draft.stale || !complete}
              >
                <Trans>Save pricing</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                type="button"
                onClick={() => requestAction(close)}
              >
                <Trans>Cancel</Trans>
              </StyledDeliveryButton>
            </StyledAiBudgetActions>
          </StyledDeliveryStack>
        </fieldset>
      </StyledDeliveryStack>
    </form>
  );
};
