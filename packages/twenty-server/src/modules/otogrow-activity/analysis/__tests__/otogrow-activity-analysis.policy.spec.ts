import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { advertisingCanonicalJson } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  buildActivityAnalysisContext,
  activityAnalysisContextFingerprint,
  activityAnalysisPrompt,
  activityAnalysisBlockedReasons,
  validateActivityAnalysisOutput,
  assertActivityAnalysisPrivacy,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.policy';
import {
  activityAnalysisPreviewSchema,
  type ActivityAnalysisContext,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.types';
import { projectActivityEvent } from 'src/modules/otogrow-activity/otogrow-activity.reads';
import { activityAnalysisFixture } from 'src/modules/otogrow-activity/analysis/__tests__/activity-analysis.fixture';

describe('recorded activity analysis evidence', () => {
  it('keeps six-digit event timestamps and actor versus affected-person identity without asserting current workflow state', () => {
    const { input, agent, evidence, event } = activityAnalysisFixture();
    const context = buildActivityAnalysisContext(input, agent, evidence);
    expect(context.events[0]).toEqual({ ...event, detailsTruncated: false });
    expect(context.truncatedFieldCount).toBe(0);
    expect(context.omittedBytes).toBe(0);
    expect(context.citations[0].href).toContain(`activityEvent=${event.id}`);
    expect(context.limitations.join(' ')).toContain('Current task status');
    expect(context.limitations.join(' ')).toContain('unknown');
  });
  it('requires explicit UTC dates and a real question', () => {
    const { input } = activityAnalysisFixture();
    expect(
      activityAnalysisPreviewSchema.safeParse({ ...input, filters: {} })
        .success,
    ).toBe(false);
    expect(
      activityAnalysisPreviewSchema.safeParse({ ...input, question: '  ' })
        .success,
    ).toBe(false);
    expect(
      activityAnalysisPreviewSchema.safeParse({
        ...input,
        filters: { ...input.filters, from: '2026-10-01' },
      }).success,
    ).toBe(false);
  });
  it('retains agent and system actor attribution rather than calling it manual employee effort', () => {
    const { input, agent, evidence } = activityAnalysisFixture();
    evidence.events[0].actorType = 'AGENT';
    const context = buildActivityAnalysisContext(input, agent, evidence);
    expect(context.events[0].actorType).toBe('AGENT');
    expect(context.limitations.join(' ')).toContain(
      'not manual employee effort',
    );
  });
  it('bounds multibyte fields and reports exact removed bytes without splitting UTF8 characters', () => {
    const { input, agent, evidence } = activityAnalysisFixture();
    evidence.events[0].actorName = '😀'.repeat(100);
    evidence.events[0].changes[0].after = 'é'.repeat(200);
    const context = buildActivityAnalysisContext(input, agent, evidence);
    expect(context.events[0].actorName).toBe('😀'.repeat(40));
    expect(context.events[0].changes[0].after).toBe('é'.repeat(128));
    expect(context.truncatedFieldCount).toBe(2);
    expect(context.omittedBytes).toBe(384);
  });
  it('discloses omitted changes and refuses empty or incomplete matching evidence', () => {
    const { input, agent, evidence, event } = activityAnalysisFixture();
    evidence.events[0].changes = Array.from(
      { length: 12 },
      () => event.changes[0],
    );
    const context = buildActivityAnalysisContext(input, agent, {
      ...evidence,
      totalCount: 201,
    });
    expect(context.events[0].changes).toHaveLength(8);
    expect(context.truncatedFieldCount).toBe(4);
    expect(context.omittedCount).toBe(200);
    expect(activityAnalysisBlockedReasons(context)[0]).toContain('Narrow');
    expect(
      activityAnalysisBlockedReasons(
        buildActivityAnalysisContext(input, agent, {
          ...evidence,
          totalCount: 0,
          events: [],
        }),
      )[0],
    ).toContain('No recorded activity');
  });
  it('bounds aggregate selected evidence rather than multiplying per-field limits indefinitely', () => {
    const { input, agent, evidence, event } = activityAnalysisFixture();
    const events = Array.from({ length: 200 }, (_, index) => ({
      ...event,
      id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      changes: Array.from({ length: 8 }, () => ({
        field: 'state',
        before: 'x'.repeat(256),
        after: 'y'.repeat(256),
      })),
    }));
    const context = buildActivityAnalysisContext(input, agent, {
      ...evidence,
      totalCount: 200,
      events,
    });
    expect(context.includedCount).toBeLessThan(200);
    expect(context.omittedCount).toBe(200 - context.includedCount);
    expect(
      Buffer.byteLength(advertisingCanonicalJson(context.events)),
    ).toBeLessThan(97 * 1024);
    expect(activityAnalysisBlockedReasons(context)).not.toHaveLength(0);
  });
  it('preserves prompt and context identity after PostgreSQL JSONB key reordering', () => {
    const { input, agent, evidence } = activityAnalysisFixture();
    const context = buildActivityAnalysisContext(input, agent, evidence);
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value !== null && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, item]) => [key, reorder(item)]),
            )
          : value;
    const stored = JSON.parse(
      JSON.stringify(reorder(context)),
    ) as ActivityAnalysisContext;
    expect(activityAnalysisPrompt(stored)).toBe(
      activityAnalysisPrompt(context),
    );
    expect(activityAnalysisContextFingerprint(stored, agent)).toBe(
      activityAnalysisContextFingerprint(context, agent),
    );
    expect(
      activityAnalysisContextFingerprint(
        { ...stored, question: 'Changed' },
        agent,
      ),
    ).not.toBe(activityAnalysisContextFingerprint(context, agent));
  });
  it('rejects unknown summary and finding citations independently', () => {
    const { input, agent, evidence } = activityAnalysisFixture();
    const context = buildActivityAnalysisContext(input, agent, evidence);
    const output = {
      summary: 'A review was recorded.',
      summaryCitationIds: [context.citations[0].id],
      findings: [
        {
          kind: 'RECORDED',
          text: 'Approval was recorded.',
          citationIds: [context.citations[0].id],
        },
      ],
      unknowns: ['Current task state is unknown.'],
      limitations: ['Recorded history only.'],
    };
    expect(
      validateActivityAnalysisOutput(output, context).findings[0].id,
    ).toMatch(/^[a-f0-9-]{36}$/);
    expect(() =>
      validateActivityAnalysisOutput(
        { ...output, summaryCitationIds: ['event:unknown'] },
        context,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateActivityAnalysisOutput(
        {
          ...output,
          findings: [{ ...output.findings[0], citationIds: ['event:unknown'] }],
        },
        context,
      ),
    ).toThrow(BadRequestException);
  });
  it('requires citations and retains server limitations even when model wording omits them', () => {
    const { input, agent, evidence } = activityAnalysisFixture();
    const context = buildActivityAnalysisContext(input, agent, evidence);
    const output = {
      summary: 'One review.',
      summaryCitationIds: [context.citations[0].id],
      findings: [],
      unknowns: [],
      limitations: ['Only one event.'],
    };
    expect(validateActivityAnalysisOutput(output, context).limitations).toEqual(
      expect.arrayContaining(context.limitations),
    );
    expect(() =>
      validateActivityAnalysisOutput(
        { ...output, summaryCitationIds: [] },
        context,
      ),
    ).toThrow(BadRequestException);
  });
  it('redacts financial changes and summary before new event projection and denies stored finance-bearing answers on access loss', () => {
    const { event, identity } = activityAnalysisFixture();
    event.changes.push({
      field: 'revisionInternalCost',
      before: '0',
      after: '12345',
    });
    event.summary = 'Cost changed to 12345';
    const redacted = projectActivityEvent(event, event.occurredAt, false);
    expect(
      JSON.stringify({ summary: redacted.summary, changes: redacted.changes }),
    ).not.toContain('12345');
    expect(redacted.changes).toHaveLength(1);
    identity.actor.capabilities = ['workspace.admin'];
    expect(() =>
      assertActivityAnalysisPrivacy({ containsFinance: true }, identity),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertActivityAnalysisPrivacy({ containsFinance: false }, identity),
    ).not.toThrow();
  });
});
