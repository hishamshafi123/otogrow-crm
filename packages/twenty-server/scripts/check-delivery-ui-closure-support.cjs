const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');

const CHECKER = 'delivery-ui-closure-v1';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const copy = (value) => JSON.parse(JSON.stringify(value));
const hashToken = (value) => createHash('sha256').update(value).digest('hex');
const titleFor = (nonce) => `Disposable UI closure ${nonce.slice(0, 8)}`;
const markerFor = (nonce) => `ui-closure:${nonce}`;
const timestamp = (value) => {
  assert.equal(typeof value, 'string');
  assert(Number.isFinite(Date.parse(value)));
  assert.equal(new Date(value).toISOString(), value);
  return Date.parse(value);
};

function newFixture() {
  const nonce = randomUUID();
  return {
    checker: CHECKER,
    workspaceId: WORKSPACE_ID,
    nonce,
    title: titleFor(nonce),
    marker: markerFor(nonce),
    status: 'CREATING',
    createdAt: new Date().toISOString(),
    templateId: randomUUID(),
    checklistId: randomUUID(),
    people: ['SEO owner', 'Performance marketer'].map((label) => ({
      label,
      memberId: randomUUID(),
      userId: randomUUID(),
      userWorkspaceId: randomUUID(),
    })),
    portals: ['ordinary', 'performance'].map((kind) => ({
      kind,
      companyId: randomUUID(),
      projectId: randomUUID(),
      engagementId: randomUUID(),
      linkId: randomUUID(),
      fieldIds: [randomUUID(), randomUUID()],
      token: `${WORKSPACE_ID}.${randomBytes(32).toString('hex')}`,
      code: randomBytes(8).toString('hex'),
      revocations: [],
    })),
    seeds: {},
    cleanupAttempts: [],
  };
}

function validateJournal(fixture) {
  assert.equal(fixture.checker, CHECKER);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const key of ['nonce', 'templateId', 'checklistId'])
    assert.match(fixture[key], UUID);
  assert.equal(fixture.title, titleFor(fixture.nonce));
  assert.equal(fixture.marker, markerFor(fixture.nonce));
  timestamp(fixture.createdAt);
  assert(
    [
      'CREATING',
      'PREPARED',
      'READY',
      'TRANSITION_PREPARED',
      'CLEANUP_PREPARED',
      'CLEANED',
    ].includes(fixture.status),
  );
  assert.deepEqual(
    fixture.people.map((person) => person.label),
    ['SEO owner', 'Performance marketer'],
  );
  assert.deepEqual(
    fixture.portals.map((portal) => portal.kind),
    ['ordinary', 'performance'],
  );
  const ids = [fixture.nonce, fixture.templateId, fixture.checklistId];
  for (const person of fixture.people)
    for (const key of ['memberId', 'userId', 'userWorkspaceId']) {
      assert.match(person[key], UUID);
      ids.push(person[key]);
    }
  for (const portal of fixture.portals) {
    for (const key of ['companyId', 'projectId', 'engagementId', 'linkId']) {
      assert.match(portal[key], UUID);
      ids.push(portal[key]);
    }
    assert.equal(portal.fieldIds.length, 2);
    for (const id of portal.fieldIds) {
      assert.match(id, UUID);
      ids.push(id);
    }
    assert.match(portal.token, new RegExp(`^${WORKSPACE_ID}\\.[a-f0-9]{64}$`));
    assert.match(portal.code, /^[a-f0-9]{16}$/);
    assert(Array.isArray(portal.revocations) && portal.revocations.length <= 1);
    for (const at of portal.revocations)
      assert(timestamp(at) >= timestamp(fixture.createdAt));
  }
  assert.equal(
    new Set(ids).size,
    ids.length,
    'Every fixture identity must be distinct.',
  );
  assert(Array.isArray(fixture.cleanupAttempts));
  if (fixture.baseline) {
    for (const key of ['actorId', 'actorUserId', 'userWorkspaceId'])
      assert.match(fixture[key], UUID);
    assert(/^[A-Za-z0-9_]+$/.test(fixture.schema));
    assert.match(fixture.baseline.operations.id, UUID);
    assert.match(fixture.baseline.operations.hash, /^[a-f0-9]{64}$/);
    timestamp(fixture.baseline.operations.updatedAt);
    assert.equal(typeof fixture.baseline.operations.clientsPresent, 'boolean');
    assert(Array.isArray(fixture.baseline.tables));
  }
  return fixture;
}

