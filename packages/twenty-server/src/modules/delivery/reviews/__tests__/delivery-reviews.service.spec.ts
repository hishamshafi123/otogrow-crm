import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryReviewsService } from 'src/modules/delivery/reviews/delivery-reviews.service';
import { DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import {
  type DeliveryNativeTaskVisibility,
  type DeliveryNativeTaskWriteOperation,
} from 'src/modules/delivery/native-task-visibility';
import { DeliveryReviewAssignmentEntity } from 'src/modules/delivery/reviews/entities/delivery-review-assignment.entity';
import { DeliveryReviewAssignmentEventEntity } from 'src/modules/delivery/reviews/entities/delivery-review-assignment-event.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryReminderOutboxEntity } from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import { newDeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';
import {
  recordDeliveryReviewNotice,
  cancelDeliveryReviewNotices,
} from 'src/modules/delivery/reviews/delivery-review-notices';
import {
  REVIEW_ASSIGNEE_ID,
  REVIEW_MEMBER_ID,
  REVIEW_MEMBERSHIP_ID,
  REVIEW_PROJECT_ID,
  REVIEW_TASK_ID,
  REVIEW_WORKSPACE_ID,
  reviewDetails,
} from 'src/modules/delivery/creative/review/__tests__/creative-review.fixtures';

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(async () => undefined),
}));
const PRIMARY = '4182ff40-d35d-49e9-b575-e23c6e101625',
  COMMAND = '270cbb8f-6e07-41bf-b2e4-cc68b9893c60',
  ASSIGNMENT = 'e1a6c3ef-c249-41ce-8d21-81ea25117bc3';
