import { BadRequestException } from '@nestjs/common';
import { type z } from 'zod';
import {
  type ReleaseBody,
  type ReleaseTaskSnapshot,
} from './delivery-release.types';

export const parseReleaseInput = <TData>(
  schema: z.ZodType<TData>,
  input: unknown,
): TData => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues[0]?.message ?? 'Check this release.',
    );
  return result.data;
};

export const validateReleaseDependencies = (body: ReleaseBody) => {
  const repository = new URL(body.repositoryUrl);
  const repositoryPath = repository.pathname
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
  if (
    repository.hostname === 'github.com' &&
    !/^\/[^/]+\/[^/]+$/.test(repositoryPath)
  )
    throw new BadRequestException(
      'Use the repository root link, without a branch or pull request.',
    );
  for (const work of body.work) {
    if (!work.pullRequestUrl) continue;
    const pullRequest = new URL(work.pullRequestUrl);
    if (
      repository.hostname === 'github.com' &&
      (pullRequest.origin !== repository.origin ||
        !pullRequest.pathname.startsWith(`${repositoryPath}/pull/`) ||
        !/^\d+\/?$/.test(
          pullRequest.pathname.slice(`${repositoryPath}/pull/`.length),
        ))
    )
      throw new BadRequestException(
        'Link a pull request from this exact repository.',
      );
  }
  const ids = new Set(body.work.map((work) => work.taskId));
  if (ids.size !== body.work.length)
    throw new BadRequestException('Include each native task once.');
  if (new Set(body.checks.map((check) => check.id)).size !== body.checks.length)
    throw new BadRequestException('Each release check needs its own identity.');
  const byId = new Map(body.work.map((work) => [work.taskId, work]));
  const visited = new Set<string>(),
    visiting = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id))
      throw new BadRequestException('Release task dependencies form a cycle.');
    visiting.add(id);
    const work = byId.get(id);
    if (!work)
      throw new BadRequestException(
        'Include a dependency in this release before linking it.',
      );
    if (new Set(work.blockedByTaskIds).size !== work.blockedByTaskIds.length)
      throw new BadRequestException('List a task dependency once.');
    for (const dependency of work.blockedByTaskIds) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
};

export const assertReleaseReady = (
  body: ReleaseBody,
  tasks: ReleaseTaskSnapshot[],
) => {
  validateReleaseDependencies(body);
  if (
    !body.commitSha ||
    !body.summary ||
    !body.acceptanceCriteria ||
    !body.rollbackPlan
  )
    throw new BadRequestException(
      'Add the exact commit, changes, acceptance criteria and rollback plan before review.',
    );
  if (
    !body.work.length ||
    tasks.length !== body.work.length ||
    tasks.some((task) => !task.approved)
  )
    throw new BadRequestException(
      'Every included task needs its own current independent approval before release review.',
    );
  for (const kind of ['TEST', 'CODE_REVIEW', 'ROLLBACK', 'HANDOVER']) {
    if (!body.checks.some((check) => check.kind === kind))
      throw new BadRequestException(
        'Include test, code review, rollback and handover checks.',
      );
  }
  if (
    body.checks.some(
      (check) =>
        check.status !== 'PASSED' || (!check.evidenceUrl && !check.note),
    )
  )
    throw new BadRequestException(
      'Record passing evidence or notes for every release check.',
    );
};

export const releaseReviewBlockedReason = (
  body: ReleaseBody,
  tasks: ReleaseTaskSnapshot[],
): string | null => {
  try {
    assertReleaseReady(body, tasks);
    return null;
  } catch (error) {
    if (error instanceof BadRequestException) return error.message;
    throw error;
  }
};
