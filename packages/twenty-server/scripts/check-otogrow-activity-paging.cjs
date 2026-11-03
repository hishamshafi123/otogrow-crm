const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { ForbiddenException } = require('@nestjs/common');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowActivityService,
} = require('../dist/modules/otogrow-activity/otogrow-activity.service');

const HASH = /^[a-f0-9]{64}$/;
const EXACT_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = (value) =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identityKey = (workspaceId, memberId, userWorkspaceId) =>
  `${workspaceId}:${memberId}:${userWorkspaceId}`;
const filterFields = [
  'personId',
  'projectId',
  'clientId',
  'category',
  'action',
  'outcome',
  'from',
  'through',
];
const signature = async (query) =>
  (
    await query(
      `SELECT count(*)::text AS count,md5(COALESCE(string_agg(id::text||':'||md5(to_jsonb(event)::text),'|' ORDER BY id),'')) AS signature FROM core."otogrowActivityEvent" event`,
    )
  )[0];

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This checker has no commit or fixture-retention mode.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  const originalFetch = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error('Network is forbidden in activity paging acceptance.');
  };
  let runner;
  let baseline;
  let foreignSeeded = false;
  let proof;
  try {
    await connectionSource.initialize();
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const execute = runner.query.bind(runner);
    let reading = false;
    let seeding = false;
    let inserted = 0;
    const observations = [];
    runner.query = async (...arguments_) => {
      const sql = arguments_[0];
      if (/^\s*INSERT\b/i.test(sql)) {
        assert(!reading && seeding, 'A feed read cannot write.');
        assert(
          /^\s*INSERT INTO core\."otogrowActivityEvent"\s*\(/i.test(sql),
          'Only synthetic activity rows may be inserted.',
        );
        inserted++;
      } else if (/^\s*ROLLBACK\s*$/i.test(sql)) {
        assert(!reading && !seeding, 'Outer rollback is cleanup only.');
      } else
        assert(
          /^\s*(SELECT|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT|SET LOCAL)\b/i.test(
            sql,
          ),
          'DDL, source/role updates and arbitrary writes are forbidden.',
        );
      if (reading) observations.push({ kind: 'QUERY', sql });
      return execute(...arguments_);
    };
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    baseline = await signature((...arguments_) => runner.query(...arguments_));
    const [workspace] = await runner.query(
      'SELECT id FROM core.workspace WHERE "activationStatus"=\'ACTIVE\' ORDER BY id LIMIT 1',
    );
    assert(
      workspace,
      'An existing active local workspace is required; this checker creates no workspace.',
    );
    const [existingForeign] = await runner.query(
      'SELECT id FROM core.workspace WHERE id<>$1 ORDER BY id LIMIT 1',
      [workspace.id],
    );
    const foreignWorkspace = existingForeign ?? { id: randomUUID() };
    const administrator = {
      memberId: randomUUID(),
      userWorkspaceId: randomUUID(),
    };
    const secondAdministrator = {
      memberId: randomUUID(),
      userWorkspaceId: randomUUID(),
    };
    const otherMembership = {
      memberId: administrator.memberId,
      userWorkspaceId: randomUUID(),
    };
    const staff = { memberId: randomUUID(), userWorkspaceId: randomUUID() };
    const people = [randomUUID(), randomUUID()];
    const projects = [randomUUID(), randomUUID()];
    const clients = [randomUUID(), randomUUID()];
    const foreignPeople = [randomUUID(), randomUUID()];
    const foreignProjects = [randomUUID(), randomUUID()];
    const foreignClients = [randomUUID(), randomUUID()];
    const roleIds = [randomUUID(), randomUUID()];
    const nonceLetters = randomUUID()
      .replaceAll('-', '')
      .slice(0, 16)
      .replace(
        /[0-9a-f]/g,
        (character) => 'ABCDEFGHIJKLMNOP'[Number.parseInt(character, 16)],
      );
    const action = `ACTIVITY_PAGING_${nonceLetters}`;
    assert(
      /^[A-Z][A-Z_]{0,79}$/.test(action),
      'Keep fixture action names within the public activity filter contract.',
    );
    const current = {
      enabled: true,
      nativeAdministrator: true,
      capabilities: ['workspace.admin', 'delivery.manage'],
      roleIds: [...roleIds],
    };
    const allowed = new Set(
      [administrator, secondAdministrator, otherMembership].map((person) =>
        identityKey(workspace.id, person.memberId, person.userWorkspaceId),
      ),
    );
    allowed.add(
      identityKey(
        foreignWorkspace.id,
        administrator.memberId,
        administrator.userWorkspaceId,
      ),
    );
    const access = {
      accessForUser: async (workspaceId, memberId, userWorkspaceId) => {
        observations.push({ kind: 'ACCESS' });
        if (
          !current.enabled ||
          !allowed.has(identityKey(workspaceId, memberId, userWorkspaceId))
        )
          throw new ForbiddenException('Synthetic current access denied.');
        return {
          workspaceId,
          memberId,
          userWorkspaceId,
          nativeAdministrator: current.nativeAdministrator,
          capabilities: [...current.capabilities],
          roleIds: [...current.roleIds],
          grants: [],
        };
      },
    };
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (operation) => runner.manager.transaction(operation),
    };
    const activity = new OtogrowActivityService(scoped, access);
    const ids = new Set();
    const append = async (occurredAt, index, targetWorkspace = workspace) => {
      const id = randomUUID();
      const local = targetWorkspace.id === workspace.id;
      const scopedPeople = local ? people : foreignPeople;
      const scopedProjects = local ? projects : foreignProjects;
      const scopedClients = local ? clients : foreignClients;
      const person = scopedPeople[index % 2];
      seeding = true;
      try {
        await runner.query(
          `INSERT INTO core."otogrowActivityEvent" (id,"workspaceId","occurredAt","recordedAt","actorId","actorName","actorType","subjectMemberId","subjectName",category,action,outcome,summary,"projectId","projectName","clientId","clientName","taskId","taskName","agentName","sourceType","sourceId",changes)
          VALUES($1,$2,$3,now(),$4,$5,'HUMAN',$6,$7,$8,$9,$10,'Synthetic activity paging evidence',$11,'Synthetic project',$12,'Synthetic client',NULL,NULL,NULL,'project',$11,'[]'::jsonb)`,
          [
            id,
            targetWorkspace.id,
            occurredAt,
            person,
            `Synthetic person ${(index % 2) + 1}`,
            index % 3 === 0 ? scopedPeople[0] : null,
            index % 3 === 0 ? 'Synthetic person 1' : null,
            index % 4 === 0 ? 'AGENT' : 'DELIVERY',
            action,
            index % 4 === 0 ? 'SUCCEEDED' : 'RECORDED',
            scopedProjects[index % 2],
            scopedClients[index % 2],
          ],
        );
      } finally {
        seeding = false;
      }
      ids.add(id);
      return id;
    };
    for (let index = 0; index < 30; index++)
      await append('2026-11-01T06:00:00.123456Z', index);
    for (let index = 1; index <= 80; index++)
      await append(
        `2026-11-01T06:00:00.123${String(index).padStart(3, '0')}Z`,
        index + 30,
      );
    for (let index = 901; index <= 930; index++)
      await append(`2026-11-01T06:00:00.123${index}Z`, index + 110);
    await append('2026-11-01T06:00:00.123455Z', 201);
    for (let index = 100; index <= 116; index++)
      await append(`1900-01-01T00:00:00.000${index}Z`, index + 200);
    for (let index = 900; index <= 916; index++)
      await append(`2099-12-31T23:59:59.999${index}Z`, index + 300);
    const seedCount = inserted;
    let foreignId = null;
    if (existingForeign) {
      foreignId = await append(
        '2026-11-01T06:00:00.123456Z',
        401,
        foreignWorkspace,
      );
      foreignSeeded = true;
    }
    const expected = async (filter = {}, targetWorkspace = workspace) => {
      const values = [targetWorkspace.id, action];
      const where = ['"workspaceId"=$1', 'action=$2'];
      for (const name of [
        'personId',
        'projectId',
        'clientId',
        'category',
        'outcome',
      ])
        if (filter[name]) {
          values.push(filter[name]);
          const parameter = `$${values.length}`;
          where.push(
            name === 'personId'
              ? `("actorId"=${parameter} OR "subjectMemberId"=${parameter})`
              : `"${name}"=${parameter}`,
          );
        }
      for (const [name, operator] of [
        ['from', '>='],
        ['through', '<'],
      ])
        if (filter[name]) {
          values.push(filter[name]);
          where.push(`"occurredAt" ${operator} $${values.length}::timestamptz`);
        }
      return runner.query(
        `SELECT id,to_char("occurredAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM core."otogrowActivityEvent" WHERE ${where.join(' AND ')} ORDER BY "occurredAt" DESC,id DESC`,
        values,
      );
    };
    const feed = async (
      input = {},
      person = administrator,
      targetWorkspace = workspace,
    ) => {
      assert(!reading);
      reading = true;
      try {
        return await activity.feed(
          targetWorkspace,
          person.memberId,
          person.userWorkspaceId,
          { action, ...input },
        );
      } finally {
        reading = false;
      }
    };
    const deny = async (operation, status) => {
      await assert.rejects(
        operation,
        (error) => error?.getStatus?.() === status,
        `Expected safe ${status} rejection.`,
      );
    };
    const walk = async (filter = {}, limit = 11) => {
      const exact = await expected(filter);
      const visited = [];
      let cursor = null;
      let pages = 0;
      do {
        const page = await feed({ ...filter, cursor, limit });
        pages++;
        assert.equal(page.workspaceId, workspace.id);
        assert.equal(page.memberId, administrator.memberId);
        assert.equal(page.userWorkspaceId, administrator.userWorkspaceId);
        assert(page.events.length <= limit);
        visited.push(...page.events.map((event) => event.id));
        assert(!foreignId || !visited.includes(foreignId));
        assert(
          !page.people.some((person) => foreignPeople.includes(person.id)),
        );
        assert(
          !page.projects.some((project) =>
            foreignProjects.includes(project.id),
          ),
        );
        assert(
          !page.clients.some((client) => foreignClients.includes(client.id)),
        );
        if (page.nextCursor) {
          const decoded = decode(page.nextCursor);
          const last = page.events.at(-1);
          const source = exact.find((event) => event.id === last.id);
          assert(source);
          assert.equal(decoded.version, 2);
          assert.equal(decoded.workspaceId, workspace.id);
          assert.match(decoded.scope, HASH);
          assert.match(decoded.filter, HASH);
          assert.match(decoded.at, EXACT_TIME);
          assert.equal(decoded.id, last.id);
          assert.equal(decoded.at, source.at);
          assert.equal(
            last.occurredAt,
            new Date(source.at).toISOString(),
            'Public display stays milliseconds while cursor retains database precision.',
          );
          assert.equal(
            decoded.filter,
            digest(
              filterFields.map((name) => ({ action, ...filter })[name] ?? null),
            ),
          );
        }
        cursor = page.nextCursor;
        assert(pages <= 100, 'Pagination must terminate.');
      } while (cursor);
      assert.deepEqual(
        visited,
        exact.map((event) => event.id),
        'Every matching event appears once in exact database order.',
      );
      assert.equal(new Set(visited).size, visited.length);
      return { count: visited.length, pages };
    };
    const complete = await walk({}, 7);
    assert.equal(complete.count, seedCount);
    assert(complete.pages > 20);
    for (const filter of [
      { personId: people[0] },
      { projectId: projects[0] },
      { clientId: clients[1] },
      { category: 'AGENT' },
      { outcome: 'SUCCEEDED' },
      {
        from: '1900-01-01T00:00:00.000000Z',
        through: '1900-01-01T00:00:00.001000Z',
      },
      {
        from: '2099-12-31T23:59:59.999000Z',
        through: '2100-01-01T00:00:00.000000Z',
      },
    ])
      await walk(filter, 5);
    const micro = await walk(
      {
        from: '2026-11-01T06:00:00.123455Z',
        through: '2026-11-01T06:00:00.123456Z',
      },
      2,
    );
    assert.equal(
      micro.count,
      1,
      'The exact from is included and exact through excluded.',
    );
    const rounded = await walk(
      {
        from: '2026-11-01T06:00:00.1234554Z',
        through: '2026-11-01T06:00:00.1234564Z',
      },
      2,
    );
    assert.equal(
      rounded.count,
      1,
      'Longer fractional input follows PostgreSQL timestamp precision.',
    );
    for (const range of [
      {
        from: '2026-11-01T06:00:00.123456Z',
        through: '2026-11-01T06:00:00.123455Z',
      },
      {
        from: '2026-11-01T06:00:00.123456Z',
        through: '2026-11-01T06:00:00.123456Z',
      },
      {
        from: '2026-11-01T06:00:00.1234559Z',
        through: '2026-11-01T06:00:00.1234561Z',
      },
    ])
      await deny(() => feed(range), 400);
    const first = await feed({ limit: 3 });
    assert(first.nextCursor);
    const cursor = first.nextCursor;
    const decoded = decode(cursor);
    assert(
      observations.some(
        (item) =>
          item.kind === 'QUERY' &&
          item.sql.includes('pg_advisory_xact_lock_shared'),
      ),
    );
    for (const filter of [
      { personId: people[0] },
      { projectId: projects[0] },
      { clientId: clients[1] },
      { category: 'AGENT' },
      { outcome: 'SUCCEEDED' },
      { action: 'DIFFERENT_PAGING_ACTION' },
      { from: '1900-01-01T00:00:00.000000Z' },
      { through: '2100-01-01T00:00:00.000000Z' },
    ])
      await deny(() => feed({ ...filter, cursor }), 400);
    await deny(() => feed({ cursor }, secondAdministrator), 400);
    await deny(() => feed({ cursor }, otherMembership), 400);
    await deny(() => feed({ cursor }, administrator, foreignWorkspace), 400);
    const original = {
      capabilities: [...current.capabilities],
      roleIds: [...current.roleIds],
      nativeAdministrator: current.nativeAdministrator,
    };
    current.roleIds.reverse();
    current.capabilities.reverse();
    await feed({ cursor, limit: 9 });
    for (const change of [
      { roleIds: [...original.roleIds, randomUUID()] },
      { capabilities: [...original.capabilities, 'finance.read'] },
      { nativeAdministrator: false },
    ]) {
      Object.assign(current, original, change);
      await deny(() => feed({ cursor }), 400);
    }
    Object.assign(current, original);
    current.capabilities = ['delivery.manage'];
    await deny(() => feed({ cursor }), 403);
    Object.assign(current, original);
    current.enabled = false;
    await deny(() => feed({ cursor }), 403);
    current.enabled = true;
    await deny(() => feed({}, staff), 403);
    const cross = await feed({}, administrator, foreignWorkspace);
    assert.equal(cross.workspaceId, foreignWorkspace.id);
    assert(!cross.people.some((person) => people.includes(person.id)));
    assert(!cross.projects.some((project) => projects.includes(project.id)));
    assert(!cross.clients.some((client) => clients.includes(client.id)));
    assert(
      cross.events.every(
        (event) => !ids.has(event.id) || event.id === foreignId,
      ),
    );
    if (foreignId) {
      assert.equal(cross.events.length, 1);
      assert.equal(cross.events[0].id, foreignId);
    } else assert.equal(cross.events.length, 0);
    const originalEvents = await expected();
    const leading = await feed({ limit: 9 });
    const newest = await append('2200-01-01T00:00:00.999999Z', 500);
    let next = leading.nextCursor;
    const continued = leading.events.map((event) => event.id);
    while (next) {
      const page = await feed({ limit: 13, cursor: next });
      continued.push(...page.events.map((event) => event.id));
      next = page.nextCursor;
    }
    assert.deepEqual(
      continued,
      originalEvents.map((event) => event.id),
      'A newer inserted row does not duplicate or skip the original cursor continuation.',
    );
    assert(!continued.includes(newest));
    assert.equal((await feed({ limit: 1 })).events[0].id, newest);
    for (const invalid of [
      { ...decoded, version: 1 },
      { ...decoded, at: decoded.at.slice(0, -4) + 'Z' },
      { ...decoded, scope: 'x'.repeat(64) },
      { ...decoded, scope: 'a'.repeat(64) },
      { ...decoded, filter: 'a'.repeat(64) },
      { ...decoded, id: 'invalid' },
      { ...decoded, at: '2026-11-01T06:00:00.123456Z', unexpected: true },
    ])
      await deny(() => feed({ cursor: encode(invalid) }), 400);
    const traceStart = observations.length;
    await feed({ limit: 1 });
    const trace = observations
      .slice(traceStart)
      .filter(
        (item) => item.kind === 'ACCESS' || /^\s*SELECT\b/i.test(item.sql),
      );
    assert.equal(
      trace.findIndex((item) => item.kind === 'ACCESS'),
      1,
      'Shared access lock must precede current authorization.',
    );
    assert(trace[0].sql.includes('pg_advisory_xact_lock_shared'));
    assert.equal(networkCalls, 0);
    proof = {
      events: seedCount,
      pages: complete.pages,
      foreignSeeded,
      inserted,
    };
  } finally {
    try {
      try {
        if (runner?.isTransactionActive) await runner.rollbackTransaction();
      } finally {
        if (runner && !runner.isReleased) await runner.release();
      }
      if (baseline)
        assert.equal(
          digest(
            await signature((...arguments_) =>
              connectionSource.query(...arguments_),
            ),
          ),
          digest(baseline),
          'Original activity rows/count/digests must remain unchanged after rollback.',
        );
    } finally {
      try {
        if (connectionSource.isInitialized) await connectionSource.destroy();
      } finally {
        global.fetch = originalFetch;
      }
    }
  }
  console.log(
    `PASS: ${proof.events} synthetic events, ${proof.pages} precise pages; tied/submillisecond/historical/future coverage, exact and rounded bounds, filters/identity/authority binding, revocation, tenant scope and read-only feed. ${proof.inserted} activity-only inserts rolled back; original activity digest unchanged. Foreign physical seed: ${proof.foreignSeeded ? 'existing second workspace' : 'absent-workspace read only'}. No native, role, source, job or network action.`,
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
