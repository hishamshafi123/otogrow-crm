const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} = require('node:fs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const FILE = '/tmp/otogrow-handoff-fixture.json',
  SENTINEL = 'Disposable handoff acceptance';
(async () => {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  try {
    if (process.argv[2] === 'create') {
      assert(!existsSync(FILE));
      const fixture = {
        workspaceId: '0a420537-0122-45c3-a2f5-18298b636227',
        companyId: randomUUID(),
        opportunityId: randomUUID(),
        quoteId: randomUUID(),
        lineId: randomUUID(),
        memberId: randomUUID(),
        userId: randomUUID(),
        roleId: randomUUID(),
      };
      await connectionSource.transaction(async (manager) => {
        const [workspace] = await manager.query(
          'SELECT "databaseSchema" FROM core.workspace WHERE id=$1',
          [fixture.workspaceId],
        );
        assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
        fixture.schema = workspace.databaseSchema;
        const schema = `"${fixture.schema}"`;
        await manager.query(
          'INSERT INTO core."user" (id,email) VALUES ($1,$2)',
          [fixture.userId, `${fixture.userId}+handoff@example.invalid`],
        );
        await manager.query(
          'INSERT INTO core."userWorkspace" (id,"workspaceId","userId") VALUES ($1,$2,$3)',
          [fixture.memberId, fixture.workspaceId, fixture.userId],
        );
        await manager.query(
          `INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Handoff test','manager')`,
          [
            fixture.memberId,
            fixture.userId,
            `${fixture.userId}+handoff@example.invalid`,
          ],
        );
        await manager.query(
          'INSERT INTO core."otogrowRole" (id,"workspaceId",name,description,capabilities) VALUES ($1,$2,$3,\'Disposable fixture only\',$4)',
          [fixture.roleId, fixture.workspaceId, SENTINEL, ['delivery.manage']],
        );
        await manager.query(
          'INSERT INTO core."otogrowRoleAssignment" ("workspaceId","workspaceMemberId","roleId") VALUES ($1,$2,$3)',
          [fixture.workspaceId, fixture.memberId, fixture.roleId],
        );
        await manager.query(
          'INSERT INTO core."otogrowMemberAccess" ("workspaceId","workspaceMemberId") VALUES ($1,$2)',
          [fixture.workspaceId, fixture.memberId],
        );
        await manager.query(
          `INSERT INTO ${schema}.company (id,name) VALUES ($1,$2)`,
          [fixture.companyId, SENTINEL],
        );
        await manager.query(
          `INSERT INTO ${schema}.opportunity (id,name,stage,"companyId") VALUES ($1,$2,'CUSTOMER',$3)`,
          [fixture.opportunityId, SENTINEL, fixture.companyId],
        );
        await manager.query(
          `INSERT INTO ${schema}.quote (id,"quoteNumber",status,"companyId","opportunityId",terms,"totalAmountMicros","totalCurrencyCode") VALUES ($1,'HANDOFF-UI-FIXTURE','ACCEPTED',$2,$3,'Monthly review; no automated payment.',1250000000,'USD')`,
          [fixture.quoteId, fixture.companyId, fixture.opportunityId],
        );
        await manager.query(
          `INSERT INTO ${schema}."quoteLineItem" (id,"quoteId",label,description,quantity) VALUES ($1,$2,'AI creative package','Six unique videos; variations planned separately.',6)`,
          [fixture.lineId, fixture.quoteId],
        );
      });
      writeFileSync(FILE, JSON.stringify(fixture));
      console.log(
        'Created disposable won deal, accepted quote, company and delivery-manager fixture. No real roles or staff changed.',
      );
    } else {
      assert.equal(process.argv[2], 'cleanup');
      const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
      assert(/^[a-zA-Z0-9_]+$/.test(fixture.schema));
      const schema = `"${fixture.schema}"`;
      await connectionSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        const [company] = await manager.query(
          `SELECT name FROM ${schema}.company WHERE id=$1`,
          [fixture.companyId],
        );
        assert.equal(company.name, SENTINEL);
        const [handoff] = await manager.query(
          'SELECT * FROM core."deliveryHandoff" WHERE "workspaceId"=$1 AND "opportunityId"=$2',
          [fixture.workspaceId, fixture.opportunityId],
        );
        if (handoff) {
          const [operations] = await manager.query(
            'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
            [fixture.workspaceId],
          );
          assert(
            !operations.state.clients.links.some(
              (row) => row.engagementId === handoff.engagementId,
            ),
            'Unexpected client link; stop cleanup',
          );
          assert(
            !operations.state.clients.shares.some(
              (row) => row.engagementId === handoff.engagementId,
            ),
            'Unexpected client share; stop cleanup',
          );
          const tasks = await manager.query(
            'SELECT "taskId" FROM core."deliveryTask" WHERE "projectId"=$1',
            [handoff.projectId],
          );
          assert.deepEqual(
            tasks.map((row) => row.taskId).sort(),
            [...handoff.setupTaskIds].sort(),
          );
          const fixtureNotices = operations.state.notices.filter((row) =>
            handoff.setupTaskIds.includes(row.taskId),
          );
          assert(
            fixtureNotices.every(
              (row) =>
                !['SENT', 'SENDING', 'UNCERTAIN'].includes(row.sendState),
            ),
            'Unexpected external notification; stop cleanup',
          );
          const outbox = await manager.query(
            'SELECT status FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1 AND "noticeId"=ANY($2::uuid[]) FOR UPDATE',
            [fixture.workspaceId, fixtureNotices.map((row) => row.id)],
          );
          assert(
            outbox.every(
              (row) => !['SENT', 'SENDING', 'UNCERTAIN'].includes(row.status),
            ),
            'Unexpected outbox send; stop cleanup',
          );
          await manager.query(
            'DELETE FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1 AND "noticeId"=ANY($2::uuid[])',
            [fixture.workspaceId, fixtureNotices.map((row) => row.id)],
          );
          operations.state.notices = operations.state.notices.filter(
            (row) => !handoff.setupTaskIds.includes(row.taskId),
          );
          operations.state.fulfilments = operations.state.fulfilments.filter(
            (row) => !handoff.setupTaskIds.includes(row.taskId),
          );
          operations.state.alerts = operations.state.alerts.filter(
            (row) => !handoff.setupTaskIds.includes(row.taskId),
          );
          operations.state.clients.engagements =
            operations.state.clients.engagements.filter(
              (row) => row.id !== handoff.engagementId,
            );
          operations.state.clients.audit =
            operations.state.clients.audit.filter(
              (row) => row.targetId !== handoff.engagementId,
            );
          await manager.query(
            'UPDATE core."deliveryOperations" SET state=$1 WHERE id=$2',
            [operations.state, operations.id],
          );
          await manager.query(
            'DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2',
            [fixture.workspaceId, handoff.projectId],
          );
          await manager.query(
            'DELETE FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=ANY($2::uuid[])',
            [fixture.workspaceId, handoff.setupTaskIds],
          );
          await manager.query(
            `DELETE FROM ${schema}.task WHERE id=ANY($1::uuid[])`,
            [handoff.setupTaskIds],
          );
          await manager.query(
            'DELETE FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',
            [handoff.projectId, fixture.workspaceId],
          );
          await manager.query(
            'DELETE FROM core."deliveryHandoff" WHERE id=$1',
            [handoff.id],
          );
        }
        await manager.query(
          `DELETE FROM ${schema}."quoteLineItem" WHERE id=$1 AND "quoteId"=$2`,
          [fixture.lineId, fixture.quoteId],
        );
        await manager.query(`DELETE FROM ${schema}.quote WHERE id=$1`, [
          fixture.quoteId,
        ]);
        await manager.query(`DELETE FROM ${schema}.opportunity WHERE id=$1`, [
          fixture.opportunityId,
        ]);
        await manager.query(`DELETE FROM ${schema}.company WHERE id=$1`, [
          fixture.companyId,
        ]);
        await manager.query(
          'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1 AND "workspaceMemberId"=$2 AND "roleId"=$3',
          [fixture.workspaceId, fixture.memberId, fixture.roleId],
        );
        await manager.query(
          'DELETE FROM core."otogrowMemberAccess" WHERE "workspaceId"=$1 AND "workspaceMemberId"=$2',
          [fixture.workspaceId, fixture.memberId],
        );
        await manager.query(
          'DELETE FROM core."otogrowRole" WHERE id=$1 AND "workspaceId"=$2',
          [fixture.roleId, fixture.workspaceId],
        );
        await manager.query(
          `DELETE FROM ${schema}."workspaceMember" WHERE id=$1 AND "userId"=$2`,
          [fixture.memberId, fixture.userId],
        );
        await manager.query(
          'DELETE FROM core."userWorkspace" WHERE id=$1 AND "userId"=$2',
          [fixture.memberId, fixture.userId],
        );
        await manager.query(
          'DELETE FROM core."user" WHERE id=$1 AND email=$2',
          [fixture.userId, `${fixture.userId}+handoff@example.invalid`],
        );
      });
      unlinkSync(FILE);
      console.log(
        'Removed exact synthetic handoff, setup tasks, engagement, project, source records, role and member.',
      );
    }
  } finally {
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
