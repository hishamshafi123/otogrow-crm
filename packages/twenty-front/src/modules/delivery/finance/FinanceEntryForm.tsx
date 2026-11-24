import { useCallback, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { isDefined, isValidUrl } from 'twenty-shared/utils';
import {
  type DeliveryFinanceQuery,
  type DeliveryFinanceEntryInput,
} from '~/generated-metadata/graphql';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  financeAmountMicrosToDecimal,
  financeAllocationRemainder,
  formatFinanceAmountMicros,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { useFinanceAiCostLabels } from '@/delivery/finance/useFinanceAiCostLabels';
import { useFinanceRecognitionAvailability } from '@/delivery/finance/useFinanceRecognitionAvailability';
import { FinanceRecognitionNotice } from '@/delivery/finance/FinanceRecognitionNotice';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceSnapshot = DeliveryFinanceQuery['deliveryFinance'];
type FinanceEntryFormProps = {
  initial: FinanceSnapshot['entries'][number] | null;
  month: string;
  projects: FinanceSnapshot['projects'];
  busy: boolean;
  readOnly?: boolean;
  latestRevision: number;
  onSave: (input: DeliveryFinanceEntryInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
type AllocationDraft = {
  id: string;
  projectId: string;
  projectName: string | null;
  amount: string;
};
const COMPANY_ALLOCATION = 'COMPANY';
const StyledEntryFields = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
const StyledAllocationFields = styled.div`
  align-items: end;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const FinanceEntryForm = ({
  initial,
  month,
  projects,
  busy,
  readOnly = false,
  latestRevision,
  onSave,
  onCancel,
  onReload,
}: FinanceEntryFormProps) => {
  const { t, i18n } = useLingui();
  const labels = useFinanceLabels();
  const aiCostLabels = useFinanceAiCostLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [openedRevision] = useState(initial?.revision ?? 0);
  const [values, setValues] = useState(() => {
    const kind = initial?.kind ?? 'COST';
    const category =
      initial?.category ??
      (kind === 'REVENUE' ? 'SERVICE_REVENUE' : 'DIRECT_COST');
    const standardCategories =
      kind === 'REVENUE'
        ? ['SERVICE_REVENUE']
        : ['DIRECT_COST', 'SALARY', 'OVERHEAD'];
    return {
      month: initial?.month ?? month,
      kind,
      categoryChoice: standardCategories.includes(category)
        ? category
        : 'CUSTOM',
      customCategory: standardCategories.includes(category) ? '' : category,
      title: initial?.title ?? '',
      currency: initial?.currency ?? 'USD',
      amount: initial ? financeAmountMicrosToDecimal(initial.amountMicros) : '',
      note: initial?.note ?? '',
      evidenceUrl: initial?.evidenceUrl ?? '',
    };
  });
  const [allocations, setAllocations] = useState<AllocationDraft[]>(
    () =>
      initial?.allocations.map((allocation) => ({
        id: crypto.randomUUID(),
        projectId: allocation.projectId ?? COMPANY_ALLOCATION,
        projectName: allocation.projectName ?? null,
        amount: financeAmountMicrosToDecimal(allocation.amountMicros),
      })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: { values, allocations },
    busy: busy || saving,
  });
  const registerForm = draft.formRef;
  const attachForm = useCallback(
    (form: HTMLFormElement | null) => {
      registerForm(form);
      if (!form) return;
      form
        .querySelector<HTMLInputElement>('[name="title"]')
        ?.focus({ preventScroll: true });
      form.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    },
    [registerForm],
  );
  const fromPlan = initial?.sourceType === 'PLAN';
  const recognitionAvailability = useFinanceRecognitionAvailability(
    values.month,
  );
  const lockedMonths = [
    ...new Set([
      ...recognitionAvailability.lockedMonths,
      ...(initial?.lockedMonths ?? []),
    ]),
  ];
  const fromAiSpend = initial?.sourceType === 'AI_SPEND';
  const sourceLocked = fromPlan || fromAiSpend;
  const editable = !initial || initial.status === 'DRAFT';
  const stale = initial !== null && latestRevision !== openedRevision;
  const amountMicros = parseFinanceAmountMicros(values.amount);
  const amountValid =
    amountMicros !== null && isFinanceAmountMicrosWithinLimit(amountMicros);
  const category = sourceLocked
    ? initial.category
    : values.categoryChoice === 'CUSTOM'
      ? values.customCategory.trim()
      : values.categoryChoice;
  const categoryChoices =
    values.kind === 'REVENUE'
      ? ['SERVICE_REVENUE']
      : ['DIRECT_COST', 'SALARY', 'OVERHEAD'];
  const parsedAllocations = allocations.map((allocation) =>
    parseFinanceAmountMicros(allocation.amount),
  );
  const duplicateBuckets = new Set(
    allocations
      .filter(
        (allocation, index) =>
          allocation.projectId !== '' &&
          allocations.some(
            (other, otherIndex) =>
              otherIndex !== index && other.projectId === allocation.projectId,
          ),
      )
      .map((allocation) => allocation.projectId),
  );
  const allocationIssues = allocations.map((allocation, index) => {
    if (!allocation.projectId)
      return t`Choose a client project or the company bucket.`;
    if (
      allocation.projectId !== COMPANY_ALLOCATION &&
      !projects.some((project) => project.id === allocation.projectId)
    )
      return t`This project is unavailable. Choose another project or the company bucket.`;
    if (duplicateBuckets.has(allocation.projectId))
      return t`Use each client project or company bucket only once.`;
    const amount = parsedAllocations[index];
    if (amount === null || !isFinanceAmountMicrosWithinLimit(amount))
      return t`Enter a nonnegative allocation with up to six decimal places within the supported limit.`;
    return '';
  });
  const allocationsValid = allocationIssues.every((issue) => !issue);
  const allocationAmounts = parsedAllocations.filter(isDefined);
  const remainder =
    amountValid && allocationAmounts.length === allocations.length
      ? financeAllocationRemainder(amountMicros!, allocationAmounts)
      : null;
  const evidenceValid =
    !values.evidenceUrl.trim() ||
    (/^https?:\/\//.test(values.evidenceUrl.trim()) &&
      isValidUrl(values.evidenceUrl.trim()));
  const requirements = [
    ...(!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(values.month)
      ? [t`Choose a valid recognition month.`]
      : []),
    ...(!values.title.trim() ? [t`Give this entry a title.`] : []),
    ...(!['REVENUE', 'COST'].includes(values.kind)
      ? [t`Choose revenue or cost.`]
      : []),
    ...(!category || category.length > 100
      ? [t`Enter a category of up to 100 characters.`]
      : []),
    ...(!labels.currencies.includes(values.currency)
      ? [t`Choose a supported currency.`]
      : []),
    ...(!amountValid
      ? [
          t`Enter a nonnegative total with up to six decimal places within the supported limit.`,
        ]
      : []),
    ...(!sourceLocked && !values.note.trim() && !values.evidenceUrl.trim()
      ? [t`Add source notes or an evidence link for this manual entry.`]
      : []),
    ...(fromPlan &&
    initial.sourcePlan &&
    amountValid &&
    amountMicros !== initial.sourcePlan.monthlyAmountMicros &&
    !values.note.trim()
      ? [
          t`Explain the amount change from the saved monthly plan in Source notes. No automatic proration is applied.`,
        ]
      : []),
    ...(!evidenceValid
      ? [t`Use a valid http or https evidence link, or leave it blank.`]
      : []),
    ...(allocations.length > 100 ? [t`Use at most 100 allocation rows.`] : []),
  ];
  const canSave =
    !readOnly &&
    recognitionAvailability.available &&
    recognitionAvailability.canManage &&
    lockedMonths.length === 0 &&
    editable &&
    !stale &&
    draft.dirty &&
    requirements.length === 0 &&
    allocationsValid &&
    remainder !== null &&
    !remainder.overallocated;
  const assignRemainderToCompany = () => {
    if (
      readOnly ||
      !remainder ||
      remainder.complete ||
      remainder.overallocated ||
      !allocationsValid
    )
      return;
    const company = allocations.find(
      (allocation) => allocation.projectId === COMPANY_ALLOCATION,
    );
    if (company) {
      const current = parseFinanceAmountMicros(company.amount);
      if (current === null) return;
      const nextAmount = (
        BigInt(current) + BigInt(remainder.remainingMicros)
      ).toString();
      if (!isFinanceAmountMicrosWithinLimit(nextAmount)) return;
      setAllocations(
        allocations.map((allocation) =>
          allocation.id === company.id
            ? {
                ...allocation,
                amount: financeAmountMicrosToDecimal(nextAmount),
              }
            : allocation,
        ),
      );
    } else if (allocations.length < 100)
      setAllocations([
        ...allocations,
        {
          id: crypto.randomUUID(),
          projectId: COMPANY_ALLOCATION,
          projectName: null,
          amount: financeAmountMicrosToDecimal(remainder.remainingMicros),
        },
      ]);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || saving || !canSave || amountMicros === null) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        id,
        revision: openedRevision,
        month: initial?.month ?? values.month,
        kind: sourceLocked ? initial.kind : values.kind,
        category,
        title: values.title.trim(),
        currency: initial?.currency ?? values.currency,
        amountMicros: fromAiSpend ? initial.amountMicros : amountMicros,
        note: values.note.trim(),
        evidenceUrl: values.evidenceUrl.trim() || null,
        allocations: allocations.map((allocation, index) => ({
          projectId:
            allocation.projectId === COMPANY_ALLOCATION
              ? null
              : allocation.projectId,
          amountMicros: parsedAllocations[index]!,
        })),
      });
      if (saved) draft.markSaved({ values, allocations });
      else
        setError(
          t`The monthly draft was not confirmed saved. Your changes are kept; check for newer data and retry.`,
        );
    } catch {
      setError(t`The monthly draft could not be saved. Your changes are kept.`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      ref={attachForm}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={t`Monthly recognition draft`}
    >
      <StyledDeliveryStack>
        <h3>{initial ? t`Edit monthly draft` : t`New monthly draft`}</h3>
        <p>
          <Trans>
            Save a draft for review. Posting is a separate step. Recognition
            does not record a payment or collect money.
          </Trans>
        </p>
        {stale && (
          <DeliveryDraftConflict
            busy={busy || saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {!editable && (
          <p role="alert">
            <Trans>
              This entry is no longer a draft. Its saved values cannot be
              edited; review its history and correction options.
            </Trans>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <FinanceRecognitionNotice
          availability={{ ...recognitionAvailability, lockedMonths }}
        />
        {readOnly && (
          <p role="status">
            <Trans>
              Editing is unavailable. Your draft is kept, and you can close it
              without saving.
            </Trans>
          </p>
        )}
        {fromPlan && (
          <section aria-label={t`Saved cost-plan source`}>
            <strong>{labels.sourceTypes.PLAN}</strong>
            {initial.sourcePlan ? (
              <>
                <p>
                  {initial.sourcePlan.name}
                  {' · '}
                  {t`Version ${initial.sourcePlan.revision}`}
                </p>
                {initial.sourcePlan.memberName && (
                  <p>{initial.sourcePlan.memberName}</p>
                )}
                <p>
                  {t`Saved monthly amount`}:{' '}
                  {formatFinanceAmountMicros(
                    initial.sourcePlan.monthlyAmountMicros,
                    initial.currency,
                    i18n.locale,
                  )}
                </p>
                <p>
                  {initial.sourcePlan.startMonth}
                  {initial.sourcePlan.endMonth
                    ? ` – ${initial.sourcePlan.endMonth}`
                    : ''}
                  {' · '}
                  {t`Due day ${initial.sourcePlan.dueDay}`}
                </p>
                {initial.dueDate && (
                  <p>
                    {t`Prepared due date`}: {initial.dueDate}
                  </p>
                )}
              </>
            ) : (
              <p>
                <Trans>
                  The saved source plan is unavailable. Review source warnings
                  before posting.
                </Trans>
              </p>
            )}
            <small>
              <Trans>
                Editing this draft does not update the plan or its saved source
                version.
              </Trans>
            </small>
          </section>
        )}
        {fromAiSpend && (
          <p role="status">
            <Trans>
              The recorded AI amount, currency, category and evidence are fixed.
              Review a different charge or correction in AI costs. You can edit
              this draft’s title, notes and allocation before posting.
            </Trans>
          </p>
        )}
        {initial && initial.sourceWarnings.length > 0 && (
          <div role="status">
            <strong>
              <Trans>Source needs review before posting</Trans>
            </strong>
            <ul>
              {initial.sourceWarnings.map((warning) => (
                <li key={warning}>
                  {fromAiSpend
                    ? aiCostLabels.warning(warning)
                    : labels.warning(warning)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <fieldset disabled={busy || saving || stale || readOnly || !editable}>
          <StyledDeliveryStack>
            <StyledEntryFields>
              <label>
                <Trans>Entry title</Trans>
                <input
                  name="title"
                  required
                  maxLength={240}
                  value={values.title}
                  onChange={(event) =>
                    setValues({ ...values, title: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Recognition month</Trans>
                <input
                  name="month"
                  type="month"
                  required
                  readOnly={Boolean(initial)}
                  value={values.month}
                  onChange={(event) =>
                    setValues({ ...values, month: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Entry kind</Trans>
                {sourceLocked ? (
                  <input
                    readOnly
                    value={labels.entryKinds[initial.kind] ?? initial.kind}
                  />
                ) : (
                  <select
                    name="kind"
                    value={values.kind}
                    onChange={(event) => {
                      const kind = event.target.value;
                      const validCategories =
                        kind === 'REVENUE'
                          ? ['SERVICE_REVENUE']
                          : ['DIRECT_COST', 'SALARY', 'OVERHEAD'];
                      setValues({
                        ...values,
                        kind,
                        categoryChoice:
                          values.categoryChoice === 'CUSTOM' ||
                          validCategories.includes(values.categoryChoice)
                            ? values.categoryChoice
                            : kind === 'REVENUE'
                              ? 'SERVICE_REVENUE'
                              : 'DIRECT_COST',
                      });
                    }}
                  >
                    {Object.entries(labels.entryKinds).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label>
                <Trans>Category</Trans>
                {sourceLocked ? (
                  <input
                    readOnly
                    value={
                      labels.categories[initial.category] ?? initial.category
                    }
                  />
                ) : (
                  <select
                    name="categoryChoice"
                    value={values.categoryChoice}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        categoryChoice: event.target.value,
                      })
                    }
                  >
                    {categoryChoices.map((value) => (
                      <option key={value} value={value}>
                        {labels.categories[value]}
                      </option>
                    ))}
                    <option value="CUSTOM">{t`Custom category`}</option>
                  </select>
                )}
              </label>
              {!sourceLocked && values.categoryChoice === 'CUSTOM' && (
                <label>
                  <Trans>Custom category name</Trans>
                  <input
                    name="customCategory"
                    required
                    maxLength={100}
                    value={values.customCategory}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        customCategory: event.target.value,
                      })
                    }
                  />
                </label>
              )}
              <label>
                <Trans>Currency</Trans>
                <select
                  name="currency"
                  aria-label={t`Currency`}
                  disabled={Boolean(initial)}
                  value={values.currency}
                  onChange={(event) =>
                    setValues({ ...values, currency: event.target.value })
                  }
                >
                  {!labels.currencies.includes(values.currency) && (
                    <option value={values.currency}>{values.currency}</option>
                  )}
                  {labels.currencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
                {initial && (
                  <small>
                    <Trans>
                      The saved month and currency are fixed for this entry.
                    </Trans>
                  </small>
                )}
              </label>
              <label>
                <Trans>Total amount</Trans>
                <input
                  name="amount"
                  aria-label={t`Total amount`}
                  aria-describedby={`entry-amount-help-${id}`}
                  type="text"
                  inputMode="decimal"
                  required
                  readOnly={fromAiSpend}
                  maxLength={40}
                  value={values.amount}
                  onChange={(event) =>
                    setValues({ ...values, amount: event.target.value })
                  }
                />
                <small id={`entry-amount-help-${id}`}>
                  <Trans>
                    Use up to six decimal places. Zero is explicit; blank is
                    unknown.
                  </Trans>
                </small>
              </label>
            </StyledEntryFields>
            <label>
              <Trans>Source notes</Trans>
              <textarea
                name="note"
                aria-label={t`Source notes`}
                aria-describedby={
                  fromPlan ? `entry-note-help-${id}` : undefined
                }
                maxLength={12000}
                value={values.note}
                onChange={(event) =>
                  setValues({ ...values, note: event.target.value })
                }
              />
              {fromPlan && (
                <small id={`entry-note-help-${id}`}>
                  <Trans>
                    Explain any amount change from the saved plan. Salaries are
                    not prorated automatically.
                  </Trans>
                </small>
              )}
            </label>
            {!fromAiSpend && (
              <label>
                <Trans>Evidence link (optional)</Trans>
                <input
                  name="evidenceUrl"
                  type="url"
                  maxLength={2000}
                  value={values.evidenceUrl}
                  onChange={(event) =>
                    setValues({ ...values, evidenceUrl: event.target.value })
                  }
                />
              </label>
            )}
            <section aria-label={t`Client allocations`}>
              <StyledDeliveryStack>
                <h4>
                  <Trans>Allocate this entry</Trans>
                </h4>
                <p>
                  <Trans>
                    Choose each client amount explicitly. Company / unassigned
                    is a separate bucket. No equal split or currency conversion
                    is applied.
                  </Trans>
                </p>
                {allocations.map((allocation, index) => (
                  <div
                    key={allocation.id}
                    role="group"
                    aria-label={t`Allocation ${index + 1}`}
                  >
                    <StyledAllocationFields>
                      <label>
                        <Trans>Client project or company</Trans>
                        <select
                          name={`project-${allocation.id}`}
                          aria-label={t`Allocation ${index + 1} project`}
                          required
                          value={allocation.projectId}
                          onChange={(event) =>
                            setAllocations(
                              allocations.map((row) =>
                                row.id === allocation.id
                                  ? { ...row, projectId: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        >
                          <option value="">{t`Choose an allocation bucket`}</option>
                          <option
                            value={COMPANY_ALLOCATION}
                          >{t`Company / unassigned`}</option>
                          {allocation.projectId &&
                            allocation.projectId !== COMPANY_ALLOCATION &&
                            !projects.some(
                              (project) => project.id === allocation.projectId,
                            ) && (
                              <option value={allocation.projectId}>
                                {allocation.projectName ??
                                  t`Unavailable project`}
                              </option>
                            )}
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <Trans>Allocated amount</Trans>
                        <input
                          name={`amount-${allocation.id}`}
                          aria-label={t`Allocation ${index + 1} amount`}
                          aria-describedby={
                            allocationIssues[index]
                              ? `allocation-error-${allocation.id}`
                              : undefined
                          }
                          type="text"
                          inputMode="decimal"
                          required
                          maxLength={40}
                          value={allocation.amount}
                          onChange={(event) =>
                            setAllocations(
                              allocations.map((row) =>
                                row.id === allocation.id
                                  ? { ...row, amount: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <StyledDeliveryButton
                        type="button"
                        aria-label={t`Remove allocation ${index + 1}`}
                        onClick={() =>
                          setAllocations(
                            allocations.filter(
                              (row) => row.id !== allocation.id,
                            ),
                          )
                        }
                      >
                        <Trans>Remove</Trans>
                      </StyledDeliveryButton>
                    </StyledAllocationFields>
                    {allocationIssues[index] && (
                      <p id={`allocation-error-${allocation.id}`} role="status">
                        {allocationIssues[index]}
                      </p>
                    )}
                  </div>
                ))}
                <StyledDeliveryRow>
                  <StyledDeliveryButton
                    type="button"
                    disabled={allocations.length >= 100}
                    onClick={() =>
                      setAllocations([
                        ...allocations,
                        {
                          id: crypto.randomUUID(),
                          projectId: '',
                          projectName: null,
                          amount: '',
                        },
                      ])
                    }
                  >
                    <Trans>Add allocation</Trans>
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    type="button"
                    disabled={
                      !remainder ||
                      remainder.complete ||
                      remainder.overallocated ||
                      !allocationsValid ||
                      (allocations.length >= 100 &&
                        !allocations.some(
                          (allocation) =>
                            allocation.projectId === COMPANY_ALLOCATION,
                        ))
                    }
                    onClick={assignRemainderToCompany}
                  >
                    <Trans>Allocate remainder to company</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
                {remainder ? (
                  <div role="status">
                    <p>
                      {t`Allocated`}:{' '}
                      {formatFinanceAmountMicros(
                        remainder.allocatedMicros,
                        values.currency,
                        i18n.locale,
                      )}
                      {' / '}
                      {formatFinanceAmountMicros(
                        amountMicros!,
                        values.currency,
                        i18n.locale,
                      )}
                    </p>
                    {!allocationsValid ? (
                      <p>
                        <Trans>
                          Choose a valid client project or company bucket for
                          each allocation.
                        </Trans>
                      </p>
                    ) : remainder.overallocated ? (
                      <p>{t`Over-allocated by ${formatFinanceAmountMicros((-BigInt(remainder.remainingMicros)).toString(), values.currency, i18n.locale)}. Reduce the allocations before saving.`}</p>
                    ) : !remainder.complete ? (
                      <p>{t`Unallocated: ${formatFinanceAmountMicros(remainder.remainingMicros, values.currency, i18n.locale)}. This draft can be saved, but must be fully allocated before posting.`}</p>
                    ) : (
                      <p>
                        <Trans>The total is fully allocated.</Trans>
                      </p>
                    )}
                  </div>
                ) : (
                  <p>
                    <Trans>
                      Enter a total and valid allocation amounts to check the
                      split.
                    </Trans>
                  </p>
                )}
              </StyledDeliveryStack>
            </section>
            {requirements.length > 0 && (
              <div role="status">
                <p>
                  <Trans>Before saving:</Trans>
                </p>
                <ul>
                  {requirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </div>
            )}
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryRow>
          <StyledDeliveryButton
            data-primary="true"
            type="submit"
            disabled={busy || saving || !canSave}
          >
            <Trans>Save monthly draft</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            disabled={busy || saving}
            onClick={() => requestAction(onCancel)}
          >
            <Trans>Cancel</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </form>
  );
};
