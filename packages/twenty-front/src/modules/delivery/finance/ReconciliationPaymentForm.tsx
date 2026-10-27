import { useCallback, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { isValidUrl } from 'twenty-shared/utils';
import {
  type DeliveryFinancePaymentInput,
  type DeliveryFinanceQuery,
} from '~/generated-metadata/graphql';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  formatFinanceAmountMicros,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { useReconciliationLabels } from '@/delivery/finance/useReconciliationLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ReconciliationPaymentFormProps = {
  date: string;
  currency: string;
  projects: DeliveryFinanceQuery['deliveryFinance']['projects'];
  invoice?: {
    id: string;
    title: string;
    currency: string;
    projectId?: string | null;
  } | null;
  busy: boolean;
  readOnly?: boolean;
  onSave: (input: DeliveryFinancePaymentInput) => Promise<boolean>;
  onCancel: () => void;
};
const StyledPaymentFields = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const ReconciliationPaymentForm = ({
  date,
  currency,
  projects,
  invoice,
  busy,
  readOnly = false,
  onSave,
  onCancel,
}: ReconciliationPaymentFormProps) => {
  const { t, i18n } = useLingui();
  const financeLabels = useFinanceLabels();
  const labels = useReconciliationLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState(() => ({
    title: invoice?.title ?? '',
    category: 'INCOME',
    currency: invoice?.currency ?? currency,
    amount: '',
    date,
    projectId: invoice?.projectId ?? '',
    note: '',
    evidenceUrl: '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: values,
    busy: busy || saving,
  });
  const registerForm = draft.formRef;
  const attachForm = useCallback(
    (form: HTMLFormElement | null) => {
      registerForm(form);
      form?.querySelector<HTMLInputElement>('[name="title"]')?.focus();
    },
    [registerForm],
  );
  const amountMicros = parseFinanceAmountMicros(values.amount);
  const amountValid =
    amountMicros !== null &&
    isFinanceAmountMicrosWithinLimit(amountMicros) &&
    BigInt(amountMicros) > 0n &&
    BigInt(amountMicros) <= 1000000000000000n &&
    BigInt(amountMicros) % 10000n === 0n;
  const today = new Date().toISOString().slice(0, 10);
  const parsedDate = new Date(`${values.date}T00:00:00.000Z`);
  const dateValid =
    /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(values.date) &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === values.date &&
    values.date <= today;
  const evidenceUrl = values.evidenceUrl.trim();
  const requirements = [
    ...(!values.title.trim() ? [t`Give this payment a title.`] : []),
    ...(!Object.hasOwn(labels.categories, values.category)
      ? [t`Choose the payment direction.`]
      : []),
    ...(!financeLabels.currencies.includes(values.currency)
      ? [t`Choose a supported currency.`]
      : []),
    ...(!amountValid
      ? [
          t`Enter the actual positive payment amount with no more than two decimal places, within the supported cash limit.`,
        ]
      : []),
    ...(!dateValid
      ? [t`Choose a valid actual payment date no later than today (UTC).`]
      : []),
    ...(values.projectId &&
    !projects.some((project) => project.id === values.projectId)
      ? [t`Choose an available client project or company.`]
      : []),
    ...(!values.note.trim() && !evidenceUrl
      ? [t`Add payment notes or an evidence link.`]
      : []),
    ...(evidenceUrl &&
    (!/^https?:\/\//.test(evidenceUrl) || !isValidUrl(evidenceUrl))
      ? [t`Use a valid http or https evidence link, or leave it blank.`]
      : []),
  ];
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      busy ||
      saving ||
      readOnly ||
      !draft.dirty ||
      requirements.length ||
      !amountValid ||
      amountMicros === null
    )
      return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        id,
        title: values.title.trim(),
        category: values.category,
        currency: values.currency,
        amountMicros,
        date: values.date,
        projectId: values.projectId || null,
        note: values.note.trim(),
        evidenceUrl: evidenceUrl || null,
      });
      if (saved) draft.markSaved(values);
      else
        setError(
          t`The payment was not confirmed recorded. Your draft is kept; check existing payments before retrying.`,
        );
    } catch {
      setError(t`The payment could not be recorded. Your draft is kept.`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      ref={attachForm}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={t`Record actual payment`}
    >
      <StyledDeliveryStack>
        <h3>
          <Trans>Record actual payment</Trans>
        </h3>
        <p>
          <Trans>
            Record money that actually moved. This does not send money, settle
            an invoice or recognize monthly revenue or costs. Matching is a
            separate step.
          </Trans>
        </p>
        {invoice && (
          <p>
            <Trans>Invoice context:</Trans> {invoice.title}.{' '}
            <Trans>No amount or invoice settlement is assumed.</Trans>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {readOnly && (
          <p role="status">
            <Trans>
              Editing is unavailable. Your draft is kept, and you can close it
              without saving.
            </Trans>
          </p>
        )}
        <fieldset disabled={busy || saving || readOnly}>
          <StyledDeliveryStack>
            <StyledPaymentFields>
              <label>
                <Trans>Payment title</Trans>
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
                <Trans>Payment direction</Trans>
                <select
                  name="category"
                  value={values.category}
                  onChange={(event) =>
                    setValues({ ...values, category: event.target.value })
                  }
                >
                  {Object.entries(labels.categories).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Currency</Trans>
                <select
                  name="currency"
                  value={values.currency}
                  onChange={(event) =>
                    setValues({ ...values, currency: event.target.value })
                  }
                >
                  {!financeLabels.currencies.includes(values.currency) && (
                    <option
                      value={values.currency}
                    >{t`Unsupported currency`}</option>
                  )}
                  {financeLabels.currencies.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Actual payment amount</Trans>
                <input
                  name="amount"
                  aria-label={t`Actual payment amount`}
                  aria-describedby={`payment-amount-${id}`}
                  inputMode="decimal"
                  required
                  value={values.amount}
                  onChange={(event) =>
                    setValues({ ...values, amount: event.target.value })
                  }
                />
                <small id={`payment-amount-${id}`}>
                  <Trans>Maximum:</Trans>{' '}
                  {formatFinanceAmountMicros(
                    '1000000000000000',
                    values.currency,
                    i18n.locale,
                  )}
                  . <Trans>Use no more than two decimal places.</Trans>
                </small>
              </label>
              <label>
                <Trans>Actual payment date</Trans>
                <input
                  name="date"
                  type="date"
                  max={today}
                  aria-label={t`Actual payment date`}
                  aria-describedby={`payment-date-${id}`}
                  required
                  value={values.date}
                  onChange={(event) =>
                    setValues({ ...values, date: event.target.value })
                  }
                />
                <small id={`payment-date-${id}`}>
                  <Trans>Payment dates use UTC ledger days.</Trans>
                </small>
              </label>
              <label>
                <Trans>Client project</Trans>
                <select
                  name="projectId"
                  value={values.projectId}
                  onChange={(event) =>
                    setValues({ ...values, projectId: event.target.value })
                  }
                >
                  <option value="">{t`Company / unassigned`}</option>
                  {values.projectId &&
                    !projects.some(
                      (project) => project.id === values.projectId,
                    ) && (
                      <option
                        value={values.projectId}
                      >{t`Unavailable project`}</option>
                    )}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Payment evidence link</Trans>
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
              <label>
                <Trans>Payment notes</Trans>
                <textarea
                  name="note"
                  maxLength={10000}
                  value={values.note}
                  onChange={(event) =>
                    setValues({ ...values, note: event.target.value })
                  }
                />
              </label>
            </StyledPaymentFields>
            {requirements.length > 0 && (
              <ul aria-label={t`Payment requirements`}>
                {requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            )}
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={
              busy ||
              saving ||
              readOnly ||
              !draft.dirty ||
              requirements.length > 0
            }
          >
            <Trans>Record payment</Trans>
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
