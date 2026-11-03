import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type DeliveryFounderEscalationRuleDraftInput,
  type DeliveryFounderEscalationRuleSaveInput,
} from '~/generated-metadata/graphql';
import {
  type EscalationRule,
  type EscalationSnapshot,
} from '@/delivery/founder/escalation/escalation.types';
import { useEscalationLabels } from '@/delivery/founder/escalation/useEscalationLabels';
import { EscalationPreview } from '@/delivery/founder/escalation/EscalationPreview';
import { StyledEscalationFields } from '@/delivery/founder/escalation/escalationStyles';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDraftConflict } from '@/delivery/drafts/DeliveryDraftConflict';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type EscalationRuleFormProps = {
  initial: EscalationRule | null;
  catalog: EscalationSnapshot;
  identity: string;
  readOnly: boolean;
  onSave: (input: DeliveryFounderEscalationRuleSaveInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const EscalationRuleForm = ({
  initial,
  catalog,
  identity,
  readOnly,
  onSave,
  onCancel,
  onReload,
}: EscalationRuleFormProps) => {
  const { t } = useLingui();
  const labels = useEscalationLabels();
  const financeLabels = useFinanceLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [commandId] = useState(() => crypto.randomUUID());
  const [revision] = useState(initial?.revision ?? 0);
  const [values, setValues] = useState({
    name: initial?.name ?? '',
    condition: initial?.condition ?? '',
    minimumReviewWaitHours: initial?.minimumReviewWaitHours
      ? String(initial.minimumReviewWaitHours)
      : '',
    recipientId: initial?.recipientId ?? '',
    priority: initial?.priority ?? 'NORMAL',
    projectScope: initial?.projectScope ?? '',
    projectIds: initial?.projectIds ?? [],
    includeCompany: initial?.includeCompany ?? false,
    currency: initial?.currency ?? '',
    serviceMonth: initial?.serviceMonth ?? '',
    repeatMode: initial?.repeatMode ?? 'ONCE',
    repeatHours: initial?.repeatHours ? String(initial.repeatHours) : '',
    maxSends:
      initial?.repeatMode === 'INTERVAL' ? String(initial.maxSends) : '',
    reason: '',
  });
  const [preview, setPreview] = useState<{
    input: DeliveryFounderEscalationRuleDraftInput;
    requestId: string;
  } | null>(null);
  const [attempt, setAttempt] = useState<{
    input: DeliveryFounderEscalationRuleSaveInput;
    identity: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const draft = useDeliveryNativeDraft({
    extraValues: { values, attempt },
    busy: saving,
  });
  const stale = revision !== (initial?.revision ?? 0);
  const condition = catalog.conditions.find(
    (item) => item.code === values.condition,
  );
  const monetary = ['FINANCE', 'CAMPAIGNS'].includes(condition?.domain ?? '');
  const interval = values.repeatMode === 'INTERVAL';
  const hours = Number(values.repeatHours);
  const maxSends = Number(values.maxSends);
  const reviewWaitHours = Number(values.minimumReviewWaitHours);
  const valid = Boolean(
    values.name.trim() &&
    condition &&
    (condition.code !== 'TASK_REVIEW_WAIT' ||
      (Number.isInteger(reviewWaitHours) &&
        reviewWaitHours >= 1 &&
        reviewWaitHours <= 720)) &&
    catalog.recipients.some(
      (recipient) => recipient.id === values.recipientId,
    ) &&
    ['NORMAL', 'URGENT'].includes(values.priority) &&
    ['ALL', 'SELECTED'].includes(values.projectScope) &&
    (values.projectScope === 'ALL' ||
      ((values.projectIds.length > 0 || values.includeCompany) &&
        values.projectIds.length <= 100 &&
        values.projectIds.every((projectId) =>
          catalog.projects.some((project) => project.id === projectId),
        ))) &&
    (!values.currency ||
      (monetary && financeLabels.currencies.includes(values.currency))) &&
    (!condition?.requiresServiceMonth ||
      /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(values.serviceMonth)) &&
    ['ONCE', 'INTERVAL'].includes(values.repeatMode) &&
    (!interval ||
      (Number.isInteger(hours) &&
        hours >= 1 &&
        hours <= 720 &&
        Number.isInteger(maxSends) &&
        maxSends >= 2 &&
        maxSends <= 20)),
  );
  const input: DeliveryFounderEscalationRuleDraftInput | null = valid
    ? {
        id,
        revision,
        name: values.name.trim(),
        condition: values.condition,
        minimumReviewWaitHours:
          values.condition === 'TASK_REVIEW_WAIT' &&
          values.minimumReviewWaitHours
            ? reviewWaitHours
            : null,
        recipientId: values.recipientId,
        priority: values.priority,
        projectScope: values.projectScope,
        projectIds: values.projectScope === 'ALL' ? [] : values.projectIds,
        includeCompany: values.includeCompany,
        currency: monetary ? values.currency || null : null,
        serviceMonth: condition?.requiresServiceMonth
          ? values.serviceMonth
          : null,
        repeatMode: values.repeatMode,
        repeatHours: interval ? hours : null,
        maxSends: interval ? maxSends : 1,
      }
    : null;
  const change = (patch: Partial<typeof values>) => {
    setValues((previous) => ({ ...previous, ...patch }));
    setPreview(null);
  };
  const send = async (request: {
    input: DeliveryFounderEscalationRuleSaveInput;
    identity: string;
  }) => {
    if (saving || readOnly || request.identity !== identity) return;
    setAttempt(request);
    setSaving(true);
    setError('');
    try {
      if (await onSave(request.input)) {
        setAttempt(null);
        draft.markSaved({ values, attempt: null });
      } else
        setError(
          t`The paused save was not confirmed. Check the earlier request before starting another change.`,
        );
    } catch {
      setError(
        t`The response was not confirmed. Your original paused-save request is kept.`,
      );
    } finally {
      setSaving(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (input && values.reason.trim() && !stale && !attempt)
      await send({
        input: { ...input, commandId, reason: values.reason.trim() },
        identity,
      });
  };
  return (
    <form
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={t`Founder alert rule configuration`}
    >
      <StyledDeliveryStack>
        <h3>
          {initial ? t`Edit founder alert rule` : t`New founder alert rule`}
        </h3>
        <p>
          <Trans>
            Saving always pauses this rule. Previewing reads evidence only;
            enabling and adopting routing are separate decisions.
          </Trans>
        </p>
        {stale && (
          <DeliveryDraftConflict
            busy={saving || readOnly}
            onReload={() => requestAction(onReload)}
          />
        )}
        {error && <p role="alert">{error}</p>}
        {attempt && (
          <StyledDeliveryButton
            type="button"
            disabled={saving || readOnly || attempt.identity !== identity}
            onClick={() => void send(attempt)}
          >
            <Trans>Check earlier paused save</Trans>
          </StyledDeliveryButton>
        )}
        <fieldset disabled={saving || readOnly || stale || Boolean(attempt)}>
          <StyledDeliveryStack>
            <StyledEscalationFields>
              <label>
                <Trans>Rule name</Trans>
                <input
                  name="name"
                  required
                  maxLength={160}
                  value={values.name}
                  onChange={(event) => change({ name: event.target.value })}
                />
              </label>
              <label>
                <Trans>Notify for one factual condition</Trans>
                <select
                  name="condition"
                  required
                  value={values.condition}
                  onChange={(event) => {
                    const selected = catalog.conditions.find(
                      (item) => item.code === event.target.value,
                    );
                    change({
                      condition: event.target.value,
                      minimumReviewWaitHours:
                        event.target.value === 'TASK_REVIEW_WAIT'
                          ? values.minimumReviewWaitHours
                          : '',
                      serviceMonth: selected?.requiresServiceMonth
                        ? values.serviceMonth
                        : '',
                      currency: ['FINANCE', 'CAMPAIGNS'].includes(
                        selected?.domain ?? '',
                      )
                        ? values.currency
                        : '',
                    });
                  }}
                >
                  <option value="">{t`Choose a condition`}</option>
                  {catalog.conditions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {labels.domains[item.domain] ?? t`Area`} ·{' '}
                      {labels.reason(item.code)}
                    </option>
                  ))}
                </select>
              </label>
              {values.condition === 'TASK_REVIEW_WAIT' && (
                <label>
                  <Trans>Minimum pending review wait in hours</Trans>
                  <input
                    aria-label={t`Minimum pending review wait in hours`}
                    name="minimumReviewWaitHours"
                    type="number"
                    min={1}
                    max={720}
                    step={1}
                    required
                    value={values.minimumReviewWaitHours}
                    onChange={(event) =>
                      change({ minimumReviewWaitHours: event.target.value })
                    }
                  />
                  <small>
                    <Trans>
                      Choose 1–720 hours since submission. Unknown or future
                      times cannot trigger this alert. A newer submission starts
                      its own wait. This is separate from repeat timing.
                    </Trans>
                  </small>
                </label>
              )}
              <label>
                <Trans>Alert follow-up owner and Telegram recipient</Trans>
                <select
                  name="recipientId"
                  required
                  value={values.recipientId}
                  onChange={(event) =>
                    change({ recipientId: event.target.value })
                  }
                >
                  <option value="">{t`Choose an active administrator`}</option>
                  {values.recipientId &&
                    !catalog.recipients.some(
                      (recipient) => recipient.id === values.recipientId,
                    ) && (
                      <option
                        value={values.recipientId}
                      >{t`Previous recipient is unavailable`}</option>
                    )}
                  {catalog.recipients.map((recipient) => (
                    <option key={recipient.id} value={recipient.id}>
                      {recipient.name} ·{' '}
                      {catalog.linkedRecipientIds.includes(recipient.id)
                        ? t`Telegram linked`
                        : t`Telegram not linked`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Trans>Chosen priority</Trans>
                <select
                  name="priority"
                  value={values.priority}
                  onChange={(event) => change({ priority: event.target.value })}
                >
                  <option value="NORMAL">{t`Normal`}</option>
                  <option value="URGENT">{t`Urgent`}</option>
                </select>
              </label>
              <label>
                <Trans>Client scope</Trans>
                <select
                  name="projectScope"
                  required
                  value={values.projectScope}
                  onChange={(event) =>
                    change({ projectScope: event.target.value, projectIds: [] })
                  }
                >
                  <option value="">{t`Choose client scope`}</option>
                  <option value="ALL">{t`All client projects`}</option>
                  <option value="SELECTED">{t`Selected clients and/or company`}</option>
                </select>
              </label>
              {values.projectScope === 'SELECTED' && (
                <label>
                  <Trans>Selected client projects</Trans>
                  <select
                    name="projectIds"
                    multiple
                    size={Math.min(5, Math.max(2, catalog.projects.length))}
                    value={values.projectIds}
                    onChange={(event) =>
                      change({
                        projectIds: Array.from(
                          event.target.selectedOptions,
                          (option) => option.value,
                        ),
                      })
                    }
                  >
                    {catalog.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {monetary && (
                <label>
                  <Trans>Currency scope (optional)</Trans>
                  <select
                    name="currency"
                    value={values.currency}
                    onChange={(event) =>
                      change({ currency: event.target.value })
                    }
                  >
                    <option value="">{t`All supported currencies, kept separate`}</option>
                    {financeLabels.currencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
              )}
              {condition?.requiresServiceMonth && (
                <label>
                  <Trans>Service month</Trans>
                  <input
                    name="serviceMonth"
                    type="month"
                    required
                    value={values.serviceMonth}
                    onChange={(event) =>
                      change({ serviceMonth: event.target.value })
                    }
                  />
                </label>
              )}
              <label>
                <Trans>Repeat policy</Trans>
                <select
                  name="repeatMode"
                  value={values.repeatMode}
                  onChange={(event) =>
                    change({ repeatMode: event.target.value })
                  }
                >
                  <option value="ONCE">{t`Once per observed issue`}</option>
                  <option value="INTERVAL">{t`Repeat while the issue remains open`}</option>
                </select>
              </label>
              {interval && (
                <>
                  <label>
                    <Trans>Hours between successful sends</Trans>
                    <input
                      name="repeatHours"
                      type="number"
                      min={1}
                      max={720}
                      step={1}
                      required
                      value={values.repeatHours}
                      onChange={(event) =>
                        change({ repeatHours: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <Trans>Maximum sends per issue</Trans>
                    <input
                      name="maxSends"
                      type="number"
                      min={2}
                      max={20}
                      step={1}
                      required
                      value={values.maxSends}
                      onChange={(event) =>
                        change({ maxSends: event.target.value })
                      }
                    />
                  </label>
                </>
              )}
            </StyledEscalationFields>
            <p>
              <Trans>
                This administrator reviews matching issues and arranges next
                steps. The original source task owner stays separate.
              </Trans>
            </p>
            <label>
              <input
                name="includeCompany"
                type="checkbox"
                checked={values.includeCompany}
                onChange={(event) =>
                  change({ includeCompany: event.target.checked })
                }
              />
              <Trans>Include company and unassigned sources</Trans>
            </label>
            <small>
              <Trans>
                Enabled rules evaluate 24/7. Only a successful prior send can
                qualify for an interval repeat. Failed or uncertain sends are
                never automatic retries.
              </Trans>
            </small>
            <StyledDeliveryButton
              type="button"
              disabled={!input}
              onClick={() =>
                input && setPreview({ input, requestId: crypto.randomUUID() })
              }
            >
              <Trans>Preview current matches</Trans>
            </StyledDeliveryButton>
            <label>
              <Trans>Reason for rule configuration</Trans>
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
            <StyledDeliveryButton
              type="submit"
              data-primary="true"
              disabled={!input || !values.reason.trim()}
            >
              <Trans>Save rule paused</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          disabled={saving}
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel rule editing</Trans>
        </StyledDeliveryButton>
        {preview && (
          <EscalationPreview
            key={preview.requestId}
            input={preview.input}
            enabled={!readOnly}
          />
        )}
      </StyledDeliveryStack>
    </form>
  );
};
