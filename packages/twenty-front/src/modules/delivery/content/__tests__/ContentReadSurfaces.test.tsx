import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { NetworkStatus } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { getOperationAST, type DocumentNode } from 'graphql';
import { ContentLibrary } from '@/delivery/content/ContentLibrary';
import { ContentPostDetail } from '@/delivery/content/ContentPostDetail';
import { contentMonthWindow } from '@/delivery/content/content-dates';
import { type useContentAccess } from '@/delivery/content/useContentAccess';
import {
  type ContentDetail,
  type ContentIdentity,
} from '@/delivery/content/content.types';
import {
  contentBody,
  contentChoices,
  contentSummary,
  CONTENT_PLAN_ID,
  CONTENT_POST_ID,
} from '@/delivery/content/__tests__/content.fixtures';

jest.mock('@apollo/client/react', () => ({ useQuery: jest.fn() }));
const nativeIdentity = { ...contentChoices, scope: 'd'.repeat(64) };
const detail: ContentDetail = {
  ...nativeIdentity,
  __typename: 'DeliveryContentDetail',
  variant: contentSummary,
  plan: {
    id: CONTENT_PLAN_ID,
    projectId: contentChoices.project.id,
    companyId: null,
    revision: 1,
    title: 'Launch week',
    purpose: 'Organic awareness',
    engagementId: null,
    service: null,
    createdBy: contentChoices.memberId,
    canEdit: false,
  },
  selectedVersion: 1,
  body: contentBody,
  history: [],
  nextEventId: null,
  currentSourceFingerprint: contentBody.sourceFingerprint,
  sourceChanged: false,
  latestPublication: null,
  canEdit: true,
  allowedActions: ['SUBMIT'],
  blockedReason: null,
};
const access = {
  source: 'base-authority',
  permission: { ready: true },
  matches: (value: ContentIdentity) =>
    value.workspaceId === contentChoices.workspaceId &&
    value.memberId === contentChoices.memberId &&
    value.userWorkspaceId === contentChoices.userWorkspaceId &&
    /^[a-f0-9]{64}$/.test(value.scope),
} as unknown as ReturnType<typeof useContentAccess>;
let unavailable = false;
let differentActor = false;
let loading = false;
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  unavailable = false;
  differentActor = false;
  loading = false;
  jest.mocked(useQuery).mockImplementation((query) => {
    const name = getOperationAST(query as DocumentNode)?.name?.value;
    return {
      loading,
      networkStatus: NetworkStatus.ready,
      error: unavailable ? new Error('Offline') : undefined,
      refetch: jest.fn(),
      data:
        name === 'DeliveryContentDetail'
          ? {
              deliveryContentDetail: {
                ...detail,
                memberId: differentActor ? 'other-actor' : detail.memberId,
              },
            }
          : name === 'DeliveryContentCalendar'
            ? {
                deliveryContentCalendar: {
                  ...nativeIdentity,
                  ...contentMonthWindow('2026-11', 'Asia/Qatar'),
                  timezone: 'Asia/Qatar',
                  days: [{ date: '2026-11-05', count: 1 }],
                  totalCount: 1,
                },
              }
            : {
                deliveryContentList: {
                  ...nativeIdentity,
                  items: [contentSummary],
                  totalCount: 1,
                  nextId: null,
                  platformCounts: [
                    {
                      platform: 'X',
                      count: 1,
                      publishedCount: 0,
                      reviewCount: 0,
                    },
                  ],
                },
              },
    } as unknown as ReturnType<typeof useQuery>;
  });
});
it('moves keyboard focus from a calendar day into its verified filtered results', async () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        initialEntries={[
          '/delivery?view=content&contentView=calendar&contentMonth=2026-11&contentTimezone=Asia%2FQatar',
        ]}
      >
        <ContentLibrary
          access={access}
          choices={contentChoices}
          enabled
          onDenied={jest.fn()}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  const calendar = screen.getByRole('group', {
    name: 'Planned publication calendar',
  });
  within(calendar)
    .getByRole('button', { name: '2026-11-05: 1 posts by planned date' })
    .focus();
  await userEvent.keyboard('{Enter}');
  expect(
    screen.getByRole('region', { name: 'Posts planned for 2026-11-05' }),
  ).toHaveFocus();
  expect(
    screen.getByRole('table', { name: 'Content posting queue' }),
  ).toBeInTheDocument();
});
it.each(['list', 'detail'])(
  'shows a truthful initial %s loading state without a retry or private contents',
  (surface) => {
    loading = true;
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          {surface === 'list' ? (
            <ContentLibrary
              access={access}
              choices={contentChoices}
              enabled
              onDenied={jest.fn()}
            />
          ) : (
            <ContentPostDetail
              access={access}
              projectId={contentChoices.project.id}
              postId={CONTENT_POST_ID}
              enabled
              onDenied={jest.fn()}
              open={jest.fn()}
            />
          )}
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      surface === 'list' ? 'Loading content…' : 'Loading posting package…',
    );
    expect(screen.queryByText(/could not be checked/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Check/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('A thoughtful organic post.'),
    ).not.toBeInTheDocument();
  },
);
it('renders list records under their native visibility scope independently of project-choice scope', () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ContentLibrary
          access={access}
          choices={contentChoices}
          enabled
          onDenied={jest.fn()}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  const queue = screen.getByRole('table', { name: 'Content posting queue' });
  expect(within(queue).getByText('Launch week')).toBeInTheDocument();
  expect(nativeIdentity.scope).not.toBe(contentChoices.scope);
});
it('renders exact detail under its native scope and hides private content during an outage or actor mismatch', () => {
  const page = (
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ContentPostDetail
          access={access}
          projectId={contentChoices.project.id}
          postId={CONTENT_POST_ID}
          enabled
          onDenied={jest.fn()}
          open={jest.fn()}
        />
      </MemoryRouter>
    </I18nProvider>
  );
  const view = render(page);
  expect(screen.getByText('A thoughtful organic post.')).toBeInTheDocument();
  unavailable = true;
  view.rerender(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ContentPostDetail
          access={access}
          projectId={contentChoices.project.id}
          postId={CONTENT_POST_ID}
          enabled
          onDenied={jest.fn()}
          open={jest.fn()}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    screen.queryByText('A thoughtful organic post.'),
  ).not.toBeInTheDocument();
  unavailable = false;
  differentActor = true;
  view.rerender(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ContentPostDetail
          access={access}
          projectId={contentChoices.project.id}
          postId={CONTENT_POST_ID}
          enabled
          onDenied={jest.fn()}
          open={jest.fn()}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    screen.queryByText('A thoughtful organic post.'),
  ).not.toBeInTheDocument();
  differentActor = false;
  view.rerender(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ContentPostDetail
          access={access}
          projectId={contentChoices.project.id}
          postId={CONTENT_POST_ID}
          enabled
          onDenied={jest.fn()}
          open={jest.fn()}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(screen.getByText('A thoughtful organic post.')).toBeInTheDocument();
});
