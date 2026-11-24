import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
import {
  financeAmountMicrosToDecimal,
  formatFinanceAmountMicros,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import {
  createFinanceV2RequestId,
  isValidIsoDate,
  isValidPositiveFxRate,
} from '@/delivery/finance/v2/finance-v2-currency';
import {
  StyledFinanceV2ActionGroup,
  StyledFinanceV2FormGrid,
  StyledFinanceV2HeaderRow,
  StyledFinanceV2LogoPreview,
  StyledFinanceV2Notice,
  StyledFinanceV2Panel,
  StyledFinanceV2Pill,
  StyledFinanceV2SplitGrid,
  StyledFinanceV2Stack,
  StyledFinanceV2Table,
  StyledFinanceV2TableWrap,
} from '@/delivery/finance/v2/finance-v2.styles';
import {
  FINANCE_V2_CURRENCIES,
  type FinanceV2CommandRunner,
  type FinanceV2Currency,
  type FinanceV2RateCardItem,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

type FinanceV2SetupTabProps = {
  data: FinanceV2Snapshot;
  busy: boolean;
  onRunCommand: FinanceV2CommandRunner;
};

const MAX_LOGO_BYTES = 1_000_000;

const COMMON_FINANCE_TIMEZONES = [
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Qatar',
  'Asia/Riyadh',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
] as const;

const parseMoney = (raw: string): string | null =>
  parseFinanceAmountMicros(raw.replaceAll(',', '').trim());

export const FinanceV2SetupTab = ({
  data,
  busy,
  onRunCommand,
}: FinanceV2SetupTabProps) => {
  const { t } = useLingui();
  const store = useStore();
  const { profile } = data;

  const [formError, setFormError] = useState('');
  const [companyName, setCompanyName] = useState(profile.companyName);
  const [legalAddress, setLegalAddress] = useState(profile.legalAddress);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [website, setWebsite] = useState(profile.website);
  const [timezone, setTimezone] = useState(profile.timezone ?? 'Asia/Dubai');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(
    profile.logoDataUrl,
  );
  const [fetchedLogoObjectUrl, setFetchedLogoObjectUrl] = useState<
    string | null
  >(null);
  const [logoAction, setLogoAction] = useState<'KEEP' | 'SET' | 'CLEAR'>(
    'KEEP',
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
  const [profileDirty, setProfileDirty] = useState(false);
  const [rateCardDirty, setRateCardDirty] = useState(false);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [newRateName, setNewRateName] = useState('');
  const [newRateDesc, setNewRateDesc] = useState('');
  const [newRateAmount, setNewRateAmount] = useState('');
  const [newRateCurrency, setNewRateCurrency] =
    useState<FinanceV2Currency>('USD');

  // Period lock (admin-only)
  const [periodLockDate, setPeriodLockDate] = useState(
    profile.lockedThroughDate ?? data.asOfDate,
  );

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
  const [openingRequestId, setOpeningRequestId] = useState(
    createFinanceV2RequestId,
  );

  // FX rates & currency conversion
  const [fxRates, setFxRates] = useState<Record<string, string>>({
    ...profile.exchangeRates,
  });
  const [fxRatesDirty, setFxRatesDirty] = useState(false);
  const [convFromCurrency, setConvFromCurrency] =
    useState<FinanceV2Currency>('USD');
  const [convFromAmount, setConvFromAmount] = useState('');
  const [convToCurrency, setConvToCurrency] =
    useState<FinanceV2Currency>('AED');
  const [convToAmount, setConvToAmount] = useState('');
  const [convDate, setConvDate] = useState(data.today);
  const [conversionRequestId, setConversionRequestId] = useState(
    createFinanceV2RequestId,
  );

  // Fetch company logo via cached REST endpoint when snapshot omits inline base64
  useEffect(() => {
    if (!profile.hasLogo || profile.logoDataUrl) {
      setFetchedLogoObjectUrl(null);
      return;
    }
    if (typeof fetch !== 'function') return;
    let active = true;
    let createdUrl: string | null = null;
    const token = store.get(tokenPairState.atom)?.accessOrWorkspaceAgnosticToken
      ?.token;
    const headers: Record<string, string> =
      !store.get(isCookieAuthActiveState.atom) && token
        ? { Authorization: `Bearer ${token}` }
        : {};
    const logoVersion = profile.logoUpdatedAt
      ? `?v=${encodeURIComponent(profile.logoUpdatedAt)}`
      : '';
    void fetch(
      `${REACT_APP_SERVER_BASE_URL}/portal/delivery-finance-v2-files/profile/logo${logoVersion}`,
      { headers, credentials: 'include', cache: 'no-cache' },
    )
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!active || !blob) return;
        createdUrl = URL.createObjectURL(blob);
        setFetchedLogoObjectUrl(createdUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [profile.hasLogo, profile.logoDataUrl, profile.logoUpdatedAt, store]);

  // Sync from server snapshot updates when local editors are not dirty
  useEffect(() => {
    if (!profileDirty) {
      setCompanyName(profile.companyName);
      setLegalAddress(profile.legalAddress);
      setEmail(profile.email);
      setPhone(profile.phone);
      setWebsite(profile.website);
      setTimezone(profile.timezone ?? 'Asia/Dubai');
      setLogoDataUrl(profile.logoDataUrl);
      setLogoAction('KEEP');
      setBankDetails(profile.bankDetails);
      setDefaultQuoteTerms(profile.defaultQuoteTerms);
      setDefaultInvoiceNotes(profile.defaultInvoiceNotes);
    }
  }, [
    profileDirty,
    profile.companyName,
    profile.legalAddress,
    profile.email,
    profile.phone,
    profile.website,
    profile.timezone,
    profile.logoDataUrl,
    profile.bankDetails,
    profile.defaultQuoteTerms,
    profile.defaultInvoiceNotes,
  ]);

  useEffect(() => {
    if (profile.lockedThroughDate) {
      setPeriodLockDate(profile.lockedThroughDate);
    }
  }, [profile.lockedThroughDate]);

  useEffect(() => {
    if (!rateCardDirty) {
      setRateCard(profile.rateCard);
    }
  }, [rateCardDirty, profile.rateCard]);

  useEffect(() => {
    if (!fxRatesDirty) {
      setFxRates({ ...profile.exchangeRates });
    }
  }, [fxRatesDirty, profile.exchangeRates]);

  const displayedLogoSrc =
    logoAction === 'CLEAR'
      ? null
      : logoAction === 'SET'
        ? logoDataUrl
        : (logoDataUrl ?? fetchedLogoObjectUrl);

  const timezoneOptions = COMMON_FINANCE_TIMEZONES.includes(
    timezone as (typeof COMMON_FINANCE_TIMEZONES)[number],
  )
    ? [...COMMON_FINANCE_TIMEZONES]
    : [timezone, ...COMMON_FINANCE_TIMEZONES];

  const personAccounts = data.accounts.filter(
    (account) => account.subType === 'PERSON_LIABILITY' && account.active,
  );
  const resolvedOpenPersonId = personAccounts.some(
    (person) => person.id === openPersonId,
  )
    ? openPersonId
    : '';
  const openingBalanceJournals = data.journals.filter(
    (entry) => entry.entryType === 'OPENING_BALANCE',
  );

  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    setFormError('');
    const file = event.target.files?.[0];
    // Reset file input immediately so re-uploading the same filename fires onChange cleanly
    event.target.value = '';
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
        setLogoAction('SET');
        setProfileDirty(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const resetRateCardDraft = () => {
    setEditingRateId(null);
    setNewRateName('');
    setNewRateDesc('');
    setNewRateAmount('');
    setNewRateCurrency('USD');
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
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
      timezone,
      ...(logoAction === 'SET'
        ? { logoDataUrl }
        : logoAction === 'CLEAR'
          ? { logoDataUrl: null }
          : {}),
      bankDetails,
      defaultQuoteTerms,
      defaultInvoiceNotes,
      rateCard,
    });
    if (res) {
      setProfileDirty(false);
      setRateCardDirty(false);
      setLogoAction('KEEP');
      resetRateCardDraft();
    }
  };

  const handleRecordOpeningBalance = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const micros = parseMoney(openAmount);
    if (!openTitle.trim()) {
      setFormError(t`Enter a title for this opening balance.`);
      return;
    }
    if (
      !micros ||
      BigInt(micros) <= 0n ||
      !isFinanceAmountMicrosWithinLimit(micros)
    ) {
      setFormError(t`Enter a valid positive opening amount.`);
      return;
    }
    const trimmedFx = openCurrency !== 'AED' ? openFxRate.trim() : '';
    if (trimmedFx && !isValidPositiveFxRate(trimmedFx)) {
      setFormError(t`Enter a valid positive AED exchange rate.`);
      return;
    }
    if (openKind === 'PERSON_LIABILITY' && !resolvedOpenPersonId) {
      setFormError(t`Select which person this opening liability is owed to.`);
      return;
    }
    const res = await onRunCommand({
      action: 'recordOpeningBalance',
      kind: openKind,
      title: openTitle.trim(),
      entryDate: openDate,
      currency: openCurrency,
      amountMicros: micros,
      ...(trimmedFx ? { fxRateToAed: trimmedFx } : {}),
      ...(openKind === 'PERSON_LIABILITY'
        ? { personAccountId: resolvedOpenPersonId }
        : {}),
      clientRequestId: openingRequestId,
    });
    if (res) {
      setOpenTitle('');
      setOpenAmount('');
      setOpenFxRate('');
      setOpeningRequestId(createFinanceV2RequestId());
    }
  };

  const handleConvertCurrency = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const fromMicros = parseMoney(convFromAmount);
    const toMicros = parseMoney(convToAmount);
    if (convFromCurrency === convToCurrency) {
      setFormError(t`Choose two different currencies to convert.`);
      return;
    }
    if (
      !fromMicros ||
      BigInt(fromMicros) <= 0n ||
      !isFinanceAmountMicrosWithinLimit(fromMicros) ||
      !toMicros ||
      BigInt(toMicros) <= 0n ||
      !isFinanceAmountMicrosWithinLimit(toMicros)
    ) {
      setFormError(t`Enter valid positive amounts for both currencies.`);
      return;
    }
    const res = await onRunCommand({
      action: 'convertCurrency',
      entryDate: convDate,
      fromCurrency: convFromCurrency,
      fromAmountMicros: fromMicros,
      toCurrency: convToCurrency,
      toAmountMicros: toMicros,
      clientRequestId: conversionRequestId,
    });
    if (res) {
      setConvFromAmount('');
      setConvToAmount('');
      setConversionRequestId(createFinanceV2RequestId());
    }
  };

  const handleSaveExchangeRates = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    for (const code of FINANCE_V2_CURRENCIES) {
      if (code === 'AED') continue;
      const raw = (fxRates[code] ?? '').trim();
      if (!isValidPositiveFxRate(raw)) {
        setFormError(t`Enter a valid positive AED exchange rate for ${code}.`);
        return;
      }
    }
    const res = await onRunCommand({
      action: 'saveExchangeRates',
      exchangeRates: { ...fxRates, AED: '1' },
    });
    if (res) {
      setFxRatesDirty(false);
    }
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
        <form onSubmit={(event) => void handleSaveProfile(event)}>
          <StyledFinanceV2Stack>
            <StyledFinanceV2HeaderRow>
              <div>
                <h2>
                  <Trans>Company Branding &amp; PDF Format</Trans>
                </h2>
                <small>
                  <Trans>
                    Used automatically on every Quote PDF and Invoice PDF.
                    Upload your logo and fill in your company &amp; wire details
                    once.
                  </Trans>
                </small>
              </div>
              {displayedLogoSrc && (
                <StyledFinanceV2ActionGroup>
                  <StyledFinanceV2LogoPreview
                    src={displayedLogoSrc}
                    alt={companyName}
                  />
                  {data.canManage && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => {
                        setLogoDataUrl(null);
                        setLogoAction('CLEAR');
                        setProfileDirty(true);
                      }}
                    >
                      <Trans>Remove logo</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledFinanceV2ActionGroup>
              )}
            </StyledFinanceV2HeaderRow>

            {(profileDirty || rateCardDirty) && (
              <StyledFinanceV2Notice>
                <Trans>
                  You have unsaved Company Profile or Rate Card changes — click
                  &ldquo;Save Company Profile &amp; PDF Branding&rdquo; below to
                  persist them.
                </Trans>
              </StyledFinanceV2Notice>
            )}

            <StyledFinanceV2FormGrid>
              <label>
                <Trans>Company legal name</Trans>
                <input
                  disabled={!data.canManage}
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    setProfileDirty(true);
                  }}
                />
              </label>
              <label>
                <Trans>Billing email</Trans>
                <input
                  disabled={!data.canManage}
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setProfileDirty(true);
                  }}
                />
              </label>
              <label>
                <Trans>Phone</Trans>
                <input
                  disabled={!data.canManage}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setProfileDirty(true);
                  }}
                />
              </label>
              <label>
                <Trans>Website</Trans>
                <input
                  disabled={!data.canManage}
                  value={website}
                  onChange={(e) => {
                    setWebsite(e.target.value);
                    setProfileDirty(true);
                  }}
                />
              </label>
              <label>
                <Trans>Workspace timezone</Trans>
                <select
                  aria-label={t`Workspace timezone`}
                  disabled={!data.canManage}
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    setProfileDirty(true);
                  }}
                >
                  {timezoneOptions.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
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
                  onChange={(e) => {
                    setLegalAddress(e.target.value);
                    setProfileDirty(true);
                  }}
                />
              </label>
              <label>
                <Trans>
                  Payment / Bank wire instructions (shown on Invoice PDFs)
                </Trans>
                <textarea
                  disabled={!data.canManage}
                  value={bankDetails}
                  onChange={(e) => {
                    setBankDetails(e.target.value);
                    setProfileDirty(true);
                  }}
                />
              </label>
            </StyledFinanceV2FormGrid>

            <StyledFinanceV2FormGrid>
              <label>
                <Trans>Default Quote Terms</Trans>
                <textarea
                  disabled={!data.canManage}
                  value={defaultQuoteTerms}
                  onChange={(e) => {
                    setDefaultQuoteTerms(e.target.value);
                    setProfileDirty(true);
                  }}
                />
              </label>
              <label>
                <Trans>Default Invoice Notes</Trans>
                <textarea
                  disabled={!data.canManage}
                  value={defaultInvoiceNotes}
                  onChange={(e) => {
                    setDefaultInvoiceNotes(e.target.value);
                    setProfileDirty(true);
                  }}
                />
              </label>
            </StyledFinanceV2FormGrid>

            <h4>
              <Trans>
                Saved Service Rate Card (for quick Quotes &amp; Invoices)
              </Trans>
            </h4>
            {rateCard.map((item) => (
              <StyledFinanceV2HeaderRow key={item.id}>
                <span>
                  <strong>{item.name}</strong> —{' '}
                  {formatFinanceAmountMicros(
                    item.defaultRateMicros,
                    item.currency,
                  )}
                  {item.description ? ` (${item.description})` : ''}
                </span>
                {data.canManage && (
                  <StyledFinanceV2ActionGroup>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setEditingRateId(item.id);
                        setNewRateName(item.name);
                        setNewRateDesc(item.description);
                        setNewRateCurrency(item.currency);
                        setNewRateAmount(
                          financeAmountMicrosToDecimal(item.defaultRateMicros),
                        );
                      }}
                    >
                      <Trans>Edit</Trans>
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() => {
                        setRateCard((prev) =>
                          prev.filter((r) => r.id !== item.id),
                        );
                        if (editingRateId === item.id) resetRateCardDraft();
                        setRateCardDirty(true);
                      }}
                    >
                      <Trans>Remove</Trans>
                    </StyledDeliveryButton>
                  </StyledFinanceV2ActionGroup>
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
                    <StyledFinanceV2ActionGroup>
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => {
                          setFormError('');
                          const micros = parseMoney(newRateAmount);
                          if (
                            !newRateName.trim() ||
                            !micros ||
                            !isFinanceAmountMicrosWithinLimit(micros)
                          ) {
                            setFormError(
                              t`Enter a service name and valid numeric rate.`,
                            );
                            return;
                          }
                          if (editingRateId) {
                            setRateCard((prev) =>
                              prev.map((row) =>
                                row.id === editingRateId
                                  ? {
                                      ...row,
                                      name: newRateName.trim(),
                                      description: newRateDesc.trim(),
                                      defaultRateMicros: micros,
                                      currency: newRateCurrency,
                                    }
                                  : row,
                              ),
                            );
                          } else {
                            setRateCard((prev) => [
                              ...prev,
                              {
                                id: createFinanceV2RequestId(),
                                name: newRateName.trim(),
                                description: newRateDesc.trim(),
                                defaultRateMicros: micros,
                                currency: newRateCurrency,
                              },
                            ]);
                          }
                          setRateCardDirty(true);
                          resetRateCardDraft();
                        }}
                      >
                        {editingRateId ? (
                          <Trans>Update Rate Card Item</Trans>
                        ) : (
                          <Trans>+ Add to Rate Card</Trans>
                        )}
                      </StyledDeliveryButton>
                      {editingRateId && (
                        <StyledDeliveryButton
                          type="button"
                          onClick={resetRateCardDraft}
                        >
                          <Trans>Cancel</Trans>
                        </StyledDeliveryButton>
                      )}
                    </StyledFinanceV2ActionGroup>
                  </div>
                </StyledFinanceV2FormGrid>

                <StyledFinanceV2ActionGroup>
                  <StyledDeliveryButton
                    type="submit"
                    data-primary="true"
                    disabled={busy}
                  >
                    <Trans>Save Company Profile &amp; PDF Branding</Trans>
                  </StyledDeliveryButton>
                  {(profileDirty || rateCardDirty) && (
                    <StyledDeliveryButton
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFormError('');
                        setProfileDirty(false);
                        setRateCardDirty(false);
                        resetRateCardDraft();
                      }}
                    >
                      <Trans>Discard Changes</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledFinanceV2ActionGroup>
              </>
            )}
          </StyledFinanceV2Stack>
        </form>
      </StyledFinanceV2Panel>

      <StyledFinanceV2SplitGrid>
        <StyledFinanceV2Panel>
          <form onSubmit={(event) => void handleRecordOpeningBalance(event)}>
            <StyledFinanceV2Stack>
              <h3>
                <Trans>Opening Balances (Existing Accumulated Profits)</Trans>
              </h3>
              <small>
                <Trans>
                  Enter existing cash held in AED, USD, INR, QAR, existing
                  laptops, or existing amounts owed to people. Opening
                  Accumulated Profits (Equity in AED) balances automatically.
                </Trans>
              </small>
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>Balance type</Trans>
                  <select
                    disabled={!data.canManage}
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
                    disabled={!data.canManage}
                    value={openTitle}
                    placeholder={t`e.g. Existing USD Cash Balance`}
                    onChange={(e) => setOpenTitle(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Currency</Trans>
                  <select
                    disabled={!data.canManage}
                    value={openCurrency}
                    onChange={(e) => {
                      setOpenCurrency(e.target.value as FinanceV2Currency);
                      setOpenFxRate('');
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
                  {t`Amount (${openCurrency})`}
                  <input
                    disabled={!data.canManage}
                    value={openAmount}
                    placeholder="10000"
                    onChange={(e) => setOpenAmount(e.target.value)}
                  />
                </label>
                {openCurrency !== 'AED' && (
                  <label>
                    {t`FX Rate (${openCurrency} → AED)`}
                    <input
                      disabled={!data.canManage}
                      value={openFxRate}
                      placeholder={profile.exchangeRates[openCurrency] ?? '1'}
                      onChange={(e) => setOpenFxRate(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  <Trans>As of date</Trans>
                  <input
                    disabled={!data.canManage}
                    type="date"
                    value={openDate}
                    onChange={(e) => setOpenDate(e.target.value)}
                  />
                </label>
                {openKind === 'PERSON_LIABILITY' && (
                  <label>
                    <Trans>Person</Trans>
                    <select
                      disabled={!data.canManage}
                      value={resolvedOpenPersonId}
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
                <StyledFinanceV2ActionGroup>
                  <StyledDeliveryButton
                    type="submit"
                    data-primary="true"
                    disabled={busy}
                  >
                    <Trans>Add Opening Balance</Trans>
                  </StyledDeliveryButton>
                </StyledFinanceV2ActionGroup>
              )}
            </StyledFinanceV2Stack>
          </form>

          {openingBalanceJournals.length > 0 && (
            <StyledFinanceV2Stack>
              <h4>
                {t`Recorded Opening Balances (${openingBalanceJournals.length})`}
              </h4>
              <StyledFinanceV2TableWrap>
                <StyledFinanceV2Table>
                  <thead>
                    <tr>
                      <th>
                        <Trans>Date</Trans>
                      </th>
                      <th>
                        <Trans>Title</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Amount</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>AED</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {openingBalanceJournals.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.entryDate}</td>
                        <td>
                          <strong>{entry.title}</strong>
                          {entry.status === 'VOID' && (
                            <>
                              {' '}
                              <StyledFinanceV2Pill data-tone="neutral">
                                <Trans>VOID</Trans>
                              </StyledFinanceV2Pill>
                            </>
                          )}
                        </td>
                        <td data-numeric="true">
                          {formatFinanceAmountMicros(
                            entry.amountMicros,
                            entry.currency,
                          )}
                        </td>
                        <td data-numeric="true">
                          {formatFinanceAmountMicros(
                            entry.aedAmountMicros,
                            'AED',
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </StyledFinanceV2Table>
              </StyledFinanceV2TableWrap>
            </StyledFinanceV2Stack>
          )}
        </StyledFinanceV2Panel>

        <StyledFinanceV2Panel>
          <form onSubmit={(event) => void handleConvertCurrency(event)}>
            <StyledFinanceV2Stack>
              <h3>
                <Trans>Convert Currency (Between Cash Balances)</Trans>
              </h3>
              <small>
                <Trans>
                  Move cash from one currency to another (e.g. USD → AED)
                  without affecting Revenue or Expenses. Any rate spread goes
                  cleanly to Exchange Gain/Loss.
                </Trans>
              </small>
              <StyledFinanceV2FormGrid>
                <label>
                  <Trans>From currency</Trans>
                  <select
                    disabled={!data.canManage}
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
                    disabled={!data.canManage}
                    value={convFromAmount}
                    placeholder="1000"
                    onChange={(e) => setConvFromAmount(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>To currency</Trans>
                  <select
                    disabled={!data.canManage}
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
                    disabled={!data.canManage}
                    value={convToAmount}
                    placeholder="3665"
                    onChange={(e) => setConvToAmount(e.target.value)}
                  />
                </label>
                <label>
                  <Trans>Date</Trans>
                  <input
                    disabled={!data.canManage}
                    type="date"
                    value={convDate}
                    onChange={(e) => setConvDate(e.target.value)}
                  />
                </label>
              </StyledFinanceV2FormGrid>
              {data.canManage && (
                <StyledFinanceV2ActionGroup>
                  <StyledDeliveryButton type="submit" disabled={busy}>
                    <Trans>Record Currency Conversion</Trans>
                  </StyledDeliveryButton>
                </StyledFinanceV2ActionGroup>
              )}
            </StyledFinanceV2Stack>
          </form>
        </StyledFinanceV2Panel>
      </StyledFinanceV2SplitGrid>

      <StyledFinanceV2SplitGrid>
        <StyledFinanceV2Panel>
          <form onSubmit={(event) => void handleSaveExchangeRates(event)}>
            <StyledFinanceV2Stack>
              <h3>
                <Trans>Default Exchange Rates to AED</Trans>
              </h3>
              {fxRatesDirty && (
                <StyledFinanceV2Notice>
                  <Trans>
                    Exchange rates have unsaved changes — click &ldquo;Save
                    Exchange Rates&rdquo; to apply them.
                  </Trans>
                </StyledFinanceV2Notice>
              )}
              <StyledFinanceV2FormGrid>
                {FINANCE_V2_CURRENCIES.filter((code) => code !== 'AED').map(
                  (code) => (
                    <label key={code}>
                      {t`1 ${code} = AED`}
                      <input
                        disabled={!data.canManage}
                        value={fxRates[code] ?? ''}
                        onChange={(e) => {
                          setFxRates((prev) => ({
                            ...prev,
                            [code]: e.target.value,
                          }));
                          setFxRatesDirty(true);
                        }}
                      />
                    </label>
                  ),
                )}
              </StyledFinanceV2FormGrid>
              {data.canManage && (
                <StyledFinanceV2ActionGroup>
                  <StyledDeliveryButton type="submit" disabled={busy}>
                    <Trans>Save Exchange Rates</Trans>
                  </StyledDeliveryButton>
                  {fxRatesDirty && (
                    <StyledDeliveryButton
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFormError('');
                        setFxRatesDirty(false);
                      }}
                    >
                      <Trans>Reset</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledFinanceV2ActionGroup>
              )}
            </StyledFinanceV2Stack>
          </form>
        </StyledFinanceV2Panel>

        <StyledFinanceV2Panel>
          <h3>
            <Trans>Accountant CSV Exports</Trans>
          </h3>
          <small>
            {t`Active export window: P&L & Ledger ${data.fromDate} → ${data.toDate} · Balance Sheet as of ${data.asOfDate} · Payroll ${data.payrollMonth}.`}
          </small>
          <StyledFinanceV2ActionGroup>
            <StyledDeliveryButton
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv('PNL')}
            >
              {t`Profit & Loss (${data.fromDate} → ${data.toDate})`}
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv('BALANCE_SHEET')}
            >
              {t`Balance Sheet (${data.asOfDate})`}
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv('LEDGER')}
            >
              {t`Ledger (${data.fromDate} → ${data.toDate})`}
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              disabled={busy}
              onClick={() => void downloadCsv('DOCUMENTS')}
            >
              <Trans>Quotes &amp; Invoices</Trans>
            </StyledDeliveryButton>
            {data.canViewPayroll && (
              <StyledDeliveryButton
                type="button"
                disabled={busy}
                onClick={() => void downloadCsv('PAYROLL')}
              >
                {t`Payroll Summary (${data.payrollMonth})`}
              </StyledDeliveryButton>
            )}
          </StyledFinanceV2ActionGroup>
        </StyledFinanceV2Panel>
      </StyledFinanceV2SplitGrid>

      {data.canViewPayroll && (
        <StyledFinanceV2Panel>
          <StyledFinanceV2Stack>
            <StyledFinanceV2HeaderRow>
              <div>
                <h3>
                  <Trans>Accounting Period Lock (Admin Only)</Trans>
                </h3>
                <small>
                  <Trans>
                    Locking books through a closing date prevents posting or
                    voiding ledger entries on or before that date. Closed
                    entries can still be corrected with an audit-safe Reversal
                    in an open period.
                  </Trans>
                </small>
              </div>
              <StyledFinanceV2Pill
                data-tone={profile.lockedThroughDate ? 'warning' : 'neutral'}
              >
                {profile.lockedThroughDate
                  ? t`Locked through ${profile.lockedThroughDate}`
                  : t`Unlocked`}
              </StyledFinanceV2Pill>
            </StyledFinanceV2HeaderRow>
            <StyledFinanceV2FormGrid>
              <label>
                <Trans>Close books through date</Trans>
                <input
                  type="date"
                  aria-label={t`Period lock date`}
                  value={periodLockDate}
                  onChange={(e) => setPeriodLockDate(e.target.value)}
                />
              </label>
            </StyledFinanceV2FormGrid>
            <StyledFinanceV2ActionGroup>
              <StyledDeliveryButton
                type="button"
                data-primary="true"
                disabled={busy}
                onClick={() => {
                  setFormError('');
                  if (!isValidIsoDate(periodLockDate)) {
                    setFormError(t`Choose a valid period lock date.`);
                    return;
                  }
                  void onRunCommand({
                    action: 'setPeriodLock',
                    lockedThroughDate: periodLockDate,
                  });
                }}
              >
                <Trans>Lock Period</Trans>
              </StyledDeliveryButton>
              {profile.lockedThroughDate && (
                <StyledDeliveryButton
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setFormError('');
                    void onRunCommand({
                      action: 'setPeriodLock',
                      lockedThroughDate: null,
                    });
                  }}
                >
                  <Trans>Unlock Period</Trans>
                </StyledDeliveryButton>
              )}
            </StyledFinanceV2ActionGroup>
          </StyledFinanceV2Stack>
        </StyledFinanceV2Panel>
      )}
    </StyledFinanceV2Stack>
  );
};