function operationSeeds(fixture) {
  const engagements = fixture.portals.map((portal, index) => ({
    id: portal.engagementId,
    revision: 1,
    projectId: portal.projectId,
    companyId: portal.companyId,
    name: `${fixture.title} ${portal.kind} service plan`,
    services: [index === 0 ? 'SEO' : 'Performance marketing'],
    advertising:
      index === 0
        ? null
        : {
            managerId: fixture.actorId,
            marketerId: fixture.people[1].memberId,
            currency: 'USD',
            channel: 'META',
            period: 'DAILY',
          },
    billing: 'RETAINER',
    scope: `${fixture.marker}: ${index === 0 ? 'Weekly SEO work and a monthly report' : 'Reviewed advertising recommendations; no connected ad account'}.`,
    allowance: 'Synthetic local UI acceptance only. No delivery or charge.',
    contact: 'Local fixture — do not contact or send this portal.',
    fields: [
      { id: portal.fieldIds[0], label: 'Website', required: true },
      { id: portal.fieldIds[1], label: 'Brand notes', required: false },
    ],
    assets: [],
    submissions: [],
  }));
  const links = fixture.portals.map((portal) => ({
    id: portal.linkId,
    engagementId: portal.engagementId,
    hash: hashToken(portal.token),
    codeHash: hashToken(portal.code),
    expiresAt: new Date(
      timestamp(fixture.createdAt) + 4 * 60 * 60 * 1000,
    ).toISOString(),
    revokedAt: null,
    createdBy: fixture.actorId,
  }));
  const template = {
    id: fixture.templateId,
    projectId: fixture.portals[0].projectId,
    workflow: null,
    fields: {
      title: `${fixture.title} weekly SEO review`,
      brief: `${fixture.marker}: Review the submitted links and record evidence. Keep brand notes and an independent review together.`,
      service: 'SEO',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: fixture.people[0].memberId,
      reviewerId: fixture.actorId,
      checklist: [
        {
          id: fixture.checklistId,
          text: 'Record the reviewed source links',
          done: false,
        },
      ],
      evidence: [],
    },
    frequency: 'WEEKLY',
    weekdays: [1, 3],
    monthDay: 1,
    time: '09:00',
    startDate: new Date(timestamp(fixture.createdAt) + 7 * 86400000)
      .toISOString()
      .slice(0, 10),
    endDate: null,
    paused: true,
    dueHours: 24,
    creatorId: fixture.actorId,
    userWorkspaceId: fixture.userWorkspaceId,
    lastDate: null,
    lastTaskId: null,
    skipped: 0,
    error: null,
  };
  return { engagements, links, templates: [template] };
}

function rowGroups(fixture) {
  return [
    {
      schema: 'core',
      name: 'user',
      ids: fixture.people.map((person) => person.userId),
    },
    {
      schema: 'core',
      name: 'userWorkspace',
      ids: fixture.people.map((person) => person.userWorkspaceId),
    },
    {
      schema: fixture.schema,
      name: 'workspaceMember',
      ids: fixture.people.map((person) => person.memberId),
    },
    {
      schema: fixture.schema,
      name: 'company',
      ids: fixture.portals.map((portal) => portal.companyId),
    },
    {
      schema: 'core',
      name: 'deliveryProject',
      ids: fixture.portals.map((portal) => portal.projectId),
    },
  ];
}

function validateOwnedGroups(fixture, groups) {
  const present = groups.some((group) => group.rows.length > 0);
  for (const group of groups) {
    const expected = fixture.seeds[`${group.schema}.${group.name}`] ?? [];
    assert.equal(
      group.rows.length,
      present ? group.ids.length : 0,
      `Partial owned ${group.name} cannot be cleaned.`,
    );
    if (present) {
      assert.equal(
        expected.length,
        group.ids.length,
        'The exact seed must precede commit.',
      );
      assert.deepEqual(
        copy(group.rows),
        expected,
        `Owned ${group.name} changed outside the read-only UI allowance.`,
      );
    }
  }
  return present;
}

