import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
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
  type FinanceV2Journal,
  type FinanceV2RecurringExpense,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';

type FinanceV2ExpensesTabProps = {
  data: FinanceV2Snapshot;
  busy: boolean;
  onRunCommand: FinanceV2CommandRunner;
};

const DIRECT_CATEGORIES = [
  { value: 'DIRECT_SUBSCRIPTION', label: 'Subscription / Software tool' },
  { value: 'DIRECT_SALARY', label: 'Delivery salary' },
  { value: 'DIRECT_CONTRACTOR', label: 'Freelancer / Contractor' },
  { value: 'DIRECT_AI', label: 'AI production tool' },
  { value: 'DIRECT_OTHER', label: 'Other direct expense' },
];

const INDIRECT_CATEGORIES = [
  { value: 'INDIRECT_MEALS', label: 'Team meals / Food' },
  { value: 'INDIRECT_COURSES', label: 'Courses / Training' },
  { value: 'INDIRECT_OFFICE', label: 'Office / Rent / Utilities' },
  { value: 'INDIRECT_ADMIN', label: 'Admin / Legal / Banking' },
  { value: 'INDIRECT_OTHER', label: 'Other indirect expense' },
];

const ASSET_CATEGORIES = [
  { value: 'ASSET_EQUIPMENT', label: 'Laptop / Camera / Equipment (Asset)' },
];

const EXPENSE_ENTRY_TYPES = new Set([
  'EXPENSE',
  'ASSET_PURCHASE',
  'RECURRING_EXPENSE',
  'PAYROLL_BASE',
  'PAYROLL_OVERTIME',
  'PAYROLL_LEAVE_REDUCTION',
  'PAYROLL_BONUS',
  'AI_COST',
]);

const parseMoney = (raw: string): string | null =>
  parseFinanceAmountMicros(raw.replaceAll(',', '').trim());

