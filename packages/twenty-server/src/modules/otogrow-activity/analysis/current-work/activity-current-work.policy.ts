import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { truncateActivityUtf8 } from 'src/modules/otogrow-activity/otogrow-activity.reads';
import {
  type ActivityCurrentTask,
  type ActivityCurrentWorkScope,
  type ActivityCurrentWorkSnapshot,
} from './activity-current-work.types';

export const ACTIVITY_CURRENT_WORK_MAX_TASKS = 200;
export const ACTIVITY_CURRENT_WORK_MAX_BYTES = 96 * 1024;
const optionalId = z
  .uuid()
  .nullish()
  .transform((value) => value ?? null);
export const activityCurrentWorkScopeSchema = z
  .object({ personId: optionalId, projectId: optionalId, clientId: optionalId })
  .strict();
export const currentTaskSelectionSchema = z
  .object({
    taskId: z.uuid(),
    scope: activityCurrentWorkScopeSchema
      .nullish()
      .transform(
        (value) => value ?? { personId: null, projectId: null, clientId: null },
      ),
  })
  .strict();
export const parseCurrentWorkScope = (
  input: unknown,
  requireNarrowing = true,
): ActivityCurrentWorkScope => {
  const parsed = activityCurrentWorkScopeSchema.safeParse(input);
  if (
    !parsed.success ||
    (requireNarrowing &&
      !parsed.data.personId &&
      !parsed.data.projectId &&
      !parsed.data.clientId)
  )
    throw new BadRequestException(
      'Choose a person, project or client for current work.',
    );
  return parsed.data;
};
export const boundCurrentTask = (
  task: ActivityCurrentTask,
  originalBytes: Partial<Record<keyof ActivityCurrentTask, number>> = {},
) => {
  let truncatedFieldCount = 0;
  let omittedBytes = 0;
  const result = { ...task };
  for (const field of [
    'title',
    'projectName',
    'clientName',
    'ownerName',
    'primaryReviewerName',
    'effectiveReviewerName',
    'blocker',
  ] as const) {
    const value = task[field];
    if (value === null) continue;
    const bounded = truncateActivityUtf8(
      value,
      field === 'blocker' ? 512 : 800,
    );
    const removed = Math.max(
      0,
      (originalBytes[field] ?? Buffer.byteLength(value)) -
        Buffer.byteLength(bounded),
    );
    if (removed > 0) {
      truncatedFieldCount += 1;
      omittedBytes += removed;
    }
    result[field] = bounded;
  }
  result.detailsTruncated = truncatedFieldCount > 0;
  return { task: result, truncatedFieldCount, omittedBytes };
};
export const currentWorkFingerprint = (
  snapshot: Omit<ActivityCurrentWorkSnapshot, 'fingerprint'>,
) => {
  return advertisingHash({
    scope: snapshot.scope,
    totalCount: snapshot.totalCount,
    includedCount: snapshot.includedCount,
    omittedCount: snapshot.omittedCount,
    truncatedFieldCount: snapshot.truncatedFieldCount,
    omittedBytes: snapshot.omittedBytes,
    complete: snapshot.complete,
    items: snapshot.items,
    limitations: snapshot.limitations,
    nativeVisibilityFingerprint: snapshot.nativeVisibilityFingerprint,
  });
};
export const finishCurrentWorkSnapshot = (input: {
  capturedAt: string;
  scope: ActivityCurrentWorkScope;
  totalCount: number;
  tasks: ReturnType<typeof boundCurrentTask>[];
  nativeVisibilityFingerprint: string;
}): ActivityCurrentWorkSnapshot => {
  const items: ActivityCurrentTask[] = [];
  let bytes = 2;
  let truncatedFieldCount = 0;
  let omittedBytes = 0;
  for (const entry of input.tasks) {
    const size =
      Buffer.byteLength(JSON.stringify(entry.task)) + (items.length ? 1 : 0);
    if (
      items.length >= ACTIVITY_CURRENT_WORK_MAX_TASKS ||
      bytes + size > ACTIVITY_CURRENT_WORK_MAX_BYTES - 4096
    ) {
      omittedBytes += size + entry.omittedBytes;
      continue;
    }
    items.push(entry.task);
    bytes += size;
    truncatedFieldCount += entry.truncatedFieldCount;
    omittedBytes += entry.omittedBytes;
  }
  const omittedCount = input.totalCount - items.length;
  const snapshot = {
    capturedAt: input.capturedAt,
    scope: input.scope,
    totalCount: input.totalCount,
    includedCount: items.length,
    omittedCount,
    truncatedFieldCount,
    omittedBytes,
    complete: omittedCount === 0 && truncatedFieldCount === 0,
    items,
    nativeVisibilityFingerprint: input.nativeVisibilityFingerprint,
    limitations: [
      'Current work is a separate capture. Historical dates, categories, actions and outcomes do not filter these tasks.',
      'Person scope means current assignee or effective reviewer, including an unavailable assigned reviewer; it does not mean recorded effort.',
      'Task status and reported blockers are facts at capture time, not independently verified causes, capacity or productivity.',
      'APPROVED means work approved, not client delivery or fulfilment.',
      'Client identity follows the current project link; native company names are not included. Member names come from the administrator-accessible current team directory.',
      ...(omittedCount
        ? [
            'Some matching tasks were omitted. Narrow the person, project or client scope before starting analysis. Omitted bytes for unread rows are unknown.',
          ]
        : []),
      ...(truncatedFieldCount
        ? [
            'Some task fields were shortened. Choose a narrower scope or correct oversized task metadata before starting analysis.',
          ]
        : []),
    ],
  };
  return { ...snapshot, fingerprint: currentWorkFingerprint(snapshot) };
};
