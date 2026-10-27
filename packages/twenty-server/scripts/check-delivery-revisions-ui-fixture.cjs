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
const FILE = '/tmp/otogrow-revisions-fixture.json';
const SENTINEL = 'Disposable revisions acceptance';
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
        projectId: randomUUID(),
        taskId: randomUUID(),
        memberId: randomUUID(),
        userId: randomUUID(),
        day: '2026-10-27',
      };
      await connectionSource.transaction(async (manager) => {
        const [workspace] = await manager.query(
          'SELECT "databaseSchema" FROM core.workspace WHERE id=$1',
          [fixture.workspaceId],
        );
        assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
        fixture.schema = workspace.databaseSchema;
        const [reviewer] = await manager.query(
          `SELECT id FROM "${fixture.schema}"."workspaceMember" WHERE "userEmail" NOT LIKE '%example.invalid' AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`,
        );
        assert(reviewer);
        await manager.query(
          'INSERT INTO core."user" (id,email) VALUES ($1,$2)',
          [fixture.userId, `${fixture.userId}+revisions@example.invalid`],
        );
        await manager.query(
          'INSERT INTO core."userWorkspace" (id,"workspaceId","userId") VALUES ($1,$2,$3)',
          [fixture.memberId, fixture.workspaceId, fixture.userId],
        );
        await manager.query(
          `INSERT INTO "${fixture.schema}"."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Revision test','editor')`,
          [
            fixture.memberId,
            fixture.userId,
            `${fixture.userId}+revisions@example.invalid`,
          ],
        );
        await manager.query(
          'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,$3,$4)',
          [
            fixture.projectId,
            fixture.workspaceId,
            SENTINEL,
            JSON.stringify([fixture.memberId]),
          ],
        );
        await manager.query(
          `INSERT INTO "${fixture.schema}".task (id,title,"assigneeId",status) VALUES ($1,$2,$3,'TODO')`,
          [fixture.taskId, SENTINEL + ' video', fixture.memberId],
        );
        const details = {
          brief: 'Synthetic product video for revisions acceptance.',
          service: 'AI video',
          priority: 'NORMAL',
          scheduledDate: fixture.day,
          reviewerId: reviewer.id,
          state: 'IN_REVIEW',
          blocker: '',
          checklist: [],
          evidence: [],
          submissions: [
            {
              version: 1,
              description: 'Synthetic first submission',
              evidence: ['https://example.com/synthetic'],
              submittedBy: fixture.memberId,
              submittedAt: new Date().toISOString(),
            },
          ],
          events: [],
          plan: {
            workMinutes: 120,
            revisionMinutes: 30,
            waitMinutes: 180,
            reviewMinutes: 20,
            reviewDate: fixture.day,
            complexity: 'COMPLEX',
          },
        };
        await manager.query(
          'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details) VALUES ($1,$2,$3,$4)',
          [fixture.workspaceId, fixture.taskId, fixture.projectId, details],
        );
      });
      writeFileSync(FILE, JSON.stringify(fixture));
      console.log(
        'Created exact synthetic editor, project, task. No real staff or permissions changed.',
      );
    } else {
      assert.equal(process.argv[2], 'cleanup');
      const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
      assert(/^[a-zA-Z0-9_]+$/.test(fixture.schema));
      await connectionSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        const [project] = await manager.query(
          'SELECT * FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',
          [fixture.projectId, fixture.workspaceId],
        );
        assert.equal(project.name, SENTINEL);
        assert.deepEqual(project.memberIds, [fixture.memberId]);
        const [user] = await manager.query(
          'SELECT email FROM core."user" WHERE id=$1',
          [fixture.userId],
        );
        assert.equal(user.email, `${fixture.userId}+revisions@example.invalid`);
        const tasks = await manager.query(
          'SELECT "taskId" FROM core."deliveryTask" WHERE "projectId"=$1',
          [fixture.projectId],
        );
        assert.deepEqual(
          tasks.map((row) => row.taskId),
          [fixture.taskId],
        );
        await manager.query(
          'DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND ("projectId"=$2 OR ("sourceType"=\'revisions\' AND "subjectMemberId"=$3))',
          [fixture.workspaceId, fixture.projectId, fixture.memberId],
        );
        await manager.query(
          'DELETE FROM core."deliveryRevision" WHERE "workspaceId"=$1 AND "taskId"=$2',
          [fixture.workspaceId, fixture.taskId],
        );
        await manager.query(
          'DELETE FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
          [fixture.workspaceId, fixture.taskId],
        );
        await manager.query(
          `DELETE FROM "${fixture.schema}".task WHERE id=$1`,
          [fixture.taskId],
        );
        await manager.query('DELETE FROM core."deliveryProject" WHERE id=$1', [
          fixture.projectId,
        ]);
        await manager.query(
          `DELETE FROM "${fixture.schema}"."workspaceMember" WHERE id=$1`,
          [fixture.memberId],
        );
        await manager.query(
          'DELETE FROM core."userWorkspace" WHERE id=$1 AND "workspaceId"=$2',
          [fixture.memberId, fixture.workspaceId],
        );
        await manager.query('DELETE FROM core."user" WHERE id=$1', [
          fixture.userId,
        ]);
      });
      unlinkSync(FILE);
      console.log(
        'Removed exact synthetic revisions records, member and events.',
      );
    }
  } finally {
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
