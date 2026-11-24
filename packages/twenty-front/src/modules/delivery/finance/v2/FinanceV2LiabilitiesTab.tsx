import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
import {
  financeAmountMicrosToDecimal,
  formatFinanceAmountMicros,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import {
  createFinanceV2RequestId,
  isFinanceV2AmountMicrosWithinLimit,
  isValidPositiveFxRate,
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
  StyledFinanceV2Stack,
  StyledFinanceV2StatCard,
  StyledFinanceV2Table,
  StyledFinanceV2TableWrap,
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

type CardPanelMode =
  | { kind: 'LOAN_IN'; accountId: string; personName: string }
  | { kind: 'REPAY'; accountId: string; personName: string }
  | { kind: 'EDIT'; accountId: string }
  | { kind: 'ARCHIVE'; accountId: string; personName: string }
  | { kind: 'HISTORY'; accountId: string };

const parseMoney = (raw: string): string | null =>
  parseFinanceAmountMicros(raw.replaceAll(',', '').trim());

export const FinanceV2LiabilitiesTab = ({
  data,
  busy,
  onRunCommand,
}: FinanceV2LiabilitiesTabProps) => {
  const { t } = useLingui();
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonEmail, setNewPersonEmail] = useState('');
  const [formError, setFormError] = useState('');

  // Single inline panel state across all person cards
  const [cardPanel, setCardPanel] = useState<CardPanelMode | null>(null);

  // Edit person inline fields
  const [editPersonName, setEditPersonName] = useState('');
  const [editPersonEmail, setEditPersonEmail] = useState('');

  // Loan / Repayment inline fields
  const [actionRequestId, setActionRequestId] = useState(
    createFinanceV2RequestId,
  );
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

  const closeCardPanel = () => {
    setCardPanel(null);
    setFormError('');
    setAmount('');
    setFxRate('');
    setNotes('');
    setActionRequestId(createFinanceV2RequestId());
  };

  const handleAddPerson = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!newPersonName.trim()) {
      setFormError(t`Enter a person's name.`);
      return;
    }
    const res = await onRunCommand({
      action: 'savePersonLiability',
      personName: newPersonName.trim(),
      personEmail: newPersonEmail.trim(),
    });
    if (res) {
      setNewPersonName('');
      setNewPersonEmail('');
    }
  };

  const handleSaveLoanOrRepay = async (
    event: FormEvent,
    mode: { kind: 'LOAN_IN' | 'REPAY'; accountId: string },
  ) => {
    event.preventDefault();
    setFormError('');
    const micros = parseMoney(amount);
    if (
      !micros ||
      BigInt(micros) <= 0n ||
      !isFinanceV2AmountMicrosWithinLimit(micros)
    ) {
      setFormError(t`Enter a valid positive amount.`);
      return;
    }
    const trimmedFx = currency !== 'AED' ? fxRate.trim() : '';
    if (trimmedFx && !isValidPositiveFxRate(trimmedFx)) {
      setFormError(t`Enter a valid positive AED exchange rate.`);
      return;
    }
    const res = await onRunCommand({
      action: mode.kind === 'LOAN_IN' ? 'recordLoanIn' : 'recordLoanRepayment',
      personAccountId: mode.accountId,
      entryDate,
      currency,
      amountMicros: micros,
      ...(trimmedFx ? { fxRateToAed: trimmedFx } : {}),
      notes,
      clientRequestId: actionRequestId,
    });
    if (res) {
      closeCardPanel();
    }
  };

  const handleUpdatePerson = async (
    event: FormEvent,
    accountId: string,
    existingCurrency: FinanceV2Currency | null,
  ) => {
    event.preventDefault();
    setFormError('');
    if (!editPersonName.trim()) {
      setFormError(t`Enter a person's name.`);
      return;
    }
    const res = await onRunCommand({
      action: 'savePersonLiability',
      id: accountId,
      personName: editPersonName.trim(),
      personEmail: editPersonEmail.trim(),
      currency: existingCurrency,
    });
    if (res) {
      closeCardPanel();
    }
  };

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

        {formError && !cardPanel && (
          <StyledFinanceV2Notice data-tone="danger" role="alert">
            {formError}
          </StyledFinanceV2Notice>
        )}

        {data.canManage && (
          <form onSubmit={(event) => void handleAddPerson(event)}>
            <StyledFinanceV2FormGrid>
              <label>
                <Trans>Person name</Trans>
                <input
                  value={newPersonName}
                  placeholder={t`e.g. Hisham or Amna`}
                  onChange={(e) => setNewPersonName(e.target.value)}
                />
              </label>
              <label>
                <Trans>Email (optional)</Trans>
                <input
                  type="email"
                  value={newPersonEmail}
                  placeholder="name@otogrow.com"
                  onChange={(e) => setNewPersonEmail(e.target.value)}
                />
              </label>
              <div style={{ alignSelf: 'end' }}>
                <StyledFinanceV2ActionGroup>
                  <StyledDeliveryButton
                    type="submit"
                    data-primary="true"
                    disabled={busy}
                  >
                    <Trans>+ Add Person</Trans>
                  </StyledDeliveryButton>
                </StyledFinanceV2ActionGroup>
              </div>
            </StyledFinanceV2FormGrid>
          </form>
        )}
      </StyledFinanceV2Panel>

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
            const owedAed = BigInt(bal?.balanceOwedAedMicros ?? '0');
            const isZeroBalance =
              owedAed === 0n &&
              !(bal?.byCurrency ?? []).some(
                (entry) => BigInt(entry.balanceOwedMicros) !== 0n,
              );
            const isPanelForThisPerson = cardPanel?.accountId === person.id;
            const personJournals = data.journals.filter(
              (journal) =>
                journal.fundingAccountId === person.id ||
                (journal.targetAccountId !== undefined
                  ? journal.targetAccountId === person.id
                  : journal.targetAccountName === person.name),
            );

            return (
              <StyledFinanceV2StatCard key={person.id}>
                <small>{t`Owed to ${displayName}`}</small>
                <strong>
                  {formatFinanceAmountMicros(
                    bal?.balanceOwedAedMicros ?? '0',
                    'AED',
                  )}
                </strong>
                {person.personEmail && (
                  <div>
                    <small>{person.personEmail}</small>
                  </div>
                )}
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

                <StyledFinanceV2ActionGroup>
                  {data.canManage && (
                    <>
                      <StyledDeliveryButton
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            isPanelForThisPerson &&
                            cardPanel.kind === 'LOAN_IN'
                          ) {
                            closeCardPanel();
                            return;
                          }
                          setFormError('');
                          setCurrency(person.currency ?? 'AED');
                          setAmount('');
                          setEntryDate(data.today);
                          setFxRate('');
                          setNotes('');
                          setActionRequestId(createFinanceV2RequestId());
                          setCardPanel({
                            kind: 'LOAN_IN',
                            accountId: person.id,
                            personName: displayName,
                          });
                        }}
                      >
                        {isPanelForThisPerson &&
                        cardPanel.kind === 'LOAN_IN' ? (
                          <Trans>Close</Trans>
                        ) : (
                          <Trans>+ Loan In</Trans>
                        )}
                      </StyledDeliveryButton>
                      <StyledDeliveryButton
                        type="button"
                        data-primary="true"
                        disabled={busy}
                        onClick={() => {
                          if (
                            isPanelForThisPerson &&
                            cardPanel.kind === 'REPAY'
                          ) {
                            closeCardPanel();
                            return;
                          }
                          setFormError('');
                          const positiveBucket = bal?.byCurrency.find(
                            (entry) => BigInt(entry.balanceOwedMicros) > 0n,
                          );
                          const defaultCurrency: FinanceV2Currency =
                            positiveBucket?.currency ??
                            (owedAed > 0n ? 'AED' : (person.currency ?? 'AED'));
                          const defaultAmountMicros =
                            positiveBucket?.balanceOwedMicros ??
                            (owedAed > 0n ? owedAed.toString() : '');
                          setCurrency(defaultCurrency);
                          setAmount(
                            defaultAmountMicros
                              ? financeAmountMicrosToDecimal(
                                  defaultAmountMicros,
                                )
                              : '',
                          );
                          setEntryDate(data.today);
                          setFxRate('');
                          setNotes('');
                          setActionRequestId(createFinanceV2RequestId());
                          setCardPanel({
                            kind: 'REPAY',
                            accountId: person.id,
                            personName: displayName,
                          });
                        }}
                      >
                        {isPanelForThisPerson && cardPanel.kind === 'REPAY' ? (
                          <Trans>Close</Trans>
                        ) : (
                          <Trans>Repay</Trans>
                        )}
                      </StyledDeliveryButton>
                      <StyledDeliveryButton
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            isPanelForThisPerson &&
                            cardPanel.kind === 'EDIT'
                          ) {
                            closeCardPanel();
                            return;
                          }
                          setFormError('');
                          setEditPersonName(displayName);
                          setEditPersonEmail(person.personEmail ?? '');
                          setCardPanel({ kind: 'EDIT', accountId: person.id });
                        }}
                      >
                        {isPanelForThisPerson && cardPanel.kind === 'EDIT' ? (
                          <Trans>Close</Trans>
                        ) : (
                          <Trans>Edit</Trans>
                        )}
                      </StyledDeliveryButton>
                    </>
                  )}
                  <StyledDeliveryButton
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        isPanelForThisPerson &&
                        cardPanel.kind === 'HISTORY'
                      ) {
                        closeCardPanel();
                        return;
                      }
                      setFormError('');
                      setCardPanel({ kind: 'HISTORY', accountId: person.id });
                    }}
                  >
                    {isPanelForThisPerson && cardPanel.kind === 'HISTORY'
                      ? t`Hide History`
                      : t`History (${personJournals.length})`}
                  </StyledDeliveryButton>
                  {data.canManage && isZeroBalance && (
                    <StyledDeliveryButton
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          isPanelForThisPerson &&
                          cardPanel.kind === 'ARCHIVE'
                        ) {
                          closeCardPanel();
                          return;
                        }
                        setFormError('');
                        setCardPanel({
                          kind: 'ARCHIVE',
                          accountId: person.id,
                          personName: displayName,
                        });
                      }}
                    >
                      <Trans>Archive</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledFinanceV2ActionGroup>

                {isPanelForThisPerson &&
                  (cardPanel.kind === 'LOAN_IN' ||
                    cardPanel.kind === 'REPAY') && (
                    <StyledFinanceV2InlineEditor>
                      <form
                        onSubmit={(event) =>
                          void handleSaveLoanOrRepay(event, cardPanel)
                        }
                      >
                        <h4>
                          {cardPanel.kind === 'LOAN_IN'
                            ? t`Record Cash Borrowed from ${cardPanel.personName}`
                            : t`Record Repayment to ${cardPanel.personName}`}
                        </h4>
                        {formError && (
                          <StyledFinanceV2Notice
                            data-tone="danger"
                            role="alert"
                          >
                            {formError}
                          </StyledFinanceV2Notice>
                        )}
                        <StyledFinanceV2FormGrid>
                          <label>
                            <Trans>Currency</Trans>
                            <select
                              value={currency}
                              onChange={(e) => {
                                setCurrency(
                                  e.target.value as FinanceV2Currency,
                                );
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
                                placeholder={
                                  data.profile.exchangeRates[currency] ?? '1'
                                }
                                onChange={(e) => setFxRate(e.target.value)}
                              />
                            </label>
                          )}
                          <label>
                            <Trans>Notes</Trans>
                            <input
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                            />
                          </label>
                        </StyledFinanceV2FormGrid>
                        <StyledFinanceV2ActionGroup>
                          <StyledDeliveryButton
                            type="submit"
                            data-primary="true"
                            disabled={busy}
                          >
                            <Trans>Save</Trans>
                          </StyledDeliveryButton>
                          <StyledDeliveryButton
                            type="button"
                            onClick={closeCardPanel}
                          >
                            <Trans>Cancel</Trans>
                          </StyledDeliveryButton>
                        </StyledFinanceV2ActionGroup>
                      </form>
                    </StyledFinanceV2InlineEditor>
                  )}

                {isPanelForThisPerson && cardPanel.kind === 'EDIT' && (
                  <StyledFinanceV2InlineEditor>
                    <form
                      onSubmit={(event) =>
                        void handleUpdatePerson(
                          event,
                          person.id,
                          person.currency,
                        )
                      }
                    >
                      <h4>{t`Edit ${displayName}`}</h4>
                      {formError && (
                        <StyledFinanceV2Notice data-tone="danger" role="alert">
                          {formError}
                        </StyledFinanceV2Notice>
                      )}
                      <StyledFinanceV2FormGrid>
                        <label>
                          <Trans>Person name</Trans>
                          <input
                            value={editPersonName}
                            onChange={(e) => setEditPersonName(e.target.value)}
                          />
                        </label>
                        <label>
                          <Trans>Email (optional)</Trans>
                          <input
                            type="email"
                            value={editPersonEmail}
                            onChange={(e) => setEditPersonEmail(e.target.value)}
                          />
                        </label>
                      </StyledFinanceV2FormGrid>
                      <StyledFinanceV2ActionGroup>
                        <StyledDeliveryButton
                          type="submit"
                          data-primary="true"
                          disabled={busy}
                        >
                          <Trans>Update Person</Trans>
                        </StyledDeliveryButton>
                        <StyledDeliveryButton
                          type="button"
                          onClick={closeCardPanel}
                        >
                          <Trans>Cancel</Trans>
                        </StyledDeliveryButton>
                      </StyledFinanceV2ActionGroup>
                    </form>
                  </StyledFinanceV2InlineEditor>
                )}

                {isPanelForThisPerson && cardPanel.kind === 'ARCHIVE' && (
                  <StyledFinanceV2InlineEditor>
                    <p>
                      {t`Archive ${cardPanel.personName}? They will no longer appear in active payment dropdowns, while historical ledger records stay intact.`}
                    </p>
                    <StyledFinanceV2ActionGroup>
                      <StyledDeliveryButton
                        type="button"
                        data-primary="true"
                        disabled={busy}
                        onClick={async () => {
                          setFormError('');
                          const res = await onRunCommand({
                            action: 'savePersonLiability',
                            id: person.id,
                            personName: displayName,
                            personEmail: person.personEmail ?? '',
                            currency: person.currency,
                            active: false,
                          });
                          if (res) closeCardPanel();
                        }}
                      >
                        <Trans>Confirm Archive</Trans>
                      </StyledDeliveryButton>
                      <StyledDeliveryButton
                        type="button"
                        onClick={closeCardPanel}
                      >
                        <Trans>Cancel</Trans>
                      </StyledDeliveryButton>
                    </StyledFinanceV2ActionGroup>
                  </StyledFinanceV2InlineEditor>
                )}

                {isPanelForThisPerson && cardPanel.kind === 'HISTORY' && (
                  <StyledFinanceV2InlineEditor>
                    <h4>{t`Recent Activity — ${displayName}`}</h4>
                    {personJournals.length === 0 ? (
                      <p>
                        <Trans>
                          No transactions recorded for this person yet.
                        </Trans>
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
                              <th data-numeric="true">
                                <Trans>Amount</Trans>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {personJournals.slice(0, 20).map((entry) => (
                              <tr key={entry.id}>
                                <td>{entry.entryDate}</td>
                                <td>
                                  <strong>{entry.title}</strong>
                                  {entry.notes && (
                                    <div>
                                      <small>{entry.notes}</small>
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <StyledFinanceV2Pill
                                    data-tone={
                                      entry.status === 'VOID'
                                        ? 'neutral'
                                        : entry.entryType === 'LOAN_REPAYMENT'
                                          ? 'success'
                                          : 'info'
                                    }
                                  >
                                    {entry.status === 'VOID'
                                      ? t`VOID`
                                      : entry.entryType.replaceAll('_', ' ')}
                                  </StyledFinanceV2Pill>
                                </td>
                                <td data-numeric="true">
                                  {formatFinanceAmountMicros(
                                    entry.amountMicros,
                                    entry.currency,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </StyledFinanceV2Table>
                      </StyledFinanceV2TableWrap>
                    )}
                  </StyledFinanceV2InlineEditor>
                )}
              </StyledFinanceV2StatCard>
            );
          })}
        </StyledFinanceV2HeroGrid>
      )}
    </StyledFinanceV2Stack>
  );
};