function protectedOperations(state, fixture, present) {
  const value = copy(state);
  assert.equal(value.enabled, false);
  assert.equal(value.telegramEnabled, false);
  const expected = operationSeeds(fixture);
  const strip = (records, owned, label) => {
    assert(Array.isArray(records), `Expected ${label} array.`);
    const ids = new Set(owned.map((item) => item.id));
    const selected = records.filter((item) => ids.has(item.id));
    assert.equal(
      selected.length,
      present ? owned.length : 0,
      `Partial or duplicate owned ${label}.`,
    );
    if (present)
      for (const seed of owned) {
        const actual = selected.find((item) => item.id === seed.id);
        assert(actual);
        const normalized = copy(actual);
        if (label === 'links') {
          const portal = fixture.portals.find(
            (item) => item.linkId === seed.id,
          );
          assert(
            [null, ...portal.revocations].includes(actual.revokedAt),
            'Portal link changed outside its declared revoke transition.',
          );
          normalized.revokedAt = null;
        }
        assert.deepEqual(
          normalized,
          seed,
          `Owned ${label} changed outside declared local reads.`,
        );
      }
    return records.filter((item) => !ids.has(item.id));
  };
  value.templates = strip(value.templates, expected.templates, 'templates');
  if (value.clients) {
    value.clients.engagements = strip(
      value.clients.engagements,
      expected.engagements,
      'engagements',
    );
    value.clients.links = strip(value.clients.links, expected.links, 'links');
    if (!fixture.baseline.operations.clientsPresent) {
      assert.deepEqual(value.clients, {
        engagements: [],
        shares: [],
        links: [],
        audit: [],
      });
      delete value.clients;
    }
  } else assert.equal(present, false, 'Owned portals disappeared.');
  return value;
}

async function noSyntheticAuthentication(
  manager,
  fixture,
  present,
  { quote, exactIds },
) {
  const users = await manager.query(
    'SELECT id,email,disabled,"passwordHash","isEmailVerified","canImpersonate" FROM core."user" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [fixture.people.map((person) => person.userId)],
  );
  exactIds(users, present ? fixture.people.map((person) => person.userId) : []);
  for (const user of users) {
    assert.equal(user.email, `${user.id}+ui-closure@example.invalid`);
    assert.equal(user.disabled, false);
    assert.equal(user.passwordHash, null);
    assert.equal(user.isEmailVerified, false);
    assert.equal(user.canImpersonate, false);
  }
  // Auth records can have a null workspace, so workspace-scoped preservation alone is insufficient.
  const descendants = await manager.query(
    `SELECT table_name AS name,array_agg(column_name::text ORDER BY column_name) AS columns FROM information_schema.columns WHERE table_schema='core' AND column_name IN ('userId','userWorkspaceId') GROUP BY table_name ORDER BY table_name`,
  );
  for (const table of descendants) {
    const conditions = table.columns
      .map((column) => `${quote(column)}::text=ANY($1::text[])`)
      .join(' OR ');
    const emailCondition =
      table.name === 'appToken' ? ` OR context->>'email'=ANY($2::text[])` : '';
    const parameters = [
      fixture.people.flatMap((person) => [
        person.userId,
        person.userWorkspaceId,
      ]),
    ];
    if (emailCondition)
      parameters.push(
        fixture.people.map(
          (person) => `${person.userId}+ui-closure@example.invalid`,
        ),
      );
    const rows = await manager.query(
      `SELECT id FROM core.${quote(table.name)} WHERE ${conditions}${emailCondition} ORDER BY id FOR UPDATE`,
      parameters,
    );
    exactIds(
      rows,
      present && table.name === 'userWorkspace'
        ? fixture.people.map((person) => person.userWorkspaceId)
        : [],
      `Synthetic account gained an unplanned ${table.name} descendant.`,
    );
  }
}
module.exports = {
  CHECKER,
  WORKSPACE_ID,
  copy,
  hashToken,
  newFixture,
  noSyntheticAuthentication,
  operationSeeds,
  protectedOperations,
  rowGroups,
  validateJournal,
  validateOwnedGroups,
};
