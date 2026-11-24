import { useState, type ChangeEvent } from 'react';
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
  StyledFinanceV2LogoPreview,
  StyledFinanceV2Notice,
  StyledFinanceV2Panel,
  StyledFinanceV2SplitGrid,
  StyledFinanceV2Stack,
} from '@/delivery/finance/v2/finance-v2.styles';
import {
  FINANCE_V2_CURRENCIES,
  type FinanceV2CommandRunner,
  type FinanceV2Currency,
  type FinanceV2RateCardItem,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';

type FinanceV2SetupTabProps = {
  data: FinanceV2Snapshot;
  busy: boolean;
  onRunCommand: FinanceV2CommandRunner;
};

const MAX_LOGO_BYTES = 1_000_000;

const parseMoney = (raw: string): string | null =>
  parseFinanceAmountMicros(raw.replaceAll(',', '').trim());

export const FinanceV2SetupTab = ({
  data,
  busy,
  onRunCommand,
}: FinanceV2SetupTabProps) => {
  const { t } = useLingui();
  const { profile } = data;

  const [formError, setFormError] = useState('');
  const [companyName, setCompanyName] = useState(profile.companyName);
  const [legalAddress, setLegalAddress] = useState(profile.legalAddress);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [website, setWebsite] = useState(profile.website);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(
    profile.logoDataUrl,
  );
  const [bankDetails, setBankDetails] = useState(profile.bankDetails);
  const [defaultQuoteTerms, setDefaultQuoteTerms] = useState(
    profile.defaultQuoteTerms,
  );
  const [defaultInvoiceNotes, setDefaultInvoiceNotes] = useState(
    profile.defaultInvoiceNotes,
  );
  const [rateCard, setRateCard] = useState<FinanceV2RateCardItem[]>(
    profile.rateCard,
  );
  const [rateCardDirty, setRateCardDirty] = useState(false);
  const [newRateName, setNewRateName] = useState('');
  const [newRateDesc, setNewRateDesc] = useState('');
  const [newRateAmount, setNewRateAmount] = useState('');
  const [newRateCurrency, setNewRateCurrency] =
    useState<FinanceV2Currency>('USD');

  // Opening balances
  const [openKind, setOpenKind] = useState<
    'CASH' | 'FIXED_ASSET' | 'PERSON_LIABILITY'
  >('CASH');
  const [openTitle, setOpenTitle] = useState('');
  const [openDate, setOpenDate] = useState(data.today);
  const [openCurrency, setOpenCurrency] = useState<FinanceV2Currency>('USD');
  const [openAmount, setOpenAmount] = useState('');
  const [openFxRate, setOpenFxRate] = useState('');
  const [openPersonId, setOpenPersonId] = useState('');

  // FX rates & currency conversion
  const [fxRates, setFxRates] = useState<Record<string, string>>({
    ...profile.exchangeRates,
  });
  const [convFromCurrency, setConvFromCurrency] =
    useState<FinanceV2Currency>('USD');
  const [convFromAmount, setConvFromAmount] = useState('');
  const [convToCurrency, setConvToCurrency] =
    useState<FinanceV2Currency>('AED');
  const [convToAmount, setConvToAmount] = useState('');
  const [convDate, setConvDate] = useState(data.today);

  const personAccounts = data.accounts.filter(
    (account) => account.subType === 'PERSON_LIABILITY' && account.active,
  );

  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    setFormError('');
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setFormError(t`Logo must be a PNG or JPG image.`);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFormError(t`Logo file must be 1 MB or smaller.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const downloadCsv = async (
    dataset: 'LEDGER' | 'PNL' | 'BALANCE_SHEET' | 'DOCUMENTS' | 'PAYROLL',
  ) => {
    const result = await onRunCommand({
      action: 'exportCsv',
      dataset,
      fromDate: data.fromDate,
      toDate: data.toDate,
      asOfDate: data.asOfDate,
      payrollMonth: data.payrollMonth,
    });
    if (!result || typeof result.csv !== 'string') return;
    const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = String(result.filename ?? 'otogrow-export.csv');
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <StyledFinanceV2Stack>
      {formError && (
        <StyledFinanceV2Notice data-tone="danger" role="alert">
          {formError}
        </StyledFinanceV2Notice>
      )}

      <StyledFinanceV2Panel>
        <StyledFinanceV2HeaderRow>
          <div>
            <h2>
              <Trans>Company Branding &amp; PDF Format</Trans>
            </h2>
            <small>
              <Trans>
                Used automatically on every Quote PDF and Invoice PDF. Upload
                your logo and fill in your company &amp; wire details once.
              </Trans>
            </small>
          </div>
          {logoDataUrl && (
            <StyledDeliveryRow>
              <StyledFinanceV2LogoPreview src={logoDataUrl} alt={companyName} />
              {data.canManage && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setLogoDataUrl(null)}
                >
                  <Trans>Remove logo</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          )}
        </StyledFinanceV2HeaderRow>

        <StyledFinanceV2FormGrid>
          <label>
            <Trans>Company legal name</Trans>
            <input
              disabled={!data.canManage}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <label>
            <Trans>Billing email</Trans>
            <input
              disabled={!data.canManage}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <Trans>Phone</Trans>
            <input
              disabled={!data.canManage}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label>
            <Trans>Website</Trans>
            <input
              disabled={!data.canManage}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
          <label>
            <Trans>Upload company logo (PNG / JPG, max 1 MB)</Trans>
            <input
              disabled={!data.canManage}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleLogoUpload}
            />
          </label>
        </StyledFinanceV2FormGrid>

        <StyledFinanceV2FormGrid>
          <label>
            <Trans>Company address</Trans>
            <textarea
              disabled={!data.canManage}
              value={legalAddress}
              onChange={(e) => setLegalAddress(e.target.value)}
            />
          </label>
          <label>
            <Trans>
              Payment / Bank wire instructions (shown on Invoice PDFs)
            </Trans>
            <textarea
              disabled={!data.canManage}
              value={bankDetails}
              onChange={(e) => setBankDetails(e.target.value)}
            />
          </label>
        </StyledFinanceV2FormGrid>

        <StyledFinanceV2FormGrid>
          <label>
            <Trans>Default Quote Terms</Trans>
            <textarea
              disabled={!data.canManage}
              value={defaultQuoteTerms}
              onChange={(e) => setDefaultQuoteTerms(e.target.value)}
            />
          </label>
          <label>
            <Trans>Default Invoice Notes</Trans>
            <textarea
              disabled={!data.canManage}
              value={defaultInvoiceNotes}
              onChange={(e) => setDefaultInvoiceNotes(e.target.value)}
            />
          </label>
        </StyledFinanceV2FormGrid>

        <h4>
          <Trans>
            Saved Service Rate Card (for quick Quotes &amp; Invoices)
          </Trans>
        </h4>
        {rateCardDirty && (
          <StyledFinanceV2Notice>
            <Trans>
              Rate card has unsaved changes — click &ldquo;Save Company Profile
              &amp; PDF Branding&rdquo; below to persist them.
            </Trans>
          </StyledFinanceV2Notice>
        )}
        {rateCard.map((item) => (
          <StyledFinanceV2HeaderRow key={item.id}>
            <span>
              <strong>{item.name}</strong> —{' '}
              {formatFinanceAmountMicros(item.defaultRateMicros, item.currency)}
              {item.description ? ` (${item.description})` : ''}
            </span>
            {data.canManage && (
              <StyledDeliveryButton
                type="button"
                onClick={() => {
                  setRateCard((prev) => prev.filter((r) => r.id !== item.id));
                  setRateCardDirty(true);
                }}
              >
                <Trans>Remove</Trans>
              </StyledDeliveryButton>
            )}
          </StyledFinanceV2HeaderRow>
        ))}

        {data.canManage && (
          <>
            <StyledFinanceV2FormGrid>
              <label>
                <Trans>Service name</Trans>
                <input
                  value={newRateName}
                  placeholder={t`e.g. Performance Ads Management`}
                  onChange={(e) => setNewRateName(e.target.value)}
                />
              </label>
              <label>
                <Trans>Description</Trans>
                <input
                  value={newRateDesc}
                  onChange={(e) => setNewRateDesc(e.target.value)}
                />
              </label>
              <label>
                <Trans>Currency</Trans>
                <select
                  value={newRateCurrency}
                  onChange={(e) =>
                    setNewRateCurrency(e.target.value as FinanceV2Currency)
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
                <Trans>Standard Rate</Trans>
                <input
                  value={newRateAmount}
                  placeholder="2500"
                  onChange={(e) => setNewRateAmount(e.target.value)}
                />
              </label>
              <div style={{ alignSelf: 'end' }}>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => {
                    setFormError('');
                    const micros = parseMoney(newRateAmount);
                    if (!newRateName.trim() || !micros) {
                      setFormError(
                        t`Enter a service name and valid numeric rate.`,
                      );
                      return;
                    }
                    setRateCard((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        name: newRateName.trim(),
                        description: newRateDesc.trim(),
                        defaultRateMicros: micros,
                        currency: newRateCurrency,
                      },
                    ]);
                    setRateCardDirty(true);
                    setNewRateName('');
                    setNewRateDesc('');
                    setNewRateAmount('');
                  }}
                >
                  <Trans>+ Add to Rate Card</Trans>
                </StyledDeliveryButton>
              </div>
            </StyledFinanceV2FormGrid>

            <div>
              <StyledDeliveryButton
                data-primary="true"
                disabled={busy}
                onClick={async () => {
                  setFormError('');
                  if (!companyName.trim()) {
                    setFormError(t`Enter your company legal name.`);
                    return;
                  }
                  const res = await onRunCommand({
                    action: 'saveCompanyProfile',
                    companyName: companyName.trim(),
                    legalAddress,
                    email,
                    phone,
                    website,
                    logoDataUrl,
                    bankDetails,
                    defaultQuoteTerms,
                    defaultInvoiceNotes,
                    rateCard,
                  });
                  if (res) setRateCardDirty(false);
                }}
              >
                <Trans>Save Company Profile &amp; PDF Branding</Trans>
              </StyledDeliveryButton>
            </div>
          </>
        )}
      </StyledFinanceV2Panel>

      <StyledFinanceV2SplitGrid>
        <StyledFinanceV2Panel>
          <h3>
            <Trans>Opening Balances (Existing Accumulated Profits)</Trans>
          </h3>
          <small>
            <Trans>
              Enter existing cash held in AED, USD, INR, QAR, existing laptops,
              or existing amounts owed to people. Opening Accumulated Profits
              (Equity in AED) balances automatically.
            </Trans>
          </small>
          <StyledFinanceV2FormGrid>
            <label>
              <Trans>Balance type</Trans>
              <select
                value={openKind}
                onChange={(e) =>
                  setOpenKind(
                    e.target.value as
                      | 'CASH'
                      | 'FIXED_ASSET'
                      | 'PERSON_LIABILITY',
                  )
                }
              >
                <option value="CASH">
                  {t`Existing Company Cash / Accumulated Profit`}
                </option>
                <option value="FIXED_ASSET">
                  {t`Existing Equipment / Asset`}
                </option>
                <option value="PERSON_LIABILITY">
                  {t`Existing Amount Owed to Person`}
                </option>
              </select>
            </label>
            <label>
              <Trans>Title</Trans>
              <input
                value={openTitle}
                placeholder={t`e.g. Existing USD Cash Balance`}
                onChange={(e) => setOpenTitle(e.target.value)}
              />
            </label>
            <label>
              <Trans>Currency</Trans>
              <select
                value={openCurrency}
                onChange={(e) =>
                  setOpenCurrency(e.target.value as FinanceV2Currency)
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
              {t`Amount (${openCurrency})`}
              <input
                value={openAmount}
                placeholder="10000"
                onChange={(e) => setOpenAmount(e.target.value)}
              />
            </label>
            {openCurrency !== 'AED' && (
              <label>
                {t`FX Rate (${openCurrency} → AED)`}
                <input
                  value={openFxRate}
                  placeholder={profile.exchangeRates[openCurrency] ?? '1'}
                  onChange={(e) => setOpenFxRate(e.target.value)}
                />
              </label>
            )}
            <label>
              <Trans>As of date</Trans>
              <input
                type="date"
                value={openDate}
                onChange={(e) => setOpenDate(e.target.value)}
              />
            </label>
            {openKind === 'PERSON_LIABILITY' && (
              <label>
                <Trans>Person</Trans>
                <select
                  value={openPersonId}
                  onChange={(e) => setOpenPersonId(e.target.value)}
                >
                  <option value="">{t`Select person…`}</option>
                  {personAccounts.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.personName ?? person.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </StyledFinanceV2FormGrid>
          {data.canManage && (
            <div>
              <StyledDeliveryButton
                data-primary="true"
                disabled={busy}
                onClick={async () => {
                  setFormError('');
                  const micros = parseMoney(openAmount);
                  if (!openTitle.trim()) {
                    setFormError(t`Enter a title for this opening balance.`);
                    return;
                  }
                  if (!micros || BigInt(micros) <= 0n) {
                    setFormError(t`Enter a valid positive opening amount.`);
                    return;
                  }
                  if (openKind === 'PERSON_LIABILITY' && !openPersonId) {
                    setFormError(
                      t`Select which person this opening liability is owed to.`,
                    );
                    return;
                  }
                  const res = await onRunCommand({
                    action: 'recordOpeningBalance',
                    kind: openKind,
                    title: openTitle.trim(),
                    entryDate: openDate,
                    currency: openCurrency,
                    amountMicros: micros,
                    ...(openFxRate.trim()
                      ? { fxRateToAed: openFxRate.trim() }
                      : {}),
                    ...(openKind === 'PERSON_LIABILITY'
                      ? { personAccountId: openPersonId }
                      : {}),
                  });
                  if (res) {
                    setOpenTitle('');
                    setOpenAmount('');
                  }
                }}
              >
                <Trans>Add Opening Balance</Trans>
              </StyledDeliveryButton>
            </div>
          )}
        </StyledFinanceV2Panel>

        <StyledFinanceV2Panel>
          <h3>
            <Trans>Convert Currency (Between Cash Balances)</Trans>
          </h3>
          <small>
            <Trans>
              Move cash from one currency to another (e.g. USD → AED) without
              affecting Revenue or Expenses. Any rate spread goes cleanly to
              Exchange Gain/Loss.
            </Trans>
          </small>
          <StyledFinanceV2FormGrid>
            <label>
              <Trans>From currency</Trans>
              <select
                value={convFromCurrency}
                onChange={(e) =>
                  setConvFromCurrency(e.target.value as FinanceV2Currency)
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
              {t`From amount (${convFromCurrency})`}
              <input
                value={convFromAmount}
                placeholder="1000"
                onChange={(e) => setConvFromAmount(e.target.value)}
              />
            </label>
            <label>
              <Trans>To currency</Trans>
              <select
                value={convToCurrency}
                onChange={(e) =>
                  setConvToCurrency(e.target.value as FinanceV2Currency)
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
              {t`To amount received (${convToCurrency})`}
              <input
                value={convToAmount}
                placeholder="3665"
                onChange={(e) => setConvToAmount(e.target.value)}
              />
            </label>
            <label>
              <Trans>Date</Trans>
              <input
                type="date"
                value={convDate}
                onChange={(e) => setConvDate(e.target.value)}
              />
            </label>
          </StyledFinanceV2FormGrid>
          {data.canManage && (
            <div>
              <StyledDeliveryButton
                disabled={busy}
                onClick={async () => {
                  setFormError('');
                  const fromMicros = parseMoney(convFromAmount);
                  const toMicros = parseMoney(convToAmount);
                  if (convFromCurrency === convToCurrency) {
                    setFormError(
                      t`Choose two different currencies to convert.`,
                    );
                    return;
                  }
                  if (
                    !fromMicros ||
                    BigInt(fromMicros) <= 0n ||
                    !toMicros ||
                    BigInt(toMicros) <= 0n
                  ) {
                    setFormError(
                      t`Enter valid positive amounts for both currencies.`,
                    );
                    return;
                  }
                  const res = await onRunCommand({
                    action: 'convertCurrency',
                    entryDate: convDate,
                    fromCurrency: convFromCurrency,
                    fromAmountMicros: fromMicros,
                    toCurrency: convToCurrency,
                    toAmountMicros: toMicros,
                  });
                  if (res) {
                    setConvFromAmount('');
                    setConvToAmount('');
                  }
                }}
              >
                <Trans>Record Currency Conversion</Trans>
              </StyledDeliveryButton>
            </div>
          )}
        </StyledFinanceV2Panel>
      </StyledFinanceV2SplitGrid>

      <StyledFinanceV2SplitGrid>
        <StyledFinanceV2Panel>
          <h3>
            <Trans>Default Exchange Rates to AED</Trans>
          </h3>
          <StyledFinanceV2FormGrid>
            {FINANCE_V2_CURRENCIES.filter((code) => code !== 'AED').map(
              (code) => (
                <label key={code}>
                  {t`1 ${code} = AED`}
                  <input
                    disabled={!data.canManage}
                    value={fxRates[code] ?? ''}
                    onChange={(e) =>
                      setFxRates((prev) => ({
                        ...prev,
                        [code]: e.target.value,
                      }))
                    }
                  />
                </label>
              ),
            )}
          </StyledFinanceV2FormGrid>
          {data.canManage && (
            <div>
              <StyledDeliveryButton
                disabled={busy}
                onClick={() => {
                  setFormError('');
                  for (const code of FINANCE_V2_CURRENCIES) {
                    if (code === 'AED') continue;
                    const raw = (fxRates[code] ?? '').trim();
                    if (
                      !/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(raw) ||
                      Number(raw) <= 0
                    ) {
                      setFormError(
                        t`Enter a valid positive AED exchange rate for ${code}.`,
                      );
                      return;
                    }
                  }
                  void onRunCommand({
                    action: 'saveExchangeRates',
                    exchangeRates: { ...fxRates, AED: '1' },
                  });
                }}
              >
                <Trans>Save Exchange Rates</Trans>
              </StyledDeliveryButton>
            </div>
          )}
        </StyledFinanceV2Panel>

        <StyledFinanceV2Panel>
          <h3>
            <Trans>Accountant CSV Exports</Trans>
          </h3>
          <small>
            <Trans>
              Download clean spreadsheet files for your accountant anytime.
            </Trans>
          </small>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              disabled={busy}
              onClick={() => void downloadCsv('PNL')}
            >
              <Trans>Profit &amp; Loss (AED)</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton
              disabled={busy}
              onClick={() => void downloadCsv('BALANCE_SHEET')}
            >
              <Trans>Balance Sheet (AED)</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton
              disabled={busy}
              onClick={() => void downloadCsv('LEDGER')}
            >
              <Trans>Full Ledger</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton
              disabled={busy}
              onClick={() => void downloadCsv('DOCUMENTS')}
            >
              <Trans>Quotes &amp; Invoices</Trans>
            </StyledDeliveryButton>
            {data.canViewPayroll && (
              <StyledDeliveryButton
                disabled={busy}
                onClick={() => void downloadCsv('PAYROLL')}
              >
                <Trans>Payroll Summary</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        </StyledFinanceV2Panel>
      </StyledFinanceV2SplitGrid>
    </StyledFinanceV2Stack>
  );
};
