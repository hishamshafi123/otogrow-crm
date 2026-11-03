import {
  portalAttemptResult,
  portalBudgetCents,
  type PortalAttempt,
  type PortalSession,
} from '@/delivery/portal/portal-response';

const session = (): PortalSession => ({
  engagement: {
    name: 'Brand',
    services: ['SEO'],
    scope: 'Work',
    allowance: '',
    contact: '',
    revision: 2,
    fields: [{ id: 'website', label: 'Website', required: true }],
  },
  assets: [],
  submissions: [],
  shares: [],
  advertising: {
    currency: 'USD',
    channel: 'META',
    period: 'DAILY',
    requests: [],
  },
});
const onboarding: PortalAttempt = {
  command: {
    action: 'onboard',
    requestId: 'request',
    revision: 1,
    answers: { website: 'Original site' },
  },
  form: {
    revision: 1,
    fields: [{ id: 'website', label: 'Original website', required: true }],
  },
  state: 'UNKNOWN',
};

describe('Exact public response recovery', () => {
  it('finds the original saved submission after the live onboarding form changes', () => {
    const data = session();
    data.submissions.push({
      id: 'request',
      at: '2026-11-03T00:00:00Z',
      accepted: false,
      formRevision: 1,
      answers: [{ label: 'Original website', value: 'Original site' }],
    });
    expect(portalAttemptResult(onboarding, data)).toBe('MATCH');
    data.submissions[0].answers[0].value = 'A different site';
    expect(portalAttemptResult(onboarding, data)).toBe('CONFLICT');
    data.submissions[0].answers[0].value = 'Original site';
    data.submissions[0].formRevision = 2;
    expect(portalAttemptResult(onboarding, data)).toBe('CONFLICT');
  });
  it('does not authorize an old-form retry from a fresh absence result', () => {
    expect(portalAttemptResult(onboarding, session())).toBe('STALE');
    const current = session();
    current.engagement.revision = 1;
    expect(portalAttemptResult(onboarding, current)).toBe('NOT_FOUND');
  });
  it('matches a budget by the client request identity and exact revision, amount and reason', () => {
    const data = session();
    data.advertising = {
      currency: 'USD',
      channel: 'META',
      period: 'DAILY',
      requests: [
        {
          id: 'internal-budget-id',
          clientRequestId: 'request',
          clientRequestRevision: 1,
          reason: 'Original reason',
          amount: 0,
          currency: 'USD',
          channel: 'META',
          period: 'DAILY',
          status: 'REVIEW',
          createdAt: '2026-11-03T00:00:00Z',
        },
      ],
    };
    const attempt: PortalAttempt = {
      command: {
        action: 'budget',
        requestId: 'request',
        revision: 1,
        amount: 0,
        reason: 'Original reason',
      },
      form: null,
      state: 'UNKNOWN',
    };
    expect(portalAttemptResult(attempt, data)).toBe('MATCH');
    data.advertising.requests[0].reason = 'Changed reason';
    expect(portalAttemptResult(attempt, data)).toBe('CONFLICT');
    data.advertising.requests[0].clientRequestId = 'another-request';
    expect(portalAttemptResult(attempt, data)).toBe('STALE');
  });
  it('cannot check a review using a different shared version or a withdrawn source', () => {
    const data = session();
    const attempt: PortalAttempt = {
      command: {
        action: 'review',
        requestId: 'request',
        shareId: 'version-one',
        decision: 'APPROVED',
        comment: 'Ready',
      },
      form: null,
      state: 'UNKNOWN',
    };
    data.shares.push({
      id: 'version-two',
      version: 2,
      kind: 'SUBMISSION',
      title: 'Work',
      content: '',
      links: [],
      reviews: [
        {
          id: 'request',
          decision: 'APPROVED',
          comment: 'Ready',
          at: '2026-11-03T00:00:00Z',
        },
      ],
    });
    expect(portalAttemptResult(attempt, data)).toBe('STALE');
  });
  it.each([
    ['0', 0],
    ['250.25', 25025],
    ['1.01', 101],
    ['1000000000', 100000000000],
    ['0.001', null],
    ['1000000000.01', null],
    ['1e3', null],
    ['-1', null],
    ['', null],
  ])(
    'converts a budget exactly within the server cent limit: %s',
    (input, expected) => {
      expect(portalBudgetCents(String(input))).toBe(expected);
    },
  );
});
