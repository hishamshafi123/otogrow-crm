import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { ActivityAnalysisContextView } from '@/otogrow-activity/analysis/ActivityAnalysisContextView';
import { ActivityCurrentTaskFacts } from '@/otogrow-activity/analysis/ActivityCurrentTaskFacts';
import { ActivityAnalysisResultView } from '@/otogrow-activity/analysis/ActivityAnalysisResultView';
import {
  activityAnalysisContext,
  activityAnalysisDetail,
  activityCurrentWork,
  activityCurrentAnalysisDetail,
  ACTIVITY_CURRENT_TASK_ID,
  ACTIVITY_EVENT_ID,
} from '@/otogrow-activity/analysis/__tests__/activity-analysis.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));
beforeEach(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
it('shows scope, coverage gaps and the actor separately from the affected person', async () => {
  const context = activityAnalysisContext();
  context.totalCount = 4;
  context.omittedCount = 3;
  context.truncatedFieldCount = 2;
  context.omittedBytes = 80;
  const onCitation = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ActivityAnalysisContextView context={context} onCitation={onCitation} />
    </I18nProvider>,
  );
  expect(screen.getByText('1 included · 4 matching · 3 omitted')).toBeVisible();
  expect(
    screen.getByText('2 fields shortened · 80 bytes omitted'),
  ).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByText('Inspect the recorded evidence'));
  expect(
    screen.getByText(/Amna · Affects Editor/u, { selector: 'p' }),
  ).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: /Work reviewed · Amna/u }));
  expect(onCitation).toHaveBeenCalledWith({
    kind: 'EVENT',
    eventId: ACTIVITY_EVENT_ID,
  });
});
it('distinguishes an assistant run from its human initiator and preserves an unknown settings boundary', async () => {
  const context = activityAnalysisContext();
  context.events[0].actorType = 'AGENT';
  context.events[0].agentName = 'Draft assistant';
  context.assistantInstructions = null;
  render(
    <I18nProvider i18n={i18n}>
      <ActivityAnalysisContextView context={context} onCitation={jest.fn()} />
    </I18nProvider>,
  );
  await userEvent
    .setup()
    .click(screen.getByText('Inspect the recorded evidence'));
  expect(
    screen.getByText(/Assistant Draft assistant · initiated by Amna/u, {
      selector: 'p',
    }),
  ).toBeVisible();
  await userEvent.setup().click(screen.getByText('Assistant settings used'));
  expect(
    screen.getByText(/Private assistant settings are withheld/u),
  ).toBeVisible();
});
it('ties both the summary and findings to exact events and labels tentative handoff inferences', async () => {
  const detail = activityAnalysisDetail();
  if (!detail.result) throw new Error('Expected fixture result');
  detail.result.findings[0].kind = 'POSSIBLE_BOTTLENECK';
  const onCitation = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ActivityAnalysisResultView detail={detail} onCitation={onCitation} />
    </I18nProvider>,
  );
  expect(
    screen.getByRole('heading', {
      name: 'Possible handoff issue · verify current work',
    }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Whether the editor has completed the revision is not established.',
    ),
  ).toBeVisible();
  expect(
    screen.getAllByRole('button', { name: /Work reviewed · Amna/u }),
  ).toHaveLength(2);
  await userEvent
    .setup()
    .click(screen.getAllByRole('button', { name: /Work reviewed · Amna/u })[0]);
  expect(onCitation).toHaveBeenCalledWith({
    kind: 'EVENT',
    eventId: ACTIVITY_EVENT_ID,
  });
});
it('does not invent an answer or a destination for an unavailable citation', () => {
  const detail = activityAnalysisDetail();
  if (!detail.result) throw new Error('Expected fixture result');
  detail.result.summaryCitationIds = ['not-a-known-reference'];
  render(
    <I18nProvider i18n={i18n}>
      <ActivityAnalysisResultView detail={detail} onCitation={jest.fn()} />
    </I18nProvider>,
  );
  expect(screen.getByText('Evidence reference unavailable')).toBeVisible();
});

it('humanizes technical citation labels with the recorded action, assistant initiator and readable UTC time', async () => {
  const detail = activityAnalysisDetail();
  const event = detail.context.events[0];
  event.action = 'AGENT_UPDATED';
  event.actorType = 'AGENT';
  event.agentName = 'Draft assistant';
  detail.context.citations[0].label = 'AGENT_SAVED 2026-10-31T10:00:00.123456Z';
  const onCitation = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ActivityAnalysisResultView detail={detail} onCitation={onCitation} />
    </I18nProvider>,
  );
  const citation = screen.getAllByRole('button', {
    name: /^Assistant updated · Assistant Draft assistant · initiated by Amna/u,
  })[0];
  expect(citation).toHaveTextContent(formatActivityTime(event.occurredAt));
  expect(citation).not.toHaveTextContent('AGENT_SAVED');
  expect(citation).not.toHaveTextContent('2026-10-31T10:00:00.123456Z');
  await userEvent.setup().click(citation);
  expect(onCitation).toHaveBeenCalledWith({
    kind: 'EVENT',
    eventId: ACTIVITY_EVENT_ID,
  });
  expect(detail.context.citations[0].href).toBe(
    `/delivery?view=activity&activityEvent=${ACTIVITY_EVENT_ID}`,
  );
});

