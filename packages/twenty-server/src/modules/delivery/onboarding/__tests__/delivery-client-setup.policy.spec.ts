import { randomUUID } from 'node:crypto';
import {
  clientSetupCreateSchema,
  clientSetupContextSchema,
  clientSetupHash,
  parseClientSetup,
} from 'src/modules/delivery/onboarding/delivery-client-setup.policy';
const valid = () => ({
  requestId: randomUUID(),
  companyId: randomUUID(),
  companySourceToken: 'a'.repeat(64),
  projectId: null,
  projectRevision: null,
  projectName: 'Brand delivery',
  memberIds: [],
  engagementId: null,
  engagementRevision: null,
  plan: {
    name: 'Reviewed scope',
    services: ['AI videos'],
    billing: 'RETAINER',
    scope: 'Explicit agreed service scope',
    allowance: '',
    contact: '',
    fields: [],
    advertising: null,
  },
  firstTask: null,
});
describe('Recoverable client setup inputs', () => {
  it('allows setup without invented staff or a fabricated first task', () => {
    expect(
      parseClientSetup(clientSetupCreateSchema, valid()).firstTask,
    ).toBeNull();
  });
  it('requires explicit new versus unchanged existing project choices', () => {
    const input = valid();
    expect(() =>
      parseClientSetup(clientSetupCreateSchema, {
        ...input,
        projectId: randomUUID(),
      }),
    ).toThrow();
    expect(() =>
      parseClientSetup(clientSetupCreateSchema, {
        ...input,
        projectId: randomUUID(),
        projectRevision: 1,
        projectName: null,
        memberIds: [randomUUID()],
      }),
    ).toThrow();
    expect(
      parseClientSetup(clientSetupCreateSchema, {
        ...input,
        projectId: randomUUID(),
        projectRevision: 1,
        projectName: null,
      }).projectName,
    ).toBeNull();
  });
  it('never silently overwrites a reused service plan', () => {
    const input = {
      ...valid(),
      projectId: randomUUID(),
      projectRevision: 1,
      projectName: null,
      engagementId: randomUUID(),
      engagementRevision: 3,
    };
    expect(() => parseClientSetup(clientSetupCreateSchema, input)).toThrow();
    expect(
      parseClientSetup(clientSetupCreateSchema, { ...input, plan: null })
        .engagementRevision,
    ).toBe(3);
    expect(() =>
      parseClientSetup(clientSetupCreateSchema, {
        ...input,
        plan: null,
        projectId: null,
        projectRevision: null,
        projectName: 'Another project',
      }),
    ).toThrow();
  });
  it('normalizes team order for exact retries but retains meaningful task order', () => {
    const first = randomUUID(),
      second = randomUUID();
    const input = valid();
    const left = parseClientSetup(clientSetupCreateSchema, {
      ...input,
      memberIds: [first, second, first],
    });
    const right = parseClientSetup(clientSetupCreateSchema, {
      ...input,
      memberIds: [second, first],
    });
    expect(clientSetupHash(left)).toBe(clientSetupHash(right));
    expect(clientSetupHash({ checklist: ['One', 'Two'] })).not.toBe(
      clientSetupHash({ checklist: ['Two', 'One'] }),
    );
  });
  it('requires an exact company source token and rejects hidden or invented actions', () => {
    expect(() =>
      parseClientSetup(clientSetupCreateSchema, {
        ...valid(),
        companySourceToken: 'old',
      }),
    ).toThrow();
    expect(() =>
      parseClientSetup(clientSetupCreateSchema, { ...valid(), paid: true }),
    ).toThrow();
    expect(() =>
      parseClientSetup(clientSetupContextSchema, { projectId: randomUUID() }),
    ).toThrow();
  });
  it('keeps arbitrary dates, real evidence and explicit task choices in the existing task schema', () => {
    const firstTask = {
      title: 'First explicit deliverable',
      brief: '',
      service: 'AI videos',
      assigneeId: randomUUID(),
      reviewerId: randomUUID(),
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      checklist: ['Check product details'],
      evidence: [],
    };
    expect(
      parseClientSetup(clientSetupCreateSchema, { ...valid(), firstTask })
        .firstTask?.dueAt,
    ).toBeNull();
    expect(() =>
      parseClientSetup(clientSetupCreateSchema, {
        ...valid(),
        firstTask: { ...firstTask, evidence: ['javascript:alert(1)'] },
      }),
    ).toThrow();
    expect(() =>
      parseClientSetup(clientSetupCreateSchema, {
        ...valid(),
        firstTask: {
          ...firstTask,
          checklist: [{ text: 'Already done', done: true }],
        },
      }),
    ).toThrow();
  });
});
