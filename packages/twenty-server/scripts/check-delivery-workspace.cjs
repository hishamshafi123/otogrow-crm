// Runs against the local development database; all fixture writes roll back.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  buildWhereExpression,
  buildJoinClause,
} = require('../dist/engine/twenty-orm-v2/sql/utils/build-select-statement.util');
const {
  buildMutationStatement,
} = require('../dist/engine/twenty-orm-v2/sql/utils/build-mutation-statement.util');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryProjectEntity,
} = require('../dist/modules/delivery/entities/delivery-project.entity');
const {
  deliveryTaskIsolationCondition,
} = require('../dist/engine/twenty-orm/utils/delivery-task-isolation.util');

async function main() {
  const databaseUrl = new URL(connectionSource.options.url);
  assert(
    ['localhost', '127.0.0.1'].includes(databaseUrl.hostname),
    'Only a local development database is allowed',
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const [workspace] = await runner.query(
      'SELECT id, "databaseSchema" FROM core.workspace WHERE "databaseSchema" IS NOT NULL LIMIT 1',
    );
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID();
    const editor = randomUUID();
    const outsider = randomUUID();
    for (const [id, name] of [
      [admin, 'Delivery reviewer fixture'],
      [editor, 'Delivery editor fixture'],
      [outsider, 'Delivery outsider fixture'],
    ]) {
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id, "nameFirstName", "nameLastName", "userId", "userEmail") VALUES ($1,$2,'',$3,$4)`,
        [id, name, randomUUID(), `${id}@example.invalid`],
      );
    }
    const scopedDataSource = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) => callback(runner.manager),
    };
    const service = new DeliveryService(scopedDataSource, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === admin,
    });
    const command = (actor, input) =>
      service.command(workspace, actor, actor, input);
    await command(admin, {
      action: 'project',
      name: 'Rollback delivery verification',
      companyId: null,
      memberIds: [editor],
    });
    const project = await runner.manager
      .getRepository(DeliveryProjectEntity)
      .findOneByOrFail({
        name: 'Rollback delivery verification',
        workspaceId: workspace.id,
      });
    let snapshot = await command(admin, {
      action: 'create',
      projectId: project.id,
      fields: {
        title: 'Product video fixture',
        brief: 'Accurate logo. Calm music.',
        service: 'Video',
        priority: 'HIGH',
        scheduledDate: '2026-10-24',
        dueAt: null,
        assigneeId: editor,
        reviewerId: admin,
        checklist: [{ id: randomUUID(), text: 'Product checked', done: false }],
        evidence: ['https://example.com/reference'],
      },
    });
    let task = snapshot.tasks.find((task) => task.projectId === project.id);
    assert(task);
    const taskId = task.id;
    const editorView = await service.snapshot(workspace, editor, editor);
    assert(editorView.tasks.some((task) => task.id === taskId));
    const outsiderView = await service.snapshot(workspace, outsider, outsider);
    assert(!outsiderView.tasks.some((task) => task.id === taskId));
    await assert.rejects(
      command(outsider, {
        action: 'comment',
        taskId,
        revision: task.revision,
        text: 'Unauthorized',
      }),
    );
    await assert.rejects(
      command(editor, {
        action: 'edit',
        taskId,
        revision: task.revision,
        fields: {},
      }),
    );
    snapshot = await command(editor, {
      action: 'submit',
      taskId,
      revision: task.revision,
      description: 'First cut',
      evidence: ['https://example.com/v1'],
    });
    task = snapshot.tasks.find((task) => task.id === taskId);
    assert.equal(task.details.state, 'IN_REVIEW');
    await assert.rejects(
      command(editor, {
        action: 'review',
        taskId,
        revision: task.revision,
        decision: 'APPROVED',
        feedback: '',
      }),
    );
    await assert.rejects(
      command(admin, {
        action: 'review',
        taskId,
        revision: 1,
        decision: 'APPROVED',
        feedback: '',
      }),
    );
    snapshot = await command(admin, {
      action: 'review',
      taskId,
      revision: task.revision,
      decision: 'CHANGES_REQUESTED',
      feedback: 'Correct the product label',
    });
    task = snapshot.tasks.find((task) => task.id === taskId);
    snapshot = await command(editor, {
      action: 'submit',
      taskId,
      revision: task.revision,
      description: 'Label fixed',
      evidence: ['https://example.com/v2'],
    });
    task = snapshot.tasks.find((task) => task.id === taskId);
    snapshot = await command(admin, {
      action: 'review',
      taskId,
      revision: task.revision,
      decision: 'APPROVED',
      feedback: 'Ready',
    });
    task = snapshot.tasks.find((task) => task.id === taskId);
    assert.equal(task.details.state, 'APPROVED');
    assert.equal(task.details.submissions.length, 2);
    assert.equal(
      task.details.submissions[0].feedback,
      'Correct the product label',
    );
    assert.deepEqual(task.details.submissions[0].evidence, [
      'https://example.com/v1',
    ]);
    assert.equal(
      (
        await runner.query(`SELECT status FROM ${schema}.task WHERE id=$1`, [
          taskId,
        ])
      )[0].status,
      'DONE',
    );
    await assert.rejects(
      command(editor, {
        action: 'submit',
        taskId,
        revision: task.revision,
        description: 'Overwrite',
        evidence: ['https://example.com/v3'],
      }),
    );
    const condition = deliveryTaskIsolationCondition('task', 'task', {
      workspaceId: workspace.id,
    });
    assert.equal(
      (
        await runner.query(
          `SELECT id FROM ${schema}.task WHERE id=$1 AND ${condition}`,
          [taskId],
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await runner.query(
          `UPDATE ${schema}.task SET status='TODO' WHERE id=$1 AND ${condition} RETURNING id`,
          [taskId],
        )
      )[1],
      0,
    );
    assert.equal(
      (
        await runner.query(
          `SELECT m.id FROM ${schema}."workspaceMember" m LEFT JOIN ${schema}.task ON task."assigneeId"=m.id AND ${condition} WHERE m.id=$1 AND task.id=$2`,
          [editor, taskId],
        )
      ).length,
      0,
    );
    const shape = {
      nameSingular: 'task',
      tableName: 'task',
      schemaName: workspace.databaseSchema,
      columnNames: ['id'],
      hasDeletedAtColumn: true,
    };
    const selectState = {
      alias: 'task',
      tableShape: shape,
      whereClauses: [{ operator: 'and', sql: '1=1 OR 1=1' }],
      joinClauses: [],
      existsFilterClauses: [],
      includeDeleted: false,
    };
    const protectedWhere = buildWhereExpression(selectState);
    assert.equal(
      (
        await runner.query(
          `SELECT id FROM ${schema}.task WHERE id=$1 AND (${protectedWhere})`,
          [taskId],
        )
      ).length,
      0,
    );
    const protectedUpdate = buildMutationStatement({
      alias: 'task',
      tableShape: shape,
      kind: 'update',
      setClauses: [{ columnName: 'title', valueExpression: "'Not permitted'" }],
      whereClauses: [{ operator: 'and', sql: `id='${taskId}'` }],
      returningColumns: ['id'],
    });
    assert.equal((await runner.query(protectedUpdate))[1], 0);
    const protectedJoin = buildJoinClause({
      ...selectState,
      joinClauses: [
        {
          alias: 'task',
          targetTableShape: shape,
          condition: 'task."assigneeId"=m.id',
          additionalOnConditions: [],
          relationType: 'MANY_TO_ONE',
          joinType: 'LEFT',
        },
      ],
    });
    assert.equal(
      (
        await runner.query(
          `SELECT task.id FROM ${schema}."workspaceMember" m ${protectedJoin} WHERE m.id=$1 AND task.id=$2`,
          [editor, taskId],
        )
      ).length,
      0,
    );
    await command(admin, {
      action: 'project',
      id: project.id,
      name: project.name,
      companyId: null,
      memberIds: [],
    });
    assert(
      !(await service.snapshot(workspace, editor, editor)).tasks.some(
        (task) => task.id === taskId,
      ),
    );
    await assert.rejects(
      command(editor, {
        action: 'comment',
        taskId,
        revision: task.revision,
        text: 'Revoked access',
      }),
    );
    console.log(
      'PASS: assignment, scoped reads, outsider rejection, submission, self-approval rejection, stale writes, revisions, approval, immutable history, generic query isolation, membership revocation.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
    console.log('All verification fixtures rolled back.');
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