const workspace = { id: REVIEW_WORKSPACE_ID } as WorkspaceEntity;
const setup = () => {
  const details = reviewDetails();
  details.reviewerId = PRIMARY;
  const state = {
    nativeDenied: new Set<string>(),
    nativeHidden: new Map<string, Set<string>>(),
    nativeWriteDenied: new Set<string>(),
    nativeFingerprint: 'initial-policy',
    task: {
      taskId: REVIEW_TASK_ID,
      workspaceId: REVIEW_WORKSPACE_ID,
      projectId: REVIEW_PROJECT_ID,
      details,
      revision: 7,
    },
    actorId: PRIMARY,
    manager: true,
    reviewAllowed: true,
    members: [
      {
        memberId: PRIMARY,
        name: 'Same readable name',
        userWorkspaceId: REVIEW_MEMBERSHIP_ID,
      },
      {
        memberId: REVIEW_MEMBER_ID,
        name: 'Same readable name',
        userWorkspaceId: REVIEW_MEMBERSHIP_ID,
      },
      {
        memberId: REVIEW_ASSIGNEE_ID,
        name: 'Editor',
        userWorkspaceId: REVIEW_MEMBERSHIP_ID,
      },
    ],
    assignment: null as DeliveryReviewAssignmentEntity | null,
    events: [] as DeliveryReviewAssignmentEventEntity[],
    operations: Object.assign(new DeliveryOperationsEntity(), {
      id: '8db28ec8-f59f-43ab-92dd-0de135d5b54a',
      workspaceId: REVIEW_WORKSPACE_ID,
      state: { ...newDeliveryOperations(), timezone: 'Asia/Qatar' },
    }),
  };
  const project = {
    id: REVIEW_PROJECT_ID,
    workspaceId: REVIEW_WORKSPACE_ID,
    name: 'Selected client',
    memberIds: [REVIEW_MEMBER_ID, REVIEW_ASSIGNEE_ID],
  };
  const assignments = {
    findOne: async () => state.assignment,
    findOneBy: async () => state.assignment,
    save: async (fields: Partial<DeliveryReviewAssignmentEntity>) => {
      state.assignment = Object.assign(
        new DeliveryReviewAssignmentEntity(),
        { id: ASSIGNMENT },
        fields,
      );
      return state.assignment;
    },
  };
  const events = {
    findOneBy: async ({ commandId }: { commandId: string }) =>
      state.events.find((event) => event.commandId === commandId) ?? null,
    insert: async (fields: Partial<DeliveryReviewAssignmentEventEntity>) => {
      state.events.push(
        Object.assign(
          new DeliveryReviewAssignmentEventEntity(),
          { id: COMMAND },
          fields,
        ),
      );
    },
    createQueryBuilder: () => {
      const query = {
        where: () => query,
        orderBy: () => query,
        addOrderBy: () => query,
        take: () => query,
        getMany: async () => state.events,
      };
      return query;
    },
  };
  const manager = {
    query: async (sql: string, parameters: unknown[]) => {
      if (sql.includes("jsonb_build_object('id',notice"))
        return state.operations.state.notices
          .filter(
            (notice) =>
              notice.kind === 'REVIEW_ASSIGNMENT' &&
              !notice.cancelled &&
              notice.taskId === parameters[1] &&
              notice.recipientId === parameters[2] &&
              String(notice.reviewAssignment?.submissionVersion) ===
                parameters[4] &&
              (notice.reviewAssignment?.assignmentId === parameters[3] ||
                notice.reviewAssignment?.assignmentId === null),
          )
          .map((notice) => ({ notice }));
      if (sql.includes('deliveryReviewAssignment')) {
        const selected = JSON.parse(String(parameters[1])) as {
          taskId: string;
          submissionVersion: number;
        }[];
        return state.assignment &&
          selected.some(
            (source) =>
              source.submissionVersion === state.assignment?.submissionVersion,
          )
          ? [state.assignment]
          : [];
      }
      if (sql.includes('SELECT "assigneeId",title'))
        return [
          { assigneeId: REVIEW_ASSIGNEE_ID, title: 'Exact pending task' },
        ];
      return [];
    },
    getRepository: (entity: unknown) => {
      if (entity === DeliveryTaskEntity)
        return { findOneBy: async () => state.task };
      if (entity === DeliveryProjectEntity)
        return { findOneBy: async () => project };
      if (entity === DeliveryReviewAssignmentEntity) return assignments;
      if (entity === DeliveryReviewAssignmentEventEntity) return events;
      if (entity === DeliveryOperationsEntity)
        return {
          findOne: async () => state.operations,
          findOneBy: async () => state.operations,
          create: (fields: Partial<DeliveryOperationsEntity>) =>
            Object.assign(new DeliveryOperationsEntity(), fields),
          save: async (record: DeliveryOperationsEntity) => {
            state.operations = record;
            return record;
          },
        };
      if (entity === DeliveryReminderOutboxEntity)
        return { update: async () => undefined };
      throw new Error('Unexpected repository');
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (read: (manager: EntityManager) => Promise<unknown>) => {
      const before = structuredClone({
        assignment: state.assignment,
        events: state.events,
        operations: state.operations,
      });
      try {
        return await read(manager);
      } catch (error) {
        state.assignment = before.assignment;
        state.events = before.events;
        state.operations = before.operations;
        throw error;
      }
    },
  } as unknown as DataSource;
  const delivery = {
    actor: async () => ({
      memberId: state.actorId,
      isManager: state.manager,
      isAdmin: false,
      capabilities: state.manager
        ? ['delivery.manage']
        : state.reviewAllowed
          ? ['delivery.review']
          : [],
      roleIds: [],
    }),
    schema: () => '"disposable"',
  } as unknown as DeliveryService;
  const access = {
    listActiveMembers: async () => state.members,
    listAccess: async () =>
      state.members.map((member) => ({
        ...member,
        capabilities:
          member.memberId === PRIMARY
            ? ['delivery.manage']
            : member.memberId === REVIEW_MEMBER_ID
              ? ['delivery.review']
              : [],
      })),
  } as unknown as OtogrowAccessService;
  const nativeVisibility = jest.fn(
    async (
      _manager: EntityManager,
      _workspace: WorkspaceEntity,
      identity: { memberId: string; userWorkspaceId: string },
      _columns?: string[],
      operation?: DeliveryNativeTaskWriteOperation,
    ): Promise<DeliveryNativeTaskVisibility> => {
      if (
        state.nativeDenied.has(identity.memberId) ||
        (operation && state.nativeWriteDenied.has(identity.memberId))
      )
        throw new ForbiddenException('Current native task permission denied.');
      return {
        sql: 'native-visible',
        parameters: { memberId: identity.memberId },
        fingerprint: state.nativeFingerprint,
      };
    },
  );
  const native = {
    visibility: nativeVisibility,
    assert: async (
      manager: EntityManager,
      workspace: WorkspaceEntity,
      identity: { memberId: string; userWorkspaceId: string },
      taskId: string,
      columns?: string[],
    ) => {
      const visibility = await nativeVisibility(
        manager,
        workspace,
        identity,
        columns,
      );
      if (state.nativeHidden.get(identity.memberId)?.has(taskId))
        throw new NotFoundException('Current native task unavailable.');
      return visibility;
    },
    predicate: () => 'native_visible',
    query: async (
      queryManager: EntityManager,
      sql: string,
      parameters: unknown[],
      visibility: DeliveryNativeTaskVisibility,
    ) => {
      if (sql.startsWith('SELECT task.id FROM'))
        return (parameters[0] as string[])
          .filter(
            (id) =>
              !state.nativeHidden
                .get(String(visibility.parameters.memberId))
                ?.has(id),
          )
          .map((id) => ({ id }));
      return queryManager.query(sql, parameters);
    },
  } as unknown as DeliveryNativeTaskAccessService;
  return {
    state,
    project,
    manager,
    nativeVisibility,
    service: new DeliveryReviewsService(dataSource, delivery, access, native),
    command: {
      commandId: COMMAND,
      taskId: REVIEW_TASK_ID,
      taskRevision: 7,
      submissionVersion: 1,
      assignmentRevision: 0,
      mode: 'BACKUP',
      reviewerId: REVIEW_MEMBER_ID,
      reason: 'Cover this pending submission while the primary is away.',
    },
  };
};
beforeEach(() =>
  jest.mocked(recordOtogrowActivity).mockReset().mockResolvedValue(undefined),
);
it.each(['object', 'row'])(
  'rejects native %s denial before hydrating exact private review history or creating assignment effects',
  async (kind) => {
    const { state, service, command, manager } = setup();
    if (kind === 'object') state.nativeDenied.add(PRIMARY);
    else state.nativeHidden.set(PRIMARY, new Set([REVIEW_TASK_ID]));
    const repositories = jest.spyOn(manager, 'getRepository');
    for (const operation of [
      () =>
        service.task(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, {
          taskId: REVIEW_TASK_ID,
        }),
      () =>
        service.history(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, {
          taskId: REVIEW_TASK_ID,
          submissionVersion: 1,
        }),
      () => service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command),
    ])
      await expect(operation()).rejects.toThrow(/native task/i);
    expect(repositories).not.toHaveBeenCalled();
    expect(state.assignment).toBeNull();
    expect(state.events).toEqual([]);
    expect(state.operations.state.notices).toEqual([]);
  },
);
it.each(['object', 'row', 'write'])(
  'checks the selected reviewer’s own native %s access without borrowing the manager’s rights',
  async (kind) => {
    const { state, service, command, nativeVisibility } = setup();
    const candidate = state.members.find(
      (member) => member.memberId === REVIEW_MEMBER_ID,
    )!;
    candidate.userWorkspaceId = 'd20c4904-f7fb-4163-b548-b0ce22839c64';
    if (kind === 'object') state.nativeDenied.add(REVIEW_MEMBER_ID);
    else if (kind === 'write') state.nativeWriteDenied.add(REVIEW_MEMBER_ID);
    else state.nativeHidden.set(REVIEW_MEMBER_ID, new Set([REVIEW_TASK_ID]));
    await expect(
      service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command),
    ).rejects.toThrow('current CRM task access');
    expect(nativeVisibility).toHaveBeenCalledWith(
      expect.anything(),
      workspace,
      expect.objectContaining({
        memberId: REVIEW_MEMBER_ID,
        userWorkspaceId: candidate.userWorkspaceId,
      }),
      undefined,
      { type: 'update', updatedColumns: ['status'] },
    );
    expect(state.assignment).toBeNull();
    expect(state.events).toEqual([]);
    expect(state.operations.state.notices).toEqual([]);
  },
);
it('keeps a native read-only manager’s review and delegation available while withholding final review actions', async () => {
  const { state, service, command } = setup();
  state.nativeWriteDenied.add(PRIMARY);
  const task = await service.task(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, {
    taskId: REVIEW_TASK_ID,
  });
  expect(task).toMatchObject({
    canApprove: false,
    canReviewSubmission: false,
    canManageAssignment: true,
    pending: {
      reviewerState: 'UNAVAILABLE',
      warnings: expect.arrayContaining(['NATIVE_REVIEW_WRITE_UNAVAILABLE']),
    },
  });
  const assigned = await service.assign(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    command,
  );
  expect(assigned.assignment.reviewerId).toBe(REVIEW_MEMBER_ID);
  expect(assigned.taskReview.pending?.reviewerState).toBe('ACTIVE');
});
it('preserves exact notice receipts for a readable reviewer who has lost native status-update access', async () => {
  const { state, service, command } = setup();
  await service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command);
  state.actorId = REVIEW_MEMBER_ID;
  state.manager = false;
  state.nativeWriteDenied.add(REVIEW_MEMBER_ID);
  const notice = state.operations.state.notices[0];
  const receipt = {
    taskId: REVIEW_TASK_ID,
    taskRevision: 7,
    submissionVersion: 1,
    assignmentRevision: 1,
    noticeId: notice.id,
  };
  const seen = await service.seen(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    receipt,
  );
  expect(seen.canReviewSubmission).toBe(false);
  expect(seen.canApprove).toBe(false);
  expect(seen.assignmentNotice?.seenAt).toBeTruthy();
  expect(
    (
      await service.acknowledge(
        workspace,
        REVIEW_MEMBER_ID,
        REVIEW_MEMBERSHIP_ID,
        receipt,
      )
    ).acknowledgedAt,
  ).toBeTruthy();
  expect(state.task.details.state).toBe('IN_REVIEW');
});
it('does not return a saved assignment receipt after native revocation', async () => {
  const { state, service, command } = setup();
  await service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command);
  state.nativeDenied.add(PRIMARY);
  await expect(
    service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command),
  ).rejects.toThrow('native task');
  expect(state.events).toHaveLength(1);
});
it('delegates only the current submission and preserves exact canonical manager/source identity', async () => {
  const { state, service, command } = setup(),
    original = structuredClone(state.task);
  const result = await service.assign(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    command,
  );
  expect(result).toMatchObject({
    replayed: false,
    assignment: { mode: 'BACKUP', reviewerId: REVIEW_MEMBER_ID, revision: 1 },
    taskReview: {
      pending: {
        primaryReviewerId: PRIMARY,
        effectiveReviewerId: REVIEW_MEMBER_ID,
      },
    },
  });
  expect(state.task).toEqual(original);
  expect(state.events[0]).toMatchObject({
    primaryReviewerId: PRIMARY,
    previousReviewerId: PRIMARY,
    reviewerId: REVIEW_MEMBER_ID,
    reason: command.reason,
  });
  expect(
    JSON.stringify(jest.mocked(recordOtogrowActivity).mock.calls[0][1]),
  ).not.toContain(command.reason);
});
it('keeps immutable primary/previous/backup IDs despite duplicate names or departed staff', async () => {
  const { state, service, command } = setup();
  await service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command);
  state.members = state.members
    .filter((member) => member.memberId !== REVIEW_MEMBER_ID)
    .map((member) => ({ ...member, name: 'Changed current name' }));
  const history = await service.history(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    { taskId: REVIEW_TASK_ID, submissionVersion: 1 },
  );
  expect(history.events[0]).toMatchObject({
    primaryReviewerId: PRIMARY,
    previousReviewerId: PRIMARY,
    reviewerId: REVIEW_MEMBER_ID,
    primaryReviewerName: 'Same readable name',
    reviewerName: 'Same readable name',
    actorName: 'Same readable name',
  });
});
it('replays the original request honestly after a new submission defaults back to primary', async () => {
  const { state, service, command } = setup();
  await service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command);
  state.task.details.submissions.push({
    ...state.task.details.submissions[0],
    version: 2,
  });
  state.task.revision = 8;
  const replay = await service.assign(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    command,
  );
  expect(replay).toMatchObject({
    replayed: true,
    assignment: { submissionVersion: 1, mode: 'BACKUP' },
    taskReview: {
      assignment: { submissionVersion: 2, revision: 0, mode: 'PRIMARY' },
      pending: { effectiveReviewerId: PRIMARY },
    },
  });
  expect(state.events).toHaveLength(1);
  await expect(
    service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, {
      ...command,
      reason: 'Another payload',
    }),
  ).rejects.toThrow('another request');
});
it('rolls assignment and immutable history back together when unified audit fails', async () => {
  const { state, service, command } = setup();
  jest
    .mocked(recordOtogrowActivity)
    .mockRejectedValueOnce(new Error('Audit unavailable'));
  await expect(
    service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command),
  ).rejects.toThrow('Audit unavailable');
  expect(state.assignment).toBeNull();
  expect(state.events).toEqual([]);
  expect(state.task.details.reviewerId).toBe(PRIMARY);
});
it('does not grant a scoped reviewer authority to assign another backup', async () => {
  const { state, service, command } = setup();
  state.actorId = REVIEW_MEMBER_ID;
  state.manager = false;
  await expect(
    service.assign(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, command),
  ).rejects.toThrow('Only a delivery manager');
  expect(state.assignment).toBeNull();
});

