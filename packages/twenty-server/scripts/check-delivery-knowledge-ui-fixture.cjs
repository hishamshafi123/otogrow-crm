const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  WORKSPACE_ID,
  additions,
  exactIds,
  fingerprint,
  isAuthenticationLifecycleTable,
  locked,
  noNativeAutomation,
  operations,
  quote,
  readTables,
  syncDirectory,
  withoutHeartbeat,
  writeJournal,
} = require('./check-delivery-assistants-ui-fixture.cjs');

const FILE = '/tmp/otogrow-knowledge-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PROJECT_COUNT = 55;
const SOURCE_COUNT = 65;
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const fault = (stage) => {
  if (process.env.OTOGROW_KNOWLEDGE_UI_TEST_FAILURE === stage)
    throw new Error(`Injected knowledge fixture ${stage}`);
};
const inputFor = (fixture) => ({
  title: `${fixture.title} imported strategy meeting`,
  category: 'MEETING',
  meetingDate: '2026-10-31',
  sourceUrl: 'https://fathom.video/share/disposable-knowledge-fixture',
  transcript: `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nAmna: ${fixture.marker}: focus on qualified booked calls.\n\n00:00:04.000 --> 00:00:07.000\nClient: Keep the approved offer at 20%.`,
  knowledge: `${fixture.marker}: Reviewed meeting decision: focus on qualified booked calls and preserve the approved 20% offer. Source: 00:01–00:07. Task changes still require review.`,
});
const raceInputsFor = (fixture, id) =>
  [1, 2].map((projectIndex) => ({
    id,
    projectId: fixture.projects[projectIndex],
    revision: 0,
    title: `${fixture.title} collision project ${projectIndex}`,
    category: 'MEETING',
    meetingDate: '2026-10-31',
    sourceUrl: 'https://example.invalid/disposable-knowledge-collision',
    transcript: `${fixture.marker}: Exact collision source for owned project ${projectIndex}. Preserve this winning text.`,
    knowledge: `${fixture.marker}: Reviewed collision draft for project ${projectIndex}; no publication or task change.`,
  }));
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
        timeout = setTimeout(() => reject(new Error(label)), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

function read() {
  const metadata = lstatSync(FILE);
  assert(metadata.isFile() && !metadata.isSymbolicLink());
  assert.equal(metadata.mode & 0o077, 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  const recoveryOnly = ['inspect', 'cleanup'].includes(process.argv[2]);
  if (fixture.createdAt) {
    assert.equal(new Date(fixture.createdAt).toISOString(), fixture.createdAt);
  } else
    assert(
      recoveryOnly,
      'An older journal without creation time is inspect/cleanup only; do not invent lost-response proof.',
    );
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  assert.match(fixture.nonce, UUID);
  assert.equal(fixture.marker, `knowledge-ui:${fixture.nonce}`);
  assert.equal(
    fixture.title,
    `Disposable Knowledge ${fixture.nonce.slice(0, 8)}`,
  );
  assert.equal(fixture.projects.length, PROJECT_COUNT);
  assert.equal(fixture.sources.length, SOURCE_COUNT);
  const ids = [fixture.nonce, ...fixture.projects];
  for (const source of fixture.sources) {
    ids.push(source.id, source.versionId);
    assert.equal(source.projectId, fixture.projects[0]);
  }
  if (fixture.plannedId) {
    ids.push(fixture.plannedId);
    if (fixture.plannedInput)
      assert.deepEqual(fixture.plannedInput, inputFor(fixture));
    else
      assert(
        recoveryOnly,
        'An older plan without its exact body is inspect/cleanup only.',
      );
  } else assert(!fixture.plannedInput);
  if (fixture.baseline)
    for (const key of ['actorId', 'actorUserId', 'userWorkspaceId'])
      assert.match(fixture[key], UUID);
  if (fixture.race) {
    ids.push(fixture.race.id);
    assert(
      ['PLANNED', 'RUNNING', 'VERIFIED', 'RECOVERED'].includes(
        fixture.race.status,
      ),
    );
    assert.deepEqual(
      fixture.race.inputs,
      raceInputsFor(fixture, fixture.race.id),
    );
    assert(Array.isArray(fixture.race.absences));
    assert(fixture.race.absences.every((index) => index === 0 || index === 1));
    assert.equal(
      new Set(fixture.race.absences).size,
      fixture.race.absences.length,
    );
    if (fixture.race.winnerProjectId)
      assert(
        fixture.race.inputs.some(
          (input) => input.projectId === fixture.race.winnerProjectId,
        ),
      );
    if (fixture.race.status === 'VERIFIED') {
      assert.deepEqual(fixture.race.absences, [0, 1]);
      assert.equal(fixture.race.proof.sessions.length, 2);
      assert.equal(
        new Set(fixture.race.proof.sessions.map((session) => session.pid)).size,
        2,
      );
      assert.equal(
        new Set(
          fixture.race.proof.sessions.map((session) => session.transaction),
        ).size,
        2,
      );
      for (const session of fixture.race.proof.sessions) {
        assert(Number.isSafeInteger(session.pid) && session.pid > 0);
        assert.match(session.transaction, /^\d+$/);
        assert.equal(session.sourceInserts, 1);
        assert.equal(session.sourceUpdates, 0);
      }
      assert.match(fixture.race.proof.rowsHash, /^[a-f0-9]{64}$/);
      assert([403, 409].includes(fixture.race.proof.losingStatus));
    }
  }
  for (const id of ids) assert.match(id, UUID);
  assert.equal(new Set(ids).size, ids.length);
  if (fixture.schema) quote(fixture.schema);
  return fixture;
}

async function ownedRows(manager, fixture) {
  const projectIds = fixture.projects;
  return {
    projects: await manager.query(
      'SELECT * FROM core."deliveryProject" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) ORDER BY id',
      [WORKSPACE_ID, projectIds],
    ),
    sources: await manager.query(
      'SELECT * FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1 AND "projectId"=ANY($2::uuid[]) ORDER BY id',
      [WORKSPACE_ID, projectIds],
    ),
    versions: await manager.query(
      'SELECT version.* FROM core."deliveryKnowledgeVersion" version JOIN core."deliveryKnowledgeSource" source ON source."workspaceId"=version."workspaceId" AND source.id=version."sourceId" WHERE source."workspaceId"=$1 AND source."projectId"=ANY($2::uuid[]) ORDER BY version.id',
      [WORKSPACE_ID, projectIds],
    ),
    events: await manager.query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=ANY($2::uuid[]) ORDER BY id',
      [WORKSPACE_ID, projectIds],
    ),
  };
}

async function validate(manager, fixture) {
  const currentOperations = await operations(manager);
  assert.equal(
    fingerprint(withoutHeartbeat(currentOperations.state)),
    fixture.baseline.operations.hash,
  );
  await noNativeAutomation(manager, fixture, [
    'deliveryknowledgesource',
    'deliveryknowledgeversion',
  ]);
  const tables = await readTables(manager, fixture);
  const extra = additions(tables, fixture);
  const rows = await ownedRows(manager, fixture);
  const hasSeed = rows.projects.length > 0;
  if (hasSeed) {
    exactIds(
      rows.projects,
      fixture.projects,
      'All owned projects must remain.',
    );
    assert.equal(fingerprint(rows.projects), fixture.seed.projects);
    const seedIds = new Set(fixture.sources.map((source) => source.id));
    const seeded = rows.sources.filter((source) => seedIds.has(source.id));
    const seededVersions = rows.versions.filter((version) =>
      seedIds.has(version.sourceId),
    );
    assert.equal(fingerprint(seeded), fixture.seed.sources);
    assert.equal(fingerprint(seededVersions), fixture.seed.versions);
    const created = rows.sources.filter((source) => !seedIds.has(source.id));
    assert(
      created.length <=
        Number(Boolean(fixture.plannedId)) + Number(Boolean(fixture.race)),
    );
    const createdVersions = rows.versions.filter(
      (version) => !seedIds.has(version.sourceId),
    );
    for (const source of created) {
      const isRace = source.id === fixture.race?.id;
      const expectedInput = isRace
        ? fixture.race.inputs.find(
            (input) => input.projectId === source.projectId,
          )
        : source.id === fixture.plannedId &&
            source.projectId === fixture.projects[0]
          ? (fixture.plannedInput ?? inputFor(fixture))
          : null;
      assert(
        expectedInput,
        'Only the exact planned UI source or either exact race candidate may be added.',
      );
      assert.equal(source.createdBy, fixture.actorId);
      assert.equal(source.currentVersion, 1);
      assert((isRace ? [1] : [1, 2]).includes(source.revision));
      assert.equal(source.publishedVersion, source.revision === 2 ? 1 : null);
      assert.equal(
        source.publishedBy,
        source.revision === 2 ? fixture.actorId : null,
      );
      assert.equal(source.publishedAt !== null, source.revision === 2);
      const sourceVersions = createdVersions.filter(
        (version) => version.sourceId === source.id,
      );
      assert.equal(sourceVersions.length, 1);
      const version = sourceVersions[0];
      assert.equal(version.sourceId, source.id);
      assert.equal(version.version, 1);
      assert.equal(version.createdBy, fixture.actorId);
      for (const [key, value] of Object.entries(expectedInput).filter(
        ([key]) => !['id', 'projectId', 'revision'].includes(key),
      )) {
        const observed =
          key === 'meetingDate'
            ? (
                await manager.query(
                  'SELECT "meetingDate"::text AS value FROM core."deliveryKnowledgeVersion" WHERE "workspaceId"=$1 AND id=$2',
                  [WORKSPACE_ID, version.id],
                )
              )[0].value
            : version[key];
        assert.equal(
          observed,
          value,
          `Only the exact planned ${key} may be saved.`,
        );
      }
      const sourceEvents = rows.events.filter(
        (event) => event.sourceId === source.id,
      );
      assert.equal(sourceEvents.length, source.revision);
      const ordered = [...sourceEvents].sort(
        (left, right) =>
          Number(left.changes[0].after) - Number(right.changes[0].after),
      );
      for (const [index, event] of ordered.entries()) {
        assert.equal(event.sourceId, source.id);
        assert.equal(event.sourceType, 'brand-knowledge');
        assert.equal(event.actorId, fixture.actorId);
        assert.equal(event.actorType, 'HUMAN');
        assert.equal(event.projectId, source.projectId);
        assert.equal(event.taskId, null);
        assert.equal(event.clientId, null);
        assert.equal(
          event.action,
          index === 0 ? 'KNOWLEDGE_DRAFT_SAVED' : 'KNOWLEDGE_PUBLISHED',
        );
        assert.deepEqual(event.changes, [
          {
            field: 'revision',
            before: String(index),
            after: String(index + 1),
          },
        ]);
      }
    }
    assert.equal(createdVersions.length, created.length);
    assert.equal(
      rows.events.length,
      created.reduce((count, source) => count + source.revision, 0),
    );
    if (fixture.race?.status === 'VERIFIED')
      assert.equal(
        fingerprint(raceRows(rows, fixture.race.id)),
        fixture.race.proof.rowsHash,
        'A verified race source and history must remain byte-for-byte unchanged.',
      );
  } else {
    assert.equal(
      rows.sources.length + rows.versions.length + rows.events.length,
      0,
    );
  }
  const expected = new Map([
    ['core.deliveryProject', rows.projects.map((row) => row.id)],
    ['core.deliveryKnowledgeSource', rows.sources.map((row) => row.id)],
    ['core.deliveryKnowledgeVersion', rows.versions.map((row) => row.id)],
    ['core.otogrowActivityEvent', rows.events.map((row) => row.id)],
  ]);
  for (const table of extra)
    exactIds(
      table.rows,
      expected.get(`${table.schema}.${table.name}`) ?? [],
      `Unowned addition to ${table.name}.`,
    );
  return { hasSeed, rows, tables };
}

async function create() {
  assert(!existsSync(FILE), 'Recover the existing ownership journal first.');
  const nonce = randomUUID();
  const projects = Array.from({ length: PROJECT_COUNT }, () => randomUUID());
  const fixture = {
    version: 1,
    createdAt: new Date().toISOString(),
    nonce,
    workspaceId: WORKSPACE_ID,
    marker: `knowledge-ui:${nonce}`,
    title: `Disposable Knowledge ${nonce.slice(0, 8)}`,
    status: 'CREATING',
    projects,
    sources: Array.from({ length: SOURCE_COUNT }, (_, index) => ({
      id: randomUUID(),
      versionId: randomUUID(),
      projectId: projects[0],
      index,
    })),
    cleanupAttempts: [],
  };
  write(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT "databaseSchema","activationStatus" FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert.equal(workspace.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    const admins = await manager.query(
      `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId" FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(admins.length, 1);
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    const original = await operations(manager);
    await noNativeAutomation(manager, fixture, [
      'deliveryknowledgesource',
      'deliveryknowledgeversion',
    ]);
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      operations: {
        id: original.id,
        hash: fingerprint(withoutHeartbeat(original.state)),
      },
    };
    fixture.status = 'PREPARED';
    write(fixture);
    for (const [index, id] of projects.entries())
      await manager.query(
        'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,\'[]\')',
        [
          id,
          WORKSPACE_ID,
          `${fixture.title} project ${String(index).padStart(2, '0')}`,
        ],
      );
    for (const source of fixture.sources) {
      const createdAt = `2020-02-21T09:00:${String(Math.floor(source.index / 10)).padStart(2, '0')}.123${String(source.index % 10).padStart(3, '0')}Z`;
      await manager.query(
        'INSERT INTO core."deliveryKnowledgeSource" (id,"workspaceId","projectId","createdBy",revision,"currentVersion","publishedVersion","publishedBy","publishedAt","createdAt") VALUES($1,$2,$3,$4,1,1,NULL,NULL,NULL,$5)',
        [source.id, WORKSPACE_ID, source.projectId, fixture.actorId, createdAt],
      );
      await manager.query(
        'INSERT INTO core."deliveryKnowledgeVersion" (id,"workspaceId","sourceId",version,title,category,"meetingDate","sourceUrl",transcript,knowledge,"createdBy","createdAt") VALUES($1,$2,$3,1,$4,$5,\'2026-10-31\',\'\',$6,$7,$8,$9)',
        [
          source.versionId,
          WORKSPACE_ID,
          source.id,
          `${fixture.title} source ${String(source.index).padStart(2, '0')}`,
          source.index % 2 ? 'MEETING' : 'BRAND_FACTS',
          `${fixture.marker}: PRIVATE_TRANSCRIPT_${source.index} ${'e'.repeat(source.index === 0 ? 190000 : 2000)}`,
          `${fixture.marker}: reviewed source ${source.index}`,
          fixture.actorId,
          createdAt,
        ],
      );
    }
    const seeded = await ownedRows(manager, fixture);
    fixture.seed = {
      projects: fingerprint(seeded.projects),
      sources: fingerprint(seeded.sources),
      versions: fingerprint(seeded.versions),
    };
    write(fixture);
    fault('create-before-commit');
  });
  fault('create-after-commit');
  fixture.status = 'READY';
  write(fixture);
  print(fixture);
}

function print(fixture) {
  console.log(
    JSON.stringify({
      status: fixture.status,
      projectId: fixture.projects[0],
      otherProjectId: fixture.projects[1],
      projectCount: PROJECT_COUNT,
      sourceCount: SOURCE_COUNT,
      title: fixture.title,
      plannedId: fixture.plannedId ?? null,
      plannedInput: inputFor(fixture),
      race: fixture.race
        ? {
            id: fixture.race.id,
            status: fixture.race.status,
            winnerProjectId: fixture.race.winnerProjectId ?? null,
          }
        : null,
    }),
  );
}

async function inspect(fixture) {
  const observation = await connectionSource.transaction(async (manager) => {
    await locked(manager);
    return validate(manager, fixture);
  });
  if (observation.hasSeed && fixture.status === 'PREPARED')
    fixture.status = 'READY';
  fixture.inspection = {
    at: new Date().toISOString(),
    hasSeed: observation.hasSeed,
  };
  write(fixture);
  print(fixture);
}

async function plan(fixture, id) {
  assert.match(id, UUID);
  assert(!fixture.plannedId || fixture.plannedId === id);
  assert(!fixture.sources.some((source) => source.id === id));
  assert(
    !fixture.projects.includes(id) &&
      id !== fixture.nonce &&
      id !== fixture.race?.id,
  );
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    await validate(manager, fixture);
    const existing = await manager.query(
      'SELECT id FROM core."deliveryKnowledgeSource" WHERE id=$1',
      [id],
    );
    assert.equal(
      existing.length,
      0,
      'Plan the exact UI identity before saving it.',
    );
  });
  fixture.plannedId = id;
  fixture.plannedInput = inputFor(fixture);
  write(fixture);
  print(fixture);
}

const unrelatedRows = (rows, raceId) => ({
  projects: rows.projects,
  sources: rows.sources.filter((source) => source.id !== raceId),
  versions: rows.versions.filter((version) => version.sourceId !== raceId),
  events: rows.events.filter((event) => event.sourceId !== raceId),
});
const raceRows = (rows, raceId) => ({
  sources: rows.sources.filter((source) => source.id === raceId),
  versions: rows.versions.filter((version) => version.sourceId === raceId),
  events: rows.events.filter((event) => event.sourceId === raceId),
});

async function race(fixture) {
  const {
    WorkspaceEntity,
  } = require('../dist/engine/core-modules/workspace/workspace.entity');
  const {
    OtogrowAccessService,
  } = require('../dist/modules/otogrow-access/otogrow-access.service');
  const {
    DeliveryService,
  } = require('../dist/modules/delivery/delivery.service');
  const {
    DeliveryKnowledgeService,
  } = require('../dist/modules/delivery/knowledge/delivery-knowledge.service');
  const {
    DeliveryKnowledgeSourceEntity,
  } = require('../dist/modules/delivery/knowledge/entities/delivery-knowledge-source.entity');
  const preflight = await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const observation = await validate(manager, fixture);
    assert(
      observation.hasSeed,
      'Create the exact committed fixture before the race.',
    );
    const workspace = await manager
      .getRepository(WorkspaceEntity)
      .findOneBy({ id: WORKSPACE_ID });
    assert(
      workspace &&
        workspace.activationStatus === 'ACTIVE' &&
        workspace.databaseSchema === fixture.schema,
    );
    const admins = await manager.query(
      `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId" FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member.id=$2 AND membership.id=$3 AND member."userId"=$4 AND member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true`,
      [
        WORKSPACE_ID,
        fixture.actorId,
        fixture.userWorkspaceId,
        fixture.actorUserId,
      ],
    );
    assert.deepEqual(
      admins,
      [
        {
          memberId: fixture.actorId,
          userId: fixture.actorUserId,
          userWorkspaceId: fixture.userWorkspaceId,
        },
      ],
      'The original active native administrator must still be verified.',
    );
    if (!fixture.race) {
      const id = randomUUID();
      assert(
        ![
          fixture.nonce,
          ...fixture.projects,
          ...fixture.sources.flatMap((source) => [source.id, source.versionId]),
          fixture.plannedId,
        ].includes(id),
      );
      assert.equal(
        (
          await manager.query(
            'SELECT id FROM core."deliveryKnowledgeSource" WHERE id=$1',
            [id],
          )
        ).length,
        0,
      );
      fixture.race = {
        id,
        inputs: raceInputsFor(fixture, id),
        status: 'PLANNED',
        absences: [],
      };
      write(fixture);
    }
    const existing = raceRows(observation.rows, fixture.race.id);
    if (existing.sources.length)
      return {
        workspace,
        existing: true,
        winnerProjectId: existing.sources[0].projectId,
      };
    assert.equal(
      (
        await manager.query(
          'SELECT id FROM core."deliveryKnowledgeSource" WHERE id=$1',
          [fixture.race.id],
        )
      ).length,
      0,
      'The race identity must be globally absent before another attempt.',
    );
    const active = await manager.query(
      'SELECT pid FROM pg_stat_activity WHERE application_name=ANY($1::text[]) AND pid<>pg_backend_pid()',
      [[0, 1].map((index) => `knowledge-race:${fixture.nonce}:${index}`)],
    );
    assert.equal(
      active.length,
      0,
      'A prior race session is still present; preserve the journal.',
    );
    fixture.race.status = 'PLANNED';
    fixture.race.absences = [];
    fixture.race.unrelatedBefore = fingerprint(
      unrelatedRows(observation.rows, fixture.race.id),
    );
    write(fixture);
    return { workspace, existing: false };
  });
  if (preflight.existing) {
    if (fixture.race.status !== 'VERIFIED') fixture.race.status = 'RECOVERED';
    if (fixture.race.winnerProjectId)
      assert.equal(fixture.race.winnerProjectId, preflight.winnerProjectId);
    fixture.race.winnerProjectId = preflight.winnerProjectId;
    write(fixture);
    print(fixture);
    console.log(
      fixture.race.status === 'VERIFIED'
        ? 'Previously verified race is unchanged; no command repeated.'
        : 'Recovered only the exact journalled race winner. The interrupted process outcome is unverified; inspect or clean this fixture.',
    );
    return;
  }
  fault('race-before-start');
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        migrationsRun: false,
        synchronize: false,
        dropSchema: false,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `knowledge-race:${fixture.nonce}:${index}`,
        },
      }),
  );
  const runners = [];
  const pending = [];
  const barrier = { arrivals: new Set(), ready: deferred(), cancelled: false };
  const sessions = [];
  let armed = true;
  try {
    for (const source of sources) await source.initialize();
    for (const source of sources) {
      const runner = source.createQueryRunner();
      await runner.connect();
      runners.push(runner);
    }
    const scoped = runners.map((runner, index) => ({
      manager: runner.manager,
      getRepository: (...arguments_) =>
        runner.manager.getRepository(...arguments_),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: async (operation) => {
        await runner.startTransaction();
        const manager = runner.manager;
        const originalRepository = manager.getRepository;
        const originalQuery = runner.query;
        const evidence = { sourceInserts: 0, sourceUpdates: 0 };
        runner.query = (...arguments_) => {
          const sql = arguments_[0];
          if (typeof sql === 'string') {
            if (
              /\bINSERT\s+INTO\s+(?:"core"\.)?"deliveryKnowledgeSource"/i.test(
                sql,
              )
            )
              evidence.sourceInserts++;
            if (/\bUPDATE\s+(?:"core"\.)?"deliveryKnowledgeSource"/i.test(sql))
              evidence.sourceUpdates++;
          }
          return originalQuery.apply(runner, arguments_);
        };
        manager.getRepository = (entity) => {
          const repository = originalRepository.call(manager, entity);
          if (entity !== DeliveryKnowledgeSourceEntity) return repository;
          return new Proxy(repository, {
            get(target, property) {
              if (property === 'findOneBy')
                return async (where) => {
                  const observed = await target.findOneBy(where);
                  if (
                    armed &&
                    where.id === fixture.race.id &&
                    Object.keys(where).length === 1 &&
                    !observed
                  ) {
                    try {
                      assert(
                        !barrier.arrivals.has(index),
                        'Each independent transaction reaches absence once.',
                      );
                      barrier.arrivals.add(index);
                      fixture.race.absences = [...barrier.arrivals].sort();
                      write(fixture);
                      if (barrier.arrivals.size === 2) {
                        fault('race-after-both-absence');
                        barrier.ready.resolve();
                      }
                      await bounded(
                        barrier.ready.promise,
                        'Both independent sources must observe global absence before either insert.',
                      );
                      assert(
                        !barrier.cancelled,
                        'An interrupted barrier cannot release a new write.',
                      );
                    } catch (error) {
                      barrier.cancelled = true;
                      barrier.ready.resolve();
                      throw error;
                    }
                  }
                  return observed;
                };
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        };
        try {
          await runner.query("SET LOCAL lock_timeout='10s'");
          await runner.query("SET LOCAL statement_timeout='10s'");
          const [identity] = await runner.query(
            'SELECT pg_backend_pid() AS pid,txid_current()::text AS "transaction"',
          );
          if (armed) sessions[index] = { ...identity, ...evidence };
          const result = await operation(manager);
          assert(
            !armed || !barrier.cancelled,
            'An expired race may not commit a late source.',
          );
          await runner.commitTransaction();
          return result;
        } catch (error) {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          throw error;
        } finally {
          if (armed && sessions[index])
            Object.assign(sessions[index], evidence);
          manager.getRepository = originalRepository;
          runner.query = originalQuery;
        }
      },
    }));
    const services = scoped.map((source) => {
      const access = new OtogrowAccessService(source, {
        userHasWorkspaceSettingPermission: async ({
          workspaceId,
          userWorkspaceId,
        }) =>
          workspaceId === WORKSPACE_ID &&
          userWorkspaceId === fixture.userWorkspaceId,
      });
      return new DeliveryKnowledgeService(
        source,
        new DeliveryService(source, access),
      );
    });
    fixture.race.status = 'RUNNING';
    write(fixture);
    for (const [index, service] of services.entries()) {
      const promise = service.save(
        preflight.workspace,
        fixture.actorId,
        fixture.userWorkspaceId,
        fixture.race.inputs[index],
      );
      pending.push(promise);
      void promise.catch(() => undefined);
    }
    const results = await bounded(
      Promise.allSettled(pending),
      'Independent collision commands did not settle within ten seconds.',
    );
    assert.deepEqual([...barrier.arrivals].sort(), [0, 1]);
    assert.equal(
      new Set(sessions.map((session) => session.pid)).size,
      2,
      'Use two actual PostgreSQL sessions.',
    );
    assert.equal(
      new Set(sessions.map((session) => session.transaction)).size,
      2,
      'Use two actual transactions.',
    );
    for (const session of sessions) {
      assert.equal(session.sourceInserts, 1);
      assert.equal(
        session.sourceUpdates,
        0,
        'A new global ID must never become an ORM update.',
      );
    }
    const winners = results
      .map((result, index) => ({ ...result, index }))
      .filter((result) => result.status === 'fulfilled');
    const losers = results
      .map((result, index) => ({ ...result, index }))
      .filter((result) => result.status === 'rejected');
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(winners[0].value, fixture.race.id);
    assert(
      [403, 409].includes(losers[0].reason?.getStatus?.()),
      'The loser must return an explicit forbidden/conflict response.',
    );
    armed = false;
    const beforeRetry = await connectionSource.transaction(async (manager) => {
      await locked(manager);
      const observation = await validate(manager, fixture);
      const owned = raceRows(observation.rows, fixture.race.id);
      assert.equal(owned.sources.length, 1);
      assert.equal(
        owned.sources[0].projectId,
        fixture.race.inputs[winners[0].index].projectId,
      );
      assert.equal(
        fingerprint(unrelatedRows(observation.rows, fixture.race.id)),
        fixture.race.unrelatedBefore,
        'Unrelated UI publication, seeds and tasks must remain unchanged.',
      );
      return fingerprint(owned);
    });
    await assert.rejects(
      services[losers[0].index].save(
        preflight.workspace,
        fixture.actorId,
        fixture.userWorkspaceId,
        fixture.race.inputs[losers[0].index],
      ),
      (error) => [403, 409].includes(error.getStatus?.()),
    );
    await connectionSource.transaction(async (manager) => {
      await locked(manager);
      const observation = await validate(manager, fixture);
      assert.equal(
        fingerprint(raceRows(observation.rows, fixture.race.id)),
        beforeRetry,
        'The losing project must not change the committed owner, body, version or activity.',
      );
      assert.equal(
        fingerprint(unrelatedRows(observation.rows, fixture.race.id)),
        fixture.race.unrelatedBefore,
      );
    });
    fault('race-after-commit');
    fixture.race.status = 'VERIFIED';
    fixture.race.winnerProjectId =
      fixture.race.inputs[winners[0].index].projectId;
    fixture.race.proof = {
      sessions,
      losingStatus: losers[0].reason.getStatus(),
      rowsHash: beforeRetry,
      at: new Date().toISOString(),
    };
    write(fixture);
    print(fixture);
    console.log(
      'PASS genuine two-session strict-insert collision: both globally absent, one exact owner/version/activity committed, one explicit conflict, losing-project retry unchanged; original projects, publication, tasks and all protected sources retained.',
    );
  } finally {
    barrier.cancelled = true;
    barrier.ready.resolve();
    await Promise.allSettled(pending);
    for (const runner of runners) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      if (!runner.isReleased) await runner.release();
    }
    for (const source of sources)
      if (source.isInitialized) await source.destroy();
  }
}

async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      const rows = await manager.query(
        'SELECT id FROM core."deliveryProject" WHERE id=ANY($1::uuid[])',
        [fixture.projects],
      );
      assert.equal(rows.length, 0);
      fixture.noCommittedSeed = true;
      return;
    }
    const observation = await validate(manager, fixture);
    if (observation.hasSeed) {
      fixture.cleanupAttempts.push({
        at: new Date().toISOString(),
        owned: observation.rows,
      });
      fixture.status = 'CLEANUP_PREPARED';
      write(fixture);
      for (const [table, rows] of [
        ['deliveryKnowledgeVersion', observation.rows.versions],
        ['deliveryKnowledgeSource', observation.rows.sources],
        ['otogrowActivityEvent', observation.rows.events],
        ['deliveryProject', observation.rows.projects],
      ]) {
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM core.${quote(table)} WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) RETURNING id) SELECT id FROM removed`,
          [WORKSPACE_ID, rows.map((row) => row.id)],
        );
        exactIds(
          removed,
          rows.map((row) => row.id),
          `Remove only exact ${table}.`,
        );
      }
    } else
      fixture.cleanupRecoveredAfterCommit = fixture.cleanupAttempts.length > 0;
    const after = await readTables(manager, fixture);
    for (const [index, table] of after.entries())
      assert.equal(
        table.hash,
        isAuthenticationLifecycleTable(table)
          ? observation.tables[index].hash
          : fixture.baseline.tables[index].hash,
        `Protected ${table.name} changed during cleanup.`,
      );
    assert.equal(
      fingerprint(withoutHeartbeat((await operations(manager)).state)),
      fixture.baseline.operations.hash,
    );
    fault('cleanup-before-commit');
  });
  fault('cleanup-after-commit');
  fixture.status = 'CLEANED';
  write(fixture);
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    `Removed only exact owned knowledge projects/sources/versions/activity. Protected original core/native/finance/access/authentication/routing/transport/Operations matched. Receipt: ${receipt}`,
  );
}

async function main() {
  const command = process.argv[2];
  assert(['create', 'inspect', 'plan', 'race', 'cleanup'].includes(command));
  assert.equal(process.argv.length, command === 'plan' ? 4 : 3);
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  try {
    if (command === 'create') await create();
    else {
      const fixture = read();
      if (command === 'inspect') await inspect(fixture);
      else if (command === 'plan') await plan(fixture, process.argv[3]);
      else if (command === 'race') await race(fixture);
      else await cleanup(fixture);
    }
  } finally {
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    console.error(`Preserve ${FILE}; no unverified cleanup is permitted.`);
    process.exitCode = 1;
  });
