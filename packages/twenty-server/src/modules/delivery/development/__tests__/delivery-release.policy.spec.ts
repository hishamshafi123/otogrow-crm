import { randomUUID } from 'node:crypto';
import {
  assertReleaseReady,
  parseReleaseInput,
  validateReleaseDependencies,
} from '../delivery-release.policy';
import {
  releaseBodySchema,
  type ReleaseBody,
  type ReleaseTaskSnapshot,
} from '../delivery-release.types';

const fixture = () => {
  const first = randomUUID(),
    second = randomUUID();
  const body: ReleaseBody = {
    title: 'Mobile checkout release',
    ownerId: randomUUID(),
    targetDate: '2026-11-05',
    repositoryUrl: 'https://github.com/example/mobile',
    commitSha: 'a'.repeat(40),
    summary: 'Update checkout validation',
    acceptanceCriteria:
      'Existing checkout and retry work on both supported devices.',
    rollbackPlan: 'Activate the previous tested artifact and verify checkout.',
    work: [
      {
        taskId: first,
        revision: 2,
        issueUrl: 'https://example.atlassian.net/browse/MOBILE-1',
        pullRequestUrl: 'https://github.com/example/mobile/pull/1',
        blockedByTaskIds: [],
      },
      {
        taskId: second,
        revision: 3,
        issueUrl: '',
        pullRequestUrl: 'https://github.com/example/mobile/pull/2',
        blockedByTaskIds: [first],
      },
    ],
    checks: (['TEST', 'CODE_REVIEW', 'ROLLBACK', 'HANDOVER'] as const).map(
      (kind) => ({
        id: randomUUID(),
        kind,
        label: kind,
        status: 'PASSED',
        evidenceUrl: 'https://example.invalid/evidence',
        note: 'Recorded external evidence; no provider verification claimed.',
      }),
    ),
  };
  const tasks: ReleaseTaskSnapshot[] = body.work.map((work) => ({
    taskId: work.taskId,
    revision: work.revision,
    title: 'Approved native task',
    assigneeId: body.ownerId,
    state: 'APPROVED',
    submissionVersion: 1,
    submittedBy: body.ownerId,
    reviewedBy: randomUUID(),
    reviewedAt: '2026-11-03T06:00:00Z',
    approved: true,
    sourceHash: 'b'.repeat(64),
  }));
  return { body, tasks };
};

