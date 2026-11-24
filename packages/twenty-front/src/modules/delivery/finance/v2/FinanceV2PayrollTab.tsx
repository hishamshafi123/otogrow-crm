import { Fragment, useCallback, useState } from 'react';
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
  StyledFinanceV2InlineEditor,
  StyledFinanceV2Notice,
  StyledFinanceV2Panel,
  StyledFinanceV2Pill,
  StyledFinanceV2Stack,
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
  onChangePayrollMonth,
  onRunCommand,
}: FinanceV2PayrollTabProps) => {
  const { t } = useLingui();
  const [profileFormError, setProfileFormError] = useState('');
  const [entryFormError, setEntryFormError] = useState('');
  const [monthInput, setMonthInput] = useState(data.payrollMonth);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  // Add / Edit Employee Salary Profile form
  const [employeeMemberId, setEmployeeMemberId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [currency, setCurrency] = useState<FinanceV2Currency>('INR');
  const [baseSalary, setBaseSalary] = useState('');
  const [workingDays, setWorkingDays] = useState('26');
  const [paidLeaves, setPaidLeaves] = useState('2');
  const [payDay, setPayDay] = useState('28');
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
    setFundingAccountId('');
    setProfileActive(true);
    setShowEmployeeForm((prev) => (wasEditing ? true : !prev));
  };

  const openEditProfile = (prof: FinanceV2PayrollProfile) => {
    setProfileFormError('');
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
    setFundingAccountId(prof.fundingAccountId);
    setProfileActive(prof.active);
    setShowEmployeeForm(true);
  };

  const renderProfileFormContent = () => (
    <>
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
            onChange={(e) => setPayDay(e.target.value)}
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
      <StyledDeliveryRow>
        <StyledDeliveryButton
          data-primary="true"
          disabled={busy}
          onClick={async () => {
            setProfileFormError('');
            const micros = parseMoney(baseSalary);
            const parsedWorkingDays = Number.parseInt(workingDays, 10);
            const parsedPaidLeaves = Number.parseInt(paidLeaves, 10);
            const parsedPayDay = Number.parseInt(payDay, 10);
            if (!employeeName.trim()) {
              setProfileFormError(t`Enter the employee's name.`);
              return;
            }
            if (!micros || BigInt(micros) <= 0n) {
              setProfileFormError(t`Enter a valid positive base salary.`);
              return;
            }
            if (
              !Number.isInteger(parsedWorkingDays) ||
              parsedWorkingDays < 1 ||
              parsedWorkingDays > 31
            ) {
              setProfileFormError(
                t`Working days divisor must be between 1 and 31.`,
              );
              return;
            }
            if (
              !Number.isInteger(parsedPaidLeaves) ||
              parsedPaidLeaves < 0 ||
              parsedPaidLeaves > 31
            ) {
              setProfileFormError(
                t`Paid leaves per month must be between 0 and 31.`,
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
              fundingAccountId: resolvedFundingId,
              startMonth: data.payrollMonth,
              active: profileActive,
            });
            if (res) {
              setEditingProfileId(null);
              setEmployeeName('');
              setBaseSalary('');
              setShowEmployeeForm(false);
            }
          }}
        >
          {editingProfileId !== null
            ? t`Update Salary Profile`
            : t`Save Salary & Link Recurring Expense`}
        </StyledDeliveryButton>
        <StyledDeliveryButton type="button" onClick={closeProfileForm}>
          <Trans>Cancel</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
    </>
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
          <StyledDeliveryRow>
            <label>
              <Trans>Payroll month</Trans>
              <input
                type="month"
                value={monthInput}
                onChange={(e) => {
                  setMonthInput(e.target.value);
                  if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                    setEventDate(
                      defaultEventDateForMonth(e.target.value, data.today),
                    );
                    onChangePayrollMonth(e.target.value);
                  }
                }}
              />
            </label>
            {data.canManage && (
              <StyledDeliveryButton
                data-primary="true"
                onClick={openNewProfile}
              >
                <Trans>+ Add Employee Salary</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
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

      {showEmployeeForm && !editingProfileInTable && (
        <StyledFinanceV2Panel>
          {renderProfileFormContent()}
        </StyledFinanceV2Panel>
      )}

      <StyledFinanceV2Panel>
        <h3>{t`Monthly Payroll Summary — ${data.payrollMonth}`}</h3>
        {data.payrollSummaries.length === 0 ? (
          <p>
            <Trans>
              No employees added to Payroll yet. Add an employee salary above to
              link it with Recurring Expenses and start tracking overtime,
              leaves, and bonuses.
            </Trans>
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
                {data.payrollSummaries.map((row) => {
                  const prof = data.payrollProfiles.find(
                    (p) => p.id === row.profileId,
                  );
                  const isEditingThisRow =
                    editingProfileInTable && editingProfileId === row.profileId;
                  return (
                    <Fragment key={row.profileId}>
                      <tr>
                        <td>
                          <strong>{row.employeeName}</strong>
                          {prof && (
                            <div>
                              <small>
                                {prof.roleLabel ? `${prof.roleLabel} · ` : ''}
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
                        </td>
                        <td>
                          {data.canManage && (
                            <StyledDeliveryRow>
                              {prof && (
                                <StyledDeliveryButton
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
                                disabled={busy}
                                onClick={() =>
                                  void onRunCommand({
                                    action: 'postPayrollAdjustments',
                                    profileId: row.profileId,
                                    month: data.payrollMonth,
                                    forceResync: true,
                                  })
                                }
                              >
                                <Trans>Post to Expenses</Trans>
                              </StyledDeliveryButton>
                            </StyledDeliveryRow>
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
                    </Fragment>
                  );
                })}
              </tbody>
            </StyledFinanceV2Table>
          </StyledFinanceV2TableWrap>
        )}
      </StyledFinanceV2Panel>

      {data.canManage && data.payrollProfiles.length > 0 && (
        <StyledFinanceV2Panel>
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
          <div>
            <StyledDeliveryButton
              data-primary="true"
              disabled={busy}
              onClick={async () => {
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
                  (!bonusMicros || BigInt(bonusMicros) <= 0n)
                ) {
                  setEntryFormError(t`Enter a valid positive bonus amount.`);
                  return;
                }
                if (entryKind !== 'BONUS' && !entryDays.trim()) {
                  setEntryFormError(
                    t`Enter the number of days (e.g. 1 or 0.5).`,
                  );
                  return;
                }
                const res = await onRunCommand({
                  action: 'addPayrollEntry',
                  profileId: resolvedEntryProfileId,
                  month: data.payrollMonth,
                  entryKind,
                  days: entryKind === 'BONUS' ? null : entryDays.trim(),
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
              <Trans>Add to {data.payrollMonth} Payroll</Trans>
            </StyledDeliveryButton>
          </div>
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
                          <StyledDeliveryButton
                            disabled={busy}
                            onClick={() =>
                              void onRunCommand({
                                action: 'deletePayrollEntry',
                                id: entry.id,
                              })
                            }
                          >
                            <Trans>Remove</Trans>
                          </StyledDeliveryButton>
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
