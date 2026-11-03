import { ForbiddenException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryCreativeReviewService } from 'src/modules/delivery/creative/review/delivery-creative-review.service';
import { DeliveryCreativeFeedbackEntity } from 'src/modules/delivery/creative/review/entities/delivery-creative-feedback.entity';
import { DeliveryCreativeFeedbackEventEntity } from 'src/modules/delivery/creative/review/entities/delivery-creative-feedback-event.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { creativeReviewTarget } from 'src/modules/delivery/creative/review/delivery-creative-review.policy';
import { type DeliveryCreativeFeedbackChangeInput } from 'src/modules/delivery/creative/review/delivery-creative-review.dto';
import {
  REVIEW_ASSET_ID,
  REVIEW_ASSIGNEE_ID,
  REVIEW_CHANGE_ID,
  REVIEW_COMMAND_ID,
  REVIEW_CORRECTION_ID,
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
const workspace = { id: REVIEW_WORKSPACE_ID } as WorkspaceEntity;
const setup = () => {
  const state = {
    details: reviewDetails(),
    memberId: REVIEW_MEMBER_ID,
    isManager: true,
    capabilities: [] as string[],
    reviewAssignment: null as {
      taskId: string;
      submissionVersion: number;
      revision: number;
      mode: 'BACKUP';
      reviewerId: string;
    } | null,
    allowed: true,
    feedback: new Map<string, DeliveryCreativeFeedbackEntity>(),
    events: new Map<string, DeliveryCreativeFeedbackEventEntity>(),
  };
  const feedbackRepository = {
    create: (fields: Partial<DeliveryCreativeFeedbackEntity>) =>
      Object.assign(new DeliveryCreativeFeedbackEntity(), fields),
    insert: async (fields: Partial<DeliveryCreativeFeedbackEntity>) => {
      state.feedback.set(
        fields.id!,
        Object.assign(new DeliveryCreativeFeedbackEntity(), fields),
      );
    },
    save: async (row: DeliveryCreativeFeedbackEntity) => {
      state.feedback.set(row.id, row);
      return row;
    },
    findOneBy: async (where: {
      workspaceId: string;
      taskId: string;
      id: string;
    }) => {
      const row = state.feedback.get(where.id);
      return row?.workspaceId === where.workspaceId &&
        row.taskId === where.taskId
        ? row
        : null;
    },
    findOne: async ({
      where,
    }: {
      where: { workspaceId: string; taskId: string; id: string };
    }) => {
      const row = state.feedback.get(where.id);
      return row?.workspaceId === where.workspaceId &&
        row.taskId === where.taskId
        ? row
        : null;
    },
  };
  const eventRepository = {
    findOneBy: async ({
      workspaceId,
      commandId,
    }: {
      workspaceId: string;
      commandId: string;
    }) => {
      const event = state.events.get(commandId);
      return event?.workspaceId === workspaceId ? event : null;
    },
    insert: async (fields: Partial<DeliveryCreativeFeedbackEventEntity>) => {
      state.events.set(
        fields.commandId!,
        Object.assign(new DeliveryCreativeFeedbackEventEntity(), fields),
      );
    },
  };
  const manager = {
    query: jest.fn(async (sql: string) =>
      sql.includes('deliveryReviewAssignment') && state.reviewAssignment
        ? [state.reviewAssignment]
        : [],
    ),
    getRepository: (entity: unknown) => {
      if (entity === DeliveryCreativeFeedbackEntity) return feedbackRepository;
      if (entity === DeliveryCreativeFeedbackEventEntity)
        return eventRepository;
      if (entity === DeliveryProjectEntity)
        return {
          findOneBy: async () => ({
            memberIds: [REVIEW_MEMBER_ID, REVIEW_ASSIGNEE_ID],
          }),
        };
      throw new Error('Unexpected repository');
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (read: (manager: EntityManager) => Promise<unknown>) => {
      const priorFeedback = structuredClone(state.feedback),
        priorEvents = structuredClone(state.events);
      try {
        return await read(manager);
      } catch (error) {
        state.feedback = priorFeedback;
        state.events = priorEvents;
        throw error;
      }
    },
  } as unknown as DataSource;
  const creative = {
    scope: jest.fn(async () => {
      if (!state.allowed) throw new ForbiddenException();
      return {
        actor: {
          memberId: state.memberId,
          isManager: state.isManager,
          isAdmin: false,
          capabilities: state.capabilities,
          roleIds: [],
        },
        assigneeId: REVIEW_ASSIGNEE_ID,
        task: {
          taskId: REVIEW_TASK_ID,
          projectId: REVIEW_PROJECT_ID,
          revision: 7,
          details: state.details,
        },
      };
    }),
  } as unknown as DeliveryCreativeService;
  const access = {
    listActiveMembers: async () => [
      {
        memberId: REVIEW_MEMBER_ID,
        userWorkspaceId: REVIEW_MEMBERSHIP_ID,
        name: 'Independent reviewer',
      },
      {
        memberId: REVIEW_ASSIGNEE_ID,
        userWorkspaceId: REVIEW_MEMBERSHIP_ID,
        name: 'Current editor',
      },
    ],
  } as unknown as OtogrowAccessService;
  const service = new DeliveryCreativeReviewService(
    dataSource,
    creative,
    access,
  );
  const create = () => ({
    commandId: REVIEW_COMMAND_ID,
    taskId: REVIEW_TASK_ID,
    targetKind: 'SUBMISSION',
    submissionVersion: 1,
    assetId: REVIEW_ASSET_ID,
    targetToken: creativeReviewTarget(REVIEW_TASK_ID, state.details, {
      targetKind: 'SUBMISSION',
      submissionVersion: 1,
      assetId: REVIEW_ASSET_ID,
    }).targetToken!,
    body: 'Correct the product logo.',
    anchorKind: 'GENERAL',
    startMs: null,
    endMs: null,
  });
  const change = (
    fields: Partial<DeliveryCreativeFeedbackChangeInput> = {},
  ): DeliveryCreativeFeedbackChangeInput => ({
    commandId: REVIEW_CHANGE_ID,
    taskId: REVIEW_TASK_ID,
    feedbackId: REVIEW_COMMAND_ID,
    revision: 1,
    action: 'ADDRESSED',
    body: 'The correction is on the selected exact asset.',
    evidenceTargetKind: 'ASSET',
    evidenceSubmissionVersion: null,
    evidenceAssetId: REVIEW_CORRECTION_ID,
    evidenceTargetToken: creativeReviewTarget(REVIEW_TASK_ID, state.details, {
      targetKind: 'ASSET',
      submissionVersion: null,
      assetId: REVIEW_CORRECTION_ID,
    }).targetToken,
    ...fields,
  });
  return { service, state, create, change };
};
beforeEach(() =>
  jest.mocked(recordOtogrowActivity).mockReset().mockResolvedValue(undefined),
);
it('stores exact original and correction evidence without changing production or approval state', async () => {
  const { service, state, create, change } = setup();
  const source = structuredClone(state.details);
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    create(),
  );
  const result = await service.change(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    change(),
  );
  expect(result.feedback).toMatchObject({
    status: 'ADDRESSED',
    revision: 2,
    assetId: REVIEW_ASSET_ID,
    correction: { assetId: REVIEW_CORRECTION_ID, targetKind: 'ASSET' },
  });
  expect(state.details).toEqual(source);
  expect([...state.events.values()].map((event) => event.action)).toEqual([
    'CREATED',
    'ADDRESSED',
  ]);
  expect(jest.mocked(recordOtogrowActivity).mock.calls[1][1]).toMatchObject({
    sourceType: 'creative-review',
    sourceId: REVIEW_COMMAND_ID,
    action: 'CREATIVE_FEEDBACK_ADDRESSED',
  });
  expect(
    JSON.stringify(jest.mocked(recordOtogrowActivity).mock.calls[1][1]),
  ).not.toContain(change().body);
});
it('returns current feedback on exact old-command replay without repeating history', async () => {
  const { service, state, create, change } = setup();
  const original = create();
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    original,
  );
  await service.change(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    change(),
  );
  state.details.creative!.version += 1;
  state.details.creative!.assets = state.details.creative!.assets.filter(
    (asset) => asset.id !== REVIEW_ASSET_ID,
  );
  const replay = await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    original,
  );
  expect(replay).toMatchObject({
    replayed: true,
    feedback: {
      status: 'ADDRESSED',
      revision: 2,
      target: { availability: 'ASSET_MISSING' },
    },
  });
  expect(state.events.size).toBe(2);
  await expect(
    service.create(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
      ...original,
      body: 'Different command payload',
    }),
  ).rejects.toThrow('different request');
});
it('rechecks current scope before replaying old feedback', async () => {
  const { service, state, create } = setup();
  const original = create();
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    original,
  );
  state.allowed = false;
  await expect(
    service.create(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, original),
  ).rejects.toThrow(ForbiddenException);
});
it('allows a task reader to reply to unavailable historical media without authority to resolve it', async () => {
  const { service, state, create, change } = setup();
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    create(),
  );
  state.isManager = false;
  state.details.creative!.assets = [];
  const result = await service.change(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    change({
      action: 'REPLY',
      body: 'I can explain the original note.',
      evidenceTargetKind: null,
      evidenceSubmissionVersion: null,
      evidenceAssetId: null,
      evidenceTargetToken: null,
    }),
  );
  expect(result.feedback.status).toBe('OPEN');
  expect(result.feedback.revision).toBe(2);
  state.details.creative!.assets = reviewDetails().creative!.assets;
  await expect(
    service.change(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      change({
        commandId: '0daa4e63-d149-4c89-a6de-a737eeb1d9a9',
        revision: 2,
        action: 'RESOLVED',
      }),
    ),
  ).rejects.toThrow(ForbiddenException);
});
it('rejects addressed evidence pointing to unchanged bytes even through another target context', async () => {
  const { service, create, change, state } = setup();
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    create(),
  );
  const token = creativeReviewTarget(REVIEW_TASK_ID, state.details, {
    targetKind: 'ASSET',
    submissionVersion: null,
    assetId: REVIEW_ASSET_ID,
  }).targetToken;
  await expect(
    service.change(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      change({ evidenceAssetId: REVIEW_ASSET_ID, evidenceTargetToken: token }),
    ),
  ).rejects.toThrow('different exact correction asset');
  expect(state.feedback.get(REVIEW_COMMAND_ID)?.status).toBe('OPEN');
  expect(state.events.size).toBe(1);
});
it('allows only the independent assigned reviewer to resolve original media with an explicit explanation', async () => {
  const { service, create, change, state } = setup();
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    create(),
  );
  const token = creativeReviewTarget(REVIEW_TASK_ID, state.details, {
    targetKind: 'SUBMISSION',
    submissionVersion: 1,
    assetId: REVIEW_ASSET_ID,
  }).targetToken;
  const result = await service.change(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    change({
      action: 'RESOLVED',
      body: 'Original brand guide confirms this mark; no correction needed.',
      evidenceTargetKind: 'SUBMISSION',
      evidenceSubmissionVersion: 1,
      evidenceAssetId: REVIEW_ASSET_ID,
      evidenceTargetToken: token,
    }),
  );
  expect(result.feedback.status).toBe('RESOLVED');
  expect(result.feedback.correction?.assetId).toBe(REVIEW_ASSET_ID);
  expect(state.details.state).toBe('IN_REVIEW');
});
it('prevents self-resolution even when the current assignee is a manager and assigned reviewer', async () => {
  const { service, state, create, change } = setup();
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    create(),
  );
  state.memberId = REVIEW_ASSIGNEE_ID;
  state.details.reviewerId = REVIEW_ASSIGNEE_ID;
  await expect(
    service.change(
      workspace,
      REVIEW_ASSIGNEE_ID,
      REVIEW_MEMBERSHIP_ID,
      change({ action: 'RESOLVED' }),
    ),
  ).rejects.toThrow(ForbiddenException);
});
it('permits a current project-member scoped backup to resolve without acquiring production manager rights', async () => {
  const { service, state, create, change } = setup();
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    create(),
  );
  state.isManager = false;
  state.capabilities = ['delivery.review'];
  state.reviewAssignment = {
    taskId: REVIEW_TASK_ID,
    submissionVersion: 1,
    revision: 1,
    mode: 'BACKUP',
    reviewerId: REVIEW_MEMBER_ID,
  };
  state.details.reviewerId = '4182ff40-d35d-49e9-b575-e23c6e101625';
  const resolved = await service.change(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    change({ action: 'RESOLVED' }),
  );
  expect(resolved.feedback.status).toBe('RESOLVED');
  expect(state.isManager).toBe(false);
  expect(state.details.reviewerId).toBe('4182ff40-d35d-49e9-b575-e23c6e101625');
});
it('does not let a new submission automatically address old feedback', async () => {
  const { service, state, create } = setup();
  const original = create();
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    original,
  );
  state.details.submissions.push({
    ...state.details.submissions[0],
    version: 2,
    creativeVersion: 2,
    finalAssetId: REVIEW_CORRECTION_ID,
  });
  const result = await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    original,
  );
  expect(result.feedback).toMatchObject({
    status: 'OPEN',
    target: { submissionVersion: 1, assetId: REVIEW_ASSET_ID },
    correction: null,
  });
  expect(state.events.size).toBe(1);
});
it('rejects stale revisions and rolls back feedback together with failed audit history', async () => {
  const { service, state, create, change } = setup();
  await service.create(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    create(),
  );
  await expect(
    service.change(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      change({ revision: 2 }),
    ),
  ).rejects.toThrow('changed');
  jest
    .mocked(recordOtogrowActivity)
    .mockRejectedValueOnce(new Error('Audit unavailable'));
  await expect(
    service.change(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, change()),
  ).rejects.toThrow('Audit unavailable');
  expect(state.feedback.get(REVIEW_COMMAND_ID)).toMatchObject({
    status: 'OPEN',
    revision: 1,
    correction: null,
  });
  expect(state.events.size).toBe(1);
});
