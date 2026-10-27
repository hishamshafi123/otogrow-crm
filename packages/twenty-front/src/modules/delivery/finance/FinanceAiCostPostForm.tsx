import { useState } from 'react';
import { styled } from '@linaria/react';
import { Link } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryFinanceAiCostsQuery,
  type DeliveryFinanceAiCostPostInput,
  type DeliveryFinanceQuery,
} from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { DeliveryGuardedForm } from '@/delivery/drafts/DeliveryGuardedForm';
import { GET_DELIVERY_FINANCE_AI_COSTS } from '@/delivery/finance/delivery-finance-ai-cost.graphql';
import { useFinanceAiCostLabels } from '@/delivery/finance/useFinanceAiCostLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { type FinanceAiCostSource } from '@/delivery/finance/finance-ai-cost.types';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceAiCostPostFormProps = {
  entry: DeliveryFinanceQuery['deliveryFinance']['entries'][number];
  busy: boolean;
  disabled: boolean;
  canManage: boolean;
  onPost: (input: DeliveryFinanceAiCostPostInput) => Promise<boolean>;
};
const StyledAiSourceReviewBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;

export const FinanceAiCostPostForm = ({
  entry,
  busy,
  disabled,
  canManage,
  onPost,
}: FinanceAiCostPostFormProps) => {
  const { t } = useLingui();
  const labels = useFinanceAiCostLabels();
  const permission = useWorkflowAccess();
  const [opened, setOpened] = useState(canManage);
  if (canManage && !opened) setOpened(true);
  const origin = entry.sourceAiSpend;
  const query = useQuery<DeliveryFinanceAiCostsQuery>(
    GET_DELIVERY_FINANCE_AI_COSTS,
    {
      variables: {
        input: { filter: 'ALL', selectedSpendId: origin?.spendId },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip:
        !opened || !permission.ready || !permission.canReadFinance || !origin,
    },
  );
  const candidate = query.data?.deliveryFinanceAiCosts;
  const data = !query.error && permission.matches(candidate) ? candidate : null;
  const currentSource =
    origin && data?.selectedSource?.id === origin.spendId
      ? data.selectedSource
      : null;
  const [lastVerified, setLastVerified] = useState<FinanceAiCostSource | null>(
    null,
  );
  if (currentSource && currentSource !== lastVerified)
    setLastVerified(currentSource);
  const source =
    currentSource ??
    (lastVerified?.id === origin?.spendId ? lastVerified : null);
  const available = Boolean(currentSource);
  const ownsClaim =
    source?.claim.currentEntry?.id === entry.id ||
    source?.claim.replacementEntry?.id === entry.id;
  const replacement = origin?.replacesEntryId
    ? source?.claim.currentEntry
    : null;
  const replacementValid =
    !origin?.replacesEntryId ||
    (replacement?.id === origin.replacesEntryId &&
      replacement.status === 'POSTED');
  if (!opened && !canManage) return null;
  if (!origin)
    return (
      <p role="alert">
        <Trans>
          This AI-cost draft has no readable saved source. Review it in AI costs
          before posting.
        </Trans>
      </p>
    );
  if (!source)
    return (
      <StyledDeliveryStack>
        <p role={query.error ? 'alert' : 'status'}>
          <Trans>
            The AI source and its current recognition must be checked before
            posting.
          </Trans>
        </p>
        <StyledDeliveryButton
          disabled={busy || query.loading}
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh AI-source review</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    );
  const warnings = [
    ...new Set([...entry.sourceWarnings, ...source.sourceWarnings]),
  ];
  const canPost =
    canManage &&
    available &&
    permission.canManageFinance &&
    data?.canManage === true &&
    source.eligible &&
    ownsClaim &&
    replacementValid;
  return (
    <StyledDeliveryStack>
      {!canManage && (
        <p role="status">
          <Trans>
            Editing is unavailable. This posting review is kept read-only until
            your access is restored.
          </Trans>
        </p>
      )}
      {!available && (
        <p role="alert">
          <Trans>
            The latest AI source could not be checked. Saved source details are
            hidden and this review is kept.
          </Trans>{' '}
          <StyledDeliveryButton
            disabled={busy || query.loading}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh AI-source review</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      <StyledAiSourceReviewBoundary hidden={!available} disabled={!available}>
        {available && !canPost && (
          <p role="alert">
            <Trans>
              This AI-cost draft is not the current eligible recognition.
              Refresh its source or review the active entry before posting.
            </Trans>
          </p>
        )}
        <DeliveryGuardedForm
          key={`ai-post:${entry.id}`}
          revision={entry.revision}
          snapshot={JSON.stringify({
            id: entry.id,
            revision: entry.revision,
            claim: source.claim,
            token: source.sourceReviewToken,
          })}
          busy={busy}
          disabled={disabled || query.loading || !canPost}
          onSave={(fields, revision) =>
            !canPost
              ? Promise.resolve(false)
              : onPost({
                  id: entry.id,
                  revision,
                  expectedClaimRevision: source.claim.revision,
                  expectedSourceReviewToken: source.sourceReviewToken,
                  acknowledgeSourceWarnings:
                    fields.get('acknowledgeSource') === 'on',
                  acknowledgeReplacement:
                    fields.get('acknowledgeReplacement') === 'on',
                })
          }
        >
          <StyledDeliveryStack>
            <p>
              <Trans>
                Post the saved financial evidence and explicit allocation to
                monthly results. This does not change the AI spending ledger or
                record a payment.
              </Trans>
            </p>
            {replacement && (
              <section aria-label={t`Cost replaced by this post`}>
                <strong>
                  <Trans>
                    Posting this correction replaces a recognized cost
                  </Trans>
                </strong>
                <p>
                  {replacement.month} ·{' '}
                  {formatFinanceAmountMicros(
                    replacement.amountMicros,
                    entry.currency,
                  )}
                </p>
                <p>
                  {t`Current monthly payment matches`}:{' '}
                  {replacement.activeMatchCount} ·{' '}
                  {formatFinanceAmountMicros(
                    replacement.matchedMicros,
                    entry.currency,
                  )}
                </p>
                <p>
                  <Trans>
                    The prior cost stays counted until this post. Posting will
                    void it and reverse those monthly matches. Actual cash and
                    invoice payments stay unchanged.
                  </Trans>
                </p>
                <Link
                  to={`/delivery?view=finance&financeView=monthly&financeEntry=${encodeURIComponent(replacement.id)}&financeMonth=${replacement.month}&financeCurrency=${encodeURIComponent(entry.currency)}`}
                >
                  <Trans>Review the prior posted entry</Trans>
                </Link>
                <label>
                  <input
                    type="checkbox"
                    name="acknowledgeReplacement"
                    required
                  />
                  <Trans>
                    I acknowledge replacing the prior recognized cost and
                    reversing its monthly payment matches.
                  </Trans>
                </label>
              </section>
            )}
            {warnings.map((warning) => (
              <p key={warning} role="status">
                {labels.warning(warning)}
              </p>
            ))}
            {warnings.length > 0 && (
              <label>
                <input type="checkbox" name="acknowledgeSource" required />
                <Trans>
                  I understand the current source warnings and confirm using the
                  saved financial event and amount.
                </Trans>
              </label>
            )}
            <StyledDeliveryButton type="submit" data-primary="true">
              <Trans>Post reviewed AI cost</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </DeliveryGuardedForm>
      </StyledAiSourceReviewBoundary>
    </StyledDeliveryStack>
  );
};
