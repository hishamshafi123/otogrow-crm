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
  CONTENT_TABLES,
  WHEN,
  quote,
  services,
  seedContentFixture,
  accountInput,
  planInput,
  packageBody,
} = require('./check-delivery-content-support.cjs');

const checks = [];
const pass = (label) => checks.push(label);

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Rollback-only proof; no commit or apply mode.',
  );
  assert.equal(
    process.env.OTOGROW_CONTENT_PROOF_SERVICES_STOPPED,
    '1',
    'Pause local API and workers before the strict whole-database preservation proof.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  let providerRequests = 0;
  const transports = [
    [global, 'fetch'],
    [http, 'request'],
    [http, 'get'],
    [https, 'request'],
    [https, 'get'],
  ].map(([owner, key]) => ({ owner, key, original: owner[key] }));
  for (const { owner, key } of transports)
    owner[key] = () => {
      providerRequests++;
      throw new Error('Provider calls are forbidden in content acceptance.');
    };
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  let originalSchema;
  let originalData;
  let originalPreserved = false;
  try {
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const tables = await userTables(runner);
    for (const table of tables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    for (const table of CONTENT_TABLES)
      assert(
        tables.some((item) => item.schema === 'core' && item.name === table),
        'Install the reviewed additive content migration through the normal CLI first.',
      );
    originalSchema = await schemaFingerprint(runner);
    originalData = await dataFingerprint(runner);
    const fixture = await seedContentFixture(runner.manager);
    const manager = runner.manager;
    const source = {
      manager,
      getRepository: (entity) => manager.getRepository(entity),
      query: (...arguments_) => manager.query(...arguments_),
      transaction: (operation) => manager.transaction(operation),
    };
    const implementation = services(source, fixture);
    const { native } = implementation;
    const call = (method, input, person = fixture.people.writer) =>
      implementation.call(method, input, person, manager);
    const readState = async () => ({
      operations: await manager.query(
        'SELECT to_jsonb(record)::text AS value FROM core."deliveryOperations" record WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      ),
      native: await manager.query(
        `SELECT to_jsonb(record)::text AS value FROM ${quote(fixture.schemaName)}.task record ORDER BY id`,
      ),
      managed: await manager.query(
        'SELECT to_jsonb(record)::text AS value FROM core."deliveryTask" record WHERE "workspaceId"=$1 ORDER BY id',
        [fixture.workspaceId],
      ),
    });
    const originalWork = await readState();
    let savepoint = 0;
    const isolated = async (operation) => {
      const name = `content_case_${++savepoint}`;
      await runner.query(`SAVEPOINT ${name}`);
      try {
        return await operation();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
    };
    const rejects = async (label, operation, status) => {
      await assert.rejects(operation, (error) =>
        status ? error.getStatus?.() === status : Boolean(error),
      );
      pass(label);
    };
    const count = async (table) => {
      assert(
        CONTENT_TABLES.includes(table) || table === 'otogrowActivityEvent',
      );
      return (
        await manager.query(
          `SELECT count(*)::int AS count FROM core.${quote(table)} WHERE "workspaceId"=$1`,
          [fixture.workspaceId],
        )
      )[0].count;
    };
    const accountCommand = accountInput(fixture);
    const accountReceipt = await call(
      'saveAccount',
      accountCommand,
      fixture.people.admin,
    );
    assert.equal(accountReceipt.targetId, accountCommand.id);
    const choices = await call('projectChoices', {
      projectId: fixture.projects.first,
    });
    const account = choices.accounts.find(
      (item) => item.id === accountCommand.id,
    );
    assert(account);
    assert(
      choices.members.some(
        (item) => item.id === fixture.people.reader.memberId && item.canReview,
      ),
    );
    assert(
      !choices.members.some(
        (item) => item.id === fixture.people.outsider.memberId,
      ),
    );
    assert(
      choices.engagements.some(
        (item) =>
          item.id === fixture.engagementId &&
          item.services.includes('Social media'),
      ),
    );
    pass(
      'Account metadata, eligible people and actual service choices are scoped to the current brand',
    );
    await rejects(
      'Ordinary posting staff cannot configure accounts',
      () => call('saveAccount', accountInput(fixture)),
      403,
    );
    await rejects(
      'Outsiders cannot read project choices',
      () =>
        call(
          'projectChoices',
          { projectId: fixture.projects.first },
          fixture.people.outsider,
        ),
      403,
    );
    const planCommand = planInput(fixture);
    const planReceipt = await call(
      'savePlan',
      planCommand,
      fixture.people.admin,
    );
    const plan = (
      await call('plans', {
        projectId: fixture.projects.first,
        planId: planCommand.id,
      })
    ).items.find((item) => item.id === planCommand.id);
    assert(plan);
    assert.equal(planReceipt.targetId, plan.id);
    await rejects(
      'A selected client service must belong to the actual engagement',
      () =>
        call(
          'savePlan',
          planInput(fixture, { service: 'Not a contracted service' }),
          fixture.people.admin,
        ),
      409,
    );
    await rejects('Another project cannot borrow this engagement', () =>
      call(
        'savePlan',
        planInput(fixture, { projectId: fixture.projects.sameClient }),
        fixture.people.admin,
      ),
    );
    await isolated(async () => {
      const ownBrand = planInput(fixture, {
        title: 'FIXTURE own-brand plan without a paid service',
        engagementId: null,
        service: null,
      });
      const ownBrandReceipt = await call(
        'savePlan',
        ownBrand,
        fixture.people.admin,
      );
      assert.equal(ownBrandReceipt.status, 'PLANNED');
      assert.equal(
        (
          await call('plans', {
            projectId: fixture.projects.first,
            planId: ownBrand.id,
          })
        ).items[0].companyId,
        ownBrand.expectedCompanyId,
      );
      pass(
        'An own-brand company-linked project can plan content without a paid-client engagement',
      );
    });
    const assetChoices = await call('assetChoices', {
      projectId: fixture.projects.first,
    });
    assert(
      assetChoices.items.some(
        (item) =>
          item.taskId === fixture.taskId &&
          item.assetId === fixture.assets.approved,
      ),
    );
    assert(
      !JSON.stringify(assetChoices).includes('PRIVATE_NATIVE_RLS_HIDDEN_TASK'),
    );
    assert(
      !assetChoices.items.some((item) =>
        [fixture.sourceTasks.hidden, fixture.sourceTasks.otherProject].includes(
          item.taskId,
        ),
      ),
    );
    pass(
      'Exact independently approved native sources exclude hidden tasks and other projects',
    );
    const input = (bodyChanges = {}, changes = {}) => ({
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      planId: plan.id,
      planRevision: plan.revision,
      body: packageBody(fixture, account, {
        reviewerId: fixture.people.admin.memberId,
        ...bodyChanges,
      }),
      expectedSourceFingerprint: null,
      ...changes,
    });
    const prepare = async (command, person = fixture.people.writer) => {
      const preview = await call(
        'preview',
        { ...command, expectedSourceFingerprint: null },
        person,
      );
      assert.equal(preview.variantId, command.id);
      return {
        ...command,
        expectedSourceFingerprint: preview.body.sourceFingerprint,
      };
    };
    const save = async (command, person = fixture.people.writer) => {
      const prepared = await prepare(command, person);
      return {
        command: prepared,
        result: await call('save', prepared, person),
      };
    };
    const detail = (id, person = fixture.people.writer, changes = {}) =>
      call('detail', { id, ...changes }, person);
    const decision = async (
      id,
      action,
      person = fixture.people.writer,
      changes = {},
    ) => {
      const current = await detail(id, person);
      const command = {
        id,
        requestId: randomUUID(),
        revision: current.variant.revision,
        action,
        sourceFingerprint: current.currentSourceFingerprint,
        note: '',
        evidenceUrl: '',
        publishedAt: null,
        correctsEventId: null,
        ...changes,
      };
      return { command, result: await call('decide', command, person) };
    };
    await rejects(
      'A save requires the reviewed source fingerprint',
      () => call('save', input()),
      409,
    );
    await rejects(
      'Hidden native creative cannot be requested by its known ID',
      () =>
        prepare(
          input({
            asset: {
              taskId: fixture.sourceTasks.hidden,
              submissionVersion: 1,
              assetId: fixture.assets.hidden,
            },
          }),
        ),
      403,
    );
    await rejects(
      'An ordinary owner cannot assign another person',
      () => prepare(input({ ownerId: fixture.people.secondWriter.memberId })),
      403,
    );
    await rejects(
      'An owner cannot select themself as reviewer',
      () => prepare(input({ reviewerId: fixture.people.writer.memberId })),
      400,
    );
    await rejects(
      'Instagram cannot be submitted as a text-only post',
      () => prepare(input({ format: 'TEXT', asset: null })),
      400,
    );
    await rejects(
      'Planned local time must match the explicit instant and zone',
      () => prepare(input({ plannedLocal: '2026-11-20T07:00' })),
      400,
    );
    await rejects(
      'Ambiguous daylight-saving local time requires an unambiguous choice',
      () =>
        prepare(
          input({
            timezone: 'America/New_York',
            plannedLocal: '2026-11-01T01:30',
            plannedAt: '2026-11-01T05:30:00Z',
          }),
        ),
      400,
    );
    const prepared = await prepare(input());
    await isolated(async () => {
      const tikTokCommand = accountInput(fixture, 'TIKTOK');
      await call('saveAccount', tikTokCommand, fixture.people.admin);
      const tikTok = (
        await call('projectChoices', { projectId: fixture.projects.first })
      ).accounts.find((item) => item.id === tikTokCommand.id);
      assert(tikTok);
      await prepare(
        input({
          ...packageBody(fixture, tikTok),
          reviewerId: fixture.people.admin.memberId,
          format: 'IMAGE',
        }),
      );
      await prepare(
        input({
          ...packageBody(fixture, tikTok),
          reviewerId: fixture.people.admin.memberId,
          format: 'VIDEO',
          asset: {
            taskId: fixture.sourceTasks.video,
            submissionVersion: 1,
            assetId: fixture.assets.video,
          },
        }),
      );
      await rejects(
        'TikTok text-only packages remain unavailable',
        () =>
          prepare(
            input({
              ...packageBody(fixture, tikTok),
              reviewerId: fixture.people.admin.memberId,
              format: 'TEXT',
              asset: null,
            }),
          ),
        400,
      );
      pass(
        'TikTok manual photo and video packages accept their matching independently approved native media',
      );
    });
    const rowsBeforePreview = await count('deliveryContentEvent');
    await call('preview', prepared);
    assert.equal(await count('deliveryContentEvent'), rowsBeforePreview);
    pass(
      'Preparation is read-only and cannot create activity or saved versions',
    );
    await isolated(async () => {
      await manager.query(
        'UPDATE core."deliveryTask" SET details=jsonb_set(details,\'{submissions,0,feedback}\',to_jsonb($3::text)) WHERE "workspaceId"=$1 AND "taskId"=$2',
        [
          fixture.workspaceId,
          fixture.taskId,
          'FIXTURE changed source evidence after preview',
        ],
      );
      await rejects(
        'Native source changes between preview and save reject the stale preparation',
        () => call('save', prepared),
        409,
      );
    });
    const saved = await call('save', prepared);
    assert.equal(saved.status, 'DRAFT');
    assert.equal(saved.version, 1);
    const first = await detail(prepared.id);
    assert.deepEqual(first.body.contributorIds, [
      fixture.people.writer.memberId,
    ]);
    assert.equal(first.body.assetSnapshot.assetId, fixture.assets.approved);
    assert.equal(first.body.account.profileUrl, account.profileUrl);
    assert.equal(first.plan.createdBy, fixture.people.admin.memberId);
    pass(
      'Saved package captures exact account, native source, responsible people and actual contributor',
    );
    for (const [label, path, value] of [
      [
        'Self-reviewed native submission',
        '{submissions,0,reviewedBy}',
        fixture.people.writer.memberId,
      ],
      [
        'Missing frozen client anchor',
        '{submissions,0,creativeLearning,companyId}',
        null,
      ],
      [
        'A native submission no longer approved',
        '{submissions,0,decision}',
        'CHANGES_REQUESTED',
      ],
      [
        'Native final bytes marked unavailable',
        '{creative,assets,0,storageState}',
        'FAILED',
      ],
    ]) {
      await isolated(async () => {
        await manager.query(
          'UPDATE core."deliveryTask" SET details=jsonb_set(details,$3::text[],$4::jsonb) WHERE "workspaceId"=$1 AND "taskId"=$2',
          [fixture.workspaceId, fixture.taskId, path, JSON.stringify(value)],
        );
        await rejects(`${label} cannot prepare a posting package`, () =>
          prepare(input()),
        );
      });
    }
    const independentRole = async (person, operation) =>
      isolated(async () => {
        const roleId = randomUUID();
        await manager.query(
          'INSERT INTO core.role (id,"workspaceId",label,"universalIdentifier","applicationId") VALUES($1,$2,$3,$1,$4)',
          [
            roleId,
            fixture.workspaceId,
            'FIXTURE exact assigned-person native visibility',
            fixture.workspace.workspaceCustomApplicationId,
          ],
        );
        await manager.query(
          'UPDATE core."roleTarget" SET "roleId"=$3 WHERE "workspaceId"=$1 AND "userWorkspaceId"=$2',
          [fixture.workspaceId, person.userWorkspaceId, roleId],
        );
        const data = native.native.data;
        const originalRole = data.userWorkspaceRoleMap[person.userWorkspaceId];
        data.userWorkspaceRoleMap[person.userWorkspaceId] = roleId;
        data.rolesPermissions[roleId] = structuredClone(
          data.rolesPermissions[fixture.nativeRoleId],
        );
        try {
          await operation(
            data.rolesPermissions[roleId][native.native.taskObject.id],
            roleId,
            data,
          );
        } finally {
          data.userWorkspaceRoleMap[person.userWorkspaceId] = originalRole;
          delete data.rolesPermissions[roleId];
        }
      });
    await independentRole(fixture.people.reader, async (permission) => {
      permission.canReadObjectRecords = false;
      await rejects(
        'A project reviewer with capability but no native object access cannot be assigned this media',
        () => prepare(input({ reviewerId: fixture.people.reader.memberId })),
      );
    });
    await independentRole(fixture.people.reader, async (permission) => {
      permission.restrictedFields[native.native.taskFields[1].id] = {
        canRead: false,
        canUpdate: false,
      };
      await rejects(
        'A project reviewer lacking exact native title visibility cannot be assigned this media',
        () => prepare(input({ reviewerId: fixture.people.reader.memberId })),
      );
    });
    await independentRole(
      fixture.people.reader,
      async (_permission, roleId, data) => {
        const previous = data.flatRowLevelPermissionPredicateMaps;
        const predicateId = randomUUID();
        const predicate = {
          ...native.native.predicate,
          id: predicateId,
          universalIdentifier: predicateId,
          roleId,
          roleUniversalIdentifier: roleId,
          value: 'FIXTURE_INACCESSIBLE_NATIVE_SOURCE',
        };
        data.flatRowLevelPermissionPredicateMaps = native.native.maps([
          ...Object.values(previous.byUniversalIdentifier),
          predicate,
        ]);
        try {
          await rejects(
            'A reviewer with native row rules excluding this exact source cannot be assigned its media',
            () =>
              prepare(input({ reviewerId: fixture.people.reader.memberId })),
          );
        } finally {
          data.flatRowLevelPermissionPredicateMaps = previous;
        }
      },
    );
    await independentRole(fixture.people.secondWriter, async (permission) => {
      permission.canReadObjectRecords = false;
      await rejects(
        'A manager cannot assign media work to an owner who cannot read its native source',
        () =>
          prepare(
            input({
              ownerId: fixture.people.secondWriter.memberId,
              reviewerId: fixture.people.reader.memberId,
            }),
            fixture.people.admin,
          ),
      );
    });
    const eventCount = await count('deliveryContentEvent');
    assert.deepEqual(await call('save', prepared), saved);
    assert.equal(await count('deliveryContentEvent'), eventCount);
    assert.deepEqual(
      (await call('receipt', { requestId: prepared.requestId })).receipt,
      saved,
    );
    pass(
      'Identical actor, request and body replay returns one original receipt without duplicate history',
    );
    await rejects(
      'Reusing the request with a changed body conflicts',
      () =>
        call('save', {
          ...prepared,
          body: { ...prepared.body, caption: 'FIXTURE different command' },
        }),
      409,
    );
    await rejects('Another actor cannot recover a private saved request', () =>
      call('receipt', { requestId: prepared.requestId }, fixture.people.reader),
    );
    await rejects(
      'Parent context cannot change after a variant exists',
      () =>
        call(
          'savePlan',
          {
            ...planCommand,
            requestId: randomUUID(),
            revision: plan.revision,
            purpose: 'FIXTURE changed parent context',
          },
          fixture.people.admin,
        ),
      409,
    );
    const submitted = await decision(prepared.id, 'SUBMIT');
    assert.equal(submitted.result.status, 'REVIEW');
    await rejects(
      'Owner cannot approve their own exact post',
      () => decision(prepared.id, 'APPROVE'),
      403,
    );
    await rejects(
      'A submitted package cannot be edited underneath review',
      () =>
        prepare({
          ...prepared,
          requestId: randomUUID(),
          revision: submitted.result.revision,
          body: { ...prepared.body, caption: 'FIXTURE changed under review' },
        }),
      409,
    );
    const approved = await decision(
      prepared.id,
      'APPROVE',
      fixture.people.admin,
    );
    assert.equal(approved.result.status, 'APPROVED');
    pass(
      'Parent plan author can independently approve staff-created posting content',
    );
    const failed = await decision(
      prepared.id,
      'RECORD_FAILED',
      fixture.people.writer,
      { note: 'FIXTURE manual upload failed; no provider call.' },
    );
    assert.equal(failed.result.status, 'APPROVED');
    assert.equal(
      (await call('list', { projectId: fixture.projects.first })).items.find(
        (item) => item.id === prepared.id,
      ).lastAttemptAction,
      'RECORD_FAILED',
    );
    assert.equal(
      (await detail(prepared.id)).variant.lastAttemptAt,
      failed.result.createdAt,
    );
    const uncertain = await decision(
      prepared.id,
      'RECORD_UNCERTAIN',
      fixture.people.writer,
      { note: 'FIXTURE external outcome not confirmed; no provider retry.' },
    );
    assert.equal(uncertain.result.status, 'APPROVED');
    assert.equal(
      (await detail(prepared.id)).variant.lastAttemptAction,
      'RECORD_UNCERTAIN',
    );
    await isolated(async () => {
      const revised = await save({
        ...prepared,
        requestId: randomUUID(),
        revision: uncertain.result.revision,
        body: {
          ...prepared.body,
          caption: 'FIXTURE fresh review after uncertain manual attempt.',
        },
      });
      assert.equal(revised.result.status, 'DRAFT');
      const current = await detail(prepared.id);
      assert.equal(current.variant.lastAttemptAction, null);
      assert.equal(current.variant.lastAttemptAt, null);
      assert(current.history.some((item) => item.id === uncertain.result.id));
      assert.equal(
        (await call('list', { projectId: fixture.projects.first })).items.find(
          (item) => item.id === prepared.id,
        ).lastAttemptAction,
        null,
      );
      pass(
        'New package version clears current attempt warning without erasing prior failed or uncertain history',
      );
    });
    pass(
      'Failed and uncertain manual attempts append evidence without claiming publication',
    );
    await rejects(
      'A future actual publication time is rejected',
      () =>
        decision(prepared.id, 'RECORD_PUBLICATION', fixture.people.writer, {
          evidenceUrl: 'https://www.instagram.com/p/FIXTURE_POST/',
          publishedAt: '2099-01-01T00:00:00Z',
        }),
      400,
    );
    const publication = await decision(
      prepared.id,
      'RECORD_PUBLICATION',
      fixture.people.writer,
      {
        note: 'FIXTURE manual attestation only.',
        evidenceUrl: 'https://www.instagram.com/p/FIXTURE_POST/',
        publishedAt: WHEN,
      },
    );
    assert.equal(publication.result.status, 'PUBLISHED');
    const publishedBody = (await detail(prepared.id)).body;
    await rejects(
      'A published package cannot be rewritten',
      () =>
        prepare({
          ...prepared,
          requestId: randomUUID(),
          revision: publication.result.revision,
          body: { ...prepared.body, caption: 'FIXTURE attempted rewrite' },
        }),
      409,
    );
    await rejects(
      'First publication cannot be recorded twice',
      () =>
        decision(prepared.id, 'RECORD_PUBLICATION', fixture.people.writer, {
          evidenceUrl: 'https://www.instagram.com/p/FIXTURE_SECOND/',
          publishedAt: WHEN,
        }),
      403,
    );
    const correction = await decision(
      prepared.id,
      'CORRECT_PUBLICATION',
      fixture.people.writer,
      {
        note: 'FIXTURE correcting a mistyped public URL.',
        evidenceUrl: 'https://www.instagram.com/p/FIXTURE_CORRECTED/',
        publishedAt: WHEN,
        correctsEventId: publication.result.id,
      },
    );
    assert.equal(correction.result.correctsEventId, publication.result.id);
    assert.deepEqual((await detail(prepared.id)).body, publishedBody);
    assert(
      (await detail(prepared.id)).history.some(
        (item) =>
          item.id === publication.result.id &&
          item.evidenceUrl.endsWith('/FIXTURE_POST/'),
      ),
    );
    pass(
      'Correction appends to exact latest publication evidence while retaining original package and original URL',
    );
    await rejects(
      'A correction cannot overwrite evidence newer than its reviewed predecessor',
      () =>
        decision(prepared.id, 'CORRECT_PUBLICATION', fixture.people.writer, {
          note: 'FIXTURE stale correction.',
          evidenceUrl: 'https://www.instagram.com/p/FIXTURE_STALE/',
          publishedAt: WHEN,
          correctsEventId: publication.result.id,
        }),
      409,
    );
    const facebookCommand = accountInput(fixture, 'FACEBOOK');
    await call('saveAccount', facebookCommand, fixture.people.admin);
    const facebook = (
      await call('projectChoices', { projectId: fixture.projects.first })
    ).accounts.find((item) => item.id === facebookCommand.id);
    assert(facebook);
    const sibling = await save(
      input({
        ...packageBody(fixture, facebook),
        reviewerId: fixture.people.admin.memberId,
        caption: 'FIXTURE Facebook variant.',
      }),
    );
    await decision(sibling.command.id, 'SUBMIT');
    await decision(
      sibling.command.id,
      'REQUEST_CHANGES',
      fixture.people.admin,
      { note: 'FIXTURE adapt the caption to Facebook.' },
    );
    const siblingCurrent = await detail(sibling.command.id);
    const changedSibling = await save({
      ...sibling.command,
      requestId: randomUUID(),
      revision: siblingCurrent.variant.revision,
      body: {
        ...sibling.command.body,
        caption: 'FIXTURE revised Facebook caption.',
      },
    });
    assert.equal(changedSibling.result.version, 2);
    assert.equal(changedSibling.result.status, 'DRAFT');
    assert.equal((await detail(prepared.id)).variant.status, 'PUBLISHED');
    assert.deepEqual((await detail(prepared.id)).body, publishedBody);
    assert.equal(
      (await detail(sibling.command.id, fixture.people.writer, { version: 1 }))
        .body.caption,
      sibling.command.body.caption,
    );
    pass(
      'Unpublished sibling revision requires new review without altering published Instagram or earlier Facebook history',
    );
    const summary = await call('list', { projectId: fixture.projects.first });
    assert.equal(summary.totalCount, 2);
    assert.equal(
      summary.platformCounts.find((item) => item.platform === 'INSTAGRAM')
        .publishedCount,
      1,
    );
    assert.equal(
      summary.platformCounts.find((item) => item.platform === 'FACEBOOK')
        .publishedCount,
      0,
    );
    const calendarInput = {
      projectId: fixture.projects.first,
      from: '2026-11-01T00:00:00Z',
      to: '2026-12-01T00:00:00Z',
      timezone: 'Asia/Qatar',
    };
    const calendar = await call('calendar', calendarInput);
    assert.equal(calendar.totalCount, 2);
    assert.equal(
      calendar.days.find((item) => item.date === '2026-11-20').count,
      2,
    );
    assert.equal(
      (await call('calendar', { ...calendarInput, status: 'PUBLISHED' }))
        .totalCount,
      1,
    );
    pass(
      'List platform outcomes and complete filtered calendar counts respect each independent variant',
    );
    await rejects(
      'Calendar range is bounded',
      () => call('calendar', { ...calendarInput, to: '2027-12-01T00:00:00Z' }),
      400,
    );
    await rejects(
      'A cursor must belong to the exact current filtered query',
      () =>
        call('list', {
          projectId: fixture.projects.first,
          status: 'DRAFT',
          afterId: prepared.id,
        }),
      409,
    );
    await isolated(async () => {
      const candidate = await save(input());
      const before = await detail(candidate.command.id);
      const notes = await save(
        {
          ...candidate.command,
          requestId: randomUUID(),
          revision: before.variant.revision,
          body: {
            ...candidate.command.body,
            notes: 'FIXTURE manager coordination note only.',
          },
        },
        fixture.people.admin,
      );
      assert.equal(notes.result.version, 2);
      assert.deepEqual(
        (await detail(candidate.command.id)).body.contributorIds,
        [fixture.people.writer.memberId],
      );
      await decision(candidate.command.id, 'SUBMIT');
      assert.equal(
        (await decision(candidate.command.id, 'APPROVE', fixture.people.admin))
          .result.status,
        'APPROVED',
      );
      pass(
        'Manager coordination notes do not falsely count as creative authorship or block independent posting review',
      );
    });
    await isolated(async () => {
      const candidate = await save(input());
      const current = await detail(candidate.command.id);
      await rejects(
        'A meaningful caption editor cannot remain their own posting reviewer',
        () =>
          prepare(
            {
              ...candidate.command,
              requestId: randomUUID(),
              revision: current.variant.revision,
              body: {
                ...candidate.command.body,
                caption: 'FIXTURE administrator wrote this caption.',
              },
            },
            fixture.people.admin,
          ),
        400,
      );
      const cancelled = await decision(
        candidate.command.id,
        'CANCEL',
        fixture.people.writer,
        { note: 'FIXTURE plan no longer needs this post.' },
      );
      assert.equal(cancelled.result.status, 'CANCELLED');
      const currentCancelled = await detail(candidate.command.id);
      assert.deepEqual(currentCancelled.allowedActions, []);
      await rejects(
        'Cancelled work cannot be submitted as if still active',
        () => decision(candidate.command.id, 'SUBMIT'),
      );
      assert.equal((await detail(prepared.id)).variant.status, 'PUBLISHED');
      pass(
        'Cancellation records its own variant outcome without changing a published sibling',
      );
    });
    await isolated(async () => {
      const xCommand = accountInput(fixture, 'X');
      await call('saveAccount', xCommand, fixture.people.admin);
      const x = (
        await call('projectChoices', { projectId: fixture.projects.first })
      ).accounts.find((item) => item.id === xCommand.id);
      assert(x);
      const textPost = await save(
        input({
          ...packageBody(fixture, x),
          reviewerId: fixture.people.admin.memberId,
          format: 'TEXT',
          asset: null,
          plannedAt: '2026-11-19T22:30:00Z',
          plannedLocal: '2026-11-20T01:30',
        }),
      );
      const permission =
        native.native.data.rolesPermissions[fixture.nativeRoleId][
          native.native.taskObject.id
        ];
      permission.canReadObjectRecords = false;
      try {
        const textList = await call('list', {
          projectId: fixture.projects.first,
        });
        assert.deepEqual(
          textList.items.map((item) => item.id),
          [textPost.command.id],
        );
        assert.equal(textList.totalCount, 1);
        assert.equal((await detail(textPost.command.id)).body.asset, null);
        assert.equal((await call('calendar', calendarInput)).totalCount, 1);
        await rejects(
          'Missing native task permission still withholds linked media detail',
          () => detail(prepared.id),
          403,
        );
        pass(
          'Text-only work remains usable without unrelated native task permission while media stays private',
        );
      } finally {
        permission.canReadObjectRecords = true;
      }
      const qatar = await call('calendar', {
        ...calendarInput,
        accountId: x.id,
      });
      const utc = await call('calendar', {
        ...calendarInput,
        accountId: x.id,
        timezone: 'UTC',
      });
      assert.equal(qatar.days[0].date, '2026-11-20');
      assert.equal(utc.days[0].date, '2026-11-19');
      pass('Calendar date grouping follows the chosen zone across midnight');
      const pagePlans = [planInput(fixture), planInput(fixture)];
      for (const pagePlan of pagePlans)
        await call('savePlan', pagePlan, fixture.people.admin);
      for (let index = 0; index < 26; index++)
        await save(
          input(
            {
              ...packageBody(fixture, x),
              reviewerId: fixture.people.admin.memberId,
              format: 'TEXT',
              asset: null,
              caption: `FIXTURE paged content ${index}`,
            },
            { planId: pagePlans[index < 13 ? 0 : 1].id, planRevision: 1 },
          ),
        );
      const firstPage = await call('list', {
        projectId: fixture.projects.first,
        accountId: x.id,
      });
      assert.equal(firstPage.items.length, 25);
      assert.equal(firstPage.totalCount, 27);
      assert(firstPage.nextId);
      const lastPage = await call('list', {
        projectId: fixture.projects.first,
        accountId: x.id,
        afterId: firstPage.nextId,
      });
      assert.equal(lastPage.items.length, 2);
      assert.equal(lastPage.totalCount, 27);
      assert.equal(
        new Set([...firstPage.items, ...lastPage.items].map((item) => item.id))
          .size,
        27,
      );
      assert.equal(
        (await call('calendar', { ...calendarInput, accountId: x.id }))
          .totalCount,
        27,
      );
      pass(
        'Bounded two-page list and complete calendar represent all 27 matching posts without duplication',
      );
    });
    await isolated(async () => {
      const receipt = await call(
        'saveAccount',
        {
          ...accountCommand,
          requestId: randomUUID(),
          revision: account.revision,
          archived: true,
        },
        fixture.people.admin,
      );
      assert.equal(receipt.revision, 2);
      const old = await detail(prepared.id);
      assert.equal(old.body.account.archived, false);
      await rejects(
        'Archived account blocks new preparation',
        () => prepare(input()),
        409,
      );
      const archivalCorrection = await decision(
        prepared.id,
        'CORRECT_PUBLICATION',
        fixture.people.writer,
        {
          note: 'FIXTURE correct historical evidence after account archive.',
          evidenceUrl:
            'https://www.instagram.com/p/FIXTURE_ARCHIVED_CORRECTION/',
          publishedAt: WHEN,
          correctsEventId: correction.result.id,
        },
      );
      assert.equal(archivalCorrection.result.status, 'PUBLISHED');
      assert.deepEqual((await detail(prepared.id)).body, publishedBody);
      pass(
        'Account archive keeps immutable published account snapshot readable and permits exact historical evidence correction',
      );
    });
    await isolated(async () => {
      await manager.query(
        'UPDATE core."deliveryOperations" SET state=jsonb_set(state,\'{clients,engagements,0,services}\',\'[]\'::jsonb) WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      );
      assert.equal((await detail(prepared.id)).variant.status, 'PUBLISHED');
      await rejects(
        'Removed client service blocks new preparation while same-client history remains readable',
        () => prepare(input()),
        409,
      );
    });
    await isolated(async () => {
      await manager.query(
        `UPDATE ${quote(fixture.schemaName)}.task SET title='PRIVATE_NATIVE_RLS_HIDDEN_TASK' WHERE id=$1`,
        [fixture.taskId],
      );
      const hiddenList = await call('list', {
        projectId: fixture.projects.first,
      });
      assert.equal(hiddenList.totalCount, 0);
      assert.equal((await call('calendar', calendarInput)).totalCount, 0);
      await rejects(
        'Native row revocation withholds exact detail',
        () => detail(prepared.id),
        403,
      );
      await rejects(
        'Native row revocation withholds saved-action recovery',
        () => call('receipt', { requestId: prepared.requestId }),
        403,
      );
      pass(
        'Native row visibility applies before list/calendar totals or private history and receipt projection',
      );
    });
    const permission =
      native.native.data.rolesPermissions[fixture.nativeRoleId][
        native.native.taskObject.id
      ];
    permission.restrictedFields[native.native.taskFields[1].id] = {
      canRead: false,
      canUpdate: false,
    };
    try {
      await rejects(
        'Native title field restriction prevents dependent source projection',
        () => call('assetChoices', { projectId: fixture.projects.first }),
        403,
      );
      await rejects(
        'Native title field restriction prevents dependent content detail',
        () => detail(prepared.id),
        403,
      );
    } finally {
      delete permission.restrictedFields[native.native.taskFields[1].id];
    }
    native.state.changingHash = true;
    try {
      await rejects(
        'Concurrent native metadata change fails closed',
        () => call('assetChoices', { projectId: fixture.projects.first }),
        409,
      );
    } finally {
      native.state.changingHash = false;
    }
    await isolated(async () => {
      await manager.query(
        'UPDATE core."deliveryProject" SET "companyId"=null WHERE id=$1',
        [fixture.projects.first],
      );
      assert.equal(
        (await call('list', { projectId: fixture.projects.first })).totalCount,
        0,
      );
      assert.equal((await call('calendar', calendarInput)).totalCount, 0);
      await rejects(
        'Changing the project client withholds earlier brand packages',
        () => detail(prepared.id),
        403,
      );
      await rejects(
        'Changing the project client withholds earlier saved receipts',
        () => call('receipt', { requestId: prepared.requestId }),
        403,
      );
    });
    await isolated(async () => {
      await manager.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        [fixture.people.writer.userWorkspaceId],
      );
      await rejects(
        'Inactive members cannot read or recover content',
        () => detail(prepared.id),
        403,
      );
    });
    await isolated(async () => {
      await assert.rejects(
        () =>
          manager.query(
            'DELETE FROM core."deliveryContentAccount" WHERE id=$1',
            [account.id],
          ),
        (error) => error.code === '23503',
      );
      pass('Retained posting versions prevent destructive account removal');
    });
    await isolated(async () => {
      await assert.rejects(
        () =>
          manager.query(
            'DELETE FROM core."deliveryContentVersion" WHERE "workspaceId"=$1 AND "variantId"=$2 AND version=1',
            [fixture.workspaceId, prepared.id],
          ),
        (error) => error.code === '23503',
      );
      pass(
        'Retained event receipts prevent deleting historical reviewed versions',
      );
    });
    await isolated(async () => {
      const command = await prepare(input());
      const before = await Promise.all(
        [...CONTENT_TABLES, 'otogrowActivityEvent'].map(count),
      );
      await manager.query(
        `CREATE FUNCTION ${quote(fixture.schemaName)}.deny_content_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId"='${fixture.workspaceId}'::uuid THEN RAISE EXCEPTION 'FIXTURE content audit failure'; END IF; RETURN NEW; END $$`,
      );
      await manager.query(
        `CREATE TRIGGER fixture_content_audit_failure BEFORE INSERT ON core."otogrowActivityEvent" FOR EACH ROW EXECUTE FUNCTION ${quote(fixture.schemaName)}.deny_content_audit()`,
      );
      await assert.rejects(
        () =>
          manager.transaction((commandManager) =>
            implementation.call(
              'save',
              command,
              fixture.people.writer,
              commandManager,
            ),
          ),
        /FIXTURE content audit failure/,
      );
      assert.deepEqual(
        await Promise.all(
          [...CONTENT_TABLES, 'otogrowActivityEvent'].map(count),
        ),
        before,
      );
      assert.equal(
        (await call('receipt', { requestId: command.requestId })).receipt,
        null,
      );
      pass(
        'An audit failure rolls back package header, version and receipt atomically',
      );
    });
    assert.deepEqual(await readState(), originalWork);
    pass(
      'Content work leaves existing Operations, native task state and creative fulfilment unchanged',
    );
    const audit = await manager.query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    assert(audit.length > 0);
    assert(!JSON.stringify(audit).includes('FIXTURE brand post caption'));
    assert(!JSON.stringify(audit).includes('instagram.com/p/'));
    pass(
      'Activity evidence records action identity without private copy or publication URLs',
    );
    await runner.rollbackTransaction();
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    originalPreserved = true;
    pass(
      `Rollback preserves original schema and contents of all ${tables.length} existing tables`,
    );
    assert.equal(providerRequests, 0);
    process.stdout.write(
      `${JSON.stringify({ passed: checks.length, checks, providerRequests, committedWrites: 0 }, null, 2)}\n`,
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    if (!originalPreserved && originalSchema && originalData) {
      assert.equal(await schemaFingerprint(runner), originalSchema);
      assert.deepEqual(await dataFingerprint(runner), originalData);
      process.stderr.write(
        'Original schema and all table contents verified unchanged after failed proof rollback.\n',
      );
    }
    await runner.release();
    await connectionSource.destroy();
    for (const { owner, key, original } of transports) owner[key] = original;
  }
}
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
