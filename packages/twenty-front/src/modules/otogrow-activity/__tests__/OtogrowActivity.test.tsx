import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { OtogrowActivity } from '@/otogrow-activity/OtogrowActivity';
import {
  type OtogrowActivityEvent,
  type OtogrowActivityFeed,
} from '@/otogrow-activity/otogrow-activity.types';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { type OtogrowActivityInput } from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryStack: 'div',
  StyledDeliveryBadge: 'span',
}));
let mockMobile = false;
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockMobile,
}));
const mockRefetch = jest.fn();
const mockAccessRefetch = jest.fn();
let mockPermission = {
  access: {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
  },
  scopeKey: 'workspace:admin:membership',
  canManageRoles: true,
  loading: false,
  error: undefined as Error | undefined,
};
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({ ...mockPermission, refetch: mockAccessRefetch }),
}));
let mockFeed: OtogrowActivityFeed;
let mockLoading = false;
let mockError: Error | undefined;
const mockQuery = jest.fn(
  (
    _document: unknown,
    options: { variables: { input: OtogrowActivityInput }; skip: boolean },
  ) => ({
    data: {
      otogrowActivity: options.variables.input.cursor
        ? {
            ...mockFeed,
            nextCursor: null,
            events: [
              {
                ...mockFeed.events[0],
                id: 'older',
                summary: 'Earlier approval recorded',
              },
            ],
          }
        : mockFeed,
    },
    loading: mockLoading,
    error: mockError,
    refetch: mockRefetch,
  }),
);
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: Parameters<typeof mockQuery>) => mockQuery(...args),
}));
const event: OtogrowActivityEvent = {
  id: 'event',
  occurredAt: '2026-10-25T06:00:00.000Z',
  actorId: 'amna',
  actorName: 'Amna',
  actorType: 'HUMAN',
  subjectMemberId: 'editor',
  subjectName: 'Editor',
  action: 'TASK_REVIEWED',
  category: 'DELIVERY',
  outcome: 'APPROVED',
  summary: 'Approved launch video',
  projectId: 'project',
  projectName: 'Launch campaign',
  clientId: 'client',
  clientName: 'Otogrow',
  taskId: 'task',
  taskName: 'Launch video for autumn',
  sourceType: 'task',
  sourceId: 'task',
  changes: [{ field: 'state', before: 'IN_REVIEW', after: 'APPROVED' }],
};