it('mints one independent review notice with exact immutable origin and a five-minute deadline', async () => {
  const { service, state, command } = setup();
  const result = await service.assign(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    command,
    new Date('2026-10-29T10:00:00Z'),
  );
  expect(state.operations.state.notices).toHaveLength(1);
  expect(state.operations.state.notices[0]).toMatchObject({
    kind: 'REVIEW_ASSIGNMENT',
    taskId: REVIEW_TASK_ID,
    recipientId: REVIEW_MEMBER_ID,
    reviewAssignment: {
      submissionVersion: 1,
      assignmentId: ASSIGNMENT,
      assignmentRevision: 1,
      recipientId: REVIEW_MEMBER_ID,
    },
    createdAt: '2026-10-29T10:00:00.000Z',
    remindAt: '2026-10-29T10:05:00.000Z',
    sendState: 'PENDING',
    seenAt: null,
  });
  expect(result.taskReview.assignmentNotice).toMatchObject({
    assignmentId: ASSIGNMENT,
    assignmentRevision: 1,
    remindAt: '2026-10-29T10:05:00.000Z',
  });
  expect(state.operations.state.timezone).toBe('Asia/Qatar');
  expect(state.operations.state.enabled).toBe(false);
  expect(state.operations.state.telegramEnabled).toBe(false);
});
it('keeps a same-owner reason revision on its original unread deadline and origin', async () => {
  const { service, state, command } = setup();
  await service.assign(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    command,
    new Date('2026-10-29T10:00:00Z'),
  );
  const original = structuredClone(state.operations.state.notices[0]);
  await service.assign(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    {
      ...command,
      commandId: '895e350e-36cb-423f-99ed-d5e515de4ac9',
      assignmentRevision: 1,
      reason: 'Same reviewer; clarify the handoff.',
    },
    new Date('2026-10-29T10:04:00Z'),
  );
  expect(state.assignment?.revision).toBe(2);
  expect(state.operations.state.notices).toEqual([original]);
});
it('marks only the exact current recipient review seen without touching production or assignment history', async () => {
  const { service, state, command } = setup();
  await service.assign(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    command,
    new Date('2026-10-29T10:00:00Z'),
  );
  const source = structuredClone(state.task),
    notice = state.operations.state.notices[0];
  await expect(
    service.seen(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, {
      taskId: REVIEW_TASK_ID,
      taskRevision: 7,
      submissionVersion: 1,
      assignmentRevision: 1,
      noticeId: notice.id,
    }),
  ).rejects.toThrow('current eligible');
  state.actorId = REVIEW_MEMBER_ID;
  state.manager = false;
  const seen = {
    taskId: REVIEW_TASK_ID,
    taskRevision: 7,
    submissionVersion: 1,
    assignmentRevision: 1,
    noticeId: notice.id,
  };
  const result = await service.seen(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    seen,
    new Date('2026-10-29T10:02:00Z'),
  );
  expect(result.assignmentNotice?.seenAt).toBe('2026-10-29T10:02:00.000Z');
  await service.seen(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    seen,
    new Date('2026-10-29T10:03:00Z'),
  );
  expect(state.operations.state.notices[0].seenAt).toBe(
    '2026-10-29T10:02:00.000Z',
  );
  expect(state.task).toEqual(source);
  expect(state.events).toHaveLength(1);
});
it('acknowledges only the exact review notice and returns a thin identity-bound receipt without completing or marking work seen', async () => {
  const { service, state, command } = setup();
  await service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command);
  state.actorId = REVIEW_MEMBER_ID;
  state.manager = false;
  const source = structuredClone(state.task),
    history = structuredClone(state.events),
    notice = state.operations.state.notices[0],
    original = structuredClone(notice),
    input = {
      taskId: REVIEW_TASK_ID,
      taskRevision: 7,
      submissionVersion: 1,
      assignmentRevision: 1,
      noticeId: notice.id,
    };
  const result = await service.acknowledge(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    input,
    new Date('2026-10-29T10:02:00Z'),
  );
  expect(result).toEqual({
    workspaceId: REVIEW_WORKSPACE_ID,
    memberId: REVIEW_MEMBER_ID,
    userWorkspaceId: REVIEW_MEMBERSHIP_ID,
    ...input,
    acknowledgedAt: '2026-10-29T10:02:00.000Z',
  });
  expect(state.operations.state.notices).toEqual([
    { ...original, acknowledgedAt: result.acknowledgedAt },
  ]);
  expect(state.task).toEqual(source);
  expect(state.events).toEqual(history);
  expect(
    await service.acknowledge(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      input,
      new Date('2026-10-29T10:03:00Z'),
    ),
  ).toEqual(result);
  state.reviewAllowed = false;
  await expect(
    service.acknowledge(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      input,
    ),
  ).rejects.toThrow('current eligible');
  expect(state.operations.state.notices[0].acknowledgedAt).toBe(
    result.acknowledgedAt,
  );
});
it.each(['taskRevision', 'submissionVersion', 'assignmentRevision'] as const)(
  'rejects a stale acknowledgement %s before changing any notice',
  async (field) => {
    const { service, state, command } = setup();
    await service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command);
    state.actorId = REVIEW_MEMBER_ID;
    state.manager = false;
    const before = structuredClone(state.operations),
      input = {
        taskId: REVIEW_TASK_ID,
        taskRevision: 7,
        submissionVersion: 1,
        assignmentRevision: 1,
        noticeId: state.operations.state.notices[0].id,
      };
    await expect(
      service.acknowledge(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
        ...input,
        [field]: input[field] + 1,
      }),
    ).rejects.toThrow(ConflictException);
    expect(state.operations).toEqual(before);
  },
);
it('rejects acknowledgement by the manager for another recipient and after project access, source or notice revocation', async () => {
  const { service, state, command, project } = setup();
  await service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command);
  const input = {
    taskId: REVIEW_TASK_ID,
    taskRevision: 7,
    submissionVersion: 1,
    assignmentRevision: 1,
    noticeId: state.operations.state.notices[0].id,
  };
  await expect(
    service.acknowledge(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, input),
  ).rejects.toThrow('current eligible');
  state.actorId = REVIEW_MEMBER_ID;
  state.manager = false;
  const originalMembers = project.memberIds;
  project.memberIds = [];
  await expect(
    service.acknowledge(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      input,
    ),
  ).rejects.toThrow();
  project.memberIds = originalMembers;
  state.operations.state.notices[0].cancelled = true;
  await expect(
    service.acknowledge(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      input,
    ),
  ).rejects.toThrow('current eligible');
  state.operations.state.notices[0].cancelled = false;
  state.task.details.state = 'APPROVED';
  await expect(
    service.acknowledge(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      input,
    ),
  ).rejects.toThrow('no longer current');
  expect(state.operations.state.notices[0].acknowledgedAt).toBeNull();
});
it('acknowledges a primary revision-zero notice without inventing an assignment row', async () => {
  const { manager, service, state } = setup();
  await recordDeliveryReviewNotice(manager, REVIEW_WORKSPACE_ID, {
    taskId: REVIEW_TASK_ID,
    submissionVersion: 1,
    assignmentId: null,
    assignmentRevision: 0,
    previousRecipientId: null,
    recipientId: PRIMARY,
    eligible: true,
    senderId: REVIEW_ASSIGNEE_ID,
    now: new Date('2026-10-29T10:00:00Z'),
  });
  const notice = state.operations.state.notices[0];
  const result = await service.acknowledge(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    {
      taskId: REVIEW_TASK_ID,
      taskRevision: 7,
      submissionVersion: 1,
      assignmentRevision: 0,
      noticeId: notice.id,
    },
    new Date('2026-10-29T10:01:00Z'),
  );
  expect(result.acknowledgedAt).toBe('2026-10-29T10:01:00.000Z');
  expect(result.assignmentRevision).toBe(0);
  expect(state.assignment).toBeNull();
  expect(notice.reviewAssignment).toMatchObject({
    assignmentId: null,
    assignmentRevision: 0,
  });
  expect(notice.seenAt).toBeNull();
});
it('notifies a newly submitted primary without fabricating an assignment row and permits exact revision-zero seen', async () => {
  const { manager, service, state } = setup();
  await recordDeliveryReviewNotice(manager, REVIEW_WORKSPACE_ID, {
    taskId: REVIEW_TASK_ID,
    submissionVersion: 1,
    assignmentId: null,
    assignmentRevision: 0,
    previousRecipientId: null,
    recipientId: PRIMARY,
    eligible: true,
    senderId: REVIEW_ASSIGNEE_ID,
    now: new Date('2026-10-29T10:00:00Z'),
  });
  expect(state.assignment).toBeNull();
  const notice = state.operations.state.notices[0];
  expect(notice.reviewAssignment).toMatchObject({
    assignmentId: null,
    assignmentRevision: 0,
  });
  const result = await service.seen(
    workspace,
    PRIMARY,
    REVIEW_MEMBERSHIP_ID,
    {
      taskId: REVIEW_TASK_ID,
      taskRevision: 7,
      submissionVersion: 1,
      assignmentRevision: 0,
      noticeId: notice.id,
    },
    new Date('2026-10-29T10:01:00Z'),
  );
  expect(result.assignmentNotice?.seenAt).toBe('2026-10-29T10:01:00.000Z');
  expect(state.assignment).toBeNull();
});
it('does not revive cancelled old ownership during a same-owner reason revision', async () => {
  const { manager, service, state, command } = setup();
  await service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, command);
  await cancelDeliveryReviewNotices(
    manager,
    REVIEW_WORKSPACE_ID,
    REVIEW_TASK_ID,
    new Date(),
  );
  await service.assign(workspace, PRIMARY, REVIEW_MEMBERSHIP_ID, {
    ...command,
    commandId: '895e350e-36cb-423f-99ed-d5e515de4ac9',
    assignmentRevision: 1,
    reason: 'Clarify the same recipient without re-notifying.',
  });
  expect(state.operations.state.notices).toHaveLength(1);
  expect(state.operations.state.notices[0]).toMatchObject({
    cancelled: true,
    sendState: 'SUPPRESSED',
  });
});
