import { useCallback, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import {
  type DeliveryFinanceQuery,
  type DeliveryFinancePlanInput,
} from '~/generated-metadata/graphql';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  financeAmountMicrosToDecimal,
  isFinanceAmountMicrosWithinLimit,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceSnapshot = DeliveryFinanceQuery['deliveryFinance'];
type FinancePlanFormProps = {
  initial: FinanceSnapshot['plans'][number] | null;
  month: string;
  members: FinanceSnapshot['members'];
  busy: boolean;
  readOnly?: boolean;
  latestRevision: number;
  onSave: (input: DeliveryFinancePlanInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
const StyledPlanFields = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const FinancePlanForm = ({
  initial,
  month,
  members,
  busy,
  readOnly = false,
  latestRevision,
  onSave,
  onCancel,
  onReload,
}: FinancePlanFormProps) => {
  const { t } = useLingui();
  const labels = useFinanceLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [openedRevision] = useState(initial?.revision ?? 0);
  const [values, setValues] = useState({
    type: initial?.type ?? 'SALARY',
    name: initial?.name ?? '',
    currency: initial?.currency ?? 'USD',
    monthlyAmount: initial
      ? financeAmountMicrosToDecimal(initial.monthlyAmountMicros)
      : '',
    memberId: initial?.memberId ?? '',
    startMonth: initial?.startMonth ?? month,
    endMonth: initial?.endMonth ?? '',
    dueDay: String(initial?.dueDay ?? 1),
    active: initial?.active ?? true,
  });
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
      form?.querySelector<HTMLInputElement>('[name="name"]')?.focus();
    },
    [registerForm],
  );
  const stale = initial !== null && latestRevision !== openedRevision;
  const monthlyAmountMicros = parseFinanceAmountMicros(values.monthlyAmount);
  const dueDay = Number(values.dueDay);
  const activeMember = members.some((member) => member.id === values.memberId);
  const departedMember = Boolean(
    initial?.memberId &&
    !members.some((member) => member.id === initial.memberId),
  );
  const validMonth = (value: string) =>
    /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const requirements = [
    ...(!values.name.trim() ? [t`Name this monthly cost plan.`] : []),
    ...(!['SALARY', 'OVERHEAD'].includes(values.type)
      ? [t`Choose salary or overhead.`]
      : []),
    ...(!labels.currencies.includes(values.currency)
      ? [t`Choose a supported currency.`]
      : []),
    ...(monthlyAmountMicros === null ||
    !isFinanceAmountMicrosWithinLimit(monthlyAmountMicros)
      ? [
          t`Enter a nonnegative monthly amount with up to six decimal places within the supported limit.`,
        ]
      : []),
    ...(!validMonth(values.startMonth) ? [t`Choose a valid first month.`] : []),
    ...(values.endMonth &&
    (!validMonth(values.endMonth) || values.endMonth < values.startMonth)
      ? [t`The last month must be the first month or later.`]
      : []),
    ...(!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31
      ? [t`Choose a due day from 1 to 31.`]
      : []),
    ...(values.type === 'SALARY' && !values.memberId
      ? [t`Choose the employee whose salary this plan records.`]
      : []),
    ...(values.type === 'SALARY' &&
    values.memberId &&
    !activeMember &&
    (values.active || initial?.memberId !== values.memberId)
      ? [
          t`Choose an active employee, or keep this former employee with the plan inactive.`,
        ]
      : []),
  ];
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      busy ||
      saving ||
      readOnly ||
      stale ||
      !draft.dirty ||
      requirements.length ||
      monthlyAmountMicros === null
    )
      return;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        id,
        revision: openedRevision,
        type: values.type,
        name: values.name.trim(),
        currency: values.currency,
        monthlyAmountMicros,
        memberId: values.type === 'SALARY' ? values.memberId : null,
        startMonth: values.startMonth,
        endMonth: values.endMonth || null,
        dueDay,
        active: values.active,
      });
      if (saved) draft.markSaved(values);
      else
        setError(
          t`The monthly plan was not confirmed saved. Your draft is kept; check for newer changes and retry.`,
        );
    } catch {
      setError(t`The monthly plan could not be saved. Your draft is kept.`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      ref={attachForm}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={t`Monthly cost plan`}
    >
      <StyledDeliveryStack>
        <h3>
          {initial ? t`Edit monthly cost plan` : t`New monthly cost plan`}
        </h3>
        <p>
          <Trans>
            This plan prepares a reviewable monthly cost. Saving does not record
            a payment or change posted history. The full monthly amount applies;
            no automatic proration is made.
          </Trans>
        </p>
        {stale && (
          <DeliveryDraftConflict
            busy={busy || saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
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
        <fieldset disabled={busy || saving || stale || readOnly}>
          <StyledDeliveryStack>
            <StyledPlanFields>
              <label>
                <Trans>Plan name</Trans>
                <input
                  name="name"
                  required
                  maxLength={240}
                  value={values.name}
                  onChange={(event) =>
                    setValues({ ...values, name: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Cost type</Trans>
                <select
                  name="type"
                  value={values.type}
                  onChange={(event) =>
                    setValues({ ...values, type: event.target.value })
                  }
                >
                  {Object.entries(labels.planTypes).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {values.type === 'SALARY' && (
                <label>
                  <Trans>Employee</Trans>
                  <select
                    name="memberId"
                    required
                    value={values.memberId}
                    onChange={(event) =>
                      setValues({ ...values, memberId: event.target.value })
                    }
                  >
                    <option value="">{t`Choose an employee`}</option>
                    {departedMember && initial?.memberId && (
                      <option value={initial.memberId}>
                        {initial.memberName ?? t`Former employee`}
                        {' · '}
                        {t`Inactive`}
                      </option>
                    )}
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <Trans>Currency</Trans>
                <select
                  name="currency"
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
              </label>
              <label>
                <Trans>Monthly amount</Trans>
                <input
                  name="monthlyAmount"
                  aria-label={t`Monthly amount`}
                  aria-describedby={`plan-amount-help-${id}`}
                  type="text"
                  inputMode="decimal"
                  required
                  maxLength={40}
                  value={values.monthlyAmount}
                  onChange={(event) =>
                    setValues({ ...values, monthlyAmount: event.target.value })
                  }
                />
                <small id={`plan-amount-help-${id}`}>
                  <Trans>
                    Use up to six decimal places. Zero is an explicit amount.
                  </Trans>
                </small>
              </label>
              <label>
                <Trans>First month</Trans>
                <input
                  name="startMonth"
                  type="month"
                  required
                  value={values.startMonth}
                  onChange={(event) =>
                    setValues({ ...values, startMonth: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Last month (optional)</Trans>
                <input
                  name="endMonth"
                  type="month"
                  min={values.startMonth || undefined}
                  value={values.endMonth}
                  onChange={(event) =>
                    setValues({ ...values, endMonth: event.target.value })
                  }
                />
              </label>
              <label>
                <Trans>Due day each month</Trans>
                <input
                  name="dueDay"
                  aria-label={t`Due day each month`}
                  aria-describedby={`plan-due-help-${id}`}
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  required
                  value={values.dueDay}
                  onChange={(event) =>
                    setValues({ ...values, dueDay: event.target.value })
                  }
                />
                <small id={`plan-due-help-${id}`}>
                  <Trans>Shorter months use their last calendar day.</Trans>
                </small>
              </label>
            </StyledPlanFields>
            <label>
              <input
                name="active"
                type="checkbox"
                checked={values.active}
                onChange={(event) =>
                  setValues({ ...values, active: event.target.checked })
                }
              />
              <Trans>Active for monthly draft preparation</Trans>
            </label>
            {departedMember &&
              values.type === 'SALARY' &&
              values.memberId === initial?.memberId && (
                <p role="status">
                  <Trans>
                    This employee is no longer active. Keep the plan inactive to
                    retain its history; choose an active employee before using
                    it for future preparation.
                  </Trans>
                </p>
              )}
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
            disabled={
              busy ||
              saving ||
              readOnly ||
              stale ||
              !draft.dirty ||
              requirements.length > 0
            }
          >
            <Trans>Save monthly plan</Trans>
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