export const FinanceV2ExpensesTab = ({
  data,
  busy,
  onRunCommand,
}: FinanceV2ExpensesTabProps) => {
  const { t } = useLingui();
  const [section, setSection] = useState<'ledger' | 'recurring' | 'ai'>(
    'ledger',
  );
  const [ledgerFilter, setLedgerFilter] = useState<'expenses' | 'all'>(
    'expenses',
  );
  const [formError, setFormError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<FinanceV2Journal | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Day-to-day expense/asset form
  const [entryKind, setEntryKind] = useState<
    'DIRECT_EXPENSE' | 'INDIRECT_EXPENSE' | 'ASSET_PURCHASE'
  >('DIRECT_EXPENSE');
  const [category, setCategory] = useState('DIRECT_SUBSCRIPTION');
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<FinanceV2Currency>('USD');
  const [amount, setAmount] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [entryDate, setEntryDate] = useState(data.today);
  const [fundingAccountId, setFundingAccountId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [notes, setNotes] = useState('');

  // Recurring expense form
  const [recTitle, setRecTitle] = useState('');
  const [recType, setRecType] = useState<'DIRECT_EXPENSE' | 'INDIRECT_EXPENSE'>(
    'DIRECT_EXPENSE',
  );
  const [recCategory, setRecCategory] = useState('DIRECT_SUBSCRIPTION');
  const [recCurrency, setRecCurrency] = useState<FinanceV2Currency>('USD');
  const [recAmount, setRecAmount] = useState('');
  const [recDay, setRecDay] = useState('1');
  const [recFundingId, setRecFundingId] = useState('');
  const [recStartMonth, setRecStartMonth] = useState(data.today.slice(0, 7));
  const [recEndMonth, setRecEndMonth] = useState('');
  const [recNotes, setRecNotes] = useState('');

  // AI cost import
  const [selectedAiIds, setSelectedAiIds] = useState<string[]>([]);
  const [aiFundingId, setAiFundingId] = useState('');

  const fundingAccountsFor = (targetCurrency: FinanceV2Currency) =>
    data.accounts.filter(
      (account) =>
        account.active &&
        (account.subType === 'PERSON_LIABILITY' ||
          (account.subType === 'CASH_CURRENCY' &&
            account.currency === targetCurrency)),
    );

  const dayToDayFundingOptions = fundingAccountsFor(currency);
  const resolvedFundingId =
    dayToDayFundingOptions.find((a) => a.id === fundingAccountId)?.id ??
    dayToDayFundingOptions[0]?.id ??
    '';

  const recurringFundingOptions = fundingAccountsFor(recCurrency);
  const resolvedRecFundingId =
    recurringFundingOptions.find((a) => a.id === recFundingId)?.id ??
    recurringFundingOptions[0]?.id ??
    '';

  const aiFundingOptions = fundingAccountsFor('USD');
  const resolvedAiFundingId =
    aiFundingOptions.find((a) => a.id === aiFundingId)?.id ??
    aiFundingOptions[0]?.id ??
    '';

  const categoriesForKind =
    entryKind === 'ASSET_PURCHASE'
      ? ASSET_CATEGORIES
      : entryKind === 'DIRECT_EXPENSE'
        ? DIRECT_CATEGORIES
        : INDIRECT_CATEGORIES;

  const visibleJournals =
    ledgerFilter === 'all'
      ? data.journals
      : data.journals.filter((item) => EXPENSE_ENTRY_TYPES.has(item.entryType));

  const openEditRecurring = (rule: FinanceV2RecurringExpense) => {
    setFormError('');
    setEditingRecId(rule.id);
    setRecTitle(rule.title);
    setRecType(rule.expenseType);
    setRecCategory(rule.category);
    setRecCurrency(rule.currency);
    setRecAmount(financeAmountMicrosToDecimal(rule.amountMicros));
    setRecDay(String(rule.dayOfMonth));
    setRecFundingId(rule.fundingAccountId);
    setRecStartMonth(rule.startMonth);
    setRecEndMonth(rule.endMonth ?? '');
    setRecNotes(rule.notes);
    setShowRecurringForm(true);
  };

  const candidateAiIdSet = new Set(
    data.aiSpendCandidates.map((item) => item.id),
  );
  const activeSelectedAiIds = selectedAiIds.filter((id) =>
    candidateAiIdSet.has(id),
  );

  return (
    <StyledFinanceV2Stack>
      <StyledFinanceV2HeaderRow>
        <StyledFinanceV2SubTabs>
          <StyledFinanceV2SubTabButton
            type="button"
            data-active={section === 'ledger' ? 'true' : undefined}
            onClick={() => setSection('ledger')}
          >
            {t`Day-to-Day Ledger (${data.journals.length})`}
          </StyledFinanceV2SubTabButton>
          <StyledFinanceV2SubTabButton
            type="button"
            data-active={section === 'recurring' ? 'true' : undefined}
            onClick={() => setSection('recurring')}
          >
            {t`Recurring Bills & Salaries (${data.recurringExpenses.length})`}
          </StyledFinanceV2SubTabButton>
          <StyledFinanceV2SubTabButton
            type="button"
            data-active={section === 'ai' ? 'true' : undefined}
            onClick={() => setSection('ai')}
          >
            {t`AI Costs (${data.aiSpendCandidates.length})`}
          </StyledFinanceV2SubTabButton>
        </StyledFinanceV2SubTabs>

        {data.canManage && section === 'ledger' && (
          <StyledDeliveryButton
            data-primary="true"
            onClick={() => {
              setFormError('');
              setShowAddForm((prev) => !prev);
            }}
          >
            <Trans>+ Record Expense or Asset</Trans>
          </StyledDeliveryButton>
        )}
        {data.canManage && section === 'recurring' && (
          <StyledDeliveryButton
            data-primary="true"
            onClick={() => {
              setFormError('');
              const wasEditing = Boolean(editingRecId);
              setEditingRecId(null);
              setRecTitle('');
              setRecAmount('');
              setRecEndMonth('');
              setRecNotes('');
              setShowRecurringForm((prev) => (wasEditing ? true : !prev));
            }}
          >
            <Trans>+ New Recurring Bill</Trans>
          </StyledDeliveryButton>
        )}
      </StyledFinanceV2HeaderRow>

      {formError && (
        <StyledFinanceV2Notice data-tone="danger" role="alert">
          {formError}
        </StyledFinanceV2Notice>
      )}

      {voidTarget && (
        <StyledFinanceV2Panel>
          <h3>{t`Void Entry: ${voidTarget.title}`}</h3>
          <small>
            <Trans>
              Voiding removes this entry from your P&amp;L and Balance Sheet
              while keeping an audit trail. If this was an invoice payment, the
              invoice balance will automatically reopen.
            </Trans>
          </small>
          <label>
            <Trans>Reason for voiding</Trans>
            <input
              value={voidReason}
              placeholder={t`e.g. Entered wrong amount or duplicate`}
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
                const res = await onRunCommand({
                  action: 'voidJournal',
                  journalId: voidTarget.id,
                  reason: voidReason.trim(),
                });
                if (res) {
                  setVoidTarget(null);
                  setVoidReason('');
                }
              }}
            >
              <Trans>Confirm Void</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton onClick={() => setVoidTarget(null)}>
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledFinanceV2Panel>
      )}

      {section === 'ledger' && (
        <StyledFinanceV2Stack>
          {showAddForm && (
            <StyledFinanceV2Panel>
              <h3>
                <Trans>Record Expense or Asset Purchase</Trans>
              </h3>
              <small>
                <Trans>
                  Direct &amp; Indirect Expenses update your P&amp;L
                  immediately. Assets (like laptops) go straight to your Balance
                  Sheet Assets without distorting monthly profit.
                </Trans>
              </small>
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Classification</Trans>
                  <select
                    value={entryKind}
                    onChange={(e) => {
                      const next = e.target.value as
                        | 'DIRECT_EXPENSE'
                        | 'INDIRECT_EXPENSE'
                        | 'ASSET_PURCHASE';
                      setEntryKind(next);
                      setCategory(
                        next === 'ASSET_PURCHASE'
                          ? 'ASSET_EQUIPMENT'
                          : next === 'DIRECT_EXPENSE'
                            ? 'DIRECT_SUBSCRIPTION'
                            : 'INDIRECT_MEALS',
                      );
                    }}
                  >
                    <option value="DIRECT_EXPENSE">
                      {t`Direct Expense (subscriptions, delivery, tools)`}
                    </option>
                    <option value="INDIRECT_EXPENSE">
                      {t`Indirect Expense (meals, courses, overhead)`}
                    </option>
                    <option value="ASSET_PURCHASE">
                      {t`Asset Purchase (laptop, camera, equipment)`}
                    </option>
                  </select>
                </label>
                <label>
                  <Trans>Category</Trans>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {categoriesForKind.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Description</Trans>
                  <input
                    value={title}
                    placeholder={t`e.g. MacBook Pro or Team Lunch`}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Date</Trans>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
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
                  {t`Amount (${currency})`}
                  <input
                    value={amount}
                    placeholder="250"
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                {currency !== 'AED' && (
                  <label>
                    {t`FX Rate (${currency} → AED)`}
                    <input
                      value={fxRate}
                      placeholder={data.profile.exchangeRates[currency] ?? '1'}
                      onChange={(e) => setFxRate(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  <Trans>Paid From (Revenue / Cash or Person Liability)</Trans>
                  <select
                    value={resolvedFundingId}
                    onChange={(e) => setFundingAccountId(e.target.value)}
                  >
                    {dayToDayFundingOptions.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                {data.projects.length > 0 && (
                  <label>
                    <Trans>Project (optional)</Trans>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                    >
                      <option value="">{t`Company-wide`}</option>
                      {data.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <Trans>Receipt link (optional)</Trans>
                  <input
                    type="url"
                    value={receiptUrl}
                    placeholder="https://..."
                    onChange={(e) => setReceiptUrl(e.target.value)}
                  />
                </label>
              </StyledFinanceV2FormGrid>
              <label>
                <Trans>Notes</Trans>
                <input
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
                    const micros = parseMoney(amount);
                    if (!title.trim()) {
                      setFormError(t`Enter a description for this entry.`);
                      return;
                    }
                    if (!micros || BigInt(micros) <= 0n) {
                      setFormError(t`Enter a valid positive amount.`);
                      return;
                    }
                    if (!resolvedFundingId) {
                      setFormError(t`Select a Paid From funding account.`);
                      return;
                    }
                    const res = await onRunCommand({
                      action: 'recordExpenseOrAsset',
                      entryKind,
                      category,
                      title: title.trim(),
                      entryDate,
                      currency,
                      amountMicros: micros,
                      ...(fxRate.trim() ? { fxRateToAed: fxRate.trim() } : {}),
                      fundingAccountId: resolvedFundingId,
                      projectId: projectId || null,
                      receiptUrl: receiptUrl.trim() || null,
                      notes,
                    });
                    if (res) {
                      setTitle('');
                      setAmount('');
                      setNotes('');
                      setProjectId('');
                      setReceiptUrl('');
                      setShowAddForm(false);
                    }
                  }}
                >
                  <Trans>Save Entry</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setShowAddForm(false)}
                >
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledFinanceV2Panel>
          )}

          <StyledFinanceV2Panel>
            <StyledFinanceV2HeaderRow>
              <h3>
                {ledgerFilter === 'all'
                  ? t`All Posted & Voided Ledger Entries`
                  : t`Day-to-Day Expenses, Payroll Adjustments & Assets`}
              </h3>
              <StyledFinanceV2SubTabs>
                <StyledFinanceV2SubTabButton
                  type="button"
                  data-active={ledgerFilter === 'expenses' ? 'true' : undefined}
                  onClick={() => setLedgerFilter('expenses')}
                >
                  <Trans>Expenses &amp; Assets</Trans>
                </StyledFinanceV2SubTabButton>
                <StyledFinanceV2SubTabButton
                  type="button"
                  data-active={ledgerFilter === 'all' ? 'true' : undefined}
                  onClick={() => setLedgerFilter('all')}
                >
                  <Trans>All Ledger (Opening, Loans, Payments, FX)</Trans>
                </StyledFinanceV2SubTabButton>
              </StyledFinanceV2SubTabs>
            </StyledFinanceV2HeaderRow>
            {visibleJournals.length === 0 ? (
              <p>
                <Trans>No entries recorded in this view yet.</Trans>
              </p>
            ) : (
              <StyledFinanceV2TableWrap>
                <StyledFinanceV2Table>
                  <thead>
                    <tr>
                      <th>
                        <Trans>Date</Trans>
                      </th>
                      <th>
                        <Trans>Item</Trans>
                      </th>
                      <th>
                        <Trans>Type</Trans>
                      </th>
                      <th>
                        <Trans>Charged From</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Amount</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>AED</Trans>
                      </th>
                      <th>
                        <Trans>Actions</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleJournals.map((item) => {
                      const isNegative = BigInt(item.amountMicros) < 0n;
                      const signedAedMicros = isNegative
                        ? (-BigInt(item.aedAmountMicros)).toString()
                        : item.aedAmountMicros;
                      return (
                        <tr key={item.id}>
                          <td>{item.entryDate}</td>
                          <td>
                            <strong>{item.title}</strong>
                            {item.notes && (
                              <div>
                                <small>{item.notes}</small>
                              </div>
                            )}
                            {item.receiptUrl && (
                              <div>
                                <a
                                  href={item.receiptUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Trans>Open receipt ↗</Trans>
                                </a>
                              </div>
                            )}
                          </td>
                          <td>
                            <StyledFinanceV2Pill
                              data-tone={
                                item.status === 'VOID'
                                  ? 'neutral'
                                  : item.entryType === 'ASSET_PURCHASE' ||
                                      item.entryType === 'INVOICE_PAYMENT'
                                    ? 'info'
                                    : item.entryType ===
                                        'PAYROLL_LEAVE_REDUCTION'
                                      ? 'success'
                                      : 'warning'
                              }
                            >
                              {item.status === 'VOID'
                                ? t`VOID`
                                : item.entryType.replaceAll('_', ' ')}
                            </StyledFinanceV2Pill>
                          </td>
                          <td>{item.fundingAccountName ?? '—'}</td>
                          <td data-numeric="true">
                            {formatFinanceAmountMicros(
                              item.amountMicros,
                              item.currency,
                            )}
                          </td>
                          <td data-numeric="true">
                            {formatFinanceAmountMicros(signedAedMicros, 'AED')}
                          </td>
                          <td>
                            {data.canManage && item.status === 'POSTED' && (
                              <StyledDeliveryButton
                                disabled={busy}
                                onClick={() => {
                                  setVoidTarget(item);
                                  setVoidReason('');
                                  setFormError('');
                                }}
                              >
                                <Trans>Void</Trans>
                              </StyledDeliveryButton>
                            )}
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
          {showRecurringForm && (
            <StyledFinanceV2Panel>
              <h3>
                {editingRecId
                  ? t`Edit Recurring Monthly Expense`
                  : t`New Recurring Monthly Expense`}
              </h3>
              <small>
                <Trans>
                  Posts automatically every month on the selected day until you
                  pause or stop it, charged from Company Cash or a Person&apos;s
                  Liability account. (Add employee base salaries in Payroll so
                  they stay linked automatically.)
                </Trans>
              </small>
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Expense name</Trans>
                  <input
                    value={recTitle}
                    placeholder={t`e.g. Adobe Creative Cloud`}
                    onChange={(e) => setRecTitle(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Expense type</Trans>
                  <select
                    value={recType}
                    onChange={(e) => {
                      const next = e.target.value as
                        | 'DIRECT_EXPENSE'
                        | 'INDIRECT_EXPENSE';
                      setRecType(next);
                      setRecCategory(
                        next === 'DIRECT_EXPENSE'
                          ? 'DIRECT_SUBSCRIPTION'
                          : 'INDIRECT_OFFICE',
                      );
                    }}
                  >
                    <option value="DIRECT_EXPENSE">
                      {t`Direct Expense (default)`}
                    </option>
                    <option value="INDIRECT_EXPENSE">
                      {t`Indirect Expense`}
                    </option>
                  </select>
                </label>
                <label>
                  <Trans>Category</Trans>
                  <select
                    value={recCategory}
                    onChange={(e) => setRecCategory(e.target.value)}
                  >
                    {(recType === 'DIRECT_EXPENSE'
                      ? DIRECT_CATEGORIES
                      : INDIRECT_CATEGORIES
                    ).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Currency</Trans>
                  <select
                    value={recCurrency}
                    onChange={(e) =>
                      setRecCurrency(e.target.value as FinanceV2Currency)
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
                  {t`Monthly amount (${recCurrency})`}
                  <input
                    value={recAmount}
                    placeholder="99"
                    onChange={(e) => setRecAmount(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Charge day of month (1–31)</Trans>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={recDay}
                    onChange={(e) => setRecDay(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Charged From</Trans>
                  <select
                    value={resolvedRecFundingId}
                    onChange={(e) => setRecFundingId(e.target.value)}
                  >
                    {recurringFundingOptions.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Start month (YYYY-MM)</Trans>
                  <input
                    value={recStartMonth}
                    onChange={(e) => setRecStartMonth(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>End month (optional, YYYY-MM)</Trans>
                  <input
                    value={recEndMonth}
                    placeholder={t`Leave blank until stopped`}
                    onChange={(e) => setRecEndMonth(e.target.value)}
                  />
                </label>
              </StyledFinanceV2FormGrid>
              <label>
                <Trans>Notes</Trans>
                <input
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                />
              </label>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={busy}
                  onClick={async () => {
                    setFormError('');
                    const micros = parseMoney(recAmount);
                    const parsedDay = Number.parseInt(recDay, 10);
                    if (!recTitle.trim()) {
                      setFormError(t`Enter an expense name.`);
                      return;
                    }
                    if (!micros || BigInt(micros) <= 0n) {
                      setFormError(t`Enter a valid positive monthly amount.`);
                      return;
                    }
                    if (
                      !Number.isInteger(parsedDay) ||
                      parsedDay < 1 ||
                      parsedDay > 31
                    ) {
                      setFormError(t`Charge day must be between 1 and 31.`);
                      return;
                    }
                    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(recStartMonth.trim())) {
                      setFormError(t`Enter a valid start month (YYYY-MM).`);
                      return;
                    }
                    const trimmedEnd = recEndMonth.trim();
                    if (
                      trimmedEnd &&
                      !/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmedEnd)
                    ) {
                      setFormError(t`Enter a valid end month (YYYY-MM).`);
                      return;
                    }
                    if (trimmedEnd && trimmedEnd < recStartMonth.trim()) {
                      setFormError(
                        t`End month cannot be earlier than start month.`,
                      );
                      return;
                    }
                    if (!resolvedRecFundingId) {
                      setFormError(t`Select a Charged From account.`);
                      return;
                    }
                    const res = await onRunCommand({
                      action: 'saveRecurringExpense',
                      ...(editingRecId ? { id: editingRecId } : {}),
                      title: recTitle.trim(),
                      expenseType: recType,
                      category: recCategory,
                      currency: recCurrency,
                      amountMicros: micros,
                      dayOfMonth: parsedDay,
                      fundingAccountId: resolvedRecFundingId,
                      startMonth: recStartMonth.trim(),
                      endMonth: trimmedEnd || null,
                      notes: recNotes,
                    });
                    if (res) {
                      setEditingRecId(null);
                      setRecTitle('');
                      setRecAmount('');
                      setRecEndMonth('');
                      setRecNotes('');
                      setShowRecurringForm(false);
                    }
                  }}
                >
                  {editingRecId
                    ? t`Update Recurring Expense`
                    : t`Save Recurring Expense`}
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => {
                    setEditingRecId(null);
                    setShowRecurringForm(false);
                  }}
                >
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            </StyledFinanceV2Panel>
          )}

          <StyledFinanceV2Panel>
            <h3>
              <Trans>Active &amp; Paused Recurring Expenses</Trans>
            </h3>
            {data.recurringExpenses.length === 0 ? (
              <p>
                <Trans>No recurring expenses configured yet.</Trans>
              </p>
            ) : (
              <StyledFinanceV2TableWrap>
                <StyledFinanceV2Table>
                  <thead>
                    <tr>
                      <th>
                        <Trans>Name</Trans>
                      </th>
                      <th>
                        <Trans>Type</Trans>
                      </th>
                      <th>
                        <Trans>Charged From</Trans>
                      </th>
                      <th>
                        <Trans>Day</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Amount</Trans>
                      </th>
                      <th>
                        <Trans>Status</Trans>
                      </th>
                      <th>
                        <Trans>Actions</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recurringExpenses.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <strong>{rule.title}</strong>
                          {rule.employeeName && (
                            <div>
                              <StyledFinanceV2Pill data-tone="info">
                                <Trans>Linked to Payroll</Trans>
                              </StyledFinanceV2Pill>
                            </div>
                          )}
                        </td>
                        <td>
                          {rule.expenseType === 'DIRECT_EXPENSE'
                            ? t`Direct`
                            : t`Indirect`}
                        </td>
                        <td>{rule.fundingAccountName}</td>
                        <td>{t`Day ${rule.dayOfMonth}`}</td>
                        <td data-numeric="true">
                          {formatFinanceAmountMicros(
                            rule.amountMicros,
                            rule.currency,
                          )}
                        </td>
                        <td>
                          <StyledFinanceV2Pill
                            data-tone={
                              rule.status === 'ACTIVE' ? 'success' : 'neutral'
                            }
                          >
                            {rule.status}
                          </StyledFinanceV2Pill>
                        </td>
                        <td>
                          {data.canManage &&
                            (!rule.employeeName || data.canViewPayroll) && (
                              <StyledDeliveryRow>
                                {!rule.employeeName && (
                                  <StyledDeliveryButton
                                    disabled={busy}
                                    onClick={() => openEditRecurring(rule)}
                                  >
                                    <Trans>Edit</Trans>
                                  </StyledDeliveryButton>
                                )}
                                {rule.status === 'ACTIVE' ? (
                                  <StyledDeliveryButton
                                    disabled={busy}
                                    onClick={() =>
                                      void onRunCommand({
                                        action: 'setRecurringExpenseStatus',
                                        id: rule.id,
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
                                        action: 'setRecurringExpenseStatus',
                                        id: rule.id,
                                        status: 'ACTIVE',
                                      })
                                    }
                                  >
                                    <Trans>Resume</Trans>
                                  </StyledDeliveryButton>
                                )}
                                {rule.status !== 'STOPPED' && (
                                  <StyledDeliveryButton
                                    disabled={busy}
                                    onClick={() =>
                                      void onRunCommand({
                                        action: 'setRecurringExpenseStatus',
                                        id: rule.id,
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

      {section === 'ai' && (
        <StyledFinanceV2Panel>
          <StyledFinanceV2HeaderRow>
            <div>
              <h3>
                <Trans>Sync Production AI Costs (USD → Direct Expense)</Trans>
              </h3>
              <small>
                <Trans>
                  Pull settled AI studio charges into Direct Expenses in 1 click
                  without double-counting.
                </Trans>
              </small>
            </div>
            {data.canManage && data.aiSpendCandidates.length > 0 && (
              <StyledDeliveryRow>
                <select
                  aria-label={t`AI spend funding account`}
                  value={resolvedAiFundingId}
                  onChange={(e) => setAiFundingId(e.target.value)}
                >
                  {aiFundingOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={busy || !resolvedAiFundingId}
                  onClick={async () => {
                    const ids =
                      activeSelectedAiIds.length > 0
                        ? activeSelectedAiIds
                        : data.aiSpendCandidates.map((item) => item.id);
                    const res = await onRunCommand({
                      action: 'importAiSpend',
                      spendIds: ids,
                      fundingAccountId: resolvedAiFundingId,
                    });
                    if (res) setSelectedAiIds([]);
                  }}
                >
                  {activeSelectedAiIds.length > 0
                    ? t`Import Selected (${activeSelectedAiIds.length})`
                    : t`Import All (${data.aiSpendCandidates.length})`}
                </StyledDeliveryButton>
              </StyledDeliveryRow>
            )}
          </StyledFinanceV2HeaderRow>
          {data.aiSpendCandidates.length === 0 ? (
            <p>
              <Trans>All settled AI production charges are synced.</Trans>
            </p>
          ) : (
            <StyledFinanceV2TableWrap>
              <StyledFinanceV2Table>
                <thead>
                  <tr>
                    <th />
                    <th>
                      <Trans>Date</Trans>
                    </th>
                    <th>
                      <Trans>Source / Task</Trans>
                    </th>
                    <th data-numeric="true">
                      <Trans>Amount (USD)</Trans>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.aiSpendCandidates.map((spend) => (
                    <tr key={spend.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedAiIds.includes(spend.id)}
                          onChange={(e) =>
                            setSelectedAiIds((prev) =>
                              e.target.checked
                                ? [...prev, spend.id]
                                : prev.filter((id) => id !== spend.id),
                            )
                          }
                        />
                      </td>
                      <td>{spend.occurredAt}</td>
                      <td>
                        {spend.taskName || spend.clientName || spend.sourceKind}
                      </td>
                      <td data-numeric="true">
                        {formatFinanceAmountMicros(spend.amountMicros, 'USD')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </StyledFinanceV2Table>
            </StyledFinanceV2TableWrap>
          )}
        </StyledFinanceV2Panel>
      )}
    </StyledFinanceV2Stack>
  );
};
