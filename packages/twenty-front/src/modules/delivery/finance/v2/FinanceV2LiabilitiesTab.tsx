import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  formatFinanceAmountMicros,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import {
  StyledFinanceV2FormGrid,
  StyledFinanceV2HeaderRow,
  StyledFinanceV2HeroGrid,
  StyledFinanceV2Notice,
  StyledFinanceV2Panel,
  StyledFinanceV2Stack,
  StyledFinanceV2StatCard,
} from '@/delivery/finance/v2/finance-v2.styles';
import {
  FINANCE_V2_CURRENCIES,
  type FinanceV2CommandRunner,
  type FinanceV2Currency,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';

type FinanceV2LiabilitiesTabProps = {
  data: FinanceV2Snapshot;
  busy: boolean;
  onRunCommand: FinanceV2CommandRunner;
};

const parseMoney = (raw: string): string | null =>
  parseFinanceAmountMicros(raw.replaceAll(',', '').trim());

export const FinanceV2LiabilitiesTab = ({
  data,
  busy,
  onRunCommand,
}: FinanceV2LiabilitiesTabProps) => {
  const { t } = useLingui();
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [formError, setFormError] = useState('');

  const [actionMode, setActionMode] = useState<{
    kind: 'LOAN_IN' | 'REPAY';
    accountId: string;
    personName: string;
  } | null>(null);
  const [currency, setCurrency] = useState<FinanceV2Currency>('AED');
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState(data.today);
  const [fxRate, setFxRate] = useState('');
  const [notes, setNotes] = useState('');

  const personAccounts = data.accounts.filter(
    (account) => account.subType === 'PERSON_LIABILITY' && account.active,
  );
  const balanceByAccountId = new Map(
    data.balanceSheet.liabilitiesByPerson.map((item) => [item.accountId, item]),
  );

  return (
    <StyledFinanceV2Stack>
      <StyledFinanceV2Panel>
        <StyledFinanceV2HeaderRow>
          <div>
            <h2>
              <Trans>Liabilities — Money Owed to People</Trans>
            </h2>
            <small>
              <Trans>
                Tracks cash borrowed from founders/people AND any expense or
                asset paid personally by them. Repayments reduce cash and
                liabilities without distorting your Profit &amp; Loss.
              </Trans>
            </small>
          </div>
          <strong>
            {t`Total Owed: ${formatFinanceAmountMicros(data.balanceSheet.totalLiabilitiesAedMicros, 'AED')}`}
          </strong>
        </StyledFinanceV2HeaderRow>

        {formError && (
          <StyledFinanceV2Notice data-tone="danger" role="alert">
            {formError}
          </StyledFinanceV2Notice>
        )}

        {data.canManage && (
          <StyledFinanceV2FormGrid>
            <label>
              <Trans>Person name</Trans>
              <input
                value={personName}
                placeholder={t`e.g. Hisham or Amna`}
                onChange={(e) => setPersonName(e.target.value)}
              />
            </label>
            <label>
              <Trans>Email (optional)</Trans>
              <input
                type="email"
                value={personEmail}
                onChange={(e) => setPersonEmail(e.target.value)}
              />
            </label>
            <div style={{ alignSelf: 'end' }}>
              <StyledDeliveryRow>
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={busy}
                  onClick={async () => {
                    setFormError('');
                    if (!personName.trim()) {
                      setFormError(t`Enter a person's name.`);
                      return;
                    }
                    const res = await onRunCommand({
                      action: 'savePersonLiability',
                      ...(editingPersonId ? { id: editingPersonId } : {}),
                      personName: personName.trim(),
                      personEmail: personEmail.trim(),
                    });
                    if (res) {
                      setEditingPersonId(null);
                      setPersonName('');
                      setPersonEmail('');
                    }
                  }}
                >
                  {editingPersonId ? t`Update Person` : t`+ Add Person`}
                </StyledDeliveryButton>
                {editingPersonId && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => {
                      setEditingPersonId(null);
                      setPersonName('');
                      setPersonEmail('');
                      setFormError('');
                    }}
                  >
                    <Trans>Cancel</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryRow>
            </div>
          </StyledFinanceV2FormGrid>
        )}
      </StyledFinanceV2Panel>

      {actionMode && (
        <StyledFinanceV2Panel>
          <h3>
            {actionMode.kind === 'LOAN_IN'
              ? t`Record Cash Borrowed from ${actionMode.personName}`
              : t`Record Repayment to ${actionMode.personName}`}
          </h3>
          <StyledFinanceV2FormGrid>
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
                placeholder="5000"
                onChange={(e) => setAmount(e.target.value)}
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
              <Trans>Notes</Trans>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </StyledFinanceV2FormGrid>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              data-primary="true"
              disabled={busy}
              onClick={async () => {
                setFormError('');
                const micros = parseMoney(amount);
                if (!micros || BigInt(micros) <= 0n) {
                  setFormError(t`Enter a valid positive amount.`);
                  return;
                }
                const res = await onRunCommand({
                  action:
                    actionMode.kind === 'LOAN_IN'
                      ? 'recordLoanIn'
                      : 'recordLoanRepayment',
                  personAccountId: actionMode.accountId,
                  entryDate,
                  currency,
                  amountMicros: micros,
                  ...(fxRate.trim() ? { fxRateToAed: fxRate.trim() } : {}),
                  notes,
                });
                if (res) {
                  setActionMode(null);
                  setAmount('');
                  setNotes('');
                }
              }}
            >
              <Trans>Save</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton onClick={() => setActionMode(null)}>
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledFinanceV2Panel>
      )}

      {personAccounts.length === 0 ? (
        <StyledFinanceV2Panel>
          <p>
            <Trans>
              No people added yet. Add a person above so you can charge
              recurring/day-to-day expenses to them or record cash loans.
            </Trans>
          </p>
        </StyledFinanceV2Panel>
      ) : (
        <StyledFinanceV2HeroGrid>
          {personAccounts.map((person) => {
            const bal = balanceByAccountId.get(person.id);
            const displayName = person.personName ?? person.name;
            return (
              <StyledFinanceV2StatCard key={person.id}>
                <small>{t`Owed to ${displayName}`}</small>
                <strong>
                  {formatFinanceAmountMicros(
                    bal?.balanceOwedAedMicros ?? '0',
                    'AED',
                  )}
                </strong>
                <p>
                  {t`Borrowed: ${formatFinanceAmountMicros(bal?.totalBorrowedAedMicros ?? '0', 'AED')} · Repaid: ${formatFinanceAmountMicros(bal?.totalRepaidAedMicros ?? '0', 'AED')}`}
                </p>
                {bal && bal.byCurrency.length > 0 && (
                  <p>
                    {bal.byCurrency
                      .map((entry) =>
                        formatFinanceAmountMicros(
                          entry.balanceOwedMicros,
                          entry.currency,
                        ),
                      )
                      .join(' · ')}
                  </p>
                )}
                {data.canManage && (
                  <StyledDeliveryRow>
                    <StyledDeliveryButton
                      disabled={busy}
                      onClick={() => {
                        setFormError('');
                        setActionMode({
                          kind: 'LOAN_IN',
                          accountId: person.id,
                          personName: displayName,
                        });
                        setAmount('');
                      }}
                    >
                      <Trans>+ Loan In</Trans>
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      data-primary="true"
                      disabled={busy}
                      onClick={() => {
                        setFormError('');
                        setActionMode({
                          kind: 'REPAY',
                          accountId: person.id,
                          personName: displayName,
                        });
                        setAmount('');
                      }}
                    >
                      <Trans>Repay</Trans>
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      disabled={busy}
                      onClick={() => {
                        setFormError('');
                        setEditingPersonId(person.id);
                        setPersonName(displayName);
                        setPersonEmail(person.personEmail ?? '');
                      }}
                    >
                      <Trans>Edit</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                )}
              </StyledFinanceV2StatCard>
            );
          })}
        </StyledFinanceV2HeroGrid>
      )}
    </StyledFinanceV2Stack>
  );
};
