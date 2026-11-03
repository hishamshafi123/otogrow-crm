import { type ReleaseBody } from '@/delivery/development/release.types';

export const newReleaseBody = (
  ownerId: string,
  labelForCheck: (kind: string) => string,
): ReleaseBody => ({
  title: '',
  ownerId,
  targetDate: '',
  repositoryUrl: '',
  commitSha: '',
  summary: '',
  acceptanceCriteria: '',
  rollbackPlan: '',
  work: [],
  checks: ['TEST', 'CODE_REVIEW', 'ROLLBACK', 'HANDOVER'].map((kind) => ({
    id: crypto.randomUUID(),
    kind,
    label: labelForCheck(kind),
    status: 'NOT_RUN',
    evidenceUrl: '',
    note: '',
  })),
});
export const canonicalReleaseBody = (body: ReleaseBody): ReleaseBody => ({
  title: body.title.trim(),
  ownerId: body.ownerId,
  targetDate: body.targetDate,
  repositoryUrl: body.repositoryUrl.trim(),
  commitSha: body.commitSha.trim(),
  summary: body.summary.trim(),
  acceptanceCriteria: body.acceptanceCriteria.trim(),
  rollbackPlan: body.rollbackPlan.trim(),
  work: body.work.map((work) => ({
    taskId: work.taskId,
    revision: work.revision,
    issueUrl: work.issueUrl.trim(),
    pullRequestUrl: work.pullRequestUrl.trim(),
    blockedByTaskIds: [...work.blockedByTaskIds],
  })),
  checks: body.checks.map((check) => ({
    id: check.id,
    kind: check.kind,
    label: check.label.trim(),
    status: check.status,
    evidenceUrl: check.evidenceUrl.trim(),
    note: check.note.trim(),
  })),
});
export const releaseDependencyWouldCycle = (
  body: ReleaseBody,
  taskId: string,
  dependencyId: string,
) => {
  const queue = [dependencyId],
    visited = new Set<string>();
  while (queue.length) {
    const id = queue.pop();
    if (!id || visited.has(id)) continue;
    if (id === taskId) return true;
    visited.add(id);
    queue.push(
      ...(body.work.find((work) => work.taskId === id)?.blockedByTaskIds ?? []),
    );
  }
  return false;
};