describe('Developer release planning and review gates', () => {
  it('accepts exact independently approved work with acyclic dependencies and source-qualified checks', () => {
    const { body, tasks } = fixture();
    expect(parseReleaseInput(releaseBodySchema, body)).toEqual(body);
    expect(() => assertReleaseReady(body, tasks)).not.toThrow();
  });
  it('allows incomplete planning without pretending it is ready for review', () => {
    const { body, tasks } = fixture();
    body.commitSha = '';
    body.work = [];
    body.checks = [];
    expect(parseReleaseInput(releaseBodySchema, body)).toEqual(body);
    expect(() => validateReleaseDependencies(body)).not.toThrow();
    expect(() => assertReleaseReady(body, tasks)).toThrow('exact commit');
  });
  it.each([
    'summary',
    'acceptanceCriteria',
    'rollbackPlan',
    'commitSha',
  ] as const)('requires %s before review', (key) => {
    const { body, tasks } = fixture();
    body[key] = '';
    expect(() => assertReleaseReady(body, tasks)).toThrow();
  });
  it.each(['TEST', 'CODE_REVIEW', 'ROLLBACK', 'HANDOVER'] as const)(
    'requires a %s check',
    (kind) => {
      const { body, tasks } = fixture();
      body.checks = body.checks.filter((check) => check.kind !== kind);
      expect(() => assertReleaseReady(body, tasks)).toThrow('Include test');
    },
  );
  it.each(['FAILED', 'NOT_RUN'] as const)(
    'does not pass a %s check',
    (status) => {
      const { body, tasks } = fixture();
      body.checks[0].status = status;
      expect(() => assertReleaseReady(body, tasks)).toThrow('passing evidence');
    },
  );
  it('requires independently approved task evidence rather than counting linked tasks', () => {
    const { body, tasks } = fixture();
    tasks[0].approved = false;
    expect(() => assertReleaseReady(body, tasks)).toThrow(
      'independent approval',
    );
  });
  it('does not accept missing native task evidence', () => {
    const { body, tasks } = fixture();
    expect(() => assertReleaseReady(body, tasks.slice(1))).toThrow(
      'independent approval',
    );
  });
  it('does not treat a checked box without evidence or notes as a completed check', () => {
    const { body, tasks } = fixture();
    body.checks[0].evidenceUrl = '';
    body.checks[0].note = '';
    expect(() => assertReleaseReady(body, tasks)).toThrow('passing evidence');
  });
  it('rejects a direct dependency cycle', () => {
    const { body } = fixture();
    body.work[0].blockedByTaskIds = [body.work[1].taskId];
    expect(() => validateReleaseDependencies(body)).toThrow('cycle');
  });
  it('rejects a longer dependency cycle', () => {
    const { body } = fixture();
    const id = randomUUID();
    body.work.push({
      taskId: id,
      revision: 1,
      issueUrl: '',
      pullRequestUrl: '',
      blockedByTaskIds: [body.work[1].taskId],
    });
    body.work[0].blockedByTaskIds = [id];
    expect(() => validateReleaseDependencies(body)).toThrow('cycle');
  });
  it('rejects a self dependency', () => {
    const { body } = fixture();
    body.work[0].blockedByTaskIds = [body.work[0].taskId];
    expect(() => validateReleaseDependencies(body)).toThrow('cycle');
  });
  it('rejects an omitted dependency rather than silently creating or importing it', () => {
    const { body } = fixture();
    body.work[0].blockedByTaskIds = [randomUUID()];
    expect(() => validateReleaseDependencies(body)).toThrow(
      'Include a dependency',
    );
  });
  it('rejects duplicate native tasks', () => {
    const { body } = fixture();
    body.work.push(body.work[0]);
    expect(() => validateReleaseDependencies(body)).toThrow(
      'each native task once',
    );
  });
  it('rejects duplicate dependency and check identities', () => {
    const { body } = fixture();
    body.work[1].blockedByTaskIds.push(body.work[0].taskId);
    expect(() => validateReleaseDependencies(body)).toThrow('dependency once');
    body.work[1].blockedByTaskIds.pop();
    body.checks.push(body.checks[0]);
    expect(() => validateReleaseDependencies(body)).toThrow('own identity');
  });
  it.each([
    'https://github.com/another/mobile/pull/1',
    'https://github.com/example/mobile/issues/1',
    'https://github.com/example/mobile/pull/not-a-number',
    'https://gitlab.com/example/mobile/-/merge_requests/1',
  ])('rejects a mismatched pull request %s', (url) => {
    const { body } = fixture();
    body.work[0].pullRequestUrl = url;
    expect(() => validateReleaseDependencies(body)).toThrow('exact repository');
  });
  it('rejects a branch link as the repository identity', () => {
    const { body } = fixture();
    body.repositoryUrl += '\/tree\/main';
    expect(() => validateReleaseDependencies(body)).toThrow('repository root');
  });
  it.each([
    'http://example.invalid/evidence',
    'https://user:secret@example.invalid/evidence',
    'https://example.invalid/evidence?access_token=hidden',
    'https://example.invalid/evidence?X-Amz-Signature=hidden',
  ])('rejects unsafe evidence link %s', (url) => {
    const { body } = fixture();
    body.checks[0].evidenceUrl = url;
    expect(() => parseReleaseInput(releaseBodySchema, body)).toThrow(
      'HTTPS evidence',
    );
  });
  it('rejects a short commit identity and unknown command fields', () => {
    const { body } = fixture();
    body.commitSha = 'a'.repeat(7);
    expect(() => parseReleaseInput(releaseBodySchema, body)).toThrow(
      'full commit',
    );
    body.commitSha = 'a'.repeat(40);
    expect(() =>
      parseReleaseInput(releaseBodySchema, {
        ...body,
        automaticallyDeploy: true,
      }),
    ).toThrow();
  });
});
