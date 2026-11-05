const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const {
  DeliveryCommitmentsService,
} = require('../dist/modules/delivery/commitments/delivery-commitments.service');
// Two real sessions need a committed disposable workspace; exact sentinel cleanup runs even on failure.
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
  DeliveryCapacityService,
} = require('../dist/modules/delivery/capacity/delivery-capacity.service');
const { DeliveryRevisionsService } = require('../dist/modules/delivery/revisions/delivery-revisions.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  DeliveryBusinessService,
} = require('../dist/modules/delivery/business/delivery-business.service');
const {
  DeliveryClientsService,
} = require('../dist/modules/delivery/clients/delivery-clients.service');
const {
  DeliveryMetaService,
} = require('../dist/modules/delivery/advertising/delivery-meta.service');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
const {
  newDeliveryBusiness,
} = require('../dist/modules/delivery/business/delivery-business.types');
const {
  newMetaReporting,
} = require('../dist/modules/delivery/advertising/delivery-meta.types');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');

const WORKSPACE_ID = randomUUID();
const SCHEMA = `snapshot_fixture_${WORKSPACE_ID.replaceAll('-', '_')}`;
const SENTINEL = `otogrow-snapshot-fixture:${WORKSPACE_ID}`;
const MEMBERS = ['Founder', 'Editor', 'Outsider'].map((name) => ({
  name,
  memberId: randomUUID(),
  userId: randomUUID(),
  userWorkspaceId: randomUUID(),
}));
const [FOUNDER, EDITOR, OUTSIDER] = MEMBERS;
const emailFor = (member) => `${member.userId}+snapshot@example.invalid`;
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
  assert.match(SCHEMA, /^snapshot_fixture_[a-f0-9_]{36}$/);
  const queries = [];
  const logger = {
    logQuery: (query) => queries.push(query),
    logQueryError() {},
    logQuerySlow() {},
    logSchemaBuild() {},
    logMigration() {},
    log() {},
  };
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: ['query'],
        logger,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${SENTINEL}:${index}`,
        },
      }),
  );
  const commitHooks = [null, null];
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    query: (...args) => source.query(...args),
    getRepository: (entity) => source.getRepository(entity),
    transaction: (callback) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='4s'");
        await manager.query("SET LOCAL statement_timeout='10s'");
        const result = await callback(manager);
        const hook = commitHooks[index];
        commitHooks[index] = null;
        if (hook) await hook();
        return result;
      }),
  }));
  let permissionHook = null;
  const permissions = {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) => {
      const hook = permissionHook;
      permissionHook = null;
      if (hook) await hook();
      return (
        workspaceId === WORKSPACE_ID &&
        userWorkspaceId === FOUNDER.userWorkspaceId
      );
    },
  };
  const access = scoped.map(
    (source) => new OtogrowAccessService(source, permissions),
  );
  const deliveries = scoped.map(
    (source, index) =>
      new DeliveryService(
        source,
        access[index],
        createIsolatedNativeTaskAccess(),
      ),
  );
  const capacity = scoped.map(
    (source, index) =>
      new DeliveryCapacityService(source, deliveries[index], access[index]),
  );
  const revisions = scoped.map((source,index)=>new DeliveryRevisionsService(source,deliveries[index], createIsolatedNativeTaskAccess()));
  const creative = new DeliveryCreativeService(
    scoped[0],
    deliveries[0],
    {},
    createIsolatedNativeTaskAccess(),
  );
  const operations = new DeliveryOperationsService(
    scoped[0],
    deliveries[0],
    creative,
    {
      findByWorkspaceId: async () =>
        assert.fail(
          'Snapshot must use its existing transaction for Telegram availability',
        ),
    },
    { get: () => 'http://localhost:3001' },
    { add: async () => assert.fail('Read must not enqueue work') },
    createIsolatedNativeTaskAccess(),
  );
  const business = new DeliveryBusinessService(
    scoped[0],
    deliveries[0],
    {},
    undefined,
    access[0],
  );
  const clients = scoped.map(
    (source, index) =>
      new DeliveryClientsService(
        source,
        deliveries[index],
        creative,
        new DeliveryCommitmentsService(source, deliveries[index]),
      ),
  );
  let providerCalls = 0;
  const meta = new DeliveryMetaService(
    scoped[0],
    deliveries[0],
    {},
    {
      account: async () => {
        providerCalls++;
        throw new Error('Fixture unavailable provider');
      },
    },
  );
  let workspace;
  let committed = false;
  let complete = false;
  const pending = [];
  const gates = [];
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
  const capture = async () => {
    const result = {};
    for (const table of [
      'deliveryOperations',
      'deliveryProject',
      'deliveryTask',
      'deliveryMember',
      'otogrowRole',
      'otogrowRoleAssignment',
      'otogrowMemberAccess',
      'otogrowAccessEvent',
      'otogrowActivityEvent',
    ])
      result[table] = await connectionSource.query(
        `SELECT xmin::text AS version,to_jsonb(record) AS record FROM core."${table}" record WHERE "workspaceId"=$1 ORDER BY id`,
        [WORKSPACE_ID],
      );
    result.nativeTasks = await connectionSource.query(
      `SELECT xmin::text AS version,to_jsonb(record) AS record FROM "${SCHEMA}".task record ORDER BY id`,
    );
    return result;
  };
  const unchanged = async (read) => {
    const before = await capture();
    queries.length = 0;
    await read();
    assert.deepEqual(
      await capture(),
      before,
      'Reads preserve exact JSON, row versions, timestamps, native rows and activity',
    );
    assert(
      !queries.some((query) =>
        /^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP)\b/i.test(
          query,
        ),
      ),
      'Reads execute no data writes or default provisioning',
    );
  };
  const snapshot = (service, member = FOUNDER) =>
    service.snapshot(workspace, member.memberId, member.userWorkspaceId);
  const allSnapshots = async () => {
    for (let count = 0; count < 2; count++) {
      for (const service of [
        deliveries[0],
        operations,
        business,
        clients[0],
        meta,
      ])
        await snapshot(service);
      for (const service of [deliveries[0], operations, business, meta])
        await snapshot(service, EDITOR);
    }
  };
  const taskCommand = (index, input, manager) =>
    deliveries[index].command(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      input,
      manager,
    );
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
      'Expected database advisory lock wait',
    );
  const saveState = (state) =>
    sources[0].transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${WORKSPACE_ID}`],
      );
      const repository = manager.getRepository(DeliveryOperationsEntity);
      const existing = await repository.findOneBy({
        workspaceId: WORKSPACE_ID,
      });
      await repository.save({ ...existing, workspaceId: WORKSPACE_ID, state });
    });
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
          `snapshot-${WORKSPACE_ID}`,
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
    await unchanged(async () => {
      await allSnapshots();
      assert.equal((await capture()).deliveryOperations.length, 0);
      assert.equal(
        (await capture()).otogrowRole.length,
        0,
        'Virtual default role reads do not materialize role rows',
      );
      await assert.rejects(snapshot(clients[0], EDITOR), { status: 403 });
      await assert.rejects(
        clients[0].portal(`${WORKSPACE_ID}.${'a'.repeat(64)}:bad`),
        { status: 404 },
      );
      await assert.rejects(
        meta.command(workspace, FOUNDER.memberId, FOUNDER.userWorkspaceId, {
          action: 'connect',
          configuration: {
            accountId: '1234567',
            token: 'fixture-token-never-sent',
            revision: 0,
            projectId: null,
            managerId: null,
            marketerId: null,
            enabled: false,
            time: '06:00',
          },
        }),
        /Fixture unavailable provider/,
      );
    });
    assert.equal(providerCalls, 1);
    await saveState(newDeliveryOperations());
    await unchanged(allSnapshots);
    const [{ state: legacyState }] = await sources[0].query(
      'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [WORKSPACE_ID],
    );
    for (const key of ['business', 'clients', 'metaReporting'])
      assert.equal(
        Object.hasOwn(legacyState, key),
        false,
        'Reading defaults does not write missing domains',
      );

    const companyId = randomUUID();
    await sources[0].query(
      `INSERT INTO "${SCHEMA}".company (id,name) VALUES ($1,'Snapshot client')`,
      [companyId],
    );
    let response = await taskCommand(0, {
      action: 'project',
      name: 'Snapshot fixture project',
      companyId,
      memberIds: [EDITOR.memberId],
    });
    let project = response.projects[0];
    const simultaneousEdits = [0, 1].map((index) => ({
      action: 'project',
      id: project.id,
      revision: project.revision,
      name: `Concurrent project edit ${index}`,
      companyId,
      memberIds: [EDITOR.memberId],
    }));
    const projectResults = await Promise.allSettled(
      simultaneousEdits.map((input, index) => taskCommand(index, input)),
    );
    assert.equal(
      projectResults.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      projectResults.filter(
        (result) =>
          result.status === 'rejected' && result.reason.status === 409,
      ).length,
      1,
    );
    response = await snapshot(deliveries[0], FOUNDER);
    project = response.projects.find((item) => item.id === project.id);
    assert.equal(project.revision, 2);
    assert.equal(
      project.name,
      simultaneousEdits[
        projectResults.findIndex((result) => result.status === 'fulfilled')
      ].name,
    );
    const [{ editsRecorded }] = await sources[0].query(
      'SELECT count(*)::int AS "editsRecorded" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceId"=$2 AND action=\'PROJECT_UPDATED\'',
      [WORKSPACE_ID, project.id],
    );
    assert.equal(editsRecorded, 1);
    commitHooks[0] = async () => {
      throw new Error('Injected project transaction failure');
    };
    await assert.rejects(
      taskCommand(0, {
        ...simultaneousEdits[0],
        revision: 2,
        name: 'Must roll back',
      }),
      /Injected project transaction failure/,
    );
    const afterFailedProject = (
      await snapshot(deliveries[0], FOUNDER)
    ).projects.find((item) => item.id === project.id);
    assert.equal(afterFailedProject.revision, 2);
    assert.equal(afterFailedProject.name, project.name);
    const [{ eventsAfterFailure }] = await sources[0].query(
      'SELECT count(*)::int AS "eventsAfterFailure" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceId"=$2 AND action=\'PROJECT_UPDATED\'',
      [WORKSPACE_ID, project.id],
    );
    assert.equal(eventsAfterFailure, 1);
    const slot = {
      memberId: EDITOR.memberId,
      date: '2026-11-01',
      minutes: 300,
      revision: 0,
    };
    const saveSlot = (index, input) =>
      capacity[index].save(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        input,
      );
    const slotResults = await Promise.allSettled([
      saveSlot(0, slot),
      saveSlot(1, { ...slot, minutes: 240 }),
    ]);
    assert.equal(
      slotResults.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      slotResults.filter(
        (result) =>
          result.status === 'rejected' && result.reason.status === 409,
      ).length,
      1,
    );
    const slotEntered = deferred(),
      slotRelease = deferred();
    gates.push(slotRelease);
    commitHooks[0] = async () => {
      slotEntered.resolve();
      await slotRelease.promise;
    };
    const heldSlot = saveSlot(0, { ...slot, date: '2026-11-02' });
    pending.push(heldSlot);
    await bounded(
      slotEntered.promise,
      'Availability save did not reach commit',
    );
    await bounded(
      saveSlot(1, { ...slot, memberId: OUTSIDER.memberId, date: '2026-11-02' }),
      'Independent availability should not wait for another member',
    );
    slotRelease.resolve();
    await heldSlot;
    commitHooks[0] = async () => {
      throw new Error('Injected availability failure');
    };
    await assert.rejects(
      saveSlot(0, { ...slot, revision: 1, minutes: 120 }),
      /Injected availability failure/,
    );
    const capacityView = await capacity[0].snapshot(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      { startDate: '2026-11-01' },
    );
    assert.equal(
      capacityView.availability.find(
        (row) => row.memberId === EDITOR.memberId && row.date === slot.date,
      ).revision,
      1,
    );
    console.log(
      'PASS simultaneous availability conflict, independent member/day writes and atomic rollback.',
    );
    const fields = {
      title: 'Snapshot fixture task',
      brief: 'Private task brief',
      service: 'SEO',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: EDITOR.memberId,
      reviewerId: FOUNDER.memberId,
      checklist: [],
      evidence: [],
    };
    response = await taskCommand(0, {
      action: 'create',
      projectId: project.id,
      fields,
    });
    const task = response.tasks[0];
    const roundIds=[randomUUID(),randomUUID()];
    for(let index=0;index<roundIds.length;index++) await sources[0].query('INSERT INTO core."deliveryRevision" (id,"workspaceId","taskId","projectId",round,"taskRevision",source,reason) VALUES ($1,$2,$3,$4,$5,$5,\'INTERNAL_REVIEW\',\'Race fixture\')',[roundIds[index],WORKSPACE_ID,task.id,project.id,index+1]);
    const roundInput={taskId:task.id,id:roundIds[0],revision:1,cause:'INTERNAL_DEFECT',effortMinutes:30};
    const saveRound=(index,input)=>revisions[index].save(workspace,FOUNDER.memberId,FOUNDER.userWorkspaceId,input);
    const results=await Promise.allSettled([saveRound(0,roundInput),saveRound(1,{...roundInput,cause:'SCOPE_CHANGE'})]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1);
    const roundEntered=deferred(),roundRelease=deferred();gates.push(roundRelease);
    commitHooks[0]=async()=>{roundEntered.resolve();await roundRelease.promise;};
    const heldRound=saveRound(0,{...roundInput,revision:2});pending.push(heldRound);
    await bounded(roundEntered.promise,'Revision edit did not reach commit');
    await bounded(saveRound(1,{...roundInput,id:roundIds[1]}),'Different revision rounds should save independently');
    roundRelease.resolve();await heldRound;
    commitHooks[0]=async()=>{throw new Error('Injected round failure');};
    await assert.rejects(saveRound(0,{...roundInput,revision:3}),/Injected round failure/);
    assert.equal((await sources[0].query('SELECT revision FROM core."deliveryRevision" WHERE id=$1',[roundIds[0]]))[0].revision,3);
    console.log('PASS simultaneous revision edits have one winner, separate rounds write independently, and failures roll back.');
    await operations.command(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        action: 'message',
        taskId: task.id,
        recipientId: EDITOR.memberId,
        text: 'Private addressed message',
      },
    );
    let clientResult = await clients[0].command(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        action: 'engagement',
        engagement: {
          revision: 0,
          projectId: project.id,
          name: 'Snapshot engagement',
          services: ['SEO'],
          billing: 'RETAINER',
          scope: 'Scoped work',
          allowance: 'Monthly',
          contact: 'Client',
          fields: [],
        },
      },
    );
    const engagement = clientResult.engagements[0];
    clientResult = await clients[0].command(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      { action: 'link', engagementId: engagement.id },
    );
    const credential = `${clientResult.token}:${clientResult.accessCode}`;
    const assetId = randomUUID();
    const finalAssetId = randomUUID();
    const shareId = randomUUID();
    const document = newCreativeDocument();
    document.assets.push({
      storageState: 'READY',
      id: finalAssetId,
      name: 'final.mp4',
      mimeType: 'video/mp4',
      size: 128,
      createdAt: new Date().toISOString(),
      uploadedBy: EDITOR.memberId,
      briefVersion: 1,
      productionVersion: 1,
      assemblyVersion: 1,
      shotId: null,
      shotVersion: null,
      kind: 'FINAL',
      parentAssetId: null,
      reviews: [],
    });
    await sources[0]
      .getRepository(DeliveryTaskEntity)
      .update(
        { workspaceId: WORKSPACE_ID, taskId: task.id },
        { details: { ...task.details, creative: document } },
      );

    const [{ state }] = await sources[0].query(
      'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [WORKSPACE_ID],
    );
    state.clients.engagements[0].assets.push({
      id: assetId,
      name: 'brand.png',
      mimeType: 'image/png',
      size: 42,
      createdAt: new Date().toISOString(),
    });
    state.clients.shares.push({
      id: shareId,
      engagementId: engagement.id,
      taskId: task.id,
      version: 1,
      kind: 'SUBMISSION',
      title: fields.title,
      content: 'Approved client content',
      links: [],
      assetId: finalAssetId,
      createdAt: new Date().toISOString(),
      sharedBy: FOUNDER.memberId,
      withdrawnAt: null,
      reviews: [],
    });
    state.business = newDeliveryBusiness();
    state.business.records.push({
      id: randomUUID(),
      revision: 1,
      kind: 'CONVERSATION',
      projectId: project.id,
      title: 'Private founder inbox',
      channel: 'EMAIL',
      ownerId: FOUNDER.memberId,
      private: true,
      grants: [],
      status: 'DRAFT',
      createdBy: FOUNDER.memberId,
    });
    state.metaReporting = newMetaReporting();
    state.metaReporting.connections.push({
      accountId: '1234567',
      revision: 1,
      projectId: project.id,
      managerId: FOUNDER.memberId,
      marketerId: EDITOR.memberId,
      ownerId: FOUNDER.memberId,
      userWorkspaceId: FOUNDER.userWorkspaceId,
      ciphertext: 'fixture-private-secret',
      name: 'Own ads',
      currency: 'USD',
      timezone: 'UTC',
      enabled: false,
      time: '06:00',
      lastSuccessAt: null,
      lastDate: null,
      error: null,
      retryAt: null,
      lease: null,
    });
    const report = {
      id: randomUUID(),
      accountId: '1234567',
      projectId: project.id,
      managerId: FOUNDER.memberId,
      marketerId: EDITOR.memberId,
      date: '2026-10-24',
      currency: 'USD',
      timezone: 'UTC',
      fetchedAt: new Date().toISOString(),
      account: null,
      ads: [],
      status: 'REVIEW',
      reviewedBy: null,
      reviewedAt: null,
      note: '',
      taskId: null,
    };
    state.metaReporting.reports.push(report, {
      ...report,
      id: randomUUID(),
      status: 'APPROVED',
      reviewedBy: FOUNDER.memberId,
    });
    await saveState(state);
    await unchanged(async () => {
      await allSnapshots();
      assert.equal((await snapshot(deliveries[0], EDITOR)).tasks.length, 1);
      assert.equal((await snapshot(deliveries[0], OUTSIDER)).tasks.length, 0);
      assert.equal((await snapshot(operations, OUTSIDER)).notices.length, 0);
      assert.equal((await snapshot(business, EDITOR)).records.length, 0);
      assert.equal((await snapshot(meta, EDITOR)).reports.length, 1);
      assert.equal((await snapshot(meta, OUTSIDER)).reports.length, 0);
      const visibleMeta = await snapshot(meta);
      assert.equal(visibleMeta.connections[0].hasToken, true);
      for (const key of ['ciphertext', 'ownerId', 'userWorkspaceId', 'lease'])
        assert(!Object.hasOwn(visibleMeta.connections[0], key));
      assert(
        !JSON.stringify(await snapshot(clients[0])).includes('"codeHash"'),
      );
      for (let count = 0; count < 2; count++) {
        const portal = await clients[0].portal(credential);
        assert.equal(portal.engagement.name, engagement.name);
        assert.equal(portal.assets[0].id, assetId);
        assert.equal(portal.shares[0].hasAsset, true);
        assert.equal(
          (await clients[0].asset(credential, shareId)).asset.name,
          'final.mp4',
        );
        assert.equal(
          (await clients[0].brandAsset(credential, assetId)).asset.name,
          'brand.png',
        );
        assert.equal(
          (
            await clients[0].staffBrandAsset(
              workspace,
              FOUNDER.memberId,
              FOUNDER.userWorkspaceId,
              engagement.id,
              assetId,
            )
          ).asset.name,
          'brand.png',
        );
      }
      await assert.rejects(clients[0].portal(`${clientResult.token}:wrong`), {
        status: 404,
      });
      await assert.rejects(clients[0].brandAsset(credential, randomUUID()), {
        status: 404,
      });
      await assert.rejects(clients[0].asset(credential, randomUUID()), {
        status: 404,
      });
      await assert.rejects(
        clients[0].staffBrandAsset(
          workspace,
          EDITOR.memberId,
          EDITOR.userWorkspaceId,
          engagement.id,
          assetId,
        ),
        { status: 403 },
      );
      for (const service of [
        deliveries[0],
        operations,
        business,
        clients[0],
        meta,
      ])
        await assert.rejects(
          service.snapshot(workspace, FOUNDER.memberId, EDITOR.userWorkspaceId),
          { status: 403 },
        );
    });

    // Concurrent reads share a lock; the real edit waits, then its new revision becomes visible.
    const reader = hold();
    permissionHook = reader.run;
    const reading = snapshot(deliveries[0], EDITOR);
    pending.push(reading);
    await bounded(reader.entered.promise, 'First reader did not start');
    assert.equal(
      (
        await bounded(
          snapshot(deliveries[1], EDITOR),
          'A second reader should not wait for the first',
        )
      ).tasks.length,
      1,
    );
    const editing = taskCommand(1, {
      action: 'edit',
      taskId: task.id,
      revision: task.revision,
      fields: { ...fields, title: 'Edited while reader open' },
    });
    pending.push(editing);
    await waitBlocked(secondPid);
    reader.release.resolve();
    assert.equal((await reading).tasks[0].title, fields.title);
    assert.equal(
      (await bounded(editing, 'Writer did not resume')).tasks[0].title,
      'Edited while reader open',
    );

    // An uncommitted project removal blocks a read, which then observes the committed revocation.
    const revoke = hold();
    commitHooks[0] = revoke.run;
    const removing = taskCommand(0, {
      action: 'project',
      id: project.id,
      revision: project.revision,
      name: project.name,
      companyId,
      memberIds: [],
    });
    pending.push(removing);
    await bounded(revoke.entered.promise, 'Revocation did not start');
    const afterRemoval = snapshot(deliveries[1], EDITOR);
    pending.push(afterRemoval);
    await waitBlocked(secondPid);
    revoke.release.resolve();
    await bounded(removing, 'Revocation did not commit');
    assert.equal((await afterRemoval).tasks.length, 0);
    await unchanged(async () => {
      assert.equal((await snapshot(operations, EDITOR)).notices.length, 0);
      assert.equal((await snapshot(meta, EDITOR)).reports.length, 0);
    });

    const directory = await access[0].directory(
      WORKSPACE_ID,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
    );
    const managerRole = directory.roles.find(
      (role) =>
        role.capabilities.includes('delivery.manage') &&
        !role.capabilities.includes('workspace.admin'),
    );
    await access[0].assignRoles(
      WORKSPACE_ID,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        memberId: EDITOR.memberId,
        revision: 0,
        roleIds: [managerRole.id],
        roleRevisions: [{ id: managerRole.id, revision: managerRole.revision }],
      },
    );
    assert.equal((await snapshot(clients[0], EDITOR)).engagements.length, 1);
    const revokeRole = hold();
    commitHooks[0] = revokeRole.run;
    const revoking = access[0].assignRoles(
      WORKSPACE_ID,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        memberId: EDITOR.memberId,
        revision: 1,
        roleIds: [],
        roleRevisions: [],
      },
    );
    pending.push(revoking);
    await bounded(revokeRole.entered.promise, 'Role revocation did not start');
    const forbidden = assert.rejects(snapshot(clients[1], EDITOR), {
      status: 403,
    });
    pending.push(forbidden);
    await waitBlocked(secondPid);
    revokeRole.release.resolve();
    await bounded(revoking, 'Role revocation did not commit');
    await forbidden;
    await unchanged(async () => {
      await assert.rejects(snapshot(clients[0], EDITOR), { status: 403 });
      await allSnapshots();
    });
    await sources[0].query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      EDITOR.userId,
    ]);
    await unchanged(async () => {
      for (const service of [
        deliveries[0],
        operations,
        business,
        clients[0],
        meta,
      ])
        await assert.rejects(snapshot(service, EDITOR), { status: 403 });
    });
    await clients[0].command(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      { action: 'revoke', id: clientResult.links[0].id },
    );
    await unchanged(async () => {
      await assert.rejects(clients[0].portal(credential), { status: 404 });
      await assert.rejects(clients[0].brandAsset(credential, assetId), {
        status: 404,
      });
    });
    complete = true;
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
              'SELECT id FROM core."deliveryOperations" WHERE "workspaceId"=$1',
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
    'PASS: all snapshots and client reads leave JSON/xmin/updatedAt/activity unchanged, missing rows and virtual defaults remain absent, credential/member failures do not write, parallel readers share locks, real edits wait safely, and project/role revocation is observed after commit. Isolated committed workspace/schema/users removed exactly; no live provider calls.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
