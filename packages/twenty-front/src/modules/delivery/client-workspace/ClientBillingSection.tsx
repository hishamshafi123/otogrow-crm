import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { CHANGE_CLIENT_BUSINESS } from '@/delivery/client-workspace/client-hub.graphql';
import {
  CLIENT_FEE_CADENCES,
  DELIVERY_CURRENCIES,
  type ClientFeeCadence,
  type ClientHubFinanceEntry,
  type ClientHubItem,
  type ClientHubPaymentDateTarget,
  type ClientRosterUpdateInput,
  type DeliveryCurrency,
} from '@/delivery/client-workspace/client-hub.types';
import {
  formatCurrencyTotals,
  formatFeeCadenceLabel,
  formatFeeCadenceShort,
  formatIsoDateShort,
  formatMoneyMinor,
} from '@/delivery/client-workspace/client-hub-format';
import {
  StyledBillingFormGrid,
  StyledClientSubtleButton,
  StyledClientTag,
  StyledFeeBanner,
  StyledLedgerList,
  StyledLedgerRow,
  StyledMrrProgressFill,
  StyledMrrProgressTrack,
} from '@/delivery/client-workspace/client-workspace.styles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';

const todayIso = () => new Date().toISOString().slice(0, 10);

const plusDaysIso = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const parseMajorToMinor = (raw: string): number | null => {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

const paymentTargetKey = (target: ClientHubPaymentDateTarget): string =>
  `${target.kind}:${target.id}`;

type ClientBillingSectionProps = {
  companyId: string;
  companyName: string;
  hubClient: ClientHubItem;
  updatingRoster: boolean;
  rosterError?: string | null;
  onUpdateRoster: (input: ClientRosterUpdateInput) => Promise<boolean>;
  onRefreshHub: () => Promise<unknown>;
};

export const ClientBillingSection = ({
  companyId,
  companyName,
  hubClient,
  updatingRoster,
  rosterError,
  onUpdateRoster,
  onRefreshHub,
}: ClientBillingSectionProps) => {
  const { t } = useLingui();
  const finance = hubClient.finance;
  const [mutateBusiness] = useMutation(CHANGE_CLIENT_BUSINESS);

  // Agreed fee editor state
  const [editingFee, setEditingFee] = useState(false);
  const [feeCurrency, setFeeCurrency] = useState<DeliveryCurrency>(
    finance?.fee?.currency ?? 'USD',
  );
  const [feeAmount, setFeeAmount] = useState(
    finance?.fee ? String(finance.fee.amount / 100) : '',
  );
  const [feeCadence, setFeeCadence] = useState<ClientFeeCadence>(
    finance?.fee?.cadence ?? 'MONTHLY',
  );
  const [feeNotes, setFeeNotes] = useState(finance?.fee?.notes ?? '');
  const [feeError, setFeeError] = useState<string | null>(null);

  // Quick payment / invoice form state
  const [recordingEntry, setRecordingEntry] = useState(false);
  const [entryCategory, setEntryCategory] = useState<'INCOME' | 'RECEIVABLE'>(
    'INCOME',
  );
  const [entryTitle, setEntryTitle] = useState('');
  const [entryCurrency, setEntryCurrency] = useState<DeliveryCurrency>(
    finance?.fee?.currency ?? 'USD',
  );
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState(todayIso);
  const [entryDueDate, setEntryDueDate] = useState(() => plusDaysIso(14));
  const [entryProjectId, setEntryProjectId] = useState<string>(
    hubClient.projects.length === 1 ? hubClient.projects[0].id : '',
  );
  const [entryReference, setEntryReference] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Inline mark-paid state for open receivables
  const [settlingEntryId, setSettlingEntryId] = useState<string | null>(null);
  const [settleEvidenceUrl, setSettleEvidenceUrl] = useState('');
  const [settlePaymentDate, setSettlePaymentDate] = useState(todayIso);
  const [settleSaving, setSettleSaving] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  // Inline payment-date editor state
  const [editingPaymentTarget, setEditingPaymentTarget] =
    useState<ClientHubPaymentDateTarget | null>(null);
  const [editingPaymentDate, setEditingPaymentDate] = useState('');
  const [editingPaymentSaving, setEditingPaymentSaving] = useState(false);
  const [editingPaymentError, setEditingPaymentError] = useState<string | null>(
    null,
  );
  const [showAllEntries, setShowAllEntries] = useState(false);

  if (!finance) return null;

  const openReceivablesText = formatCurrencyTotals(
    finance.openReceivablesByCurrency,
  );
  const collectedText = formatCurrencyTotals(finance.collectedByCurrency);
  const currentMonthMrr = finance.currentMonthMrr ?? null;
  const activeFeeError = feeError ?? rosterError ?? null;

  const openFeeEditor = () => {
    setFeeCurrency(finance.fee?.currency ?? 'USD');
    setFeeAmount(finance.fee ? String(finance.fee.amount / 100) : '');
    setFeeCadence(finance.fee?.cadence ?? 'MONTHLY');
    setFeeNotes(finance.fee?.notes ?? '');
    setFeeError(null);
    setEditingFee(true);
  };

  const handleSaveFee = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeeError(null);
    const minor = parseMajorToMinor(feeAmount);
    if (minor === null) {
      setFeeError(t`Enter a valid positive fee amount.`);
      return;
    }
    const ok = await onUpdateRoster({
      action: 'setFee',
      companyId,
      amount: minor,
      currency: feeCurrency,
      cadence: feeCadence,
      notes: feeNotes.trim(),
    });
    if (ok) {
      setEditingFee(false);
      setStatusMessage(t`Updated agreed fee for ${companyName}.`);
    }
  };

  const handleClearFee = async () => {
    setFeeError(null);
    const ok = await onUpdateRoster({ action: 'clearFee', companyId });
    if (ok) {
      setEditingFee(false);
      setStatusMessage(t`Cleared agreed fee for ${companyName}.`);
    }
  };

  const openEntryForm = (category: 'INCOME' | 'RECEIVABLE') => {
    setEntryCategory(category);
    setEntryCurrency(finance.fee?.currency ?? 'USD');
    setEntryAmount(finance.fee ? String(finance.fee.amount / 100) : '');
    setEntryTitle(
      category === 'INCOME'
        ? t`${companyName} payment`
        : t`${companyName} invoice`,
    );
    setEntryDate(todayIso());
    setEntryDueDate(plusDaysIso(14));
    setEntryProjectId(
      hubClient.projects.length === 1 ? hubClient.projects[0].id : '',
    );
    setEntryReference('');
    setEntryNotes('');
    setEntryError(null);
    setStatusMessage(null);
    setRecordingEntry(true);
  };

  const handleRecordEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    setEntryError(null);
    const trimmedTitle = entryTitle.trim();
    if (!trimmedTitle) {
      setEntryError(t`Enter a title for this entry.`);
      return;
    }
    const minor = parseMajorToMinor(entryAmount);
    if (minor === null) {
      setEntryError(t`Enter a valid positive amount.`);
      return;
    }
    if (entryCategory === 'RECEIVABLE' && !entryDueDate) {
      setEntryError(t`Choose a due date for the invoice.`);
      return;
    }

    setEntrySaving(true);
    try {
      await mutateBusiness({
        variables: {
          input: {
            action: 'save',
            record: {
              kind: 'FINANCE',
              revision: 0,
              projectId: entryProjectId || null,
              companyId,
              title: trimmedTitle,
              currency: entryCurrency,
              amount: minor,
              date: entryDate,
              category: entryCategory,
              dueDate: entryCategory === 'RECEIVABLE' ? entryDueDate : null,
              externalReference: entryReference.trim(),
              evidenceUrl: null,
              notes: entryNotes.trim(),
            },
          },
        },
      });
      await onRefreshHub();
      setRecordingEntry(false);
      setStatusMessage(
        entryCategory === 'INCOME'
          ? t`Recorded payment for ${companyName} and synced to Business → Finance.`
          : t`Created invoice for ${companyName} and synced to Business → Finance.`,
      );
    } catch (error) {
      setEntryError(
        error instanceof Error
          ? error.message
          : t`Unable to save this billing entry. Please check your inputs and try again.`,
      );
    } finally {
      setEntrySaving(false);
    }
  };

  const handleConfirmPaid = async (
    entry: ClientHubFinanceEntry,
    event: React.FormEvent,
  ) => {
    event.preventDefault();
    setSettleError(null);
    const evidence = settleEvidenceUrl.trim();
    if (!/^https?:\/\//i.test(evidence)) {
      setSettleError(
        t`Enter a valid receipt or payment proof URL starting with https://`,
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settlePaymentDate)) {
      setSettleError(t`Choose a valid payment date.`);
      return;
    }
    setSettleSaving(true);
    try {
      await mutateBusiness({
        variables: {
          input: {
            action: 'transition',
            id: entry.id,
            revision: entry.revision,
            status: 'PAID',
            note: `Payment confirmed for ${companyName}`,
            evidence,
            paymentDate: settlePaymentDate,
          },
        },
      });
      await onRefreshHub();
      setSettlingEntryId(null);
      setSettleEvidenceUrl('');
      setSettlePaymentDate(todayIso());
      setStatusMessage(
        t`Marked "${entry.title}" as paid (${formatIsoDateShort(settlePaymentDate)}) and posted to Business → Finance.`,
      );
    } catch (error) {
      setSettleError(
        error instanceof Error
          ? error.message
          : t`Could not mark this invoice as paid.`,
      );
    } finally {
      setSettleSaving(false);
    }
  };

  const openPaymentDateEditor = (
    target: ClientHubPaymentDateTarget,
    currentDate: string,
  ) => {
    setSettlingEntryId(null);
    setEditingPaymentTarget(target);
    setEditingPaymentDate(currentDate);
    setEditingPaymentError(null);
    setStatusMessage(null);
  };

  const closePaymentDateEditor = () => {
    setEditingPaymentTarget(null);
    setEditingPaymentDate('');
    setEditingPaymentError(null);
  };

  const handleSavePaymentDate = async (
    entryTitleLabel: string,
    target: ClientHubPaymentDateTarget,
    event: React.FormEvent,
  ) => {
    event.preventDefault();
    setEditingPaymentError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editingPaymentDate)) {
      setEditingPaymentError(t`Choose a valid payment date.`);
      return;
    }
    setEditingPaymentSaving(true);
    try {
      await mutateBusiness({
        variables: {
          input: {
            action: 'updatePaymentDate',
            target: target.kind,
            id: target.id,
            ...(target.kind === 'BUSINESS_RECORD'
              ? { revision: target.revision }
              : {}),
            paymentDate: editingPaymentDate,
          },
        },
      });
      await onRefreshHub();
      closePaymentDateEditor();
      setStatusMessage(
        t`Updated payment date for "${entryTitleLabel}" to ${formatIsoDateShort(editingPaymentDate)} and synced to Business → Finance.`,
      );
    } catch (error) {
      setEditingPaymentError(
        error instanceof Error
          ? error.message
          : t`Unable to update this payment date. Please refresh and try again.`,
      );
    } finally {
      setEditingPaymentSaving(false);
    }
  };

  const today = todayIso();

  return (
    <StyledDeliveryCard aria-label={t`Client billing and payments`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <div>
            <h3>
              <Trans>Billing &amp; payments</Trans>
            </h3>
            <small>
              {collectedText || openReceivablesText ? (
                <>
                  {collectedText ? t`Collected: ${collectedText}` : ''}
                  {collectedText && openReceivablesText ? ' · ' : ''}
                  {openReceivablesText ? t`Open: ${openReceivablesText}` : ''}
                </>
              ) : (
                <Trans>
                  Track this client’s agreed fee, invoices, and payments in one
                  place.
                </Trans>
              )}
            </small>
          </div>
          <StyledDeliveryRow>
            {finance.canManage && !recordingEntry && (
              <>
                <StyledDeliveryButton
                  type="button"
                  data-primary="true"
                  onClick={() => openEntryForm('INCOME')}
                >
                  <Trans>+ Record payment</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => openEntryForm('RECEIVABLE')}
                >
                  <Trans>+ Create invoice</Trans>
                </StyledDeliveryButton>
              </>
            )}
            <Link to="/delivery?view=finance">
              <Trans>Full finance →</Trans>
            </Link>
          </StyledDeliveryRow>
        </StyledDeliveryRow>

        {statusMessage && <p role="status">{statusMessage}</p>}

        {/* Agreed fee block */}
        {!editingFee ? (
          <StyledFeeBanner>
            <div style={{ flex: 1, minWidth: '220px' }}>
              {finance.fee ? (
                <>
                  <div className="fee-amount">
                    <strong>
                      {formatMoneyMinor(
                        finance.fee.amount,
                        finance.fee.currency,
                      )}
                    </strong>
                    <span>{formatFeeCadenceShort(finance.fee.cadence)}</span>
                    <StyledClientTag data-tone="iris">
                      {formatFeeCadenceLabel(finance.fee.cadence)}
                    </StyledClientTag>
                    {currentMonthMrr &&
                      (currentMonthMrr.status === 'ONE_TIME' ? (
                        <StyledClientTag>
                          <Trans>Excluded from MRR</Trans>
                        </StyledClientTag>
                      ) : (
                        <StyledClientTag
                          data-tone={
                            currentMonthMrr.status === 'PAID'
                              ? 'success'
                              : currentMonthMrr.status === 'PARTIAL'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {currentMonthMrr.status === 'PAID'
                            ? t`Paid this month`
                            : currentMonthMrr.status === 'PARTIAL'
                              ? t`Partial (${currentMonthMrr.collectionPercent}%)`
                              : t`Unpaid this month`}
                        </StyledClientTag>
                      ))}
                  </div>
                  {currentMonthMrr && currentMonthMrr.status !== 'ONE_TIME' && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginTop: '8px',
                      }}
                    >
                      <small>
                        {currentMonthMrr.cadence === 'QUARTERLY'
                          ? t`Projected MRR: ${formatMoneyMinor(currentMonthMrr.monthlyEquivalentMinor, currentMonthMrr.currency)}/mo (${formatFinanceAmountMicros(currentMonthMrr.monthlyEquivalentAedMicros, 'AED')})`
                          : currentMonthMrr.currency !== 'AED'
                            ? t`Projected MRR: ${formatFinanceAmountMicros(currentMonthMrr.monthlyEquivalentAedMicros, 'AED')} base`
                            : t`Projected MRR: ${formatFinanceAmountMicros(currentMonthMrr.monthlyEquivalentAedMicros, 'AED')}`}
                        {' · '}
                        {t`Collected this month: ${formatFinanceAmountMicros(currentMonthMrr.collectedThisMonthAedMicros, 'AED')}`}
                        {BigInt(currentMonthMrr.remainingAedMicros) > 0n
                          ? t` · Remaining: ${formatFinanceAmountMicros(currentMonthMrr.remainingAedMicros, 'AED')}`
                          : ''}
                      </small>
                      <StyledMrrProgressTrack
                        role="progressbar"
                        aria-label={t`Current month MRR collection progress`}
                        aria-valuenow={currentMonthMrr.collectionPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <StyledMrrProgressFill
                          data-tone={
                            currentMonthMrr.status === 'PAID'
                              ? undefined
                              : currentMonthMrr.status === 'PARTIAL'
                                ? 'warning'
                                : 'iris'
                          }
                          style={{
                            width: `${currentMonthMrr.collectionPercent}%`,
                          }}
                        />
                      </StyledMrrProgressTrack>
                    </div>
                  )}
                  {currentMonthMrr &&
                    currentMonthMrr.status === 'ONE_TIME' &&
                    BigInt(currentMonthMrr.collectedThisMonthAedMicros) > 0n && (
                      <small>
                        {t`Collected this month: ${formatFinanceAmountMicros(currentMonthMrr.collectedThisMonthAedMicros, 'AED')} · One-time fee (tracked outside MRR)`}
                      </small>
                    )}
                  {finance.fee.notes && <p>{finance.fee.notes}</p>}
                  {activeFeeError && <p role="alert">{activeFeeError}</p>}
                </>
              ) : (
                <>
                  <strong>
                    <Trans>No agreed fee set</Trans>
                  </strong>
                  <p>
                    <Trans>
                      Set this client’s retainer or project fee to feed
                      Projected MRR and pre-fill invoices and payments.
                    </Trans>
                  </p>
                  {activeFeeError && <p role="alert">{activeFeeError}</p>}
                </>
              )}
            </div>
            {finance.canManage && (
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  type="button"
                  disabled={updatingRoster}
                  onClick={openFeeEditor}
                >
                  {finance.fee ? t`Edit fee` : t`Set agreed fee`}
                </StyledDeliveryButton>
                {finance.fee && (
                  <StyledClientSubtleButton
                    type="button"
                    disabled={updatingRoster}
                    onClick={() => void handleClearFee()}
                  >
                    <Trans>Clear</Trans>
                  </StyledClientSubtleButton>
                )}
              </StyledDeliveryRow>
            )}
          </StyledFeeBanner>
        ) : (
          <form onSubmit={(event) => void handleSaveFee(event)}>
            <StyledDeliveryStack>
              <StyledBillingFormGrid>
                <label>
                  <Trans>Currency</Trans>
                  <select
                    aria-label={t`Fee currency`}
                    value={feeCurrency}
                    onChange={(event) =>
                      setFeeCurrency(event.target.value as DeliveryCurrency)
                    }
                  >
                    {DELIVERY_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Agreed amount</Trans>
                  <input
                    aria-label={t`Agreed fee amount`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="2500"
                    value={feeAmount}
                    onChange={(event) => setFeeAmount(event.target.value)}
                  />
                </label>
                <label>
                  <Trans>Billing cadence</Trans>
                  <select
                    aria-label={t`Billing cadence`}
                    value={feeCadence}
                    onChange={(event) =>
                      setFeeCadence(event.target.value as ClientFeeCadence)
                    }
                  >
                    {CLIENT_FEE_CADENCES.map((cadence) => (
                      <option key={cadence} value={cadence}>
                        {formatFeeCadenceLabel(cadence)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Billing notes (optional)</Trans>
                  <input
                    aria-label={t`Fee notes`}
                    value={feeNotes}
                    maxLength={500}
                    placeholder={t`e.g. Due on the 1st`}
                    onChange={(event) => setFeeNotes(event.target.value)}
                  />
                </label>
              </StyledBillingFormGrid>
              <small>
                {feeCadence === 'MONTHLY'
                  ? t`Counts 100% toward current-month Projected MRR.`
                  : feeCadence === 'QUARTERLY'
                    ? t`Counts as 1/3 per month toward current-month Projected MRR.`
                    : t`Tracked separately as a one-time engagement (excluded from MRR).`}
              </small>
              {activeFeeError && <p role="alert">{activeFeeError}</p>}
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  type="submit"
                  data-primary="true"
                  disabled={updatingRoster}
                >
                  {updatingRoster ? t`Saving…` : t`Save agreed fee`}
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  disabled={updatingRoster}
                  onClick={() => setEditingFee(false)}
                >
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledDeliveryStack>
          </form>
        )}

        {/* Quick payment / invoice form */}
        {recordingEntry && finance.canManage && (
          <form onSubmit={(event) => void handleRecordEntry(event)}>
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <strong>
                    {entryCategory === 'INCOME' ? (
                      <Trans>Record payment collected</Trans>
                    ) : (
                      <Trans>Create client invoice / receivable</Trans>
                    )}
                  </strong>
                  <StyledDeliveryRow>
                    <StyledDeliveryButton
                      type="button"
                      data-primary={entryCategory === 'INCOME'}
                      onClick={() => setEntryCategory('INCOME')}
                    >
                      <Trans>Payment collected</Trans>
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      type="button"
                      data-primary={entryCategory === 'RECEIVABLE'}
                      onClick={() => setEntryCategory('RECEIVABLE')}
                    >
                      <Trans>Invoice (unpaid)</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                </StyledDeliveryRow>

                <StyledBillingFormGrid>
                  <label>
                    <Trans>Description</Trans>
                    <input
                      aria-label={t`Entry description`}
                      required
                      maxLength={240}
                      value={entryTitle}
                      onChange={(event) => setEntryTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    <Trans>Currency</Trans>
                    <select
                      aria-label={t`Entry currency`}
                      value={entryCurrency}
                      onChange={(event) =>
                        setEntryCurrency(event.target.value as DeliveryCurrency)
                      }
                    >
                      {DELIVERY_CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <Trans>Amount</Trans>
                    <input
                      aria-label={t`Entry amount`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="2500"
                      value={entryAmount}
                      onChange={(event) => setEntryAmount(event.target.value)}
                    />
                  </label>
                  <label>
                    <Trans>Date</Trans>
                    <input
                      aria-label={t`Entry date`}
                      type="date"
                      required
                      value={entryDate}
                      onChange={(event) => setEntryDate(event.target.value)}
                    />
                  </label>
                  {entryCategory === 'RECEIVABLE' && (
                    <label>
                      <Trans>Due date</Trans>
                      <input
                        aria-label={t`Invoice due date`}
                        type="date"
                        required
                        value={entryDueDate}
                        onChange={(event) =>
                          setEntryDueDate(event.target.value)
                        }
                      />
                    </label>
                  )}
                  {hubClient.projects.length > 0 && (
                    <label>
                      <Trans>Project (optional)</Trans>
                      <select
                        aria-label={t`Billing project`}
                        value={entryProjectId}
                        onChange={(event) =>
                          setEntryProjectId(event.target.value)
                        }
                      >
                        <option value="">{t`Client-level (no project)`}</option>
                        {hubClient.projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    <Trans>Reference # (optional)</Trans>
                    <input
                      aria-label={t`Reference number`}
                      maxLength={240}
                      placeholder={t`INV-1042`}
                      value={entryReference}
                      onChange={(event) =>
                        setEntryReference(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <Trans>Notes (optional)</Trans>
                    <input
                      aria-label={t`Entry notes`}
                      maxLength={500}
                      placeholder={t`Bank transfer, Stripe, etc.`}
                      value={entryNotes}
                      onChange={(event) => setEntryNotes(event.target.value)}
                    />
                  </label>
                </StyledBillingFormGrid>

                <small>
                  {entryCategory === 'INCOME' ? (
                    <Trans>
                      Automatically posts to Business → Finance cash balance,
                      revenue P&amp;L, and general ledger.
                    </Trans>
                  ) : (
                    <Trans>
                      Automatically creates a linked invoice in Business →
                      Finance Receivables.
                    </Trans>
                  )}
                </small>

                {entryError && <p role="alert">{entryError}</p>}

                <StyledDeliveryRow>
                  <StyledDeliveryButton
                    type="submit"
                    data-primary="true"
                    disabled={entrySaving}
                  >
                    {entrySaving
                      ? t`Saving…`
                      : entryCategory === 'INCOME'
                        ? t`Save payment`
                        : t`Save invoice`}
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    type="button"
                    disabled={entrySaving}
                    onClick={() => setRecordingEntry(false)}
                  >
                    <Trans>Cancel</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          </form>
        )}

        {/* Recent billing entries */}
        {finance.entries.length > 0 ? (
          <>
            <StyledLedgerList aria-label={t`Recent client billing entries`}>
              {(showAllEntries
                ? finance.entries
                : finance.entries.slice(0, 8)
              ).map((entry) => {
                const isOpenReceivable =
                  entry.category === 'RECEIVABLE' &&
                  (entry.status === 'OPEN' || entry.status === 'PARTIALLY_PAID');
                const isPartiallyPaid = entry.status === 'PARTIALLY_PAID';
                const isPaidEntry =
                  entry.category === 'INCOME' || entry.status === 'PAID';
                const isNativeFinanceV2Entry = entry.revision === 0;
                const isOverdue =
                  isOpenReceivable &&
                  Boolean(entry.dueDate) &&
                  (entry.dueDate as string) < today;
                const tone = isPaidEntry
                  ? 'success'
                  : isOverdue
                    ? 'danger'
                    : 'warning';
                const badgeLabel =
                  entry.category === 'INCOME'
                    ? t`Collected`
                    : entry.status === 'PAID'
                      ? t`Paid`
                      : isPartiallyPaid
                        ? t`Partially paid`
                        : isOverdue
                          ? t`Overdue`
                          : t`Open invoice`;

                const singleTarget = entry.paymentTarget ?? null;
                const entryPayments = entry.payments ?? [];
                const hasMultiplePayments = entryPayments.length > 1;
                const activeEditKey = editingPaymentTarget
                  ? paymentTargetKey(editingPaymentTarget)
                  : null;
                const isEditingSingle = Boolean(
                  singleTarget &&
                    activeEditKey === paymentTargetKey(singleTarget),
                );
                const resolvedPaidDate = entry.paidDate ?? entry.date;

                return (
                  <StyledLedgerRow key={entry.id}>
                    <div className="ledger-info">
                      <StyledDeliveryRow>
                        <strong>{entry.title}</strong>
                        <StyledClientTag data-tone={tone}>
                          {badgeLabel}
                        </StyledClientTag>
                      </StyledDeliveryRow>
                      <small>
                        {isPaidEntry ? (
                          <>
                            {t`Paid ${formatIsoDateShort(resolvedPaidDate)}`}
                            {entry.category === 'RECEIVABLE' &&
                            entry.paidDate &&
                            entry.paidDate !== entry.date
                              ? ` · ${t`Issued ${formatIsoDateShort(entry.date)}`}`
                              : ''}
                          </>
                        ) : (
                          <>
                            {formatIsoDateShort(entry.date)}
                            {entry.dueDate && isOpenReceivable
                              ? ` · ${t`Due ${formatIsoDateShort(entry.dueDate)}`}`
                              : ''}
                            {isPartiallyPaid &&
                            entry.paidDate &&
                            !hasMultiplePayments
                              ? ` · ${t`Paid ${formatIsoDateShort(entry.paidDate)}`}`
                              : ''}
                          </>
                        )}
                        {entry.projectName ? ` · ${entry.projectName}` : ''}
                        {entry.externalReference
                          ? ` · ${entry.externalReference}`
                          : ''}
                      </small>

                      {isEditingSingle && singleTarget && (
                        <form
                          onSubmit={(event) =>
                            void handleSavePaymentDate(
                              entry.title,
                              singleTarget,
                              event,
                            )
                          }
                          style={{ marginTop: '8px' }}
                        >
                          <StyledDeliveryRow>
                            <input
                              aria-label={t`Payment date`}
                              type="date"
                              required
                              value={editingPaymentDate}
                              onChange={(event) =>
                                setEditingPaymentDate(event.target.value)
                              }
                            />
                            <StyledDeliveryButton
                              type="submit"
                              data-primary="true"
                              disabled={editingPaymentSaving}
                            >
                              {editingPaymentSaving
                                ? t`Saving…`
                                : t`Save date`}
                            </StyledDeliveryButton>
                            <StyledDeliveryButton
                              type="button"
                              disabled={editingPaymentSaving}
                              onClick={closePaymentDateEditor}
                            >
                              <Trans>Cancel</Trans>
                            </StyledDeliveryButton>
                          </StyledDeliveryRow>
                          {editingPaymentError && (
                            <p role="alert">{editingPaymentError}</p>
                          )}
                        </form>
                      )}

                      {hasMultiplePayments && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            marginTop: '6px',
                          }}
                        >
                          {entryPayments.map((payment) => {
                            const itemKey = paymentTargetKey(payment.target);
                            const isEditingItem = activeEditKey === itemKey;
                            return (
                              <div key={payment.id}>
                                <StyledDeliveryRow>
                                  <small>
                                    {t`Paid ${formatMoneyMinor(payment.amount, payment.currency)} on ${formatIsoDateShort(payment.date)}`}
                                  </small>
                                  {finance.canManage && !isEditingItem && (
                                    <StyledClientSubtleButton
                                      type="button"
                                      onClick={() =>
                                        openPaymentDateEditor(
                                          payment.target,
                                          payment.date,
                                        )
                                      }
                                    >
                                      <Trans>Edit date</Trans>
                                    </StyledClientSubtleButton>
                                  )}
                                </StyledDeliveryRow>
                                {isEditingItem && (
                                  <form
                                    onSubmit={(event) =>
                                      void handleSavePaymentDate(
                                        entry.title,
                                        payment.target,
                                        event,
                                      )
                                    }
                                    style={{ marginTop: '6px' }}
                                  >
                                    <StyledDeliveryRow>
                                      <input
                                        aria-label={t`Payment date`}
                                        type="date"
                                        required
                                        value={editingPaymentDate}
                                        onChange={(event) =>
                                          setEditingPaymentDate(
                                            event.target.value,
                                          )
                                        }
                                      />
                                      <StyledDeliveryButton
                                        type="submit"
                                        data-primary="true"
                                        disabled={editingPaymentSaving}
                                      >
                                        {editingPaymentSaving
                                          ? t`Saving…`
                                          : t`Save date`}
                                      </StyledDeliveryButton>
                                      <StyledDeliveryButton
                                        type="button"
                                        disabled={editingPaymentSaving}
                                        onClick={closePaymentDateEditor}
                                      >
                                        <Trans>Cancel</Trans>
                                      </StyledDeliveryButton>
                                    </StyledDeliveryRow>
                                    {editingPaymentError && (
                                      <p role="alert">{editingPaymentError}</p>
                                    )}
                                  </form>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {settlingEntryId === entry.id &&
                        !isNativeFinanceV2Entry && (
                          <form
                            onSubmit={(event) =>
                              void handleConfirmPaid(entry, event)
                            }
                            style={{ marginTop: '8px' }}
                          >
                            <StyledDeliveryRow>
                              <input
                                aria-label={t`Payment date`}
                                type="date"
                                required
                                value={settlePaymentDate}
                                onChange={(event) =>
                                  setSettlePaymentDate(event.target.value)
                                }
                              />
                              <input
                                aria-label={t`Payment proof URL`}
                                type="url"
                                required
                                placeholder="https://receipt-or-bank-proof-link"
                                value={settleEvidenceUrl}
                                onChange={(event) =>
                                  setSettleEvidenceUrl(event.target.value)
                                }
                                style={{ minWidth: '220px' }}
                              />
                              <StyledDeliveryButton
                                type="submit"
                                data-primary="true"
                                disabled={settleSaving}
                              >
                                {settleSaving
                                  ? t`Confirming…`
                                  : t`Confirm paid`}
                              </StyledDeliveryButton>
                              <StyledDeliveryButton
                                type="button"
                                disabled={settleSaving}
                                onClick={() => {
                                  setSettlingEntryId(null);
                                  setSettleError(null);
                                }}
                              >
                                <Trans>Cancel</Trans>
                              </StyledDeliveryButton>
                            </StyledDeliveryRow>
                            {settleError && <p role="alert">{settleError}</p>}
                          </form>
                        )}
                    </div>

                    <div className="ledger-right">
                      <span className="ledger-amount">
                        {formatMoneyMinor(entry.amount, entry.currency)}
                      </span>
                      {finance.canManage &&
                        singleTarget &&
                        !hasMultiplePayments &&
                        !isEditingSingle && (
                          <StyledClientSubtleButton
                            type="button"
                            onClick={() =>
                              openPaymentDateEditor(
                                singleTarget,
                                resolvedPaidDate,
                              )
                            }
                          >
                            <Trans>Edit date</Trans>
                          </StyledClientSubtleButton>
                        )}
                      {isOpenReceivable &&
                        finance.canManage &&
                        !isNativeFinanceV2Entry &&
                        settlingEntryId !== entry.id && (
                          <StyledDeliveryButton
                            type="button"
                            onClick={() => {
                              closePaymentDateEditor();
                              setSettlingEntryId(entry.id);
                              setSettleEvidenceUrl('');
                              setSettlePaymentDate(todayIso());
                              setSettleError(null);
                            }}
                          >
                            <Trans>Mark paid</Trans>
                          </StyledDeliveryButton>
                        )}
                      {isOpenReceivable &&
                        finance.canManage &&
                        isNativeFinanceV2Entry && (
                          <Link to="/delivery?view=finance&financeView=documents">
                            <Trans>Record in Finance →</Trans>
                          </Link>
                        )}
                    </div>
                  </StyledLedgerRow>
                );
              })}
            </StyledLedgerList>
            {finance.entries.length > 8 && (
              <div>
                <StyledClientSubtleButton
                  type="button"
                  onClick={() => setShowAllEntries((previous) => !previous)}
                >
                  {showAllEntries
                    ? t`Show recent 8`
                    : t`Show all ${finance.entries.length} entries`}
                </StyledClientSubtleButton>
              </div>
            )}
          </>
        ) : (
          <small>
            <Trans>No payments or invoices recorded for this client yet.</Trans>
          </small>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
