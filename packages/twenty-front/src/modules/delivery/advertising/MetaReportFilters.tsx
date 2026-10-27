import {
  StyledReportFilters,
  StyledReportActions,
} from '@/delivery/advertising/metaReportStyles';
import { type FormEvent } from 'react';
import { type MetaReportNavigationValue } from '@/delivery/advertising/meta-report-navigation';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export type MetaReportFiltersValue = Omit<
  MetaReportNavigationValue,
  'after' | 'selectedId'
>;
type MetaReportFiltersProps = {
  value: MetaReportFiltersValue;
  busy: boolean;
  onApply: (value: MetaReportFiltersValue) => void;
};
export const MetaReportFilters = ({
  value,
  busy,
  onApply,
}: MetaReportFiltersProps) => {
  const { t } = useLingui();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const fromDate = String(fields.get('fromDate') ?? '');
    const throughDate = String(fields.get('throughDate') ?? '');
    const end = event.currentTarget.elements.namedItem(
      'throughDate',
    ) as HTMLInputElement;
    end.setCustomValidity(
      fromDate && throughDate && fromDate > throughDate
        ? t`End date must be on or after start date.`
        : '',
    );
    if (!event.currentTarget.reportValidity()) return;
    onApply({
      archive: fields.get('archive') as MetaReportFiltersValue['archive'],
      accountId: String(fields.get('accountId') ?? '').trim() || undefined,
      fromDate: fromDate || undefined,
      throughDate: throughDate || undefined,
      status: (String(fields.get('status') ?? '') ||
        undefined) as MetaReportFiltersValue['status'],
    });
  };
  return (
    <form
      onSubmit={submit}
      key={JSON.stringify(value)}
      aria-label={t`Filter imported reports`}
    >
      <StyledDeliveryStack>
        <StyledReportFilters>
          <label>
            <Trans>Report history</Trans>
            <select name="archive" defaultValue={value.archive}>
              <option value="ACTIVE">{t`Active reports`}</option>
              <option value="ARCHIVED">{t`Archived reports`}</option>
              <option value="ALL">{t`All reports`}</option>
            </select>
          </label>
          <label>
            <Trans>Decision</Trans>
            <select name="status" defaultValue={value.status ?? ''}>
              <option value="">{t`Any decision`}</option>
              <option value="REVIEW">{t`Awaiting manager review`}</option>
              <option value="APPROVED">{t`Approved`}</option>
              <option value="CHANGES_REQUESTED">{t`Changes requested`}</option>
            </select>
          </label>
          <label>
            <Trans>Ad account ID</Trans>
            <input
              name="accountId"
              inputMode="numeric"
              pattern="[0-9]{5,30}"
              defaultValue={value.accountId ?? ''}
            />
          </label>
          <label>
            <Trans>From date</Trans>
            <input
              type="date"
              name="fromDate"
              defaultValue={value.fromDate ?? ''}
              onChange={(event) => {
                const end = event.currentTarget.form?.elements.namedItem(
                  'throughDate',
                ) as HTMLInputElement | null;
                end?.setCustomValidity('');
              }}
            />
          </label>
          <label>
            <Trans>Through date</Trans>
            <input
              type="date"
              name="throughDate"
              defaultValue={value.throughDate ?? ''}
              onChange={(event) => event.currentTarget.setCustomValidity('')}
            />
          </label>
        </StyledReportFilters>
        <StyledReportActions>
          <StyledDeliveryButton disabled={busy} type="submit">
            <Trans>Apply filters</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            disabled={busy}
            type="button"
            onClick={() => onApply({ archive: 'ACTIVE' })}
          >
            <Trans>Reset filters</Trans>
          </StyledDeliveryButton>
        </StyledReportActions>
      </StyledDeliveryStack>
    </form>
  );
};
