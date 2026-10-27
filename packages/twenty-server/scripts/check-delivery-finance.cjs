const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
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
  DeliveryFinanceService,
} = require('../dist/modules/delivery/finance/delivery-finance.service');
const {
  OtogrowActivityEventEntity,
} = require('../dist/modules/otogrow-activity/entities/otogrow-activity-event.entity');

const MONTH = '7413-02';
const NEXT_MONTH = '7413-03';
const APRIL_MONTH = '7413-04';
const LEAP_MONTH = '7412-02';
const AGGREGATE_MONTH = '7421-01';
const ORIGINAL_SALARY = '9007199254740993';
const MAX_ENTRY_AMOUNT = '9223372036854775807';

(async () => {
  assert.equal(process.argv.length, 2, 'This script is rollback-only.');
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
    const [existing] = await runner.query(
      `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(existing, 'An initialized local workspace is required.');
    const workspaceId = randomUUID();
    const foreignWorkspaceId = randomUUID();
    const schemaName = `finance_fixture_${workspaceId.replaceAll('-', '_')}`;
    const schema = `"${schemaName}"`;
    await runner.query(`CREATE SCHEMA ${schema}`);
    await runner.query(
      `CREATE TABLE ${schema}."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
    );
    for (const id of [workspaceId, foreignWorkspaceId])
      await runner.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,'Finance rollback fixture',$2,$3,'ACTIVE',$4,$5)`,
        [
          id,
          `finance-${id}`,
          schemaName,
          existing.workspaceCustomApplicationId,
          existing.defaultRoleId,
        ],
      );
    const [workspace] = await runner.query(
      'SELECT * FROM core.workspace WHERE id=$1',
      [workspaceId],
    );
    const [foreignWorkspace] = await runner.query(
      'SELECT * FROM core.workspace WHERE id=$1',
      [foreignWorkspaceId],
    );
    const admin = randomUUID();
    const reader = randomUUID();
    const writer = randomUUID();
    const employee = randomUUID();
    const outsider = randomUUID();
    const people = new Map();
    for (const [memberId, name] of [
      [admin, 'Finance administrator fixture'],
      [reader, 'Finance reader fixture'],
      [writer, 'Finance writer fixture'],
      [employee, 'Finance salary employee fixture'],
      [outsider, 'Finance outsider fixture'],
    ]) {
      const userId = randomUUID();
      people.set(memberId, userId);
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        userId,
        `${userId}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [memberId, userId, workspaceId],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES ($1,$2,$3,'')`,
        [memberId, userId, name],
      );
    }
    const roles = new Map();
    for (const [memberId, capability] of [
      [reader, 'finance.read'],
      [writer, 'finance.manage'],
    ]) {
      const roleId = randomUUID();
      roles.set(memberId, roleId);
      await runner.query(
        'INSERT INTO core."otogrowRole" (id,"workspaceId",name,description,capabilities,revision) VALUES ($1,$2,$3,\'Rollback fixture\',$4,1)',
        [roleId, workspaceId, `Finance fixture ${capability}`, [capability]],
      );
      await runner.query(
        'INSERT INTO core."otogrowMemberAccess" ("workspaceId","workspaceMemberId",revision) VALUES ($1,$2,1)',
        [workspaceId, memberId],
      );
      await runner.query(
        'INSERT INTO core."otogrowRoleAssignment" ("workspaceId","workspaceMemberId","roleId") VALUES ($1,$2,$3)',
        [workspaceId, memberId, roleId],
      );
    }
    const projectId = randomUUID();
    const secondProjectId = randomUUID();
    const foreignProjectId = randomUUID();
    for (const [id, targetWorkspace, name] of [
      [projectId, workspaceId, 'Finance client one fixture'],
      [secondProjectId, workspaceId, 'Finance client two fixture'],
      [foreignProjectId, foreignWorkspaceId, 'Foreign finance client fixture'],
    ])
      await runner.query(
        'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,$3,\'[]\')',
        [id, targetWorkspace, name],
      );

    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const nativeAdministrators = new Set([admin]);
    const access = new OtogrowAccessService(source, {
      userHasWorkspaceSettingPermission: async ({
        workspaceId: targetWorkspace,
        userWorkspaceId,
      }) =>
        targetWorkspace === workspaceId &&
        nativeAdministrators.has(userWorkspaceId),
    });
    const delivery = new DeliveryService(source, access);
    const finance = new DeliveryFinanceService(source, delivery, access);
    let failedActivitySourceId = null;
    let failPreparationAfter = 0;
    const originalRepository = runner.manager.getRepository.bind(
      runner.manager,
    );
    runner.manager.getRepository = (entity) => {
      const repository = originalRepository(entity);
      if (entity !== OtogrowActivityEventEntity) return repository;
      return new Proxy(repository, {
        get(target, property) {
          if (property === 'insert')
            return async (input) => {
              if (
                input.action === 'FINANCE_ENTRY_PREPARED' &&
                failPreparationAfter > 0
              ) {
                failPreparationAfter--;
                if (!failPreparationAfter)
                  throw new Error('Injected preparation activity failure');
              }
              if (
                failedActivitySourceId &&
                input.sourceId === failedActivitySourceId
              )
                throw new Error('Injected finance activity failure');
              return target.insert(input);
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    let observingRead = false;
    let readWrites = 0;
    const originalQuery = runner.query.bind(runner);
    runner.query = async (sql, ...arguments_) => {
      if (
        observingRead &&
        /^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(
          sql,
        )
      ) {
        readWrites++;
        assert.fail('Monthly finance read issued a write.');
      }
      return originalQuery(sql, ...arguments_);
    };
    const read = async (
      input = {},
      memberId = reader,
      userWorkspaceId = memberId,
      targetWorkspace = workspace,
    ) => {
      observingRead = true;
      try {
        return await finance.snapshot(
          targetWorkspace,
          memberId,
          userWorkspaceId,
          { month: MONTH, ...input },
        );
      } finally {
        observingRead = false;
      }
    };
    const history = async (entryId, memberId = reader, beforeId) => {
      observingRead = true;
      try {
        return await finance.history(workspace, memberId, memberId, {
          entryId,
          ...(beforeId ? { beforeId } : {}),
        });
      } finally {
        observingRead = false;
      }
    };
    const entry = async (id, month = MONTH) => {
      const value = (await read({ month, selectedEntryId: id })).selectedEntry;
      assert(value, 'Expected selected finance entry');
      return value;
    };
    const plan = async (id) => {
      const value = (await read({ selectedPlanId: id })).selectedPlan;
      assert(value, 'Expected selected cost plan');
      return value;
    };
    const savePlan = (input, memberId = writer) =>
      finance.savePlan(workspace, memberId, memberId, input);
    const saveEntry = (input, memberId = writer) =>
      finance.saveEntry(workspace, memberId, memberId, input);
    const prepare = (month = MONTH, memberId = writer, extra = {}) =>
      finance.prepareMonth(workspace, memberId, memberId, { month, ...extra });
    const post = (value, extra = {}, memberId = writer) =>
      finance.postEntry(workspace, memberId, memberId, {
        id: value.id,
        revision: value.revision,
        ...(value.sourceReviewToken
          ? { expectedSourceReviewToken: value.sourceReviewToken }
          : {}),
        ...extra,
      });
    const voidEntry = (
      value,
      reason = 'Fixture correction with retained evidence',
      memberId = writer,
    ) =>
      finance.voidEntry(workspace, memberId, memberId, {
        id: value.id,
        revision: value.revision,
        reason,
      });
    const planInput = (fields = {}) => ({
      id: randomUUID(),
      revision: 0,
      type: 'SALARY',
      name: 'Monthly salary fixture',
      currency: 'USD',
      monthlyAmountMicros: ORIGINAL_SALARY,
      memberId: employee,
      startMonth: MONTH,
      endMonth: NEXT_MONTH,
      dueDay: 31,
      active: true,
      ...fields,
    });
    const editablePlan = (value, fields = {}) => ({
      id: value.id,
      revision: value.revision,
      type: value.type,
      name: value.name,
      currency: value.currency,
      monthlyAmountMicros: value.monthlyAmountMicros,
      memberId: value.memberId,
      startMonth: value.startMonth,
      endMonth: value.endMonth,
      dueDay: value.dueDay,
      active: value.active,
      ...fields,
    });
    const entryInput = (fields = {}) => ({
      id: randomUUID(),
      revision: 0,
      month: MONTH,
      kind: 'REVENUE',
      category: 'Service revenue',
      title: 'Earned service revenue fixture',
      currency: 'USD',
      amountMicros: '1000000',
      note: 'Explicit monthly service evidence fixture',
      evidenceUrl: null,
      allocations: [{ projectId, amountMicros: '1000000' }],
      ...fields,
    });
    const editableEntry = (value, fields = {}) => ({
      id: value.id,
      revision: value.revision,
      month: value.month,
      kind: value.kind,
      category: value.category,
      title: value.title,
      currency: value.currency,
      amountMicros: value.amountMicros,
      note: value.note,
      evidenceUrl: value.evidenceUrl,
      allocations: value.allocations.map((allocation) => ({
        projectId: allocation.projectId,
        amountMicros: allocation.amountMicros,
      })),
      ...fields,
    });
    const planEntry = async (planId, month = MONTH) => {
      const [row] = await runner.query(
        'SELECT id FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND "planId"=$2 AND month=$3',
        [workspaceId, planId, month],
      );
      assert(row, 'Expected one prepared plan entry');
      return entry(row.id, month);
    };
    const localEvidence = async (sourceId) => {
      const output = {};
      for (const table of [
        'deliveryFinancePlan',
        'deliveryFinanceEntry',
        'deliveryFinanceAllocation',
        'deliveryFinanceEvent',
        'otogrowActivityEvent',
      ])
        output[table] = await runner.query(
          `SELECT * FROM core."${table}" WHERE "workspaceId"=$1 ${sourceId ? (table === 'deliveryFinanceAllocation' ? 'AND "entryId"=$2' : ['deliveryFinanceEvent', 'otogrowActivityEvent'].includes(table) ? 'AND "sourceId"=$2' : 'AND id=$2') : ''} ORDER BY id`,
          sourceId ? [workspaceId, sourceId] : [workspaceId],
        );
      return output;
    };

    assert.equal((await read()).canManage, false);
    assert.equal((await read({}, writer)).canManage, true);
    assert.equal((await read({}, admin)).canManage, true);
    await assert.rejects(read({}, outsider), { status: 403 });
    await assert.rejects(read({}, reader, writer), { status: 403 });
    await assert.rejects(read({}, reader, reader, foreignWorkspace), {
      status: 403,
    });
    for (const invalidMonth of [
      '0000-01',
      '2026-00',
      '2026-13',
      '2026-1',
      '2026-02-01',
      'invalid',
    ])
      await assert.rejects(read({ month: invalidMonth }), { status: 400 });
    await assert.rejects(savePlan(planInput(), reader), { status: 403 });
    await assert.rejects(saveEntry(entryInput(), reader), { status: 403 });
    await assert.rejects(prepare(MONTH, reader), { status: 403 });
    for (const amountMicros of [
      '-1',
      '1.0',
      '01',
      '1e6',
      '9223372036854775808',
    ])
      await assert.rejects(saveEntry(entryInput({ amountMicros })), {
        status: 400,
      });
    await assert.rejects(saveEntry(entryInput({ currency: 'INVALID' })), {
      status: 400,
    });
    for (const evidenceUrl of [
      'not-a-url',
      'ftp://example.invalid/evidence',
      'javascript:alert(1)',
    ])
      await assert.rejects(saveEntry(entryInput({ evidenceUrl })), {
        status: 400,
      });
    const missingMonth = entryInput();
    delete missingMonth.month;
    await assert.rejects(saveEntry(missingMonth), { status: 400 });
    await assert.rejects(prepare('2026-13'), { status: 400 });

    const salaryPlan = planInput();
    const zeroPlan = planInput({
      type: 'OVERHEAD',
      name: 'Zero overhead fixture',
      monthlyAmountMicros: '0',
      memberId: null,
      endMonth: APRIL_MONTH,
    });
    const leapPlan = planInput({
      type: 'OVERHEAD',
      name: 'Leap-year overhead fixture',
      monthlyAmountMicros: '1',
      memberId: null,
      startMonth: LEAP_MONTH,
      endMonth: LEAP_MONTH,
    });
    assert.equal(await savePlan(salaryPlan), salaryPlan.id);
    await savePlan(zeroPlan);
    await savePlan(leapPlan);
    assert.equal(await savePlan(salaryPlan), salaryPlan.id);
    assert.equal((await plan(salaryPlan.id)).revision, 1);
    await assert.rejects(savePlan(salaryPlan, admin), { status: 409 });
    assert.equal(
      (await localEvidence(salaryPlan.id)).deliveryFinanceEvent.length,
      1,
    );
    await assert.rejects(
      savePlan({ ...salaryPlan, name: 'Changed retry payload' }),
      { status: 409 },
    );
    await assert.rejects(savePlan(planInput({ dueDay: 32 })), { status: 400 });
    await assert.rejects(savePlan(planInput({ dueDay: 0 })), { status: 400 });
    await assert.rejects(savePlan(planInput({ endMonth: LEAP_MONTH })), {
      status: 400,
    });
    await assert.rejects(
      savePlan(
        planInput({ memberId: randomUUID(), type: 'SALARY', active: true }),
      ),
      { status: 400 },
    );
    assert.equal((await prepare(LEAP_MONTH)).createdCount, 1);
    assert.equal(
      (await planEntry(leapPlan.id, LEAP_MONTH)).dueDate,
      '7412-02-29',
    );
    const beforeFailedPreparation = await localEvidence();
    failPreparationAfter = 2;
    await assert.rejects(prepare(), /Injected preparation activity failure/);
    failPreparationAfter = 0;
    assert.deepEqual(await localEvidence(), beforeFailedPreparation);
    const prepared = await prepare();
    assert.equal(prepared.createdCount, 2);
    const repeated = await prepare();
    assert.equal(repeated.createdCount, 0);
    assert.equal(repeated.existingCount, 2);
    let salary = await planEntry(salaryPlan.id);
    assert.equal(salary.amountMicros, ORIGINAL_SALARY);
    assert.equal(salary.sourcePlan.monthlyAmountMicros, ORIGINAL_SALARY);
    assert.equal(
      salary.sourcePlan.memberName,
      'Finance salary employee fixture',
    );
    assert.equal(salary.dueDate, '7413-02-28');
    assert.deepEqual(salary.allocations, []);
    assert.equal(salary.remainingAllocationMicros, ORIGINAL_SALARY);
    assert.equal(salary.sourceType, 'PLAN');
    assert.match(salary.sourceReviewToken, /^[a-f0-9]{64}$/);
    await assert.rejects(post(salary), /Allocate the full/);
    await assert.rejects(
      saveEntry(editableEntry(salary, { kind: 'REVENUE' })),
      { status: 400 },
    );
    await assert.rejects(
      saveEntry(editableEntry(salary, { category: 'Different cost' })),
      { status: 400 },
    );
    await assert.rejects(
      saveEntry(editableEntry(salary, { currency: 'EUR' })),
      { status: 400 },
    );
    await assert.rejects(
      saveEntry(editableEntry(salary, { month: NEXT_MONTH })),
      { status: 400 },
    );
    await assert.rejects(
      saveEntry(editableEntry(salary, { amountMicros: '1', allocations: [] })),
      /amount override/,
    );
    await saveEntry(
      editableEntry(salary, {
        allocations: [
          {
            projectId,
            amountMicros: (BigInt(ORIGINAL_SALARY) - 1n).toString(),
          },
          { projectId: null, amountMicros: '1' },
        ],
      }),
    );
    salary = await entry(salary.id);
    const reviewedSourceToken = salary.sourceReviewToken;
    const originalSource = structuredClone(salary.sourcePlan);
    let currentPlan = await plan(salaryPlan.id);
    await savePlan(
      editablePlan(currentPlan, {
        name: 'Revised future salary fixture',
        monthlyAmountMicros: (BigInt(ORIGINAL_SALARY) + 7n).toString(),
      }),
    );
    await assert.rejects(post(salary, { acknowledgeSourceWarnings: true }), {
      status: 409,
    });
    salary = await entry(salary.id);
    assert.notEqual(salary.sourceReviewToken, reviewedSourceToken);
    assert(salary.sourceWarnings.includes('SOURCE_PLAN_CHANGED'));
    assert.deepEqual(salary.sourcePlan, originalSource);
    await assert.rejects(post(salary), /acknowledge/);
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.get(employee),
    ]);
    await assert.rejects(post(salary, { acknowledgeSourceWarnings: true }), {
      status: 409,
    });
    salary = await entry(salary.id);
    assert(salary.sourceWarnings.includes('SOURCE_MEMBER_INACTIVE'));
    currentPlan = await plan(salaryPlan.id);
    assert.equal(currentPlan.memberActive, false);
    const departedPreparation = await prepare(NEXT_MONTH);
    let marchOverride = await planEntry(zeroPlan.id, NEXT_MONTH);
    assert.equal(marchOverride.dueDate, '7413-03-31');
    await saveEntry(
      editableEntry(marchOverride, {
        amountMicros: '1',
        note: 'Explicit overhead adjustment; no automatic proration.',
        allocations: [{ projectId: null, amountMicros: '1' }],
      }),
    );
    marchOverride = await entry(marchOverride.id, NEXT_MONTH);
    assert.equal(marchOverride.sourcePlan.monthlyAmountMicros, '0');
    await post(marchOverride);
    assert.equal((await entry(marchOverride.id, NEXT_MONTH)).amountMicros, '1');
    assert(
      departedPreparation.skipped.some(
        (item) =>
          item.planId === salaryPlan.id &&
          item.reason === 'SOURCE_MEMBER_INACTIVE',
      ),
    );
    const [notPrepared] = await runner.query(
      'SELECT count(*)::int AS count FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND "planId"=$2 AND month=$3',
      [workspaceId, salaryPlan.id, NEXT_MONTH],
    );
    assert.equal(notPrepared.count, 0);
    await assert.rejects(
      savePlan(planInput({ memberId: employee })),
      /active employee/,
    );
    await savePlan(editablePlan(currentPlan, { active: false }));
    salary = await entry(salary.id);
    assert(salary.sourceWarnings.includes('SOURCE_PLAN_INACTIVE'));
    await post(salary, { acknowledgeSourceWarnings: true });
    salary = await entry(salary.id);
    assert.equal(salary.status, 'POSTED');
    assert.deepEqual(salary.sourcePlan, originalSource);
    assert.equal(salary.allocations.length, 2);
    await assert.rejects(post(salary), { status: 409 });
    await assert.rejects(saveEntry(editableEntry(salary)), { status: 409 });
    await assert.rejects(voidEntry(salary, 'Read-only cannot void', reader), {
      status: 403,
    });
    await assert.rejects(post(salary, {}, reader), { status: 403 });
    await voidEntry(salary);
    salary = await entry(salary.id);
    assert.equal(salary.status, 'VOID');
    assert.equal(
      salary.voidReason,
      'Fixture correction with retained evidence',
    );
    assert.deepEqual(salary.sourcePlan, originalSource);
    assert.equal(salary.allocations.length, 2);
    await assert.rejects(voidEntry(salary), { status: 409 });
    await assert.rejects(saveEntry(editableEntry(salary)), { status: 409 });
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.get(employee),
    ]);
    await prepare(APRIL_MONTH);
    assert.equal(
      (await planEntry(zeroPlan.id, APRIL_MONTH)).dueDate,
      '7413-04-30',
    );
    const zero = await planEntry(zeroPlan.id);
    assert.equal(zero.amountMicros, '0');
    await post(zero);
    assert.equal((await entry(zero.id)).status, 'POSTED');

    const partialInput = entryInput({
      amountMicros: '1000001',
      allocations: [{ projectId, amountMicros: '1000000' }],
    });
    await saveEntry(partialInput);
    assert.equal(await saveEntry(partialInput), partialInput.id);
    await assert.rejects(saveEntry(partialInput, admin), { status: 409 });
    assert.equal(
      (await localEvidence(partialInput.id)).deliveryFinanceEvent.length,
      1,
    );
    await assert.rejects(
      saveEntry({ ...partialInput, note: 'Changed retry payload' }),
      { status: 409 },
    );
    let partial = await entry(partialInput.id);
    assert.equal(partial.remainingAllocationMicros, '1');
    await assert.rejects(
      saveEntry(editableEntry(partial, { currency: 'EUR' })),
      { status: 400 },
    );
    await assert.rejects(post(partial), /Allocate the full/);
    for (const allocations of [
      [{ projectId, amountMicros: '-1' }],
      [{ projectId, amountMicros: '1.0' }],
      [{ projectId, amountMicros: '1000002' }],
      [
        { projectId, amountMicros: '1' },
        { projectId, amountMicros: '1' },
      ],
      [
        { projectId: null, amountMicros: '1' },
        { projectId: null, amountMicros: '1' },
      ],
    ])
      await assert.rejects(saveEntry(editableEntry(partial, { allocations })), {
        status: 400,
      });
    await assert.rejects(
      saveEntry(
        editableEntry(partial, {
          allocations: [
            { projectId: foreignProjectId, amountMicros: '1000001' },
          ],
        }),
      ),
      { status: 404 },
    );
    await saveEntry(
      editableEntry(partial, {
        allocations: [
          { projectId, amountMicros: '1000000' },
          { projectId: secondProjectId, amountMicros: '1' },
        ],
      }),
    );
    partial = await entry(partial.id);
    await post(partial);
    assert.equal((await entry(partial.id)).remainingAllocationMicros, '0');
    const missingEvidence = entryInput({ note: '', evidenceUrl: null });
    await saveEntry(missingEvidence);
    await assert.rejects(
      post(await entry(missingEvidence.id)),
      /source note or evidence/,
    );
    await saveEntry(
      editableEntry(await entry(missingEvidence.id), {
        evidenceUrl: 'https://example.invalid/monthly-service-evidence',
      }),
    );
    await post(await entry(missingEvidence.id));

    const failedPlan = planInput({ name: 'Atomic plan failure fixture' });
    failedActivitySourceId = failedPlan.id;
    await assert.rejects(
      savePlan(failedPlan),
      /Injected finance activity failure/,
    );
    failedActivitySourceId = null;
    assert.equal(
      (await localEvidence(failedPlan.id)).deliveryFinancePlan.length,
      0,
    );
    assert.equal(
      (await localEvidence(failedPlan.id)).deliveryFinanceEvent.length,
      0,
    );
    const beforeFailedVoid = await localEvidence(partial.id);
    failedActivitySourceId = partial.id;
    await assert.rejects(
      voidEntry(await entry(partial.id)),
      /Injected finance activity failure/,
    );
    failedActivitySourceId = null;
    assert.deepEqual(await localEvidence(partial.id), beforeFailedVoid);
    const failedInput = entryInput({ title: 'Atomic failure fixture' });
    failedActivitySourceId = failedInput.id;
    await assert.rejects(
      saveEntry(failedInput),
      /Injected finance activity failure/,
    );
    failedActivitySourceId = null;
    const failedEvidence = await localEvidence(failedInput.id);
    assert.equal(failedEvidence.deliveryFinanceEntry.length, 0);
    assert.equal(failedEvidence.deliveryFinanceAllocation.length, 0);
    assert.equal(failedEvidence.deliveryFinanceEvent.length, 0);
    assert.equal(failedEvidence.otogrowActivityEvent.length, 0);
    await saveEntry(failedInput);
    const failedDraft = await entry(failedInput.id);
    const beforeFailedPost = await localEvidence(failedInput.id);
    failedActivitySourceId = failedInput.id;
    await assert.rejects(
      post(failedDraft),
      /Injected finance activity failure/,
    );
    failedActivitySourceId = null;
    assert.deepEqual(await localEvidence(failedInput.id), beforeFailedPost);

    const foreignPlanId = randomUUID();
    const foreignEntryId = randomUUID();
    await runner.query(
      'INSERT INTO core."deliveryFinancePlan" (id,"workspaceId",type,name,currency,"monthlyAmountMicros","startMonth","endMonth","dueDay",active,"createdBy") VALUES ($1,$2,\'OVERHEAD\',\'Foreign plan\',\'USD\',1,$3,$3,1,true,$4)',
      [foreignPlanId, foreignWorkspaceId, MONTH, admin],
    );
    await runner.query(
      "INSERT INTO core.\"deliveryFinanceEntry\" (id,\"workspaceId\",month,kind,category,title,currency,\"amountMicros\",note,\"sourceType\",\"createdBy\") VALUES ($1,$2,$3,'COST','Other','Foreign entry','USD',1,'Private foreign note','MANUAL',$4)",
      [foreignEntryId, foreignWorkspaceId, MONTH, admin],
    );
    const crossWorkspace = await read({
      selectedPlanId: foreignPlanId,
      selectedEntryId: foreignEntryId,
    });
    assert.equal(crossWorkspace.selectedPlan, null);
    assert.equal(crossWorkspace.selectedEntry, null);
    assert(!JSON.stringify(crossWorkspace).includes('Private foreign note'));
    await assert.rejects(
      savePlan(planInput({ id: foreignPlanId, revision: 1 })),
      { status: 404 },
    );
    await assert.rejects(
      saveEntry(entryInput({ id: foreignEntryId, revision: 1 })),
      { status: 404 },
    );
    await assert.rejects(history(foreignEntryId), { status: 404 });
    await assert.rejects(
      finance.postEntry(workspace, writer, writer, {
        id: foreignEntryId,
        revision: 1,
      }),
      { status: 404 },
    );

    const historyInput = entryInput({
      title: 'Bounded history fixture',
      amountMicros: '0',
      allocations: [],
    });
    await saveEntry(historyInput);
    for (let revision = 0; revision < 22; revision++) {
      const current = await entry(historyInput.id);
      await saveEntry(
        editableEntry(current, { note: `Fixture revision ${revision}` }),
      );
    }
    const firstHistory = await history(historyInput.id);
    assert.equal(firstHistory.events.length, 20);
    assert(firstHistory.nextBeforeId);
    const olderHistory = await history(
      historyInput.id,
      reader,
      firstHistory.nextBeforeId,
    );
    assert.equal(olderHistory.events.length, 3);
    assert.equal(
      new Set(
        [...firstHistory.events, ...olderHistory.events].map(
          (event) => event.id,
        ),
      ).size,
      23,
    );
    const salaryHistory = await history(salary.id);
    assert(
      salaryHistory.events.some(
        (event) =>
          event.beforeStatus === 'POSTED' && event.afterStatus === 'VOID',
      ),
    );
    await assert.rejects(
      history(salary.id, reader, firstHistory.events[0].id),
      { status: 400 },
    );

    const baseAggregate = await read({ month: AGGREGATE_MONTH });
    assert.equal(baseAggregate.entryTotal, 0);
    for (let index = 0; index < 51; index++) {
      const input = entryInput({
        month: AGGREGATE_MONTH,
        title: `Aggregate revenue fixture ${index}`,
        amountMicros: MAX_ENTRY_AMOUNT,
        allocations: [{ projectId: null, amountMicros: MAX_ENTRY_AMOUNT }],
      });
      await saveEntry(input);
      await post(await entry(input.id, AGGREGATE_MONTH));
    }
    const aggregateCost = entryInput({
      month: AGGREGATE_MONTH,
      kind: 'COST',
      title: 'Aggregate direct cost fixture',
      amountMicros: '3000000',
      allocations: [{ projectId, amountMicros: '3000000' }],
    });
    await saveEntry(aggregateCost);
    await post(await entry(aggregateCost.id, AGGREGATE_MONTH));
    const euro = entryInput({
      month: AGGREGATE_MONTH,
      currency: 'EUR',
      amountMicros: '1',
      allocations: [{ projectId: secondProjectId, amountMicros: '1' }],
    });
    await saveEntry(euro);
    await post(await entry(euro.id, AGGREGATE_MONTH));
    const aggregateDraft = entryInput({
      month: AGGREGATE_MONTH,
      title: 'Draft excluded from result fixture',
      amountMicros: '7',
      allocations: [],
    });
    await saveEntry(aggregateDraft);
    const aggregateVoid = entryInput({
      month: AGGREGATE_MONTH,
      title: 'Voided excluded result fixture',
      kind: 'COST',
      amountMicros: '11',
      allocations: [{ projectId, amountMicros: '11' }],
    });
    await saveEntry(aggregateVoid);
    await post(await entry(aggregateVoid.id, AGGREGATE_MONTH));
    await voidEntry(await entry(aggregateVoid.id, AGGREGATE_MONTH));
    const aggregate = await read({ month: AGGREGATE_MONTH });
    assert.equal(aggregate.entries.length, 50);
    assert.equal(aggregate.entryTotal, 55);
    assert(aggregate.nextEntryId);
    const usd = aggregate.summaries.find(
      (summary) => summary.currency === 'USD',
    );
    const expectedRevenue = BigInt(MAX_ENTRY_AMOUNT) * 51n;
    assert.equal(usd.revenueMicros, expectedRevenue.toString());
    assert.equal(usd.costMicros, '3000000');
    assert.equal(usd.resultMicros, (expectedRevenue - 3000000n).toString());
    assert.equal(usd.unassignedRevenueMicros, expectedRevenue.toString());
    assert.equal(usd.unassignedCostMicros, '0');
    assert.equal(usd.postedCount, 52);
    assert.equal(usd.draftCount, 1);
    assert.equal(usd.voidCount, 1);
    assert.equal(
      usd.projects.find((project) => project.projectId === projectId)
        .resultMicros,
      '-3000000',
    );
    const euroSummary = aggregate.summaries.find(
      (summary) => summary.currency === 'EUR',
    );
    assert.equal(euroSummary.revenueMicros, '1');
    assert.equal(euroSummary.resultMicros, '1');
    const nextPage = await read({
      month: AGGREGATE_MONTH,
      afterEntryId: aggregate.nextEntryId,
    });
    assert.equal(nextPage.entries.length, 5);
    assert.equal(nextPage.nextEntryId, null);
    assert.equal(
      new Set(
        [...aggregate.entries, ...nextPage.entries].map((item) => item.id),
      ).size,
      55,
    );
    assert.deepEqual(nextPage.summaries, aggregate.summaries);
    const euroOnly = await read({ month: AGGREGATE_MONTH, currency: 'EUR' });
    assert.equal(euroOnly.entryTotal, 1);
    assert.equal(euroOnly.summaries.length, 1);
    assert.equal(euroOnly.summaries[0].currency, 'EUR');
    assert.equal(
      (await read({ month: APRIL_MONTH })).summaries.some(
        (summary) => BigInt(summary.revenueMicros) > 0n,
      ),
      false,
    );

    const beforeRead = await localEvidence();
    await read({ month: AGGREGATE_MONTH });
    await history(salary.id);
    assert.deepEqual(await localEvidence(), beforeRead);
    await runner.query(
      'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1 AND "workspaceMemberId"=$2',
      [workspaceId, writer],
    );
    await assert.rejects(saveEntry(entryInput()), { status: 403 });
    await runner.query(
      'INSERT INTO core."otogrowRoleAssignment" ("workspaceId","workspaceMemberId","roleId") VALUES ($1,$2,$3)',
      [workspaceId, writer, roles.get(writer)],
    );
    await runner.query(
      'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1 AND "workspaceMemberId"=$2',
      [workspaceId, reader],
    );
    await assert.rejects(read(), { status: 403 });
    await runner.query(
      'INSERT INTO core."otogrowRoleAssignment" ("workspaceId","workspaceMemberId","roleId") VALUES ($1,$2,$3)',
      [workspaceId, reader, roles.get(reader)],
    );
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [reader],
    );
    await assert.rejects(read(), { status: 403 });
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
      [reader],
    );
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.get(reader),
    ]);
    await assert.rejects(read(), { status: 403 });
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.get(reader),
    ]);
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.get(writer),
    ]);
    const retainedHistory = await history(salary.id);
    assert(
      retainedHistory.events.every(
        (event) => event.actorName === 'Finance writer fixture',
      ),
    );
    assert.equal(readWrites, 0);
    console.log(
      'PASS: exact monthly finance money/currencies, explicit zero and incomplete allocations, no equal split, source snapshots and current-warning review tokens, departed employees, leap/month-end dates, one plan/month, current finance read/edit/identity/workspace permissions, immutable posting/void/history, atomic activity rollback, bounded pages with complete huge aggregates, no read writes. Rolled back; synthetic workspace/schema only, no external calls.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
