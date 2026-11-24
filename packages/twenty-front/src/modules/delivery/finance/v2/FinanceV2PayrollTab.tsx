import { Fragment, useCallback, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
import {
  financeAmountMicrosToDecimal,
  formatFinanceAmountMicros,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import {
  buildExchangeRateNote,
  convertAedMicrosToDisplay,
  convertCurrencyMicros,
  formatRatioPercent,
  isValidYearMonth,
  roundMicrosToCents,
  shiftYearMonth,
} from '@/delivery/finance/v2/finance-v2-currency';
import {
  StyledFinanceV2ActionGroup,
  StyledFinanceV2FormGrid,
  StyledFinanceV2HeaderRow,
  StyledFinanceV2HeroGrid,
  StyledFinanceV2InlineEditor,
  StyledFinanceV2Notice,
  StyledFinanceV2Panel,
  StyledFinanceV2Pill,
  StyledFinanceV2ReadinessCard,
  StyledFinanceV2ReadinessGrid,
  StyledFinanceV2Stack,
  StyledFinanceV2StatCard,
  StyledFinanceV2Table,
  StyledFinanceV2TableWrap,
} from '@/delivery/finance/v2/finance-v2.styles';
import {
  FINANCE_V2_CURRENCIES,
  type FinanceV2CommandRunner,
  type FinanceV2Currency,
  type FinanceV2PayrollProfile,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';

type FinanceV2PayrollTabProps = {
  data: FinanceV2Snapshot;
  busy: boolean;
  displayCurrency: FinanceV2Currency;
  onChangeDisplayCurrency: (currency: FinanceV2Currency) => void;
  onChangePayrollMonth: (month: string) => void;
  onRunCommand: FinanceV2CommandRunner;
};

const parseMoney = (raw: string): string | null =>
  parseFinanceAmountMicros(raw.replaceAll(',', '').trim());

const defaultEventDateForMonth = (month: string, today: string): string =>
  today.startsWith(month) ? today : `${month}-01`;

export const FinanceV2PayrollTab = ({
  data,
  busy,
  displayCurrency,
  onChangeDisplayCurrency,
  onChangePayrollMonth,
  onRunCommand,
}: FinanceV2PayrollTabProps) => {
  const { t } = useLingui();
  const [profileFormError, setProfileFormError] = useState('');
  const [entryFormError, setEntryFormError] = useState('');
  const [monthInput, setMonthInput] = useState(data.payrollMonth);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<
    FinanceV2Currency | 'ALL'
  >('ALL');
  const [confirmingPostProfileId, setConfirmingPostProfileId] = useState<
    string | null
  >(null);
  const [confirmingDeleteEntryId, setConfirmingDeleteEntryId] = useState<
    string | null
  >(null);

  // Add / Edit Employee Salary Profile form
  const [employeeMemberId, setEmployeeMemberId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [currency, setCurrency] = useState<FinanceV2Currency>('INR');
  const [baseSalary, setBaseSalary] = useState('');
  const [workingDays, setWorkingDays] = useState('26');
  const [paidLeaves, setPaidLeaves] = useState('2');
  const [payDay, setPayDay] = useState('28');
  const [payTiming, setPayTiming] = useState<'SAME_MONTH' | 'FOLLOWING_MONTH'>(
    'SAME_MONTH',
  );
  const [payTimingTouched, setPayTimingTouched] = useState(false);
  const [profileStartMonth, setProfileStartMonth] = useState(data.payrollMonth);
  const [fundingAccountId, setFundingAccountId] = useState('');
  const [profileActive, setProfileActive] = useState(true);

  // Log Attendance / Bonus entry form (synced to selected payrollMonth)
  const [entryProfileId, setEntryProfileId] = useState('');
  const [entryKind, setEntryKind] = useState<
    'LEAVE' | 'SWAP_COMP_OFF' | 'OVERTIME' | 'BONUS'
  >('LEAVE');
  const [entryDays, setEntryDays] = useState('1');
  const [bonusAmount, setBonusAmount] = useState('');
  const [eventDate, setEventDate] = useState(() =>
    defaultEventDateForMonth(data.payrollMonth, data.today),
  );
  const [swappedWorkDate, setSwappedWorkDate] = useState('');
  const [entryNote, setEntryNote] = useState('');

  const exchangeRates = data.profile.exchangeRates;
  const profileById = new Map(
    data.payrollProfiles.map((prof) => [prof.id, prof]),
  );

  const activeHeadcount = data.payrollProfiles.filter((p) => p.active).length;
  const pausedHeadcount = data.payrollProfiles.length - activeHeadcount;

  const cashOriginalByCurrency = new Map<FinanceV2Currency, bigint>();
  for (const cash of data.balanceSheet.cashByCurrency) {
    cashOriginalByCurrency.set(
      cash.currency,
      (cashOriginalByCurrency.get(cash.currency) ?? 0n) +
        BigInt(cash.originalMicros),
    );
  }

  let unifiedBaseTotal = 0n;
  let unifiedDeductionTotal = 0n;
  let unifiedOvertimeTotal = 0n;
  let unifiedBonusTotal = 0n;
  let unifiedNetTotal = 0n;
  let unifiedNetTotalAed = 0n;

  const nativeByCurrency = new Map<
    FinanceV2Currency,
    { count: number; netMicros: bigint; unifiedMicros: bigint }
  >();
  const payrollCurrencies: FinanceV2Currency[] = [];

  for (const row of data.payrollSummaries) {
    const prof = profileById.get(row.profileId);
    if (prof && !prof.active) continue;
    payrollCurrencies.push(row.currency);

    const rowBaseUnified = BigInt(
      convertCurrencyMicros(
        row.baseSalaryMicros,
        row.currency,
        displayCurrency,
        exchangeRates,
      ),
    );
    const rowDeductionUnified = BigInt(
      convertCurrencyMicros(
        row.unpaidLeaveDeductionMicros,
        row.currency,
        displayCurrency,
        exchangeRates,
      ),
    );
    const rowOvertimeUnified = BigInt(
      convertCurrencyMicros(
        row.overtimePayMicros,
        row.currency,
        displayCurrency,
        exchangeRates,
      ),
    );
    const rowBonusUnified = BigInt(
      convertCurrencyMicros(
        row.bonusTotalMicros,
        row.currency,
        displayCurrency,
        exchangeRates,
      ),
    );
    const rowNetUnified = BigInt(
      convertCurrencyMicros(
        row.netPayableMicros,
        row.currency,
        displayCurrency,
        exchangeRates,
      ),
    );
    const rowNetAed = BigInt(
      convertCurrencyMicros(
        row.netPayableMicros,
        row.currency,
        'AED',
        exchangeRates,
      ),
    );

    unifiedBaseTotal += rowBaseUnified;
    unifiedDeductionTotal += rowDeductionUnified;
    unifiedOvertimeTotal += rowOvertimeUnified;
    unifiedBonusTotal += rowBonusUnified;
    unifiedNetTotal += rowNetUnified;
    unifiedNetTotalAed += rowNetAed;

    const bucket = nativeByCurrency.get(row.currency) ?? {
      count: 0,
      netMicros: 0n,
      unifiedMicros: 0n,
    };
    bucket.count += 1;
    bucket.netMicros += BigInt(row.netPayableMicros);
    bucket.unifiedMicros += rowNetUnified;
    nativeByCurrency.set(row.currency, bucket);
  }

  const nativeReadinessRows = [...nativeByCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, bucket]) => {
      const cashOnHand = cashOriginalByCurrency.get(code) ?? 0n;
      const shortfall =
        bucket.netMicros > cashOnHand ? bucket.netMicros - cashOnHand : 0n;
      return {
        currency: code,
        count: bucket.count,
        netMicros: bucket.netMicros.toString(),
        unifiedMicros: bucket.unifiedMicros.toString(),
        cashOnHandMicros: cashOnHand.toString(),
        shortfallMicros: shortfall.toString(),
        isCovered: shortfall === 0n,
      };
    });

  const fxNote = buildExchangeRateNote(
    payrollCurrencies,
    displayCurrency,
    exchangeRates,
  );
  const payrollMonthRevenueAed =
    data.analytics?.payrollMonthRevenueAedMicros ?? '0';
  const payrollToRevenuePct = formatRatioPercent(
    unifiedNetTotalAed,
    payrollMonthRevenueAed,
  );
  const payrollMonthRevenueDisplay = convertAedMicrosToDisplay(
    payrollMonthRevenueAed,
    displayCurrency,
    exchangeRates,
  );
  const hasForeignPayrollCurrency = payrollCurrencies.some(
    (code) => code !== displayCurrency,
  );
  const formatUnified = (micros: string | bigint): string =>
    formatFinanceAmountMicros(
      hasForeignPayrollCurrency
        ? roundMicrosToCents(micros)
        : micros.toString(),
      displayCurrency,
    );

  const selectMonth = (nextMonth: string) => {
    setConfirmingPostProfileId(null);
    setConfirmingDeleteEntryId(null);
    setEntryFormError('');
    setMonthInput(nextMonth);
    setEventDate(defaultEventDateForMonth(nextMonth, data.today));
    onChangePayrollMonth(nextMonth);
  };

  const fundingOptions = data.accounts.filter(
    (account) =>
      account.active &&
      (account.subType === 'PERSON_LIABILITY' ||
        (account.subType === 'CASH_CURRENCY' && account.currency === currency)),
  );
  const resolvedFundingId =
    fundingOptions.find((a) => a.id === fundingAccountId)?.id ??
    fundingOptions[0]?.id ??
    '';

  const resolvedEntryProfileId =
    data.payrollProfiles.find((p) => p.id === entryProfileId)?.id ??
    data.payrollProfiles[0]?.id ??
    '';
  const activeEntryProfile = data.payrollProfiles.find(
    (p) => p.id === resolvedEntryProfileId,
  );

  const editingProfileInTable =
    showEmployeeForm &&
    editingProfileId !== null &&
    data.payrollSummaries.some((row) => row.profileId === editingProfileId);

  const attachInlineEditor = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || editingProfileId === null) return;
      node.scrollIntoView?.({
        block: 'nearest',
        behavior: 'smooth',
      });
      node
        .querySelector<HTMLInputElement>('input[name="baseSalary"]')
        ?.focus({ preventScroll: true });
    },
    [editingProfileId],
  );

  const closeProfileForm = () => {
    setProfileFormError('');
    setEditingProfileId(null);
    setShowEmployeeForm(false);
  };

  const openNewProfile = () => {
    setProfileFormError('');
    setConfirmingPostProfileId(null);
    const wasEditing = editingProfileId !== null;
    setEditingProfileId(null);
    setEmployeeMemberId('');
    setEmployeeName('');
    setRoleLabel('');
    setCurrency('INR');
    setBaseSalary('');
    setWorkingDays('26');
    setPaidLeaves('2');
    setPayDay('28');
    setPayTiming('SAME_MONTH');
    setPayTimingTouched(false);
    setProfileStartMonth(data.payrollMonth);
    setFundingAccountId('');
    setProfileActive(true);
    setShowEmployeeForm((prev) => (wasEditing ? true : !prev));
  };

  const openEditProfile = (prof: FinanceV2PayrollProfile) => {
    setProfileFormError('');
    setConfirmingPostProfileId(null);
    if (showEmployeeForm && editingProfileId === prof.id) {
      closeProfileForm();
      return;
    }
    setEditingProfileId(prof.id);
    setEmployeeMemberId(prof.employeeMemberId ?? '');
    setEmployeeName(prof.employeeName);
    setRoleLabel(prof.roleLabel);
    setCurrency(prof.currency);
    setBaseSalary(financeAmountMicrosToDecimal(prof.baseSalaryMicros));
    setWorkingDays(String(prof.workingDaysPerMonth));
    setPaidLeaves(String(prof.paidLeavesPerMonth));
    setPayDay(String(prof.payDayOfMonth));
    setPayTiming(
      prof.payTiming ??
        (prof.payDayOfMonth <= 10 ? 'FOLLOWING_MONTH' : 'SAME_MONTH'),
    );
    setPayTimingTouched(true);
    setProfileStartMonth(prof.startMonth ?? data.payrollMonth);
    setFundingAccountId(prof.fundingAccountId);
    setProfileActive(prof.active);
    setShowEmployeeForm(true);
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileFormError('');
    const micros = parseMoney(baseSalary);
    const parsedWorkingDays = Number.parseInt(workingDays, 10);
    const parsedPaidLeaves = Number.parseInt(paidLeaves, 10);
    const parsedPayDay = Number.parseInt(payDay, 10);
    if (!employeeName.trim()) {
      setProfileFormError(t`Enter the employee's name.`);
      return;
    }
    if (
      !micros ||
      BigInt(micros) <= 0n ||
      !isFinanceAmountMicrosWithinLimit(micros)
    ) {
      setProfileFormError(t`Enter a valid positive base salary.`);
      return;
    }
    if (
      !Number.isInteger(parsedWorkingDays) ||
      parsedWorkingDays < 1 ||
      parsedWorkingDays > 31
    ) {
      setProfileFormError(t`Working days divisor must be between 1 and 31.`);
      return;
    }
    if (
      !Number.isInteger(parsedPaidLeaves) ||
      parsedPaidLeaves < 0 ||
      parsedPaidLeaves > 31
    ) {
      setProfileFormError(t`Paid leaves per month must be between 0 and 31.`);
      return;
    }
    if (parsedPaidLeaves > parsedWorkingDays) {
      setProfileFormError(
        t`Paid leaves per month cannot exceed working days per month.`,
      );
      return;
    }
    if (
      !Number.isInteger(parsedPayDay) ||
      parsedPayDay < 1 ||
      parsedPayDay > 31
    ) {
      setProfileFormError(t`Payday must be between 1 and 31.`);
      return;
    }
    if (!isValidYearMonth(profileStartMonth.trim())) {
      setProfileFormError(t`Enter a valid start month (YYYY-MM).`);
      return;
    }
    if (!resolvedFundingId) {
      setProfileFormError(t`Select a Charged From account.`);
      return;
    }
    const res = await onRunCommand({
      action: 'savePayrollProfile',
      ...(editingProfileId !== null ? { id: editingProfileId } : {}),
      employeeMemberId: employeeMemberId || null,
      employeeName: employeeName.trim(),
      roleLabel: roleLabel.trim(),
      currency,
      baseSalaryMicros: micros,
      workingDaysPerMonth: parsedWorkingDays,
      paidLeavesPerMonth: parsedPaidLeaves,
      payDayOfMonth: parsedPayDay,
      payTiming,
      fundingAccountId: resolvedFundingId,
      startMonth: profileStartMonth.trim(),
      active: profileActive,
    });
    if (res) {
      setEditingProfileId(null);
      setEmployeeName('');
      setBaseSalary('');
      setShowEmployeeForm(false);
    }
  };

  const renderProfileFormContent = () => (
    <form onSubmit={(event) => void handleSaveProfile(event)}>
      <StyledFinanceV2Stack>
        <StyledFinanceV2HeaderRow>
          <h3>
            {editingProfileId !== null
              ? t`Edit Employee Salary Profile`
              : t`Add Employee Salary Profile`}
          </h3>
        </StyledFinanceV2HeaderRow>
        {profileFormError && (
          <StyledFinanceV2Notice data-tone="danger" role="alert">
            {profileFormError}
          </StyledFinanceV2Notice>
        )}
        <StyledFinanceV2FormGrid>
          <label>
            <Trans>Team member (optional link)</Trans>
            <select
              value={employeeMemberId}
              onChange={(e) => {
                const id = e.target.value;
                setEmployeeMemberId(id);
                const member = data.members.find((m) => m.id === id);
                if (member) setEmployeeName(member.name);
              }}
            >
              <option value="">{t`Custom / External staff`}</option>
              {data.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Trans>Employee name</Trans>
            <input
              value={employeeName}
              placeholder={t`e.g. Arjun`}
              onChange={(e) => setEmployeeName(e.target.value)}
            />
          </label>
          <label>
            <Trans>Role</Trans>
            <input
              value={roleLabel}
              placeholder={t`e.g. Video Editor`}
              onChange={(e) => setRoleLabel(e.target.value)}
            />
          </label>
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
            {t`Monthly Base Salary (${currency})`}
            <input
              name="baseSalary"
              value={baseSalary}
              placeholder="15000"
              onChange={(e) => setBaseSalary(e.target.value)}
            />
          </label>
          <label>
            <Trans>Working days divisor</Trans>
            <input
              type="number"
              min={1}
              max={31}
              value={workingDays}
              onChange={(e) => setWorkingDays(e.target.value)}
            />
          </label>
          <label>
            <Trans>Internal paid leaves / month</Trans>
            <input
              type="number"
              min={0}
              max={31}
              value={paidLeaves}
              onChange={(e) => setPaidLeaves(e.target.value)}
            />
          </label>
          <label>
            <Trans>Payday (day of month, e.g. 28)</Trans>
            <input
              type="number"
              min={1}
              max={31}
              value={payDay}
              onChange={(e) => {
                const nextDay = e.target.value;
                setPayDay(nextDay);
                if (!payTimingTouched) {
                  const parsed = Number.parseInt(nextDay, 10);
                  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 31) {
                    setPayTiming(
                      parsed <= 10 ? 'FOLLOWING_MONTH' : 'SAME_MONTH',
                    );
                  }
                }
              }}
            />
          </label>
          <label>
            <Trans>Pay timing</Trans>
            <select
              aria-label={t`Pay timing`}
              value={payTiming}
              onChange={(e) => {
                setPayTiming(
                  e.target.value as 'SAME_MONTH' | 'FOLLOWING_MONTH',
                );
                setPayTimingTouched(true);
              }}
            >
              <option value="SAME_MONTH">{t`Same month (paid in the month worked)`}</option>
              <option value="FOLLOWING_MONTH">
                {t`Following month (paid in arrears next month)`}
              </option>
            </select>
          </label>
          <label>
            <Trans>Start month</Trans>
            <input
              aria-label={t`Payroll start month`}
              type="month"
              value={profileStartMonth}
              onChange={(e) => setProfileStartMonth(e.target.value)}
            />
          </label>
          <label>
            <Trans>Charged From</Trans>
            <select
              value={resolvedFundingId}
              onChange={(e) => setFundingAccountId(e.target.value)}
            >
              {fundingOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          {editingProfileId !== null && (
            <label>
              <input
                type="checkbox"
                checked={profileActive}
                onChange={(e) => setProfileActive(e.target.checked)}
              />
              <Trans>Active (auto-posts monthly base salary)</Trans>
            </label>
          )}
        </StyledFinanceV2FormGrid>
        <StyledFinanceV2ActionGroup>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={busy}
          >
            {editingProfileId !== null
              ? t`Update Salary Profile`
              : t`Save Salary & Link Recurring Expense`}
          </StyledDeliveryButton>
          <StyledDeliveryButton type="button" onClick={closeProfileForm}>
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledFinanceV2ActionGroup>
      </StyledFinanceV2Stack>
    </form>
  );

  return (
    <StyledFinanceV2Stack>
      <StyledFinanceV2Panel>
        <StyledFinanceV2HeaderRow>
          <div>
            <h2>
              <Trans>Payroll (Admin Only)</Trans>
            </h2>
            <small>
              <Trans>
                Base salaries automatically link to Recurring Expenses. Leaves,
                Sunday swaps, overtime (Base ÷ working days), and bonuses post
                to Day-to-Day Expenses on payday.
              </Trans>
            </small>
          </div>
          <StyledFinanceV2ActionGroup>
            <StyledDeliveryButton
              type="button"
              aria-label={t`Previous payroll month`}
              onClick={() => selectMonth(shiftYearMonth(data.payrollMonth, -1))}
            >
              ←
            </StyledDeliveryButton>
            <label>
              <Trans>Payroll month</Trans>
              <input
                type="month"
                value={monthInput}
                onChange={(e) => {
                  setMonthInput(e.target.value);
                  if (isValidYearMonth(e.target.value)) {
                    selectMonth(e.target.value);
                  }
                }}
              />
            </label>
            <StyledDeliveryButton
              type="button"
              aria-label={t`Next payroll month`}
              onClick={() => selectMonth(shiftYearMonth(data.payrollMonth, 1))}
            >
              →
            </StyledDeliveryButton>
            <label>
              <Trans>Display currency</Trans>
              <select
                aria-label={t`Payroll display currency`}
                value={displayCurrency}
                onChange={(e) =>
                  onChangeDisplayCurrency(e.target.value as FinanceV2Currency)
                }
              >
                {FINANCE_V2_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            {data.canManage && (
              <StyledDeliveryButton
                data-primary="true"
                onClick={openNewProfile}
              >
                <Trans>+ Add Employee Salary</Trans>
              </StyledDeliveryButton>
            )}
          </StyledFinanceV2ActionGroup>
        </StyledFinanceV2HeaderRow>
        <StyledFinanceV2Notice>
          <Trans>
            Internal rule: 2 paid leaves/month (resets monthly, strictly hidden
            from employees). Working a Sunday and taking a weekday off? Log 1
            Leave + 1 Day Swap so it cancels out cleanly without reducing salary
            or consuming paid leaves.
          </Trans>
        </StyledFinanceV2Notice>
      </StyledFinanceV2Panel>

      {data.payrollSummaries.length > 0 && (
        <>
          <StyledFinanceV2HeroGrid>
            <StyledFinanceV2StatCard data-highlight="true">
              <small>
                {t`Total Net Payroll (${displayCurrency}) · ${data.payrollMonth}`}
              </small>
              <strong>{formatUnified(unifiedNetTotal)}</strong>
              <p>
                {payrollToRevenuePct !== null
                  ? t`${payrollToRevenuePct}% of ${data.payrollMonth} paid revenue (${formatFinanceAmountMicros(payrollMonthRevenueDisplay, displayCurrency)})`
                  : t`No paid revenue recorded in ${data.payrollMonth}`}
              </p>
            </StyledFinanceV2StatCard>

            <StyledFinanceV2StatCard>
              <small>{t`Total Base Salaries (${displayCurrency})`}</small>
              <strong>{formatUnified(unifiedBaseTotal)}</strong>
              <p>
                {pausedHeadcount > 0
                  ? t`${activeHeadcount} active · ${pausedHeadcount} paused excluded`
                  : t`${activeHeadcount} active team member(s)`}
              </p>
            </StyledFinanceV2StatCard>

            <StyledFinanceV2StatCard>
              <small>{t`Leave Deductions (${displayCurrency})`}</small>
              <strong>
                {unifiedDeductionTotal > 0n
                  ? `-${formatUnified(unifiedDeductionTotal)}`
                  : formatFinanceAmountMicros('0', displayCurrency)}
              </strong>
              <p>
                <Trans>Unpaid leaves above monthly allowance</Trans>
              </p>
            </StyledFinanceV2StatCard>

            <StyledFinanceV2StatCard>
              <small>{t`Overtime & Bonuses (${displayCurrency})`}</small>
              <strong>
                {formatUnified(unifiedOvertimeTotal + unifiedBonusTotal)}
              </strong>
              <p>
                {t`OT ${formatUnified(unifiedOvertimeTotal)} · Bonus ${formatUnified(unifiedBonusTotal)}`}
              </p>
            </StyledFinanceV2StatCard>
          </StyledFinanceV2HeroGrid>

          {nativeReadinessRows.length > 0 && (
            <StyledFinanceV2Panel>
              <StyledFinanceV2HeaderRow>
                <div>
                  <h3>
                    <Trans>
                      Native Currency Breakdown &amp; Cash Readiness
                    </Trans>
                  </h3>
                  <small>
                    {hasForeignPayrollCurrency && fxNote
                      ? t`Converted to ${displayCurrency} using workspace rates · ${fxNote}`
                      : t`All active salaries are in ${displayCurrency}.`}
                  </small>
                </div>
                <StyledFinanceV2Pill data-tone="info">
                  {t`Unified total: ${formatUnified(unifiedNetTotal)}`}
                </StyledFinanceV2Pill>
              </StyledFinanceV2HeaderRow>
              <StyledFinanceV2ReadinessGrid>
                {nativeReadinessRows.map((item) => (
                  <StyledFinanceV2ReadinessCard key={item.currency}>
                    <StyledFinanceV2HeaderRow>
                      <strong>
                        {item.currency} ({item.count})
                      </strong>
                      <StyledFinanceV2Pill
                        data-tone={item.isCovered ? 'success' : 'danger'}
                      >
                        {item.isCovered
                          ? t`Cash covered`
                          : t`Shortfall ${formatFinanceAmountMicros(item.shortfallMicros, item.currency)}`}
                      </StyledFinanceV2Pill>
                    </StyledFinanceV2HeaderRow>
                    <div>
                      <small>{t`Payroll due:`} </small>
                      <strong>
                        {formatFinanceAmountMicros(
                          item.netMicros,
                          item.currency,
                        )}
                      </strong>
                      {item.currency !== displayCurrency && (
                        <div>
                          <small>
                            ≈{' '}
                            {formatFinanceAmountMicros(
                              roundMicrosToCents(item.unifiedMicros),
                              displayCurrency,
                            )}
                          </small>
                        </div>
                      )}
                    </div>
                    <small>
                      {t`Cash on hand (${item.currency}) as of ${data.balanceSheet.asOfDate}: ${formatFinanceAmountMicros(item.cashOnHandMicros, item.currency)}`}
                    </small>
                  </StyledFinanceV2ReadinessCard>
                ))}
              </StyledFinanceV2ReadinessGrid>
            </StyledFinanceV2Panel>
          )}
        </>
      )}

      {showEmployeeForm && !editingProfileInTable && (
        <StyledFinanceV2Panel>
          {renderProfileFormContent()}
        </StyledFinanceV2Panel>
      )}

      <StyledFinanceV2Panel>
        <StyledFinanceV2HeaderRow>
          <h3>{t`Monthly Payroll Summary — ${data.payrollMonth}`}</h3>
          {data.payrollSummaries.length > 0 && (
            <StyledFinanceV2ActionGroup>
              <input
                type="search"
                aria-label={t`Search employees`}
                placeholder={t`Search employee or role…`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                aria-label={t`Filter payroll by currency`}
                value={currencyFilter}
                onChange={(e) =>
                  setCurrencyFilter(e.target.value as FinanceV2Currency | 'ALL')
                }
              >
                <option value="ALL">{t`All currencies`}</option>
                {FINANCE_V2_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <StyledFinanceV2Pill data-tone="info">
                {t`Totals shown in ${displayCurrency}`}
              </StyledFinanceV2Pill>
            </StyledFinanceV2ActionGroup>
          )}
        </StyledFinanceV2HeaderRow>
        {data.payrollSummaries.length === 0 ? (
          <p>
            <Trans>
              No employees added to Payroll yet. Add an employee salary above to
              link it with Recurring Expenses and start tracking overtime,
              leaves, and bonuses.
            </Trans>
          </p>
        ) : (
          (() => {
            const queryLower = searchQuery.trim().toLowerCase();
            const filteredSummaries = data.payrollSummaries.filter((row) => {
              if (currencyFilter !== 'ALL' && row.currency !== currencyFilter) {
                return false;
              }
              if (!queryLower) return true;
              const prof = profileById.get(row.profileId);
              return (
                row.employeeName.toLowerCase().includes(queryLower) ||
                (prof?.roleLabel ?? '').toLowerCase().includes(queryLower) ||
                (prof?.fundingAccountName ?? '')
                  .toLowerCase()
                  .includes(queryLower)
              );
            });
            return filteredSummaries.length === 0 ? (
              <p>
                <Trans>No employees match the current search or filter.</Trans>
              </p>
            ) : (
              <StyledFinanceV2TableWrap>
                <StyledFinanceV2Table>
                  <thead>
                    <tr>
                      <th>
                        <Trans>Employee</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Base Salary</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Per Day</Trans>
                      </th>
                      <th>
                        <Trans>Leaves / Swaps</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Leave Deduction</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Overtime</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Bonus</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Net Payable</Trans>
                      </th>
                      <th>
                        <Trans>Actions</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSummaries.map((row) => {
                      const prof = profileById.get(row.profileId);
                      const isEditingThisRow =
                        editingProfileInTable &&
                        editingProfileId === row.profileId;
                      const isConfirmingPost =
                        confirmingPostProfileId === row.profileId;
                      const convertedNet =
                        row.currency !== displayCurrency
                          ? convertCurrencyMicros(
                              row.netPayableMicros,
                              row.currency,
                              displayCurrency,
                              exchangeRates,
                            )
                          : null;
                      return (
                        <Fragment key={row.profileId}>
                          <tr>
                            <td>
                              <strong>{row.employeeName}</strong>
                              {prof && (
                                <div>
                                  <small>
                                    {prof.roleLabel
                                      ? `${prof.roleLabel} · `
                                      : ''}
                                    {t`Payday ${prof.payDayOfMonth} · ${prof.fundingAccountName}`}
                                    {!prof.active ? ` · ${t`Paused`}` : ''}
                                  </small>
                                </div>
                              )}
                            </td>
                            <td data-numeric="true">
                              {formatFinanceAmountMicros(
                                row.baseSalaryMicros,
                                row.currency,
                              )}
                            </td>
                            <td data-numeric="true">
                              {formatFinanceAmountMicros(
                                row.perDayMicros,
                                row.currency,
                              )}
                              <div>
                                <small>÷{row.workingDaysPerMonth}d</small>
                              </div>
                            </td>
                            <td>
                              <div>
                                {t`Taken: ${row.leavesTakenDays}d · Swaps: ${row.swapsDays}d`}
                              </div>
                              <small>
                                {t`Paid left: ${row.paidLeavesRemainingDays}/${row.paidLeavesPerMonth}d · Unpaid: ${row.unpaidLeaveDays}d`}
                              </small>
                            </td>
                            <td data-numeric="true">
                              {row.unpaidLeaveDeductionMicros !== '0'
                                ? `-${formatFinanceAmountMicros(row.unpaidLeaveDeductionMicros, row.currency)}`
                                : '—'}
                            </td>
                            <td data-numeric="true">
                              {row.overtimePayMicros !== '0'
                                ? `+${formatFinanceAmountMicros(row.overtimePayMicros, row.currency)} (${row.overtimeDays}d)`
                                : '—'}
                            </td>
                            <td data-numeric="true">
                              {row.bonusTotalMicros !== '0'
                                ? `+${formatFinanceAmountMicros(row.bonusTotalMicros, row.currency)}`
                                : '—'}
                            </td>
                            <td data-numeric="true">
                              <strong>
                                {formatFinanceAmountMicros(
                                  row.netPayableMicros,
                                  row.currency,
                                )}
                              </strong>
                              {convertedNet !== null && (
                                <div>
                                  <small>
                                    ≈{' '}
                                    {formatFinanceAmountMicros(
                                      roundMicrosToCents(convertedNet),
                                      displayCurrency,
                                    )}
                                  </small>
                                </div>
                              )}
                            </td>
                            <td>
                              {data.canManage && (
                                <StyledFinanceV2ActionGroup>
                                  {prof && (
                                    <StyledDeliveryButton
                                      type="button"
                                      disabled={busy}
                                      onClick={() => openEditProfile(prof)}
                                    >
                                      {isEditingThisRow ? (
                                        <Trans>Close</Trans>
                                      ) : (
                                        <Trans>Edit</Trans>
                                      )}
                                    </StyledDeliveryButton>
                                  )}
                                  <StyledDeliveryButton
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      closeProfileForm();
                                      setConfirmingPostProfileId((prev) =>
                                        prev === row.profileId
                                          ? null
                                          : row.profileId,
                                      );
                                    }}
                                  >
                                    <Trans>Post to Expenses</Trans>
                                  </StyledDeliveryButton>
                                </StyledFinanceV2ActionGroup>
                              )}
                            </td>
                          </tr>
                          {isEditingThisRow && (
                            <tr>
                              <td colSpan={9}>
                                <StyledFinanceV2InlineEditor
                                  ref={attachInlineEditor}
                                >
                                  {renderProfileFormContent()}
                                </StyledFinanceV2InlineEditor>
                              </td>
                            </tr>
                          )}
                          {isConfirmingPost && (
                            <tr>
                              <td colSpan={9}>
                                <StyledFinanceV2InlineEditor>
                                  <p>
                                    {t`Post or re-sync ${row.employeeName}'s ${data.payrollMonth} payroll adjustments (leave deduction, overtime, bonus) to Expenses? Any previously posted adjustments for this month will be voided and reposted.`}
                                  </p>
                                  <StyledFinanceV2ActionGroup>
                                    <StyledDeliveryButton
                                      type="button"
                                      data-primary="true"
                                      disabled={busy}
                                      onClick={async () => {
                                        const res = await onRunCommand({
                                          action: 'postPayrollAdjustments',
                                          profileId: row.profileId,
                                          month: data.payrollMonth,
                                          forceResync: true,
                                        });
                                        if (res) {
                                          setConfirmingPostProfileId(null);
                                        }
                                      }}
                                    >
                                      <Trans>Confirm Post to Expenses</Trans>
                                    </StyledDeliveryButton>
                                    <StyledDeliveryButton
                                      type="button"
                                      onClick={() =>
                                        setConfirmingPostProfileId(null)
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
                  <tfoot>
                    <tr>
                      <td>
                        {t`Active Total (${displayCurrency})`}
                        {pausedHeadcount > 0
                          ? ` · ${t`${activeHeadcount} active`}`
                          : ''}
                      </td>
                      <td data-numeric="true">
                        {formatUnified(unifiedBaseTotal)}
                      </td>
                      <td data-numeric="true">—</td>
                      <td>—</td>
                      <td data-numeric="true">
                        {unifiedDeductionTotal > 0n
                          ? `-${formatUnified(unifiedDeductionTotal)}`
                          : '—'}
                      </td>
                      <td data-numeric="true">
                        {unifiedOvertimeTotal > 0n
                          ? `+${formatUnified(unifiedOvertimeTotal)}`
                          : '—'}
                      </td>
                      <td data-numeric="true">
                        {unifiedBonusTotal > 0n
                          ? `+${formatUnified(unifiedBonusTotal)}`
                          : '—'}
                      </td>
                      <td data-numeric="true">
                        {formatUnified(unifiedNetTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </StyledFinanceV2Table>
              </StyledFinanceV2TableWrap>
            );
          })()
        )}
      </StyledFinanceV2Panel>

      {data.canManage && data.payrollProfiles.length > 0 && (
        <StyledFinanceV2Panel>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setEntryFormError('');
              if (!resolvedEntryProfileId) {
                setEntryFormError(t`Select an employee.`);
                return;
              }
              if (eventDate.slice(0, 7) !== data.payrollMonth) {
                setEntryFormError(
                  t`Choose a date inside ${data.payrollMonth}.`,
                );
                return;
              }
              const bonusMicros =
                entryKind === 'BONUS' ? parseMoney(bonusAmount) : null;
              if (
                entryKind === 'BONUS' &&
                (!bonusMicros ||
                  BigInt(bonusMicros) <= 0n ||
                  !isFinanceAmountMicrosWithinLimit(bonusMicros))
              ) {
                setEntryFormError(t`Enter a valid positive bonus amount.`);
                return;
              }
              const trimmedDays = entryDays.trim();
              if (
                entryKind !== 'BONUS' &&
                (!/^\d+(?:\.\d{1,2})?$/.test(trimmedDays) ||
                  Number(trimmedDays) <= 0 ||
                  Number(trimmedDays) > 31)
              ) {
                setEntryFormError(
                  t`Enter a valid positive number of days up to 31 (e.g. 1 or 0.5).`,
                );
                return;
              }
              const res = await onRunCommand({
                action: 'addPayrollEntry',
                profileId: resolvedEntryProfileId,
                month: data.payrollMonth,
                entryKind,
                days: entryKind === 'BONUS' ? null : trimmedDays,
                bonusAmountMicros: bonusMicros,
                eventDate,
                swappedWorkDate:
                  entryKind === 'SWAP_COMP_OFF' && swappedWorkDate
                    ? swappedWorkDate
                    : null,
                note: entryNote,
              });
              if (res) {
                setEntryNote('');
                setBonusAmount('');
                setSwappedWorkDate('');
              }
            }}
          >
            <StyledFinanceV2Stack>
              <h3>
                <Trans>Log Leave, Sunday Swap, Overtime, or Bonus</Trans>
              </h3>
              {entryFormError && (
                <StyledFinanceV2Notice data-tone="danger" role="alert">
                  {entryFormError}
                </StyledFinanceV2Notice>
              )}
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Employee</Trans>
                  <select
                    value={resolvedEntryProfileId}
                    onChange={(e) => setEntryProfileId(e.target.value)}
                  >
                    {data.payrollProfiles.map((prof) => (
                      <option key={prof.id} value={prof.id}>
                        {prof.employeeName} ({prof.currency})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Event type</Trans>
                  <select
                    value={entryKind}
                    onChange={(e) =>
                      setEntryKind(
                        e.target.value as
                          | 'LEAVE'
                          | 'SWAP_COMP_OFF'
                          | 'OVERTIME'
                          | 'BONUS',
                      )
                    }
                  >
                    <option value="LEAVE">{t`Leave day(s) taken`}</option>
                    <option value="SWAP_COMP_OFF">
                      {t`Sunday / Day Swap (cancels leave)`}
                    </option>
                    <option value="OVERTIME">{t`Paid Overtime day(s)`}</option>
                    <option value="BONUS">{t`Bonus`}</option>
                  </select>
                </label>
                {entryKind === 'BONUS' ? (
                  <label>
                    {t`Bonus amount (${activeEntryProfile?.currency ?? 'INR'})`}
                    <input
                      value={bonusAmount}
                      placeholder="2000"
                      onChange={(e) => setBonusAmount(e.target.value)}
                    />
                  </label>
                ) : (
                  <label>
                    <Trans>Days (e.g. 1 or 0.5)</Trans>
                    <input
                      value={entryDays}
                      onChange={(e) => setEntryDays(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  <Trans>Date (within {data.payrollMonth})</Trans>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </label>
                {entryKind === 'SWAP_COMP_OFF' && (
                  <label>
                    <Trans>Sunday / off-day worked</Trans>
                    <input
                      type="date"
                      value={swappedWorkDate}
                      onChange={(e) => setSwappedWorkDate(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  <Trans>Note</Trans>
                  <input
                    value={entryNote}
                    placeholder={t`e.g. Worked Sunday, took Friday off`}
                    onChange={(e) => setEntryNote(e.target.value)}
                  />
                </label>
              </StyledFinanceV2FormGrid>
              <StyledFinanceV2ActionGroup>
                <StyledDeliveryButton
                  type="submit"
                  data-primary="true"
                  disabled={busy}
                >
                  <Trans>Add to {data.payrollMonth} Payroll</Trans>
                </StyledDeliveryButton>
              </StyledFinanceV2ActionGroup>
            </StyledFinanceV2Stack>
          </form>
        </StyledFinanceV2Panel>
      )}

      {data.payrollEntries.length > 0 && (
        <StyledFinanceV2Panel>
          <h3>{t`Logged Events (${data.payrollMonth})`}</h3>
          <StyledFinanceV2TableWrap>
            <StyledFinanceV2Table>
              <thead>
                <tr>
                  <th>
                    <Trans>Date</Trans>
                  </th>
                  <th>
                    <Trans>Employee</Trans>
                  </th>
                  <th>
                    <Trans>Type</Trans>
                  </th>
                  <th>
                    <Trans>Days / Amount</Trans>
                  </th>
                  <th>
                    <Trans>Note</Trans>
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.payrollEntries.map((entry) => {
                  const prof = data.payrollProfiles.find(
                    (p) => p.id === entry.profileId,
                  );
                  const isConfirmingDelete =
                    confirmingDeleteEntryId === entry.id;
                  return (
                    <tr key={entry.id}>
                      <td>{entry.eventDate}</td>
                      <td>{prof?.employeeName ?? '—'}</td>
                      <td>
                        <StyledFinanceV2Pill
                          data-tone={
                            entry.entryKind === 'OVERTIME' ||
                            entry.entryKind === 'BONUS'
                              ? 'success'
                              : entry.entryKind === 'SWAP_COMP_OFF'
                                ? 'info'
                                : 'warning'
                          }
                        >
                          {entry.entryKind.replaceAll('_', ' ')}
                        </StyledFinanceV2Pill>
                      </td>
                      <td>
                        {entry.bonusAmountMicros && prof
                          ? formatFinanceAmountMicros(
                              entry.bonusAmountMicros,
                              prof.currency,
                            )
                          : t`${entry.days ?? '0'} day(s)`}
                      </td>
                      <td>
                        {entry.note}
                        {entry.swappedWorkDate
                          ? ` ${t`(Worked ${entry.swappedWorkDate})`}`
                          : ''}
                      </td>
                      <td>
                        {data.canManage && (
                          <StyledFinanceV2ActionGroup>
                            {isConfirmingDelete ? (
                              <>
                                <StyledDeliveryButton
                                  type="button"
                                  data-primary="true"
                                  disabled={busy}
                                  onClick={async () => {
                                    const res = await onRunCommand({
                                      action: 'deletePayrollEntry',
                                      id: entry.id,
                                    });
                                    if (res) setConfirmingDeleteEntryId(null);
                                  }}
                                >
                                  <Trans>Confirm Remove</Trans>
                                </StyledDeliveryButton>
                                <StyledDeliveryButton
                                  type="button"
                                  onClick={() =>
                                    setConfirmingDeleteEntryId(null)
                                  }
                                >
                                  <Trans>Cancel</Trans>
                                </StyledDeliveryButton>
                              </>
                            ) : (
                              <StyledDeliveryButton
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  setConfirmingDeleteEntryId(entry.id)
                                }
                              >
                                <Trans>Remove</Trans>
                              </StyledDeliveryButton>
                            )}
                          </StyledFinanceV2ActionGroup>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </StyledFinanceV2Table>
          </StyledFinanceV2TableWrap>
        </StyledFinanceV2Panel>
      )}
    </StyledFinanceV2Stack>
  );
};
