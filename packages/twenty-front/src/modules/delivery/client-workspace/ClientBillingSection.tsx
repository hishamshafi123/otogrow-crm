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
} from '@/delivery/client-workspace/client-workspace.styles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

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

type ClientBillingSectionProps = {
  companyId: string;
  companyName: string;
  hubClient: ClientHubItem;
  updatingRoster: boolean;
  onUpdateRoster: (input: ClientRosterUpdateInput) => Promise<boolean>;
  onRefreshHub: () => Promise<unknown>;
};

export const ClientBillingSection = ({
  companyId,
  companyName,
  hubClient,
  updatingRoster,
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
  const [settleSaving, setSettleSaving] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  if (!finance) return null;

  const openReceivablesText = formatCurrencyTotals(
    finance.openReceivablesByCurrency,
  );
  const collectedText = formatCurrencyTotals(finance.collectedByCurrency);

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
          ? t`Recorded payment for ${companyName}.`
          : t`Created invoice for ${companyName}.`,
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
          },
        },
      });
      await onRefreshHub();
      setSettlingEntryId(null);
      setSettleEvidenceUrl('');
      setStatusMessage(t`Marked "${entry.title}" as paid.`);
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
            <div>
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
                  </div>
                  {finance.fee.notes && <p>{finance.fee.notes}</p>}
                </>
              ) : (
                <>
                  <strong>
                    <Trans>No agreed fee set</Trans>
                  </strong>
                  <p>
                    <Trans>
                      Set this client’s retainer or project fee to pre-fill
                      invoices and payments.
                    </Trans>
                  </p>
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
              {feeError && <p role="alert">{feeError}</p>}
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
          <StyledLedgerList aria-label={t`Recent client billing entries`}>
            {finance.entries.slice(0, 8).map((entry) => {
              const isOpenReceivable =
                entry.category === 'RECEIVABLE' && entry.status === 'OPEN';
              const isOverdue =
                isOpenReceivable &&
                Boolean(entry.dueDate) &&
                (entry.dueDate as string) < today;
              const tone =
                entry.category === 'INCOME' || entry.status === 'PAID'
                  ? 'success'
                  : isOverdue
                    ? 'danger'
                    : 'warning';
              const badgeLabel =
                entry.category === 'INCOME'
                  ? t`Collected`
                  : entry.status === 'PAID'
                    ? t`Paid`
                    : isOverdue
                      ? t`Overdue`
                      : t`Open invoice`;

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
                      {formatIsoDateShort(entry.date)}
                      {entry.dueDate && isOpenReceivable
                        ? ` · ${t`Due ${formatIsoDateShort(entry.dueDate)}`}`
                        : ''}
                      {entry.projectName ? ` · ${entry.projectName}` : ''}
                      {entry.externalReference
                        ? ` · ${entry.externalReference}`
                        : ''}
                    </small>
                    {settlingEntryId === entry.id && (
                      <form
                        onSubmit={(event) =>
                          void handleConfirmPaid(entry, event)
                        }
                        style={{ marginTop: '8px' }}
                      >
                        <StyledDeliveryRow>
                          <input
                            aria-label={t`Payment proof URL`}
                            type="url"
                            required
                            placeholder="https://receipt-or-bank-proof-link"
                            value={settleEvidenceUrl}
                            onChange={(event) =>
                              setSettleEvidenceUrl(event.target.value)
                            }
                            style={{ minWidth: '240px' }}
                          />
                          <StyledDeliveryButton
                            type="submit"
                            data-primary="true"
                            disabled={settleSaving}
                          >
                            {settleSaving ? t`Confirming…` : t`Confirm paid`}
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
                    {isOpenReceivable &&
                      finance.canManage &&
                      settlingEntryId !== entry.id && (
                        <StyledDeliveryButton
                          type="button"
                          onClick={() => {
                            setSettlingEntryId(entry.id);
                            setSettleEvidenceUrl('');
                            setSettleError(null);
                          }}
                        >
                          <Trans>Mark paid</Trans>
                        </StyledDeliveryButton>
                      )}
                  </div>
                </StyledLedgerRow>
              );
            })}
          </StyledLedgerList>
        ) : (
          <small>
            <Trans>No payments or invoices recorded for this client yet.</Trans>
          </small>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
