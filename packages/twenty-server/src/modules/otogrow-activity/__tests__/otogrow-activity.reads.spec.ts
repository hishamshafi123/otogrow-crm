import {
  boundActivityEvent,
  projectActivityEvent,
} from 'src/modules/otogrow-activity/otogrow-activity.reads';
import { activityAnalysisFixture } from 'src/modules/otogrow-activity/analysis/__tests__/activity-analysis.fixture';

describe('bounded activity previews and exact evidence', () => {
  it('marks clipped names and changes without corrupting UTF8 or pretending truncated before/after values are complete', () => {
    const { event } = activityAnalysisFixture();
    event.actorName = '😀'.repeat(80);
    event.taskName = 'é'.repeat(200);
    event.changes = Array.from({ length: 10 }, () => ({
      field: 'state',
      before: 'é'.repeat(200),
      after: 'x'.repeat(500),
    }));
    const result = boundActivityEvent(event);
    expect(result.event.detailsTruncated).toBe(true);
    expect(Buffer.byteLength(result.event.actorName)).toBe(160);
    expect(Buffer.byteLength(result.event.taskName!)).toBe(160);
    expect(result.event.changes).toHaveLength(8);
    expect(Buffer.byteLength(result.event.changes[0].before!)).toBe(256);
    expect(result.event.changes[0].after).toHaveLength(256);
    expect(result.truncatedFieldCount).toBe(20);
    expect(result.omittedBytes).toBeGreaterThan(1000);
    const exact = projectActivityEvent(event, event.occurredAt, true);
    expect(exact.detailsTruncated).toBe(false);
    expect(exact.actorName).toBe(event.actorName);
    expect(exact.changes).toHaveLength(10);
    expect(exact.changes[0].after).toHaveLength(500);
  });
  it('preserves database truncation markers without double-counting a field clipped by both SQL and UTF8 bounds', () => {
    const { event } = activityAnalysisFixture();
    event.actorName = '😀'.repeat(160);
    const result = boundActivityEvent(event, ['actorName']);
    expect(result.truncatedFieldCount).toBe(1);
    expect(result.event.detailsTruncated).toBe(true);
    expect(boundActivityEvent(result.event).event.detailsTruncated).toBe(true);
  });
  it('keeps ordinary complete rows unflagged and exact financial projection independently authorized', () => {
    const { event } = activityAnalysisFixture();
    expect(boundActivityEvent(event)).toEqual({
      event: { ...event, detailsTruncated: false },
      truncatedFieldCount: 0,
      omittedBytes: 0,
    });
    event.changes.push({
      field: 'revisionProposedCharge',
      before: null,
      after: '4321',
    });
    const projected = projectActivityEvent(event, event.occurredAt, false);
    expect(projected.detailsTruncated).toBe(false);
    expect(JSON.stringify(projected)).not.toContain('4321');
    expect(projected.summary).toContain('finance access');
  });
});
