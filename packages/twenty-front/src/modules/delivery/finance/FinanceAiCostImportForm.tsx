import { useCallback, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import { type DeliveryFinanceAiCostPrepareInput } from '~/generated-metadata/graphql';
import {
  type FinanceAiCostSource,
  type FinanceAiCostSnapshot,
} from '@/delivery/finance/finance-ai-cost.types';
import { useFinanceAiCostLabels } from '@/delivery/finance/useFinanceAiCostLabels';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import { useFinanceRecognitionAvailability } from '@/delivery/finance/useFinanceRecognitionAvailability';
import { FinanceRecognitionNotice } from '@/delivery/finance/FinanceRecognitionNotice';
import {
  financeAllocationRemainder,
  financeAmountMicrosToDecimal,
  formatFinanceAmountMicros,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type AllocationDraft = { id: string; projectId: string; amount: string };
type FinanceAiCostImportFormProps = {
  source: FinanceAiCostSource;
  projects: FinanceAiCostSnapshot['projects'];
  month: string;
  busy: boolean;
  readOnly: boolean;
  onSave: (input: DeliveryFinanceAiCostPrepareInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
const COMPANY_BUCKET = 'COMPANY';
const StyledAiCostFields = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
const StyledAiAllocationFields = styled.div`
  align-items: end;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const FinanceAiCostImportForm = ({
  source,
  projects,
  month,
  busy,
  readOnly,
  onSave,
  onCancel,
  onReload,
}: FinanceAiCostImportFormProps) => {
  const { t } = useLingui();
  const labels = useFinanceAiCostLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => crypto.randomUUID());
  const [openedSource] = useState(() => ({
    token: source.sourceReviewToken,
    claimRevision: source.claim.revision,
    replacement:
      source.claim.currentEntry?.status === 'POSTED'
        ? source.claim.currentEntry
        : null,
  }));
  const [values, setValues] = useState(() => ({
    month: openedSource.replacement?.month ?? month,
    title: t`AI cost — ${source.modelId}`,
    evidenceId: '',
    note: '',
    reason: '',
    sourceAcknowledged: false,
    noDuplicateAcknowledged: false,
  }));
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const recognitionAvailability = useFinanceRecognitionAvailability(
    values.month,
    openedSource.replacement?.month,
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
      form?.querySelector<HTMLSelectElement>('[name="evidenceId"]')?.focus();
    },
    [registerForm],
  );
  const stale =
    openedSource.token !== source.sourceReviewToken ||
    openedSource.claimRevision !== source.claim.revision;
  const evidence = source.evidenceOptions.find(
    (item) => item.id === values.evidenceId,
  );
  const amounts = allocations.map((allocation) =>
    parseFinanceAmountMicros(allocation.amount),
  );
  const allocationsValid = allocations.every(
    (allocation, index) =>
      allocation.projectId !== '' &&
      (allocation.projectId === COMPANY_BUCKET ||
        projects.some((project) => project.id === allocation.projectId)) &&
      !allocations.some(
        (other, otherIndex) =>
          otherIndex !== index && other.projectId === allocation.projectId,
      ) &&
      isDefined(amounts[index]) &&
      isFinanceAmountMicrosWithinLimit(amounts[index]!),
  );
  const remainder =
    evidence && allocationsValid
      ? financeAllocationRemainder(
          evidence.amountMicros,
          amounts.filter(isDefined),
        )
      : null;
  const existingDraft =
    source.claim.currentEntry?.status === 'DRAFT' ||
    source.claim.replacementEntry?.status === 'DRAFT';
  const requirements = [
    ...(!source.eligible
      ? [t`This charge is unavailable for import. Review its source warnings.`]
      : []),
    ...(existingDraft
      ? [t`An AI-cost draft already exists. Open it before creating another.`]
      : []),
    ...(!evidence ? [t`Choose the recorded financial event to use.`] : []),
    ...(!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(values.month)
      ? [t`Choose a valid service month.`]
      : []),
    ...(!values.title.trim() ? [t`Give this AI cost a title.`] : []),
    ...(!allocations.length || !allocationsValid || allocations.length > 100
      ? [t`Choose valid client or company amounts, using each allocation once.`]
      : []),
    ...(remainder?.overallocated
      ? [t`Allocations cannot exceed the recorded amount.`]
      : []),
    ...(!values.noDuplicateAcknowledged
      ? [
          t`Check that this charge is not already included in a separate manual cost.`,
        ]
      : []),
    ...(source.sourceWarnings.length > 0 && !values.sourceAcknowledged
      ? [t`Acknowledge the source warnings before saving.`]
      : []),
    ...(openedSource.replacement && !values.reason.trim()
      ? [t`Explain why the posted AI cost needs a replacement.`]
      : []),
  ];
  const canSave =
    !readOnly &&
    recognitionAvailability.available &&
    recognitionAvailability.canManage &&
    recognitionAvailability.lockedMonths.length === 0 &&
    !stale &&
    draft.dirty &&
    requirements.length === 0 &&
    remainder !== null;
  const assignCompany = () => {
    if (readOnly || !remainder || remainder.overallocated || !allocationsValid)
      return;
    const company = allocations.find(
      (allocation) => allocation.projectId === COMPANY_BUCKET,
    );
    if (company) {
      const current = parseFinanceAmountMicros(company.amount);
      if (current === null) return;
      const next = (
        BigInt(current) + BigInt(remainder.remainingMicros)
      ).toString();
      if (!isFinanceAmountMicrosWithinLimit(next)) return;
      setAllocations(
        allocations.map((allocation) =>
          allocation.id === company.id
            ? { ...allocation, amount: financeAmountMicrosToDecimal(next) }
            : allocation,
        ),
      );
    } else if (allocations.length < 100)
      setAllocations([
        ...allocations,
        {
          id: crypto.randomUUID(),
          projectId: COMPANY_BUCKET,
          amount: financeAmountMicrosToDecimal(remainder.remainingMicros),
        },
      ]);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || busy || saving || !evidence) return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        id,
        spendId: source.id,
        evidenceEventId: evidence.id,
        expectedSourceReviewToken: openedSource.token,
        expectedClaimRevision: openedSource.claimRevision,
        month: values.month,
        title: values.title.trim(),
        note: values.note.trim(),
        acknowledgeSourceWarnings: values.sourceAcknowledged,
        acknowledgeNoDuplicateCost: values.noDuplicateAcknowledged,
        replacesEntryId: openedSource.replacement?.id ?? null,
        expectedReplacedEntryRevision:
          openedSource.replacement?.revision ?? null,
        correctionReason: openedSource.replacement
          ? values.reason.trim()
          : null,
        allocations: allocations.map((allocation, index) => ({
          projectId:
            allocation.projectId === COMPANY_BUCKET
              ? null
              : allocation.projectId,
          amountMicros: amounts[index]!,
        })),
      });
      if (saved) draft.markSaved({ values, allocations });
      else
        setError(
          t`The AI-cost draft was not confirmed saved. Your review is kept; refresh the source before retrying.`,
        );
    } catch {
      setError(t`The AI-cost draft could not be saved. Your review is kept.`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      ref={attachForm}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={t`AI-cost recognition draft`}
    >
      <StyledDeliveryStack>
        <h3>
          {openedSource.replacement
            ? t`Prepare a reviewed AI-cost correction`
            : t`Prepare an AI-cost draft`}
        </h3>
        {openedSource.replacement && (
          <p>
            <Trans>
              The existing posted cost remains in results until this replacement
              is explicitly posted. Posting will void the prior entry and
              reverse its monthly cash matches, without changing payments.
            </Trans>{' '}
            {openedSource.replacement.month} ·{' '}
            {formatFinanceAmountMicros(
              openedSource.replacement.amountMicros,
              source.currency,
            )}
          </p>
        )}
        <p>
          <Trans>
            Choose financial evidence and allocate its recorded amount. This is
            an internal ledger charge, not a verified provider invoice. Saving
            creates a draft; posting is a separate review.
          </Trans>
        </p>
        {stale && (
          <DeliveryDraftConflict
            busy={busy || saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {readOnly && (
          <p role="status">
            <Trans>
              Editing is unavailable. Your draft is kept, and Cancel remains
              available.
            </Trans>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <FinanceRecognitionNotice availability={recognitionAvailability} />
        <fieldset disabled={busy || saving || stale || readOnly}>
          <StyledDeliveryStack>
            <StyledAiCostFields>
              <label>
                <Trans>Recorded financial event</Trans>
                <select
                  name="evidenceId"
                  value={values.evidenceId}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      evidenceId: event.target.value,
                      sourceAcknowledged: false,
                    })
                  }
                  required
                >
                  <option value="">{t`Choose evidence and amount`}</option>
                  {source.evidenceOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {labels.basis(item.basis)} ·{' '}
                      {formatFinanceAmountMicros(
                        item.amountMicros,
                        source.currency,
                      )}{' '}
                      · {new Date(item.recordedAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Recorded AI amount</Trans>
                <input
                  readOnly
                  value={
                    evidence
                      ? formatFinanceAmountMicros(
                          evidence.amountMicros,
                          source.currency,
                        )
                      : ''
                  }
                />
              </label>
              <label>
                <Trans>Service month</Trans>
                <input
                  name="month"
                  type="month"
                  required
                  value={values.month}
                  onChange={(event) =>
                    setValues({ ...values, month: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Cost title</Trans>
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
            </StyledAiCostFields>
            {evidence?.basis === 'MANUAL_EVIDENCE' && (
              <p>
                <Trans>
                  An administrator recorded this amount. Private supporting
                  budget evidence is excluded. Add your own finance review notes
                  without claiming to have inspected private provider evidence.
                </Trans>
              </p>
            )}
            <label>
              <Trans>Finance review notes</Trans>
              <textarea
                name="note"
                maxLength={12000}
                value={values.note}
                onChange={(event) =>
                  setValues({ ...values, note: event.target.value })
                }
              />
            </label>
            {openedSource.replacement && (
              <label>
                <Trans>Reason for correcting the posted cost</Trans>
                <textarea
                  name="reason"
                  required
                  maxLength={2000}
                  value={values.reason}
                  onChange={(event) =>
                    setValues({ ...values, reason: event.target.value })
                  }
                />
              </label>
            )}
            <section aria-label={t`AI-cost allocations`}>
              <StyledDeliveryStack>
                <h4>
                  <Trans>Allocate this cost</Trans>
                </h4>
                <p>
                  <Trans>
                    Choose each client or company amount explicitly. An
                    unfinished draft can keep an unallocated remainder; posting
                    requires the exact full allocation.
                  </Trans>
                </p>
                {allocations.map((allocation, index) => (
                  <StyledAiAllocationFields key={allocation.id}>
                    <label>
                      {t`Allocation ${index + 1} client`}
                      <select
                        aria-label={t`Allocation ${index + 1} client`}
                        value={allocation.projectId}
                        onChange={(event) =>
                          setAllocations(
                            allocations.map((item) =>
                              item.id === allocation.id
                                ? { ...item, projectId: event.target.value }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="">{t`Choose client or company`}</option>
                        <option
                          value={COMPANY_BUCKET}
                        >{t`Company / unassigned`}</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t`Allocation ${index + 1} amount`}
                      <input
                        aria-label={t`Allocation ${index + 1} amount`}
                        inputMode="decimal"
                        maxLength={40}
                        value={allocation.amount}
                        onChange={(event) =>
                          setAllocations(
                            allocations.map((item) =>
                              item.id === allocation.id
                                ? { ...item, amount: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        setAllocations(
                          allocations.filter(
                            (item) => item.id !== allocation.id,
                          ),
                        )
                      }
                    >{t`Remove allocation ${index + 1}`}</StyledDeliveryButton>
                  </StyledAiAllocationFields>
                ))}
                {remainder && (
                  <p role="status">
                    {t`Unallocated`}:{' '}
                    {formatFinanceAmountMicros(
                      remainder.remainingMicros,
                      source.currency,
                    )}
                  </p>
                )}
                <StyledDeliveryRow>
                  <StyledDeliveryButton
                    type="button"
                    disabled={allocations.length >= 100}
                    onClick={() =>
                      setAllocations([
                        ...allocations,
                        { id: crypto.randomUUID(), projectId: '', amount: '' },
                      ])
                    }
                  >
                    <Trans>Add allocation</Trans>
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    type="button"
                    disabled={
                      !remainder ||
                      remainder.overallocated ||
                      (remainder.complete && allocations.length > 0)
                    }
                    onClick={assignCompany}
                  >
                    <Trans>Assign remaining amount to company</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
              </StyledDeliveryStack>
            </section>
            {source.sourceWarnings.map((warning) => (
              <p key={warning} role="status">
                {labels.warning(warning)}
              </p>
            ))}
            {source.sourceWarnings.length > 0 && (
              <label>
                <input
                  type="checkbox"
                  checked={values.sourceAcknowledged}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      sourceAcknowledged: event.target.checked,
                    })
                  }
                />
                <Trans>
                  I understand the source warnings and selected the financial
                  evidence to use.
                </Trans>
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={values.noDuplicateAcknowledged}
                onChange={(event) =>
                  setValues({
                    ...values,
                    noDuplicateAcknowledged: event.target.checked,
                  })
                }
              />
              <Trans>
                I checked that this charge is not already included in a separate
                manual cost.
              </Trans>
            </label>
            {requirements.length > 0 && (
              <ul>
                {requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            )}
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={!canSave || busy || saving}
            >
              <Trans>Save AI-cost draft</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={busy || saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
