import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type AdvertisingDraftDetail } from '@/delivery/advertising/drafts/advertising-draft-types';
import {
  StyledAdvertisingItem,
  StyledAdvertisingText,
} from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const AdvertisingDraftResultView = ({
  detail,
  enabled,
  busy,
  insertedIds,
  remainingSlots,
  canUseNoChange,
  onInsert,
  onNoChange,
}: {
  detail: AdvertisingDraftDetail;
  enabled: boolean;
  busy: boolean;
  insertedIds: string[];
  remainingSlots: number;
  canUseNoChange: boolean;
  onInsert?: (ids: string[]) => Promise<void>;
  onNoChange?: () => Promise<void>;
}) => {
  const { t } = useLingui();
  const [selected, setSelected] = useState<string[]>([]);
  const result = detail.run.result;
  if (!result)
    return (
      <p>
        <Trans>No usable suggestions were saved for this run.</Trans>
      </p>
    );
  const selectedIds = selected.filter((id) => !insertedIds.includes(id));
  const citations = (ids: string[]) => (
    <ul>
      {ids.map((id) => {
        const reference = detail.run.context.references.find(
          (candidate) => candidate.id === id,
        );
        return (
          <li key={id}>
            {reference ? (
              <>
                {reference.href?.startsWith('/delivery?') ? (
                  <Link to={reference.href}>{reference.label}</Link>
                ) : (
                  reference.label
                )}
                {reference.version !== null &&
                  ` · ${t`version ${reference.version}`}`}
              </>
            ) : (
              t`Evidence reference unavailable`
            )}
          </li>
        );
      })}
    </ul>
  );
  return (
    <section aria-label={t`Saved AI suggestions`}>
      <StyledDeliveryStack>
        <h5>
          <Trans>AI suggestions — human review required</Trans>
        </h5>
        <p>
          <Trans>
            These are unverified proposals, not approved work or proven
            advertising results. Adding one only changes your current draft; you
            still choose people, review evidence and explicitly save and assign.
          </Trans>
        </p>
        <StyledAdvertisingText>{result.summary}</StyledAdvertisingText>
        {citations(result.citations)}
        <ul>
          {result.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
        {result.suggestions.map((suggestion) => (
          <StyledAdvertisingItem
            key={suggestion.id}
            data-advertising-suggestion-id={suggestion.id}
          >
            <h6>{suggestion.title}</h6>
            {onInsert && (
              <label>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(suggestion.id)}
                  disabled={
                    !enabled || busy || insertedIds.includes(suggestion.id)
                  }
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, suggestion.id]
                        : current.filter((id) => id !== suggestion.id),
                    )
                  }
                />
                {insertedIds.includes(suggestion.id)
                  ? t`Already added to this draft`
                  : t`Select this suggestion`}
              </label>
            )}
            <details>
              <summary>
                <Trans>Review this proposal's reason and evidence</Trans>
              </summary>
              <StyledDeliveryStack>
                <strong>
                  <Trans>Why it is proposed</Trans>
                </strong>
                <StyledAdvertisingText>
                  {suggestion.rationale}
                </StyledAdvertisingText>
                <strong>
                  <Trans>Expected result to check</Trans>
                </strong>
                <StyledAdvertisingText>
                  {suggestion.expectedResult}
                </StyledAdvertisingText>
                <strong>
                  <Trans>Evidence to review</Trans>
                </strong>
                <StyledAdvertisingText>
                  {suggestion.evidence}
                </StyledAdvertisingText>
                {citations(suggestion.citations)}
              </StyledDeliveryStack>
            </details>
          </StyledAdvertisingItem>
        ))}
        {onInsert && (
          <>
            <p>{t`${remainingSlots} recommendation slots remain in this draft.`}</p>
            <StyledDeliveryButton
              type="button"
              disabled={
                !enabled ||
                busy ||
                selectedIds.length === 0 ||
                selectedIds.length > remainingSlots
              }
              onClick={() => void onInsert(selectedIds)}
            >
              <Trans>Append selected suggestions</Trans>
            </StyledDeliveryButton>
          </>
        )}
        {result.noChangeReason && (
          <StyledAdvertisingItem>
            <h6>
              <Trans>Proposed no-change explanation</Trans>
            </h6>
            <StyledAdvertisingText>
              {result.noChangeReason}
            </StyledAdvertisingText>
            {onNoChange && (
              <>
                <StyledDeliveryButton
                  type="button"
                  disabled={!enabled || busy || !canUseNoChange}
                  onClick={() => void onNoChange()}
                >
                  <Trans>Add proposed no-change explanation</Trans>
                </StyledDeliveryButton>
                {!canUseNoChange && (
                  <p>
                    <Trans>
                      Your draft already includes work; a no-change explanation
                      cannot be applied alongside actions.
                    </Trans>
                  </p>
                )}
              </>
            )}
          </StyledAdvertisingItem>
        )}
        {!onInsert && (
          <p>
            <Trans>
              Open a recommendation draft and review its business outcome before
              using these suggestions.
            </Trans>
          </p>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