it('uses a plain recorded-evidence fallback when a known citation lacks its matching snapshot event', async () => {
  const detail = activityAnalysisDetail();
  detail.context.events = [];
  detail.context.citations[0].label = 'AGENT_SAVED internal-reference';
  const onCitation = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ActivityAnalysisResultView detail={detail} onCitation={onCitation} />
    </I18nProvider>,
  );
  const citation = screen.getAllByRole('button', {
    name: /^Recorded evidence ·/u,
  })[0];
  expect(citation).not.toHaveTextContent('AGENT_SAVED');
  await userEvent.setup().click(citation);
  expect(onCitation).toHaveBeenCalledWith({
    kind: 'EVENT',
    eventId: ACTIVITY_EVENT_ID,
  });
});

it('separates a current-work capture from audit dates and preserves the eligible backup reviewer', async () => {
  const detail = activityCurrentAnalysisDetail();
  const onCitation = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <ActivityAnalysisContextView
        context={detail.context}
        onCitation={onCitation}
      />
    </I18nProvider>,
  );
  expect(
    screen.getByRole('region', { name: 'Current work snapshot' }),
  ).toBeVisible();
  expect(
    screen.getByText(/1 task included · 1 matching · 0 omitted/u),
  ).toBeVisible();
  expect(
    screen.getByText(
      /Audit dates, category, action and outcome do not filter current work/u,
    ),
  ).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByText('Inspect captured current task facts'));
  expect(screen.getByText('Submission backup')).toBeVisible();
  expect(screen.getByText('Eligible now')).toBeVisible();
  await userEvent.setup().click(
    screen.getByRole('button', {
      name: /^Task snapshot · Launch video awaiting review/u,
    }),
  );
  expect(onCitation).toHaveBeenCalledWith({
    kind: 'CURRENT_TASK',
    taskId: ACTIVITY_CURRENT_TASK_ID,
    scope: detail.context.currentWork?.scope,
  });
});

it('does not make a self-review assignment look actionable', () => {
  const task = activityCurrentWork().items[0];
  task.reviewerState = 'SELF_REVIEW';
  task.effectiveReviewerId = task.ownerId;
  task.effectiveReviewerName = task.ownerName;
  render(
    <I18nProvider i18n={i18n}>
      <ActivityCurrentTaskFacts task={task} />
    </I18nProvider>,
  );
  expect(screen.getByText('Independent reviewer needed')).toBeVisible();
  expect(
    screen.getByText(/The owner cannot approve their own work/u),
  ).toBeVisible();
  expect(screen.queryByText('Eligible now')).not.toBeInTheDocument();
});

it('labels legacy history as having no current-work evidence instead of inventing zero current tasks', () => {
  const detail = activityAnalysisDetail();
  render(
    <I18nProvider i18n={i18n}>
      <ActivityAnalysisContextView
        context={detail.context}
        onCitation={jest.fn()}
      />
    </I18nProvider>,
  );
  expect(
    screen.getByText(/Current work was not included in this analysis/u),
  ).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Current work snapshot' }),
  ).not.toBeInTheDocument();
});

it('labels current-state findings and keeps interpretation limits accessible without hiding unknowns or citations', async () => {
  const detail = activityCurrentAnalysisDetail();
  if (!detail.result) throw new Error('Expected fixture result');
  detail.result.findings[0].kind = 'CURRENT_STATE';
  detail.result.limitations = [
    'The saved capture cannot establish later changes.',
    'Audit dates do not filter the current tasks.',
  ];
  render(
    <I18nProvider i18n={i18n}>
      <ActivityAnalysisResultView detail={detail} onCitation={jest.fn()} />
    </I18nProvider>,
  );
  expect(
    screen.getByRole('heading', { name: 'Current work finding' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Recorded finding' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('Changes after the capture have not been checked.'),
  ).toBeVisible();
  const summary = screen.getByText('Evidence limits and interpretation notes');
  expect(
    screen.getByText('The saved capture cannot establish later changes.'),
  ).not.toBeVisible();
  const user = userEvent.setup();
  await user.tab();
  await user.tab();
  await user.tab();
  expect(summary).toHaveFocus();
  await user.click(summary);
  expect(summary).toHaveFocus();
  expect(
    screen.getByText('The saved capture cannot establish later changes.'),
  ).toBeVisible();
  expect(
    screen.getByText('Audit dates do not filter the current tasks.'),
  ).toBeVisible();
  expect(
    screen.getAllByRole('button', {
      name: /^Task snapshot · Launch video awaiting review/u,
    }),
  ).toHaveLength(2);
  await user.click(summary);
  expect(
    screen.getByText('The saved capture cannot establish later changes.'),
  ).not.toBeVisible();
  expect(
    screen.getByText('Changes after the capture have not been checked.'),
  ).toBeVisible();
});
