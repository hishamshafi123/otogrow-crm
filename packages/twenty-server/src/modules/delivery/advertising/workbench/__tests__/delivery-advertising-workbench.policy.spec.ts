import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  advertisingCursor,
  advertisingHash,
  assertAdvertisingLegacyDecision,
  assertAdvertisingObservationMetric,
  assertAdvertisingObservationSource,
  readAdvertisingCursor,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  advertisingActionSchema,
  saveAdvertisingReviewSchema,
  type AdvertisingActionDefinition,
  type AdvertisingGoalSnapshot,
  type AdvertisingLegacyHandling,
  type AdvertisingMetric,
  type AdvertisingTaskEvidence,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';

const ID = 'ab29d449-a82c-43c7-80f4-e0e85ae2ac1b';
const OWNER = '682cfb3b-a3e9-4fbc-afdc-f272e09785a2';
const REVIEWER = 'ae5ef155-488b-4eac-bd50-6a69aa6efdc1';
const task: AdvertisingTaskEvidence = {
  id: ID,
  title: 'Original campaign follow-up',
  revision: 7,
  state: 'APPROVED',
  ownerId: OWNER,
  ownerName: 'Marketer',
  reviewerId: REVIEWER,
  reviewerName: 'Manager',
  dueAt: '2026-10-31T14:00:00.000Z',
  submissionVersion: 2,
  submissionState: 'APPROVED',
  evidence: [],
};
const definition: AdvertisingActionDefinition = {
  id: ID,
  title: 'Keep the original follow-up',
  rationale: 'Previously reviewed campaign work',
  expectedResult: 'Inspect its existing outcome',
  evidence: 'The existing submitted evidence',
  ownerId: OWNER,
  reviewerId: REVIEWER,
  dueDate: '2026-10-31',
  assistantId: null,
  adoptTaskId: ID,
};
const handling: AdvertisingLegacyHandling = {
  mode: 'ADOPT',
  taskId: ID,
  taskRevision: 7,
  taskState: 'APPROVED',
  reason: '',
};
const metric: AdvertisingMetric = {
  key: 'account:actions:lead',
  label: 'Reported lead',
  unit: 'COUNT',
  goalKinds: ['LEADS'],
  value: '12.25',
  provenance: 'META_ATTRIBUTED',
  reason: null,
};
const goal: AdvertisingGoalSnapshot = {
  kind: 'LEADS',
  metricKey: metric.key,
  metricAdId: null,
  provenance: 'REPORT',
  value: '10',
  evidence: '',
  targetCostMicros: '25000000',
  metricLabel: metric.label,
  metricProvenance: metric.provenance,
  metricReason: null,
  metricUnit: 'COUNT',
  currency: 'USD',
  timezone: 'Asia/Qatar',
  fromDate: '2026-10-29',
  throughDate: '2026-10-29',
  sourceFingerprint: 'a'.repeat(64),
};

