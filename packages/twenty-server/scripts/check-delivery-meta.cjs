const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  DeliveryMetaService,
} = require('../dist/modules/delivery/advertising/delivery-meta.service');
const {
  MetaReportingError,
} = require('../dist/modules/delivery/advertising/delivery-meta.adapter');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
(async () => {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const OriginalDate = Date;
  // Manual imports and explicit scheduled checks must share a deterministic fixture clock.
  let fixtureTime = OriginalDate.parse('2026-10-25T05:00:00Z');
  global.Date = class extends OriginalDate {
    constructor(...values) { super(...(values.length ? values : [fixtureTime++])); }
    static now() { return fixtureTime++; }
  };
  try {
    const [workspace] = await runner.query(
      `SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID(),
      manager = randomUUID(),
      employee = randomUUID(),
      outsider = randomUUID();
    for (const member of [admin, manager, employee, outsider]) {
      const user = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        user,
        `${user}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [member, user, workspace.id],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName") VALUES ($1,$2,$3,'Business fixture')`,
        [member, user, `${user}@example.invalid`],
      );
    }
    let transactionDepth = 0;
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) =>
        runner.manager.transaction(async (manager) => {
          transactionDepth += 1;
          try {
            return await callback(manager);
          } finally {
            transactionDepth -= 1;
          }
        }),
    };
    const access = new OtogrowAccessService(scoped, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === admin,
    });
    const delivery = new DeliveryService(scoped, access);
    const roleDirectory = await access.directory(workspace.id, admin, admin);
    const managerRole = roleDirectory.roles.find(
      (role) =>
        role.capabilities.includes('delivery.manage') &&
        !role.capabilities.includes('workspace.admin'),
    );
    assert(managerRole);
    await access.assignRoles(workspace.id, admin, admin, {
      memberId: manager,
      roleIds: [managerRole.id],
      roleRevisions: [{ id: managerRole.id, revision: managerRole.revision }],
      revision: 0,
    });
    const project = (
      await delivery.command(workspace, admin, admin, {
        action: 'project',
        name: 'Business fixture',
        companyId: null,
        memberIds: [employee],
      })
    ).projects.find((item) => item.name === 'Business fixture');
    const create = async (actor, record) => {
      const result = await command(actor, {
        action: 'save',
        record: { revision: 0, projectId: project.id, ...record },
      });
      return result.records.find((item) => item.title === record.title);
    };
    const {
      OtogrowActivityEventEntity,
    } = require('../dist/modules/otogrow-activity/entities/otogrow-activity-event.entity');
    let failedActivityAction = null;
    const getRepository = runner.manager.getRepository.bind(runner.manager);
    runner.manager.getRepository = (entity) => {
      const repository = getRepository(entity);
      if (entity !== OtogrowActivityEventEntity) return repository;
      return new Proxy(repository, {
        get(target, property) {
          if (property === 'insert')
            return async (input) => {
              if (
                failedActivityAction === '*' ||
                input.action === failedActivityAction
              )
                throw new Error('Injected activity write failure');
              return target.insert(input);
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const events = async (action) =>
      runner.query(
        `SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND category='ADVERTISING' AND ($2::text IS NULL OR action=$2) ORDER BY "occurredAt",id`,
        [workspace.id, action ?? null],
      );
    let providerCalls = 0,
      hook = null,
      fail = false,
      leadCount = '2',
      emptyDates = new Set();
    const adapter = {
      account: async () => ({
        id: 'act_1657332765534462',
        name: 'Fixture',
        currency: 'USD',
        timezone_name: 'Asia/Qatar',
        account_status: 1,
      }),
      insights: async (accountId, token, date, level) => {
        assert.equal(
          transactionDepth,
          0,
          'Provider HTTP must remain outside the service transaction',
        );
        providerCalls++;
        assert.equal(token, 'synthetic-reporting-token');
        if (fail)
          throw new MetaReportingError(
            typeof fail === 'string' ? fail : 'AUTH',
          );
        if (hook) await hook();
        return level === 'account' && !emptyDates.has(date)
          ? [
              {
                account_id: accountId,
                date_start: date,
                date_stop: date,
                spend: '12.34',
                impressions: '100',
                clicks: '5',
                actions: [{ action_type: 'lead', value: leadCount }],
                action_values: [],
              },
            ]
          : [];
      },
    };
    const encryption = {
      encryptVersioned: (token) =>
        'encrypted:' + Buffer.from(token).toString('base64'),
      decryptVersionedOrThrow: (token) =>
        Buffer.from(token.slice(10), 'base64').toString(),
    };
    const reporting = new DeliveryMetaService(
      scoped,
      delivery,
      encryption,
      adapter,
    );
    const operations = new DeliveryOperationsService(
      scoped,
      delivery,
      new DeliveryCreativeService(scoped, delivery, {}),
      { findByWorkspaceId: async () => null },
      { get: () => null },
    );
    const configuration = {
      accountId: '1657332765534462',
      revision: 0,
      token: 'synthetic-reporting-token',
      projectId: project.id,
      managerId: manager,
      marketerId: employee,
      time: '06:00',
      enabled: true,
      catchUpDays: 1,
      refreshDays: 1,
      dailyImportLimit: 100,
    };
    await assert.rejects(
      reporting.command(workspace, employee, employee, {
        action: 'connect',
        configuration,
      }),
    );
    const connected = await reporting.command(workspace, admin, admin, {
      action: 'connect',
      configuration,
    });
    assert.equal((await events('META_CONNECTED')).length, 1);
    assert.equal((await events('META_CONNECTED'))[0].actorId, admin);
    const connectedRevision = connected.connections[0].revision;
    failedActivityAction = '*';
    try {
      await assert.rejects(
        reporting.command(workspace, admin, admin, {
          action: 'connect',
          configuration: {
            ...configuration,
            revision: connectedRevision,
            time: '07:00',
          },
        }),
        /Injected activity/,
      );
    } finally {
      failedActivityAction = null;
    }
    assert.equal(
      (await reporting.snapshot(workspace, admin, admin)).connections[0]
        .revision,
      connectedRevision,
    );
    assert.equal((await events('META_CONNECTION_UPDATED')).length, 0);
    assert(!JSON.stringify(connected).includes('synthetic-reporting-token'));
    assert(!JSON.stringify(connected).includes('ciphertext'));
    await reporting.sync(
      workspace,
      configuration.accountId,
      true,
      new Date('2026-10-25T02:59:00Z'),
    );
    assert.equal(providerCalls, 0);
    await reporting.sync(
      workspace,
      configuration.accountId,
      true,
      new Date('2026-10-25T03:00:00Z'),
    );
    assert.equal(providerCalls, 2);
    await reporting.sync(
      workspace,
      configuration.accountId,
      true,
      new Date('2026-10-25T03:05:00Z'),
    );
    assert.equal(providerCalls, 2);
    assert.equal((await events('META_IMPORT_STARTED')).length, 1);
    assert.equal((await events('META_REPORT_IMPORTED')).length, 1);
    assert.equal((await events('META_REPORT_IMPORTED'))[0].actorType, 'SYSTEM');
    assert.equal((await events('META_REPORT_IMPORTED'))[0].actorId, null);
    let reports = (await reporting.snapshot(workspace, admin, admin)).reports;
    assert.equal(reports.length, 1);
    assert.equal(reports[0].date, '2026-10-24');
    assert.equal(
      (await reporting.snapshot(workspace, employee, employee)).reports.length,
      0,
    );
    const managerNotices = (
      await operations.snapshot(workspace, manager, manager)
    ).notices.filter((item) => item.taskId === `meta-report:${reports[0].id}`);
    assert.equal(managerNotices.length, 1);
    assert.equal(
      (await operations.snapshot(workspace, employee, employee)).notices.filter(
        (item) => item.taskId === `meta-report:${reports[0].id}`,
      ).length,
      0,
    );
    await operations.command(workspace, manager, manager, {
      action: 'acknowledge',
      id: managerNotices[0].id,
    });

    await assert.rejects(
      reporting.command(workspace, employee, employee, {
        action: 'review',
        id: reports[0].id,
        status: 'APPROVED',
        note: 'Self review',
      }),
    );
    assert.equal((await events('META_REPORT_REVIEWED')).length, 0);
    failedActivityAction = 'META_REPORT_REVIEWED';
    try {
      await assert.rejects(
        reporting.command(workspace, manager, manager, {
          action: 'review',
          id: reports[0].id,
          status: 'APPROVED',
          note: 'Do not persist this recommendation',
        }),
        /Injected activity/,
      );
    } finally {
      failedActivityAction = null;
    }
    assert.equal(
      (await reporting.snapshot(workspace, admin, admin)).reports[0].status,
      'REVIEW',
    );
    assert.equal(
      (await reporting.snapshot(workspace, admin, admin)).reports[0].taskId,
      null,
    );
    await reporting.command(workspace, manager, manager, {
      action: 'review',
      id: reports[0].id,
      status: 'APPROVED',
      note: 'Review campaign targeting',
    });
    assert.equal(
      (await reporting.snapshot(workspace, employee, employee)).reports.length,
      1,
    );
    assert.equal((await events('META_REPORT_REVIEWED')).length, 1);
    assert.equal((await events('META_REPORT_REVIEWED'))[0].actorId, manager);
    assert.equal(
      (await events('META_REPORT_REVIEWED'))[0].subjectMemberId,
      employee,
    );
    await assert.rejects(
      reporting.command(workspace, manager, manager, {
        action: 'review',
        id: reports[0].id,
        status: 'APPROVED',
        note: 'Duplicate',
      }),
    );
    await reporting.sync(
      workspace,
      configuration.accountId,
      false,
      new Date('2026-10-25T04:00:00Z'),
    );
    reports = (await reporting.snapshot(workspace, admin, admin)).reports;
    assert.equal(reports.length, 1);
    assert(reports[0].taskId);
    assert.equal((await events('META_REPORT_IMPORTED')).length, 1);
    assert.equal((await events('META_IMPORT_UNCHANGED')).length, 1);
    await reporting.command(workspace, admin, admin, {
      action: 'sync',
      accountId: configuration.accountId,
    });
    assert.equal((await events('META_IMPORT_STARTED')).at(-1).actorId, admin);
    assert.equal(
      (await events('META_IMPORT_STARTED')).at(-1).actorType,
      'HUMAN',
    );
    const administratorRole = roleDirectory.roles.find((role) =>
      role.capabilities.includes('workspace.admin'),
    );
    await access.assignRoles(workspace.id, admin, admin, {
      memberId: outsider,
      roleIds: [administratorRole.id],
      roleRevisions: [
        { id: administratorRole.id, revision: administratorRole.revision },
      ],
      revision: 0,
    });
    const beforeRevokedImport = (await events('META_REPORT_IMPORTED')).length;
    hook = async () => {
      hook = null;
      await runner.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        [outsider],
      );
    };
    await assert.rejects(
      reporting.command(workspace, outsider, outsider, {
        action: 'sync',
        accountId: configuration.accountId,
      }),
    );
    assert.equal(
      (await events('META_REPORT_IMPORTED')).length,
      beforeRevokedImport,
    );
    assert.equal((await events('META_IMPORT_FAILED')).at(-1).actorId, outsider);
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
      [outsider],
    );
    await access.assignRoles(workspace.id, admin, admin, { memberId: outsider, roleIds: [], roleRevisions: [], revision: 1 });
    fail = true;
    await reporting.sync(
      workspace,
      configuration.accountId,
      true,
      new Date('2026-10-26T03:00:00Z'),
    );
    assert.equal(
      (await reporting.snapshot(workspace, admin, admin)).connections[0]
        .enabled,
      false,
    );
    assert.equal((await events('META_IMPORT_FAILED')).length, 2);
    fail = false;
    hook = async () => {
      hook = null;
      await reporting.command(workspace, admin, admin, {
        action: 'disconnect',
        accountId: configuration.accountId,
        revision: 1,
      });
    };
    await assert.rejects(
      reporting.sync(
        workspace,
        configuration.accountId,
        false,
        new Date('2026-10-26T04:01:00Z'),
      ),
    );
    assert.equal(
      (await reporting.snapshot(workspace, admin, admin)).reports.length,
      1,
    );
    assert.equal((await events('META_DISCONNECTED')).length, 1);
    // All fixture state remains inside the outer rollback transaction.
    const operationsRepository = runner.manager.getRepository(
      DeliveryOperationsEntity,
    );
    const fixtureOperations = await operationsRepository.findOneByOrFail({
      workspaceId: workspace.id,
    });
    await runner.query('DELETE FROM core."deliveryMetaReport" WHERE "workspaceId"=$1', [workspace.id]);
    fixtureOperations.state.metaReporting = {
      connections: [],
      reports: [],
      workerSeenAt: null,
    };
    await operationsRepository.save(fixtureOperations);
    const configurationForRecovery = {
      ...configuration,
      catchUpDays: 3,
      refreshDays: 3,
      dailyImportLimit: 4,
    };
    await reporting.command(workspace, admin, admin, {
      action: 'connect',
      configuration: configurationForRecovery,
    });
    const reportingState = async () => {
      const saved = (await operationsRepository.findOneByOrFail({ workspaceId: workspace.id })).state.metaReporting;
      const stored = await runner.query('SELECT report,"checkedAt" FROM core."deliveryMetaReport" WHERE "workspaceId"=$1 ORDER BY position', [workspace.id]);
      return { ...saved, reports: stored.map((row) => row.report), connections: saved.connections.map((connection) => ({ ...connection,
        checks: [...new Map(stored.filter((row) => row.report.accountId === connection.accountId).map((row) => [row.report.date, { date: row.report.date, reportId: row.report.id, checkedAt: row.checkedAt.toISOString() }])).values()] })) };
    };
    const {
      metaCoverage,
    } = require('../dist/modules/delivery/advertising/delivery-meta-schedule');
    const recoverySync = (date, scheduled = true, requestedDate) =>
      reporting.sync(
        workspace,
        configuration.accountId,
        scheduled,
        new Date(date),
        scheduled ? undefined : { memberId: admin, userWorkspaceId: admin },
        requestedDate,
      );
    let concurrentClaimChecked = false;
    const callsBeforeConcurrentClaim = providerCalls;
    hook = async () => {
      hook = null;
      await assert.rejects(
        recoverySync('2026-10-28T03:00:01Z', false),
        /already importing/,
      );
      concurrentClaimChecked = true;
    };
    await recoverySync('2026-10-28T03:00:00Z');
    assert(concurrentClaimChecked);
    assert.equal(providerCalls, callsBeforeConcurrentClaim + 2);
    assert.deepEqual(
      (await reportingState()).reports.map((report) => report.date),
      ['2026-10-27'],
    );
    emptyDates.add('2026-10-25');
    await recoverySync('2026-10-28T03:01:00Z');
    await recoverySync('2026-10-28T03:02:00Z');
    let recoveryState = await reportingState();
    assert.deepEqual(
      recoveryState.reports.map((report) => report.date),
      ['2026-10-27', '2026-10-25', '2026-10-26'],
    );
    assert.equal(
      recoveryState.reports.find((report) => report.date === '2026-10-25')
        .account,
      null,
    );
    assert.deepEqual(
      metaCoverage(
        recoveryState.connections[0],
        recoveryState,
        new Date('2026-10-28T03:03:00Z'),
      ).missingDates,
      [],
    );
    let callsBefore = providerCalls;
    await recoverySync('2026-10-28T03:03:00Z');
    assert.equal(
      providerCalls,
      callsBefore,
      'Successful empty days and same-day checks must not repeat',
    );
    await recoverySync('2026-10-28T03:04:00Z', false, '2026-10-24');
    callsBefore = providerCalls;
    await recoverySync('2026-10-28T03:05:00Z');
    await assert.rejects(
      recoverySync('2026-10-28T03:05:00Z', false),
      /Daily Meta import limit/,
    );
    assert.equal(providerCalls, callsBefore);
    await reporting.command(workspace, admin, admin, {
      action: 'disconnect',
      accountId: configuration.accountId,
      revision: 1,
    });
    await reporting.command(workspace, admin, admin, {
      action: 'connect',
      configuration: configurationForRecovery,
    });
    await assert.rejects(
      recoverySync('2026-10-28T03:06:00Z', false),
      /Daily Meta import limit/,
    );
    assert.equal(
      (await reportingState()).attempts.find(
        (attempt) => attempt.date === '2026-10-28',
      ).count,
      4,
    );
    const approveId = (await reportingState()).reports.find(
      (report) => report.date === '2026-10-27',
    ).id;
    await reporting.command(workspace, manager, manager, {
      action: 'review',
      id: approveId,
      status: 'APPROVED',
      note: 'Approved original attribution recommendation',
    });
    const approvedSnapshot = JSON.stringify(
      (await reportingState()).reports.find(
        (report) => report.id === approveId,
      ),
    );
    await recoverySync('2026-10-29T03:00:00Z');
    leadCount = '4';
    await recoverySync('2026-10-29T03:01:00Z');
    recoveryState = await reportingState();
    assert.equal(recoveryState.reports.at(-1).date, '2026-10-27');
    assert.equal(recoveryState.reports.at(-1).status, 'REVIEW');
    assert.equal(recoveryState.reports.at(-1).account.actions[0].value, '4');
    assert.equal(
      JSON.stringify(
        recoveryState.reports.find((report) => report.id === approveId),
      ),
      approvedSnapshot,
    );
    const marketerSnapshot = await reporting.snapshot(
      workspace,
      employee,
      employee,
    );
    assert.equal(marketerSnapshot.reports.length, 1);
    assert.equal(marketerSnapshot.reports[0].hasNewerVersion, true);
    assert.equal(marketerSnapshot.reports[0].account.actions[0].value, '2');
    assert.equal(
      marketerSnapshot.reports[0].lastCheckedAt,
      JSON.parse(approvedSnapshot).fetchedAt,
    );
    const noticesBefore = (
      await operationsRepository.findOneByOrFail({ workspaceId: workspace.id })
    ).state.notices.length;
    const reportsBefore = recoveryState.reports.length;
    await recoverySync('2026-10-29T03:02:00Z', false, '2026-10-27');
    recoveryState = await reportingState();
    assert.equal(recoveryState.reports.length, reportsBefore);
    assert.equal(
      (
        await operationsRepository.findOneByOrFail({
          workspaceId: workspace.id,
        })
      ).state.notices.length,
      noticesBefore,
    );
    assert.match(
      recoveryState.connections[0].checks.find(
        (check) => check.date === '2026-10-27',
      ).checkedAt,
      /^2026-10-29T03:02:/,
    );
    fail = 'RATE_LIMIT';
    await assert.rejects(
      recoverySync('2026-10-29T03:03:00Z', false, '2026-10-26'),
    );
    callsBefore = providerCalls;
    await recoverySync('2026-10-29T03:04:00Z');
    await assert.rejects(
      recoverySync('2026-10-29T03:04:00Z', false),
      /retry time/,
    );
    await reporting.command(workspace, admin, admin, {
      action: 'connect',
      configuration: {
        ...configurationForRecovery,
        revision: 1,
        dailyImportLimit: 10,
      },
    });
    await assert.rejects(
      recoverySync('2026-10-29T03:10:00Z', false),
      /retry time/,
    );
    assert.equal(
      providerCalls,
      callsBefore,
      'Settings edits cannot bypass backoff',
    );
    assert.equal(
      (await reportingState()).attempts.find(
        (attempt) => attempt.date === '2026-10-29',
      ).count,
      4,
      'Failed requests consume the shared daily allowance',
    );
    await reporting.command(workspace, admin, admin, {
      action: 'disconnect',
      accountId: configuration.accountId,
      revision: 2,
    });
    await reporting.command(workspace, admin, admin, {
      action: 'connect',
      configuration: { ...configurationForRecovery, dailyImportLimit: 10 },
    });
    await assert.rejects(
      recoverySync('2026-10-29T03:11:00Z', false),
      /retry time/,
    );
    assert.equal(providerCalls, callsBefore, 'Reconnect cannot bypass backoff');
    fail = false;
    await recoverySync('2026-10-29T04:04:00Z', false, '2026-10-26');
    callsBefore = providerCalls;
    for (const invalidDate of ['2026-10-29', '2026-10-30', '2026-02-30'])
      await assert.rejects(
        recoverySync('2026-10-29T04:05:00Z', false, invalidDate),
        /completed date/,
      );
    assert.equal(
      providerCalls,
      callsBefore,
      'Invalid or incomplete account-local dates must not dispatch',
    );
    assert.equal(
      (await reportingState()).attempts.find(
        (attempt) => attempt.date === '2026-10-29',
      ).count,
      5,
    );
    const readBefore = await runner.query(
      'SELECT xmin::text,"updatedAt",state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [workspace.id],
    );
    await reporting.snapshot(workspace, admin, admin);
    await reporting.snapshot(workspace, manager, manager);
    assert.deepEqual(
      await runner.query(
        'SELECT xmin::text,"updatedAt",state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
        [workspace.id],
      ),
      readBefore,
    );
    const { insertMetaReport, getMetaReport, readMetaReportPage } = require('../dist/modules/delivery/advertising/delivery-meta-report-store');
    const original = await getMetaReport(runner.manager, workspace.id, approveId);
    const retainedApproved = JSON.stringify(original);
    for (let index = 0; index < 505; index++) await insertMetaReport(runner.manager, workspace.id, {
      ...original, id: randomUUID(), date: '2000-01-01', status: 'REVIEW', reviewedAt: null, reviewedBy: null, note: '', taskId: null,
    });
    const countBeforeGrowth = (await reportingState()).reports.length;
    await recoverySync('2026-10-29T04:06:00Z', false, '2026-10-20');
    assert.equal((await reportingState()).reports.length, countBeforeGrowth + 1);
    assert.equal(JSON.stringify(await getMetaReport(runner.manager, workspace.id, approveId)), retainedApproved);
    const initialPage = await reporting.snapshot(workspace, admin, admin, { archive: 'ALL' });
    assert.equal(initialPage.reports.length, 20);
    assert(initialPage.total > 500 && initialPage.nextCursor);
    assert(initialPage.reports.every((report) => report.ads.length === 0));
    const secondPage = await reporting.snapshot(workspace, admin, admin, { archive: 'ALL', after: initialPage.nextCursor });
    assert(!secondPage.reports.some((report) => initialPage.reports.some((first) => first.id === report.id)));
    await assert.rejects(reporting.snapshot(workspace, admin, admin, { archive: 'ACTIVE', after: initialPage.nextCursor }), /Refresh/);
    await assert.rejects(reporting.snapshot(workspace, admin, admin, { fromDate: '2026-10-20', throughDate: '2026-10-01' }), /filters/);
    const filtered = await reporting.snapshot(workspace, admin, admin, { fromDate: '2026-10-27', throughDate: '2026-10-27', status: 'APPROVED' });
    assert.equal(filtered.total, 1); assert.equal(filtered.reports[0].id, approveId);
    const pendingId = initialPage.reports[0].id;
    await assert.rejects(reporting.command(workspace, manager, manager, { action: 'archive', id: pendingId, archived: true }), /Review this report/);
    await assert.rejects(reporting.command(workspace, employee, employee, { action: 'archive', id: approveId, archived: true }));
    failedActivityAction = 'META_REPORT_ARCHIVED';
    await assert.rejects(reporting.command(workspace, manager, manager, { action: 'archive', id: approveId, archived: true }), /Injected/);
    failedActivityAction = null;
    assert.equal((await reporting.snapshot(workspace, manager, manager, { archive: 'ARCHIVED' })).total, 0);
    await reporting.command(workspace, manager, manager, { action: 'archive', id: approveId, archived: true });
    await assert.rejects(reporting.command(workspace, manager, manager, { action: 'archive', id: approveId, archived: true }), /archive state changed/);
    const archive = await reporting.snapshot(workspace, employee, employee, { archive: 'ARCHIVED' });
    assert.equal(archive.total, 1); assert.equal(archive.reports[0].id, approveId); assert(archive.reports[0].archivedAt);
    assert.equal(archive.reports[0].taskId, original.taskId);
    assert.equal(JSON.stringify(await getMetaReport(runner.manager, workspace.id, approveId)), retainedApproved);
    await assert.rejects(reporting.report(workspace, outsider, outsider, { id: approveId }));
    const detail = await reporting.report(workspace, employee, employee, { id: approveId });
    assert.equal(detail.id, approveId); assert.equal(detail.memberId, employee);
    assert((await operations.snapshot(workspace, employee, employee)).notices.some((notice) => notice.taskId === `meta-report:${approveId}`));
    await reporting.command(workspace, manager, manager, { action: 'archive', id: approveId, archived: false });
    assert.equal((await reporting.snapshot(workspace, employee, employee, { archive: 'ARCHIVED' })).total, 0);
    const manyAds = { ...original, id: randomUUID(), ads: Array.from({ length: 123 }, (_, index) => ({ ...original.ads[0], ad_id: String(index) })) };
    await insertMetaReport(runner.manager, workspace.id, manyAds);
    const firstAds = await reporting.report(workspace, employee, employee, { id: manyAds.id });
    assert.equal(firstAds.ads.length, 50); assert.equal(firstAds.nextOffset, 50); assert.equal(firstAds.adCount, 123);
    const finalAds = await reporting.report(workspace, employee, employee, { id: manyAds.id, offset: 100 });
    assert.equal(finalAds.ads.length, 23); assert.equal(finalAds.nextOffset, null);
    const beforeReportReads = await runner.query('SELECT id,xmin::text,report,"archivedAt","checkedAt" FROM core."deliveryMetaReport" WHERE "workspaceId"=$1 ORDER BY position', [workspace.id]);
    await reporting.snapshot(workspace, manager, manager, { archive: 'ALL' }); await reporting.report(workspace, employee, employee, { id: manyAds.id });
    assert.deepEqual(await runner.query('SELECT id,xmin::text,report,"archivedAt","checkedAt" FROM core."deliveryMetaReport" WHERE "workspaceId"=$1 ORDER BY position', [workspace.id]), beforeReportReads);
    const legacyReport = { ...original, id: randomUUID(), date: '1999-12-31', note: 'Legacy approval retained exactly' };
    const legacyOperations = await operationsRepository.findOneByOrFail({ workspaceId: workspace.id });
    legacyOperations.state.metaReporting.reports = [legacyReport];
    legacyOperations.state.metaReporting.connections[0].checks = [{ date: legacyReport.date, reportId: legacyReport.id, checkedAt: '2026-10-25T05:00:00.000Z' }];
    await operationsRepository.save(legacyOperations);
    const legacyBefore = JSON.stringify(legacyOperations.state.metaReporting.reports);
    const legacyPage = await reporting.snapshot(workspace, employee, employee, { fromDate: '1999-12-31', throughDate: '1999-12-31' });
    assert.equal(legacyPage.total, 1);
    assert.equal(legacyPage.reports[0].lastCheckedAt, '2026-10-25T05:00:00.000Z');
    assert.equal((await runner.query('SELECT count(*)::int AS count FROM core."deliveryMetaReport" WHERE id=$1', [legacyReport.id]))[0].count, 0, 'Legacy reads do not backfill');
    await assert.rejects(reporting.command(workspace, outsider, outsider, { action: 'archive', id: legacyReport.id, archived: true }));
    assert.equal(JSON.stringify((await operationsRepository.findOneByOrFail({ workspaceId: workspace.id })).state.metaReporting.reports), legacyBefore);
    assert.equal((await runner.query('SELECT count(*)::int AS count FROM core."deliveryMetaReport" WHERE id=$1', [legacyReport.id]))[0].count, 0, 'Denied mutations roll back migration');
    await reporting.command(workspace, manager, manager, { action: 'archive', id: legacyReport.id, archived: true });
    assert.deepEqual(await getMetaReport(runner.manager, workspace.id, legacyReport.id), legacyReport);
    assert.deepEqual((await operationsRepository.findOneByOrFail({ workspaceId: workspace.id })).state.metaReporting.reports, []);
    const archivedLegacy = await reporting.report(workspace, employee, employee, { id: legacyReport.id });
    assert.equal(archivedLegacy.lastCheckedAt, '2026-10-25T05:00:00.000Z');
    await reporting.command(workspace, manager, manager, { action: 'review', id: pendingId, status: 'APPROVED', note: 'Archive idempotency fixture' });
    await reporting.command(workspace, manager, manager, { action: 'archive', id: pendingId, archived: true });
    const beforeArchivedRefresh = (await reportingState()).reports.length;
    await recoverySync('2026-10-30T03:00:00Z', false, '2026-10-20');
    assert.equal((await reportingState()).reports.length, beforeArchivedRefresh, 'Archiving cannot make an unchanged import duplicate history');
    assert((await reporting.report(workspace, manager, manager, { id: pendingId })).archivedAt);
    const selectedOutsidePage = await reporting.snapshot(workspace, manager, manager, { selectedId: approveId });
    assert.equal(selectedOutsidePage.selected.id, approveId);
    const scopeProject = await runner.manager.getRepository(require('../dist/modules/delivery/entities/delivery-project.entity').DeliveryProjectEntity).findOneByOrFail({ id: project.id });
    scopeProject.memberIds = [];
    await runner.manager.getRepository(require('../dist/modules/delivery/entities/delivery-project.entity').DeliveryProjectEntity).save(scopeProject);
    assert.equal((await reporting.snapshot(workspace, employee, employee, { archive: 'ALL' })).total, 0);
    await assert.rejects(reporting.report(workspace, employee, employee, { id: legacyReport.id }));
    assert(!(await operations.snapshot(workspace, employee, employee)).notices.some((notice) => notice.taskId === `meta-report:${approveId}`));
    // Client reports follow current service responsibilities; provider requests remain mocked.
    fixtureTime = OriginalDate.parse('2026-10-31T03:00:00Z');
    scopeProject.memberIds = [employee, outsider];
    await runner.manager.getRepository(require('../dist/modules/delivery/entities/delivery-project.entity').DeliveryProjectEntity).save(scopeProject);
    const clientEngagementId = randomUUID();
    const clientFixture = await operationsRepository.findOneByOrFail({ workspaceId: workspace.id });
    clientFixture.state.clients ??= { engagements: [], shares: [], links: [], audit: [] };
    clientFixture.state.clients.engagements.push({ id: clientEngagementId, projectId: project.id, name: 'Client reporting fixture', services: ['Performance marketing'], advertising: { managerId: manager, marketerId: employee, channel: 'META', currency: 'USD', period: 'MONTHLY' } });
    await operationsRepository.save(clientFixture);
    adapter.account = async () => ({ id: 'act_123456789099', name: 'Client routing fixture', currency: 'USD', timezone_name: 'America/Los_Angeles', account_status: 1 });
    const clientConfiguration = { ...configuration, accountId: '123456789099', engagementId: clientEngagementId, scheduleTimezone: 'Asia/Qatar', managerId: admin, marketerId: admin };
    const clientConnected = await reporting.command(workspace, admin, admin, { action: 'connect', configuration: clientConfiguration });
    assert.equal(clientConnected.connections.find(item => item.accountId === clientConfiguration.accountId).managerId, manager, 'Responsibilities must come from the client service');
    const savedClientConnection = (await operationsRepository.findOneByOrFail({ workspaceId: workspace.id })).state.metaReporting.connections.find(item => item.accountId === clientConfiguration.accountId);
    assert.equal(savedClientConnection.token, undefined, 'Routing must never copy a plaintext credential into stored configuration');
    assert(!JSON.stringify(clientConnected).includes('ciphertext'));
    const callsBeforeClient = providerCalls;
    await reporting.sync(workspace, clientConfiguration.accountId, true, new Date('2026-10-31T02:59:00Z'));
    assert.equal(providerCalls, callsBeforeClient, 'Qatar reporting schedule must not use the account timezone');
    await reporting.sync(workspace, clientConfiguration.accountId, true, new Date('2026-10-31T03:00:00Z'));
    assert.equal(providerCalls, callsBeforeClient + 2);
    const beforeTimezoneEdit = (await reporting.snapshot(workspace, admin, admin)).connections.find(item => item.accountId === clientConfiguration.accountId);
    const accountTimezone = await reporting.command(workspace, admin, admin, { action: 'connect', configuration: { ...clientConfiguration, revision: beforeTimezoneEdit.revision, scheduleTimezone: null } });
    assert.equal(accountTimezone.connections.find(item => item.accountId === clientConfiguration.accountId).scheduleTimezone, null, 'Timezone clearing must replace the saved optional value');

    const clientReports = await reporting.snapshot(workspace, employee, employee, { accountId: clientConfiguration.accountId });
    assert.equal(clientReports.total, 1, 'Assigned marketer can read performance before recommendation approval');
    const clientReport = clientReports.reports[0];
    assert.equal(clientReport.date, '2026-10-29', 'Performance date remains account-local');
    assert.equal(clientReport.status, 'REVIEW');
    assert.equal(clientReport.engagementId, clientEngagementId);
    for (const recipient of [admin, manager, employee]) {
      const notices = (await operations.snapshot(workspace, recipient, recipient)).notices.filter(item => item.taskId === `meta-report:${clientReport.id}` && item.recipientId === recipient);
      assert.equal(notices.length, 1, 'Founder, PM and marketer each get one report notice');
    }
    assert.equal((await reporting.snapshot(workspace, outsider, outsider, { accountId: clientConfiguration.accountId })).total, 0);
    await assert.rejects(reporting.command(workspace, employee, employee, { action: 'review', id: clientReport.id, status: 'APPROVED', note: 'Cannot approve own follow-up' }));
    await reporting.sync(workspace, clientConfiguration.accountId, false, new Date('2026-10-31T03:10:00Z'), { memberId: admin, userWorkspaceId: admin }, clientReport.date);
    assert.equal((await reporting.snapshot(workspace, admin, admin, { accountId: clientConfiguration.accountId })).total, 1, 'Unchanged import does not duplicate reports or notices');
    assert.equal((await operations.snapshot(workspace, employee, employee)).notices.filter(item => item.taskId === `meta-report:${clientReport.id}`).length, 1);
    const reassigned = await operationsRepository.findOneByOrFail({ workspaceId: workspace.id });
    const assignedEngagement = reassigned.state.clients.engagements.find(item => item.id === clientEngagementId);
    assignedEngagement.advertising.managerId = admin;
    assignedEngagement.advertising.marketerId = outsider;
    await operationsRepository.save(reassigned);
    assert.equal((await reporting.snapshot(workspace, employee, employee, { accountId: clientConfiguration.accountId })).total, 0, 'Previous marketer loses report access after reassignment');
    assert.equal((await reporting.snapshot(workspace, manager, manager, { accountId: clientConfiguration.accountId })).total, 0, 'Previous PM loses report access after reassignment');
    assert(!(await operations.snapshot(workspace, employee, employee)).notices.some(item => item.taskId === `meta-report:${clientReport.id}`));
    await assert.rejects(reporting.report(workspace, employee, employee, { id: clientReport.id }));
    const reassignedReport = await reporting.report(workspace, outsider, outsider, { id: clientReport.id });
    assert.equal(reassignedReport.marketerId, employee, 'Imported assignment history stays immutable');
    assert.equal(reassignedReport.routing.marketerId, outsider, 'Current responsibility is separate from imported history');
    await assert.rejects(reporting.command(workspace, manager, manager, { action: 'review', id: clientReport.id, status: 'APPROVED', note: 'Old PM cannot approve' }));
    await assert.rejects(reporting.command(workspace, admin, admin, { action: 'review', id: clientReport.id, status: 'APPROVED', note: 'Stale responsibility follow-up', expectedRouting: { projectId: project.id, managerId: manager, marketerId: employee } }), /responsibilities changed/);
    await reporting.command(workspace, admin, admin, { action: 'review', id: clientReport.id, status: 'APPROVED', note: 'Current responsibility follow-up', expectedRouting: { projectId: project.id, managerId: admin, marketerId: outsider } });
    const reviewedClient = await getMetaReport(runner.manager, workspace.id, clientReport.id);
    const followUp = (await delivery.snapshot(workspace, admin, admin)).tasks.find(task => task.id === reviewedClient.taskId);
    assert.equal(followUp.assigneeId, outsider);
    const removed = await operationsRepository.findOneByOrFail({ workspaceId: workspace.id });
    removed.state.clients.engagements.find(item => item.id === clientEngagementId).services = ['SEO'];
    await operationsRepository.save(removed);
    assert.equal((await reporting.snapshot(workspace, outsider, outsider, { accountId: clientConfiguration.accountId })).total, 0);
    assert(!(await operations.snapshot(workspace, outsider, outsider)).notices.some(item => item.taskId === `meta-report:${clientReport.id}`));
    const callsBeforeRemoval = providerCalls;
    await assert.rejects(reporting.sync(workspace, clientConfiguration.accountId, false, new Date('2026-11-01T03:00:00Z')), /performance marketing/);
    assert.equal(providerCalls, callsBeforeRemoval, 'Removed service blocks dispatch before a provider request');
    assert.equal((await reporting.snapshot(workspace, admin, admin, { accountId: clientConfiguration.accountId })).reports[0].routing, null);
    console.log('PASS: client-service routing, Qatar schedule with account-local dates, current PM/marketer/admin recipients, immutable assignment evidence, revoked recipient reads/notices, independent approval, current follow-up assignee, removed service blocks dispatch and no plaintext routing data.');
    const allEvents = JSON.stringify(await events());
    for (const secret of [
      'synthetic-reporting-token',
      'Review campaign targeting',
      'Do not persist this recommendation',
      'encrypted:',
      'Approved original attribution recommendation',
    ])
      assert(!allEvents.includes(secret));
    console.log(
      'PASS: Meta reporting permissions, redacted snapshots, Qatar 06:00 schedule, duplicate prevention, manager approval/assignment, auth-failure disable, in-flight disconnect, bounded missed-day recovery, once-daily rolling attribution, shared manual/automatic quota/backoff across reconnect, immutable approved versions, growth beyond 500 reports, searchable archive/restore, bounded report/ad pagination, retained notices and atomic failures, no read writes and provider outside transaction. Rolled back; mock provider only.',
    );
  } finally {
    global.Date = OriginalDate;
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
