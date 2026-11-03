import { useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinanceExportPreviewInput } from '~/generated-metadata/graphql';
import { type FinanceExportProfile } from '@/delivery/finance/export/finance-export.types';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { useDeliveryNativeDraft } from '@/delivery/drafts/useDeliveryNativeDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { StyledExportFields } from '@/delivery/finance/export/financeExportStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceExportSelectionFormProps = {
  profile: FinanceExportProfile;
  initial?: DeliveryFinanceExportPreviewInput | null;
  readOnly: boolean;
  onReview: (input: DeliveryFinanceExportPreviewInput) => void;
  onCancel: () => void;
};
export const FinanceExportSelectionForm = ({
  profile,
  initial,
  readOnly,
  onReview,
  onCancel,
}: FinanceExportSelectionFormProps) => {
  const { t } = useLingui();
  const labels = useFinanceLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [openedRevision] = useState(profile.revision);
  const [values, setValues] = useState({
    currency: initial?.currency ?? '',
    dateFrom: initial?.dateFrom ?? '',
    dateTo: initial?.dateTo ?? '',
    serviceMonth: initial?.serviceMonth ?? '',
    accountingDate: initial?.accountingDate ?? '',
  });
  const draft = useDeliveryNativeDraft({ extraValues: values, busy: false });
  const cash = profile.basis === 'CASH';
  const supported = cash || profile.basis === 'RECOGNITION';
  const valid =
    supported &&
    profile.active &&
    openedRevision === profile.revision &&
    labels.currencies.includes(values.currency) &&
    (cash
      ? Boolean(
          values.dateFrom && values.dateTo && values.dateFrom <= values.dateTo,
        )
      : Boolean(values.serviceMonth && values.accountingDate));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly || !valid) return;
    draft.markSaved(values);
    onReview({
      profileId: profile.id,
      currency: values.currency,
      dateFrom: cash ? values.dateFrom : null,
      dateTo: cash ? values.dateTo : null,
      serviceMonth: cash ? null : values.serviceMonth,
      accountingDate: cash ? null : values.accountingDate,
    });
  };
  return (
    <form
      ref={draft.formRef}
      onChange={draft.onChange}
      onSubmit={submit}
      aria-label={t`Choose export source period`}
    >
      <StyledDeliveryStack>
        <h3>
          <Trans>Choose the source period</Trans>
        </h3>
        <p>
          {cash
            ? t`Only actual money received or paid is included. Receivables, opening balances and forecast expectations are excluded.`
            : t`Only posted service-month revenue and costs are included. Choose the accounting date explicitly; no month-end date is assumed.`}
        </p>
        {openedRevision !== profile.revision && (
          <p role="alert">
            <Trans>
              The profile changed. Cancel this selection and start a fresh
              review.
            </Trans>
          </p>
        )}
        <fieldset disabled={readOnly}>
          <StyledExportFields>
            <label>
              <Trans>Export currency</Trans>
              <select
                name="currency"
                required
                value={values.currency}
                onChange={(event) =>
                  setValues({ ...values, currency: event.target.value })
                }
              >
                <option value="">{t`Choose a currency`}</option>
                {labels.currencies.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
            {cash ? (
              <>
                <label>
                  <Trans>Cash date from</Trans>
                  <input
                    name="dateFrom"
                    type="date"
                    required
                    value={values.dateFrom}
                    max={values.dateTo || undefined}
                    onChange={(event) =>
                      setValues({ ...values, dateFrom: event.target.value })
                    }
                  />
                </label>
                <label>
                  <Trans>Cash date to</Trans>
                  <input
                    name="dateTo"
                    type="date"
                    required
                    min={values.dateFrom || undefined}
                    value={values.dateTo}
                    onChange={(event) =>
                      setValues({ ...values, dateTo: event.target.value })
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  <Trans>Service month</Trans>
                  <input
                    name="serviceMonth"
                    type="month"
                    required
                    value={values.serviceMonth}
                    onChange={(event) =>
                      setValues({ ...values, serviceMonth: event.target.value })
                    }
                  />
                </label>
                <label>
                  <Trans>Accounting date for this handoff</Trans>
                  <input
                    name="accountingDate"
                    type="date"
                    required
                    value={values.accountingDate}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        accountingDate: event.target.value,
                      })
                    }
                  />
                </label>
              </>
            )}
          </StyledExportFields>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={!valid}
          >
            <Trans>Review export</Trans>
          </StyledDeliveryButton>
        </fieldset>
        <StyledDeliveryButton
          type="button"
          onClick={() => requestAction(onCancel)}
        >
          <Trans>Cancel source selection</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};