it.each(['META', 'MANUAL'])(
  'opens the exact %s report suggestion run without inventing a task',
  async (kind) => {
    const reportId = '550e8400-e29b-41d4-a716-446655440000';
    const runId = '550e8400-e29b-41d4-a716-446655440001';
    mockFeed.events = [
      {
        ...event,
        actorType: 'AGENT',
        agentName: 'Advertising strategy assistant',
        taskId: null,
        taskName: null,
        sourceType: 'advertising-draft',
        sourceId: runId,
        action: 'ADVERTISING_DRAFT_COMPLETED',
        category: 'ADVERTISING',
        outcome: 'SUCCEEDED',
        summary:
          'Generated proposed recommendations; human review is required.',
        changes: [
          { field: 'advertisingSourceKind', before: null, after: kind },
          { field: 'advertisingSourceId', before: null, after: reportId },
        ],
      },
    ];
    setup();
    expect(
      within(screen.getByRole('list', { name: 'Activity events' })).getByText(
        'Advertising suggestions ready for review',
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByText('View event details'));
    expect(
      screen.getByRole('link', { name: 'Open advertising suggestions' }),
    ).toHaveAttribute(
      'href',
      `/delivery?view=ads&adSource=${kind}&adReport=${reportId}&adDraftRun=${runId}`,
    );
    expect(
      screen.queryByRole('link', { name: 'Open task' }),
    ).not.toBeInTheDocument();
  },
);

it.each([
  [
    'OTHER',
    '550e8400-e29b-41d4-a716-446655440000',
    '550e8400-e29b-41d4-a716-446655440001',
  ],
  ['META', 'invalid-report', '550e8400-e29b-41d4-a716-446655440001'],
  ['META', '550e8400-e29b-41d4-a716-446655440000', 'invalid&adMode=review'],
])(
  'does not offer an unverified suggestion destination: %s',
  async (kind, reportId, runId) => {
    mockFeed.events = [
      {
        ...event,
        sourceType: 'advertising-draft',
        sourceId: runId,
        taskId: null,
        changes: [
          { field: 'advertisingSourceKind', before: null, after: kind },
          { field: 'advertisingSourceId', before: null, after: reportId },
        ],
      },
    ];
    setup();
    await userEvent.click(screen.getByText('View event details'));
    expect(
      screen.queryByRole('link', { name: 'Open advertising suggestions' }),
    ).not.toBeInTheDocument();
  },
);
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Launch campaign',
      companyId: 'client',
      memberIds: [],
    },
  ],
  members: [],
  companies: [],
  tasks: [
    {
      id: 'task',
      title: 'Launch video',
      assigneeId: 'editor',
      dueAt: null,
      projectId: 'project',
      revision: 1,
      details: {
        brief: '',
        service: 'Video',
        priority: 'NORMAL',
        scheduledDate: null,
        reviewerId: 'amna',
        state: 'APPROVED',
        blocker: '',
        checklist: [],
        evidence: [],
        events: [],
        submissions: [],
      },
    },
  ],
};
// oxlint-disable twenty/no-navigate-prefer-link -- This control exercises browser history, not a destination navigation action.
const Location = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Location">{location.search}</output>
      <button onClick={() => navigate(-1)}>Browser back</button>
    </>
  );
};
// oxlint-enable twenty/no-navigate-prefer-link
const setup = (entry = '/delivery?view=activity') => {
  const content = (
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <MemoryRouter initialEntries={[entry]}>
          <Location />
          <OtogrowActivity workspace={workspace} />
        </MemoryRouter>
      </ThemeProvider>
    </I18nProvider>
  );
  const view = render(content);
  return {
    ...view,
    refresh: () =>
      view.rerender(
        <I18nProvider i18n={i18n}>
          <ThemeProvider colorScheme="light">
            <MemoryRouter initialEntries={[entry]}>
              <Location />
              <OtogrowActivity workspace={workspace} />
            </MemoryRouter>
          </ThemeProvider>
        </I18nProvider>,
      ),
  };
};
const currentParams = () =>
  new URLSearchParams(screen.getByLabelText('Location').textContent ?? '');
const currentQuery = () => mockQuery.mock.calls.at(-1)?.[1];
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockQuery.mockClear();
  mockRefetch.mockReset().mockResolvedValue(undefined);
  mockAccessRefetch.mockReset().mockResolvedValue(undefined);
  mockLoading = false;
  mockMobile = false;
  mockError = undefined;
  mockPermission = {
    access: {
      workspaceId: 'workspace',
      memberId: 'admin',
      userWorkspaceId: 'membership',
    },
    scopeKey: 'workspace:admin:membership',
    canManageRoles: true,
    loading: false,
    error: undefined,
  };
  mockFeed = {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
    events: [{ ...event }],
    nextCursor: 'next-page',
    coverageStartedAt: '2026-10-24T06:00:00.000Z',
    people: [{ id: 'amna', name: 'Amna' }],
    projects: [{ id: 'project', name: 'Launch campaign' }],
    clients: [{ id: 'client', name: 'Otogrow' }],
  };
});

it.each([
  ['CREATIVE_FEEDBACK_CREATED', 'Creative feedback added'],
  ['CREATIVE_FEEDBACK_REPLIED', 'Creative feedback replied to'],
  ['CREATIVE_FEEDBACK_ADDRESSED', 'Creative feedback marked addressed'],
  ['CREATIVE_FEEDBACK_RESOLVED', 'Creative feedback verified and resolved'],
  ['CREATIVE_FEEDBACK_REOPENED', 'Creative feedback reopened'],
])(
  'labels %s and links the exact submitted feedback without stale selections',
  (action, label) => {
    const feedbackId = 'f4dfc587-b9ae-4884-b0ea-0414850a207d';
    mockFeed.events = [
      {
        ...event,
        action,
        sourceType: 'creative-review',
        sourceId: feedbackId,
        changes: [
          { field: 'submissionVersion', before: null, after: '2' },
          {
            field: 'assetId',
            before: null,
            after: '5aa5f0b6-ac9e-40a2-9a6c-cbb8de2b5ef8',
          },
        ],
      },
    ];
    setup(
      '/delivery?view=activity&creativeSubmission=1&creativeCompare=3&creativeAsset=old&creativeFeedback=old',
    );
    expect(screen.getByText(label)).toBeVisible();
    const link = screen.getByRole('link', { name: 'Open creative feedback' });
    const target = new URL(
      link.getAttribute('href') ?? '',
      'https://example.test',
    );
    expect(target.searchParams.get('task')).toBe('task');
    expect(target.searchParams.get('panel')).toBe('task');
    expect(target.searchParams.get('creativeSubmission')).toBe('2');
    expect(target.searchParams.get('creativeFeedback')).toBe(feedbackId);
    expect(target.searchParams.has('creativeCompare')).toBe(false);
    expect(target.searchParams.has('creativeAsset')).toBe(false);
  },
);

