const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  userTables,
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  TABLES,
  sourceBody,
  services,
  seedRegistryFixture,
} = require('./check-delivery-competitor-registry-support.cjs');

const checks = [];
const pass = (label) => checks.push(label);
const quote = (value) => {
  assert.match(value, /^\w+$/);
  return `"${value}"`;
};

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Rollback-only proof; no apply or commit mode.',
  );
  assert.equal(
    process.env.OTOGROW_COMPETITOR_PROOF_SERVICES_STOPPED,
    '1',
    'Pause the local API/workers before this whole-database preservation proof.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  let providerRequests = 0;
  const denyProvider = () => {
    providerRequests++;
    throw new Error(
      'Provider calls are forbidden in competitor registry acceptance.',
    );
  };
  const transports = [
    [global, 'fetch'],
    [http, 'request'],
    [http, 'get'],
    [https, 'request'],
    [https, 'get'],
  ].map(([owner, key]) => ({ owner, key, original: owner[key] }));
  for (const { owner, key } of transports) owner[key] = denyProvider;
  let runner;
  let originalSchema;
  let originalData;
  let originalTables;
  try {
    await connectionSource.initialize();
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    originalTables = await userTables(runner);
    for (const table of originalTables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    originalSchema = await schemaFingerprint(runner);
    originalData = await dataFingerprint(runner);
    const present = await runner.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='core' AND tablename=ANY($1::text[]) ORDER BY tablename",
      [TABLES],
    );
    assert.equal(
      present.length,
      TABLES.length,
      'Apply the reviewed additive registry migration before this service proof.',
    );
    const constraints = await runner.query(
      'SELECT contype,convalidated FROM pg_constraint WHERE conrelid=ANY($1::regclass[])',
      [TABLES.map((table) => `core."${table}"`)],
    );
    assert(constraints.every((constraint) => constraint.convalidated));
    assert.equal(
      constraints.filter((constraint) => constraint.contype === 'p').length,
      3,
    );
    assert(
      constraints.filter((constraint) => constraint.contype === 'f').length >=
        4,
    );
    pass(
      'Installed registry tables have validated primary and relational constraints',
    );

    await runner.query('SAVEPOINT competitor_fixture');
    const manager = runner.manager;
    const fixture = await seedRegistryFixture(manager);
    const dataSource = {
      manager,
      getRepository: (entity) => manager.getRepository(entity),
      query: (...arguments_) => manager.query(...arguments_),
      transaction: (operation) => manager.transaction(operation),
    };
    const { registry } = services(dataSource, fixture);
    const call = (
      method,
      input,
      person = fixture.people.reader,
      workspace = fixture.workspace,
    ) =>
      registry[method](
        workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const rejects = async (label, operation, status) => {
      await assert.rejects(operation, (error) =>
        status ? error.getStatus?.() === status : Boolean(error),
      );
      pass(label);
    };
    let sequence = 0;
    const isolated = async (operation) => {
      const savepoint = `competitor_isolated_${++sequence}`;
      await runner.query(`SAVEPOINT ${savepoint}`);
      try {
        return await operation();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await runner.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
    };
    const rows = (table) => {
      assert(TABLES.includes(table));
      return manager.query(
        `SELECT * FROM core.${quote(table)} WHERE "workspaceId"=$1 ORDER BY id`,
        [fixture.workspaceId],
      );
    };
    const insert = async (table, values) => {
      assert(TABLES.includes(table));
      const keys = Object.keys(values);
      return (
        await manager.query(
          `INSERT INTO core.${quote(table)}(${keys.map(quote).join(',')}) VALUES(${keys.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`,
          keys.map((key) =>
            key === 'body' ? JSON.stringify(values[key]) : values[key],
          ),
        )
      )[0];
    };
    const rejectSql = async (label, operation, code) => {
      await isolated(() =>
        assert.rejects(operation, (error) => error.code === code),
      );
      pass(label);
    };
    const project = (
      await call('projects', {}, fixture.people.writer)
    ).items.find((item) => item.id === fixture.projects.first);
    assert(project);
    assert.equal(project.revision, fixture.projectAnchor.revision);
    const body = sourceBody(fixture);
    const saveInput = (changes = {}) => ({
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      projectId: project.id,
      projectRevision: project.revision,
      expectedCompanyId: project.companyId,
      body: structuredClone(body),
      ...changes,
    });
    const original = saveInput();
    const receiptInput = (input = original) => ({
      requestId: input.requestId,
      sourceId: input.id,
      projectId: input.projectId,
    });
    const detail = (person = fixture.people.writer, input = {}) =>
      call('detail', { id: original.id, ...input }, person);
    const currentInput = async (changes = {}) => ({
      ...original,
      requestId: randomUUID(),
      revision: (await detail()).source.revision,
      ...changes,
    });
    const change = async (
      action,
      person = fixture.people.writer,
      changes = {},
    ) => {
      const { body: _body, ...input } = await currentInput();
      return call(
        'changeState',
        {
          ...input,
          action,
          note: 'PRIVATE_FIXTURE_NOTE: intentional registry state change.',
          ...changes,
        },
        person,
      );
    };
    const untouched = async () => ({
      native: await manager.query(
        `SELECT * FROM ${quote(fixture.schemaName)}.task ORDER BY id`,
      ),
      managed: await manager.query(
        'SELECT * FROM core."deliveryTask" WHERE "workspaceId"=$1 ORDER BY id',
        [fixture.workspaceId],
      ),
      operations: await manager.query(
        'SELECT * FROM core."deliveryOperations" WHERE "workspaceId"=$1 ORDER BY id',
        [fixture.workspaceId],
      ),
    });
    const untouchedBefore = await untouched();
    const beforePreview = await dataFingerprint(runner);
    const preview = await call('preview', original);
    assert.equal(preview.inputHash, advertisingHash(original));
    assert.equal(preview.collectionEnabled, false);
    assert.deepEqual(await dataFingerprint(runner), beforePreview);
    pass(
      'Canonical source preview validates the exact command without writes or collection',
    );
    await rejects(
      'Only a current manager can register a new source',
      () => call('save', original, fixture.people.writer),
      403,
    );
    await rejects(
      'A source cannot name the same owner and reviewer',
      () =>
        call(
          'save',
          saveInput({ body: { ...body, reviewerId: body.ownerId } }),
        ),
      400,
    );
    await rejects(
      'An owner outside current project membership is ineligible',
      () =>
        call(
          'save',
          saveInput({
            body: { ...body, ownerId: fixture.people.outsider.memberId },
          }),
        ),
      400,
    );
    await rejects(
      'A reviewer needs current independent review authority',
      () =>
        call(
          'save',
          saveInput({
            body: { ...body, reviewerId: fixture.people.secondWriter.memberId },
          }),
        ),
      400,
    );
    const saved = await call('save', original);
    assert.equal(saved.status, 'ACTIVE');
    assert.equal(saved.revision, 1);
    assert.equal(saved.version, 1);
    assert.deepEqual(await call('save', original), saved);
    assert.deepEqual((await call('receipt', receiptInput())).receipt, saved);
    const receiptBefore = await dataFingerprint(runner);
    assert.equal(
      (await call('receipt', { ...receiptInput(), requestId: randomUUID() }))
        .receipt,
      null,
    );
    assert.deepEqual(await dataFingerprint(runner), receiptBefore);
    pass(
      'Exact manager save replays and GET recovery return the same durable receipt',
    );
    await rejects(
      'A changed body cannot claim an existing request',
      () =>
        call('save', { ...original, body: { ...body, label: 'DIFFERENT' } }),
      409,
    );
    await rejects(
      'A different actor cannot claim an existing request',
      () => call('save', original, fixture.people.admin),
      409,
    );
    await rejects(
      'A different actor cannot recover another receipt',
      () => call('receipt', receiptInput(), fixture.people.admin),
      403,
    );
    await rejects(
      'A receipt cannot be recovered for a different source',
      () => call('receipt', { ...receiptInput(), sourceId: randomUUID() }),
      403,
    );
    await rejects(
      'A receipt cannot be recovered under a different project',
      () =>
        call('receipt', {
          ...receiptInput(),
          projectId: fixture.projects.sameClient,
        }),
      403,
    );
    await isolated(async () => {
      const replacement = randomUUID();
      await manager.query('UPDATE core."userWorkspace" SET id=$2 WHERE id=$1', [
        fixture.people.reader.userWorkspaceId,
        replacement,
      ]);
      const changedMembership = {
        ...fixture.people.reader,
        userWorkspaceId: replacement,
      };
      await rejects(
        'A replacement user-workspace cannot claim the previous membership receipt',
        () => call('save', original, changedMembership),
        409,
      );
      await rejects(
        'A replacement user-workspace cannot recover the previous membership receipt',
        () => call('receipt', receiptInput(), changedMembership),
        403,
      );
    });
    const savedDetail = await detail();
    assert.equal(
      savedDetail.source.canonicalReference,
      'https://x.com/otogrowfixture',
    );
    assert.equal(savedDetail.collectionEnabled, false);
    assert.equal(savedDetail.canEdit, true);
    pass(
      'Saved ACTIVE means registered configuration with collection disabled',
    );

    for (const accountReference of [
      'https://twitter.com/OtogrowFixture?utm_source=fixture',
      'https://x.com/otogrowfixture/',
      '@OTOGROWFIXTURE',
    ])
      await rejects(
        'Canonical X profile aliases cannot create a duplicate source',
        () => call('save', saveInput({ body: { ...body, accountReference } })),
        409,
      );
    await isolated(async () => {
      for (const [platform, reference, alias, canonical] of [
        [
          'INSTAGRAM',
          '@Fixture.Brand',
          'https://instagram.com/fixture.brand/?igshid=fixture',
          'https://www.instagram.com/fixture.brand',
        ],
        [
          'META_AD_LIBRARY',
          '123456789',
          'https://www.facebook.com/ads/library/?active_status=all&view_all_page_id=123456789&country=ALL',
          'https://www.facebook.com/ads/library/?view_all_page_id=123456789',
        ],
        [
          'MANUAL',
          'https://public.example.invalid/evidence?b=2&utm_source=fixture&a=1#capture',
          'https://public.example.invalid/evidence?a=1&b=2',
          'https://public.example.invalid/evidence?a=1&b=2',
        ],
      ]) {
        const input = saveInput({
          body: { ...body, platform, accountReference: reference },
        });
        const preview = await call('preview', input);
        assert.equal(preview.body.canonicalReference, canonical);
        await call('save', input);
        await rejects(
          'Platform profile, Page and tracking aliases deduplicate within the project',
          () =>
            call(
              'save',
              saveInput({
                body: { ...body, platform, accountReference: alias },
              }),
            ),
          409,
        );
      }
      const anotherProject = saveInput({
        projectId: fixture.projects.sameClient,
        body: { ...body, projectId: fixture.projects.sameClient },
      });
      assert.equal((await call('save', anotherProject)).status, 'ACTIVE');
      pass(
        'Canonical deduplication preserves independent per-project configuration',
      );
    });
    await rejects(
      'An existing request cannot be moved to another source',
      () => call('save', { ...original, id: randomUUID() }),
      409,
    );
    await rejects(
      'A credential-bearing profile is rejected before persistence',
      () =>
        call(
          'save',
          saveInput({
            body: {
              ...body,
              accountReference: 'https://x.com/fixture?access_token=private',
            },
          }),
        ),
      400,
    );
    await rejects(
      'A platform navigation page is not a public account',
      () =>
        call(
          'save',
          saveInput({
            body: { ...body, accountReference: 'https://x.com/home' },
          }),
        ),
      400,
    );
    await rejects(
      'Prepared project revisions must still match',
      () => call('save', saveInput({ projectRevision: project.revision + 1 })),
      409,
    );
    await rejects(
      'Prepared company anchors must still match',
      () => call('save', saveInput({ expectedCompanyId: randomUUID() })),
      409,
    );
    await rejects(
      'Body and command project identities cannot differ',
      () =>
        call(
          'save',
          saveInput({
            body: { ...body, projectId: fixture.projects.sameClient },
          }),
        ),
      400,
    );
    await rejects(
      'Unrelated staff cannot enter the source project',
      () => call('choices', { projectId: project.id }, fixture.people.outsider),
      403,
    );
    await rejects(
      'Foreign workspace projects are unavailable',
      () => call('choices', { projectId: fixture.projects.foreign }),
      403,
    );
    await rejects(
      'An unrelated project member cannot edit another owner source',
      async () =>
        call('save', await currentInput(), fixture.people.secondWriter),
      403,
    );
    await rejects(
      'The source project identity cannot change',
      async () =>
        call(
          'save',
          await currentInput({
            projectId: fixture.projects.sameClient,
            body: { ...body, projectId: fixture.projects.sameClient },
          }),
        ),
      409,
    );
    await rejects(
      'The source platform identity cannot change',
      async () =>
        call(
          'save',
          await currentInput({ body: { ...body, platform: 'INSTAGRAM' } }),
        ),
      400,
    );
    await rejects(
      'The canonical source identity cannot change',
      async () =>
        call(
          'save',
          await currentInput({
            body: { ...body, accountReference: '@different' },
          }),
        ),
      400,
    );
    await rejects(
      'Owners cannot reassign their source',
      async () =>
        call(
          'save',
          await currentInput({
            body: { ...body, ownerId: fixture.people.secondWriter.memberId },
          }),
          fixture.people.writer,
        ),
      403,
    );

    const initialVersions = await rows('deliveryCompetitorSourceVersion');
    const initialEvents = await rows('deliveryCompetitorSourceEvent');
    const { body: _pauseBody, ...pauseCommon } = original;
    const pauseInput = {
      ...pauseCommon,
      requestId: randomUUID(),
      revision: 1,
      action: 'PAUSE',
      note: 'PRIVATE_FIXTURE_NOTE: pause registry configuration.',
    };
    const paused = await call('changeState', pauseInput, fixture.people.writer);
    assert.equal(paused.status, 'PAUSED');
    assert.deepEqual(
      await call('changeState', pauseInput, fixture.people.writer),
      paused,
    );
    assert.deepEqual(
      (
        await call(
          'receipt',
          { ...receiptInput(), requestId: pauseInput.requestId },
          fixture.people.writer,
        )
      ).receipt,
      paused,
    );
    await rejects(
      'A changed state-action note cannot claim a committed request',
      () =>
        call(
          'changeState',
          { ...pauseInput, note: 'DIFFERENT' },
          fixture.people.writer,
        ),
      409,
    );
    pass('Exact state-action replay and GET recovery preserve one pause event');
    const edited = await call(
      'save',
      await currentInput({
        body: { ...body, label: 'FIXTURE edited while paused' },
      }),
      fixture.people.writer,
    );
    assert.equal(edited.status, 'PAUSED');
    assert.equal(edited.version, 2);
    assert.deepEqual(
      (await rows('deliveryCompetitorSourceVersion')).filter(
        (row) => row.version === 1,
      ),
      initialVersions,
    );
    assert.deepEqual(
      (await rows('deliveryCompetitorSourceEvent')).filter(
        (row) => row.revision === 1,
      ),
      initialEvents,
    );
    const historical = await detail(fixture.people.writer, { version: 1 });
    assert.equal(historical.body.label, body.label);
    assert.equal(historical.canEdit, false);
    pass(
      'Owner edits preserve pause; saved versions and earlier events remain exact and read-only',
    );
    assert.equal((await change('RESTORE')).status, 'ACTIVE');
    assert.equal((await change('ARCHIVE')).status, 'ARCHIVED');
    await rejects(
      'Archived canonical sources still prevent duplicate registration',
      () => call('save', saveInput()),
      409,
    );
    await rejects(
      'An archived source cannot be edited',
      async () => call('save', await currentInput(), fixture.people.writer),
      400,
    );
    await rejects(
      'An owner cannot restore archived registry configuration',
      () => change('RESTORE'),
      403,
    );
    assert.equal(
      (await change('RESTORE', fixture.people.reader)).status,
      'PAUSED',
    );
    pass(
      'Owner archive and manager recovery restore to paused configuration without collection',
    );
    await isolated(async () => {
      await change('ARCHIVE');
      await manager.query(
        'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
        [project.id, JSON.stringify([fixture.people.secondWriter.memberId])],
      );
      await manager.query(
        'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
        [fixture.roles.reader, []],
      );
      const archived = await detail(fixture.people.admin);
      assert.equal(archived.canEdit, true);
      assert.equal(archived.canRestore, false);
      const repaired = await call(
        'save',
        {
          ...original,
          requestId: randomUUID(),
          revision: archived.source.revision,
          body: {
            ...body,
            ownerId: fixture.people.secondWriter.memberId,
            reviewerId: fixture.people.admin.memberId,
          },
        },
        fixture.people.admin,
      );
      assert.equal(repaired.status, 'ARCHIVED');
      const { body: _body, ...common } = original;
      const restored = await call(
        'changeState',
        {
          ...common,
          requestId: randomUUID(),
          revision: repaired.revision,
          action: 'RESTORE',
          note: 'FIXTURE independent assignments repaired before restoration.',
        },
        fixture.people.admin,
      );
      assert.equal(restored.status, 'PAUSED');
      pass(
        'A manager can repair revoked archived assignments before restoring to paused configuration',
      );
    });
    await isolated(async () => {
      const input = await currentInput({
        body: { ...body, ownerId: fixture.people.secondWriter.memberId },
      });
      await call('save', input);
      assert.equal((await detail(fixture.people.writer)).canEdit, false);
      assert.equal((await detail(fixture.people.secondWriter)).canEdit, true);
      await rejects(
        'Reassignment immediately revokes the previous owner editing authority',
        async () => call('save', await currentInput(), fixture.people.writer),
        403,
      );
      pass(
        'Manager reassignment transfers edit authority to the current owner',
      );
    });

    await isolated(async () => {
      const [header] = await rows('deliveryCompetitorSource');
      const [version] = await rows('deliveryCompetitorSourceVersion');
      const [event] = await rows('deliveryCompetitorSourceEvent');
      const newHeader = (changes) => ({
        ...header,
        id: randomUUID(),
        canonicalKey: advertisingHash(randomUUID()),
        ...changes,
      });
      await rejectSql(
        'Database prevents duplicate canonical sources in a project',
        () => insert(TABLES[0], { ...header, id: randomUUID() }),
        '23505',
      );
      await rejectSql(
        'Database binds source projects to the workspace',
        () =>
          insert(
            TABLES[0],
            newHeader({ workspaceId: fixture.foreignWorkspaceId }),
          ),
        '23503',
      );
      await rejectSql(
        'Retained sources prevent hard deletion of their project',
        () =>
          manager.query('DELETE FROM core."deliveryProject" WHERE id=$1', [
            project.id,
          ]),
        '23503',
      );
      for (const [label, changes] of [
        ['Database requires a positive source revision', { revision: 0 }],
        ['Database rejects unknown source status', { status: 'COLLECTING' }],
        [
          'Database requires distinct owner and reviewer',
          { reviewerId: header.ownerId },
        ],
        ['Database bounds collection cadence', { cadenceHours: 0 }],
        [
          'Database rejects malformed canonical keys',
          { canonicalKey: 'invalid' },
        ],
      ])
        await rejectSql(
          label,
          () => insert(TABLES[0], newHeader(changes)),
          '23514',
        );
      await rejectSql(
        'Database preserves immutable version identity',
        () => insert(TABLES[1], { ...version, id: randomUUID() }),
        '23505',
      );
      await rejectSql(
        'Database binds versions to the exact workspace source',
        () =>
          insert(TABLES[1], {
            ...version,
            id: randomUUID(),
            workspaceId: fixture.foreignWorkspaceId,
          }),
        '23503',
      );
      await rejectSql(
        'Database rejects malformed immutable body fingerprints',
        () =>
          insert(TABLES[1], {
            ...version,
            id: randomUUID(),
            version: 99,
            body: { ...version.body, canonicalKey: 'invalid' },
          }),
        '23514',
      );
      await rejectSql(
        'Database preserves request identity',
        () => insert(TABLES[2], { ...event, id: randomUUID(), revision: 99 }),
        '23505',
      );
      await rejectSql(
        'Database preserves source event revision identity',
        () =>
          insert(TABLES[2], {
            ...event,
            id: randomUUID(),
            requestId: randomUUID(),
          }),
        '23505',
      );
      await rejectSql(
        'Database binds events to an existing immutable version',
        () =>
          insert(TABLES[2], {
            ...event,
            id: randomUUID(),
            requestId: randomUUID(),
            revision: 99,
            version: 99,
          }),
        '23503',
      );
      await rejectSql(
        'Database rejects malformed command hashes',
        () =>
          insert(TABLES[2], {
            ...event,
            id: randomUUID(),
            requestId: randomUUID(),
            revision: 99,
            inputHash: 'invalid',
          }),
        '23514',
      );
    });

    await paginationChecks({
      call,
      rejects,
      pass,
      isolated,
      manager,
      fixture,
      project,
      original,
      saveInput,
      detail,
    });
    await revocationChecks({
      call,
      rejects,
      pass,
      isolated,
      manager,
      fixture,
      project,
      original,
      saveInput,
      currentInput,
      receiptInput,
      detail,
    });
    assert.deepEqual(await untouched(), untouchedBefore);
    pass(
      'Source configuration never changes native tasks, managed task approvals or Operations JSON',
    );
    const audits = await manager.query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    assert(audits.length > 0);
    assert(!JSON.stringify(audits).includes('PRIVATE_FIXTURE'));
    assert(!JSON.stringify(audits).includes('x.com/'));
    pass(
      'Activity stores source action identity without private source purpose, notes or URLs',
    );
    assert.equal(providerRequests, 0);
    await runner.query('ROLLBACK TO SAVEPOINT competitor_fixture');
    await runner.query('RELEASE SAVEPOINT competitor_fixture');
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    pass(
      `Original schema and every row preserved across ${originalTables.length} installed tables, including retained source history`,
    );
    await runner.rollbackTransaction();
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    process.stdout.write(
      JSON.stringify(
        { passed: checks.length, checks, providerRequests, committedWrites: 0 },
        null,
        2,
      ) + '\n',
    );
  } finally {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
    if (connectionSource.isInitialized) await connectionSource.destroy();
    for (const { owner, key, original } of transports) owner[key] = original;
  }
}

async function paginationChecks({
  call,
  rejects,
  pass,
  isolated,
  manager,
  fixture,
  project,
  original,
  saveInput,
  detail,
}) {
  await isolated(async () => {
    for (let index = 0; index < 28; index++)
      await manager.query(
        'INSERT INTO core."deliveryProject"(id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,$4,$5)',
        [
          randomUUID(),
          fixture.workspaceId,
          `FIXTURE paged project ${String(index).padStart(2, '0')}`,
          project.companyId,
          JSON.stringify([fixture.people.writer.memberId]),
        ],
      );
    const first = await call(
      'projects',
      { search: 'FIXTURE paged project' },
      fixture.people.writer,
    );
    const second = await call(
      'projects',
      { search: 'FIXTURE paged project', after: first.nextCursor },
      fixture.people.writer,
    );
    assert.equal(first.items.length, 25);
    assert.equal(first.totalCount, 28);
    assert.equal(second.items.length, 3);
    assert.equal(second.totalCount, 28);
    assert.equal(second.nextCursor, null);
    assert.equal(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
      28,
    );
    await rejects(
      'Project cursors cannot cross actors',
      () =>
        call('projects', {
          search: 'FIXTURE paged project',
          after: first.nextCursor,
        }),
      400,
    );
    await rejects(
      'Project cursors cannot cross search filters',
      () =>
        call(
          'projects',
          { search: 'different', after: first.nextCursor },
          fixture.people.writer,
        ),
      400,
    );
    pass(
      'Twenty-eight authorized projects page once with exact pre-page counts',
    );
  });
  await isolated(async () => {
    const sourceIds = [original.id];
    for (let index = 0; index < 29; index++) {
      const input = saveInput({
        body: sourceBody(fixture, {
          accountReference: `@fixture${index}`,
          label: `FIXTURE paged source ${index}`,
        }),
      });
      sourceIds.push(input.id);
      await call('save', input);
    }
    const first = await call(
      'list',
      { projectId: project.id },
      fixture.people.writer,
    );
    const second = await call(
      'list',
      { projectId: project.id, after: first.nextCursor },
      fixture.people.writer,
    );
    assert.equal(first.items.length, 25);
    assert.equal(first.totalCount, 30);
    assert.equal(second.items.length, 5);
    assert.equal(second.totalCount, 30);
    assert.equal(second.nextCursor, null);
    assert.deepEqual(
      [...first.items, ...second.items].map((item) => item.id).sort(),
      sourceIds.sort(),
    );
    assert(
      !JSON.stringify([first, second]).includes('PRIVATE_FIXTURE_PURPOSE'),
    );
    await rejects(
      'Source cursors cannot cross actors',
      () => call('list', { projectId: project.id, after: first.nextCursor }),
      400,
    );
    await rejects(
      'Source cursors cannot cross projects',
      () =>
        call(
          'list',
          { projectId: fixture.projects.sameClient, after: first.nextCursor },
          fixture.people.writer,
        ),
      400,
    );
    await rejects(
      'Source cursors cannot cross status filters',
      () =>
        call(
          'list',
          { projectId: project.id, status: 'ACTIVE', after: first.nextCursor },
          fixture.people.writer,
        ),
      400,
    );
    await rejects(
      'History cursors cannot be used as source cursors',
      () =>
        call(
          'detail',
          { id: original.id, after: first.nextCursor },
          fixture.people.writer,
        ),
      400,
    );
    await isolated(async () => {
      await manager.query(
        'UPDATE core."deliveryProject" SET revision=revision+1 WHERE id=$1',
        [project.id],
      );
      await rejects(
        'Source cursors expire after project revision changes',
        () =>
          call(
            'list',
            { projectId: project.id, after: first.nextCursor },
            fixture.people.writer,
          ),
        400,
      );
    });
    await isolated(async () => {
      await manager.query(
        'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
        [fixture.roles.writer, ['finance.read']],
      );
      await rejects(
        'Source cursors expire after current role capabilities change',
        () =>
          call(
            'list',
            { projectId: project.id, after: first.nextCursor },
            fixture.people.writer,
          ),
        400,
      );
    });
    await manager.query(
      'UPDATE core."deliveryCompetitorSource" SET "companyId"=$2 WHERE id=$1',
      [sourceIds[0], randomUUID()],
    );
    assert.equal(
      (await call('list', { projectId: project.id })).totalCount,
      29,
    );
    pass(
      'Thirty source rows page once; mismatched client anchors are excluded before manager counts',
    );
  });
  await isolated(async () => {
    const savedVersion = (await detail()).source.currentVersion;
    for (let index = 0; index < 28; index++) {
      const current = await detail();
      await call(
        'save',
        {
          ...original,
          requestId: randomUUID(),
          revision: current.source.revision,
          body: sourceBody(fixture, {
            label: `FIXTURE immutable history ${index}`,
          }),
        },
        fixture.people.writer,
      );
    }
    const first = await detail();
    assert.equal(first.history.length, 25);
    assert(first.nextCursor);
    const second = await detail(fixture.people.writer, {
      after: first.nextCursor,
    });
    assert.equal(second.nextCursor, null);
    assert.equal(
      new Set(
        [...first.history, ...second.history].map((event) => event.requestId),
      ).size,
      first.history.length + second.history.length,
    );
    const eventCount = (
      await manager.query(
        'SELECT count(*)::int AS count FROM core."deliveryCompetitorSourceEvent" WHERE "sourceId"=$1',
        [original.id],
      )
    )[0].count;
    assert.equal(first.history.length + second.history.length, eventCount);
    assert.equal(
      (await detail(fixture.people.writer, { version: savedVersion })).canEdit,
      false,
    );
    const other = saveInput({
      body: sourceBody(fixture, { accountReference: '@otherhistory' }),
    });
    await call('save', other);
    await rejects(
      'History cursors cannot cross sources',
      () =>
        call(
          'detail',
          { id: other.id, after: first.nextCursor },
          fixture.people.writer,
        ),
      400,
    );
    await rejects(
      'History cursors cannot cross actors',
      () => call('detail', { id: original.id, after: first.nextCursor }),
      400,
    );
    await rejects(
      'Malformed cursors cannot select history',
      () =>
        call(
          'detail',
          { id: original.id, after: 'not-a-cursor' },
          fixture.people.writer,
        ),
      400,
    );
    const current = await detail();
    await call(
      'save',
      {
        ...original,
        requestId: randomUUID(),
        revision: current.source.revision,
        body: sourceBody(fixture, {
          label: 'FIXTURE history changes after first page',
        }),
      },
      fixture.people.writer,
    );
    await rejects(
      'History cursors expire after the source changes',
      () => detail(fixture.people.writer, { after: first.nextCursor }),
      400,
    );
    pass(
      'History remains bounded, source-bound and revision-bound with exact immutable version selection',
    );
  });
}

async function revocationChecks({
  call,
  rejects,
  pass,
  isolated,
  manager,
  fixture,
  project,
  original,
  saveInput,
  currentInput,
  receiptInput,
  detail,
}) {
  const revision = (await detail()).source.revision;
  const prepared = () => ({ ...original, requestId: randomUUID(), revision });
  await isolated(async () => {
    await manager.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, []],
    );
    const choices = await call(
      'choices',
      { projectId: project.id },
      fixture.people.writer,
    );
    assert(
      !choices.reviewers.some(
        (person) => person.id === fixture.people.reader.memberId,
      ),
    );
    await rejects(
      'Revoked reviewer authority cannot be reused by a manager save',
      async () => call('save', await currentInput(), fixture.people.admin),
      400,
    );
    pass('Current review choices immediately exclude revoked authority');
  });
  await isolated(async () => {
    await manager.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
      [project.id, JSON.stringify([fixture.people.secondWriter.memberId])],
    );
    await rejects(
      'Removed owners lose exact detail access',
      () => detail(),
      403,
    );
    const choices = await call('choices', { projectId: project.id });
    assert(
      !choices.owners.some(
        (person) => person.id === fixture.people.writer.memberId,
      ),
    );
    await rejects(
      'Removed owner eligibility cannot survive a manager save',
      () => call('save', prepared()),
      400,
    );
  });
  for (const person of [fixture.people.reader, fixture.people.writer])
    await isolated(async () => {
      await manager.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        [person.userWorkspaceId],
      );
      await rejects(
        'Deleted user-workspace membership cannot read source details',
        () => detail(person),
        403,
      );
      await rejects(
        'Deleted user-workspace membership cannot recover a receipt',
        () => call('receipt', receiptInput(), person),
        403,
      );
      await rejects(
        'Inactive owner or reviewer cannot be saved by a current manager',
        () => call('save', prepared(), fixture.people.admin),
        400,
      );
    });
  await isolated(async () => {
    await manager.query(
      `UPDATE ${quote(fixture.schemaName)}."workspaceMember" SET "deletedAt"=now() WHERE id=$1`,
      [fixture.people.writer.memberId],
    );
    await rejects(
      'Deleted workspace members cannot read retained source history',
      () => detail(),
      403,
    );
  });
  await isolated(async () => {
    await manager.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      fixture.people.writer.userId,
    ]);
    await rejects(
      'Disabled accounts cannot read source history',
      () => detail(),
      403,
    );
  });
  await isolated(async () => {
    await manager.query(
      'UPDATE core."deliveryProject" SET "companyId"=NULL WHERE id=$1',
      [project.id],
    );
    assert.equal((await call('list', { projectId: project.id })).totalCount, 0);
    assert.equal(
      (await call('list', { projectId: project.id }, fixture.people.writer))
        .totalCount,
      0,
    );
    await rejects(
      'Client relinking withholds exact current detail even from managers',
      () => detail(fixture.people.reader),
      403,
    );
    await rejects(
      'Client relinking withholds historical versions even from managers',
      () => detail(fixture.people.reader, { version: 1 }),
      403,
    );
    await rejects(
      'Client relinking withholds request recovery even from managers',
      () => call('receipt', receiptInput()),
      403,
    );
    await rejects(
      'Client relinking invalidates prepared saves',
      () => call('save', saveInput()),
      409,
    );
    pass(
      'Client relinking withholds source content, history and receipts before counts',
    );
  });
  await isolated(async () => {
    await manager.query(
      `UPDATE ${quote(fixture.schemaName)}.company SET "deletedAt"=now() WHERE id=$1`,
      [project.companyId],
    );
    const projects = await call('projects', {});
    assert(!projects.items.some((item) => item.id === project.id));
    await rejects(
      'Deleted clients withhold project source counts',
      () => call('list', { projectId: project.id }),
      403,
    );
    await rejects(
      'Deleted clients withhold exact history even from managers',
      () => detail(fixture.people.reader),
      403,
    );
    await rejects(
      'Deleted clients withhold original receipt recovery',
      () => call('receipt', receiptInput()),
      403,
    );
  });
  await isolated(async () => {
    await manager.query(
      'UPDATE core."deliveryCompetitorSourceVersion" SET "companyId"=NULL WHERE "sourceId"=$1 AND version=1',
      [original.id],
    );
    const current = await detail(fixture.people.reader);
    assert(current.history.length > 0);
    assert(current.history.every((event) => event.version !== 1));
    await rejects(
      'A mismatched historical client anchor withholds the exact old version',
      () => detail(fixture.people.reader, { version: 1 }),
      403,
    );
    await rejects(
      'A mismatched historical client anchor withholds its original request receipt',
      () => call('receipt', receiptInput()),
      403,
    );
    pass(
      'History filters each immutable event version before returning its private note',
    );
  });
  await isolated(async () => {
    await manager.query(
      'UPDATE core."deliveryCompetitorSourceVersion" SET "companyId"=NULL WHERE "sourceId"=$1',
      [original.id],
    );
    await rejects(
      'A mismatched immutable client anchor cannot expose history',
      () => detail(fixture.people.reader),
      403,
    );
    assert.equal((await call('list', { projectId: project.id })).totalCount, 0);
    pass(
      'Current immutable-version client anchor is enforced before source counts',
    );
  });
}

if (require.main === module)
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
