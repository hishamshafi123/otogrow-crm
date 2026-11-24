import { Fragment, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
import {
  financeAmountMicrosToDecimal,
  formatFinanceAmountMicros,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import {
  calculateDraftDocumentTotals,
  computeDefaultReversalDate,
  createFinanceV2RequestId,
  isFinanceV2AmountMicrosWithinLimit,
  isValidDiscountPercent,
  isValidPositiveFxRate,
  isValidPositiveQuantity,
} from '@/delivery/finance/v2/finance-v2-currency';
import {
  StyledFinanceV2ActionGroup,
  StyledFinanceV2FormGrid,
  StyledFinanceV2HeaderRow,
  StyledFinanceV2InlineEditor,
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
  type FinanceV2DocumentLineItem,
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
  const [infoNotice, setInfoNotice] = useState('');

  // Filters
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('ALL');
  const [invoiceCurrencyFilter, setInvoiceCurrencyFilter] = useState<
    FinanceV2Currency | 'ALL'
  >('ALL');
  const [invoiceProjectFilter, setInvoiceProjectFilter] = useState('');

  const [quoteSearch, setQuoteSearch] = useState('');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState('ALL');
  const [quoteCurrencyFilter, setQuoteCurrencyFilter] = useState<
    FinanceV2Currency | 'ALL'
  >('ALL');
  const [quoteProjectFilter, setQuoteProjectFilter] = useState('');

  // Form visibility + edit IDs
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(
    null,
  );
  const [confirmingStopScheduleId, setConfirmingStopScheduleId] = useState<
    string | null
  >(null);

  // Read-only detail inspector
  const [viewingDetails, setViewingDetails] = useState<{
    kind: 'INVOICE' | 'QUOTE';
    id: string;
  } | null>(null);

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
  const [paymentRequestId, setPaymentRequestId] = useState(
    createFinanceV2RequestId,
  );
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(data.today);
  const [paymentFxRate, setPaymentFxRate] = useState('');

  // Send Email confirmation panel
  const [sendingEmail, setSendingEmail] = useState<{
    kind: 'QUOTE' | 'INVOICE';
    id: string;
    number: string;
    clientName: string;
  } | null>(null);
  const [sendToEmail, setSendToEmail] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  // Void / Reverse confirmation panel (rowId ties PAYMENT actions to their parent invoice row)
  const [voidingDoc, setVoidingDoc] = useState<{
    kind: 'QUOTE' | 'INVOICE' | 'PAYMENT' | 'PAYMENT_REVERSE';
    id: string;
    rowId: string;
    label: string;
  } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [reverseDate, setReverseDate] = useState(data.today);

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

  const projectNameById = new Map(
    data.projects.map((proj) => [proj.id, proj.name]),
  );

  const resetFormFields = (defaultNotes = '') => {
    setFormError('');
    setInfoNotice('');
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
    setNotes(defaultNotes);
    setTerms(data.profile.defaultQuoteTerms);
    setLines([{ ...EMPTY_LINE }]);
  };

  const closeAllPanels = () => {
    setShowInvoiceForm(false);
    setShowScheduleForm(false);
    setShowQuoteForm(false);
    setPayingInvoice(null);
    setPaymentFxRate('');
    setPaymentRequestId(createFinanceV2RequestId());
    setSendingEmail(null);
    setSendMessage('');
    setVoidingDoc(null);
    setVoidReason('');
    setConvertingQuote(null);
    setConvertMode('ONE_OFF');
    setConvertDueDate(addDaysIso(data.today, 14));
    setConvertBillingDay('1');
    setConvertDueDay('17');
    setConvertStartMonth(data.today.slice(0, 7));
    setConfirmingStopScheduleId(null);
    setViewingDetails(null);
    resetFormFields();
  };

  const switchSection = (next: 'invoices' | 'recurring' | 'quotes') => {
    closeAllPanels();
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
    if (showQuoteForm && editingQuoteId === quote.id) {
      closeAllPanels();
      return;
    }
    closeAllPanels();
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
    if (showInvoiceForm && editingInvoiceId === invoice.id) {
      closeAllPanels();
      return;
    }
    closeAllPanels();
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
    if (showScheduleForm && editingScheduleId === schedule.id) {
      closeAllPanels();
      return;
    }
    closeAllPanels();
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
    // Warn instead of silently dropping unlabeled rows that have a rate or details entered
    const unlabeledWithData = lines.findIndex(
      (line) =>
        line.label.trim() === '' &&
        (line.unitPrice.trim() !== '' || line.description.trim() !== ''),
    );
    if (unlabeledWithData !== -1) {
      setFormError(
        t`Line item #${unlabeledWithData + 1} has a rate or description but no Service / Item name.`,
      );
      return null;
    }

    const filled = lines.filter((line) => line.label.trim() !== '');
    if (filled.length === 0) {
      setFormError(t`Add at least one service / line item with a name.`);
      return null;
    }
    const mapped = [];
    for (const line of filled) {
      const qtyRaw = line.quantity.trim() || '1';
      if (!isValidPositiveQuantity(qtyRaw)) {
        setFormError(t`Enter a valid positive quantity for "${line.label}".`);
        return null;
      }
      const unitMicros = parseMoney(line.unitPrice);
      if (!unitMicros || !isFinanceV2AmountMicrosWithinLimit(unitMicros)) {
        setFormError(t`Enter a valid numeric rate for "${line.label}".`);
        return null;
      }
      const discountRaw = line.discountPercent.trim() || '0';
      if (!isValidDiscountPercent(discountRaw)) {
        setFormError(
          t`Discount % for "${line.label}" must be between 0 and 100.`,
        );
        return null;
      }
      mapped.push({
        label: line.label.trim(),
        description: line.description.trim(),
        quantity: qtyRaw,
        unitPriceMicros: unitMicros,
        discountPercent: discountRaw,
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
    setInfoNotice('');
    const found = data.profile.rateCard.find((item) => item.id === rateId);
    if (!found) return;
    const hasExistingLines = lines.some(
      (line) => line.label.trim() !== '' && line.unitPrice.trim() !== '',
    );
    if (!hasExistingLines) {
      setCurrency(found.currency);
    } else if (found.currency !== currency) {
      setInfoNotice(
        t`Rate card item "${found.name}" is saved in ${found.currency} while this document is in ${currency}. Verify or convert its rate below.`,
      );
    }
    setLines((prev) => [
      ...prev.filter(
        (line) =>
          line.label.trim() !== '' ||
          line.unitPrice.trim() !== '' ||
          line.description.trim() !== '',
      ),
      {
        label: found.name,
        description: found.description,
        quantity: '1',
        unitPrice: financeAmountMicrosToDecimal(found.defaultRateMicros),
        discountPercent: '0',
      },
    ]);
  };

  const draftTotals = calculateDraftDocumentTotals(
    lines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      unitPriceMicros: parseMoney(line.unitPrice),
      discountPercent: line.discountPercent,
    })),
  );

  const renderProjectSelect = () =>
    data.projects.length > 0 ? (
      <label>
        <Trans>Project (optional)</Trans>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">{t`Company-wide / Unassigned`}</option>
          {data.projects.map((proj) => (
            <option key={proj.id} value={proj.id}>
              {proj.name}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  const renderLineItemsEditor = () => (
    <StyledFinanceV2Stack>
      <StyledFinanceV2HeaderRow>
        <strong>
          <Trans>Line items</Trans>
        </strong>
        <StyledFinanceV2ActionGroup>
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
        </StyledFinanceV2ActionGroup>
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
          <div style={{ alignSelf: 'end' }}>
            <StyledFinanceV2ActionGroup>
              {draftTotals.lineTotalsMicros[index] && (
                <StyledFinanceV2Pill data-tone="neutral">
                  {formatFinanceAmountMicros(
                    draftTotals.lineTotalsMicros[index]!,
                    currency,
                  )}
                </StyledFinanceV2Pill>
              )}
              {lines.length > 1 && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() =>
                    setLines((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <Trans>Remove</Trans>
                </StyledDeliveryButton>
              )}
            </StyledFinanceV2ActionGroup>
          </div>
        </StyledFinanceV2FormGrid>
      ))}
      <StyledFinanceV2Notice data-tone="info">
        {t`Subtotal: ${formatFinanceAmountMicros(draftTotals.subtotalMicros, currency)}`}
        {draftTotals.discountTotalMicros !== '0'
          ? ` · ${t`Discount: -${formatFinanceAmountMicros(draftTotals.discountTotalMicros, currency)}`}`
          : ''}
        {' · '}
        <strong>
          {t`Grand Total: ${formatFinanceAmountMicros(draftTotals.totalMicros, currency)}`}
        </strong>
      </StyledFinanceV2Notice>
    </StyledFinanceV2Stack>
  );

  const renderDocumentDetailsPreview = (params: {
    title: string;
    currency: FinanceV2Currency;
    lineItems: FinanceV2DocumentLineItem[];
    subtotalMicros: string;
    discountTotalMicros: string;
    totalMicros: string;
    notes: string;
    terms?: string;
    projectId: string | null;
    voidReason: string | null;
  }) => (
    <StyledFinanceV2Stack>
      <StyledFinanceV2HeaderRow>
        <h4>{params.title}</h4>
        <StyledDeliveryButton type="button" onClick={closeAllPanels}>
          <Trans>Close</Trans>
        </StyledDeliveryButton>
      </StyledFinanceV2HeaderRow>
      {params.projectId && projectNameById.has(params.projectId) && (
        <small>
          {t`Project: ${projectNameById.get(params.projectId) ?? ''}`}
        </small>
      )}
      {params.voidReason && (
        <StyledFinanceV2Notice data-tone="danger">
          {t`Void reason: ${params.voidReason}`}
        </StyledFinanceV2Notice>
      )}
      <StyledFinanceV2TableWrap>
        <StyledFinanceV2Table>
          <thead>
            <tr>
              <th>
                <Trans>Service / Item</Trans>
              </th>
              <th data-numeric="true">
                <Trans>Qty</Trans>
              </th>
              <th data-numeric="true">
                <Trans>Rate</Trans>
              </th>
              <th data-numeric="true">
                <Trans>Discount %</Trans>
              </th>
              <th data-numeric="true">
                <Trans>Line Total</Trans>
              </th>
            </tr>
          </thead>
          <tbody>
            {params.lineItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.label}</strong>
                  {item.description && (
                    <div>
                      <small>{item.description}</small>
                    </div>
                  )}
                </td>
                <td data-numeric="true">{item.quantity}</td>
                <td data-numeric="true">
                  {formatFinanceAmountMicros(
                    item.unitPriceMicros,
                    params.currency,
                  )}
                </td>
                <td data-numeric="true">{`${item.discountPercent}%`}</td>
                <td data-numeric="true">
                  {formatFinanceAmountMicros(
                    item.lineTotalMicros,
                    params.currency,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </StyledFinanceV2Table>
      </StyledFinanceV2TableWrap>
      <div>
        <small>
          {t`Subtotal: ${formatFinanceAmountMicros(params.subtotalMicros, params.currency)}`}
          {params.discountTotalMicros !== '0'
            ? ` · ${t`Discount: -${formatFinanceAmountMicros(params.discountTotalMicros, params.currency)}`}`
            : ''}
          {` · ${t`Total: ${formatFinanceAmountMicros(params.totalMicros, params.currency)}`}`}
        </small>
      </div>
      {params.notes && (
        <div>
          <small>{t`Notes: ${params.notes}`}</small>
        </div>
      )}
      {params.terms && (
        <div>
          <small>{t`Terms: ${params.terms}`}</small>
        </div>
      )}
    </StyledFinanceV2Stack>
  );

  const hasInlineRowPanel = Boolean(
    editingInvoiceId ||
    editingScheduleId ||
    editingQuoteId ||
    payingInvoice ||
    sendingEmail ||
    voidingDoc ||
    convertingQuote,
  );

  const renderInlineFormError = () =>
    formError ? (
      <StyledFinanceV2Notice data-tone="danger" role="alert">
        {formError}
      </StyledFinanceV2Notice>
    ) : null;

  const renderSendEmailInlineForm = (target: {
    kind: 'QUOTE' | 'INVOICE';
    id: string;
    number: string;
    clientName: string;
  }) => (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setFormError('');
        if (!sendToEmail.trim()) {
          setFormError(t`Enter a recipient email address.`);
          return;
        }
        const res = await onRunCommand(
          target.kind === 'INVOICE'
            ? {
                action: 'sendInvoiceEmail',
                invoiceId: target.id,
                toEmail: sendToEmail.trim(),
                message: sendMessage,
              }
            : {
                action: 'sendQuoteEmail',
                quoteId: target.id,
                toEmail: sendToEmail.trim(),
                message: sendMessage,
              },
        );
        if (res) {
          closeAllPanels();
        }
      }}
    >
      <StyledFinanceV2Stack>
        <h4>
          {target.kind === 'INVOICE'
            ? t`Send Invoice ${target.number} via Email`
            : t`Send Quote ${target.number} via Email`}
        </h4>
        {renderInlineFormError()}
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
        <StyledFinanceV2ActionGroup>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={busy}
          >
            <Trans>Confirm &amp; Send Email</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton type="button" onClick={closeAllPanels}>
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledFinanceV2ActionGroup>
      </StyledFinanceV2Stack>
    </form>
  );

  const renderVoidInlineForm = (target: {
    kind: 'QUOTE' | 'INVOICE' | 'PAYMENT' | 'PAYMENT_REVERSE';
    id: string;
    label: string;
  }) => {
    const isPaymentReversal = target.kind === 'PAYMENT_REVERSE';
    return (
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setFormError('');
          if (!voidReason.trim()) {
            setFormError(
              isPaymentReversal
                ? t`Enter a short reason before reversing.`
                : t`Enter a short reason before voiding.`,
            );
            return;
          }
          const payload =
            target.kind === 'QUOTE'
              ? {
                  action: 'voidQuote',
                  quoteId: target.id,
                  reason: voidReason.trim(),
                }
              : target.kind === 'INVOICE'
                ? {
                    action: 'voidInvoice',
                    invoiceId: target.id,
                    reason: voidReason.trim(),
                  }
                : target.kind === 'PAYMENT_REVERSE'
                  ? {
                      action: 'reverseJournal',
                      journalId: target.id,
                      reversalDate: reverseDate,
                      reason: voidReason.trim(),
                    }
                  : {
                      action: 'voidJournal',
                      journalId: target.id,
                      reason: voidReason.trim(),
                    };
          const res = await onRunCommand(payload);
          if (res) {
            closeAllPanels();
          }
        }}
      >
        <StyledFinanceV2Stack>
          <h4>
            {isPaymentReversal
              ? t`Reverse ${target.label}`
              : t`Void ${target.label}`}
          </h4>
          {isPaymentReversal && (
            <small>
              <Trans>
                This payment sits inside a locked accounting period. Posting a
                reversal preserves history and reopens the invoice balance.
              </Trans>
            </small>
          )}
          {renderInlineFormError()}
          {isPaymentReversal && (
            <label>
              <Trans>Reversal Date</Trans>
              <input
                type="date"
                value={reverseDate}
                onChange={(e) => setReverseDate(e.target.value)}
              />
            </label>
          )}
          <label>
            <Trans>Reason</Trans>
            <input
              value={voidReason}
              placeholder={
                isPaymentReversal
                  ? t`e.g. Payment bounced or posted to wrong invoice`
                  : t`e.g. Rejected by client or billing error`
              }
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </label>
          <StyledFinanceV2ActionGroup>
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={busy}
            >
              {isPaymentReversal ? (
                <Trans>Post Reversal</Trans>
              ) : (
                <Trans>Confirm Void</Trans>
              )}
            </StyledDeliveryButton>
            <StyledDeliveryButton type="button" onClick={closeAllPanels}>
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
          </StyledFinanceV2ActionGroup>
        </StyledFinanceV2Stack>
      </form>
    );
  };

  const handleSaveInvoice = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!clientName.trim()) {
      setFormError(t`Enter a client name.`);
      return;
    }
    if (dueDate < issueDate) {
      setFormError(t`Due date cannot be earlier than issue date.`);
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
      closeAllPanels();
    }
  };

  const renderInvoiceFormBody = () => (
    <form onSubmit={(event) => void handleSaveInvoice(event)}>
      <StyledFinanceV2Stack>
        <h3>
          {editingInvoiceId ? t`Edit Invoice` : t`Create One-Off Invoice`}
        </h3>
        {editingInvoiceId && renderInlineFormError()}
        <small>
          <Trans>
            Creates and saves the branded PDF in the OS immediately. It is never
            emailed until you click Send Email. Revenue is counted only when you
            record payment.
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
          {renderProjectSelect()}
          <label>
            <Trans>Currency</Trans>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as FinanceV2Currency)}
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
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <StyledFinanceV2ActionGroup>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={busy}
          >
            {editingInvoiceId
              ? t`Update Invoice & Refresh PDF`
              : t`Create Invoice & Save PDF`}
          </StyledDeliveryButton>
          <StyledDeliveryButton type="button" onClick={closeAllPanels}>
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledFinanceV2ActionGroup>
      </StyledFinanceV2Stack>
    </form>
  );

  const handleSaveSchedule = async (event: FormEvent) => {
    event.preventDefault();
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
    if (!Number.isInteger(parsedDue) || parsedDue < 1 || parsedDue > 31) {
      setFormError(t`Due day must be between 1 and 31.`);
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth.trim())) {
      setFormError(t`Enter a valid start month (YYYY-MM).`);
      return;
    }
    const trimmedEnd = endMonth.trim();
    if (trimmedEnd && !/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmedEnd)) {
      setFormError(t`Enter a valid end month (YYYY-MM).`);
      return;
    }
    if (trimmedEnd && trimmedEnd < startMonth.trim()) {
      setFormError(t`End month cannot be earlier than start month.`);
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
      closeAllPanels();
    }
  };

  const renderScheduleFormBody = () => (
    <form onSubmit={(event) => void handleSaveSchedule(event)}>
      <StyledFinanceV2Stack>
        <h3>
          {editingScheduleId
            ? t`Edit Recurring Monthly Invoice`
            : t`New Recurring Monthly Invoice`}
        </h3>
        {editingScheduleId && renderInlineFormError()}
        <small>
          <Trans>
            Every month on the billing day, a branded PDF invoice is created and
            kept ready in the Invoices tab. It will only email the client when
            you click Send Email.
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
          {renderProjectSelect()}
          <label>
            <Trans>Currency</Trans>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as FinanceV2Currency)}
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
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <StyledFinanceV2ActionGroup>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={busy}
          >
            {editingScheduleId
              ? t`Update Recurring Invoice`
              : t`Save Recurring Invoice`}
          </StyledDeliveryButton>
          <StyledDeliveryButton type="button" onClick={closeAllPanels}>
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledFinanceV2ActionGroup>
      </StyledFinanceV2Stack>
    </form>
  );

  const handleSaveQuote = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!clientName.trim()) {
      setFormError(t`Enter a client name.`);
      return;
    }
    if (dueDate && dueDate < issueDate) {
      setFormError(t`"Valid until" date cannot be earlier than quote date.`);
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
      closeAllPanels();
    }
  };

  const renderQuoteFormBody = () => (
    <form onSubmit={(event) => void handleSaveQuote(event)}>
      <StyledFinanceV2Stack>
        <h3>
          {editingQuoteId ? t`Edit Client Quote` : t`Create Client Quote`}
        </h3>
        {editingQuoteId && renderInlineFormError()}
        <small>
          <Trans>
            Download as a branded PDF to send to your client. Quotes do not
            affect Revenue or your Balance Sheet. Convert approved quotes to an
            Invoice in 1 click, or void rejected quotes.
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
          {renderProjectSelect()}
          <label>
            <Trans>Currency</Trans>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as FinanceV2Currency)}
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
        <StyledFinanceV2ActionGroup>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={busy}
          >
            {editingQuoteId ? t`Update Quote` : t`Save Quote`}
          </StyledDeliveryButton>
          <StyledDeliveryButton type="button" onClick={closeAllPanels}>
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledFinanceV2ActionGroup>
      </StyledFinanceV2Stack>
    </form>
  );

  // Filtered invoices & quotes
  const invoiceQueryLower = invoiceSearch.trim().toLowerCase();
  const filteredInvoices = data.invoices.filter((invoice) => {
    if (invoiceStatusFilter === 'OVERDUE') {
      if (invoice.overdueDays <= 0) return false;
    } else if (
      invoiceStatusFilter !== 'ALL' &&
      invoice.status !== invoiceStatusFilter
    ) {
      return false;
    }
    if (
      invoiceCurrencyFilter !== 'ALL' &&
      invoice.currency !== invoiceCurrencyFilter
    ) {
      return false;
    }
    if (invoiceProjectFilter && invoice.projectId !== invoiceProjectFilter) {
      return false;
    }
    if (invoiceQueryLower) {
      const projName = invoice.projectId
        ? (projectNameById.get(invoice.projectId) ?? '')
        : '';
      const haystack = [
        invoice.invoiceNumber,
        invoice.clientName,
        invoice.clientEmail,
        projName,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(invoiceQueryLower)) return false;
    }
    return true;
  });

  const quoteQueryLower = quoteSearch.trim().toLowerCase();
  const filteredQuotes = data.quotes.filter((quote) => {
    if (quoteStatusFilter !== 'ALL' && quote.status !== quoteStatusFilter) {
      return false;
    }
    if (
      quoteCurrencyFilter !== 'ALL' &&
      quote.currency !== quoteCurrencyFilter
    ) {
      return false;
    }
    if (quoteProjectFilter && quote.projectId !== quoteProjectFilter) {
      return false;
    }
    if (quoteQueryLower) {
      const projName = quote.projectId
        ? (projectNameById.get(quote.projectId) ?? '')
        : '';
      const haystack = [
        quote.quoteNumber,
        quote.clientName,
        quote.clientEmail,
        projName,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(quoteQueryLower)) return false;
    }
    return true;
  });

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
          <StyledFinanceV2ActionGroup>
            {section === 'invoices' && (
              <StyledDeliveryButton
                type="button"
                data-primary="true"
                onClick={() => {
                  const wasCreating = showInvoiceForm && !editingInvoiceId;
                  closeAllPanels();
                  if (!wasCreating) {
                    resetFormFields(data.profile.defaultInvoiceNotes);
                    setShowInvoiceForm(true);
                  }
                }}
              >
                <Trans>+ New Invoice</Trans>
              </StyledDeliveryButton>
            )}
            {section === 'recurring' && (
              <StyledDeliveryButton
                type="button"
                data-primary="true"
                onClick={() => {
                  const wasCreating = showScheduleForm && !editingScheduleId;
                  closeAllPanels();
                  if (!wasCreating) {
                    resetFormFields(data.profile.defaultInvoiceNotes);
                    setShowScheduleForm(true);
                  }
                }}
              >
                <Trans>+ New Recurring Invoice</Trans>
              </StyledDeliveryButton>
            )}
            {section === 'quotes' && (
              <StyledDeliveryButton
                type="button"
                data-primary="true"
                onClick={() => {
                  const wasCreating = showQuoteForm && !editingQuoteId;
                  closeAllPanels();
                  if (!wasCreating) {
                    resetFormFields('');
                    setShowQuoteForm(true);
                  }
                }}
              >
                <Trans>+ New Quote</Trans>
              </StyledDeliveryButton>
            )}
          </StyledFinanceV2ActionGroup>
        )}
      </StyledFinanceV2HeaderRow>

      {formError && !hasInlineRowPanel && (
        <StyledFinanceV2Notice data-tone="danger" role="alert">
          {formError}
        </StyledFinanceV2Notice>
      )}
      {infoNotice && (
        <StyledFinanceV2Notice data-tone="info" role="status">
          {infoNotice}
        </StyledFinanceV2Notice>
      )}

      {section === 'invoices' && (
        <StyledFinanceV2Stack>
          {showInvoiceForm && !editingInvoiceId && (
            <StyledFinanceV2Panel>
              {renderInvoiceFormBody()}
            </StyledFinanceV2Panel>
          )}

          <StyledFinanceV2Panel>
            <h3>
              <Trans>Client Invoices</Trans>
            </h3>
            {data.invoices.length > 0 && (
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Search</Trans>
                  <input
                    type="search"
                    placeholder={t`Invoice #, client name, email…`}
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Status</Trans>
                  <select
                    value={invoiceStatusFilter}
                    onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                  >
                    <option value="ALL">{t`All statuses`}</option>
                    <option value="READY">{t`Ready (Draft)`}</option>
                    <option value="SENT">{t`Sent`}</option>
                    <option value="PARTIALLY_PAID">{t`Partially Paid`}</option>
                    <option value="OVERDUE">{t`Overdue`}</option>
                    <option value="PAID">{t`Paid`}</option>
                    <option value="VOID">{t`Void`}</option>
                  </select>
                </label>
                <label>
                  <Trans>Currency</Trans>
                  <select
                    value={invoiceCurrencyFilter}
                    onChange={(e) =>
                      setInvoiceCurrencyFilter(
                        e.target.value as FinanceV2Currency | 'ALL',
                      )
                    }
                  >
                    <option value="ALL">{t`All currencies`}</option>
                    {FINANCE_V2_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                {data.projects.length > 0 && (
                  <label>
                    <Trans>Project</Trans>
                    <select
                      value={invoiceProjectFilter}
                      onChange={(e) => setInvoiceProjectFilter(e.target.value)}
                    >
                      <option value="">{t`All projects`}</option>
                      {data.projects.map((proj) => (
                        <option key={proj.id} value={proj.id}>
                          {proj.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </StyledFinanceV2FormGrid>
            )}

            {data.invoices.length === 0 ? (
              <p>
                <Trans>
                  No invoices yet. Create a one-off invoice, set up a recurring
                  retainer schedule, or convert an approved quote.
                </Trans>
              </p>
            ) : filteredInvoices.length === 0 ? (
              <p>
                <Trans>No invoices match the current search or filters.</Trans>
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
                    {filteredInvoices.map((invoice) => {
                      const postedPayments = (invoice.payments ?? []).filter(
                        (p) => p.status === 'POSTED',
                      );
                      const projName = invoice.projectId
                        ? projectNameById.get(invoice.projectId)
                        : null;
                      const isEditingThis =
                        showInvoiceForm && editingInvoiceId === invoice.id;
                      const isPayingThis = payingInvoice?.id === invoice.id;
                      const isSendingThis =
                        sendingEmail?.kind === 'INVOICE' &&
                        sendingEmail.id === invoice.id;
                      const isVoidingThis =
                        voidingDoc !== null && voidingDoc.rowId === invoice.id;
                      const isViewingThis =
                        viewingDetails?.kind === 'INVOICE' &&
                        viewingDetails.id === invoice.id;

                      return (
                        <Fragment key={invoice.id}>
                          <tr>
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
                              {projName && (
                                <div>
                                  <small>{t`Project: ${projName}`}</small>
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
                              {invoice.status === 'VOID' &&
                                invoice.voidReason && (
                                  <div>
                                    <small>{invoice.voidReason}</small>
                                  </div>
                                )}
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
                              {postedPayments.map((payment) => {
                                const lockedThroughDate =
                                  data.profile.lockedThroughDate ?? null;
                                const isPaymentLocked = Boolean(
                                  lockedThroughDate &&
                                  payment.paymentDate <= lockedThroughDate,
                                );
                                return (
                                  <div key={payment.journalId}>
                                    <small>
                                      {t`Paid ${formatFinanceAmountMicros(payment.amountMicros, payment.currency)} (${payment.paymentDate})`}{' '}
                                      {payment.reversed ? (
                                        <StyledFinanceV2Pill data-tone="neutral">
                                          <Trans>Reversed</Trans>
                                        </StyledFinanceV2Pill>
                                      ) : (
                                        data.canManage &&
                                        (isPaymentLocked ? (
                                          <StyledDeliveryButton
                                            type="button"
                                            disabled={busy}
                                            onClick={() => {
                                              closeAllPanels();
                                              setVoidingDoc({
                                                kind: 'PAYMENT_REVERSE',
                                                id: payment.journalId,
                                                rowId: invoice.id,
                                                label: t`${invoice.invoiceNumber} payment (${payment.paymentDate})`,
                                              });
                                              setReverseDate(
                                                computeDefaultReversalDate(
                                                  data.today,
                                                  payment.paymentDate,
                                                  lockedThroughDate,
                                                ),
                                              );
                                              setVoidReason('');
                                            }}
                                          >
                                            {t`Reverse`}
                                          </StyledDeliveryButton>
                                        ) : (
                                          <StyledDeliveryButton
                                            type="button"
                                            disabled={busy}
                                            onClick={() => {
                                              closeAllPanels();
                                              setVoidingDoc({
                                                kind: 'PAYMENT',
                                                id: payment.journalId,
                                                rowId: invoice.id,
                                                label: t`${invoice.invoiceNumber} payment (${payment.paymentDate})`,
                                              });
                                              setVoidReason('');
                                            }}
                                          >
                                            {t`Void`}
                                          </StyledDeliveryButton>
                                        ))
                                      )}
                                    </small>
                                  </div>
                                );
                              })}
                            </td>
                            <td>
                              <StyledFinanceV2ActionGroup>
                                <StyledDeliveryButton
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    if (isViewingThis) {
                                      closeAllPanels();
                                    } else {
                                      closeAllPanels();
                                      setViewingDetails({
                                        kind: 'INVOICE',
                                        id: invoice.id,
                                      });
                                    }
                                  }}
                                >
                                  {isViewingThis ? (
                                    <Trans>Hide</Trans>
                                  ) : (
                                    <Trans>Details</Trans>
                                  )}
                                </StyledDeliveryButton>
                                <StyledDeliveryButton
                                  type="button"
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
                                {data.canManage &&
                                  invoice.status !== 'VOID' && (
                                    <>
                                      <StyledDeliveryButton
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                          if (isSendingThis) {
                                            closeAllPanels();
                                            return;
                                          }
                                          closeAllPanels();
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
                                          type="button"
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
                                          type="button"
                                          disabled={busy}
                                          onClick={() =>
                                            openEditInvoice(invoice)
                                          }
                                        >
                                          {isEditingThis ? (
                                            <Trans>Close</Trans>
                                          ) : (
                                            <Trans>Edit</Trans>
                                          )}
                                        </StyledDeliveryButton>
                                      )}
                                      {invoice.status !== 'PAID' && (
                                        <StyledDeliveryButton
                                          type="button"
                                          data-primary="true"
                                          disabled={busy}
                                          onClick={() => {
                                            if (isPayingThis) {
                                              closeAllPanels();
                                              return;
                                            }
                                            closeAllPanels();
                                            setPayingInvoice(invoice);
                                            setPaymentRequestId(
                                              createFinanceV2RequestId(),
                                            );
                                            setPaymentAmount(
                                              financeAmountMicrosToDecimal(
                                                invoice.outstandingMicros,
                                              ),
                                            );
                                            setPaymentDate(data.today);
                                            setPaymentFxRate(
                                              invoice.currency === 'AED'
                                                ? ''
                                                : (data.profile.exchangeRates[
                                                    invoice.currency
                                                  ] ?? ''),
                                            );
                                          }}
                                        >
                                          <Trans>Mark Paid</Trans>
                                        </StyledDeliveryButton>
                                      )}
                                      {invoice.paidMicros === '0' && (
                                        <StyledDeliveryButton
                                          type="button"
                                          disabled={busy}
                                          onClick={() => {
                                            if (
                                              isVoidingThis &&
                                              voidingDoc.kind === 'INVOICE'
                                            ) {
                                              closeAllPanels();
                                              return;
                                            }
                                            closeAllPanels();
                                            setVoidingDoc({
                                              kind: 'INVOICE',
                                              id: invoice.id,
                                              rowId: invoice.id,
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
                              </StyledFinanceV2ActionGroup>
                            </td>
                          </tr>

                          {isEditingThis && (
                            <tr>
                              <td colSpan={7}>
                                <StyledFinanceV2InlineEditor>
                                  {renderInvoiceFormBody()}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}

                          {isPayingThis && (
                            <tr>
                              <td colSpan={7}>
                                <StyledFinanceV2InlineEditor>
                                  <form
                                    onSubmit={async (event) => {
                                      event.preventDefault();
                                      setFormError('');
                                      const micros = parseMoney(paymentAmount);
                                      if (
                                        !micros ||
                                        BigInt(micros) <= 0n ||
                                        !isFinanceV2AmountMicrosWithinLimit(
                                          micros,
                                        )
                                      ) {
                                        setFormError(
                                          t`Enter a valid positive payment amount.`,
                                        );
                                        return;
                                      }
                                      if (
                                        BigInt(micros) >
                                        BigInt(invoice.outstandingMicros)
                                      ) {
                                        setFormError(
                                          t`Payment amount cannot exceed the remaining balance due (${formatFinanceAmountMicros(invoice.outstandingMicros, invoice.currency)}).`,
                                        );
                                        return;
                                      }
                                      const trimmedFx =
                                        invoice.currency !== 'AED'
                                          ? paymentFxRate.trim()
                                          : '';
                                      if (
                                        trimmedFx &&
                                        !isValidPositiveFxRate(trimmedFx)
                                      ) {
                                        setFormError(
                                          t`Enter a valid positive AED exchange rate.`,
                                        );
                                        return;
                                      }
                                      const res = await onRunCommand({
                                        action: 'recordInvoicePayment',
                                        invoiceId: invoice.id,
                                        paymentDate,
                                        amountMicros: micros,
                                        ...(trimmedFx
                                          ? { fxRateToAed: trimmedFx }
                                          : {}),
                                        clientRequestId: paymentRequestId,
                                      });
                                      if (res) {
                                        closeAllPanels();
                                      }
                                    }}
                                  >
                                    <StyledFinanceV2Stack>
                                      <h4>
                                        {t`Record Payment for ${invoice.invoiceNumber} (${invoice.clientName})`}
                                      </h4>
                                      {renderInlineFormError()}
                                      <small>
                                        <Trans>
                                          Recording payment moves this amount
                                          into Company Cash and recognizes
                                          Revenue on your AED Profit &amp; Loss.
                                        </Trans>
                                      </small>
                                      <StyledFinanceV2FormGrid>
                                        <label>
                                          {t`Amount received (${invoice.currency})`}
                                          <input
                                            value={paymentAmount}
                                            onChange={(e) =>
                                              setPaymentAmount(e.target.value)
                                            }
                                          />
                                        </label>
                                        <label>
                                          <Trans>Payment date</Trans>
                                          <input
                                            type="date"
                                            value={paymentDate}
                                            onChange={(e) =>
                                              setPaymentDate(e.target.value)
                                            }
                                          />
                                        </label>
                                        {invoice.currency !== 'AED' && (
                                          <label>
                                            {t`Exchange rate (${invoice.currency} → AED)`}
                                            <input
                                              value={paymentFxRate}
                                              placeholder={
                                                data.profile.exchangeRates[
                                                  invoice.currency
                                                ] ?? '1'
                                              }
                                              onChange={(e) =>
                                                setPaymentFxRate(e.target.value)
                                              }
                                            />
                                          </label>
                                        )}
                                      </StyledFinanceV2FormGrid>
                                      <StyledFinanceV2ActionGroup>
                                        <StyledDeliveryButton
                                          type="submit"
                                          data-primary="true"
                                          disabled={busy}
                                        >
                                          <Trans>
                                            Confirm Payment Received
                                          </Trans>
                                        </StyledDeliveryButton>
                                        <StyledDeliveryButton
                                          type="button"
                                          onClick={closeAllPanels}
                                        >
                                          <Trans>Cancel</Trans>
                                        </StyledDeliveryButton>
                                      </StyledFinanceV2ActionGroup>
                                    </StyledFinanceV2Stack>
                                  </form>
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}

                          {isSendingThis && sendingEmail && (
                            <tr>
                              <td colSpan={7}>
                                <StyledFinanceV2InlineEditor>
                                  {renderSendEmailInlineForm(sendingEmail)}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}

                          {isVoidingThis && voidingDoc && (
                            <tr>
                              <td colSpan={7}>
                                <StyledFinanceV2InlineEditor>
                                  {renderVoidInlineForm(voidingDoc)}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}

                          {isViewingThis && (
                            <tr>
                              <td colSpan={7}>
                                <StyledFinanceV2InlineEditor>
                                  {renderDocumentDetailsPreview({
                                    title: t`Invoice ${invoice.invoiceNumber} Details`,
                                    currency: invoice.currency,
                                    lineItems: invoice.lineItems,
                                    subtotalMicros: invoice.subtotalMicros,
                                    discountTotalMicros:
                                      invoice.discountTotalMicros,
                                    totalMicros: invoice.totalMicros,
                                    notes: invoice.notes,
                                    projectId: invoice.projectId,
                                    voidReason: invoice.voidReason,
                                  })}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}
                        </Fragment>
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
          {showScheduleForm && !editingScheduleId && (
            <StyledFinanceV2Panel>
              {renderScheduleFormBody()}
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
                    {data.invoiceSchedules.map((schedule) => {
                      const projName = schedule.projectId
                        ? projectNameById.get(schedule.projectId)
                        : null;
                      const isEditingThis =
                        showScheduleForm && editingScheduleId === schedule.id;
                      const isConfirmingStop =
                        confirmingStopScheduleId === schedule.id;
                      return (
                        <Fragment key={schedule.id}>
                          <tr>
                            <td>
                              <strong>{schedule.clientName}</strong>
                              {schedule.clientEmail && (
                                <div>
                                  <small>{schedule.clientEmail}</small>
                                </div>
                              )}
                              {projName && (
                                <div>
                                  <small>{t`Project: ${projName}`}</small>
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
                                <StyledFinanceV2ActionGroup>
                                  <StyledDeliveryButton
                                    type="button"
                                    disabled={busy}
                                    onClick={() => openEditSchedule(schedule)}
                                  >
                                    {isEditingThis ? (
                                      <Trans>Close</Trans>
                                    ) : (
                                      <Trans>Edit</Trans>
                                    )}
                                  </StyledDeliveryButton>
                                  {schedule.status === 'ACTIVE' ? (
                                    <StyledDeliveryButton
                                      type="button"
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
                                      type="button"
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
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        if (isConfirmingStop) {
                                          closeAllPanels();
                                          return;
                                        }
                                        closeAllPanels();
                                        setConfirmingStopScheduleId(
                                          schedule.id,
                                        );
                                      }}
                                    >
                                      <Trans>Stop</Trans>
                                    </StyledDeliveryButton>
                                  )}
                                </StyledFinanceV2ActionGroup>
                              )}
                            </td>
                          </tr>
                          {isEditingThis && (
                            <tr>
                              <td colSpan={5}>
                                <StyledFinanceV2InlineEditor>
                                  {renderScheduleFormBody()}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}
                          {isConfirmingStop && (
                            <tr>
                              <td colSpan={5}>
                                <StyledFinanceV2InlineEditor>
                                  <p>
                                    {t`Stop recurring invoices for ${schedule.clientName}? Future monthly invoices will no longer be generated; existing invoices remain unchanged.`}
                                  </p>
                                  <StyledFinanceV2ActionGroup>
                                    <StyledDeliveryButton
                                      type="button"
                                      data-primary="true"
                                      disabled={busy}
                                      onClick={async () => {
                                        const res = await onRunCommand({
                                          action: 'setInvoiceScheduleStatus',
                                          id: schedule.id,
                                          status: 'STOPPED',
                                        });
                                        if (res) closeAllPanels();
                                      }}
                                    >
                                      <Trans>Confirm Stop</Trans>
                                    </StyledDeliveryButton>
                                    <StyledDeliveryButton
                                      type="button"
                                      onClick={closeAllPanels}
                                    >
                                      <Trans>Cancel</Trans>
                                    </StyledDeliveryButton>
                                  </StyledFinanceV2ActionGroup>
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </StyledFinanceV2Table>
              </StyledFinanceV2TableWrap>
            )}
          </StyledFinanceV2Panel>
        </StyledFinanceV2Stack>
      )}

      {section === 'quotes' && (
        <StyledFinanceV2Stack>
          {showQuoteForm && !editingQuoteId && (
            <StyledFinanceV2Panel>{renderQuoteFormBody()}</StyledFinanceV2Panel>
          )}

          <StyledFinanceV2Panel>
            <h3>
              <Trans>Quotes</Trans>
            </h3>
            {data.quotes.length > 0 && (
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Search</Trans>
                  <input
                    type="search"
                    placeholder={t`Quote #, client name, email…`}
                    value={quoteSearch}
                    onChange={(e) => setQuoteSearch(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Status</Trans>
                  <select
                    value={quoteStatusFilter}
                    onChange={(e) => setQuoteStatusFilter(e.target.value)}
                  >
                    <option value="ALL">{t`All statuses`}</option>
                    <option value="DRAFT">{t`Draft`}</option>
                    <option value="SENT">{t`Sent`}</option>
                    <option value="CONVERTED">{t`Converted`}</option>
                    <option value="VOID">{t`Void`}</option>
                  </select>
                </label>
                <label>
                  <Trans>Currency</Trans>
                  <select
                    value={quoteCurrencyFilter}
                    onChange={(e) =>
                      setQuoteCurrencyFilter(
                        e.target.value as FinanceV2Currency | 'ALL',
                      )
                    }
                  >
                    <option value="ALL">{t`All currencies`}</option>
                    {FINANCE_V2_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                {data.projects.length > 0 && (
                  <label>
                    <Trans>Project</Trans>
                    <select
                      value={quoteProjectFilter}
                      onChange={(e) => setQuoteProjectFilter(e.target.value)}
                    >
                      <option value="">{t`All projects`}</option>
                      {data.projects.map((proj) => (
                        <option key={proj.id} value={proj.id}>
                          {proj.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </StyledFinanceV2FormGrid>
            )}

            {data.quotes.length === 0 ? (
              <p>
                <Trans>
                  No quotes yet. Create a quote to download a branded PDF for a
                  client and convert it straight to an invoice once approved.
                </Trans>
              </p>
            ) : filteredQuotes.length === 0 ? (
              <p>
                <Trans>No quotes match the current search or filters.</Trans>
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
                    {filteredQuotes.map((quote) => {
                      const projName = quote.projectId
                        ? projectNameById.get(quote.projectId)
                        : null;
                      const isEditingThis =
                        showQuoteForm && editingQuoteId === quote.id;
                      const isSendingThis =
                        sendingEmail?.kind === 'QUOTE' &&
                        sendingEmail.id === quote.id;
                      const isConvertingThis = convertingQuote?.id === quote.id;
                      const isVoidingThis =
                        voidingDoc !== null && voidingDoc.rowId === quote.id;
                      const isViewingThis =
                        viewingDetails?.kind === 'QUOTE' &&
                        viewingDetails.id === quote.id;

                      return (
                        <Fragment key={quote.id}>
                          <tr>
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
                              {projName && (
                                <div>
                                  <small>{t`Project: ${projName}`}</small>
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
                              {quote.status === 'VOID' && quote.voidReason && (
                                <div>
                                  <small>{quote.voidReason}</small>
                                </div>
                              )}
                            </td>
                            <td data-numeric="true">
                              {formatFinanceAmountMicros(
                                quote.totalMicros,
                                quote.currency,
                              )}
                            </td>
                            <td>
                              <StyledFinanceV2ActionGroup>
                                <StyledDeliveryButton
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    if (isViewingThis) {
                                      closeAllPanels();
                                    } else {
                                      closeAllPanels();
                                      setViewingDetails({
                                        kind: 'QUOTE',
                                        id: quote.id,
                                      });
                                    }
                                  }}
                                >
                                  {isViewingThis ? (
                                    <Trans>Hide</Trans>
                                  ) : (
                                    <Trans>Details</Trans>
                                  )}
                                </StyledDeliveryButton>
                                <StyledDeliveryButton
                                  type="button"
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
                                        type="button"
                                        disabled={busy}
                                        onClick={() => openEditQuote(quote)}
                                      >
                                        {isEditingThis ? (
                                          <Trans>Close</Trans>
                                        ) : (
                                          <Trans>Edit</Trans>
                                        )}
                                      </StyledDeliveryButton>
                                      <StyledDeliveryButton
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                          if (isSendingThis) {
                                            closeAllPanels();
                                            return;
                                          }
                                          closeAllPanels();
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
                                          type="button"
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
                                        type="button"
                                        data-primary="true"
                                        disabled={busy}
                                        onClick={() => {
                                          if (isConvertingThis) {
                                            closeAllPanels();
                                            return;
                                          }
                                          closeAllPanels();
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
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                          if (isVoidingThis) {
                                            closeAllPanels();
                                            return;
                                          }
                                          closeAllPanels();
                                          setVoidingDoc({
                                            kind: 'QUOTE',
                                            id: quote.id,
                                            rowId: quote.id,
                                            label: t`Quote ${quote.quoteNumber}`,
                                          });
                                          setVoidReason('');
                                        }}
                                      >
                                        <Trans>Void / Reject</Trans>
                                      </StyledDeliveryButton>
                                    </>
                                  )}
                              </StyledFinanceV2ActionGroup>
                            </td>
                          </tr>

                          {isEditingThis && (
                            <tr>
                              <td colSpan={5}>
                                <StyledFinanceV2InlineEditor>
                                  {renderQuoteFormBody()}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}

                          {isSendingThis && sendingEmail && (
                            <tr>
                              <td colSpan={5}>
                                <StyledFinanceV2InlineEditor>
                                  {renderSendEmailInlineForm(sendingEmail)}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}

                          {isConvertingThis && (
                            <tr>
                              <td colSpan={5}>
                                <StyledFinanceV2InlineEditor>
                                  <form
                                    onSubmit={async (event) => {
                                      event.preventDefault();
                                      setFormError('');
                                      if (convertMode === 'ONE_OFF') {
                                        if (
                                          !convertDueDate ||
                                          convertDueDate < data.today
                                        ) {
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
                                        const parsedDue = Number.parseInt(
                                          convertDueDay,
                                          10,
                                        );
                                        if (
                                          !Number.isInteger(parsedBilling) ||
                                          parsedBilling < 1 ||
                                          parsedBilling > 31
                                        ) {
                                          setFormError(
                                            t`Billing day must be between 1 and 31.`,
                                          );
                                          return;
                                        }
                                        if (
                                          !Number.isInteger(parsedDue) ||
                                          parsedDue < 1 ||
                                          parsedDue > 31
                                        ) {
                                          setFormError(
                                            t`Due day must be between 1 and 31.`,
                                          );
                                          return;
                                        }
                                        if (
                                          !/^\d{4}-(0[1-9]|1[0-2])$/.test(
                                            convertStartMonth.trim(),
                                          )
                                        ) {
                                          setFormError(
                                            t`Enter a valid start month (YYYY-MM).`,
                                          );
                                          return;
                                        }
                                      }
                                      const res = await onRunCommand({
                                        action: 'convertQuoteToInvoice',
                                        quoteId: quote.id,
                                        mode: convertMode,
                                        ...(convertMode === 'ONE_OFF'
                                          ? {
                                              issueDate: data.today,
                                              dueDate: convertDueDate,
                                            }
                                          : {
                                              billingDayOfMonth:
                                                Number.parseInt(
                                                  convertBillingDay,
                                                  10,
                                                ),
                                              dueDayOfMonth: Number.parseInt(
                                                convertDueDay,
                                                10,
                                              ),
                                              startMonth:
                                                convertStartMonth.trim(),
                                            }),
                                      });
                                      if (res) {
                                        switchSection(
                                          convertMode === 'ONE_OFF'
                                            ? 'invoices'
                                            : 'recurring',
                                        );
                                      }
                                    }}
                                  >
                                    <StyledFinanceV2Stack>
                                      <h4>
                                        {t`Convert ${quote.quoteNumber} (${quote.clientName}) to Invoice`}
                                      </h4>
                                      {renderInlineFormError()}
                                      <StyledFinanceV2FormGrid>
                                        <label>
                                          <Trans>Invoice type</Trans>
                                          <select
                                            value={convertMode}
                                            onChange={(e) =>
                                              setConvertMode(
                                                e.target.value as
                                                  | 'ONE_OFF'
                                                  | 'RECURRING',
                                              )
                                            }
                                          >
                                            <option value="ONE_OFF">
                                              {t`One-Off Invoice`}
                                            </option>
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
                                              onChange={(e) =>
                                                setConvertDueDate(
                                                  e.target.value,
                                                )
                                              }
                                            />
                                          </label>
                                        ) : (
                                          <>
                                            <label>
                                              <Trans>
                                                Start month (YYYY-MM)
                                              </Trans>
                                              <input
                                                value={convertStartMonth}
                                                onChange={(e) =>
                                                  setConvertStartMonth(
                                                    e.target.value,
                                                  )
                                                }
                                              />
                                            </label>
                                            <label>
                                              <Trans>Billing day (1–31)</Trans>
                                              <input
                                                type="number"
                                                min={1}
                                                max={31}
                                                value={convertBillingDay}
                                                onChange={(e) =>
                                                  setConvertBillingDay(
                                                    e.target.value,
                                                  )
                                                }
                                              />
                                            </label>
                                            <label>
                                              <Trans>Due day (1–31)</Trans>
                                              <input
                                                type="number"
                                                min={1}
                                                max={31}
                                                value={convertDueDay}
                                                onChange={(e) =>
                                                  setConvertDueDay(
                                                    e.target.value,
                                                  )
                                                }
                                              />
                                            </label>
                                          </>
                                        )}
                                      </StyledFinanceV2FormGrid>
                                      <StyledFinanceV2ActionGroup>
                                        <StyledDeliveryButton
                                          type="submit"
                                          data-primary="true"
                                          disabled={busy}
                                        >
                                          <Trans>Confirm Conversion</Trans>
                                        </StyledDeliveryButton>
                                        <StyledDeliveryButton
                                          type="button"
                                          onClick={closeAllPanels}
                                        >
                                          <Trans>Cancel</Trans>
                                        </StyledDeliveryButton>
                                      </StyledFinanceV2ActionGroup>
                                    </StyledFinanceV2Stack>
                                  </form>
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}

                          {isVoidingThis && voidingDoc && (
                            <tr>
                              <td colSpan={5}>
                                <StyledFinanceV2InlineEditor>
                                  {renderVoidInlineForm(voidingDoc)}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}

                          {isViewingThis && (
                            <tr>
                              <td colSpan={5}>
                                <StyledFinanceV2InlineEditor>
                                  {renderDocumentDetailsPreview({
                                    title: t`Quote ${quote.quoteNumber} Details`,
                                    currency: quote.currency,
                                    lineItems: quote.lineItems,
                                    subtotalMicros: quote.subtotalMicros,
                                    discountTotalMicros:
                                      quote.discountTotalMicros,
                                    totalMicros: quote.totalMicros,
                                    notes: quote.notes,
                                    terms: quote.terms,
                                    projectId: quote.projectId,
                                    voidReason: quote.voidReason,
                                  })}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
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
