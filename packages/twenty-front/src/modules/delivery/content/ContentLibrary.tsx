import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { Temporal } from 'temporal-polyfill';
import { type ContentChoices } from '@/delivery/content/content.types';
import { type useContentAccess } from '@/delivery/content/useContentAccess';
import { useContentRead } from '@/delivery/content/useContentRead';
import { useContentLabels } from '@/delivery/content/useContentLabels';
import {
  GET_CONTENT_LIST,
  GET_CONTENT_CALENDAR,
} from '@/delivery/content/delivery-content.graphql';
import {
  contentDayWindow,
  contentMonthWindow,
} from '@/delivery/content/content-dates';
import { contentDestination } from '@/delivery/content/content-navigation';
import { ContentCalendar } from '@/delivery/content/ContentCalendar';
import { ContentPostList } from '@/delivery/content/ContentPostList';
import { ContentActionStage } from '@/delivery/content/ContentActionStage';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryContentListQuery,
  type DeliveryContentCalendarQuery,
} from '~/generated-metadata/graphql';

export const ContentLibrary = ({
  access,
  choices,
  enabled,
  onDenied,
}: {
  access: ReturnType<typeof useContentAccess>;
  choices: ContentChoices;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const labels = useContentLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [filterError, setFilterError] = useState('');
  const calendar = params.get('contentView') === 'calendar';
  const timezone = params.get('contentTimezone') ?? 'UTC';
  const month =
    params.get('contentMonth') ??
    Temporal.Now.plainDateISO(timezone).toPlainYearMonth().toString();
  const day = params.get('contentDay');
  const monthRange = contentMonthWindow(month, timezone);
  const dayRange = day ? contentDayWindow(day, timezone) : null;
  const filters = {
    projectId: choices.project.id,
    planId: params.get('contentPlanId'),
    ownerId: params.get('contentOwner'),
    accountId: params.get('contentAccount'),
    status: params.get('contentStatus'),
    search: params.get('contentSearch'),
  };
  const listQuery = useQuery<DeliveryContentListQuery>(GET_CONTENT_LIST, {
    variables: {
      input: {
        ...filters,
        afterId: params.get('contentAfter'),
        ...(dayRange ?? {}),
      },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled || calendar,
  });
  const list = useContentRead({
    value: listQuery.data?.deliveryContentList,
    access,
    query: listQuery,
    scope: `list:${JSON.stringify(filters)}:${params.get('contentAfter')}:${day}`,
    onDenied,
  });
  const calendarQuery = useQuery<DeliveryContentCalendarQuery>(
    GET_CONTENT_CALENDAR,
    {
      variables: {
        input: {
          ...filters,
          timezone,
          from: monthRange?.from ?? '',
          to: monthRange?.to ?? '',
        },
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !enabled || !calendar || !monthRange,
    },
  );
  const calendarRead = useContentRead({
    value: calendarQuery.data?.deliveryContentCalendar,
    access,
    query: calendarQuery,
    scope: `calendar:${JSON.stringify(filters)}:${month}:${timezone}`,
    matches: (value) =>
      value.timezone === timezone &&
      value.from === monthRange?.from &&
      value.to === monthRange?.to,
    onDenied,
  });
  const available = calendar ? calendarRead.data !== null : list.data !== null;
  const query = calendar ? calendarQuery : listQuery;
  return (
    <StyledDeliveryStack>
      <form
        key={`${params.get('contentOwner')}:${params.get('contentAccount')}:${params.get('contentStatus')}:${params.get('contentSearch')}:${month}:${timezone}:${calendar}`}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          if (
            calendar &&
            !contentMonthWindow(
              String(form.get('month') ?? ''),
              String(form.get('timezone') ?? ''),
            )
          ) {
            setFilterError(
              t`Choose a valid calendar month and IANA time zone, such as Asia/Qatar.`,
            );
            return;
          }
          setFilterError('');
          navigate(
            contentDestination(params, {
              contentOwner: String(form.get('owner') ?? ''),
              contentAccount: String(form.get('account') ?? ''),
              contentStatus: String(form.get('status') ?? ''),
              contentSearch: String(form.get('search') ?? '').trim(),
              contentAfter: null,
              ...(calendar
                ? {
                    contentMonth: String(form.get('month') ?? ''),
                    contentTimezone: String(form.get('timezone') ?? ''),
                  }
                : {}),
            }),
          );
        }}
      >
        <StyledDeliveryStack>
          <StyledDeliveryGrid>
            <label>
              <Trans>Post owner</Trans>
              <select
                name="owner"
                defaultValue={params.get('contentOwner') ?? ''}
              >
                <option value="">{t`All people`}</option>
                {params.has('contentOwner') &&
                  !choices.members.some(
                    (member) => member.id === params.get('contentOwner'),
                  ) && (
                    <option
                      value={params.get('contentOwner') ?? ''}
                      disabled
                    >{t`Selected person is unavailable`}</option>
                  )}
                {choices.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Social account</Trans>
              <select
                name="account"
                defaultValue={params.get('contentAccount') ?? ''}
              >
                <option value="">{t`All accounts`}</option>
                {params.has('contentAccount') &&
                  !choices.accounts.some(
                    (account) => account.id === params.get('contentAccount'),
                  ) && (
                    <option
                      value={params.get('contentAccount') ?? ''}
                      disabled
                    >{t`Selected account is unavailable`}</option>
                  )}
                {choices.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {labels.platform(account.platform)} · {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Posting stage</Trans>
              <select
                name="status"
                defaultValue={params.get('contentStatus') ?? ''}
              >
                <option value="">{t`All stages`}</option>
                {[
                  'DRAFT',
                  'REVIEW',
                  'APPROVED',
                  'CHANGES_REQUESTED',
                  'PUBLISHED',
                  'CANCELLED',
                ].map((status) => (
                  <option key={status} value={status}>
                    {labels.status(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Search content</Trans>
              <input
                name="search"
                maxLength={200}
                defaultValue={params.get('contentSearch') ?? ''}
              />
            </label>
            {calendar && (
              <>
                <label>
                  <Trans>Calendar month</Trans>
                  <input
                    required
                    type="month"
                    name="month"
                    defaultValue={month}
                  />
                </label>
                <label>
                  <Trans>Calendar time zone</Trans>
                  <input required name="timezone" defaultValue={timezone} />
                </label>
              </>
            )}
          </StyledDeliveryGrid>
          <StyledDeliveryRow>
            <StyledDeliveryButton>
              <Trans>Apply filters</Trans>
            </StyledDeliveryButton>
            <Link
              to={contentDestination(params, {
                contentOwner: null,
                contentAccount: null,
                contentStatus: null,
                contentSearch: null,
                contentDay: null,
                contentAfter: null,
              })}
            >
              <Trans>Clear filters</Trans>
            </Link>
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </form>
      {filterError && <p role="alert">{filterError}</p>}
      {day && !calendar && (
        <ContentActionStage
          key={`${day}:${timezone}`}
          enabled={available && !query.loading}
          label={t`Posts planned for ${day}`}
        >
          <p>
            {t`Posts by planned date: ${day}`} · {timezone}{' '}
            <Link
              to={contentDestination(params, {
                contentDay: null,
                contentAfter: null,
              })}
            >
              <Trans>All dates</Trans>
            </Link>
          </p>
        </ContentActionStage>
      )}
      {!available ? (
        <p role={query.error ? 'alert' : 'status'}>
          {query.loading && !query.error ? (
            <Trans>Loading content…</Trans>
          ) : (
            <>
              <Trans>Current content could not be checked.</Trans>{' '}
              <StyledDeliveryButton
                type="button"
                disabled={!enabled}
                onClick={() => void query.refetch()}
              >
                <Trans>Check content list</Trans>
              </StyledDeliveryButton>
            </>
          )}
        </p>
      ) : calendar && calendarRead.data ? (
        <ContentCalendar
          month={month}
          timezone={timezone}
          days={calendarRead.data.days}
          totalCount={calendarRead.data.totalCount}
          onSelectDate={(date) =>
            navigate(
              contentDestination(params, {
                contentView: 'table',
                contentDay: date,
                contentTimezone: timezone,
                contentAfter: null,
              }),
            )
          }
        />
      ) : (
        list.data && (
          <>
            <StyledDeliveryRow>
              {list.data.platformCounts.map((count) => (
                <span key={count.platform}>
                  {labels.platform(count.platform)}:{' '}
                  {t`${count.publishedCount} of ${count.count} publication records; ${count.reviewCount} awaiting review`}
                </span>
              ))}
            </StyledDeliveryRow>
            <ContentPostList
              items={list.data.items}
              totalCount={list.data.totalCount}
              nextId={list.data.nextId ?? null}
            />
          </>
        )
      )}
    </StyledDeliveryStack>
  );
};
