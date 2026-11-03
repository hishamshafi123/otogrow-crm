import {
  founderAction,
  founderEvidence,
  founderException,
} from 'src/modules/delivery/founder/delivery-founder.policy';
import {
  founderEscalationDraftSchema,
  founderEscalationMayRepeat,
  founderEscalationReactivationDue,
  founderEscalationSourceKey,
  matchFounderEscalation,
} from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.policy';
const RULE_ID = '58aeec76-208d-4dd5-b7ec-fb6cfb4b1ad4';
const PROJECT_ID = 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689';
const TASK_ID = 'd908d75f-00c9-4e91-8071-27c4b3216a79';
const RECIPIENT_ID = '2a3587de-498f-48bf-a1a8-9939109f877a';
const draft = (fields: Record<string, unknown> = {}) =>
  founderEscalationDraftSchema.parse({
    id: RULE_ID,
    revision: 0,
    name: 'Delivery deadline',
    condition: 'TASK_OVERDUE',
    recipientId: RECIPIENT_ID,
    priority: 'NORMAL',
    projectScope: 'SELECTED',
    projectIds: [PROJECT_ID],
    includeCompany: false,
    currency: null,
    serviceMonth: null,
    repeatMode: 'ONCE',
    repeatHours: null,
    maxSends: 1,
    ...fields,
  });
const item = () =>
  founderException({
    domain: 'DELIVERY',
    sourceType: 'TASK',
    sourceId: TASK_ID,
    key: `DELIVERY:TASK:${TASK_ID}`,
    title: 'Blocked deliverable',
    reasonCode: 'TASK_BLOCKED',
    sourceRevision: 'version-one',
    projectId: PROJECT_ID,
    evidence: founderEvidence({ state: 'BLOCKED', warnings: ['TASK_OVERDUE'] }),
    nextAction: founderAction({
      code: 'OPEN_TASK',
      targetType: 'TASK',
      targetId: TASK_ID,
    }),
  });

it('matches explicitly selected secondary task facts without requiring the primary reason to change', () => {
  expect(matchFounderEscalation(draft(), [item()])).toHaveLength(1);
  expect(
    matchFounderEscalation(draft({ condition: 'TASK_REVIEW' }), [item()]),
  ).toEqual([]);
});
it('keeps stable episode identity when source title, revision and amount change', () => {
  const source = item();
  expect(
    founderEscalationSourceKey({
      ...source,
      title: 'Renamed',
      sourceRevision: 'new',
      evidence: { ...source.evidence, amountMicros: '100' },
    }),
  ).toBe(founderEscalationSourceKey(source));
});
it('keeps company-only scope explicit and excludes client data', () => {
  const rule = draft({
    condition: 'FORECAST_ANCHOR_MISSING',
    projectIds: [],
    includeCompany: true,
  });
  const company = {
    ...item(),
    domain: 'FINANCE' as const,
    sourceType: 'FORECAST_ANCHOR' as const,
    sourceId: null,
    reasonCode: 'FORECAST_ANCHOR_MISSING',
    projectId: null,
    evidence: founderEvidence({ currency: 'USD' }),
  };
  expect(matchFounderEscalation(rule, [company, item()])).toHaveLength(1);
  expect(
    founderEscalationDraftSchema.safeParse({ ...rule, includeCompany: false })
      .success,
  ).toBe(false);
});
it('does not expand a selected client or currency scope', () => {
  expect(
    matchFounderEscalation(draft({ projectIds: [RULE_ID] }), [item()]),
  ).toEqual([]);
  expect(
    founderEscalationDraftSchema.safeParse({ ...draft(), currency: 'USD' })
      .success,
  ).toBe(false);
});
it('requires an explicit service month only for recorded monthly conditions', () => {
  expect(() => draft({ condition: 'MONTHLY_NEGATIVE_RESULT' })).toThrow();
  expect(
    draft({
      condition: 'MONTHLY_NEGATIVE_RESULT',
      serviceMonth: '2026-10',
      currency: 'USD',
    }).serviceMonth,
  ).toBe('2026-10');
  expect(() => draft({ serviceMonth: '2026-10' })).toThrow();
});
it.each([
  { repeatMode: 'ONCE', maxSends: 2 },
  { repeatMode: 'INTERVAL', repeatHours: null, maxSends: 3 },
  { repeatMode: 'INTERVAL', repeatHours: 0, maxSends: 3 },
  { repeatMode: 'INTERVAL', repeatHours: 721, maxSends: 3 },
  { repeatMode: 'INTERVAL', repeatHours: 1, maxSends: 21 },
  { condition: 'GUESS_LOW_MARGIN' },
  { projectIds: [], includeCompany: false },
])('rejects ambiguous/unsupported rule choices %j', (fields) => {
  expect(() => draft(fields)).toThrow();
});
it.each([
  'QUEUED',
  'SENDING',
  'FAILED',
  'UNCERTAIN',
  'SUPPRESSED',
  'UNCONFIGURED',
])('never schedules an automatic repeat after %s', (status) => {
  const rule = draft({ repeatMode: 'INTERVAL', repeatHours: 1, maxSends: 3 });
  expect(
    founderEscalationMayRepeat(
      rule,
      1,
      { status, finishedAt: new Date('2026-10-28T00:00:00Z') },
      false,
      new Date('2026-10-29T00:00:00Z'),
    ),
  ).toBe(false);
});
it('uses the confirmed successful send time, exact interval, maximum and acknowledgement', () => {
  const rule = draft({ repeatMode: 'INTERVAL', repeatHours: 2, maxSends: 3 });
  const last = { status: 'SENT', finishedAt: new Date('2026-10-28T10:00:00Z') };
  expect(
    founderEscalationMayRepeat(
      rule,
      1,
      last,
      false,
      new Date('2026-10-28T11:59:59Z'),
    ),
  ).toBe(false);
  expect(
    founderEscalationMayRepeat(
      rule,
      1,
      last,
      false,
      new Date('2026-10-28T12:00:00Z'),
    ),
  ).toBe(true);
  expect(
    founderEscalationMayRepeat(
      rule,
      3,
      last,
      false,
      new Date('2026-10-29T12:00:00Z'),
    ),
  ).toBe(false);
  expect(
    founderEscalationMayRepeat(
      rule,
      1,
      last,
      true,
      new Date('2026-10-29T12:00:00Z'),
    ),
  ).toBe(false);
});

it('honors a newly lengthened repeat interval from the last successful send after re-enabling', () => {
  const rule = draft({ repeatMode: 'INTERVAL', repeatHours: 24, maxSends: 3 });
  const lastSuccessfulAt = new Date('2026-10-28T10:00:00Z');
  expect(
    founderEscalationReactivationDue(
      rule,
      1,
      lastSuccessfulAt,
      new Date('2026-10-28T11:00:00Z'),
    ),
  ).toBe(false);
  expect(
    founderEscalationReactivationDue(
      rule,
      1,
      lastSuccessfulAt,
      new Date('2026-10-29T10:00:00Z'),
    ),
  ).toBe(true);
  expect(
    founderEscalationReactivationDue(
      rule,
      1,
      null,
      new Date('2026-10-29T10:00:00Z'),
    ),
  ).toBe(false);
  expect(
    founderEscalationReactivationDue(
      rule,
      0,
      null,
      new Date('2026-10-28T11:00:00Z'),
    ),
  ).toBe(true);
});
