const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  copy,
  newFixture,
  noSyntheticAuthentication,
  operationSeeds,
  protectedOperations,
  rowGroups,
  validateJournal,
  validateOwnedGroups,
} = require('./check-delivery-ui-closure-support.cjs');

const fixture = newFixture();
fixture.actorId = randomUUID();
fixture.actorUserId = randomUUID();
fixture.userWorkspaceId = randomUUID();
fixture.schema = 'workspace_ui_guard';
fixture.baseline = {
  tables: [],
  operations: {
    id: randomUUID(),
    hash: '0'.repeat(64),
    updatedAt: fixture.createdAt,
    clientsPresent: true,
  },
};
const original = {
  enabled: false,
  telegramEnabled: false,
  timezone: 'Asia/Qatar',
  templates: [{ id: randomUUID(), paused: true, marker: 'original template' }],
  clients: {
    engagements: [{ id: randomUUID(), marker: 'original engagement' }],
    links: [{ id: randomUUID(), marker: 'original link' }],
    shares: [{ id: randomUUID(), marker: 'original share' }],
    audit: [{ targetId: randomUUID(), marker: 'original audit' }],
  },
  business: { records: [{ id: randomUUID(), marker: 'original budget' }] },
  notices: [],
};
const seeded = () => {
  const value = copy(original),
    expected = operationSeeds(fixture);
  value.templates.push(...expected.templates);
  value.clients.engagements.push(...expected.engagements);
  value.clients.links.push(...expected.links);
  return value;
};
let checks = 0;
const check = (name, run) => {
  run();
  checks++;
  console.log(`PASS ${name}`);
};
check(
  'journal preserves distinct private identities and exact fixture labels',
  () => {
    validateJournal(fixture);
    for (const mutate of [
      (value) => {
        value.title = 'real company';
      },
      (value) => {
        value.workspaceId = randomUUID();
      },
      (value) => {
        value.people[1].memberId = value.people[0].memberId;
      },
      (value) => {
        value.portals[0].token = 'different token';
      },
      (value) => {
        value.portals[0].revocations.push('not a timestamp');
      },
    ]) {
      const changed = copy(fixture);
      mutate(changed);
      assert.throws(() => validateJournal(changed));
    }
  },
);
check(
  'seeded ordinary/performance entitlement and paused independent review are exact',
  () => {
    const expected = operationSeeds(fixture);
    assert.deepEqual(expected.engagements[0].services, ['SEO']);
    assert.equal(expected.engagements[0].advertising, null);
    assert.deepEqual(expected.engagements[1].services, [
      'Performance marketing',
    ]);
    assert.notEqual(
      expected.engagements[1].advertising.managerId,
      expected.engagements[1].advertising.marketerId,
    );
    assert.equal(expected.templates[0].paused, true);
    assert.notEqual(
      expected.templates[0].fields.assigneeId,
      expected.templates[0].fields.reviewerId,
    );
    assert.deepEqual(protectedOperations(seeded(), fixture, true), original);
  },
);
check('original records remain untouched by exact owned subtraction', () => {
  const source = seeded(),
    before = copy(source);
  const cleaned = protectedOperations(source, fixture, true);
  assert.deepEqual(source, before);
  assert.deepEqual(cleaned, original);
  assert.deepEqual(protectedOperations(original, fixture, false), original);
});
check('partial ownership or duplicate IDs cannot authorize cleanup', () => {
  for (const mutate of [
    (value) => {
      value.clients.links.pop();
    },
    (value) => {
      value.clients.engagements.push(copy(value.clients.engagements.at(-1)));
    },
    (value) => {
      value.templates.pop();
    },
  ]) {
    const changed = seeded();
    mutate(changed);
    assert.throws(() => protectedOperations(changed, fixture, true));
  }
  assert.throws(() => protectedOperations(seeded(), fixture, false));
});
check(
  'saved submissions, changed company, altered entitlement and activated schedule are rejected',
  () => {
    for (const mutate of [
      (value) => {
        value.clients.engagements.at(-1).submissions.push({ id: randomUUID() });
      },
      (value) => {
        value.clients.engagements.at(-1).companyId = randomUUID();
      },
      (value) => {
        value.clients.engagements.at(-1).advertising.currency = 'AED';
      },
      (value) => {
        value.templates.at(-1).paused = false;
      },
      (value) => {
        value.templates.at(-1).lastTaskId = randomUUID();
      },
      (value) => {
        value.enabled = true;
      },
      (value) => {
        value.telegramEnabled = true;
      },
    ]) {
      const changed = seeded();
      mutate(changed);
      assert.throws(() => protectedOperations(changed, fixture, true));
    }
  },
);
check('only the exact declared link revocation can vary across a crash', () => {
  const changed = seeded(),
    at = new Date().toISOString();
  changed.clients.links.at(-1).revokedAt = at;
  assert.throws(() => protectedOperations(changed, fixture, true));
  const planned = copy(fixture);
  planned.portals[1].revocations = [at];
  assert.deepEqual(protectedOperations(changed, planned, true), original);
  assert.deepEqual(protectedOperations(seeded(), planned, true), original);
  changed.clients.links.at(-1).expiresAt = at;
  assert.throws(() => protectedOperations(changed, planned, true));
});
check(
  'a previously absent Clients namespace returns to absent without erasing a foreign descendant',
  () => {
    const planned = copy(fixture);
    planned.baseline.operations.clientsPresent = false;
    const source = seeded();
    source.clients.engagements.shift();
    source.clients.links.shift();
    source.clients.shares = [];
    source.clients.audit = [];
    const expected = copy(original);
    delete expected.clients;
    assert.deepEqual(protectedOperations(source, planned, true), expected);
    source.clients.shares.push({ id: randomUUID() });
    assert.throws(() => protectedOperations(source, planned, true));
  },
);
check(
  'unexpected original-state mutations remain visible for the caller fingerprint guard',
  () => {
    const changed = seeded();
    changed.business.records[0].marker = 'unexpected changed budget';
    assert.notDeepEqual(protectedOperations(changed, fixture, true), original);
  },
);
check(
  'owned database rows are all present/exact or all absent; interrupted partial sets fail closed',
  () => {
    const groups = rowGroups(fixture).map((group) => ({
      ...group,
      rows: group.ids.sort().map((id) => ({ id, marker: fixture.marker })),
    }));
    for (const group of groups)
      fixture.seeds[`${group.schema}.${group.name}`] = copy(group.rows);
    assert.equal(validateOwnedGroups(fixture, groups), true);
    assert.equal(
      validateOwnedGroups(
        fixture,
        groups.map((group) => ({ ...group, rows: [] })),
      ),
      false,
    );
    const partial = copy(groups);
    partial[0].rows.pop();
    assert.throws(() => validateOwnedGroups(fixture, partial));
    const changed = copy(groups);
    changed[0].rows[0].marker = 'changed identity';
    assert.throws(() => validateOwnedGroups(fixture, changed));
  },
);
async function checkAuthenticationBoundary() {
  const adapter = {
    quote: (identifier) => `"${identifier}"`,
    exactIds: (rows, ids) =>
      assert.deepEqual(rows.map((row) => row.id).sort(), [...ids].sort()),
  };
  const fakeManager = (injected = {}) => ({
    async query(sql) {
      if (sql.includes('SELECT id,email,disabled'))
        return fixture.people.map((person) => ({
          id: person.userId,
          email: `${person.userId}+ui-closure@example.invalid`,
          disabled: false,
          passwordHash: null,
          isEmailVerified: false,
          canImpersonate: false,
          ...injected.user,
        }));
      if (sql.includes('information_schema.columns'))
        return [
          { name: 'appToken', columns: ['userId'] },
          { name: 'userSession', columns: ['userId', 'userWorkspaceId'] },
          { name: 'userWorkspace', columns: ['userId'] },
        ];
      if (sql.includes('core."appToken"')) {
        assert(
          !sql.includes('"workspaceId"'),
          'Unscoped tokens must not escape this guard.',
        );
        assert(sql.includes("context->>'email'=ANY($2::text[])"));
        return injected.token || injected.emailToken
          ? [{ id: randomUUID() }]
          : [];
      }
      if (sql.includes('core."userSession"'))
        return injected.session ? [{ id: randomUUID() }] : [];
      if (sql.includes('core."userWorkspace"'))
        return [
          ...fixture.people.map((person) => ({ id: person.userWorkspaceId })),
          ...(injected.membership ? [{ id: randomUUID() }] : []),
        ];
      throw new Error('Unexpected guard query');
    },
  });
  await noSyntheticAuthentication(fakeManager(), fixture, true, adapter);
  for (const injected of [
    { token: true },
    { emailToken: true },
    { session: true },
    { membership: true },
    { user: { passwordHash: 'unexpected password' } },
    { user: { isEmailVerified: true } },
    { user: { canImpersonate: true } },
  ])
    await assert.rejects(
      noSyntheticAuthentication(fakeManager(injected), fixture, true, adapter),
    );
  checks++;
  console.log(
    'PASS unscoped tokens/sessions, foreign membership, password, verification and impersonation are rejected',
  );
}
checkAuthenticationBoundary()
  .then(() => {
    console.log(
      `${checks} pure UI closure preservation checks passed; no database/cache/provider accessed.`,
    );
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
