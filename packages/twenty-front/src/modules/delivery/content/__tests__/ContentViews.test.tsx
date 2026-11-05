import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContentCalendar } from '@/delivery/content/ContentCalendar';
import { ContentPostingPreview } from '@/delivery/content/ContentPostingPreview';
import { ContentPostList } from '@/delivery/content/ContentPostList';
import {
  contentBody,
  contentSummary,
  CONTENT_POST_ID,
} from '@/delivery/content/__tests__/content.fixtures';

beforeEach(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
it('provides a keyboard-operable complete calendar and an equivalent narrow-screen agenda', async () => {
  const select = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ContentCalendar
        month="2026-11"
        timezone="Asia/Qatar"
        days={[{ date: '2026-11-05', count: 70 }]}
        totalCount={70}
        onSelectDate={select}
      />
    </I18nProvider>,
  );
  const calendar = screen.getByRole('group', {
    name: 'Planned publication calendar',
  });
  expect(within(calendar).getAllByRole('button')).toHaveLength(30);
  const day = within(calendar).getByRole('button', {
    name: '2026-11-05: 70 posts by planned date',
  });
  day.focus();
  await userEvent.keyboard('{Enter}');
  expect(select).toHaveBeenCalledWith('2026-11-05');
  expect(
    screen.getByText('70 posts by planned date in this calendar range', {
      exact: false,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/No social platform schedule is connected/),
  ).toBeInTheDocument();
});
it('distinguishes a published channel from its unposted sibling in the same plan', () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ContentPostList
          items={[
            {
              ...contentSummary,
              id: CONTENT_POST_ID,
              platform: 'INSTAGRAM',
              accountName: 'Brand Instagram',
              status: 'PUBLISHED',
            },
            {
              ...contentSummary,
              id: '10000000-0000-4000-8000-000000000099',
              platform: 'FACEBOOK',
              accountName: 'Brand Facebook',
              status: 'REVIEW',
            },
          ]}
          totalCount={2}
          nextId={null}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  const table = screen.getByRole('table', { name: 'Content posting queue' });
  expect(
    within(table).getByText('Publication recorded manually'),
  ).toBeInTheDocument();
  expect(within(table).getByText('Post awaiting review')).toBeInTheDocument();
  expect(
    within(table).getByRole('link', { name: 'View publication evidence' }),
  ).toHaveAttribute(
    'href',
    expect.stringContaining(`contentPostId=${CONTENT_POST_ID}`),
  );
  expect(
    within(table).getByRole('link', { name: 'Review posting package' }),
  ).toBeInTheDocument();
});
it('shows a complete posting package without pretending a text draft has creative approval', () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ContentPostingPreview body={contentBody} />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(screen.getByText('A thoughtful organic post.')).toBeInTheDocument();
  expect(screen.getByText('2026-11-05 06:00 · Asia/Qatar')).toBeInTheDocument();
  expect(
    screen.getByText('Otogrow X (@otogrow)', { exact: false }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/text-only post, with no creative asset approval claimed/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Open social account' }),
  ).toHaveAttribute('href', 'https://x.com/otogrow');
});
it('opens the exact approved submission in the creative workflow', () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ContentPostingPreview
          body={{
            ...contentBody,
            format: 'VIDEO',
            assetSnapshot: {
              taskId: CONTENT_POST_ID,
              submissionVersion: 3,
              assetId: 'final-video',
              title: 'Approved product creative',
              name: 'Final video',
              mimeType: 'video/mp4',
              creativeVersion: 2,
              reviewedBy: 'Amna',
              reviewedAt: '2026-11-05T00:00:00Z',
              sourceHash: 'c'.repeat(64),
            },
          }}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    screen.getByRole('link', {
      name: 'Inspect exact approved creative in a new tab',
    }),
  ).toHaveAttribute(
    'href',
    `/delivery?view=creative&task=${CONTENT_POST_ID}&creativeStage=final&creativeSubmission=3`,
  );
});
it('shows unresolved manual publication separately from approval and prevents a misleading next step', () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ContentPostList
          items={[
            {
              ...contentSummary,
              status: 'APPROVED',
              lastAttemptAction: 'RECORD_UNCERTAIN',
              lastAttemptAt: '2026-11-05T03:00:00Z',
            },
          ]}
          totalCount={1}
          nextId={null}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  const table = screen.getByRole('table', { name: 'Content posting queue' });
  expect(
    within(table).getByText('Approved for manual posting'),
  ).toBeInTheDocument();
  expect(
    within(table).getByText(/Publication is uncertain/),
  ).toBeInTheDocument();
  expect(
    within(table).getByRole('link', {
      name: 'Check social account and evidence',
    }),
  ).toBeInTheDocument();
  expect(
    within(table).queryByRole('link', { name: 'Record manual posting' }),
  ).not.toBeInTheDocument();
  expect(table.querySelector('time')).toHaveAttribute(
    'dateTime',
    '2026-11-05T03:00:00Z',
  );
});