describe('advertising workbench policy', () => {
  it('requires the same known Meta account and timezone for a conclusive comparison', () => {
    const original = {
      kind: 'META' as const,
      accountId: '123',
      timezone: 'Asia/Qatar',
    };
    expect(() =>
      assertAdvertisingObservationSource(original, original, 'IMPROVED'),
    ).not.toThrow();
    for (const changed of [
      { ...original, accountId: null },
      { ...original, accountId: 'other' },
      { ...original, timezone: null },
      { ...original, timezone: 'UTC' },
      { ...original, kind: 'MANUAL' as const },
    ]) {
      expect(() =>
        assertAdvertisingObservationSource(original, changed, 'IMPROVED'),
      ).toThrow(BadRequestException);
      expect(() =>
        assertAdvertisingObservationSource(changed, original, 'UNCHANGED'),
      ).toThrow(BadRequestException);
      expect(() =>
        assertAdvertisingObservationSource(original, changed, 'INCONCLUSIVE'),
      ).not.toThrow();
    }
  });
  it('does not infer comparable provider attribution for a human or unmapped baseline', () => {
    for (const original of [
      { ...goal, provenance: 'HUMAN' as const },
      { ...goal, metricKey: null },
      { ...goal, value: null },
    ]) {
      expect(() =>
        assertAdvertisingObservationMetric(
          original,
          metric,
          metric.value,
          null,
          'IMPROVED',
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        assertAdvertisingObservationMetric(
          original,
          metric,
          metric.value,
          null,
          'INCONCLUSIVE',
        ),
      ).not.toThrow();
    }
  });
  it('accepts only titles that the native task engine can assign', () => {
    expect(
      advertisingActionSchema.safeParse({
        ...definition,
        title: 'a'.repeat(200),
      }).success,
    ).toBe(true);
    expect(
      advertisingActionSchema.safeParse({
        ...definition,
        title: 'a'.repeat(201),
      }).success,
    ).toBe(false);
  });
  it('adopts exactly one unchanged task without mutating its approved evidence', () => {
    const before = structuredClone(task);
    assertAdvertisingLegacyDecision(ID, task, handling, [definition], false);
    expect(task).toEqual(before);
    expect(() =>
      assertAdvertisingLegacyDecision(
        ID,
        task,
        handling,
        [{ ...definition, dueDate: '2026-11-01' }],
        false,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      assertAdvertisingLegacyDecision(
        ID,
        task,
        { ...handling, taskRevision: 6 },
        [definition],
        false,
      ),
    ).toThrow(ConflictException);
  });
  it('requires global uniqueness and a usable independent existing assignment for adoption', () => {
    expect(() =>
      assertAdvertisingLegacyDecision(ID, task, handling, [definition], true),
    ).toThrow(ConflictException);
    expect(() =>
      assertAdvertisingLegacyDecision(
        ID,
        { ...task, dueAt: null },
        handling,
        [definition],
        false,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAdvertisingLegacyDecision(
        ID,
        { ...task, reviewerId: OWNER },
        handling,
        [definition],
        false,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAdvertisingLegacyDecision(
        ID,
        task,
        handling,
        [definition, { ...definition, id: OWNER }],
        false,
      ),
    ).toThrow(BadRequestException);
  });
  it('permits explicit additional work after an already adopted or completed generic task', () => {
    const additional = {
      ...handling,
      mode: 'ADDITIONAL_WORK' as const,
      reason:
        'The existing campaign review is complete; this is a new creative test.',
    };
    expect(() =>
      assertAdvertisingLegacyDecision(
        ID,
        task,
        additional,
        [{ ...definition, adoptTaskId: null }],
        true,
      ),
    ).not.toThrow();
    expect(() =>
      assertAdvertisingLegacyDecision(
        ID,
        task,
        { ...additional, reason: '' },
        [],
        true,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAdvertisingLegacyDecision(
        ID,
        task,
        additional,
        [definition],
        false,
      ),
    ).toThrow(BadRequestException);
  });
  it('requires an explicit current unavailable-task acknowledgement instead of fabricating adoption', () => {
    const missing = {
      mode: 'ADDITIONAL_WORK' as const,
      taskId: ID,
      taskRevision: null,
      taskState: 'UNAVAILABLE',
      reason: 'The old task is no longer available; create new scoped work.',
    };
    expect(() =>
      assertAdvertisingLegacyDecision(ID, null, missing, [], false),
    ).not.toThrow();
    expect(() =>
      assertAdvertisingLegacyDecision(ID, null, handling, [definition], false),
    ).toThrow(ConflictException);
  });
  it('requires a reason for zero-action review and independent reviewers for every real action', () => {
    const packet = {
      requestId: OWNER,
      id: ID,
      revision: 0,
      sourceKind: 'META',
      sourceId: REVIEWER,
      sourceFingerprint: 'a'.repeat(64),
      goal: {
        kind: goal.kind,
        metricKey: goal.metricKey,
        metricAdId: null,
        provenance: goal.provenance,
        value: goal.value,
        evidence: '',
        targetCostMicros: null,
      },
      note: 'Report checked',
      noChangeReason: '',
      legacyHandling: {
        mode: 'NONE',
        taskId: null,
        taskRevision: null,
        taskState: null,
        reason: '',
      },
      actions: [],
    };
    expect(saveAdvertisingReviewSchema.safeParse(packet).success).toBe(false);
    expect(
      saveAdvertisingReviewSchema.safeParse({
        ...packet,
        noChangeReason:
          'Results are within the reviewed target; no change is warranted.',
      }).success,
    ).toBe(true);
    expect(
      saveAdvertisingReviewSchema.safeParse({
        ...packet,
        actions: [{ ...definition, reviewerId: OWNER }],
      }).success,
    ).toBe(false);
  });
  it('keeps fractional provider values exact and refuses qualified-lead inference or rewritten values', () => {
    expect(() =>
      assertAdvertisingObservationMetric(
        goal,
        metric,
        '12.25',
        null,
        'IMPROVED',
      ),
    ).not.toThrow();
    expect(() =>
      assertAdvertisingObservationMetric(
        { ...goal, kind: 'QUALIFIED_LEADS' },
        metric,
        '12.25',
        null,
        'IMPROVED',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAdvertisingObservationMetric(goal, metric, '13', null, 'IMPROVED'),
    ).toThrow(BadRequestException);
  });
  it('does not treat another alias, ad scope, attribution source or unknown count as improvement', () => {
    for (const changed of [
      { ...metric, key: 'account:actions:other_lead' },
      { ...metric, provenance: 'HUMAN_REPORTED' },
    ]) {
      expect(() =>
        assertAdvertisingObservationMetric(
          goal,
          changed,
          '12.25',
          null,
          'IMPROVED',
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        assertAdvertisingObservationMetric(
          goal,
          changed,
          '12.25',
          null,
          'INCONCLUSIVE',
        ),
      ).not.toThrow();
    }
    expect(() =>
      assertAdvertisingObservationMetric(
        goal,
        metric,
        '12.25',
        'different-ad',
        'IMPROVED',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAdvertisingObservationMetric(
        goal,
        { ...metric, value: null },
        null,
        null,
        'UNCHANGED',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAdvertisingObservationMetric(
        goal,
        { ...metric, value: '0' },
        '0',
        null,
        'WORSE',
      ),
    ).not.toThrow();
  });
  it('preserves microseconds and binds cursors to source and permission evidence', () => {
    const scope = advertisingHash({ member: OWNER, source: ID });
    const cursor = advertisingCursor(scope, '2026-10-31T01:02:03.123456Z', ID);
    expect(readAdvertisingCursor(cursor, scope)?.key).toBe(
      '2026-10-31T01:02:03.123456Z',
    );
    expect(() =>
      readAdvertisingCursor(
        cursor,
        advertisingHash({ member: REVIEWER, source: ID }),
      ),
    ).toThrow(ConflictException);
    expect(() =>
      readAdvertisingCursor(
        advertisingCursor(scope, '2026-02-30T01:02:03.123456Z', ID),
        scope,
      ),
    ).toThrow(ConflictException);
    expect(advertisingHash({ b: 2, a: 1 })).toBe(
      advertisingHash({ a: 1, b: 2 }),
    );
  });
});
