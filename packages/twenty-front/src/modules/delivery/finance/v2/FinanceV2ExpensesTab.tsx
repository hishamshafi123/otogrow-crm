import { Fragment, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
import {
  financeAmountMicrosToDecimal,
  formatFinanceAmountMicros,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import {
  computeDefaultReversalDate,
  createFinanceV2RequestId,
  isValidHttpUrl,
  isValidPositiveFxRate,
  sanitizeExternalUrl,
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
  type FinanceV2Journal,
  type FinanceV2RecurringExpense,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';

type FinanceV2ExpensesTabProps = {
  data: FinanceV2Snapshot;
  busy: boolean;
  selectedCategory?: string | null;
  onClearCategory?: () => void;
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

const ALL_CATEGORY_LABELS = new Map(
  [...DIRECT_CATEGORIES, ...INDIRECT_CATEGORIES, ...ASSET_CATEGORIES].map(
    (item) => [item.value, item.label],
  ),
);

const EXPENSE_ENTRY_TYPES = new Set([
  'EXPENSE',
  'ASSET_PURCHASE',
  'RECURRING_EXPENSE',
  'PAYROLL_BASE',
  'PAYROLL_OVERTIME',
  'PAYROLL_LEAVE_REDUCTION',
  'PAYROLL_BONUS',
  'AI_COST',
  'REVERSAL',
]);

const parseMoney = (raw: string): string | null =>
  parseFinanceAmountMicros(raw.replaceAll(',', '').trim());

export const FinanceV2ExpensesTab = ({
  data,
  busy,
  selectedCategory,
  onClearCategory,
  onRunCommand,
}: FinanceV2ExpensesTabProps) => {
  const { t } = useLingui();
  const [section, setSection] = useState<'ledger' | 'recurring' | 'ai'>(
    'ledger',
  );
  const [ledgerFilter, setLedgerFilter] = useState<'expenses' | 'all'>(
    'expenses',
  );
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerCurrencyFilter, setLedgerCurrencyFilter] = useState<
    FinanceV2Currency | 'ALL'
  >('ALL');
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState('');
  const [ledgerProjectFilter, setLedgerProjectFilter] = useState('');

  const [formError, setFormError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [expenseRequestId, setExpenseRequestId] = useState(
    createFinanceV2RequestId,
  );
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [confirmingStopRecId, setConfirmingStopRecId] = useState<string | null>(
    null,
  );
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
  const [confirmingImportAllAi, setConfirmingImportAllAi] = useState(false);

  // Reverse journal (audit-safe correction for locked periods)
  const [reverseTarget, setReverseTarget] = useState<FinanceV2Journal | null>(
    null,
  );
  const [reverseDate, setReverseDate] = useState(data.today);
  const [reverseReason, setReverseReason] = useState('');

  const projectNameById = new Map(
    data.projects.map((proj) => [proj.id, proj.name]),
  );

  const resetExpenseDraft = () => {
    setEntryKind('DIRECT_EXPENSE');
    setCategory('DIRECT_SUBSCRIPTION');
    setTitle('');
    setCurrency('AED');
    setAmount('');
    setFxRate('');
    setEntryDate(data.today);
    setFundingAccountId('');
    setProjectId('');
    setReceiptUrl('');
    setNotes('');
    setExpenseRequestId(createFinanceV2RequestId());
  };

  const resetRecurringDraft = () => {
    setRecTitle('');
    setRecType('INDIRECT_EXPENSE');
    setRecCategory('INDIRECT_RENT');
    setRecCurrency('USD');
    setRecAmount('');
    setRecDay('1');
    setRecFundingId('');
    setRecStartMonth(data.today.slice(0, 7));
    setRecEndMonth('');
    setRecNotes('');
  };

  const closeAllPanels = () => {
    setFormError('');
    setShowAddForm(false);
    setShowRecurringForm(false);
    setEditingRecId(null);
    setConfirmingStopRecId(null);
    setVoidTarget(null);
    setVoidReason('');
    setReverseTarget(null);
    setReverseDate(data.today);
    setReverseReason('');
    setConfirmingImportAllAi(false);
    resetExpenseDraft();
    resetRecurringDraft();
  };

  const switchSection = (next: 'ledger' | 'recurring' | 'ai') => {
    closeAllPanels();
    setSection(next);
  };

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

  const candidateAiIdSet = new Set(
    data.aiSpendCandidates.map((item) => item.id),
  );
  const activeSelectedAiIds = selectedAiIds.filter((id) =>
    candidateAiIdSet.has(id),
  );
  const targetAiSpends =
    activeSelectedAiIds.length > 0
      ? data.aiSpendCandidates.filter((item) =>
          activeSelectedAiIds.includes(item.id),
        )
      : data.aiSpendCandidates;
  const aiCurrencySet = new Set<FinanceV2Currency>(
    targetAiSpends.map((item) => item.currency ?? 'USD'),
  );
  const aiFundingOptions =
    aiCurrencySet.size === 1
      ? fundingAccountsFor([...aiCurrencySet][0] ?? 'USD')
      : data.accounts.filter(
          (account) => account.active && account.subType === 'PERSON_LIABILITY',
        );
  const resolvedAiFundingId =
    aiFundingOptions.find((a) => a.id === aiFundingId)?.id ??
    aiFundingOptions[0]?.id ??
    '';

  const allowedDirectCategories = data.canViewPayroll
    ? DIRECT_CATEGORIES
    : DIRECT_CATEGORIES.filter((opt) => opt.value !== 'DIRECT_SALARY');

  const categoriesForKind =
    entryKind === 'ASSET_PURCHASE'
      ? ASSET_CATEGORIES
      : entryKind === 'DIRECT_EXPENSE'
        ? allowedDirectCategories
        : INDIRECT_CATEGORIES;

  const trimmedExternalCategory = selectedCategory?.trim() ?? '';
  const activeCategoryFilter = trimmedExternalCategory || ledgerCategoryFilter;
  const searchLower = ledgerSearch.trim().toLowerCase();

  const baseJournals =
    ledgerFilter === 'all'
      ? data.journals
      : data.journals.filter((item) => EXPENSE_ENTRY_TYPES.has(item.entryType));

  const visibleJournals = baseJournals.filter((item) => {
    if (activeCategoryFilter && item.category !== activeCategoryFilter) {
      return false;
    }
    if (
      ledgerCurrencyFilter !== 'ALL' &&
      item.currency !== ledgerCurrencyFilter
    ) {
      return false;
    }
    if (ledgerProjectFilter && item.projectId !== ledgerProjectFilter) {
      return false;
    }
    if (searchLower) {
      const projName = item.projectId
        ? (projectNameById.get(item.projectId) ?? '')
        : '';
      const catLabel = ALL_CATEGORY_LABELS.get(item.category) ?? item.category;
      const haystack = [
        item.title,
        item.notes,
        item.fundingAccountName ?? '',
        item.category,
        catLabel,
        projName,
        item.voidReason ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    return true;
  });

  const openEditRecurring = (rule: FinanceV2RecurringExpense) => {
    setFormError('');
    setConfirmingStopRecId(null);
    if (showRecurringForm && editingRecId === rule.id) {
      setShowRecurringForm(false);
      setEditingRecId(null);
      return;
    }
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

  const duplicateManualEntry = (item: FinanceV2Journal) => {
    closeAllPanels();
    const kind: 'DIRECT_EXPENSE' | 'INDIRECT_EXPENSE' | 'ASSET_PURCHASE' =
      item.entryType === 'ASSET_PURCHASE'
        ? 'ASSET_PURCHASE'
        : item.category.startsWith('INDIRECT_')
          ? 'INDIRECT_EXPENSE'
          : 'DIRECT_EXPENSE';
    setEntryKind(kind);
    const validForKind =
      kind === 'ASSET_PURCHASE'
        ? ASSET_CATEGORIES
        : kind === 'DIRECT_EXPENSE'
          ? allowedDirectCategories
          : INDIRECT_CATEGORIES;
    setCategory(
      validForKind.some((opt) => opt.value === item.category)
        ? item.category
        : (validForKind[0]?.value ?? 'DIRECT_OTHER'),
    );
    setTitle(item.title);
    setCurrency(item.currency);
    const absMicros =
      BigInt(item.amountMicros) < 0n
        ? (-BigInt(item.amountMicros)).toString()
        : item.amountMicros;
    setAmount(financeAmountMicrosToDecimal(absMicros));
    setFxRate(item.currency === 'AED' ? '' : item.fxRateToAed);
    setEntryDate(data.today);
    setFundingAccountId(item.fundingAccountId ?? '');
    setProjectId(item.projectId ?? '');
    setReceiptUrl(item.receiptUrl ?? '');
    setNotes(item.notes);
    setExpenseRequestId(createFinanceV2RequestId());
    setShowAddForm(true);
  };

  const handleSaveExpenseOrAsset = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const micros = parseMoney(amount);
    if (!title.trim()) {
      setFormError(t`Enter a description for this entry.`);
      return;
    }
    if (
      !micros ||
      BigInt(micros) <= 0n ||
      !isFinanceAmountMicrosWithinLimit(micros)
    ) {
      setFormError(t`Enter a valid positive amount.`);
      return;
    }
    const trimmedFx = currency !== 'AED' ? fxRate.trim() : '';
    if (trimmedFx && !isValidPositiveFxRate(trimmedFx)) {
      setFormError(t`Enter a valid positive AED exchange rate.`);
      return;
    }
    const trimmedReceipt = receiptUrl.trim();
    if (trimmedReceipt && !isValidHttpUrl(trimmedReceipt)) {
      setFormError(t`Receipt link must start with https:// or http://.`);
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
      ...(trimmedFx ? { fxRateToAed: trimmedFx } : {}),
      fundingAccountId: resolvedFundingId,
      projectId: projectId || null,
      receiptUrl: trimmedReceipt || null,
      notes,
      clientRequestId: expenseRequestId,
    });
    if (res) {
      setTitle('');
      setAmount('');
      setFxRate('');
      setNotes('');
      setProjectId('');
      setReceiptUrl('');
      setExpenseRequestId(createFinanceV2RequestId());
      setShowAddForm(false);
    }
  };

  const handleSaveRecurringExpense = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const micros = parseMoney(recAmount);
    const parsedDay = Number.parseInt(recDay, 10);
    if (!recTitle.trim()) {
      setFormError(t`Enter an expense name.`);
      return;
    }
    if (
      !micros ||
      BigInt(micros) <= 0n ||
      !isFinanceAmountMicrosWithinLimit(micros)
    ) {
      setFormError(t`Enter a valid positive monthly amount.`);
      return;
    }
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      setFormError(t`Charge day must be between 1 and 31.`);
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(recStartMonth.trim())) {
      setFormError(t`Enter a valid start month (YYYY-MM).`);
      return;
    }
    const trimmedEnd = recEndMonth.trim();
    if (trimmedEnd && !/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmedEnd)) {
      setFormError(t`Enter a valid end month (YYYY-MM).`);
      return;
    }
    if (trimmedEnd && trimmedEnd < recStartMonth.trim()) {
      setFormError(t`End month cannot be earlier than start month.`);
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
  };

  const renderRecurringFormBody = () => (
    <form onSubmit={(event) => void handleSaveRecurringExpense(event)}>
      <StyledFinanceV2Stack>
        <h3>
          {editingRecId
            ? t`Edit Recurring Monthly Expense`
            : t`New Recurring Monthly Expense`}
        </h3>
        {formError && editingRecId && (
          <StyledFinanceV2Notice data-tone="danger" role="alert">
            {formError}
          </StyledFinanceV2Notice>
        )}
        <small>
          <Trans>
            Posts automatically every month on the selected day until you pause
            or stop it, charged from Company Cash or a Person&apos;s Liability
            account. (Add employee base salaries in Payroll so they stay linked
            automatically.)
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
              <option value="INDIRECT_EXPENSE">{t`Indirect Expense`}</option>
            </select>
          </label>
          <label>
            <Trans>Category</Trans>
            <select
              value={recCategory}
              onChange={(e) => setRecCategory(e.target.value)}
            >
              {(recType === 'DIRECT_EXPENSE'
                ? allowedDirectCategories
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
        <StyledFinanceV2ActionGroup>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={busy}
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
              setFormError('');
            }}
          >
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledFinanceV2ActionGroup>
      </StyledFinanceV2Stack>
    </form>
  );

  const uniqueJournalCategories = [
    ...new Set(baseJournals.map((item) => item.category)),
  ].sort();

  const runAiImport = async () => {
    const ids =
      activeSelectedAiIds.length > 0
        ? activeSelectedAiIds
        : data.aiSpendCandidates.map((item) => item.id);
    const res = await onRunCommand({
      action: 'importAiSpend',
      spendIds: ids,
      fundingAccountId: resolvedAiFundingId,
    });
    if (res) {
      setSelectedAiIds([]);
      setConfirmingImportAllAi(false);
    }
  };

  return (
    <StyledFinanceV2Stack>
      <StyledFinanceV2HeaderRow>
        <StyledFinanceV2SubTabs>
          <StyledFinanceV2SubTabButton
            type="button"
            data-active={section === 'ledger' ? 'true' : undefined}
            onClick={() => switchSection('ledger')}
          >
            {t`Day-to-Day Ledger (${data.journals.length})`}
          </StyledFinanceV2SubTabButton>
          <StyledFinanceV2SubTabButton
            type="button"
            data-active={section === 'recurring' ? 'true' : undefined}
            onClick={() => switchSection('recurring')}
          >
            {t`Recurring Bills & Salaries (${data.recurringExpenses.length})`}
          </StyledFinanceV2SubTabButton>
          <StyledFinanceV2SubTabButton
            type="button"
            data-active={section === 'ai' ? 'true' : undefined}
            onClick={() => switchSection('ai')}
          >
            {t`AI Costs (${data.aiSpendCandidates.length})`}
          </StyledFinanceV2SubTabButton>
        </StyledFinanceV2SubTabs>

        {data.canManage && section === 'ledger' && (
          <StyledDeliveryButton
            type="button"
            data-primary="true"
            onClick={() => {
              const nextOpen = !showAddForm;
              closeAllPanels();
              setShowAddForm(nextOpen);
            }}
          >
            <Trans>+ Record Expense or Asset</Trans>
          </StyledDeliveryButton>
        )}
        {data.canManage && section === 'recurring' && (
          <StyledDeliveryButton
            type="button"
            data-primary="true"
            onClick={() => {
              const wasEditing = Boolean(editingRecId);
              const nextOpen = wasEditing ? true : !showRecurringForm;
              closeAllPanels();
              setRecTitle('');
              setRecAmount('');
              setRecEndMonth('');
              setRecNotes('');
              setShowRecurringForm(nextOpen);
            }}
          >
            <Trans>+ New Recurring Bill</Trans>
          </StyledDeliveryButton>
        )}
      </StyledFinanceV2HeaderRow>

      {formError && !voidTarget && !reverseTarget && !editingRecId && (
        <StyledFinanceV2Notice data-tone="danger" role="alert">
          {formError}
        </StyledFinanceV2Notice>
      )}

      {section === 'ledger' && (
        <StyledFinanceV2Stack>
          {showAddForm && (
            <StyledFinanceV2Panel>
              <form onSubmit={(event) => void handleSaveExpenseOrAsset(event)}>
                <StyledFinanceV2Stack>
                  <h3>
                    <Trans>Record Expense or Asset Purchase</Trans>
                  </h3>
                  <small>
                    <Trans>
                      Direct &amp; Indirect Expenses update your P&amp;L
                      immediately. Assets (like laptops) go straight to your
                      Balance Sheet Assets without distorting monthly profit.
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
                        onChange={(e) => {
                          setCurrency(e.target.value as FinanceV2Currency);
                          setFxRate('');
                        }}
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
                          placeholder={
                            data.profile.exchangeRates[currency] ?? '1'
                          }
                          onChange={(e) => setFxRate(e.target.value)}
                        />
                      </label>
                    )}
                    <label>
                      <Trans>
                        Paid From (Revenue / Cash or Person Liability)
                      </Trans>
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
                  <StyledFinanceV2ActionGroup>
                    <StyledDeliveryButton
                      type="submit"
                      data-primary="true"
                      disabled={busy}
                    >
                      <Trans>Save Entry</Trans>
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

            <StyledFinanceV2FormGrid>
              <label>
                <Trans>Search</Trans>
                <input
                  type="search"
                  placeholder={t`Search description, notes, account…`}
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                />
              </label>
              <label>
                <Trans>Currency</Trans>
                <select
                  aria-label={t`Filter expenses by currency`}
                  value={ledgerCurrencyFilter}
                  onChange={(e) =>
                    setLedgerCurrencyFilter(
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
              <label>
                <Trans>Category</Trans>
                <select
                  aria-label={t`Filter expenses by category`}
                  value={activeCategoryFilter}
                  onChange={(e) => {
                    if (trimmedExternalCategory && onClearCategory) {
                      onClearCategory();
                    }
                    setLedgerCategoryFilter(e.target.value);
                  }}
                >
                  <option value="">{t`All categories`}</option>
                  {uniqueJournalCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {ALL_CATEGORY_LABELS.get(cat) ?? cat.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              {data.projects.length > 0 && (
                <label>
                  <Trans>Project</Trans>
                  <select
                    aria-label={t`Filter expenses by project`}
                    value={ledgerProjectFilter}
                    onChange={(e) => setLedgerProjectFilter(e.target.value)}
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

            {trimmedExternalCategory && (
              <StyledFinanceV2Notice data-tone="info" role="status">
                <span>
                  {t`Filtered by category: ${trimmedExternalCategory}`}
                </span>{' '}
                {onClearCategory && (
                  <StyledDeliveryButton type="button" onClick={onClearCategory}>
                    <Trans>Clear category filter</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledFinanceV2Notice>
            )}
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
                        <Trans>Type / Category</Trans>
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
                    {(() => {
                      const lockedThroughDate =
                        data.profile.lockedThroughDate ?? null;
                      const reversedIds = new Set(
                        data.journals
                          .filter(
                            (j) =>
                              j.status === 'POSTED' && j.reversalOfJournalId,
                          )
                          .map((j) => j.reversalOfJournalId!),
                      );
                      return visibleJournals.map((item) => {
                        const isNegative = BigInt(item.amountMicros) < 0n;
                        const signedAedMicros = isNegative
                          ? (-BigInt(item.aedAmountMicros)).toString()
                          : item.aedAmountMicros;
                        const safeReceiptUrl = sanitizeExternalUrl(
                          item.receiptUrl,
                        );
                        const projName = item.projectId
                          ? projectNameById.get(item.projectId)
                          : null;
                        const categoryLabel =
                          ALL_CATEGORY_LABELS.get(item.category) ??
                          item.category.replaceAll('_', ' ');
                        const isVoidingThisRow = voidTarget?.id === item.id;
                        const isReversingThisRow =
                          reverseTarget?.id === item.id;
                        const isLockedEntry = Boolean(
                          lockedThroughDate &&
                          item.entryDate <= lockedThroughDate,
                        );
                        const isAlreadyReversed =
                          Boolean(item.isReversed) || reversedIds.has(item.id);
                        const canReverse =
                          data.canManage &&
                          item.status === 'POSTED' &&
                          item.entryType !== 'REVERSAL' &&
                          !isAlreadyReversed;
                        const canDuplicate =
                          data.canManage &&
                          (item.entryType === 'EXPENSE' ||
                            item.entryType === 'ASSET_PURCHASE');

                        return (
                          <Fragment key={item.id}>
                            <tr>
                              <td>
                                {item.entryDate}
                                {isLockedEntry && item.status === 'POSTED' && (
                                  <div>
                                    <small>{t`Locked period`}</small>
                                  </div>
                                )}
                              </td>
                              <td>
                                <strong>{item.title}</strong>
                                {projName && (
                                  <div>
                                    <small>{t`Project: ${projName}`}</small>
                                  </div>
                                )}
                                {item.notes && (
                                  <div>
                                    <small>{item.notes}</small>
                                  </div>
                                )}
                                {item.status === 'VOID' && item.voidReason && (
                                  <div>
                                    <small>
                                      {t`Void reason: ${item.voidReason}`}
                                    </small>
                                  </div>
                                )}
                                {isAlreadyReversed && (
                                  <div>
                                    <small>{t`Reversed by a later entry`}</small>
                                  </div>
                                )}
                                {safeReceiptUrl && (
                                  <div>
                                    <a
                                      href={safeReceiptUrl}
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
                                      : item.entryType === 'REVERSAL'
                                        ? 'info'
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
                                <div>
                                  <small>{categoryLabel}</small>
                                </div>
                              </td>
                              <td>{item.fundingAccountName ?? '—'}</td>
                              <td data-numeric="true">
                                {formatFinanceAmountMicros(
                                  item.amountMicros,
                                  item.currency,
                                )}
                                {item.currency !== 'AED' &&
                                  item.fxRateToAed && (
                                    <div>
                                      <small>{`@ ${item.fxRateToAed}`}</small>
                                    </div>
                                  )}
                              </td>
                              <td data-numeric="true">
                                {formatFinanceAmountMicros(
                                  signedAedMicros,
                                  'AED',
                                )}
                              </td>
                              <td>
                                <StyledFinanceV2ActionGroup>
                                  {canDuplicate && (
                                    <StyledDeliveryButton
                                      type="button"
                                      disabled={busy}
                                      onClick={() => duplicateManualEntry(item)}
                                    >
                                      <Trans>Duplicate</Trans>
                                    </StyledDeliveryButton>
                                  )}
                                  {data.canManage &&
                                    item.status === 'POSTED' &&
                                    item.entryType !== 'REVERSAL' &&
                                    !isAlreadyReversed &&
                                    !isLockedEntry && (
                                      <StyledDeliveryButton
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                          if (isVoidingThisRow) {
                                            closeAllPanels();
                                            return;
                                          }
                                          closeAllPanels();
                                          setVoidTarget(item);
                                          setVoidReason('');
                                        }}
                                      >
                                        {isVoidingThisRow ? (
                                          <Trans>Close</Trans>
                                        ) : (
                                          <Trans>Void</Trans>
                                        )}
                                      </StyledDeliveryButton>
                                    )}
                                  {canReverse && isLockedEntry && (
                                    <StyledDeliveryButton
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        if (isReversingThisRow) {
                                          closeAllPanels();
                                          return;
                                        }
                                        closeAllPanels();
                                        setReverseTarget(item);
                                        setReverseDate(
                                          computeDefaultReversalDate(
                                            data.today,
                                            item.entryDate,
                                            lockedThroughDate,
                                          ),
                                        );
                                        setReverseReason('');
                                      }}
                                    >
                                      {isReversingThisRow ? (
                                        <Trans>Close</Trans>
                                      ) : (
                                        <Trans>Reverse</Trans>
                                      )}
                                    </StyledDeliveryButton>
                                  )}
                                </StyledFinanceV2ActionGroup>
                              </td>
                            </tr>
                            {isVoidingThisRow && (
                              <tr>
                                <td colSpan={7}>
                                  <StyledFinanceV2InlineEditor>
                                    <form
                                      onSubmit={async (event) => {
                                        event.preventDefault();
                                        setFormError('');
                                        if (!voidReason.trim()) {
                                          setFormError(
                                            t`Enter a short reason before voiding.`,
                                          );
                                          return;
                                        }
                                        const res = await onRunCommand({
                                          action: 'voidJournal',
                                          journalId: item.id,
                                          reason: voidReason.trim(),
                                        });
                                        if (res) {
                                          closeAllPanels();
                                        }
                                      }}
                                    >
                                      <StyledFinanceV2Stack>
                                        <h4>{t`Void Entry: ${item.title}`}</h4>
                                        {formError && (
                                          <StyledFinanceV2Notice
                                            data-tone="danger"
                                            role="alert"
                                          >
                                            {formError}
                                          </StyledFinanceV2Notice>
                                        )}
                                        <small>
                                          <Trans>
                                            Voiding removes this entry from your
                                            P&amp;L and Balance Sheet while
                                            keeping an audit trail. If this was
                                            an invoice payment, the invoice
                                            balance will automatically reopen.
                                          </Trans>
                                        </small>
                                        <label>
                                          <Trans>Reason for voiding</Trans>
                                          <input
                                            value={voidReason}
                                            placeholder={t`e.g. Entered wrong amount or duplicate`}
                                            onChange={(e) =>
                                              setVoidReason(e.target.value)
                                            }
                                          />
                                        </label>
                                        <StyledFinanceV2ActionGroup>
                                          <StyledDeliveryButton
                                            type="submit"
                                            data-primary="true"
                                            disabled={busy}
                                          >
                                            <Trans>Confirm Void</Trans>
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
                            {isReversingThisRow && (
                              <tr>
                                <td colSpan={7}>
                                  <StyledFinanceV2InlineEditor>
                                    <form
                                      onSubmit={async (event) => {
                                        event.preventDefault();
                                        setFormError('');
                                        if (!reverseDate) {
                                          setFormError(
                                            t`Choose a reversal date in an open period.`,
                                          );
                                          return;
                                        }
                                        if (reverseDate < item.entryDate) {
                                          setFormError(
                                            t`Reversal date cannot be earlier than the original entry date.`,
                                          );
                                          return;
                                        }
                                        if (
                                          lockedThroughDate &&
                                          reverseDate <= lockedThroughDate
                                        ) {
                                          setFormError(
                                            t`Reversal date must be after the locked period (${lockedThroughDate}).`,
                                          );
                                          return;
                                        }
                                        if (!reverseReason.trim()) {
                                          setFormError(
                                            t`Enter a short reason for this reversing entry.`,
                                          );
                                          return;
                                        }
                                        const res = await onRunCommand({
                                          action: 'reverseJournal',
                                          journalId: item.id,
                                          reversalDate: reverseDate,
                                          reason: reverseReason.trim(),
                                        });
                                        if (res) {
                                          closeAllPanels();
                                        }
                                      }}
                                    >
                                      <StyledFinanceV2Stack>
                                        <h4>{t`Reverse Locked Entry: ${item.title}`}</h4>
                                        {formError && (
                                          <StyledFinanceV2Notice
                                            data-tone="danger"
                                            role="alert"
                                          >
                                            {formError}
                                          </StyledFinanceV2Notice>
                                        )}
                                        <small>
                                          <Trans>
                                            This entry is inside a closed
                                            accounting period and cannot be
                                            voided. Posting a reversing entry in
                                            an open period preserves closed
                                            financial statements while keeping
                                            your ledger balanced.
                                          </Trans>
                                        </small>
                                        <StyledFinanceV2FormGrid>
                                          <label>
                                            <Trans>Reversal date</Trans>
                                            <input
                                              type="date"
                                              aria-label={t`Reversal date`}
                                              value={reverseDate}
                                              onChange={(e) =>
                                                setReverseDate(e.target.value)
                                              }
                                            />
                                          </label>
                                          <label>
                                            <Trans>Reason for reversal</Trans>
                                            <input
                                              aria-label={t`Reason for reversal`}
                                              value={reverseReason}
                                              placeholder={t`e.g. Correct prior-period duplicate`}
                                              onChange={(e) =>
                                                setReverseReason(e.target.value)
                                              }
                                            />
                                          </label>
                                        </StyledFinanceV2FormGrid>
                                        <StyledFinanceV2ActionGroup>
                                          <StyledDeliveryButton
                                            type="submit"
                                            data-primary="true"
                                            disabled={busy}
                                          >
                                            <Trans>Post Reversal</Trans>
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
                          </Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </StyledFinanceV2Table>
              </StyledFinanceV2TableWrap>
            )}
          </StyledFinanceV2Panel>
        </StyledFinanceV2Stack>
      )}

      {section === 'recurring' && (
        <StyledFinanceV2Stack>
          {showRecurringForm && !editingRecId && (
            <StyledFinanceV2Panel>
              {renderRecurringFormBody()}
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
                    {data.recurringExpenses.map((rule) => {
                      const isEditingThisRule =
                        showRecurringForm && editingRecId === rule.id;
                      const isConfirmingStop = confirmingStopRecId === rule.id;
                      return (
                        <Fragment key={rule.id}>
                          <tr>
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
                                  rule.status === 'ACTIVE'
                                    ? 'success'
                                    : 'neutral'
                                }
                              >
                                {rule.status}
                              </StyledFinanceV2Pill>
                            </td>
                            <td>
                              {data.canManage &&
                                (!rule.employeeName || data.canViewPayroll) && (
                                  <StyledFinanceV2ActionGroup>
                                    {!rule.employeeName && (
                                      <StyledDeliveryButton
                                        type="button"
                                        disabled={busy}
                                        onClick={() => openEditRecurring(rule)}
                                      >
                                        {isEditingThisRule ? (
                                          <Trans>Close</Trans>
                                        ) : (
                                          <Trans>Edit</Trans>
                                        )}
                                      </StyledDeliveryButton>
                                    )}
                                    {rule.status === 'ACTIVE' ? (
                                      <StyledDeliveryButton
                                        type="button"
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
                                        type="button"
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
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                          setFormError('');
                                          setShowRecurringForm(false);
                                          setEditingRecId(null);
                                          setConfirmingStopRecId((prev) =>
                                            prev === rule.id ? null : rule.id,
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
                          {isEditingThisRule && (
                            <tr>
                              <td colSpan={7}>
                                <StyledFinanceV2InlineEditor>
                                  {renderRecurringFormBody()}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}
                          {isConfirmingStop && (
                            <tr>
                              <td colSpan={7}>
                                <StyledFinanceV2InlineEditor>
                                  <p>
                                    {t`Stop "${rule.title}"? Future monthly auto-posts will stop until you resume it, and existing ledger entries remain untouched.`}
                                  </p>
                                  <StyledFinanceV2ActionGroup>
                                    <StyledDeliveryButton
                                      type="button"
                                      data-primary="true"
                                      disabled={busy}
                                      onClick={async () => {
                                        const res = await onRunCommand({
                                          action: 'setRecurringExpenseStatus',
                                          id: rule.id,
                                          status: 'STOPPED',
                                        });
                                        if (res) setConfirmingStopRecId(null);
                                      }}
                                    >
                                      <Trans>Confirm Stop</Trans>
                                    </StyledDeliveryButton>
                                    <StyledDeliveryButton
                                      type="button"
                                      onClick={() =>
                                        setConfirmingStopRecId(null)
                                      }
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

      {section === 'ai' && (
        <StyledFinanceV2Panel>
          <StyledFinanceV2HeaderRow>
            <div>
              <h3>
                <Trans>Sync Production AI Costs (Direct Expense)</Trans>
              </h3>
              <small>
                <Trans>
                  Pull settled AI studio charges into Direct Expenses in 1 click
                  without double-counting.
                </Trans>
              </small>
            </div>
            {data.canManage && data.aiSpendCandidates.length > 0 && (
              <StyledFinanceV2ActionGroup>
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
                {activeSelectedAiIds.length > 0 ? (
                  <StyledDeliveryButton
                    type="button"
                    data-primary="true"
                    disabled={busy || !resolvedAiFundingId}
                    onClick={() => void runAiImport()}
                  >
                    {t`Import Selected (${activeSelectedAiIds.length})`}
                  </StyledDeliveryButton>
                ) : (
                  <StyledDeliveryButton
                    type="button"
                    data-primary="true"
                    disabled={busy || !resolvedAiFundingId}
                    onClick={() => setConfirmingImportAllAi(true)}
                  >
                    {t`Import All (${data.aiSpendCandidates.length})`}
                  </StyledDeliveryButton>
                )}
              </StyledFinanceV2ActionGroup>
            )}
          </StyledFinanceV2HeaderRow>
          {confirmingImportAllAi && activeSelectedAiIds.length === 0 && (
            <StyledFinanceV2InlineEditor>
              <p>
                {t`Import all ${data.aiSpendCandidates.length} settled AI charges into Direct Expenses right now?`}
              </p>
              <StyledFinanceV2ActionGroup>
                <StyledDeliveryButton
                  type="button"
                  data-primary="true"
                  disabled={busy || !resolvedAiFundingId}
                  onClick={() => void runAiImport()}
                >
                  <Trans>Confirm Import All</Trans>
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setConfirmingImportAllAi(false)}
                >
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledFinanceV2ActionGroup>
            </StyledFinanceV2InlineEditor>
          )}
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
                      <Trans>Amount</Trans>
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
                          onChange={(e) => {
                            setConfirmingImportAllAi(false);
                            setSelectedAiIds((prev) =>
                              e.target.checked
                                ? [...prev, spend.id]
                                : prev.filter((id) => id !== spend.id),
                            );
                          }}
                        />
                      </td>
                      <td>{spend.occurredAt}</td>
                      <td>
                        {spend.taskName || spend.clientName || spend.sourceKind}
                      </td>
                      <td data-numeric="true">
                        {formatFinanceAmountMicros(
                          spend.amountMicros,
                          spend.currency ?? 'USD',
                        )}
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
