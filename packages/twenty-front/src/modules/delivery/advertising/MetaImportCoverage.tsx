import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDateWithoutTime } from 'twenty-shared/utils';
import { DeliveryGuardedForm } from '@/delivery/drafts/DeliveryGuardedForm';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export type MetaImportCoverageData = {
  fromDate: string;
  throughDate: string;
  missingDates: string[];
  refreshDueDates: string[];
  nextDate: string | null;
  attemptDate: string;
  attemptsToday: number;
  remainingToday: number;
};

type MetaImportCoverageProps = {
  coverage: MetaImportCoverageData;
  busy: boolean;
  unavailable: boolean;
  onImport: (date: string) => Promise<boolean>;
};

export const MetaImportCoverage = ({
  coverage,
  busy,
  unavailable,
  onImport,
}: MetaImportCoverageProps) => {
  const { t } = useLingui();
  const [date, setDate] = useState('');
  const validDate = isDateWithoutTime(date) && date <= coverage.throughDate;
  const exhausted = coverage.remainingToday === 0;

  return (
    <StyledDeliveryStack>
      <small>
        {t`Recovery window: ${coverage.fromDate} through ${coverage.throughDate}`}
      </small>
      <p>
        {t`Missing days: ${coverage.missingDates.length} · Due for refresh: ${coverage.refreshDueDates.length}`}
      </p>
      <small>
        {t`Import attempts today (${coverage.attemptDate}): ${coverage.attemptsToday} · Remaining: ${coverage.remainingToday}`}
      </small>
      {exhausted && (
        <p role="status">
          <Trans>
            Today’s import limit is reached. The allowance resets on the next
            day in the ad-account timezone. Automatic recovery requires daily
            reporting to be enabled.
          </Trans>
        </p>
      )}
      <details>
        <summary>
          <Trans>Missing dates and recovery</Trans>
        </summary>
        <StyledDeliveryStack>
          <p>
            {coverage.missingDates.length
              ? t`Missing reports: ${coverage.missingDates.join(', ')}`
              : t`Every day in this recovery window has an imported report.`}
          </p>
          <p>
            {coverage.refreshDueDates.length
              ? t`Refresh pending: ${coverage.refreshDueDates.join(', ')}`
              : t`No recent dates are waiting for a refresh.`}
          </p>
          <p>
            <Trans>
              Scheduled imports check yesterday first, then missed days and
              recent conversions. Older dates can be imported individually.
              Failed attempts also use the daily limit.
            </Trans>
          </p>
          <DeliveryGuardedForm
            revision={0}
            snapshot="date-recovery"
            busy={busy}
            disabled={unavailable}
            visible
            onSave={async () => {
              if (!validDate || exhausted || unavailable) return false;
              return onImport(date);
            }}
          >
            <StyledDeliveryStack>
              <label>
                <Trans>Past date to import</Trans>
                <input
                  name="date"
                  type="date"
                  required
                  max={coverage.throughDate}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <StyledDeliveryButton
                type="submit"
                disabled={busy || unavailable || exhausted || !validDate}
              >
                <Trans>Import selected day</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </DeliveryGuardedForm>
        </StyledDeliveryStack>
      </details>
    </StyledDeliveryStack>
  );
};
