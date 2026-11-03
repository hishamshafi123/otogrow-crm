import { BadRequestException } from '@nestjs/common';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  activityAnalysisBody,
  activityAnalysisBlockedReasons,
  activityAnalysisContextFingerprint,
  activityAnalysisResponseSchema,
  activityAnalysisSystemPrompt,
  buildActivityAnalysisContext,
  validateActivityAnalysisOutput,
  ACTIVITY_ANALYSIS_SYSTEM_PROMPT,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.policy';
import {
  activityAnalysisPreviewSchema,
  startActivityAnalysisSchema,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.types';
import {
  activityAnalysisFixture,
  MEMBER_ID,
  OTHER_MEMBER_ID,
} from './activity-analysis.fixture';
import {
  boundCurrentTask,
  finishCurrentWorkSnapshot,
} from 'src/modules/otogrow-activity/analysis/current-work/activity-current-work.policy';
import { type ActivityCurrentTask } from 'src/modules/otogrow-activity/analysis/current-work/activity-current-work.types';

const setup = () => {
  const fixture = activityAnalysisFixture();
  const input = activityAnalysisPreviewSchema.parse({
    ...fixture.input,
    includeCurrentWork: true,
    filters: { ...fixture.input.filters, personId: MEMBER_ID },
  });
  const task: ActivityCurrentTask = {
    taskId: OTHER_MEMBER_ID,
    title: 'Review the creative',
    projectId: MEMBER_ID,
    projectName: 'Brand',
    clientId: null,
    clientName: null,
    taskRevision: 3,
    state: 'IN_REVIEW',
    blocker: null,
    ownerId: OTHER_MEMBER_ID,
    ownerName: 'Editor',
    dueAt: '2026-11-03T00:00:00.000Z',
    submissionVersion: 2,
    submittedAt: '2026-11-02T03:00:00.000Z',
    primaryReviewerId: MEMBER_ID,
    primaryReviewerName: 'Amna',
    effectiveReviewerId: MEMBER_ID,
    effectiveReviewerName: 'Amna',
    reviewerState: 'ACTIVE',
    assignmentMode: 'PRIMARY',
    assignmentRevision: 0,
    warnings: [],
    detailsTruncated: false,
    href: `/delivery?view=activity&activityCurrentTask=${OTHER_MEMBER_ID}`,
  };
  const snapshot = finishCurrentWorkSnapshot({
    capturedAt: fixture.evidence.capturedAt,
    scope: { personId: MEMBER_ID, projectId: null, clientId: null },
    totalCount: 1,
    tasks: [boundCurrentTask(task)],
    nativeVisibilityFingerprint: 'a'.repeat(64),
  });
  const context = buildActivityAnalysisContext(
    input,
    fixture.agent,
    fixture.evidence,
    snapshot,
  );
  const output = {
    summary: 'One task was waiting for review at capture.',
    summaryCitationIds: [`current-task:${task.taskId}`],
    findings: [
      {
        kind: 'CURRENT_STATE',
        text: 'The latest submission has an eligible reviewer.',
        citationIds: [`current-task:${task.taskId}`],
      },
    ],
    unknowns: ['The cause of the wait is unknown.'],
    limitations: ['The live source may have changed.'],
  };
  return { ...fixture, input, task, snapshot, context, output };
};

describe('optional current-work analysis contract', () => {
  it('preserves the exact old body and receipt input hashes when opt-in is false or omitted', () => {
    const fixture = activityAnalysisFixture();
    const omitted = activityAnalysisPreviewSchema.parse(fixture.input);
    const explicitFalse = activityAnalysisPreviewSchema.parse({
      ...fixture.input,
      includeCurrentWork: false,
    });
    expect(advertisingHash(activityAnalysisBody(explicitFalse))).toBe(
      advertisingHash(activityAnalysisBody(omitted)),
    );
    const command = {
      ...fixture.input,
      id: MEMBER_ID,
      requestId: OTHER_MEMBER_ID,
      capturedAt: fixture.evidence.capturedAt,
      bodyFingerprint: 'a'.repeat(64),
      contextFingerprint: 'b'.repeat(64),
      evidenceFingerprint: 'c'.repeat(64),
      agentVersion: 1,
      pricingRevision: 1,
    };
    expect(
      advertisingHash(
        startActivityAnalysisSchema.parse({
          ...command,
          includeCurrentWork: false,
        }),
      ),
    ).toBe(advertisingHash(startActivityAnalysisSchema.parse(command)));
    const oldContext = buildActivityAnalysisContext(
      omitted,
      fixture.agent,
      fixture.evidence,
    );
    expect(oldContext).not.toHaveProperty('currentWork');
    expect(activityAnalysisSystemPrompt(oldContext)).toBe(
      ACTIVITY_ANALYSIS_SYSTEM_PROMPT,
    );
  });
  it('keeps current tasks separate from dated historical events and uses typed exact citations', () => {
    const { context, task, snapshot } = setup();
    expect(context.events).toHaveLength(1);
    expect(context.currentWork).toEqual(snapshot);
    expect(context.currentWork?.items[0].submittedAt).toBe(
      '2026-11-02T03:00:00.000Z',
    );
    expect(context.through).toBe('2026-11-01T00:00:00.000Z');
    expect(
      context.citations.find((citation) => citation.kind === 'CURRENT_TASK'),
    ).toMatchObject({ taskId: task.taskId, capturedAt: snapshot.capturedAt });
    expect(context.limitations.join(' ')).toContain('effective reviewer');
    expect(activityAnalysisSystemPrompt(context)).toContain('CURRENT_TASK');
  });
  it('allows current-only evidence but blocks empty or incomplete evidence before a funded request', () => {
    const { input, agent, evidence, snapshot } = setup();
    const context = buildActivityAnalysisContext(
      input,
      agent,
      { ...evidence, events: [], totalCount: 0 },
      snapshot,
    );
    expect(activityAnalysisBlockedReasons(context)).toEqual([]);
    expect(
      activityAnalysisBlockedReasons({
        ...context,
        currentWork: { ...snapshot, complete: false, omittedCount: 1 },
      })[0],
    ).toContain('incomplete');
    expect(
      activityAnalysisBlockedReasons({
        ...context,
        currentWork: { ...snapshot, complete: false, truncatedFieldCount: 1 },
      })[0],
    ).toContain('incomplete');
    expect(
      activityAnalysisBlockedReasons({
        ...context,
        currentWork: {
          ...snapshot,
          totalCount: 0,
          items: [],
          includedCount: 0,
        },
      })[0],
    ).toContain('No recorded activity or current work');
    expect(() => buildActivityAnalysisContext(input, agent, evidence)).toThrow(
      BadRequestException,
    );
  });
  it('rejects current-state claims supported only by recorded events and keeps the old output contract unchanged', () => {
    const { context, output, event, input, agent, evidence } = setup();
    expect(
      validateActivityAnalysisOutput(output, context).findings[0].kind,
    ).toBe('CURRENT_STATE');
    for (const kind of ['CURRENT_STATE', 'POSSIBLE_BOTTLENECK'])
      expect(() =>
        validateActivityAnalysisOutput(
          {
            ...output,
            findings: [
              {
                ...output.findings[0],
                kind,
                citationIds: [`event:${event.id}`],
              },
            ],
          },
          context,
        ),
      ).toThrow(BadRequestException);
    expect(() =>
      validateActivityAnalysisOutput(
        { ...output, findings: [{ ...output.findings[0], kind: 'RECORDED' }] },
        context,
      ),
    ).toThrow(BadRequestException);
    const old = buildActivityAnalysisContext(
      { ...input, includeCurrentWork: undefined },
      agent,
      evidence,
    );
    expect(activityAnalysisResponseSchema(old).safeParse(output).success).toBe(
      false,
    );
    expect(() =>
      activityAnalysisSystemPrompt({
        ...context,
        promptVersion: 'unknown-version',
      }),
    ).toThrow(BadRequestException);
  });
  it('binds current state and reviewer facts into the confirmed request', () => {
    const { context, agent, snapshot } = setup();
    expect(
      activityAnalysisContextFingerprint(
        {
          ...context,
          currentWork: {
            ...snapshot,
            items: [{ ...snapshot.items[0], state: 'APPROVED' }],
          },
        },
        agent,
      ),
    ).not.toBe(activityAnalysisContextFingerprint(context, agent));
    expect(
      activityAnalysisContextFingerprint(
        {
          ...context,
          currentWork: {
            ...snapshot,
            items: [
              { ...snapshot.items[0], effectiveReviewerId: OTHER_MEMBER_ID },
            ],
          },
        },
        agent,
      ),
    ).not.toBe(activityAnalysisContextFingerprint(context, agent));
  });
});
