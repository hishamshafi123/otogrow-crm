const { DeliveryBatchesService } = require('../dist/modules/delivery/batches/delivery-batches.service');
// Independent transactions use only a committed disposable workspace, removed with exact sentinel checks.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  DeliveryClientsService,
} = require('../dist/modules/delivery/clients/delivery-clients.service');
const {
  DeliveryCommitmentsService,
} = require('../dist/modules/delivery/commitments/delivery-commitments.service');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  DeliveryCommitmentAllocationEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-allocation.entity');
const WORKSPACE_ID = randomUUID();
const SCHEMA = `batch_concurrency_${WORKSPACE_ID.replaceAll('-', '_')}`;
const SENTINEL = `otogrow-batch-concurrency:${WORKSPACE_ID}`;
const MEMBERS = ['Founder', 'Editor', 'Manager'].map((name) => ({
  name,
  memberId: randomUUID(),
  userId: randomUUID(),
  userWorkspaceId: randomUUID(),
}));
const [FOUNDER, EDITOR, MANAGER] = MEMBERS;
const emailFor = (member) =>
  `${member.userId}+batch-concurrency@example.invalid`;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const bounded = async (promise, label) => {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.match(SCHEMA, /^batch_concurrency_[a-f0-9_]{36}$/);
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${SENTINEL}:${index}`,
        },
      }),
  );
  let startBarrier = null;
  const commitHooks = [null, null];
  const gates = [];
  const pending = [];
  const gate = () => {
    const item = deferred();
    gates.push(item);
    return item;
  };
  const hold = () => {
    const entered = gate(),
      release = gate();
    return {
      entered,
      release,
      run: async () => {
        entered.resolve();
        await release.promise;
      },
    };
  };
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    query: (...args) => source.query(...args),
    getRepository: (entity) => source.getRepository(entity),
    transaction: (callback) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='4s'");
        await manager.query("SET LOCAL statement_timeout='10s'");
        const barrier = startBarrier;
        if (barrier) {
          barrier.arrivals.add(index);
          if (barrier.arrivals.size === 2) {
            startBarrier = null;
            barrier.ready.resolve();
          }
          await bounded(
            barrier.ready.promise,
            'Both commitment sessions must reach the transaction barrier',
          );
        }
        const result = await callback(manager);
        const hook = commitHooks[index];
        commitHooks[index] = null;
        if (hook) await hook();
        return result;
      }),
  }));
  const permissions = {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      workspaceId === WORKSPACE_ID &&
      userWorkspaceId === FOUNDER.userWorkspaceId,
  };
  const access = scoped.map(
    (source) => new OtogrowAccessService(source, permissions),
  );
  const deliveries = scoped.map(
    (source, index) => new DeliveryService(source, access[index]),
  );
  const commitments = scoped.map(
    (source, index) =>
      new DeliveryCommitmentsService(source, deliveries[index]),
  );
  const creatives = scoped.map(
    (source, index) =>
      new DeliveryCreativeService(source, deliveries[index], {}),
  );
  const clients = scoped.map(
    (source, index) =>
      new DeliveryClientsService(
        source,
        deliveries[index],
        creatives[index],
        commitments[index],
      ),
  );
  const operations = scoped.map(
    (source, index) =>
      new DeliveryOperationsService(
        source,
        deliveries[index],
        creatives[index],
        {},
        { get: () => 'http://localhost:3001' },
        { add: async () => assert.fail('No external reminders may be queued') },
      ),
  );
  let workspace;
  let committed = false;
  let complete = false;
  const settlePromise = (promise) => {
    const safe = promise.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    );
    pending.push(safe);
    return safe;
  };
  const simultaneous = async (actions) => {
    startBarrier = { arrivals: new Set(), ready: gate() };
    return Promise.all(actions.map((action) => settlePromise(action())));
  };
  const oneWinner = (outcomes) => {
    const wins = outcomes.filter((item) => item.status === 'fulfilled'),
      losses = outcomes.filter((item) => item.status === 'rejected');
    assert.equal(wins.length, 1);
    assert.equal(losses.length, 1);
    return { winner: wins[0].value, loser: losses[0].reason };
  };
  const waitBlocked = async (pid) =>
    bounded(
      (async () => {
        while (true) {
          const [row] = await connectionSource.query(
            'SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1',
            [pid],
          );
          if (row?.wait_event_type === 'Lock' && row.wait_event === 'advisory')
            return;
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      })(),
      'Expected commitment advisory lock wait',
    );
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      const [existing] = await manager.query(
        `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' AND "deletedAt" IS NULL LIMIT 1`,
      );
      assert(existing);
      await manager.query(`CREATE SCHEMA "${SCHEMA}"`);
      await manager.query(`COMMENT ON SCHEMA "${SCHEMA}" IS '${SENTINEL}'`);
      await manager.query(
        `CREATE TABLE "${SCHEMA}"."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"userEmail" text,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
      );
      await manager.query(
        `CREATE TABLE "${SCHEMA}".company (id uuid PRIMARY KEY,name text,"deletedAt" timestamptz)`,
      );
      await manager.query(
        `CREATE TABLE "${SCHEMA}".task (id uuid PRIMARY KEY,title text,"assigneeId" uuid,"dueAt" timestamptz,status text,"deletedAt" timestamptz,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now())`,
      );
      [workspace] = await manager.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6) RETURNING *`,
        [
          WORKSPACE_ID,
          SENTINEL,
          `batch-race-${WORKSPACE_ID}`,
          SCHEMA,
          existing.workspaceCustomApplicationId,
          existing.defaultRoleId,
        ],
      );
      for (const member of MEMBERS) {
        await manager.query(
          'INSERT INTO core."user" (id,email) VALUES ($1,$2)',
          [member.userId, emailFor(member)],
        );
        await manager.query(
          'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
          [member.userWorkspaceId, member.userId, WORKSPACE_ID],
        );
        await manager.query(
          `INSERT INTO "${SCHEMA}"."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,$4,'fixture')`,
          [member.memberId, member.userId, emailFor(member), member.name],
        );
      }
    });
    committed = true;
    const [{ pid: secondPid }] = await sources[1].query(
      'SELECT pg_backend_pid() AS pid',
    );
    const clientIds = [randomUUID(), randomUUID()];
    for (const [index, id] of clientIds.entries())
      await sources[0].query(
        `INSERT INTO "${SCHEMA}".company (id,name) VALUES ($1,$2)`,
        [id, `Commitment client ${index}`],
      );
    const taskFields = {
      title: 'Commitment task',
      brief: 'Private commitment fixture brief',
      service: 'SEO',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: EDITOR.memberId,
      reviewerId: FOUNDER.memberId,
      checklist: [],
      evidence: [],
    };
    const projects = [];
    const tasks = [];
    for (const [index, companyId] of clientIds.entries()) {
      const result = await deliveries[0].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          action: 'project',
          name: `Commitment project ${index}`,
          companyId,
          memberIds: [EDITOR.memberId],
        },
      );
      projects.push(
        result.projects.find((item) => item.companyId === companyId),
      );
    }
    for (const project of [projects[0], projects[0], projects[1]]) {
      const title = `Commitment task ${tasks.length}`;
      const result = await deliveries[0].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          action: 'create',
          projectId: project.id,
          fields: { ...taskFields, title },
        },
      );
      tasks.push(result.tasks.find((item) => item.title === title));
    }
    const batches = scoped.map((source, index) => new DeliveryBatchesService(source, deliveries[index]));
    const batchId=randomUUID();
    const plan={id:batchId,projectId:projects[0].id,revision:0,label:'Disposable batch concurrency',periodId:null,startDate:null,endDate:null,timezone:'Asia/Qatar',reason:'Synthetic race plan'};
    await batches[0].save(workspace,FOUNDER.memberId,FOUNDER.userWorkspaceId,plan);
    const read=(index=0,actor=FOUNDER)=>batches[index].snapshot(workspace,actor.memberId,actor.userWorkspaceId,{projectId:projects[0].id,batchId,includeClosed:true});
    const input={projectId:projects[0].id,batchId,revision:1,taskId:tasks[0].id,taskRevision:tasks[0].revision,active:true,concept:'Concurrent concept',reason:'Add task exactly once'};
    const outcome=oneWinner(await simultaneous([()=>batches[0].item(workspace,FOUNDER.memberId,FOUNDER.userWorkspaceId,input),()=>batches[1].item(workspace,FOUNDER.memberId,FOUNDER.userWorkspaceId,{...input,concept:'Other concurrent concept'})]));
    assert.equal(outcome.loser.status,409);
    let current=await read(); assert.equal(current.selected.revision,2);assert.equal(current.tasks.length,1);
    assert.equal(current.history.filter((item)=>item.action==='BATCH_TASK_ADDED').length,1);
    assert.equal((await sources[0].query('SELECT count(*)::int AS count FROM core."deliveryBatchItem" WHERE "batchId"=$1',[batchId]))[0].count,1);
    const closing=await simultaneous([
      ()=>batches[0].state(workspace,FOUNDER.memberId,FOUNDER.userWorkspaceId,{projectId:projects[0].id,batchId,revision:2,closed:true,reason:'Finish weekly planning'}),
      ()=>batches[1].save(workspace,FOUNDER.memberId,FOUNDER.userWorkspaceId,{...plan,revision:2,label:'Concurrent revised batch'})
    ]);
    oneWinner(closing);current=await read();assert.equal(current.selected.revision,3);
    const before=await sources[0].query('SELECT revision,"updatedAt",xmin::text FROM core."deliveryBatch" WHERE id=$1',[batchId]);
    await Promise.all([read(0),read(1)]);
    assert.deepEqual(await sources[0].query('SELECT revision,"updatedAt",xmin::text FROM core."deliveryBatch" WHERE id=$1',[batchId]),before);
    const projectGate=hold();commitHooks[0]=projectGate.run;
    const revoke=settlePromise(scoped[0].transaction(async(manager)=>{
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`delivery:${WORKSPACE_ID}`]);
      await manager.query('UPDATE core."deliveryProject" SET "memberIds"=$1 WHERE "workspaceId"=$2 AND id=$3',[JSON.stringify([]),WORKSPACE_ID,projects[0].id]);
    }));
    await bounded(projectGate.entered.promise,'Revocation must reach commit gate');
    const revokedRead=settlePromise(read(1,EDITOR));await waitBlocked(secondPid);projectGate.release.resolve();
    assert.equal((await revoke).status,'fulfilled');assert.equal((await revokedRead).reason.status,404);
    const beforeFailure=await read();
    commitHooks[0]=async()=>{throw new Error('Synthetic rollback before commit');};
    await assert.rejects(batches[0].state(workspace,FOUNDER.memberId,FOUNDER.userWorkspaceId,{projectId:projects[0].id,batchId,revision:current.selected.revision,closed:!current.selected.closed,reason:'Atomic failure check'}));
    assert.deepEqual(await read(),beforeFailure);
    complete=true;
  } finally {
    for (const item of gates) item.resolve();
    await Promise.allSettled(pending);
    try {
      if (committed) {
        await connectionSource.transaction(async (manager) => {
          const [saved] = await manager.query(
            'SELECT "displayName","databaseSchema" FROM core.workspace WHERE id=$1 FOR UPDATE',
            [WORKSPACE_ID],
          );
          const [schema] = await manager.query(
            "SELECT obj_description(oid,'pg_namespace') AS sentinel FROM pg_namespace WHERE nspname=$1",
            [SCHEMA],
          );
          assert.equal(saved?.displayName, SENTINEL);
          assert.equal(saved?.databaseSchema, SCHEMA);
          assert.equal(schema?.sentinel, SENTINEL);
          for (const member of MEMBERS) {
            const [user] = await manager.query(
              'SELECT email FROM core."user" WHERE id=$1',
              [member.userId],
            );
            assert.equal(user?.email, emailFor(member));
            const [{ outside }] = await manager.query(
              'SELECT count(*)::int AS outside FROM core."userWorkspace" WHERE "userId"=$1 AND "workspaceId"<>$2',
              [member.userId, WORKSPACE_ID],
            );
            assert.equal(outside, 0);
          }
          await manager.query(
            'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1',
            [WORKSPACE_ID],
          );
          await manager.query(
            'DELETE FROM core."userWorkspace" WHERE "workspaceId"=$1',
            [WORKSPACE_ID],
          );
          await manager.query(
            'DELETE FROM core.workspace WHERE id=$1 AND "displayName"=$2 AND "databaseSchema"=$3',
            [WORKSPACE_ID, SENTINEL, SCHEMA],
          );
          for (const member of MEMBERS)
            await manager.query(
              'DELETE FROM core."user" WHERE id=$1 AND email=$2',
              [member.userId, emailFor(member)],
            );
          await manager.query(`DROP SCHEMA "${SCHEMA}" CASCADE`);
        });
        assert.equal(
          (
            await connectionSource.query(
              'SELECT id FROM core.workspace WHERE id=$1',
              [WORKSPACE_ID],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await connectionSource.query(
              'SELECT id FROM core."deliveryBatchItem" WHERE "workspaceId"=$1',
              [WORKSPACE_ID],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await connectionSource.query(
              'SELECT nspname FROM pg_namespace WHERE nspname=$1',
              [SCHEMA],
            )
          ).length,
          0,
        );
      }
    } finally {
      await Promise.all(
        sources
          .filter((source) => source.isInitialized)
          .map((source) => source.destroy()),
      );
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  }
  assert(complete);
  console.log(
    'PASS: independent PostgreSQL sessions preserve unique batch membership, optimistic planning revisions, close/edit conflicts, fresh project revocation, read-only snapshots and atomic rollback. Exact disposable workspace/schema/users removed; no external sends.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
