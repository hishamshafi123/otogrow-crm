import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type DeliveryAdvertisingSourcesService } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.service';
import { DeliveryAdvertisingWorkbenchService } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.service';
import { DeliveryAdvertisingReviewEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-review.entity';
import { DeliveryAdvertisingActionEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-action.entity';
import { DeliveryAdvertisingEventEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-event.entity';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn().mockResolvedValue(undefined),
}));

const WORKSPACE = '2bc5f2b4-9df5-43b7-b861-fc20f3237491';
const MEMBER = 'db48fe7d-c7cf-4ec4-8757-0c5b1c1e0ce8';
const MEMBERSHIP = '2c7f7258-cf51-49d3-8fdc-91af575d2be5';
const PROJECT = '001a0bd2-435d-4c15-b5ad-3a34c75d032b';
const REPORT = 'fb334c39-c574-4a4f-8d64-bdf034fa1c49';
const PACKET = '37de2a9c-aab5-4bba-8915-36026937c3be';
const REQUEST = '944ca9bf-5215-43bb-ae3b-1c83c5950523';
const workspace = {
  id: WORKSPACE,
  databaseSchema: 'test_advertising',
} as WorkspaceEntity;
const command = {
  requestId: REQUEST,
  id: PACKET,
  revision: 1,
  sourceFingerprint: 'a'.repeat(64),
};

