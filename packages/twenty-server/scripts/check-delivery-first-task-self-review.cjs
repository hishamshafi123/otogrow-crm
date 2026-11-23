const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  createFixture,
  buildServices,
} = require('./check-delivery-reconciliation.cjs');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');

async function main() {
  assert.equal(process.argv.length, 2, 'This checker always rolls back.');
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
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await createFixture(runner.manager, 'first_task_review');
    const { workspace, schemaName, people, projects } = fixture;
    await runner.query(
      `CREATE TABLE "${schemaName}".task (id uuid PRIMARY KEY,title text NOT NULL,"assigneeId" uuid,"dueAt" timestamptz,status text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),"deletedAt" timestamptz)`,
    );
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
      [projects.first, JSON.stringify([people.admin.memberId])],
    );
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const { delivery } = buildServices(source, fixture);
    const fields = {
      title: 'First task self review',
      brief: '',
      service: 'SEO',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: people.admin.memberId,
      reviewerId: people.admin.memberId,
      checklist: [],
      evidence: [],
    };
    await assert.rejects(
      delivery.command(
        workspace,
        people.admin.memberId,
        people.admin.userWorkspaceId,
        { action: 'create', projectId: projects.first, fields },
        runner.manager,
      ),
      (error) => error.getStatus?.() === 400,
    );
    const taskId = await delivery.command(
      workspace,
      people.admin.memberId,
      people.admin.userWorkspaceId,
      { action: 'create', projectId: projects.first, fields },
      runner.manager,
      undefined,
      { allowSelfReview: true },
    );
    assert.equal(typeof taskId, 'string');
    let stored = await runner.manager.getRepository(DeliveryTaskEntity).findOneBy({
      workspaceId: workspace.id,
      taskId,
    });
    assert.equal(stored.details.allowSelfReview, true);
    await delivery.command(
      workspace,
      people.admin.memberId,
      people.admin.userWorkspaceId,
      {
        action: 'progress',
        taskId,
        revision: 1,
        state: 'IN_PROGRESS',
        blocker: '',
        checklist: [],
        evidence: [],
      },
      runner.manager,
    );
    await delivery.command(
      workspace,
      people.admin.memberId,
      people.admin.userWorkspaceId,
      {
        action: 'submit',
        taskId,
        revision: 2,
        description: 'Ready for first-task review',
        evidence: ['https://example.test/first-deliverable'],
      },
      runner.manager,
    );
    await delivery.command(
      workspace,
      people.admin.memberId,
      people.admin.userWorkspaceId,
      {
        action: 'review',
        taskId,
        revision: 3,
        decision: 'APPROVED',
        feedback: '',
      },
      runner.manager,
    );
    stored = await runner.manager.getRepository(DeliveryTaskEntity).findOneBy({
      workspaceId: workspace.id,
      taskId,
    });
    assert.equal(stored.details.state, 'APPROVED');
    assert.equal(stored.details.submissions[0].reviewedBy, people.admin.memberId);
    console.log(
      'First-task same-person create → submit → approve passed; ordinary same-person creation remains rejected. Rolled back.',
    );
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
