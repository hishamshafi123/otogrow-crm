// Fixtures, business changes and their audit rows roll back together.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  OtogrowActivityService,
} = require('../dist/modules/otogrow-activity/otogrow-activity.service');
const {
  recordOtogrowActivity,
} = require('../dist/modules/otogrow-activity/record-otogrow-activity');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryProjectEntity,
} = require('../dist/modules/delivery/entities/delivery-project.entity');

const SECRET_MARKER = 'activity-regression-secret-never-copy';
const START = '2026-10-25T00:00:00.000Z';
const MIDDLE = '2026-10-25T01:00:00.000Z';
const END = '2026-10-25T02:00:00.000Z';

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const [existing] = await runner.query(
      `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(existing, 'An initialized development workspace is required');
    const createWorkspace = async () => {
      const id = randomUUID();
      const databaseSchema = `activity_fixture_${id.replaceAll('-', '_')}`;
      await runner.query(`CREATE SCHEMA "${databaseSchema}"`);
      await runner.query(
        `CREATE TABLE "${databaseSchema}"."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"userEmail" text,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
      );
      await runner.query(
        `CREATE TABLE "${databaseSchema}".company (id uuid PRIMARY KEY,name text,"deletedAt" timestamptz)`,
      );
      await runner.query(
        `CREATE TABLE "${databaseSchema}".task (id uuid PRIMARY KEY,title text,"assigneeId" uuid,"dueAt" timestamptz,status text,"deletedAt" timestamptz,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now())`,
      );
      const [workspace] = await runner.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,'Activity regression',$2,$3,'ACTIVE',$4,$5) RETURNING *`,
        [
          id,
          `activity-fixture-${id}`,
          databaseSchema,
          existing.workspaceCustomApplicationId,
          existing.defaultRoleId,
        ],
      );
      return workspace;
    };
    const createMember = async (workspace, name) => {
      const memberId = randomUUID(),
        userId = randomUUID(),
        userWorkspaceId = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        userId,
        `${userId}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [userWorkspaceId, userId, workspace.id],
      );
      await runner.query(
        `INSERT INTO "${workspace.databaseSchema}"."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,$4,'')`,
        [memberId, userId, `${userId}@example.invalid`, name],
      );
      return { memberId, userId, userWorkspaceId, name };
    };
    const workspace = await createWorkspace(),
      otherWorkspace = await createWorkspace();
    const founder = await createMember(workspace, 'Founder fixture');
    const editor = await createMember(workspace, 'Editor fixture');
    const secondary = await createMember(workspace, 'Secondary fixture');
    const outsider = await createMember(otherWorkspace, 'Foreign fixture');
    const nativeAdministrators = new Set([
      founder.userWorkspaceId,
      outsider.userWorkspaceId,
    ]);
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const access = new OtogrowAccessService(scoped, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        nativeAdministrators.has(userWorkspaceId),
    });
    const activity = new OtogrowActivityService(scoped, access);
    const delivery = new DeliveryService(scoped, access);
    const feed = (input = {}, member = founder, targetWorkspace = workspace) =>
      activity.feed(
        targetWorkspace,
        member.memberId,
        member.userWorkspaceId,
        input,
      );
    const rows = (targetWorkspace = workspace) =>
      runner.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 ORDER BY id',
        [targetWorkspace.id],
      );
    const deny = async (operation, status = 403) => {
      const before = await rows();
      await assert.rejects(
        operation,
        (error) => error.getStatus?.() === status,
      );
      assert.deepEqual(await rows(), before);
    };
    const projectRepository = runner.manager.getRepository(
      DeliveryProjectEntity,
    );
    const clientId = randomUUID(),
      otherClientId = randomUUID();
    await runner.query(
      `INSERT INTO "${workspace.databaseSchema}".company (id,name) VALUES ($1,'Client snapshot')`,
      [clientId],
    );
    await runner.query(
      `INSERT INTO "${otherWorkspace.databaseSchema}".company (id,name) VALUES ($1,'Foreign client')`,
      [otherClientId],
    );
    const project = await projectRepository.save({
      workspaceId: workspace.id,
      name: 'Project snapshot',
      companyId: clientId,
      memberIds: [editor.memberId],
    });
    const foreignProject = await projectRepository.save({
      workspaceId: otherWorkspace.id,
      name: 'Foreign project',
      companyId: otherClientId,
      memberIds: [outsider.memberId],
    });
    const empty = await feed();
    assert.deepEqual(empty.events, []);
    assert.deepEqual(empty.people, []);
    assert.equal(empty.nextCursor, null);
    assert.equal(empty.coverageStartedAt, null);
    const append = async (overrides = {}) => {
      const sourceId = randomUUID();
      await recordOtogrowActivity(runner.manager, {
        workspaceId: workspace.id,
        actorId: founder.memberId,
        category: 'DELIVERY',
        action: 'TASK_PROGRESS',
        outcome: 'RECORDED',
        summary: 'Updated task progress',
        sourceType: 'task',
        sourceId,
        projectId: project.id,
        taskId: sourceId,
        occurredAt: new Date(MIDDLE),
        changes: [{ field: 'state', before: 'PLANNED', after: 'IN_PROGRESS' }],
        ...overrides,
      });
      return (
        await rows(
          overrides.workspaceId === otherWorkspace.id
            ? otherWorkspace
            : workspace,
        )
      ).find((event) => event.sourceId === sourceId);
    };
    const first = await append({
      occurredAt: new Date(START),
      actorId: editor.memberId,
    });
    const middle = await append({
      subjectMemberId: editor.memberId,
      action: 'TASK_REVIEWED',
      outcome: 'APPROVED',
      changes: [
        {
          field: 'assigneeId',
          before: founder.memberId,
          after: editor.memberId,
        },
      ],
    });
    const sameOne = await append({
      actorId: editor.memberId,
      actorType: 'AGENT',
      category: 'AGENT',
      action: 'AGENT_SUCCEEDED',
      outcome: 'SUCCEEDED',
      sourceType: 'agent-run',
      projectId: null,
    });
    const sameTwo = await append({
      actorId: null,
      actorType: 'SYSTEM',
      summary: 'Scheduled recurring task',
      action: 'TASK_CREATED',
    });
    const last = await append({ occurredAt: new Date(END) });
    const foreign = await append({
      workspaceId: otherWorkspace.id,
      actorId: outsider.memberId,
      projectId: foreignProject.id,
    });
    assert(first && middle && sameOne && sameTwo && last && foreign);
    assert.deepEqual(middle.changes, [
      { field: 'assigneeId', before: founder.name, after: editor.name },
    ]);
    const initialRows = await rows();
    let page = await feed({ limit: 2 });
    assert.equal(page.workspaceId, workspace.id);
    assert.equal(page.memberId, founder.memberId);
    assert.equal(page.userWorkspaceId, founder.userWorkspaceId);
    assert(page.nextCursor);
    assert.equal(page.events[0].id, last.id);
    assert(!page.events.some((event) => event.id === foreign.id));
    assert(!page.people.some((person) => person.id === outsider.memberId));
    assert(!page.projects.some((option) => option.id === foreignProject.id));
    assert(!page.clients.some((option) => option.id === otherClientId));
    const firstCursor = page.nextCursor;
    const newEvent = await append({
      occurredAt: new Date('2026-10-25T03:00:00.000Z'),
    });
    const visited = [...page.events];
    while (page.nextCursor) {
      page = await feed({ cursor: page.nextCursor, limit: 2 });
      visited.push(...page.events);
    }
    assert.equal(
      new Set(visited.map((event) => event.id)).size,
      initialRows.length,
    );
    assert.deepEqual(
      visited.map((event) => event.id),
      initialRows
        .sort(
          (left, right) =>
            right.occurredAt - left.occurredAt ||
            right.id.localeCompare(left.id),
        )
        .map((event) => event.id),
    );
    assert(!visited.some((event) => event.id === newEvent.id));
    assert.equal((await feed({ limit: 1 })).events[0].id, newEvent.id);
    const current = await feed({ limit: 100 });
    assert.equal(
      current.coverageStartedAt,
      [...(await rows())]
        .sort((left, right) => left.recordedAt - right.recordedAt)[0]
        .recordedAt.toISOString(),
    );
    const selectedPerson = await feed({ personId: editor.memberId });
    assert.deepEqual(
      selectedPerson.events.map((event) => event.id).sort(),
      [first.id, middle.id, sameOne.id].sort(),
    );
    assert.deepEqual(
      (await feed({ category: 'AGENT' })).events.map((event) => event.id),
      [sameOne.id],
    );
    assert.deepEqual(
      (await feed({ action: 'TASK_REVIEWED', outcome: 'APPROVED' })).events.map(
        (event) => event.id,
      ),
      [middle.id],
    );
    assert.deepEqual(
      (await feed({ projectId: project.id })).events
        .map((event) => event.id)
        .sort(),
      (await rows())
        .filter((event) => event.projectId === project.id)
        .map((event) => event.id)
        .sort(),
    );
    assert(
      (await feed({ clientId })).events.every(
        (event) => event.clientId === clientId,
      ),
    );
    assert.deepEqual((await feed({ clientId: otherClientId })).events, []);
    assert.deepEqual((await feed({ projectId: foreignProject.id })).events, []);
    assert.deepEqual((await feed({ personId: outsider.memberId })).events, []);
    const bounded = await feed({ from: START, through: END });
    assert(bounded.events.some((event) => event.id === first.id));
    assert(!bounded.events.some((event) => event.id === last.id));
    assert.equal(bounded.events.length, 4);
    assert.deepEqual(
      (await feed({ from: END })).events.map((event) => event.id),
      [newEvent.id, last.id],
    );
    await deny(() => feed({}, editor));
    await deny(() => feed({}, outsider));
    await deny(() =>
      activity.feed(workspace, founder.memberId, editor.userWorkspaceId, {}),
    );
    await deny(() => feed({}, founder, otherWorkspace));
    await deny(
      () => feed({ cursor: firstCursor }, outsider, otherWorkspace),
      400,
    );
    await deny(
      () => feed({ cursor: firstCursor, personId: editor.memberId }),
      400,
    );
    for (const input of [
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { personId: 'invalid' },
      { projectId: 'invalid' },
      { clientId: 'invalid' },
      { category: 'SECRET' },
      { outcome: 'UNKNOWN' },
      { action: 'select *' },
      { from: 'yesterday' },
      { from: END, through: START },
      { from: '2026-10-25T01:00:00Z', through: MIDDLE },
      { cursor: 'not-json' },
      { cursor: '' },
      { unexpected: true },
    ]) {
      await deny(() => feed(input), 400);
    }
    const decodedCursor = JSON.parse(
      Buffer.from(firstCursor, 'base64url').toString(),
    );
    for (const invalidCursor of [
      { ...decodedCursor, version: 1 },
      { ...decodedCursor, id: 'invalid' },
      { ...decodedCursor, at: 'invalid' },
      { ...decodedCursor, unknown: true },
      { ...decodedCursor, filter: 'x'.repeat(64) },
    ]) {
      await deny(
        () =>
          feed({
            cursor: Buffer.from(JSON.stringify(invalidCursor)).toString(
              'base64url',
            ),
          }),
        400,
      );
    }
    const stableRows = await rows();
    await feed();
    await feed({ limit: 1 });
    assert.deepEqual(await rows(), stableRows);
    const roles = await access.directory(
      workspace.id,
      founder.memberId,
      founder.userWorkspaceId,
    );
    const administratorRole = roles.roles.find((role) => role.name === 'Admin');
    await access.assignRoles(
      workspace.id,
      founder.memberId,
      founder.userWorkspaceId,
      {
        memberId: secondary.memberId,
        roleIds: [administratorRole.id],
        roleRevisions: [
          { id: administratorRole.id, revision: administratorRole.revision },
        ],
        revision: 0,
      },
    );
    await feed({}, secondary);
    await access.assignRoles(
      workspace.id,
      founder.memberId,
      founder.userWorkspaceId,
      {
        memberId: secondary.memberId,
        roleIds: [],
        roleRevisions: [],
        revision: 1,
      },
    );
    await deny(() => feed({}, secondary));
    for (const [disable, restore] of [
      [
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
      ],
    ]) {
      await runner.query(disable, [founder.userWorkspaceId]);
      await deny(() => feed());
      await runner.query(restore, [founder.userWorkspaceId]);
    }
    await runner.query(
      `UPDATE "${workspace.databaseSchema}"."workspaceMember" SET "deletedAt"=now() WHERE id=$1`,
      [founder.memberId],
    );
    await deny(() => feed());
    await runner.query(
      `UPDATE "${workspace.databaseSchema}"."workspaceMember" SET "deletedAt"=NULL WHERE id=$1`,
      [founder.memberId],
    );
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      founder.userId,
    ]);
    await deny(() => feed());
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      founder.userId,
    ]);
    await runner.query(
      'UPDATE core.workspace SET "activationStatus"=\'INACTIVE\' WHERE id=$1',
      [workspace.id],
    );
    await deny(() => feed());
    await runner.query(
      'UPDATE core.workspace SET "activationStatus"=\'ACTIVE\' WHERE id=$1',
      [workspace.id],
    );
    const validInput = {
      workspaceId: workspace.id,
      actorId: founder.memberId,
      category: 'DELIVERY',
      action: 'TASK_UPDATED',
      outcome: 'RECORDED',
      summary: 'Updated task',
      sourceType: 'task',
      sourceId: randomUUID(),
    };
    await assert.rejects(
      () => recordOtogrowActivity(connectionSource.manager, validInput),
      /business transaction/,
    );
    for (const invalidInput of [
      { changes: [{ field: 'prompt', before: null, after: SECRET_MARKER }] },
      { changes: [{ field: 'message', before: null, after: SECRET_MARKER }] },
      { changes: [{ field: 'token', before: null, after: SECRET_MARKER }] },
      {
        changes: [
          { field: 'revision', before: null, after: 'x'.repeat(10001) },
        ],
      },
      { summary: 'x'.repeat(241) },
      { action: 'lowercase action' },
      {
        changes: Array.from({ length: 41 }, () => ({
          field: 'revision',
          before: '1',
          after: '2',
        })),
      },
    ]) {
      const before = await rows();
      await assert.rejects(
        () =>
          recordOtogrowActivity(runner.manager, {
            ...validInput,
            ...invalidInput,
          }),
        /structural changes/,
      );
      assert.deepEqual(await rows(), before);
    }
    const rollbackProjectId = randomUUID();
    const beforeRollback = await rows();
    await assert.rejects(
      () =>
        scoped.transaction(async (manager) => {
          await manager.getRepository(DeliveryProjectEntity).insert({
            id: rollbackProjectId,
            workspaceId: workspace.id,
            name: 'Must roll back',
            companyId: clientId,
            memberIds: [],
          });
          await recordOtogrowActivity(manager, {
            ...validInput,
            projectId: rollbackProjectId,
          });
          throw new Error('Forced rollback after audit');
        }),
      /Forced rollback/,
    );
    assert.equal(
      await projectRepository.findOneBy({ id: rollbackProjectId }),
      null,
    );
    assert.deepEqual(await rows(), beforeRollback);
    await assert.rejects(() =>
      scoped.transaction(async (manager) => {
        await manager.getRepository(DeliveryProjectEntity).insert({
          id: rollbackProjectId,
          workspaceId: workspace.id,
          name: 'Must roll back',
          companyId: clientId,
          memberIds: [],
        });
        await recordOtogrowActivity(manager, {
          ...validInput,
          projectId: foreignProject.id,
        });
      }),
    );
    assert.equal(
      await projectRepository.findOneBy({ id: rollbackProjectId }),
      null,
    );
    assert.deepEqual(await rows(), beforeRollback);

    const mutate = (member, input) =>
      delivery.command(
        workspace,
        member.memberId,
        member.userWorkspaceId,
        input,
      );
    let deliverySnapshot = await mutate(founder, {
      action: 'project',
      name: 'Delivery activity fixture',
      companyId: clientId,
      memberIds: [editor.memberId],
    });
    const trackedProject = deliverySnapshot.projects.find(
      (item) => item.name === 'Delivery activity fixture',
    );
    assert(trackedProject);
    const fields = {
      title: 'Activity workflow',
      brief: SECRET_MARKER,
      service: 'Video',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: editor.memberId,
      reviewerId: founder.memberId,
      checklist: [{ id: randomUUID(), text: SECRET_MARKER, done: false }],
      evidence: [`https://example.invalid/proof?token=${SECRET_MARKER}`],
    };
    deliverySnapshot = await mutate(founder, {
      action: 'create',
      projectId: trackedProject.id,
      fields,
    });
    let task = deliverySnapshot.tasks.find(
      (item) => item.projectId === trackedProject.id,
    );
    assert(task);
    const taskId = task.id;
    const update = async (member, input) => {
      deliverySnapshot = await mutate(member, {
        taskId,
        revision: task.revision,
        ...input,
      });
      task = deliverySnapshot.tasks.find((item) => item.id === taskId);
    };
    await update(founder, {
      action: 'edit',
      fields: { ...fields, priority: 'HIGH' },
    });
    await update(editor, {
      action: 'progress',
      state: 'BLOCKED',
      blocker: SECRET_MARKER,
      checklist: fields.checklist,
      evidence: fields.evidence,
    });
    await update(editor, { action: 'comment', text: SECRET_MARKER });
    await update(editor, {
      action: 'submit',
      description: SECRET_MARKER,
      evidence: fields.evidence,
    });
    await deny(() =>
      mutate(editor, {
        action: 'review',
        taskId,
        revision: task.revision,
        decision: 'APPROVED',
        feedback: SECRET_MARKER,
      }),
    );
    await deny(
      () =>
        mutate(founder, {
          action: 'review',
          taskId,
          revision: 1,
          decision: 'APPROVED',
          feedback: SECRET_MARKER,
        }),
      409,
    );
    await update(founder, {
      action: 'review',
      decision: 'APPROVED',
      feedback: SECRET_MARKER,
    });
    const trackedEvents = (await rows()).filter(
      (event) => event.projectId === trackedProject.id,
    );
    for (const action of [
      'PROJECT_CREATED',
      'TASK_CREATED',
      'TASK_UPDATED',
      'TASK_PROGRESS',
      'TASK_COMMENTED',
      'TASK_SUBMITTED',
      'TASK_REVIEWED',
    ]) {
      assert.equal(
        trackedEvents.filter((event) => event.action === action).length,
        1,
        `Expected exactly one ${action} event`,
      );
    }
    const reviewed = trackedEvents.find(
      (event) => event.action === 'TASK_REVIEWED',
    );
    assert.equal(reviewed.actorId, founder.memberId);
    assert.equal(reviewed.subjectMemberId, editor.memberId);
    assert.equal(reviewed.outcome, 'APPROVED');
    assert.equal(reviewed.sourceId, taskId);
    assert.equal(reviewed.actorName, founder.name);
    assert.equal(reviewed.subjectName, editor.name);
    assert(!JSON.stringify(await rows()).includes(SECRET_MARKER));
    const roleAfter = await access.saveRole(
      workspace.id,
      founder.memberId,
      founder.userWorkspaceId,
      {
        name: 'Audit fixture role',
        description: SECRET_MARKER,
        capabilities: [],
      },
    );
    assert(roleAfter.roles.some((role) => role.name === 'Audit fixture role'));
    assert(!JSON.stringify(await rows()).includes(SECRET_MARKER));
    await runner.query(
      `DELETE FROM "${workspace.databaseSchema}"."workspaceMember" WHERE id=$1`,
      [editor.memberId],
    );
    await runner.query('DELETE FROM core."user" WHERE id=$1', [editor.userId]);
    await projectRepository.delete({ id: project.id });
    await runner.query(
      `DELETE FROM "${workspace.databaseSchema}".company WHERE id=$1`,
      [clientId],
    );
    const afterRemoval = await feed({ personId: editor.memberId, limit: 100 });
    const durableEvent = afterRemoval.events.find(
      (event) => event.id === middle.id,
    );
    assert.equal(durableEvent.actorName, founder.name);
    assert.equal(durableEvent.subjectName, editor.name);
    assert.equal(durableEvent.projectName, 'Project snapshot');
    assert.equal(durableEvent.clientName, 'Client snapshot');
    assert(
      afterRemoval.people.some(
        (person) =>
          person.id === editor.memberId && person.name === editor.name,
      ),
    );
    assert(
      afterRemoval.projects.some(
        (option) =>
          option.id === project.id && option.name === 'Project snapshot',
      ),
    );
    assert(
      afterRemoval.clients.some(
        (option) => option.id === clientId && option.name === 'Client snapshot',
      ),
    );
    assert.deepEqual(durableEvent.changes, middle.changes);
    process.stdout.write(
      'PASS: activity tenant/admin/identity boundaries, revocation, inactive users, strict filters/cursors, date bounds, equal-time pagination with intervening inserts, actor/subject filters, durable names, read-only reads, secret exclusion, transactional rollback and delivery instrumentation. All fixture schemas/data rolled back; no external calls.\n',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
