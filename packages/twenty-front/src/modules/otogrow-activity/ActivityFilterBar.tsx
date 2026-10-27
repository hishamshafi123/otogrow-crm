import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  StyledActivityActions,
  StyledActivityFilters,
} from '@/otogrow-activity/activityStyles';
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_OUTCOMES,
  type ActivityFilters,
  type OtogrowActivityFeed,
} from '@/otogrow-activity/otogrow-activity.types';
import { activityDateRange } from '@/otogrow-activity/activityFilters';
import { useActivityLabels } from '@/otogrow-activity/useActivityLabels';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';

type ActivityFilterBarProps = {
  filters: ActivityFilters;
  options?: Pick<OtogrowActivityFeed, 'people' | 'projects' | 'clients'>;
  onApply: (filters: ActivityFilters) => void;
  onReset: () => void;
};

export const ActivityFilterBar = ({
  filters,
  options,
  onApply,
  onReset,
}: ActivityFilterBarProps) => {
  const { t } = useLingui();
  const { label } = useActivityLabels();
  const isMobile = useIsMobile();
  const activeCount = Object.values(filters).filter(Boolean).length;
  const secondaryCount = [
    filters.projectId,
    filters.clientId,
    filters.category,
    filters.action,
    filters.outcome,
  ].filter(Boolean).length;
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState('');
  const change = (key: keyof ActivityFilters, value: string) => {
    setDraft({ ...draft, [key]: value });
    setError('');
  };
  const renderRecordFilter = (
    key: 'personId' | 'projectId' | 'clientId',
    name: string,
    all: string,
    choices: { id: string; name: string }[],
  ) => (
    <label>
      {name}
      <select
        value={draft[key]}
        onChange={(event) => change(key, event.target.value)}
      >
        <option value="">{all}</option>
        {draft[key] && !choices.some((choice) => choice.id === draft[key]) && (
          <option value={draft[key]}>{t`Selected record`}</option>
        )}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <StyledDeliveryCard>
      <details open={!isMobile}>
        <summary>
          {activeCount ? t`Filters · ${activeCount} active` : t`Filters`}
        </summary>
        <form
          aria-label={t`Activity filters`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!activityDateRange(draft)) {
              setError(
                t`Choose valid dates with the end date on or after the start date.`,
              );
              return;
            }
            onApply(draft);
            if (isMobile) {
              const details = event.currentTarget.closest('details');
              if (details) details.open = false;
            }
          }}
        >
          <StyledDeliveryStack>
            <StyledActivityFilters>
              {renderRecordFilter(
                'personId',
                t`Person`,
                t`All people`,
                options?.people ?? [],
              )}
              <label>
                <Trans>From date (UTC)</Trans>
                <input
                  type="date"
                  value={draft.from}
                  onChange={(event) => change('from', event.target.value)}
                />
              </label>
              <label>
                <Trans>Through date (UTC)</Trans>
                <input
                  type="date"
                  value={draft.through}
                  onChange={(event) => change('through', event.target.value)}
                />
              </label>
            </StyledActivityFilters>
            <details open={secondaryCount > 0}>
              <summary>
                {secondaryCount
                  ? t`More filters · ${secondaryCount} active`
                  : t`More filters`}
              </summary>
              <StyledActivityFilters>
                {renderRecordFilter(
                  'projectId',
                  t`Project`,
                  t`All projects`,
                  options?.projects ?? [],
                )}
                {renderRecordFilter(
                  'clientId',
                  t`Client`,
                  t`All clients`,
                  options?.clients ?? [],
                )}
                {(
                  [
                    [
                      'category',
                      t`Category`,
                      t`All categories`,
                      [
                        'ACCESS',
                        'DELIVERY',
                        'AGENT',
                        'BUSINESS',
                        'CLIENT',
                        'CREATIVE',
                        'ADVERTISING',
                      ],
                    ],
                    ['action', t`Action`, t`All actions`, ACTIVITY_ACTIONS],
                    ['outcome', t`Outcome`, t`All outcomes`, ACTIVITY_OUTCOMES],
                  ] as const
                ).map(([key, name, all, choices]) => (
                  <label key={key}>
                    {name}
                    <select
                      value={draft[key]}
                      onChange={(event) => change(key, event.target.value)}
                    >
                      <option value="">{all}</option>
                      {choices.map((value) => (
                        <option key={value} value={value}>
                          {label(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </StyledActivityFilters>
            </details>
            <small>
              <Trans>
                Both dates are included. A person filter includes actions they
                took and changes affecting them.
              </Trans>
            </small>
            {error && <p role="alert">{error}</p>}
            <StyledActivityActions>
              <StyledDeliveryButton type="submit" data-primary="true">
                <Trans>Apply filters</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                type="button"
                onClick={() => {
                  setDraft(
                    Object.fromEntries(
                      Object.keys(draft).map((key) => [key, '']),
                    ) as ActivityFilters,
                  );
                  setError('');
                  onReset();
                }}
              >
                <Trans>Clear filters</Trans>
              </StyledDeliveryButton>
            </StyledActivityActions>
          </StyledDeliveryStack>
        </form>
      </details>
    </StyledDeliveryCard>
  );
};
