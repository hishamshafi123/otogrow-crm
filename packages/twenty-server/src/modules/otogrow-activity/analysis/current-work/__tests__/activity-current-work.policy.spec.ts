import { randomUUID } from 'crypto';
import {
  boundCurrentTask,
  currentTaskSelectionSchema,
  currentWorkFingerprint,
  finishCurrentWorkSnapshot,
  parseCurrentWorkScope,
} from '../activity-current-work.policy';
import { type ActivityCurrentTask } from '../activity-current-work.types';

const task = (
  changes: Partial<ActivityCurrentTask> = {},
): ActivityCurrentTask => ({
  taskId: randomUUID(),
  title: 'Prepare approved creative',
  projectId: randomUUID(),
  projectName: 'Brand',
  clientId: null,
  clientName: null,
  taskRevision: 1,
  state: 'APPROVED',
  blocker: null,
  ownerId: null,
  ownerName: null,
  dueAt: null,
  submissionVersion: 1,
  submittedAt: '2026-11-01T01:02:03.123456Z',
  primaryReviewerId: null,
  primaryReviewerName: null,
  effectiveReviewerId: null,
  effectiveReviewerName: null,
  reviewerState: 'UNASSIGNED',
  assignmentMode: 'PRIMARY',
  assignmentRevision: 0,
  warnings: [],
  detailsTruncated: false,
  href: '/delivery',
  ...changes,
});
const snapshot = (tasks: ActivityCurrentTask[], totalCount = tasks.length) =>
  finishCurrentWorkSnapshot({
    capturedAt: '2026-11-02T01:02:03.123456Z',
    scope: {
      personId: null,
      projectId: tasks[0]?.projectId ?? randomUUID(),
      clientId: null,
    },
    totalCount,
    tasks: tasks.map((item) => boundCurrentTask(item)),
    nativeVisibilityFingerprint: 'a'.repeat(64),
  });

describe('current work evidence policy', () => {
  it('requires an explicit person, project or client without accepting historical event filters', () => {
    expect(() => parseCurrentWorkScope({})).toThrow('Choose a person');
    expect(() =>
      parseCurrentWorkScope({ personId: randomUUID(), from: '2026-11-01' }),
    ).toThrow();
    expect(
      parseCurrentWorkScope({ clientId: randomUUID() }).clientId,
    ).not.toBeNull();
    expect(
      currentTaskSelectionSchema.parse({ taskId: randomUUID() }).scope,
    ).toEqual({ personId: null, projectId: null, clientId: null });
  });
  it('keeps approved tasks distinct from delivery fulfilment and does not invent missing facts', () => {
    const result = snapshot([task()]);
    expect(result.complete).toBe(true);
    expect(result.items[0]).toMatchObject({
      state: 'APPROVED',
      ownerId: null,
      dueAt: null,
    });
    expect(result.limitations.join(' ')).toContain(
      'not client delivery or fulfilment',
    );
  });
  it('keeps capture time out of the fingerprint but binds task, scope and native visibility facts', () => {
    const result = snapshot([task()]);
    expect(
      currentWorkFingerprint({
        ...result,
        capturedAt: '2026-11-02T05:00:00.000001Z',
      }),
    ).toBe(currentWorkFingerprint(result));
    expect(
      currentWorkFingerprint({
        ...result,
        nativeVisibilityFingerprint: 'b'.repeat(64),
      }),
    ).not.toBe(currentWorkFingerprint(result));
    expect(
      currentWorkFingerprint({
        ...result,
        items: [task({ ...result.items[0], state: 'BLOCKED' })],
      }),
    ).not.toBe(currentWorkFingerprint(result));
  });
  it('records UTF8 truncation and prevents a shortened field from being complete evidence', () => {
    const result = snapshot([
      task({ title: '🎬'.repeat(300), blocker: 'é'.repeat(400) }),
    ]);
    expect(result.complete).toBe(false);
    expect(result.truncatedFieldCount).toBe(2);
    expect(result.omittedBytes).toBe(688);
    expect(Buffer.byteLength(result.items[0].title)).toBe(800);
    expect(result.items[0].detailsTruncated).toBe(true);
  });
  it('includes valid 200-character non-Latin titles, project labels and member names without truncation', () => {
    const title = '品'.repeat(200);
    const result = snapshot([
      task({
        title,
        projectName: '品'.repeat(200),
        ownerName: '人'.repeat(200),
        primaryReviewerName: title,
        effectiveReviewerName: title,
      }),
    ]);
    expect(result.complete).toBe(true);
    expect(result.truncatedFieldCount).toBe(0);
    expect(result.omittedBytes).toBe(0);
    expect(result.items[0]).toMatchObject({
      title,
      projectName: '品'.repeat(200),
      ownerName: '人'.repeat(200),
    });
    expect(Buffer.byteLength(result.items[0].title)).toBe(600);
  });
  it('counts matching tasks not fetched and never presents the first 200 as complete', () => {
    const result = snapshot(
      Array.from({ length: 200 }, () => task()),
      205,
    );
    expect(result.totalCount).toBe(205);
    expect(result.omittedCount).toBeGreaterThanOrEqual(5);
    expect(result.complete).toBe(false);
  });
  it('enforces the independent 96 KiB task payload bound with honest omissions', () => {
    const result = snapshot(
      Array.from({ length: 200 }, () =>
        task({
          title: '🎬'.repeat(200),
          blocker: 'b'.repeat(512),
          projectName: '品'.repeat(200),
        }),
      ),
    );
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      96 * 1024,
    );
    expect(result.omittedCount).toBeGreaterThan(0);
    expect(result.complete).toBe(false);
  });
  it('counts SQL-side shortened bytes without assuming string serialization spaces were lost', () => {
    const projected = boundCurrentTask(task({ title: 'short' }), {
      title: 500,
    });
    expect(projected.truncatedFieldCount).toBe(1);
    expect(projected.omittedBytes).toBe(495);
  });
});
