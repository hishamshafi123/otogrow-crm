const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  originalDigest,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const {
  seedCurrentWorkFixture,
  syntheticCurrentWork,
} = require('./check-otogrow-activity-current-work-support.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryNativeTaskAccessService,
} = require('../dist/modules/delivery/delivery-native-task-access.service');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryReviewsService,
} = require('../dist/modules/delivery/reviews/delivery-reviews.service');
const {
  DeliveryReviewAssignmentEventEntity,
} = require('../dist/modules/delivery/reviews/entities/delivery-review-assignment-event.entity');

async function main() {
  assert.equal(process.argv.length, 2, 'No persistent or live mode exists.');
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'This rollback proof is local only.',
  );
  let runner, original, schema;
  const checks = [];
  try {
    await connectionSource.initialize();
    original = await originalDigest((...args) =>
      connectionSource.query(...args),
    );
    schema = await schemaFingerprint(connectionSource);
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const manager = runner.manager;
    const fixture = await createFixture(manager, 'native_reviews_rollback');
    await seedCurrentWorkFixture(manager, fixture);
    await manager.query(
      `ALTER TABLE "${fixture.schemaName}".task ADD COLUMN status text NOT NULL DEFAULT 'TODO', ADD COLUMN "createdAt" timestamptz NOT NULL DEFAULT now(), ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT now()`,
    );
    await manager.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, ['delivery.manage']],
    );
    const admin = fixture.people.admin;
    const reader = fixture.people.reader;
    const backup = fixture.people.secondWriter;
    const writer = fixture.people.writer;
    const visible = fixture.currentTasks.staleBackup;
    const second = fixture.currentTasks.activeBackup;
    const hidden = fixture.currentTasks.hidden;
    const now = new Date('2026-11-05T08:00:00.000Z');
    const submission = (version) => ({
      version,
      submittedAt: `2020-02-21T${version === 1 ? '10' : '11'}:00:00.000Z`,
      submittedBy: writer.memberId,
      summary: 'FIXTURE exact review submission',
      evidence: [],
    });
    for (const [key, taskId] of Object.entries(fixture.currentTasks)) {
      await manager.query(
        'UPDATE core."deliveryTask" SET details=$2 WHERE "workspaceId"=$3 AND "taskId"=$1',
        [
          taskId,
          {
            brief: `FIXTURE ${key} private review brief`,
            service: key === 'hidden' ? 'PRIVATE_HIDDEN_SERVICE' : 'Design',
            priority: 'NORMAL',
            scheduledDate: null,
            reviewerId:
              key === 'hidden'
                ? fixture.people.outsider.memberId
                : reader.memberId,
            state: [visible, second, hidden].includes(taskId)
              ? 'IN_REVIEW'
              : 'PLANNED',
            blocker: '',
            checklist: [],
            evidence: [],
            submissions: [submission(1), submission(2)],
            events: [],
          },
          fixture.workspaceId,
        ],
      );
    }
    const source = {
      manager,
      query: (...args) => manager.query(...args),
      getRepository: (entity) => manager.getRepository(entity),
      transaction: (operation) => manager.transaction(operation),
    };
    const access = new OtogrowAccessService(source, {
      userHasWorkspaceSettingPermission: async ({
        workspaceId,
        userWorkspaceId,
      }) =>
        workspaceId === fixture.workspaceId &&
        userWorkspaceId === admin.userWorkspaceId,
    });
    const native = syntheticCurrentWork(access, fixture);
    const metadata = native.native;
    for (const [name, type] of [
      ['status', 'TEXT'],
      ['createdAt', 'DATE_TIME'],
    ]) {
      const id = randomUUID();
      metadata.taskFields.push({
        ...metadata.taskFields[1],
        id,
        universalIdentifier: id,
        name,
        type,
      });
      metadata.taskObject.fieldIds.push(id);
      metadata.taskObject.fieldUniversalIdentifiers.push(id);
    }
    metadata.data.flatFieldMetadataMaps = metadata.maps([
      ...metadata.taskFields,
      ...metadata.memberFields,
    ]);
    const permission = (roleId = fixture.nativeRoleId) =>
      metadata.data.rolesPermissions[roleId][metadata.taskObject.id];
    permission().canUpdateObjectRecords = true;
    const adapter = new DeliveryNativeTaskAccessService(
      native.workspaceOrm,
      native.cache,
    );
    const delivery = new DeliveryService(source, access, adapter);
    const reviews = new DeliveryReviewsService(
      source,
      delivery,
      access,
      adapter,
    );
    const call = (method, input, person = admin) =>
      reviews[method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
        now,
      );
    const assignment = (overrides = {}) => ({
      commandId: randomUUID(),
      taskId: visible,
      taskRevision: 1,
      submissionVersion: 2,
      assignmentRevision: 0,
      mode: 'BACKUP',
      reviewerId: backup.memberId,
      reason: 'FIXTURE independent backup',
      ...overrides,
    });
    const decide = (person, overrides = {}) =>
      delivery.command(
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        {
          action: 'review',
          taskId: visible,
          revision: 1,
          selectedSubmissionVersion: 2,
          reviewAssignmentRevision: 0,
          decision: 'APPROVED',
          feedback: 'FIXTURE checked exact submission',
          ...overrides,
        },
      );
    const mutationDigest = async () => {
      const result = [];
      for (const table of [
        'deliveryTask',
        'deliveryReviewAssignment',
        'deliveryReviewAssignmentEvent',
        'deliveryOperations',
        'deliveryReminderOutbox',
        'otogrowActivityEvent',
        'deliveryRevision',
      ]) {
        const [row] = await manager.query(
          `SELECT count(*)::text AS count,md5(COALESCE(string_agg(md5(to_jsonb(record)::text),'' ORDER BY md5(to_jsonb(record)::text)),'')) AS hash FROM core."${table}" record WHERE "workspaceId"=$1`,
          [fixture.workspaceId],
        );
        result.push({ table, ...row });
      }
      const [nativeTasks] = await manager.query(
        `SELECT md5(COALESCE(string_agg(md5(to_jsonb(record)::text),'' ORDER BY id),'')) AS hash FROM "${fixture.schemaName}".task record`,
      );
      return JSON.stringify([...result, nativeTasks]);
    };
    const deniedUnchanged = async (
      operation,
      pattern = /task|native|access|permission|review|unavailable|first page/i,
    ) => {
      const before = await mutationDigest();
      await assert.rejects(operation, pattern);
      assert.equal(
        await mutationDigest(),
        before,
        'Denied action changed tasks, review assignment/events, notices, outbox, revision or activity rows.',
      );
    };
    const check = async (name, operation) => {
      await manager.query('SAVEPOINT native_reviews_case');
      const originalData = structuredClone(metadata.data);
      try {
        await operation();
        checks.push(name);
      } finally {
        await manager.query('ROLLBACK TO SAVEPOINT native_reviews_case');
        await manager.query('RELEASE SAVEPOINT native_reviews_case');
        for (const key of Object.keys(metadata.data))
          metadata.data[key] = originalData[key];
        native.state.changingHash = false;
      }
    };
    const candidateRole = async (
      person,
      overrides = {},
      predicateValue = 'Visible',
    ) => {
      const roleId = randomUUID();
      await manager.query(
        'INSERT INTO core.role (id,"workspaceId",label,"universalIdentifier","applicationId") VALUES ($1,$2,$3,$1,$4)',
        [
          roleId,
          fixture.workspaceId,
          'FIXTURE candidate native role',
          fixture.workspace.workspaceCustomApplicationId,
        ],
      );
      await manager.query(
        'UPDATE core."roleTarget" SET "roleId"=$3 WHERE "workspaceId"=$1 AND "userWorkspaceId"=$2',
        [fixture.workspaceId, person.userWorkspaceId, roleId],
      );
      metadata.data.userWorkspaceRoleMap[person.userWorkspaceId] = roleId;
      metadata.data.rolesPermissions[roleId] = {
        [metadata.taskObject.id]: {
          ...structuredClone(permission()),
          ...overrides,
        },
      };
      const predicateId = randomUUID();
      const predicate = {
        ...structuredClone(metadata.predicate),
        id: predicateId,
        universalIdentifier: predicateId,
        roleId,
        roleUniversalIdentifier: roleId,
        value: predicateValue,
      };
      const predicates = Object.values(
        metadata.data.flatRowLevelPermissionPredicateMaps.byUniversalIdentifier,
      ).filter(Boolean);
      metadata.data.flatRowLevelPermissionPredicateMaps = metadata.maps([
        ...predicates,
        predicate,
      ]);
      return roleId;
    };
    const receipt = (saved) => ({
      taskId: visible,
      taskRevision: 1,
      submissionVersion: 2,
      assignmentRevision: saved.assignment.revision,
      noticeId: saved.taskReview.assignmentNotice.id,
    });

    await check(
      'Native rows filter queue totals, reviewer facets and both pages',
      async () => {
        const first = await call('queue', {
          projectId: fixture.projects.first,
          limit: 1,
        });
        assert.equal(first.totalCount, 2);
        assert.equal(first.unknownAgeCount, 0);
        assert.equal(first.unavailableReviewerCount, 0);
        assert(first.nextCursor);
        const next = await call('queue', {
          projectId: fixture.projects.first,
          limit: 1,
          after: first.nextCursor,
        });
        assert.equal(next.nextCursor, null);
        assert.deepEqual(
          new Set([...first.items, ...next.items].map(({ taskId }) => taskId)),
          new Set([visible, second]),
        );
        assert.deepEqual(
          new Set(first.reviewers.map(({ id }) => id)),
          new Set([reader.memberId, backup.memberId]),
        );
        assert(!JSON.stringify(first).includes('PRIVATE_'));
      },
    );
    await check(
      'More than 2,000 hidden reviews do not consume the complete source limit',
      async () => {
        await manager.query(
          `WITH inserted AS (INSERT INTO "${fixture.schemaName}".task(id,title,"assigneeId","dueAt") SELECT gen_random_uuid(),'PRIVATE_HIDDEN_LIMIT_'||index,$1::uuid,now() FROM generate_series(1,2001) index RETURNING id) INSERT INTO core."deliveryTask"("workspaceId","taskId","projectId",details,revision) SELECT $2,id,$3,jsonb_build_object('state','IN_REVIEW','service','PRIVATE_LIMIT_SERVICE','reviewerId',$4::text,'submissions',jsonb_build_array(jsonb_build_object('version',1,'submittedAt','2020-02-21T10:00:00.000Z'))),1 FROM inserted`,
          [
            writer.memberId,
            fixture.workspaceId,
            fixture.projects.first,
            fixture.people.outsider.memberId,
          ],
        );
        const result = await call('queue', {
          projectId: fixture.projects.first,
        });
        assert.equal(result.totalCount, 2);
        assert.equal(result.items.length, 2);
        assert(!JSON.stringify(result).includes('PRIVATE_'));
        assert(
          !result.reviewers.some(
            ({ id }) => id === fixture.people.outsider.memberId,
          ),
        );
      },
    );
    await check(
      'Known hidden and deleted task IDs cannot reveal details or history or create assignments',
      async () => {
        for (const taskId of [hidden, fixture.currentTasks.deleted]) {
          await deniedUnchanged(() => call('task', { taskId }));
          await deniedUnchanged(() =>
            call('history', { taskId, submissionVersion: 2 }),
          );
          await deniedUnchanged(() => call('assign', assignment({ taskId })));
        }
      },
    );
    await check(
      'Native object denial stops queue, detail, history and assignment before mutations',
      async () => {
        permission().canReadObjectRecords = false;
        for (const [method, input] of [
          ['queue', {}],
          ['task', { taskId: visible }],
          ['history', { taskId: visible, submissionVersion: 2 }],
          ['assign', assignment()],
        ])
          await deniedUnchanged(() => call(method, input));
      },
    );
    await check(
      'Required native title and assignee field denials cannot leak review data',
      async () => {
        for (const name of ['title', 'assigneeId']) {
          const fieldId = metadata.taskFields.find(
            (field) => field.name === name,
          ).id;
          permission().restrictedFields[fieldId] = {
            canRead: false,
            canUpdate: false,
          };
          for (const [method, input] of [
            ['queue', {}],
            ['task', { taskId: visible }],
            ['history', { taskId: visible, submissionVersion: 2 }],
          ])
            await deniedUnchanged(() => call(method, input));
          delete permission().restrictedFields[fieldId];
        }
      },
    );
    await check(
      'Queue cursor changes when policy changes even if the same rows still match',
      async () => {
        const first = await call('queue', { limit: 1 });
        assert(first.nextCursor);
        metadata.data.flatRowLevelPermissionPredicateMaps.byUniversalIdentifier[
          metadata.predicate.universalIdentifier
        ].value = 'Visible FIXTURE';
        await deniedUnchanged(
          () => call('queue', { limit: 1, after: first.nextCursor }),
          /changed|first page/i,
        );
      },
    );
    await check(
      'Caller identity cannot borrow another current userWorkspace',
      async () => {
        const mismatched = {
          ...admin,
          userWorkspaceId: reader.userWorkspaceId,
        };
        await deniedUnchanged(
          () => call('task', { taskId: visible }, mismatched),
          /identity.*changed/i,
        );
        await deniedUnchanged(
          () => call('assign', assignment(), mismatched),
          /identity.*changed/i,
        );
      },
    );
    await check('Current native cache disagreement fails closed', async () => {
      native.state.changingHash = true;
      native.state.hashReads = 0;
      await deniedUnchanged(() => call('queue', {}), /changed|permission/i);
    });
    await check(
      'Successful exact assignment replays once and revoked read cannot recover its receipt',
      async () => {
        const input = assignment();
        const saved = await call('assign', input);
        assert.equal(saved.replayed, false);
        const before = await mutationDigest();
        const replay = await call('assign', input);
        assert.equal(replay.replayed, true);
        assert.equal(replay.assignment.id, saved.assignment.id);
        assert.equal(await mutationDigest(), before);
        await deniedUnchanged(
          () => call('assign', { ...input, reason: 'Different body' }),
          /another request|used/i,
        );
        permission().canReadObjectRecords = false;
        await deniedUnchanged(() => call('assign', input));
        await deniedUnchanged(() =>
          call('history', { taskId: visible, submissionVersion: 2 }),
        );
      },
    );
    await check(
      'History cursor is permission-bound and cannot accept an old raw event ID',
      async () => {
        await call('assign', assignment());
        const repository = manager.getRepository(
          DeliveryReviewAssignmentEventEntity,
        );
        const firstEvent = await repository.findOneByOrFail({
          workspaceId: fixture.workspaceId,
          taskId: visible,
        });
        await repository.save(
          Array.from({ length: 25 }, (_, index) => ({
            ...firstEvent,
            id: randomUUID(),
            commandId: randomUUID(),
            revision: index + 2,
            createdAt: new Date(now.getTime() + index + 1),
          })),
        );
        const first = await call('history', {
          taskId: visible,
          submissionVersion: 2,
        });
        assert.equal(first.events.length, 25);
        assert(first.nextBeforeId);
        const next = await call('history', {
          taskId: visible,
          submissionVersion: 2,
          beforeId: first.nextBeforeId,
        });
        assert.equal(next.events.length, 1);
        assert.equal(next.nextBeforeId, null);
        await deniedUnchanged(
          () =>
            call('history', {
              taskId: visible,
              submissionVersion: 2,
              beforeId: firstEvent.id,
            }),
          /cursor|first page/i,
        );
        metadata.data.flatRowLevelPermissionPredicateMaps.byUniversalIdentifier[
          metadata.predicate.universalIdentifier
        ].value = 'Visible FIXTURE';
        await deniedUnchanged(
          () =>
            call('history', {
              taskId: visible,
              submissionVersion: 2,
              beforeId: first.nextBeforeId,
            }),
          /changed|first page|cursor/i,
        );
      },
    );
    for (const restriction of ['OBJECT', 'ROW', 'UPDATE']) {
      await check(
        `Backup eligibility uses candidate's own userWorkspace for ${restriction.toLowerCase()} restrictions`,
        async () => {
          await candidateRole(
            backup,
            restriction === 'OBJECT'
              ? { canReadObjectRecords: false }
              : restriction === 'UPDATE'
                ? { canUpdateObjectRecords: false }
                : {},
            restriction === 'ROW' ? 'PRIVATE_CANDIDATE_ONLY' : 'Visible',
          );
          const detail = await call('task', { taskId: visible });
          assert(
            !detail.eligibleReviewers.some(({ id }) => id === backup.memberId),
          );
          await deniedUnchanged(() => call('assign', assignment()));
          const active = await call('task', { taskId: second });
          assert.equal(active.pending.reviewerState, 'UNAVAILABLE');
          assert.equal(active.pending.canReviewSubmission, false);
        },
      );
    }
    await check(
      'Read-only manager may assign a different capable reviewer without native status mutation',
      async () => {
        await candidateRole(backup, { canUpdateObjectRecords: true });
        permission().canUpdateObjectRecords = false;
        const saved = await call('assign', assignment());
        assert.equal(saved.replayed, false);
        assert.equal(saved.assignment.reviewerId, backup.memberId);
        assert.equal(
          (await call('history', { taskId: visible, submissionVersion: 2 }))
            .events.length,
          1,
        );
        const [task] = await manager.query(
          `SELECT status FROM "${fixture.schemaName}".task WHERE id=$1`,
          [visible],
        );
        assert.equal(task.status, 'TODO');
      },
    );
    await check(
      'Assigned reviewer losing update stays readable but cannot review; read receipts stay independent',
      async () => {
        const candidate = await candidateRole(backup, {
          canUpdateObjectRecords: true,
        });
        const saved = await call('assign', assignment());
        assert(saved.taskReview.assignmentNotice);
        permission(candidate).canUpdateObjectRecords = false;
        const detail = await call('task', { taskId: visible }, backup);
        assert.equal(detail.canReviewSubmission, false);
        assert.equal(detail.canApprove, false);
        assert.equal(detail.pending.reviewerState, 'UNAVAILABLE');
        assert.equal(
          (
            await call(
              'history',
              { taskId: visible, submissionVersion: 2 },
              backup,
            )
          ).events.length,
          1,
        );
        await deniedUnchanged(() =>
          decide(backup, { reviewAssignmentRevision: 1 }),
        );
        await call('seen', receipt(saved), backup);
        await call('acknowledge', receipt(saved), backup);
      },
    );
    await check(
      'Revoked read prevents seen and acknowledgement writes for an otherwise valid exact notice',
      async () => {
        const candidate = await candidateRole(backup);
        const saved = await call('assign', assignment());
        assert(saved.taskReview.assignmentNotice);
        permission(candidate).canReadObjectRecords = false;
        await deniedUnchanged(() => call('seen', receipt(saved), backup));
        await deniedUnchanged(() =>
          call('acknowledge', receipt(saved), backup),
        );
      },
    );
    await check(
      'Native status field denial is different from read visibility',
      async () => {
        const fieldId = metadata.taskFields.find(
          ({ name }) => name === 'status',
        ).id;
        permission().restrictedFields[fieldId] = {
          canRead: true,
          canUpdate: false,
        };
        const detail = await call('task', { taskId: visible }, reader);
        assert.equal(detail.canApprove, false);
        assert.equal(detail.canReviewSubmission, false);
        await deniedUnchanged(() => decide(reader));
      },
    );
    await check(
      'Independent final review still rejects the task author and accepts the capable assigned reviewer',
      async () => {
        await manager.query(
          'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
          [fixture.roles.writer, ['delivery.manage']],
        );
        await deniedUnchanged(
          () => call('assign', assignment({ reviewerId: writer.memberId })),
          /independent|reviewer/i,
        );
        await deniedUnchanged(() => decide(writer), /review|approv/i);
        const result = await call('task', { taskId: visible }, reader);
        assert.equal(result.canApprove, true);
        await decide(reader);
        const [task] = await manager.query(
          'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
          [fixture.workspaceId, visible],
        );
        assert.equal(task.details.state, 'APPROVED');
        assert.equal(
          task.details.submissions.at(-1).reviewedBy,
          reader.memberId,
        );
      },
    );
    await runner.rollbackTransaction();
  } finally {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
    try {
      if (connectionSource.isInitialized && original)
        assert.equal(
          await originalDigest((...args) => connectionSource.query(...args)),
          original,
          'Original database rows changed.',
        );
      if (connectionSource.isInitialized && schema)
        assert.equal(
          await schemaFingerprint(connectionSource),
          schema,
          'Original schema changed.',
        );
    } finally {
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  }
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks: checks.length,
        evidence: checks,
        preservation:
          'Actual Review/Delivery/Access services, native permission engine and PostgreSQL with isolated metadata cache. Every fixture row and schema change rolled back; originals preserved. No provider, message, shared-cache or external request. One serialized connection; no cross-session race claim.',
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