it('links production feedback to the exact asset review while preserving activity filters', () => {
  const assetId = '5aa5f0b6-ac9e-40a2-9a6c-cbb8de2b5ef8';
  mockFeed.events = [
    {
      ...event,
      action: 'CREATIVE_FEEDBACK_CREATED',
      sourceType: 'creative-review',
      sourceId: 'f4dfc587-b9ae-4884-b0ea-0414850a207d',
      changes: [
        { field: 'assetId', before: null, after: assetId },
        { field: 'submissionVersion', before: null, after: null },
      ],
    },
  ];
  setup('/delivery?view=activity&creativeSubmission=9');
  const target = new URL(
    screen
      .getByRole('link', { name: 'Open creative feedback' })
      .getAttribute('href') ?? '',
    'https://example.test',
  );
  expect(target.searchParams.get('view')).toBe('activity');
  expect(target.searchParams.get('panel')).toBe('creative');
  expect(target.searchParams.get('creativeAsset')).toBe(assetId);
  expect(target.searchParams.has('creativeSubmission')).toBe(false);
});

it.each([
  ['FOUNDER_ESCALATION_RULE_SAVED', 'Founder alert rule saved paused'],
  ['FOUNDER_ESCALATION_RULE_ENABLED', 'Founder alert rule enabled'],
  ['FOUNDER_ESCALATION_RULE_PAUSED', 'Founder alert rule paused'],
  ['FOUNDER_ESCALATION_ACKNOWLEDGED', 'Founder issue acknowledged'],
])('labels %s and opens its exact founder rule', (action, label) => {
  const ruleId = '550e8400-e29b-41d4-a716-446655440000';
  mockFeed.events = [
    {
      ...event,
      action,
      taskId: null,
      taskName: null,
      sourceType: 'founder-alert',
      sourceId: ruleId,
    },
  ];
  setup();
  expect(screen.getByText(label)).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Open founder alert rules' }),
  ).toHaveAttribute(
    'href',
    `/delivery?view=health&founderPanel=alerts&founderRule=${ruleId}`,
  );
});
it('shows factual event context, coverage limits and readable before/after details with a permitted task link', async () => {
  setup();
  expect(screen.getByText(/Recorded activity since/)).toHaveTextContent(
    'Earlier work remains in task histories',
  );
  const events = within(screen.getByRole('list', { name: 'Activity events' }));
  expect(events.getByText('Work reviewed')).toBeInTheDocument();
  expect(events.getByText('Amna · Affects Editor')).toBeInTheDocument();
  await userEvent.click(events.getByText('View event details'));
  expect(events.getByText('Status')).toBeVisible();
  expect(events.getByText('In review')).toBeVisible();
  expect(events.getByText('Before')).toBeVisible();
  expect(events.getByRole('link', { name: 'Open task' })).toHaveAttribute(
    'href',
    '/delivery?view=activity&task=task',
  );
});
it('applies person, project, client, action, outcome and inclusive UTC dates and resets pagination', async () => {
  setup('/delivery?view=activity&activityCursor=old');
  await userEvent.selectOptions(screen.getByLabelText('Person'), 'amna');
  expect(screen.getByLabelText('Project')).not.toBeVisible();
  await userEvent.click(screen.getByText('More filters'));
  await userEvent.selectOptions(screen.getByLabelText('Project'), 'project');
  await userEvent.selectOptions(screen.getByLabelText('Client'), 'client');
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'DELIVERY');
  await userEvent.selectOptions(
    screen.getByLabelText('Action'),
    'TASK_REVIEWED',
  );
  await userEvent.selectOptions(screen.getByLabelText('Outcome'), 'APPROVED');
  await userEvent.type(screen.getByLabelText('From date (UTC)'), '2026-10-24');
  await userEvent.type(
    screen.getByLabelText('Through date (UTC)'),
    '2026-10-25',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(currentQuery()?.variables.input).toEqual({
    personId: 'amna',
    projectId: 'project',
    clientId: 'client',
    category: 'DELIVERY',
    action: 'TASK_REVIEWED',
    outcome: 'APPROVED',
    from: '2026-10-24T00:00:00.000Z',
    through: '2026-10-26T00:00:00.000Z',
    cursor: undefined,
    limit: 30,
  });
  expect(currentParams().has('activityCursor')).toBe(false);
  expect(screen.getByText('More filters · 5 active')).toBeVisible();
  expect(screen.getByLabelText('Project')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(currentParams().toString()).toBe('view=activity');
  expect(screen.getByLabelText('Person')).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  expect(screen.getByLabelText('Person')).toHaveValue('amna');
  expect(screen.getByLabelText('Through date (UTC)')).toHaveValue('2026-10-25');
});
it('keeps draft dates and blocks an invalid range before changing the view', async () => {
  setup();
  await userEvent.type(screen.getByLabelText('From date (UTC)'), '2026-10-26');
  await userEvent.type(
    screen.getByLabelText('Through date (UTC)'),
    '2026-10-25',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'end date on or after the start date',
  );
  expect(screen.getByLabelText('From date (UTC)')).toHaveValue('2026-10-26');
  expect(currentParams().toString()).toBe('view=activity');
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(currentParams().toString()).toBe('view=activity');
  expect(screen.getByLabelText('From date (UTC)')).toHaveValue('');
  expect(screen.getByLabelText('Through date (UTC)')).toHaveValue('');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('loads older cursor pages without losing filters and returns to the latest page', async () => {
  setup('/delivery?view=activity&activityPerson=amna');
  await userEvent.click(screen.getByRole('link', { name: 'Older activity' }));
  expect(
    screen.getByRole('heading', { name: 'Recorded activity' }),
  ).toHaveFocus();
  expect(currentQuery()?.variables.input.cursor).toBe('next-page');
  expect(currentParams().get('activityPerson')).toBe('amna');
  expect(screen.getByText('Earlier approval recorded')).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Older activity' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Latest activity' }));
  expect(currentParams().has('activityCursor')).toBe(false);
  expect(screen.getByText('Approved launch video')).toBeInTheDocument();
});
it('shows empty, loading and retry states without showing retained event data on error', async () => {
  mockFeed.events = [];
  const view = setup();
  expect(
    screen.getByText('No activity has been recorded yet.'),
  ).toHaveAttribute('role', 'status');
  mockLoading = true;
  view.refresh();
  expect(screen.getByText('Loading activity…')).toHaveAttribute(
    'role',
    'status',
  );
  mockLoading = false;
  mockError = new Error('Forbidden');
  mockFeed.events = [event];
  view.refresh();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not load activity',
  );
  expect(screen.queryByText('Approved launch video')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
it.each(['workspaceId', 'memberId', 'userWorkspaceId'] as const)(
  'hides a retained feed belonging to another %s',
  (key) => {
    mockFeed[key] = 'another-identity';
    setup();
    expect(screen.queryByText('Approved launch video')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Amna' }),
    ).not.toBeInTheDocument();
  },
);
it('hides loaded events immediately when administrator access is revoked and provides a way back', () => {
  const view = setup();
  mockPermission.canManageRoles = false;
  view.refresh();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your current access does not include this view',
  );
  expect(screen.queryByText('Approved launch video')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to Today' })).toHaveAttribute(
    'href',
    '/delivery?view=home',
  );
  expect(currentQuery()?.skip).toBe(true);
});
it('distinguishes agent initiation and automation and does not link unavailable or arbitrary sources', async () => {
  mockFeed.events = [
    {
      ...event,
      actorType: 'AGENT',
      sourceType: 'agent-run',
      sourceId: 'run-reference',
    },
    {
      ...event,
      id: 'system',
      actorId: null,
      actorName: 'System',
      actorType: 'SYSTEM',
      sourceType: 'https://unsafe.invalid',
      taskId: null,
      changes: [],
    },
  ];
  setup();
  expect(
    screen.getByText('Agent run initiated by Amna · Affects Editor'),
  ).toBeInTheDocument();
  expect(screen.getByText('Automation · Affects Editor')).toBeInTheDocument();
  for (const summary of screen.getAllByText('View event details'))
    await userEvent.click(summary);
  expect(
    screen.getByRole('link', { name: "Open task's assistant runs" }),
  ).toHaveAttribute('href', '/delivery?view=activity&task=task&panel=agents');
  expect(screen.getByText('Run reference: run-reference')).toBeVisible();
  expect(
    screen.getByText('The source is not available in the current workspace.'),
  ).toBeVisible();
});
it('keeps mobile filters compact and applies a person without hiding the resulting events', async () => {
  mockMobile = true;
  setup();
  expect(screen.getByLabelText('Person')).not.toBeVisible();
  await userEvent.click(screen.getByText('Filters'));
  await userEvent.selectOptions(screen.getByLabelText('Person'), 'amna');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(screen.getByText('Filters · 1 active')).toBeVisible();
  expect(screen.getByLabelText('Person')).not.toBeVisible();
  expect(screen.getByText('Approved launch video')).toBeVisible();
});
it('provides recovery for an empty filtered view and permission-check failure', async () => {
  mockFeed.events = [];
  mockFeed.nextCursor = null;
  const view = setup('/delivery?view=activity&activityPerson=amna');
  expect(
    screen.getByText('No recorded activity matches this view.'),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Show latest activity' }),
  );
  expect(currentParams().toString()).toBe('view=activity');
  mockPermission.error = new Error('Network unavailable');
  view.refresh();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Activity is hidden until access can be verified',
  );
  expect(
    screen.queryByRole('form', { name: 'Activity filters' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check access again' }),
  );
  expect(mockAccessRefetch).toHaveBeenCalledTimes(1);
});
it.each([
  ['AGENT_UPDATED', 'agent', 'Open assistants', '/delivery?view=agents'],
  [
    'RECURRING_TEMPLATE_PAUSED',
    'recurrence',
    'Open recurring work',
    '/delivery?view=operations',
  ],
  [
    'DELIVERY_SETTINGS_UPDATED',
    'settings',
    'Open delivery settings',
    '/delivery?view=operations',
  ],
])(
  'links recorded configuration changes for %s and displays boolean values as Yes and No',
  async (action, sourceType, linkName, target) => {
    mockFeed.events = [
      {
        ...event,
        action,
        sourceType,
        sourceId: '550e8400-e29b-41d4-a716-446655440000',
        changes: [{ field: 'enabled', before: 'false', after: 'true' }],
      },
    ];
    const view = setup();
    await userEvent.click(screen.getByText('View event details'));
    expect(screen.getByText('Enabled')).toBeVisible();
    expect(screen.getByText('No')).toBeVisible();
    expect(screen.getByText('Yes')).toBeVisible();
    expect(screen.getByRole('link', { name: linkName })).toHaveAttribute(
      'href',
      target,
    );
    mockFeed = {
      ...mockFeed,
      events: [{ ...mockFeed.events[0], sourceId: 'invalid-reference' }],
    };
    view.refresh();
    expect(
      screen.queryByRole('link', { name: linkName }),
    ).not.toBeInTheDocument();
  },
);

it('identifies named work and the assistant separately from its human initiator', () => {
  mockFeed.events = [
    {
      ...event,
      actorType: 'AGENT',
      agentName: 'Creative brief assistant',
      sourceType: 'agent-run',
    },
  ];
  setup();
  expect(
    screen.getByRole('heading', { name: 'Launch video for autumn' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'Creative brief assistant · initiated by Amna · Affects Editor',
    ),
  ).toBeInTheDocument();
});
it.each([
  ['FINANCE_PAID', 'finance', 'Open finance', '/delivery?view=finance'],
  [
    'FINANCE_FORECAST_ANCHOR_REVIEWED',
    'finance-forecast',
    'Open cash forecast',
    '/delivery?view=finance&financeView=forecast',
  ],
  [
    'CLIENT_SHARE_REVIEWED',
    'client-share',
    'Open clients',
    '/delivery?view=clients',
  ],
  [
    'AD_REPORT_APPROVED',
    'ad-report',
    'Open advertising report',
    '/delivery?view=ads&adSource=MANUAL&adReport=550e8400-e29b-41d4-a716-446655440000',
  ],
  [
    'META_CONNECTION_CONFIGURED',
    'meta-connection',
    'Open advertising connections',
    '/delivery?view=ads&adView=legacy',
  ],
  [
    'AD_BUDGET_REQUESTED',
    'budget',
    'Open advertising budgets',
    '/delivery?view=ads&adView=legacy',
  ],
  [
    'DELIVERY_ALERT_ACKNOWLEDGED',
    'alert',
    'Open delivery alerts',
    '/delivery?view=operations',
  ],
])(
  'links %s to its permitted workspace area',
  async (action, sourceType, name, target) => {
    mockFeed.events = [
      {
        ...event,
        action,
        sourceType,
        taskId: null,
        sourceId: '550e8400-e29b-41d4-a716-446655440000',
      },
    ];
    setup();
    await userEvent.click(screen.getByText('View event details'));
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', target);
  },
);
it.each([
  ['FINANCE_EXPORT_PROFILE_SAVED', 'Export profile saved'],
  ['FINANCE_EXPORT_BATCH_CREATED', 'Immutable batch created'],
  ['FINANCE_EXPORT_IMPORT_CONFIRMED', 'Manual import recorded'],
  ['FINANCE_EXPORT_IMPORT_REVERSED', 'Manual import confirmation reversed'],
])(
  'labels %s and links to accounting exports without guessing a source kind',
  async (action, label) => {
    mockFeed.events = [
      {
        ...event,
        action,
        category: 'BUSINESS',
        sourceType: 'finance-export',
        sourceId: '550e8400-e29b-41d4-a716-446655440000',
        taskId: null,
        taskName: null,
      },
    ];
    setup();
    expect(screen.getByText(label, { selector: 'strong' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('View event details'));
    expect(
      screen.getByRole('link', { name: 'Open accounting exports' }),
    ).toHaveAttribute('href', '/delivery?view=finance&financeView=exports');
  },
);

it('links a monthly review event to its recorded service month', async () => {
  mockFeed.events = [
    {
      ...event,
      action: 'FINANCE_PERIOD_LOCKED',
      sourceType: 'finance-period',
      sourceId: '550e8400-e29b-41d4-a716-446655440000',
      taskId: null,
      changes: [{ field: 'financeMonth', before: '2026-09', after: '2026-09' }],
    },
  ];
  setup();
  expect(screen.getByText('Monthly results locked')).toBeInTheDocument();
  await userEvent.click(screen.getByText('View event details'));
  expect(
    screen.getByRole('link', { name: 'Open monthly review' }),
  ).toHaveAttribute(
    'href',
    '/delivery?view=finance&financeView=monthly&financeMonth=2026-09',
  );
});

it('marks client portal activity separately and supports business and client filters', async () => {
  mockFeed.events = [
    {
      ...event,
      actorType: 'CLIENT',
      actorId: null,
      actorName: 'Client portal',
      category: 'CLIENT',
      action: 'CLIENT_SHARE_REVIEWED',
      subjectMemberId: null,
      subjectName: null,
    },
  ];
  setup();
  expect(
    screen.getByText('Client portal', { selector: 'p' }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByText('More filters'));
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'BUSINESS');
  await userEvent.selectOptions(
    screen.getByLabelText('Action'),
    'AD_REPORT_APPROVED',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(currentQuery()?.variables.input).toEqual(
    expect.objectContaining({
      category: 'BUSINESS',
      action: 'AD_REPORT_APPROVED',
    }),
  );
});

it('links a creative event to its task stage and a Meta event to its exact report', async () => {
  mockFeed.events = [
    {
      ...event,
      sourceType: 'creative',
      action: 'CREATIVE_BRIEF_UPDATED',
      category: 'CREATIVE',
    },
    {
      ...event,
      id: 'meta-event',
      taskId: null,
      sourceType: 'meta-report',
      sourceId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'META_REPORT_IMPORTED',
      category: 'ADVERTISING',
    },
  ];
  setup();
  for (const summary of screen.getAllByText('View event details'))
    await userEvent.click(summary);
  expect(screen.getByRole('link', { name: 'Open task' })).toHaveAttribute(
    'href',
    '/delivery?view=activity&task=task&panel=creative',
  );
  expect(
    screen.getByRole('link', { name: 'Open advertising report' }),
  ).toHaveAttribute(
    'href',
    '/delivery?view=ads&adSource=META&adReport=550e8400-e29b-41d4-a716-446655440000',
  );
  await userEvent.click(screen.getByText('More filters'));
  expect(
    screen.getByRole('option', { name: 'Creative production' }),
  ).toHaveValue('CREATIVE');
  expect(screen.getByRole('option', { name: 'Advertising' })).toHaveValue(
    'ADVERTISING',
  );
});

it('opens an exact recorded work analysis, preserves filters and clears obsolete preparation requests', async () => {
  const runId = '550e8400-e29b-41d4-a716-446655440010';
  mockFeed.events = [
    {
      ...event,
      sourceType: 'activity-analysis',
      sourceId: runId,
      action: 'ACTIVITY_ANALYSIS_COMPLETED',
      actorType: 'AGENT',
      taskId: null,
      taskName: null,
    },
  ];
  setup(
    '/delivery?view=activity&activityPerson=amna&activityFrom=2026-10-25&activityAnalysis=prepare&activityAssistant=old-assistant&activityAnalysisRequest=old-start&activityAnalysisRun=old-run&activityAnalysisCancel=old-cancel',
  );
  const user = userEvent.setup();
  expect(
    within(screen.getByRole('list', { name: 'Activity events' })).getByText(
      'Work analysis ready',
    ),
  ).toBeVisible();
  await user.click(screen.getByText('View event details'));
  const href = screen
    .getByRole('link', { name: 'Open saved work analysis' })
    .getAttribute('href');
  const destination = new URLSearchParams(href?.split('?')[1]);
  expect(destination.get('activityPerson')).toBe('amna');
  expect(destination.get('activityFrom')).toBe('2026-10-25');
  expect(destination.get('activityAnalysis')).toBe('history');
  expect(destination.get('activityAnalysisRun')).toBe(runId);
  for (const key of [
    'activityAssistant',
    'activityAnalysisRequest',
    'activityAnalysisCancel',
  ])
    expect(destination.has(key)).toBe(false);
  await user.click(screen.getByText('More filters'));
  for (const name of [
    'Work analysis queued',
    'Work analysis started',
    'Work analysis ready',
    'Work analysis failed',
    'Work analysis cancelled',
    'Work analysis interrupted',
  ])
    expect(screen.getByRole('option', { name })).toBeVisible();
});

it('does not construct an analysis destination from an invalid source identifier', async () => {
  mockFeed.events = [
    {
      ...event,
      sourceType: 'activity-analysis',
      sourceId: 'invalid&activityAnalysisRequest=fake',
      action: 'ACTIVITY_ANALYSIS_FAILED',
      taskId: null,
    },
  ];
  setup();
  await userEvent.setup().click(screen.getByText('View event details'));
  expect(
    screen.queryByRole('link', { name: 'Open saved work analysis' }),
  ).not.toBeInTheDocument();
});

it('links a recorded release decision to its exact project release with familiar language', () => {
  const projectId = '550e8400-e29b-41d4-a716-446655440001';
  const releaseId = '550e8400-e29b-41d4-a716-446655440002';
  mockFeed.events = [
    {
      ...event,
      action: 'DEVELOPMENT_RELEASE_RECORD_DEPLOYMENT_FAILED',
      sourceType: 'development-release',
      sourceId: releaseId,
      projectId,
      taskId: null,
      taskName: null,
    },
  ];
  setup();
  expect(screen.getByText('Failed deployment recorded')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open release' })).toHaveAttribute(
    'href',
    `/delivery?view=development&releaseProject=${projectId}&releaseId=${releaseId}`,
  );
});

it('links a saved competitor source to its exact project directory detail', () => {
  const projectId = '550e8400-e29b-41d4-a716-446655440001';
  const sourceId = '550e8400-e29b-41d4-a716-446655440002';
  mockFeed.events = [
    {
      ...event,
      action: 'COMPETITOR_SOURCE_SAVE',
      sourceType: 'competitor-source',
      sourceId,
      projectId,
      taskId: null,
      taskName: null,
    },
  ];
  setup();
  expect(
    screen.getByText('Competitor source saved', { selector: 'strong' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Open competitor source' }),
  ).toHaveAttribute(
    'href',
    `/delivery?view=competitors&competitorProject=${projectId}&competitorSource=${sourceId}`,
  );
});
it('keeps earlier manual competitor activity linked to its original finding', () => {
  mockFeed.events = [
    {
      ...event,
      action: 'COMPETITOR_CREATED',
      sourceType: 'competitor',
      sourceId: '550e8400-e29b-41d4-a716-446655440003',
      taskId: null,
      taskName: null,
    },
  ];
  setup();
  expect(
    screen.getByRole('link', { name: 'Open competitor research' }),
  ).toHaveAttribute(
    'href',
    '/delivery?view=competitors&competitorView=legacy&businessRecord=550e8400-e29b-41d4-a716-446655440003',
  );
});

it.each([
  [
    'content-account',
    'CONTENT_ACCOUNT_SAVE',
    'contentAccountId',
    'Open content account',
  ],
  ['content-plan', 'CONTENT_PLAN_SAVE', 'contentPlanId', 'Open content plan'],
  [
    'content-post',
    'CONTENT_POST_RECORD_PUBLICATION',
    'contentPostId',
    'Open content post',
  ],
])(
  'opens exact %s activity in its current project',
  (sourceType, action, key, label) => {
    const projectId = '550e8400-e29b-41d4-a716-446655440001';
    const sourceId = '550e8400-e29b-41d4-a716-446655440002';
    mockFeed.events = [
      {
        ...event,
        sourceType,
        action,
        sourceId,
        projectId,
        taskId: null,
        taskName: null,
      },
    ];
    setup();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute(
      'href',
      `/delivery?view=content&contentProject=${projectId}&${key}=${sourceId}`,
    );
  },
);

it('keeps earlier manual content activity attached to the original record', () => {
  const sourceId = '550e8400-e29b-41d4-a716-446655440003';
  mockFeed.events = [
    {
      ...event,
      action: 'CONTENT_PUBLISHED',
      sourceType: 'content',
      sourceId,
      taskId: null,
      taskName: null,
    },
  ];
  setup();
  expect(
    screen.getByRole('link', { name: 'Open earlier content record' }),
  ).toHaveAttribute(
    'href',
    `/delivery?view=content&contentView=legacy&businessRecord=${sourceId}`,
  );
});

it.each([
  ['KNOWLEDGE_FILE_UPLOAD_STARTED', 'Brand file upload started'],
  ['KNOWLEDGE_FILE_READY', 'Brand file ready'],
  ['KNOWLEDGE_FILE_UPLOAD_FAILED', 'Brand file upload failed'],
  ['KNOWLEDGE_FILE_DISCARDED', 'Unused brand file discarded'],
  ['KNOWLEDGE_FILE_CLEANED', 'Unused brand file removed'],
])(
  'explains %s and opens project recovery without treating an upload as saved knowledge',
  (action, label) => {
    const projectId = '550e8400-e29b-41d4-a716-446655440001';
    mockFeed.events = [
      {
        ...event,
        action,
        sourceType: 'knowledge-upload',
        sourceId: '550e8400-e29b-41d4-a716-446655440002',
        projectId,
        taskId: null,
        taskName: null,
      },
    ];
    setup();
    expect(screen.getByText(label)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open unused brand uploads' }),
    ).toHaveAttribute('href', `/delivery?view=knowledge&project=${projectId}`);
    expect(
      screen.queryByRole('link', { name: 'Open brand knowledge' }),
    ).not.toBeInTheDocument();
  },
);

it('does not invent a project link for an upload event without a current project', () => {
  mockFeed.events = [
    {
      ...event,
      action: 'KNOWLEDGE_FILE_READY',
      sourceType: 'knowledge-upload',
      sourceId: '550e8400-e29b-41d4-a716-446655440002',
      projectId: null,
      taskId: null,
      taskName: null,
    },
  ];
  setup();
  expect(screen.getByText('Brand file ready')).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Open unused brand uploads' }),
  ).not.toBeInTheDocument();
});
