import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  financeAmountMicrosToDecimal,
  formatFinanceAmountMicros,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import {
  StyledFinanceV2FormGrid,
  StyledFinanceV2HeaderRow,
  StyledFinanceV2Notice,
  StyledFinanceV2Panel,
  StyledFinanceV2Pill,
  StyledFinanceV2Stack,
  StyledFinanceV2SubTabButton,
  StyledFinanceV2SubTabs,
  StyledFinanceV2Table,
  StyledFinanceV2TableWrap,
} from '@/delivery/finance/v2/finance-v2.styles';
import {
  FINANCE_V2_CURRENCIES,
  type FinanceV2CommandRunner,
  type FinanceV2Currency,
  type FinanceV2Invoice,
  type FinanceV2InvoiceSchedule,
  type FinanceV2Quote,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

type FinanceV2QuotesInvoicesTabProps = {
  data: FinanceV2Snapshot;
  busy: boolean;
  onRunCommand: FinanceV2CommandRunner;
};

type DraftLineItem = {
  label: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
};

const EMPTY_LINE: DraftLineItem = {
  label: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  discountPercent: '0',
};

const addDaysIso = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
};

const parseMoney = (raw: string): string | null =>
  parseFinanceAmountMicros(raw.replaceAll(',', '').trim());

export const FinanceV2QuotesInvoicesTab = ({
  data,
  busy,
  onRunCommand,
}: FinanceV2QuotesInvoicesTabProps) => {
  const { t } = useLingui();
  const store = useStore();
  const [section, setSection] = useState<'invoices' | 'recurring' | 'quotes'>(
    'invoices',
  );
  const [formError, setFormError] = useState('');

  // Form visibility + edit IDs
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(
    null,
  );

  // Shared form fields
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [projectId, setProjectId] = useState('');
  const [currency, setCurrency] = useState<FinanceV2Currency>('USD');
  const [issueDate, setIssueDate] = useState(data.today);
  const [dueDate, setDueDate] = useState(addDaysIso(data.today, 14));
  const [billingDay, setBillingDay] = useState('1');
  const [dueDay, setDueDay] = useState('17');
  const [startMonth, setStartMonth] = useState(data.today.slice(0, 7));
  const [endMonth, setEndMonth] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(data.profile.defaultQuoteTerms);
  const [lines, setLines] = useState<DraftLineItem[]>([{ ...EMPTY_LINE }]);

  // Payment inline panel
  const [payingInvoice, setPayingInvoice] = useState<FinanceV2Invoice | null>(
    null,
  );
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(data.today);
  const [paymentFxRate, setPaymentFxRate] = useState('');

  // Send Email confirmation panel (manual send with editable recipient & custom message)
  const [sendingEmail, setSendingEmail] = useState<{
    kind: 'QUOTE' | 'INVOICE';
    id: string;
    number: string;
    clientName: string;
  } | null>(null);
  const [sendToEmail, setSendToEmail] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  // Void confirmation panel
  const [voidingDoc, setVoidingDoc] = useState<{
    kind: 'QUOTE' | 'INVOICE' | 'PAYMENT';
    id: string;
    label: string;
  } | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Convert quote panel
  const [convertingQuote, setConvertingQuote] = useState<FinanceV2Quote | null>(
    null,
  );
  const [convertMode, setConvertMode] = useState<'ONE_OFF' | 'RECURRING'>(
    'ONE_OFF',
  );
  const [convertDueDate, setConvertDueDate] = useState(
    addDaysIso(data.today, 14),
  );
  const [convertBillingDay, setConvertBillingDay] = useState('1');
  const [convertDueDay, setConvertDueDay] = useState('17');
  const [convertStartMonth, setConvertStartMonth] = useState(
    data.today.slice(0, 7),
  );

  const resetForm = () => {
    setFormError('');
    setEditingQuoteId(null);
    setEditingInvoiceId(null);
    setEditingScheduleId(null);
    setClientName('');
    setClientEmail('');
    setClientAddress('');
    setProjectId('');
    setCurrency('USD');
    setIssueDate(data.today);
    setDueDate(addDaysIso(data.today, 14));
    setBillingDay('1');
    setDueDay('17');
    setStartMonth(data.today.slice(0, 7));
    setEndMonth('');
    setNotes('');
    setTerms(data.profile.defaultQuoteTerms);
    setLines([{ ...EMPTY_LINE }]);
  };

  // Close all open document editors when switching sub-tabs to prevent cross-tab form overwrite (HI-4).
  const switchSection = (next: 'invoices' | 'recurring' | 'quotes') => {
    setShowInvoiceForm(false);
    setShowScheduleForm(false);
    setShowQuoteForm(false);
    setPayingInvoice(null);
    setConvertingQuote(null);
    resetForm();
    setSection(next);
  };

  const toDraftLines = (
    items: FinanceV2Invoice['lineItems'],
  ): DraftLineItem[] =>
    items.length > 0
      ? items.map((item) => ({
          label: item.label,
          description: item.description,
          quantity: item.quantity,
          unitPrice: financeAmountMicrosToDecimal(item.unitPriceMicros),
          discountPercent: item.discountPercent,
        }))
      : [{ ...EMPTY_LINE }];

  const openEditQuote = (quote: FinanceV2Quote) => {
    setFormError('');
    setShowInvoiceForm(false);
    setShowScheduleForm(false);
    setEditingInvoiceId(null);
    setEditingScheduleId(null);
    setEditingQuoteId(quote.id);
    setClientName(quote.clientName);
    setClientEmail(quote.clientEmail);
    setClientAddress(quote.clientAddress);
    setProjectId(quote.projectId ?? '');
    setCurrency(quote.currency);
    setIssueDate(quote.issueDate);
    setDueDate(quote.validUntil ?? '');
    setNotes(quote.notes);
    setTerms(quote.terms);
    setLines(toDraftLines(quote.lineItems));
    setShowQuoteForm(true);
  };

  const openEditInvoice = (invoice: FinanceV2Invoice) => {
    setFormError('');
    setShowQuoteForm(false);
    setShowScheduleForm(false);
    setEditingQuoteId(null);
    setEditingScheduleId(null);
    setEditingInvoiceId(invoice.id);
    setClientName(invoice.clientName);
    setClientEmail(invoice.clientEmail);
    setClientAddress(invoice.clientAddress);
    setProjectId(invoice.projectId ?? '');
    setCurrency(invoice.currency);
    setIssueDate(invoice.issueDate);
    setDueDate(invoice.dueDate);
    setNotes(invoice.notes);
    setLines(toDraftLines(invoice.lineItems));
    setShowInvoiceForm(true);
  };

  const openEditSchedule = (schedule: FinanceV2InvoiceSchedule) => {
    setFormError('');
    setShowQuoteForm(false);
    setShowInvoiceForm(false);
    setEditingQuoteId(null);
    setEditingInvoiceId(null);
    setEditingScheduleId(schedule.id);
    setClientName(schedule.clientName);
    setClientEmail(schedule.clientEmail);
    setClientAddress(schedule.clientAddress);
    setProjectId(schedule.projectId ?? '');
    setCurrency(schedule.currency);
    setBillingDay(String(schedule.billingDayOfMonth));
    setDueDay(String(schedule.dueDayOfMonth));
    setStartMonth(schedule.startMonth);
    setEndMonth(schedule.endMonth ?? '');
    setNotes(schedule.notes);
    setLines(toDraftLines(schedule.lineItems));
    setShowScheduleForm(true);
  };

  const buildLineItemsPayload = () => {
    const filled = lines.filter((line) => line.label.trim() !== '');
    if (filled.length === 0) {
      setFormError(t`Add at least one service / line item with a name.`);
      return null;
    }
    const mapped = [];
    for (const line of filled) {
      const unitMicros = parseMoney(line.unitPrice);
      if (!unitMicros) {
        setFormError(t`Enter a valid numeric rate for "${line.label}".`);
        return null;
      }
      mapped.push({
        label: line.label.trim(),
        description: line.description.trim(),
        quantity: line.quantity.trim() || '1',
        unitPriceMicros: unitMicros,
        discountPercent: line.discountPercent.trim() || '0',
      });
    }
    return mapped;
  };

  const downloadPdf = async (
    kind: 'quotes' | 'invoices',
    id: string,
    filename: string,
  ) => {
    setFormError('');
    try {
      const token = store.get(tokenPairState.atom)
        ?.accessOrWorkspaceAgnosticToken?.token;
      const headers: Record<string, string> =
        !store.get(isCookieAuthActiveState.atom) && token
          ? { Authorization: `Bearer ${token}` }
          : {};
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/portal/delivery-finance-v2-files/${kind}/${id}/pdf`,
        { headers, credentials: 'include', cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error(t`Could not download PDF. Check access and try again.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : t`PDF download failed.`,
      );
    }
  };

  const addFromRateCard = (rateId: string) => {
    setFormError('');
    const found = data.profile.rateCard.find((item) => item.id === rateId);
    if (!found) return;
    const hasExistingLines = lines.some(
      (line) => line.label.trim() !== '' && line.unitPrice.trim() !== '',
    );
    if (!hasExistingLines) {
      setCurrency(found.currency);
    } else if (found.currency !== currency) {
      setFormError(
        t`Note: "${found.name}" is saved in ${found.currency} while this document is in ${currency}. Verify the rate below.`,
      );
    }
    setLines((prev) => [
      ...prev.filter((line) => line.label.trim() !== ''),
      {
        label: found.name,
        description: found.description,
        quantity: '1',
        unitPrice: financeAmountMicrosToDecimal(found.defaultRateMicros),
        discountPercent: '0',
      },
    ]);
  };

  const renderLineItemsEditor = () => (
    <StyledFinanceV2Stack>
      <StyledFinanceV2HeaderRow>
        <strong>
          <Trans>Line items</Trans>
        </strong>
        <StyledDeliveryRow>
          {data.profile.rateCard.length > 0 && (
            <select
              aria-label={t`Insert from rate card`}
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) {
                  addFromRateCard(event.target.value);
                  event.target.value = '';
                }
              }}
            >
              <option value="">{t`+ Insert from rate card…`}</option>
              {data.profile.rateCard.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (
                  {formatFinanceAmountMicros(
                    item.defaultRateMicros,
                    item.currency,
                  )}
                  )
                </option>
              ))}
            </select>
          )}
          <StyledDeliveryButton
            type="button"
            onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
          >
            <Trans>+ Add line</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledFinanceV2HeaderRow>
      {lines.map((line, index) => (
        <StyledFinanceV2FormGrid key={index}>
          <label>
            <Trans>Service / Item</Trans>
            <input
              value={line.label}
              placeholder={t`e.g. Monthly Creative Retainer`}
              onChange={(event) =>
                setLines((prev) =>
                  prev.map((row, i) =>
                    i === index ? { ...row, label: event.target.value } : row,
                  ),
                )
              }
            />
          </label>
          <label>
            <Trans>Details</Trans>
            <input
              value={line.description}
              placeholder={t`Optional scope notes`}
              onChange={(event) =>
                setLines((prev) =>
                  prev.map((row, i) =>
                    i === index
                      ? { ...row, description: event.target.value }
                      : row,
                  ),
                )
              }
            />
          </label>
          <label>
            <Trans>Qty</Trans>
            <input
              value={line.quantity}
              onChange={(event) =>
                setLines((prev) =>
                  prev.map((row, i) =>
                    i === index
                      ? { ...row, quantity: event.target.value }
                      : row,
                  ),
                )
              }
            />
          </label>
          <label>
            <Trans>Rate ({currency})</Trans>
            <input
              value={line.unitPrice}
              placeholder="2500"
              onChange={(event) =>
                setLines((prev) =>
                  prev.map((row, i) =>
                    i === index
                      ? { ...row, unitPrice: event.target.value }
                      : row,
                  ),
                )
              }
            />
          </label>
          <label>
            <Trans>Discount %</Trans>
            <input
              value={line.discountPercent}
              onChange={(event) =>
                setLines((prev) =>
                  prev.map((row, i) =>
                    i === index
                      ? { ...row, discountPercent: event.target.value }
                      : row,
                  ),
                )
              }
            />
          </label>
          {lines.length > 1 && (
            <div style={{ alignSelf: 'end' }}>
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  setLines((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <Trans>Remove</Trans>
              </StyledDeliveryButton>
            </div>
          )}
        </StyledFinanceV2FormGrid>
      ))}
    </StyledFinanceV2Stack>
  );

  return (
    <StyledFinanceV2Stack>
      <StyledFinanceV2HeaderRow>
        <StyledFinanceV2SubTabs>
          <StyledFinanceV2SubTabButton
            type="button"
            data-active={section === 'invoices' ? 'true' : undefined}
            onClick={() => switchSection('invoices')}
          >
            {t`Invoices (${data.invoices.length})`}
          </StyledFinanceV2SubTabButton>
          <StyledFinanceV2SubTabButton
            type="button"
            data-active={section === 'recurring' ? 'true' : undefined}
            onClick={() => switchSection('recurring')}
          >
            {t`Recurring Invoices (${data.invoiceSchedules.length})`}
          </StyledFinanceV2SubTabButton>
          <StyledFinanceV2SubTabButton
            type="button"
            data-active={section === 'quotes' ? 'true' : undefined}
            onClick={() => switchSection('quotes')}
          >
            {t`Quotes (${data.quotes.length})`}
          </StyledFinanceV2SubTabButton>
        </StyledFinanceV2SubTabs>

        {data.canManage && (
          <StyledDeliveryRow>
            {section === 'invoices' && (
              <StyledDeliveryButton
                data-primary="true"
                onClick={() => {
                  const wasEditing = Boolean(editingInvoiceId);
                  resetForm();
                  setShowInvoiceForm((prev) => (wasEditing ? true : !prev));
                }}
              >
                <Trans>+ New Invoice</Trans>
              </StyledDeliveryButton>
            )}
            {section === 'recurring' && (
              <StyledDeliveryButton
                data-primary="true"
                onClick={() => {
                  const wasEditing = Boolean(editingScheduleId);
                  resetForm();
                  setShowScheduleForm((prev) => (wasEditing ? true : !prev));
                }}
              >
                <Trans>+ New Recurring Invoice</Trans>
              </StyledDeliveryButton>
            )}
            {section === 'quotes' && (
              <StyledDeliveryButton
                data-primary="true"
                onClick={() => {
                  const wasEditing = Boolean(editingQuoteId);
                  resetForm();
                  setShowQuoteForm((prev) => (wasEditing ? true : !prev));
                }}
              >
                <Trans>+ New Quote</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        )}
      </StyledFinanceV2HeaderRow>

      {formError && (
        <StyledFinanceV2Notice data-tone="danger" role="alert">
          {formError}
        </StyledFinanceV2Notice>
      )}

      {sendingEmail && (
        <StyledFinanceV2Panel>
          <h3>
            {sendingEmail.kind === 'INVOICE'
              ? t`Send Invoice ${sendingEmail.number} via Email`
              : t`Send Quote ${sendingEmail.number} via Email`}
          </h3>
          <small>
            <Trans>
              The branded PDF will be attached automatically. Confirm the
              recipient email before sending.
            </Trans>
          </small>
          <StyledFinanceV2FormGrid>
            <label>
              <Trans>Recipient email</Trans>
              <input
                type="email"
                value={sendToEmail}
                placeholder="billing@client.com"
                onChange={(e) => setSendToEmail(e.target.value)}
              />
            </label>
          </StyledFinanceV2FormGrid>
          <label>
            <Trans>Message (optional)</Trans>
            <textarea
              value={sendMessage}
              placeholder={t`Leave blank to use the standard message.`}
              onChange={(e) => setSendMessage(e.target.value)}
            />
          </label>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              data-primary="true"
              disabled={busy}
              onClick={async () => {
                setFormError('');
                if (!sendToEmail.trim()) {
                  setFormError(t`Enter a recipient email address.`);
                  return;
                }
                const res = await onRunCommand(
                  sendingEmail.kind === 'INVOICE'
                    ? {
                        action: 'sendInvoiceEmail',
                        invoiceId: sendingEmail.id,
                        toEmail: sendToEmail.trim(),
                        message: sendMessage,
                      }
                    : {
                        action: 'sendQuoteEmail',
                        quoteId: sendingEmail.id,
                        toEmail: sendToEmail.trim(),
                        message: sendMessage,
                      },
                );
                if (res) {
                  setSendingEmail(null);
                  setSendMessage('');
                }
              }}
            >
              <Trans>Confirm &amp; Send Email</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton onClick={() => setSendingEmail(null)}>
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledFinanceV2Panel>
      )}

      {voidingDoc && (
        <StyledFinanceV2Panel>
          <h3>{t`Void ${voidingDoc.label}`}</h3>
          <label>
            <Trans>Reason</Trans>
            <input
              value={voidReason}
              placeholder={t`e.g. Rejected by client or billing error`}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </label>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              data-primary="true"
              disabled={busy}
              onClick={async () => {
                setFormError('');
                if (!voidReason.trim()) {
                  setFormError(t`Enter a short reason before voiding.`);
                  return;
                }
                const payload =
                  voidingDoc.kind === 'QUOTE'
                    ? {
                        action: 'voidQuote',
                        quoteId: voidingDoc.id,
                        reason: voidReason.trim(),
                      }
                    : voidingDoc.kind === 'INVOICE'
                      ? {
                          action: 'voidInvoice',
                          invoiceId: voidingDoc.id,
                          reason: voidReason.trim(),
                        }
                      : {
                          action: 'voidJournal',
                          journalId: voidingDoc.id,
                          reason: voidReason.trim(),
                        };
                const res = await onRunCommand(payload);
                if (res) {
                  setVoidingDoc(null);
                  setVoidReason('');
                }
              }}
            >
              <Trans>Confirm Void</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton onClick={() => setVoidingDoc(null)}>
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledFinanceV2Panel>
      )}

      {section === 'invoices' && (
        <StyledFinanceV2Stack>
          {showInvoiceForm && (
            <StyledFinanceV2Panel>
              <h3>
                {editingInvoiceId ? t`Edit Invoice` : t`Create One-Off Invoice`}
              </h3>
              <small>
                <Trans>
                  Creates and saves the branded PDF in the OS immediately. It is
                  never emailed until you click Send Email. Revenue is counted
                  only when you record payment.
                </Trans>
              </small>
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Client name</Trans>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Client email</Trans>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Client billing address</Trans>
                  <input
                    value={clientAddress}
                    placeholder={t`City, Country`}
                    onChange={(e) => setClientAddress(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Currency</Trans>
                  <select
                    value={currency}
                    onChange={(e) =>
                      setCurrency(e.target.value as FinanceV2Currency)
                    }
                  >
                    {FINANCE_V2_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Issue date</Trans>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Due date</Trans>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
              </StyledFinanceV2FormGrid>
              {renderLineItemsEditor()}
              <label>
                <Trans>Notes</Trans>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={busy}
                  onClick={async () => {
                    setFormError('');
                    if (!clientName.trim()) {
                      setFormError(t`Enter a client name.`);
                      return;
                    }
                    if (dueDate < issueDate) {
                      setFormError(
                        t`Due date cannot be earlier than issue date.`,
                      );
                      return;
                    }
                    const lineItems = buildLineItemsPayload();
                    if (!lineItems) return;
                    const res = await onRunCommand({
                      action: 'saveInvoice',
                      ...(editingInvoiceId ? { id: editingInvoiceId } : {}),
                      clientName: clientName.trim(),
                      clientEmail: clientEmail.trim(),
                      clientAddress: clientAddress.trim(),
                      projectId: projectId || null,
                      currency,
                      issueDate,
                      dueDate,
                      lineItems,
                      notes,
                    });
                    if (res) {
                      setShowInvoiceForm(false);
                      resetForm();
                    }
                  }}
                >
                  {editingInvoiceId
                    ? t`Update Invoice & Refresh PDF`
                    : t`Create Invoice & Save PDF`}
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => {
                    setShowInvoiceForm(false);
                    resetForm();
                  }}
                >
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledFinanceV2Panel>
          )}

          {payingInvoice && (
            <StyledFinanceV2Panel>
              <h3>
                {t`Record Payment for ${payingInvoice.invoiceNumber} (${payingInvoice.clientName})`}
              </h3>
              <small>
                <Trans>
                  Recording payment moves this amount into Company Cash and
                  recognizes Revenue on your AED Profit &amp; Loss.
                </Trans>
              </small>
              <StyledFinanceV2FormGrid>
                <label>
                  {t`Amount received (${payingInvoice.currency})`}
                  <input
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Payment date</Trans>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </label>
                {payingInvoice.currency !== 'AED' && (
                  <label>
                    {t`Exchange rate (${payingInvoice.currency} → AED)`}
                    <input
                      value={paymentFxRate}
                      placeholder={
                        data.profile.exchangeRates[payingInvoice.currency] ??
                        '1'
                      }
                      onChange={(e) => setPaymentFxRate(e.target.value)}
                    />
                  </label>
                )}
              </StyledFinanceV2FormGrid>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={busy}
                  onClick={async () => {
                    setFormError('');
                    const micros = parseMoney(paymentAmount);
                    if (!micros || BigInt(micros) <= 0n) {
                      setFormError(t`Enter a valid positive payment amount.`);
                      return;
                    }
                    const res = await onRunCommand({
                      action: 'recordInvoicePayment',
                      invoiceId: payingInvoice.id,
                      paymentDate,
                      amountMicros: micros,
                      ...(paymentFxRate.trim()
                        ? { fxRateToAed: paymentFxRate.trim() }
                        : {}),
                    });
                    if (res) setPayingInvoice(null);
                  }}
                >
                  <Trans>Confirm Payment Received</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton onClick={() => setPayingInvoice(null)}>
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledFinanceV2Panel>
          )}

          <StyledFinanceV2Panel>
            <h3>
              <Trans>Client Invoices</Trans>
            </h3>
            {data.invoices.length === 0 ? (
              <p>
                <Trans>
                  No invoices yet. Create a one-off invoice, set up a recurring
                  retainer schedule, or convert an approved quote.
                </Trans>
              </p>
            ) : (
              <StyledFinanceV2TableWrap>
                <StyledFinanceV2Table>
                  <thead>
                    <tr>
                      <th>
                        <Trans>Invoice</Trans>
                      </th>
                      <th>
                        <Trans>Client</Trans>
                      </th>
                      <th>
                        <Trans>Due Date</Trans>
                      </th>
                      <th>
                        <Trans>Status</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Total</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Balance Due</Trans>
                      </th>
                      <th>
                        <Trans>Actions</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((invoice) => {
                      const postedPayments = (invoice.payments ?? []).filter(
                        (p) => p.status === 'POSTED',
                      );
                      return (
                        <tr key={invoice.id}>
                          <td>
                            <strong>{invoice.invoiceNumber}</strong>
                            <div>
                              <small>{invoice.issueDate}</small>
                            </div>
                            {invoice.sentAt && (
                              <div>
                                <small>
                                  {t`Sent (${invoice.sentVia ?? 'MANUAL'}) ${invoice.sentAt.slice(0, 10)}`}
                                </small>
                              </div>
                            )}
                          </td>
                          <td>
                            {invoice.clientName}
                            {invoice.clientEmail && (
                              <div>
                                <small>{invoice.clientEmail}</small>
                              </div>
                            )}
                          </td>
                          <td>
                            {invoice.dueDate}
                            {invoice.overdueDays > 0 && (
                              <div>
                                <StyledFinanceV2Pill data-tone="danger">
                                  {t`${invoice.overdueDays} days overdue`}
                                </StyledFinanceV2Pill>
                              </div>
                            )}
                          </td>
                          <td>
                            <StyledFinanceV2Pill
                              data-tone={
                                invoice.status === 'PAID'
                                  ? 'success'
                                  : invoice.status === 'VOID'
                                    ? 'neutral'
                                    : invoice.overdueDays > 0
                                      ? 'danger'
                                      : 'info'
                              }
                            >
                              {invoice.status.replace('_', ' ')}
                            </StyledFinanceV2Pill>
                          </td>
                          <td data-numeric="true">
                            {formatFinanceAmountMicros(
                              invoice.totalMicros,
                              invoice.currency,
                            )}
                          </td>
                          <td data-numeric="true">
                            {formatFinanceAmountMicros(
                              invoice.outstandingMicros,
                              invoice.currency,
                            )}
                            {postedPayments.map((payment) => (
                              <div key={payment.journalId}>
                                <small>
                                  {t`Paid ${formatFinanceAmountMicros(payment.amountMicros, payment.currency)} (${payment.paymentDate})`}{' '}
                                  {data.canManage && (
                                    <StyledDeliveryButton
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        setVoidingDoc({
                                          kind: 'PAYMENT',
                                          id: payment.journalId,
                                          label: t`${invoice.invoiceNumber} payment (${payment.paymentDate})`,
                                        });
                                        setVoidReason('');
                                      }}
                                    >
                                      {t`Void`}
                                    </StyledDeliveryButton>
                                  )}
                                </small>
                              </div>
                            ))}
                          </td>
                          <td>
                            <StyledDeliveryRow>
                              <StyledDeliveryButton
                                disabled={busy}
                                onClick={() =>
                                  void downloadPdf(
                                    'invoices',
                                    invoice.id,
                                    `${invoice.invoiceNumber}.pdf`,
                                  )
                                }
                              >
                                <Trans>PDF</Trans>
                              </StyledDeliveryButton>
                              {data.canManage && invoice.status !== 'VOID' && (
                                <>
                                  <StyledDeliveryButton
                                    disabled={busy}
                                    onClick={() => {
                                      setFormError('');
                                      setSendingEmail({
                                        kind: 'INVOICE',
                                        id: invoice.id,
                                        number: invoice.invoiceNumber,
                                        clientName: invoice.clientName,
                                      });
                                      setSendToEmail(invoice.clientEmail);
                                      setSendMessage('');
                                    }}
                                  >
                                    <Trans>Send Email</Trans>
                                  </StyledDeliveryButton>
                                  {invoice.status === 'READY' && (
                                    <StyledDeliveryButton
                                      disabled={busy}
                                      onClick={() =>
                                        void onRunCommand({
                                          action: 'markInvoiceSent',
                                          invoiceId: invoice.id,
                                        })
                                      }
                                    >
                                      <Trans>Mark Sent</Trans>
                                    </StyledDeliveryButton>
                                  )}
                                  {invoice.paidMicros === '0' && (
                                    <StyledDeliveryButton
                                      disabled={busy}
                                      onClick={() => openEditInvoice(invoice)}
                                    >
                                      <Trans>Edit</Trans>
                                    </StyledDeliveryButton>
                                  )}
                                  {invoice.status !== 'PAID' && (
                                    <StyledDeliveryButton
                                      data-primary="true"
                                      disabled={busy}
                                      onClick={() => {
                                        setFormError('');
                                        setPayingInvoice(invoice);
                                        setPaymentAmount(
                                          financeAmountMicrosToDecimal(
                                            invoice.outstandingMicros,
                                          ),
                                        );
                                        setPaymentDate(data.today);
                                        setPaymentFxRate(
                                          data.profile.exchangeRates[
                                            invoice.currency
                                          ] ?? '1',
                                        );
                                      }}
                                    >
                                      <Trans>Mark Paid</Trans>
                                    </StyledDeliveryButton>
                                  )}
                                  {invoice.paidMicros === '0' && (
                                    <StyledDeliveryButton
                                      disabled={busy}
                                      onClick={() => {
                                        setVoidingDoc({
                                          kind: 'INVOICE',
                                          id: invoice.id,
                                          label: t`Invoice ${invoice.invoiceNumber}`,
                                        });
                                        setVoidReason('');
                                      }}
                                    >
                                      <Trans>Void</Trans>
                                    </StyledDeliveryButton>
                                  )}
                                </>
                              )}
                            </StyledDeliveryRow>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </StyledFinanceV2Table>
              </StyledFinanceV2TableWrap>
            )}
          </StyledFinanceV2Panel>
        </StyledFinanceV2Stack>
      )}

      {section === 'recurring' && (
        <StyledFinanceV2Stack>
          {showScheduleForm && (
            <StyledFinanceV2Panel>
              <h3>
                {editingScheduleId
                  ? t`Edit Recurring Monthly Invoice`
                  : t`New Recurring Monthly Invoice`}
              </h3>
              <small>
                <Trans>
                  Every month on the billing day, a branded PDF invoice is
                  created and kept ready in the Invoices tab. It will only email
                  the client when you click Send Email.
                </Trans>
              </small>
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Client name</Trans>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Client email</Trans>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Client billing address</Trans>
                  <input
                    value={clientAddress}
                    placeholder={t`City, Country`}
                    onChange={(e) => setClientAddress(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Currency</Trans>
                  <select
                    value={currency}
                    onChange={(e) =>
                      setCurrency(e.target.value as FinanceV2Currency)
                    }
                  >
                    {FINANCE_V2_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Billing day (1–31)</Trans>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={billingDay}
                    onChange={(e) => setBillingDay(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Due day (1–31)</Trans>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Start month (YYYY-MM)</Trans>
                  <input
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>End month (optional, YYYY-MM)</Trans>
                  <input
                    value={endMonth}
                    placeholder={t`Leave blank until stopped`}
                    onChange={(e) => setEndMonth(e.target.value)}
                  />
                </label>
              </StyledFinanceV2FormGrid>
              {renderLineItemsEditor()}
              <label>
                <Trans>Notes</Trans>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={busy}
                  onClick={async () => {
                    setFormError('');
                    if (!clientName.trim()) {
                      setFormError(t`Enter a client name.`);
                      return;
                    }
                    const parsedBilling = Number.parseInt(billingDay, 10);
                    const parsedDue = Number.parseInt(dueDay, 10);
                    if (
                      !Number.isInteger(parsedBilling) ||
                      parsedBilling < 1 ||
                      parsedBilling > 31
                    ) {
                      setFormError(t`Billing day must be between 1 and 31.`);
                      return;
                    }
                    if (
                      !Number.isInteger(parsedDue) ||
                      parsedDue < 1 ||
                      parsedDue > 31
                    ) {
                      setFormError(t`Due day must be between 1 and 31.`);
                      return;
                    }
                    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth.trim())) {
                      setFormError(t`Enter a valid start month (YYYY-MM).`);
                      return;
                    }
                    const trimmedEnd = endMonth.trim();
                    if (
                      trimmedEnd &&
                      !/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmedEnd)
                    ) {
                      setFormError(t`Enter a valid end month (YYYY-MM).`);
                      return;
                    }
                    if (trimmedEnd && trimmedEnd < startMonth.trim()) {
                      setFormError(
                        t`End month cannot be earlier than start month.`,
                      );
                      return;
                    }
                    const lineItems = buildLineItemsPayload();
                    if (!lineItems) return;
                    const res = await onRunCommand({
                      action: 'saveInvoiceSchedule',
                      ...(editingScheduleId ? { id: editingScheduleId } : {}),
                      clientName: clientName.trim(),
                      clientEmail: clientEmail.trim(),
                      clientAddress: clientAddress.trim(),
                      projectId: projectId || null,
                      currency,
                      lineItems,
                      billingDayOfMonth: parsedBilling,
                      dueDayOfMonth: parsedDue,
                      startMonth: startMonth.trim(),
                      endMonth: trimmedEnd || null,
                      notes,
                    });
                    if (res) {
                      setShowScheduleForm(false);
                      resetForm();
                    }
                  }}
                >
                  {editingScheduleId
                    ? t`Update Recurring Invoice`
                    : t`Save Recurring Invoice`}
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => {
                    setShowScheduleForm(false);
                    resetForm();
                  }}
                >
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledFinanceV2Panel>
          )}

          <StyledFinanceV2Panel>
            <h3>
              <Trans>Recurring Invoice Schedules</Trans>
            </h3>
            {data.invoiceSchedules.length === 0 ? (
              <p>
                <Trans>No recurring client invoices scheduled yet.</Trans>
              </p>
            ) : (
              <StyledFinanceV2TableWrap>
                <StyledFinanceV2Table>
                  <thead>
                    <tr>
                      <th>
                        <Trans>Client</Trans>
                      </th>
                      <th>
                        <Trans>Schedule</Trans>
                      </th>
                      <th>
                        <Trans>Status</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Monthly Total</Trans>
                      </th>
                      <th>
                        <Trans>Actions</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoiceSchedules.map((schedule) => (
                      <tr key={schedule.id}>
                        <td>
                          <strong>{schedule.clientName}</strong>
                          {schedule.clientEmail && (
                            <div>
                              <small>{schedule.clientEmail}</small>
                            </div>
                          )}
                        </td>
                        <td>
                          {t`Creates on day ${schedule.billingDayOfMonth} · Due day ${schedule.dueDayOfMonth}`}
                          <div>
                            <small>{t`Since ${schedule.startMonth}`}</small>
                          </div>
                        </td>
                        <td>
                          <StyledFinanceV2Pill
                            data-tone={
                              schedule.status === 'ACTIVE'
                                ? 'success'
                                : 'neutral'
                            }
                          >
                            {schedule.status}
                          </StyledFinanceV2Pill>
                        </td>
                        <td data-numeric="true">
                          {formatFinanceAmountMicros(
                            schedule.totalMicros,
                            schedule.currency,
                          )}
                        </td>
                        <td>
                          {data.canManage && (
                            <StyledDeliveryRow>
                              <StyledDeliveryButton
                                disabled={busy}
                                onClick={() => openEditSchedule(schedule)}
                              >
                                <Trans>Edit</Trans>
                              </StyledDeliveryButton>
                              {schedule.status === 'ACTIVE' ? (
                                <StyledDeliveryButton
                                  disabled={busy}
                                  onClick={() =>
                                    void onRunCommand({
                                      action: 'setInvoiceScheduleStatus',
                                      id: schedule.id,
                                      status: 'PAUSED',
                                    })
                                  }
                                >
                                  <Trans>Pause</Trans>
                                </StyledDeliveryButton>
                              ) : (
                                <StyledDeliveryButton
                                  disabled={busy}
                                  onClick={() =>
                                    void onRunCommand({
                                      action: 'setInvoiceScheduleStatus',
                                      id: schedule.id,
                                      status: 'ACTIVE',
                                    })
                                  }
                                >
                                  <Trans>Resume</Trans>
                                </StyledDeliveryButton>
                              )}
                              {schedule.status !== 'STOPPED' && (
                                <StyledDeliveryButton
                                  disabled={busy}
                                  onClick={() =>
                                    void onRunCommand({
                                      action: 'setInvoiceScheduleStatus',
                                      id: schedule.id,
                                      status: 'STOPPED',
                                    })
                                  }
                                >
                                  <Trans>Stop</Trans>
                                </StyledDeliveryButton>
                              )}
                            </StyledDeliveryRow>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </StyledFinanceV2Table>
              </StyledFinanceV2TableWrap>
            )}
          </StyledFinanceV2Panel>
        </StyledFinanceV2Stack>
      )}

      {section === 'quotes' && (
        <StyledFinanceV2Stack>
          {showQuoteForm && (
            <StyledFinanceV2Panel>
              <h3>
                {editingQuoteId ? t`Edit Client Quote` : t`Create Client Quote`}
              </h3>
              <small>
                <Trans>
                  Download as a branded PDF to send to your client. Quotes do
                  not affect Revenue or your Balance Sheet. Convert approved
                  quotes to an Invoice in 1 click, or void rejected quotes.
                </Trans>
              </small>
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Client name</Trans>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Client email</Trans>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Client address</Trans>
                  <input
                    value={clientAddress}
                    placeholder={t`City, Country`}
                    onChange={(e) => setClientAddress(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Currency</Trans>
                  <select
                    value={currency}
                    onChange={(e) =>
                      setCurrency(e.target.value as FinanceV2Currency)
                    }
                  >
                    {FINANCE_V2_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Quote date</Trans>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Valid until</Trans>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
              </StyledFinanceV2FormGrid>
              {renderLineItemsEditor()}
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Notes</Trans>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Terms &amp; Conditions</Trans>
                  <textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                  />
                </label>
              </StyledFinanceV2FormGrid>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={busy}
                  onClick={async () => {
                    setFormError('');
                    if (!clientName.trim()) {
                      setFormError(t`Enter a client name.`);
                      return;
                    }
                    if (dueDate && dueDate < issueDate) {
                      setFormError(
                        t`"Valid until" date cannot be earlier than quote date.`,
                      );
                      return;
                    }
                    const lineItems = buildLineItemsPayload();
                    if (!lineItems) return;
                    const res = await onRunCommand({
                      action: 'saveQuote',
                      ...(editingQuoteId ? { id: editingQuoteId } : {}),
                      clientName: clientName.trim(),
                      clientEmail: clientEmail.trim(),
                      clientAddress: clientAddress.trim(),
                      projectId: projectId || null,
                      currency,
                      issueDate,
                      validUntil: dueDate || null,
                      lineItems,
                      notes,
                      terms,
                    });
                    if (res) {
                      setShowQuoteForm(false);
                      resetForm();
                    }
                  }}
                >
                  {editingQuoteId ? t`Update Quote` : t`Save Quote`}
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => {
                    setShowQuoteForm(false);
                    resetForm();
                  }}
                >
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledFinanceV2Panel>
          )}

          {convertingQuote && (
            <StyledFinanceV2Panel>
              <h3>
                {t`Convert ${convertingQuote.quoteNumber} (${convertingQuote.clientName}) to Invoice`}
              </h3>
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Invoice type</Trans>
                  <select
                    value={convertMode}
                    onChange={(e) =>
                      setConvertMode(e.target.value as 'ONE_OFF' | 'RECURRING')
                    }
                  >
                    <option value="ONE_OFF">{t`One-Off Invoice`}</option>
                    <option value="RECURRING">
                      {t`Recurring Monthly Invoice`}
                    </option>
                  </select>
                </label>
                {convertMode === 'ONE_OFF' ? (
                  <label>
                    <Trans>Due date</Trans>
                    <input
                      type="date"
                      value={convertDueDate}
                      onChange={(e) => setConvertDueDate(e.target.value)}
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      <Trans>Start month (YYYY-MM)</Trans>
                      <input
                        value={convertStartMonth}
                        onChange={(e) => setConvertStartMonth(e.target.value)}
                      />
                    </label>
                    <label>
                      <Trans>Billing day (1–31)</Trans>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={convertBillingDay}
                        onChange={(e) => setConvertBillingDay(e.target.value)}
                      />
                    </label>
                    <label>
                      <Trans>Due day (1–31)</Trans>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={convertDueDay}
                        onChange={(e) => setConvertDueDay(e.target.value)}
                      />
                    </label>
                  </>
                )}
              </StyledFinanceV2FormGrid>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={busy}
                  onClick={async () => {
                    setFormError('');
                    if (convertMode === 'ONE_OFF') {
                      if (!convertDueDate || convertDueDate < data.today) {
                        setFormError(
                          t`Due date cannot be earlier than today (${data.today}).`,
                        );
                        return;
                      }
                    } else {
                      const parsedBilling = Number.parseInt(
                        convertBillingDay,
                        10,
                      );
                      const parsedDue = Number.parseInt(convertDueDay, 10);
                      if (
                        !Number.isInteger(parsedBilling) ||
                        parsedBilling < 1 ||
                        parsedBilling > 31
                      ) {
                        setFormError(t`Billing day must be between 1 and 31.`);
                        return;
                      }
                      if (
                        !Number.isInteger(parsedDue) ||
                        parsedDue < 1 ||
                        parsedDue > 31
                      ) {
                        setFormError(t`Due day must be between 1 and 31.`);
                        return;
                      }
                      if (
                        !/^\d{4}-(0[1-9]|1[0-2])$/.test(
                          convertStartMonth.trim(),
                        )
                      ) {
                        setFormError(t`Enter a valid start month (YYYY-MM).`);
                        return;
                      }
                    }
                    const res = await onRunCommand({
                      action: 'convertQuoteToInvoice',
                      quoteId: convertingQuote.id,
                      mode: convertMode,
                      ...(convertMode === 'ONE_OFF'
                        ? { issueDate: data.today, dueDate: convertDueDate }
                        : {
                            billingDayOfMonth: Number.parseInt(
                              convertBillingDay,
                              10,
                            ),
                            dueDayOfMonth: Number.parseInt(convertDueDay, 10),
                            startMonth: convertStartMonth.trim(),
                          }),
                    });
                    if (res) {
                      setConvertingQuote(null);
                      switchSection(
                        convertMode === 'ONE_OFF' ? 'invoices' : 'recurring',
                      );
                    }
                  }}
                >
                  <Trans>Confirm Conversion</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton onClick={() => setConvertingQuote(null)}>
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledFinanceV2Panel>
          )}

          <StyledFinanceV2Panel>
            <h3>
              <Trans>Quotes</Trans>
            </h3>
            {data.quotes.length === 0 ? (
              <p>
                <Trans>
                  No quotes yet. Create a quote to download a branded PDF for a
                  client and convert it straight to an invoice once approved.
                </Trans>
              </p>
            ) : (
              <StyledFinanceV2TableWrap>
                <StyledFinanceV2Table>
                  <thead>
                    <tr>
                      <th>
                        <Trans>Quote</Trans>
                      </th>
                      <th>
                        <Trans>Client</Trans>
                      </th>
                      <th>
                        <Trans>Status</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Total</Trans>
                      </th>
                      <th>
                        <Trans>Actions</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.quotes.map((quote) => (
                      <tr key={quote.id}>
                        <td>
                          <strong>{quote.quoteNumber}</strong>
                          <div>
                            <small>
                              {quote.issueDate}
                              {quote.validUntil
                                ? ` · ${t`Valid until ${quote.validUntil}`}`
                                : ''}
                            </small>
                          </div>
                        </td>
                        <td>
                          {quote.clientName}
                          {quote.clientEmail && (
                            <div>
                              <small>{quote.clientEmail}</small>
                            </div>
                          )}
                        </td>
                        <td>
                          <StyledFinanceV2Pill
                            data-tone={
                              quote.status === 'CONVERTED'
                                ? 'success'
                                : quote.status === 'VOID'
                                  ? 'neutral'
                                  : 'info'
                            }
                          >
                            {quote.status}
                          </StyledFinanceV2Pill>
                        </td>
                        <td data-numeric="true">
                          {formatFinanceAmountMicros(
                            quote.totalMicros,
                            quote.currency,
                          )}
                        </td>
                        <td>
                          <StyledDeliveryRow>
                            <StyledDeliveryButton
                              disabled={busy}
                              onClick={() =>
                                void downloadPdf(
                                  'quotes',
                                  quote.id,
                                  `${quote.quoteNumber}.pdf`,
                                )
                              }
                            >
                              <Trans>Download PDF</Trans>
                            </StyledDeliveryButton>
                            {data.canManage &&
                              quote.status !== 'VOID' &&
                              quote.status !== 'CONVERTED' && (
                                <>
                                  <StyledDeliveryButton
                                    disabled={busy}
                                    onClick={() => openEditQuote(quote)}
                                  >
                                    <Trans>Edit</Trans>
                                  </StyledDeliveryButton>
                                  <StyledDeliveryButton
                                    disabled={busy}
                                    onClick={() => {
                                      setFormError('');
                                      setSendingEmail({
                                        kind: 'QUOTE',
                                        id: quote.id,
                                        number: quote.quoteNumber,
                                        clientName: quote.clientName,
                                      });
                                      setSendToEmail(quote.clientEmail);
                                      setSendMessage('');
                                    }}
                                  >
                                    <Trans>Send Email</Trans>
                                  </StyledDeliveryButton>
                                  {quote.status === 'DRAFT' && (
                                    <StyledDeliveryButton
                                      disabled={busy}
                                      onClick={() =>
                                        void onRunCommand({
                                          action: 'markQuoteSent',
                                          quoteId: quote.id,
                                        })
                                      }
                                    >
                                      <Trans>Mark Sent</Trans>
                                    </StyledDeliveryButton>
                                  )}
                                  <StyledDeliveryButton
                                    data-primary="true"
                                    disabled={busy}
                                    onClick={() => {
                                      setConvertingQuote(quote);
                                      setConvertMode('ONE_OFF');
                                      setConvertDueDate(
                                        addDaysIso(data.today, 14),
                                      );
                                      setConvertStartMonth(
                                        data.today.slice(0, 7),
                                      );
                                    }}
                                  >
                                    <Trans>Convert to Invoice</Trans>
                                  </StyledDeliveryButton>
                                  <StyledDeliveryButton
                                    disabled={busy}
                                    onClick={() => {
                                      setVoidingDoc({
                                        kind: 'QUOTE',
                                        id: quote.id,
                                        label: t`Quote ${quote.quoteNumber}`,
                                      });
                                      setVoidReason('');
                                    }}
                                  >
                                    <Trans>Void / Reject</Trans>
                                  </StyledDeliveryButton>
                                </>
                              )}
                          </StyledDeliveryRow>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </StyledFinanceV2Table>
              </StyledFinanceV2TableWrap>
            )}
          </StyledFinanceV2Panel>
        </StyledFinanceV2Stack>
      )}
    </StyledFinanceV2Stack>
  );
};
