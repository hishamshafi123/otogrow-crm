import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EscalationHistory } from '@/delivery/founder/escalation/EscalationHistory';
import { escalationNoticeFixture } from '@/delivery/founder/escalation/__tests__/escalation.fixtures';
import { type EscalationNotice } from '@/delivery/founder/escalation/escalation.types';

jest.mock('@/delivery/deliveryStyles', () => ({ StyledDeliveryStack: 'div' }));
jest.mock('@/delivery/founder/escalation/escalationStyles', () => ({
  StyledEscalationEntry: 'article',
}));
const destination = (changes: Record<string, string | null>) =>
  `/delivery?${new URLSearchParams(Object.fromEntries(Object.entries(changes).filter((entry): entry is [string, string] => typeof entry[1] === 'string')))}`;
const setup = (notices: EscalationNotice[], nextNoticeId?: string) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <EscalationHistory
          notices={notices}
          destination={destination}
          nextNoticeId={nextNoticeId}
          hasCursor={false}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});
describe('immutable founder alert receipts', () => {
  it('distinguishes Telegram acceptance from reading or source resolution', () => {
    setup([escalationNoticeFixture()]);
    expect(screen.getByText('Accepted by Telegram')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Telegram accepted this send. Recipient reading and source resolution are not confirmed.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Rule version 1', { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open the recorded issue' }),
    ).toHaveAttribute('href', expect.stringContaining('founderIssue='));
  });
  it('preserves original condition, company scope and repeat policy for each recorded revision', async () => {
    const original = escalationNoticeFixture();
    const originalConfiguration = original.configuration;
    if (!originalConfiguration)
      throw new Error('Missing fixture configuration');
    const changed = {
      ...original,
      id: 'later',
      ruleRevision: 4,
      priority: 'URGENT',
      configuration: {
        ...originalConfiguration,
        revision: 4,
        name: 'Company concerns',
        condition: 'MANUAL_CLIENT_CONCERN',
        projectScope: 'SELECTED',
        projectIds: [],
        includeCompany: true,
        priority: 'URGENT',
        repeatMode: 'INTERVAL',
        repeatHours: 12,
        maxSends: 3,
      },
    };
    setup([original, changed]);
    const rows = screen.getAllByRole('article');
    await userEvent.click(
      within(rows[0]).getByText('Configuration recorded for this event', {
        selector: 'summary',
      }),
    );
    await userEvent.click(
      within(rows[1]).getByText('Configuration recorded for this event', {
        selector: 'summary',
      }),
    );
    expect(rows[0]).toHaveTextContent('Work is past its due date');
    expect(rows[0]).toHaveTextContent('Once per observed issue');
    expect(rows[0]).not.toHaveTextContent('Company concerns');
    expect(rows[1]).toHaveTextContent('A client concern was raised');
    expect(rows[1]).toHaveTextContent('company-only scope');
    expect(rows[1]).toHaveTextContent('12 hours');
    expect(rows[1]).toHaveTextContent('3 sends per issue');
  });
  it('keeps missing historical configuration unknown instead of using a current rule', () => {
    setup([{ ...escalationNoticeFixture(), configuration: null }]);
    expect(
      screen.getByText(/original configuration for this event is unavailable/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Once per observed issue'),
    ).not.toBeInTheDocument();
  });
  it.each(['UNCERTAIN', 'FAILED'])(
    'does not offer automatic resend after terminal %s',
    (transportStatus) => {
      setup([
        {
          ...escalationNoticeFixture(),
          transportStatus,
          error: 'SOURCE_UNAVAILABLE',
        },
      ]);
      expect(screen.getByRole('status')).toHaveTextContent(
        'No automatic resend',
      );
      expect(
        screen.getByText(
          'The source is unavailable. No resolution or automatic retry was inferred.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /retry|resend/i }),
      ).not.toBeInTheDocument();
    },
  );
  it('separates configuration events from Telegram occurrences and exposes bounded history links', () => {
    setup(
      [
        {
          ...escalationNoticeFixture(),
          kind: 'RULE_SAVED',
          sequence: 0,
          transportStatus: 'NOT_APPLICABLE',
          episodeId: null,
          actorName: 'Founder',
          reason: 'Save a reviewed paused rule',
        },
      ],
      'next-receipt',
    );
    expect(
      screen.getByText('Configuration event; no message'),
    ).toBeInTheDocument();
    expect(screen.getByText('Save a reviewed paused rule')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open the recorded issue' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Older occurrence receipts' }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('founderNoticesAfter=next-receipt'),
    );
  });
});