const fixture = () => {
  const actor = {
    memberId: MEMBER,
    isAdmin: true,
    isManager: true,
    roleIds: [],
    capabilities: ['workspace.admin', 'delivery.manage'],
  };
  const source = {
    kind: 'META',
    id: REPORT,
    fingerprint: command.sourceFingerprint,
    evidenceFingerprint: 'b'.repeat(64),
    sourceRevision: null,
    legacyTaskId: null,
    title: 'Dated Meta report',
    projectId: PROJECT,
    companyId: null,
    engagementId: null,
    clientProvenance: 'CURRENT_PROJECT_AT_REVIEW',
    channel: 'META',
    accountId: '1234567890',
    currency: 'USD',
    timezone: 'Asia/Qatar',
    fromDate: '2026-10-29',
    throughDate: '2026-10-29',
    spendMicros: '0',
    sourceStatus: 'REVIEW',
    routing: {
      projectId: PROJECT,
      projectRevision: 1,
      companyId: null,
      engagementId: null,
      managerId: MEMBER,
      marketerId: MEMBERSHIP,
    },
  };
  const goal = {
    kind: 'PURCHASES',
    metricKey: null,
    metricAdId: null,
    provenance: 'REPORT',
    value: null,
    evidence: '',
    targetCostMicros: null,
    metricLabel: null,
    metricProvenance: 'UNMAPPED',
    metricReason: 'NOT_MAPPED',
    metricUnit: 'COUNT',
    currency: 'USD',
    timezone: 'Asia/Qatar',
    fromDate: source.fromDate,
    throughDate: source.throughDate,
    sourceFingerprint: source.evidenceFingerprint,
  };
  const packet = {
    id: PACKET,
    workspaceId: WORKSPACE,
    sourceKind: 'META',
    sourceId: REPORT,
    projectId: PROJECT,
    revision: 1,
    state: 'DRAFT',
    source,
    goal,
    note: 'Reviewed available evidence',
    noChangeReason: 'No changes are justified by this empty report.',
    legacyHandling: {
      mode: 'NONE',
      taskId: null,
      taskRevision: null,
      taskState: null,
      reason: '',
    },
    createdBy: MEMBER,
    createdAt: new Date('2026-10-30T06:00:00Z'),
    assignedBy: null,
    assignedAt: null,
  };
  const envelope = {
    actor,
    source,
    fingerprint: source.fingerprint,
    evidenceFingerprint: source.evidenceFingerprint,
    canManageDraft: true,
    canReview: true,
    requiresSourceApproval: true,
    reasonCodes: [],
    legacyTaskId: null,
    metrics: [],
    project: { id: PROJECT, companyId: null, revision: 1, memberIds: [] },
  };
  const reviews = {
    findOneBy: jest.fn().mockResolvedValue(packet),
    existsBy: jest.fn().mockResolvedValue(true),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const actions = {
    find: jest.fn().mockResolvedValue([]),
    findOneBy: jest.fn().mockResolvedValue(null),
    existsBy: jest.fn().mockResolvedValue(false),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const events = {
    findOneBy: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue({}),
    create: jest.fn((value: unknown) => value),
  };
  const repositories = new Map<unknown, object>([
    [DeliveryAdvertisingReviewEntity, reviews],
    [DeliveryAdvertisingActionEntity, actions],
    [DeliveryAdvertisingEventEntity, events],
  ]);
  const query = jest.fn().mockResolvedValue([]);
  const manager = {
    queryRunner: { isTransactionActive: true },
    query,
    getRepository: (entity: unknown) => {
      const repository = repositories.get(entity);
      if (!repository) throw new Error('Unexpected repository');
      return repository;
    },
  } as unknown as EntityManager;
  const sourceAdapter = {
    read: jest.fn().mockResolvedValue(envelope),
    approve: jest.fn().mockResolvedValue(envelope),
    validateGoal: jest.fn().mockReturnValue(goal),
  };
  const delivery = {
    command: jest.fn(),
    schema: jest.fn().mockReturnValue('"test_advertising"'),
    actor: jest.fn().mockResolvedValue(actor),
  };
  const access = {
    getAccess: jest
      .fn()
      .mockImplementation(async (_workspaceId: string, id: string) => ({
        memberId: id,
        roleIds: [],
        capabilities: id === MEMBER ? ['delivery.manage'] : [],
      })),
  };
  const service = new DeliveryAdvertisingWorkbenchService(
    {} as DataSource,
    delivery as unknown as DeliveryService,
    access as unknown as OtogrowAccessService,
    sourceAdapter as unknown as DeliveryAdvertisingSourcesService,
  );
  return {
    service,
    manager,
    packet,
    source,
    envelope,
    reviews,
    actions,
    events,
    sourceAdapter,
    delivery,
    query,
    access,
  };
};

const TASK = 'a485845e-2d42-4db8-932b-481b3dcba1e4';
const ACTION = 'f82f0341-4427-4a64-b4f0-c7c321228326';
const actionFixture = (adopt: boolean) => {
  const state = fixture();
  Object.assign(state.envelope.project, { memberIds: [MEMBERSHIP] });
  Object.assign(state.envelope, { legacyTaskId: TASK });
  Object.assign(state.packet, {
    noChangeReason: '',
    legacyHandling: {
      mode: adopt ? 'ADOPT' : 'ADDITIONAL_WORK',
      taskId: TASK,
      taskRevision: 8,
      taskState: 'APPROVED',
      reason: adopt
        ? ''
        : 'Create a separate test; preserve the completed campaign review.',
    },
  });
  const action = {
    id: ACTION,
    workspaceId: WORKSPACE,
    reviewId: PACKET,
    position: 0,
    definition: {
      id: ACTION,
      title: 'New reviewed concept',
      rationale: 'Test one clearer offer',
      expectedResult: 'Observe qualified responses',
      evidence: 'Use only these reviewed instructions',
      ownerId: MEMBERSHIP,
      reviewerId: MEMBER,
      dueDate: '2026-10-31',
      assistantId: null,
      adoptTaskId: adopt ? TASK : null,
    },
    ownerName: 'Marketer',
    reviewerName: 'Manager',
    taskId: null,
    assistantVersion: null,
    assistantName: null,
  };
  const native = {
    id: TASK,
    title: 'Original completed follow-up',
    revision: 8,
    state: 'APPROVED',
    ownerId: MEMBERSHIP,
    ownerName: 'Marketer',
    reviewerId: MEMBER,
    reviewerName: 'Manager',
    dueAt: '2026-10-31T08:00:00.000Z',
    submissionVersion: 2,
    submissionState: 'APPROVED',
    links: [],
  };
  state.query.mockImplementation(async (sql: string) =>
    sql.includes('SELECT task.id')
      ? [native]
      : sql.includes('SELECT id,trim(concat_ws')
        ? [
            { id: MEMBERSHIP, name: 'Marketer' },
            { id: MEMBER, name: 'Manager' },
          ]
        : [],
  );
  state.actions.find.mockResolvedValue([action]);
  state.actions.findOneBy.mockResolvedValue(action);
  state.delivery.command.mockResolvedValue(
    '822491a7-3d68-488c-9af7-24651fdbce03',
  );
  return { ...state, action, native };
};

describe('advertising packet commands', () => {
  it.each(['review', 'state', 'receipt'] as const)(
    'hides a manager draft from an approved-source staff reader through %s',
    async (method) => {
      const state = fixture();
      state.envelope.actor.isAdmin = false;
      state.envelope.actor.isManager = false;
      state.source.sourceStatus = 'APPROVED';
      state.events.findOneBy.mockResolvedValue({
        id: REQUEST,
        reviewId: PACKET,
        actorId: MEMBER,
      });
      await expect(
        state.service[method](
          workspace,
          MEMBER,
          MEMBERSHIP,
          method === 'receipt' ? { requestId: REQUEST } : { id: PACKET },
          state.manager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(state.actions.find).not.toHaveBeenCalled();
      expect(state.events.insert).not.toHaveBeenCalled();
    },
  );
  beforeEach(() => jest.clearAllMocks());

  it('records an explicit no-change review without making a generic or native task', async () => {
    const state = fixture();
    const result = await state.service.assign(
      workspace,
      MEMBER,
      MEMBERSHIP,
      command,
      state.manager,
    );
    expect(result.receipt.action).toBe('ASSIGNED');
    expect(result.receipt.actionTasks).toEqual([]);
    expect(result.receipt.revision).toBe(2);
    expect(state.sourceAdapter.approve).toHaveBeenCalledTimes(1);
    expect(state.delivery.command).not.toHaveBeenCalled();
    expect(state.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock(');
    expect(state.events.insert).toHaveBeenCalledTimes(1);
  });

  it('returns the original immutable receipt on exact retry without another source review or task', async () => {
    const state = fixture();
    state.packet.state = 'ASSIGNED';
    state.packet.revision = 2;
    state.events.findOneBy.mockResolvedValue({
      id: REQUEST,
      workspaceId: WORKSPACE,
      reviewId: PACKET,
      actorId: MEMBER,
      action: 'ASSIGNED',
      inputHash: advertisingHash(command),
      createdAt: new Date(),
      result: {
        reviewId: PACKET,
        revision: 2,
        state: 'ASSIGNED',
        actionTasks: [],
        observationId: null,
      },
    });
    const result = await state.service.assign(
      workspace,
      MEMBER,
      MEMBERSHIP,
      command,
      state.manager,
    );
    expect(result.receipt.requestId).toBe(REQUEST);
    expect(state.sourceAdapter.approve).not.toHaveBeenCalled();
    expect(state.delivery.command).not.toHaveBeenCalled();
    expect(state.events.insert).not.toHaveBeenCalled();
  });

  it('checks current review authority before replaying an old successful command', async () => {
    const state = fixture();
    state.envelope.canReview = false;
    await expect(
      state.service.assign(
        workspace,
        MEMBER,
        MEMBERSHIP,
        command,
        state.manager,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(state.events.findOneBy).not.toHaveBeenCalled();
    expect(state.sourceAdapter.approve).not.toHaveBeenCalled();
  });

  it('rejects stale source or packet revision before any review or assignment', async () => {
    const state = fixture();
    await expect(
      state.service.assign(
        workspace,
        MEMBER,
        MEMBERSHIP,
        { ...command, revision: 2 },
        state.manager,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      state.service.assign(
        workspace,
        MEMBER,
        MEMBERSHIP,
        { ...command, sourceFingerprint: 'c'.repeat(64) },
        state.manager,
      ),
    ).rejects.toThrow(ConflictException);
    expect(state.sourceAdapter.approve).not.toHaveBeenCalled();
    expect(state.events.insert).not.toHaveBeenCalled();
  });

  it('does not reuse an existing request identity for a changed body', async () => {
    const state = fixture();
    state.events.findOneBy.mockResolvedValue({
      actorId: MEMBER,
      action: 'ASSIGNED',
      inputHash: advertisingHash({ ...command, revision: 9 }),
    });
    await expect(
      state.service.assign(
        workspace,
        MEMBER,
        MEMBERSHIP,
        command,
        state.manager,
      ),
    ).rejects.toThrow(ConflictException);
    expect(state.sourceAdapter.approve).not.toHaveBeenCalled();
  });

  it('propagates an audit failure so the caller transaction cannot accept a partial assignment', async () => {
    const state = fixture();
    jest
      .mocked(recordOtogrowActivity)
      .mockRejectedValueOnce(new Error('Synthetic audit rejection'));
    await expect(
      state.service.assign(
        workspace,
        MEMBER,
        MEMBERSHIP,
        command,
        state.manager,
      ),
    ).rejects.toThrow('Synthetic audit rejection');
    expect(state.delivery.command).not.toHaveBeenCalled();
  });

  it('links an explicitly adopted task without overwriting its original approved scope or progress', async () => {
    const state = actionFixture(true);
    const original = structuredClone(state.native);
    const result = await state.service.assign(
      workspace,
      MEMBER,
      MEMBERSHIP,
      command,
      state.manager,
    );
    expect(result.receipt.actionTasks).toEqual([
      { actionId: ACTION, taskId: TASK },
    ]);
    expect(state.native).toEqual(original);
    expect(state.delivery.command).not.toHaveBeenCalled();
  });

  it('creates additional reviewed work while preserving the acknowledged legacy task', async () => {
    const state = actionFixture(false);
    const original = structuredClone(state.native);
    const result = await state.service.assign(
      workspace,
      MEMBER,
      MEMBERSHIP,
      command,
      state.manager,
    );
    expect(result.receipt.actionTasks[0].taskId).not.toBe(TASK);
    expect(state.native).toEqual(original);
    expect(state.delivery.command).toHaveBeenCalledTimes(1);
    const payload = state.delivery.command.mock.calls[0][3];
    expect(payload.fields.brief).toContain(
      'Use only these reviewed instructions',
    );
    expect(payload.fields.brief).not.toContain(REPORT);
    expect(payload.fields.brief).not.toContain('Dated Meta report');
  });

  it('never creates downstream work when independent report review rejects the source', async () => {
    const state = actionFixture(false);
    state.sourceAdapter.approve.mockRejectedValueOnce(
      new ForbiddenException('Separate source reviewer required'),
    );
    await expect(
      state.service.assign(
        workspace,
        MEMBER,
        MEMBERSHIP,
        command,
        state.manager,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(state.delivery.command).not.toHaveBeenCalled();
    expect(state.events.insert).not.toHaveBeenCalled();
  });

  it('rejects self-review even when a stale draft contains a formerly independent assignment', async () => {
    const state = actionFixture(false);
    state.action.definition.reviewerId = MEMBERSHIP;
    await expect(
      state.service.assign(
        workspace,
        MEMBER,
        MEMBERSHIP,
        command,
        state.manager,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(state.sourceAdapter.approve).not.toHaveBeenCalled();
    expect(state.delivery.command).not.toHaveBeenCalled();
  });

  it('does not let an unrelated source reader append observations to another person’s action', async () => {
    const state = actionFixture(false);
    state.packet.state = 'ASSIGNED';
    Object.assign(state.action, { taskId: TASK });
    state.envelope.actor.isAdmin = false;
    state.envelope.actor.isManager = false;
    state.native.ownerId = PROJECT;
    state.native.reviewerId = MEMBERSHIP;
    await expect(
      state.service.observe(
        workspace,
        MEMBER,
        MEMBERSHIP,
        {
          requestId: REQUEST,
          id: ACTION,
          reviewId: PACKET,
          actionId: ACTION,
          correctsId: null,
          assessment: 'INCONCLUSIVE',
          sourceKind: null,
          sourceId: null,
          sourceFingerprint: null,
          metricKey: null,
          metricAdId: null,
          value: null,
          fromDate: '2026-10-30',
          throughDate: '2026-10-30',
          evidence: 'Unverified note',
          note: 'Not yet measured',
        },
        state.manager,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(state.events.insert).not.toHaveBeenCalled();
  });
});
