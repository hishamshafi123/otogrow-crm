import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type FinanceAiCostSource,
  type FinanceAiCostEntryReference,
} from '@/delivery/finance/finance-ai-cost.types';
import { useFinanceAiCostLabels } from '@/delivery/finance/useFinanceAiCostLabels';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceAiCostSourceDetailsProps = {
  source: FinanceAiCostSource;
  canManage: boolean;
  canReadBudget: boolean;
  editing: boolean;
  hasEvidenceCursor: boolean;
  destination: (changes: Record<string, string | null>) => string;
  onPrepare: () => void;
};

export const FinanceAiCostSourceDetails = ({
  source,
  canManage,
  canReadBudget,
  editing,
  hasEvidenceCursor,
  destination,
  onPrepare,
}: FinanceAiCostSourceDetailsProps) => {
  const { t } = useLingui();
  const labels = useFinanceAiCostLabels();
  const current = source.claim.currentEntry;
  const replacement = source.claim.replacementEntry;
  const currentDraft =
    current?.status === 'DRAFT' || replacement?.status === 'DRAFT';
  const unsettled = !source.eligible && source.state !== 'SETTLED';
  const warnings = source.sourceWarnings.filter(
    (warning) =>
      !unsettled ||
      ![
        'SOURCE_NOT_SETTLED',
        'SOURCE_AMOUNT_INVALID',
        'SETTLEMENT_EVIDENCE_UNAVAILABLE',
        'INVALID_SOURCE_EVIDENCE',
      ].includes(warning),
  );
  const entryDestination = (entry: FinanceAiCostEntryReference) =>
    `/delivery?view=finance&financeView=monthly&financeEntry=${encodeURIComponent(entry.id)}&financeMonth=${entry.month}&financeCurrency=${encodeURIComponent(source.currency)}`;
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h3>{source.modelId || t`Model identity unavailable`}</h3>
        <p>
          {labels.sourceKind(source.sourceKind)} ·{' '}
          {source.projectName ?? t`Company / unassigned source`} ·{' '}
          {labels.status(source)}
        </p>
        <p>
          {t`Original recorded charge`}:{' '}
          {source.settledAmountMicros === null ||
          source.settledAmountMicros === undefined
            ? t`Not confirmed`
            : formatFinanceAmountMicros(
                source.settledAmountMicros,
                source.currency,
              )}
        </p>
        {source.settledAt && (
          <p>
            {t`Recorded at`}: {new Date(source.settledAt).toLocaleString()}
          </p>
        )}
        {!unsettled && (
          <p>
            <Trans>
              Only the selected financial event supplies a monthly cost.
              Reservations, spending limits and the highest reported budget
              exposure are excluded.
            </Trans>
          </p>
        )}
        {unsettled && (
          <p role="status">
            {source.state === 'UNCERTAIN'
              ? t`This charge is unconfirmed. An administrator must reconcile it in AI spending before import.`
              : source.state === 'RELEASED'
                ? t`The request was released before charging. There is no settled cost to import.`
                : t`The request has no confirmed charge yet. Wait for settlement; held funds are not costs.`}
          </p>
        )}
        {warnings.map((warning) => (
          <p key={warning} role="status">
            {labels.warning(warning)}
          </p>
        ))}
        {!source.eligible && !unsettled && (
          <p>
            <Trans>
              This request cannot become an AI-cost draft yet. An administrator
              must resolve the missing or invalid financial evidence in AI
              spending.
            </Trans>
          </p>
        )}
        {current && (
          <section aria-label={t`Current monthly recognition`}>
            <strong>
              <Trans>Current monthly entry</Trans>
            </strong>
            <p>
              {current.month} ·{' '}
              {formatFinanceAmountMicros(current.amountMicros, source.currency)}{' '}
              ·{' '}
              {current.status === 'POSTED'
                ? t`Posted`
                : current.status === 'DRAFT'
                  ? t`Draft`
                  : t`Voided`}
            </p>
            <Link to={entryDestination(current)}>
              {current.status === 'DRAFT'
                ? t`Open monthly draft`
                : t`Open recognized cost and history`}
            </Link>
          </section>
        )}
        {replacement && (
          <section aria-label={t`Pending AI-cost correction`}>
            <strong>
              <Trans>Correction entry</Trans>
            </strong>
            <p>
              {replacement.month} ·{' '}
              {formatFinanceAmountMicros(
                replacement.amountMicros,
                source.currency,
              )}
            </p>
            <p>
              <Trans>
                The prior posted cost stays in results until this correction is
                explicitly posted.
              </Trans>
            </p>
            <Link to={entryDestination(replacement)}>
              <Trans>Open correction draft</Trans>
            </Link>
          </section>
        )}
        {canManage &&
          source.eligible &&
          !currentDraft &&
          !editing &&
          source.evidenceOptions.length > 0 && (
            <StyledDeliveryButton data-primary="true" onClick={onPrepare}>
              {current?.status === 'POSTED'
                ? t`Prepare a reviewed correction`
                : t`Prepare monthly cost draft`}
            </StyledDeliveryButton>
          )}
        {(!unsettled || source.evidenceOptions.length > 0) && (
          <section aria-label={t`Available financial evidence`}>
            <StyledDeliveryStack>
              <h4>
                <Trans>Recorded financial evidence</Trans>
              </h4>
              <p>
                <Trans>
                  These are internal ledger amounts, not verified provider
                  invoices. Original settlement and later usage remain separate
                  choices.
                </Trans>
              </p>
              {!source.evidenceOptions.length && (
                <p>
                  <Trans>No valid financial evidence on this page.</Trans>
                </p>
              )}
              {source.evidenceOptions.map((evidence) => (
                <div key={evidence.id}>
                  <strong>{labels.basis(evidence.basis)}</strong>
                  <p>
                    {formatFinanceAmountMicros(
                      evidence.amountMicros,
                      source.currency,
                    )}{' '}
                    · {new Date(evidence.recordedAt).toLocaleString()}
                  </p>
                  {evidence.basis === 'MANUAL_EVIDENCE' && (
                    <p>
                      <Trans>
                        This amount was recorded by an administrator. Private
                        supporting budget evidence is excluded from finance.
                      </Trans>
                    </p>
                  )}
                  <small>
                    {t`Financial event reference`}: {evidence.id}
                  </small>
                </div>
              ))}
              <StyledDeliveryRow>
                {source.nextEvidenceId && (
                  <Link
                    to={destination({
                      financeAiEvidenceAfter: source.nextEvidenceId,
                    })}
                  >
                    <Trans>More financial evidence</Trans>
                  </Link>
                )}
                {hasEvidenceCursor && (
                  <Link to={destination({ financeAiEvidenceAfter: null })}>
                    <Trans>First financial evidence</Trans>
                  </Link>
                )}
              </StyledDeliveryRow>
            </StyledDeliveryStack>
          </section>
        )}
        {canReadBudget && (
          <Link to="/delivery?view=agents&agentView=spending&spendingView=history">
            <Trans>Open administrator AI spending</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
