// All schemas, memberships and permission changes are confined to one rolled-back transaction.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');

const {
  PermissionsException,
  PermissionsExceptionCode,
} = require('../dist/engine/metadata-modules/permissions/permissions.exception');

const ALL_CAPABILITIES = [
  'delivery.manage',
  'finance.manage',
  'finance.read',
  'phone.use',
  'workspace.admin',
];

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Only a local development database is allowed',
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  try {
    const [existingWorkspace] = await runner.query(
      `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(
      existingWorkspace,
      'An initialized local development workspace is required',
    );
    const createWorkspace = async () => {
      const id = randomUUID();
      const databaseSchema = `access_fixture_${id.replaceAll('-', '_')}`;
      await runner.query(`CREATE SCHEMA "${databaseSchema}"`);
      await runner.query(
        `CREATE TABLE "${databaseSchema}"."workspaceMember" (
          id uuid PRIMARY KEY, "userId" uuid NOT NULL,
          "nameFirstName" text NOT NULL DEFAULT '',
          "nameLastName" text NOT NULL DEFAULT '',
          "userEmail" text NOT NULL, "deletedAt" timestamptz
        )`,
      );
      await runner.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId")
         VALUES ($1,'Permission regression',$2,$3,'ACTIVE',$4,$5)`,
        [
          id,
          `access-fixture-${id}`,
          databaseSchema,
          existingWorkspace.workspaceCustomApplicationId,
          existingWorkspace.defaultRoleId,
        ],
      );
      return { id, databaseSchema };
    };
    const createMember = async (workspace, name) => {
      const memberId = randomUUID();
      const userId = randomUUID();
      const userWorkspaceId = randomUUID();
      const email = `${userId}@example.invalid`;
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        userId,
        email,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [userWorkspaceId, userId, workspace.id],
      );
      await runner.query(
        `INSERT INTO "${workspace.databaseSchema}"."workspaceMember"
         (id,"userId","nameFirstName","userEmail") VALUES ($1,$2,$3,$4)`,
        [memberId, userId, name, email],
      );
      return { memberId, userId, userWorkspaceId };
    };
    const workspace = await createWorkspace();
    const otherWorkspace = await createWorkspace();
    const founder = await createMember(workspace, 'Founder fixture');
    const pendingMember = await createMember(
      workspace,
      'Pending native role fixture',
    );
    const sales = await createMember(workspace, 'Sales fixture');
    const setter = await createMember(workspace, 'Setter fixture');
    const marketing = await createMember(workspace, 'Marketing fixture');
    const editor = await createMember(workspace, 'Editor fixture');
    const specialist = await createMember(workspace, 'SEO specialist fixture');
    const designer = await createMember(workspace, 'Designer fixture');
    const developer = await createMember(workspace, 'Developer fixture');
    const secondary = await createMember(workspace, 'Secondary admin fixture');
    const administrator = await createMember(workspace, 'Admin fixture');
    const manager = await createMember(workspace, 'Project manager fixture');
    const legacyAdmin = await createMember(workspace, 'Legacy admin fixture');
    const legacyManager = await createMember(
      workspace,
      'Legacy manager fixture',
    );
    const misleadingLabel = await createMember(
      workspace,
      'Unprivileged fixture',
    );
    const foreignMember = await createMember(otherWorkspace, 'Foreign fixture');
    const nativeAdministrators = new Set([
      founder.userWorkspaceId,
      foreignMember.userWorkspaceId,
    ]);
    const missingNativeRole = new PermissionsException(
      'Pending native-role fixture',
      PermissionsExceptionCode.NO_ROLE_FOUND_FOR_USER_WORKSPACE,
    );
    const permissionFailures = new Map([
      [pendingMember.userWorkspaceId, missingNativeRole],
    ]);
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      // Nested savepoints model real mutation rollback without committing fixture setup.
      transaction: async (callback) => {
        await runner.startTransaction();
        try {
          const result = await callback(runner.manager);
          await runner.commitTransaction();
          return result;
        } catch (error) {
          await runner.rollbackTransaction();
          throw error;
        }
      },
    };
    const access = new OtogrowAccessService(scoped, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) => {
        if (permissionFailures.has(userWorkspaceId))
          throw permissionFailures.get(userWorkspaceId);
        return nativeAdministrators.has(userWorkspaceId);
      },
    });
    const directory = (actor = founder, targetWorkspace = workspace) =>
      access.directory(
        targetWorkspace.id,
        actor.memberId,
        actor.userWorkspaceId,
      );
    const saveRole = (input, actor = founder, targetWorkspace = workspace) =>
      access.saveRole(
        targetWorkspace.id,
        actor.memberId,
        actor.userWorkspaceId,
        input,
      );
    const assignRoles = (input, actor = founder) =>
      access.assignRoles(workspace.id, actor.memberId, actor.userWorkspaceId, {
        ...input,
        roleRevisions:
          input.roleRevisions ??
          input.roleIds.map((id) => ({
            id,
            revision: state.roles.find((role) => role.id === id)?.revision ?? 0,
          })),
      });
    const readAccess = (member) =>
      access.getAccess(workspace.id, member.memberId);
    const events = () =>
      runner.query(
        'SELECT * FROM core."otogrowAccessEvent" WHERE "workspaceId"=$1 ORDER BY "createdAt",id',
        [workspace.id],
      );
    const assertDeniedWithoutEvent = async (operation) => {
      const before = await events();
      await assert.rejects(operation, (error) =>
        [400, 403, 409].includes(error.getStatus?.()),
      );
      assert.deepEqual(await events(), before);
    };
    for (const [member, legacyAccess, roleLabel] of [
      [legacyAdmin, 'ADMIN', 'Existing administrator'],
      [legacyManager, 'MANAGER', 'Existing project manager'],
      [misleadingLabel, 'MEMBER', 'Admin Sales Setter'],
    ]) {
      await runner.query(
        `INSERT INTO core."deliveryMember" ("workspaceId","workspaceMemberId",access,"roleLabel")
         VALUES ($1,$2,$3,$4)`,
        [workspace.id, member.memberId, legacyAccess, roleLabel],
      );
    }

    let state = await directory();
    const roleNamed = (name) => {
      const role = state.roles.find(
        (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
      );
      assert(role, `Expected the default ${name} role`);
      return role;
    };
    const defaultRoles = {
      admin: roleNamed('Admin'),
      secondary: roleNamed('Secondary admin'),
      sales: roleNamed('Sales'),
      setter: roleNamed('Setter'),
      marketing: roleNamed('Marketing'),
      editor: roleNamed('Editor'),
      specialist: roleNamed('SEO specialist'),
      designer: roleNamed('Designer'),
      developer: roleNamed('Developer'),
      manager: roleNamed('Project manager'),
    };
    assert.deepEqual(
      [...(await readAccess(founder)).capabilities].sort(),
      ALL_CAPABILITIES,
    );
    assert.equal((await readAccess(founder)).nativeAdministrator, true);
    assert(
      (await readAccess(founder)).grants.some(
        (grant) =>
          grant.capability === 'phone.use' && grant.sourceType === 'native',
      ),
    );
    assert.deepEqual(
      [...(await readAccess(legacyAdmin)).capabilities].sort(),
      ALL_CAPABILITIES,
    );
    assert.deepEqual((await readAccess(legacyManager)).capabilities, [
      'delivery.manage',
    ]);
    assert.deepEqual((await readAccess(misleadingLabel)).capabilities, []);
    await access.listMemberIdsWithCapability(workspace.id, 'phone.use');
    for (const table of [
      'otogrowRole',
      'otogrowMemberAccess',
      'otogrowRoleAssignment',
      'otogrowAccessEvent',
    ]) {
      const [{ count }] = await runner.query(
        `SELECT count(*)::int AS count FROM core."${table}" WHERE "workspaceId"=$1`,
        [workspace.id],
      );
      assert.equal(
        count,
        0,
        'Permission reads must not write defaults or events',
      );
    }
    await assertDeniedWithoutEvent(() => directory(editor));
    await assertDeniedWithoutEvent(() =>
      access.directory(workspace.id, founder.memberId, editor.userWorkspaceId),
    );
    await assertDeniedWithoutEvent(() =>
      access.getAccess(workspace.id, foreignMember.memberId),
    );
    await assertDeniedWithoutEvent(() =>
      access.getAccess(workspace.id, randomUUID()),
    );
    await assertDeniedWithoutEvent(() =>
      access.requireCapability(workspace.id, undefined, 'phone.use'),
    );

    for (const [member, role, canPhone] of [
      [sales, defaultRoles.sales, true],
      [setter, defaultRoles.setter, true],
      [secondary, defaultRoles.secondary, true],
      [administrator, defaultRoles.admin, true],
      [marketing, defaultRoles.marketing, false],
      [editor, defaultRoles.editor, false],
      [specialist, defaultRoles.specialist, false],
      [designer, defaultRoles.designer, false],
      [developer, defaultRoles.developer, false],
      [manager, defaultRoles.manager, false],
    ]) {
      state = await assignRoles({
        memberId: member.memberId,
        roleIds: [role.id],
        revision: 0,
      });
      const permissions = await readAccess(member);
      assert.equal(permissions.capabilities.includes('phone.use'), canPhone);
      if (canPhone) {
        await access.requireCapability(
          workspace.id,
          member.memberId,
          'phone.use',
        );
      } else {
        await assertDeniedWithoutEvent(() =>
          access.requireCapability(workspace.id, member.memberId, 'phone.use'),
        );
      }
      assert.equal(
        state.members.find(
          (candidate) => candidate.memberId === member.memberId,
        ).revision,
        1,
      );
    }
    const pendingAccess = await readAccess(pendingMember);
    assert.equal(pendingAccess.nativeAdministrator, false);
    assert.deepEqual(pendingAccess.capabilities, []);
    assert.deepEqual(pendingAccess.grants, []);
    const pendingDirectory = await directory();
    assert.deepEqual(
      pendingDirectory.members.find(
        (member) => member.memberId === pendingMember.memberId,
      ).access.capabilities,
      [],
    );
    assert(pendingDirectory.actor.capabilities.includes('workspace.admin'));
    const allAccess = await access.listAccess(workspace.id);
    assert(
      allAccess
        .find((member) => member.memberId === founder.memberId)
        .capabilities.includes('workspace.admin'),
    );
    assert(
      allAccess
        .find((member) => member.memberId === sales.memberId)
        .capabilities.includes('phone.use'),
    );
    assert.deepEqual(
      allAccess.find((member) => member.memberId === pendingMember.memberId)
        .capabilities,
      [],
    );
    const incomingWithPendingMember = await access.listMemberIdsWithCapability(
      workspace.id,
      'phone.use',
    );
    assert(incomingWithPendingMember.includes(founder.memberId));
    assert(incomingWithPendingMember.includes(sales.memberId));
    assert(!incomingWithPendingMember.includes(pendingMember.memberId));
    await assertDeniedWithoutEvent(() =>
      access.requireCapability(
        workspace.id,
        pendingMember.memberId,
        'phone.use',
      ),
    );
    const beforePermissionFailure = await events();
    for (const permissionFailure of [
      new Error('Synthetic permission database failure'),
      new PermissionsException(
        'Synthetic unrelated permission failure',
        PermissionsExceptionCode.PERMISSION_DENIED,
      ),
    ]) {
      permissionFailures.set(pendingMember.userWorkspaceId, permissionFailure);
      for (const operation of [
        () => readAccess(pendingMember),
        () => directory(),
        () => access.listAccess(workspace.id),
        () => access.listMemberIdsWithCapability(workspace.id, 'phone.use'),
      ]) {
        await assert.rejects(operation, (error) => error === permissionFailure);
      }
      assert.deepEqual(await events(), beforePermissionFailure);
    }
    permissionFailures.set(pendingMember.userWorkspaceId, missingNativeRole);
    assert(
      (await readAccess(founder)).capabilities.includes('workspace.admin'),
    );
    assert((await readAccess(sales)).capabilities.includes('phone.use'));

    const initialAssignment = (await events()).find(
      (event) => event.subjectMemberId === sales.memberId,
    );
    assert.equal(initialAssignment.action, 'ROLES_ASSIGNED');
    assert.equal(initialAssignment.actorMemberId, founder.memberId);
    assert.notDeepEqual(initialAssignment.before, initialAssignment.after);
    assert(
      JSON.stringify(initialAssignment.after).includes(defaultRoles.sales.id),
    );

    state = await assignRoles({
      memberId: marketing.memberId,
      roleIds: [defaultRoles.marketing.id, defaultRoles.sales.id],
      revision: 1,
    });
    assert((await readAccess(marketing)).capabilities.includes('phone.use'));
    assert(
      (await readAccess(marketing)).grants.some(
        (grant) =>
          grant.capability === 'phone.use' &&
          grant.sourceId === defaultRoles.sales.id &&
          grant.sourceType === 'role',
      ),
    );
    assert.deepEqual(
      [
        ...state.members.find(
          (member) => member.memberId === marketing.memberId,
        ).roleIds,
      ].sort(),
      [defaultRoles.marketing.id, defaultRoles.sales.id].sort(),
    );
    await assertDeniedWithoutEvent(() =>
      assignRoles({ memberId: marketing.memberId, roleIds: [], revision: 1 }),
    );
    assert((await readAccess(marketing)).capabilities.includes('phone.use'));
    await assertDeniedWithoutEvent(() =>
      assignRoles({ memberId: founder.memberId, roleIds: [], revision: 0 }),
    );
    await assertDeniedWithoutEvent(() =>
      assignRoles(
        {
          memberId: editor.memberId,
          roleIds: [defaultRoles.admin.id],
          revision: 1,
        },
        editor,
      ),
    );
    await assertDeniedWithoutEvent(() =>
      saveRole(
        {
          name: 'Escalation attempt',
          description: '',
          capabilities: ALL_CAPABILITIES,
        },
        editor,
      ),
    );
    await assertDeniedWithoutEvent(() =>
      assignRoles({
        memberId: foreignMember.memberId,
        roleIds: [defaultRoles.sales.id],
        revision: 0,
      }),
    );
    const foreignDirectory = await directory(foreignMember, otherWorkspace);
    const foreignRole = foreignDirectory.roles.find((role) =>
      role.capabilities.includes('phone.use'),
    );
    assert(foreignRole);
    await assertDeniedWithoutEvent(() =>
      assignRoles({
        memberId: editor.memberId,
        roleIds: [foreignRole.id],
        revision: 1,
      }),
    );
    await assertDeniedWithoutEvent(() =>
      saveRole({ ...foreignRole, name: 'Cross-workspace edit' }),
    );
    await assertDeniedWithoutEvent(() =>
      saveRole({
        name: 'Unknown capability',
        description: '',
        capabilities: ['phone.secret'],
      }),
    );

    state = await assignRoles({
      memberId: setter.memberId,
      roleIds: [defaultRoles.setter.id, defaultRoles.sales.id],
      revision: 1,
    });
    assert.equal(
      (await readAccess(setter)).grants.filter(
        (grant) => grant.capability === 'phone.use',
      ).length,
      2,
    );
    let salesRole = state.roles.find(
      (role) => role.id === defaultRoles.sales.id,
    );
    const oldSalesPreview = [
      { id: salesRole.id, revision: salesRole.revision },
    ];
    state = await saveRole({ ...salesRole, name: 'Business development' });
    await assertDeniedWithoutEvent(() =>
      assignRoles({
        memberId: editor.memberId,
        roleIds: [salesRole.id],
        roleRevisions: oldSalesPreview,
        revision: 1,
      }),
    );
    salesRole = state.roles.find((role) => role.id === defaultRoles.sales.id);
    assert((await readAccess(sales)).capabilities.includes('phone.use'));
    assert(
      (await readAccess(sales)).grants.some(
        (grant) =>
          grant.sourceId === salesRole.id &&
          grant.sourceName === 'Business development',
      ),
    );
    await assertDeniedWithoutEvent(() =>
      saveRole({
        ...salesRole,
        revision: salesRole.revision - 1,
        name: 'Stale editor',
      }),
    );
    state = await saveRole({ ...salesRole, capabilities: [] });
    await assertDeniedWithoutEvent(() =>
      access.requireCapability(workspace.id, sales.memberId, 'phone.use'),
    );
    assert(!(await readAccess(marketing)).capabilities.includes('phone.use'));
    const incomingAfterRevocation = await access.listMemberIdsWithCapability(
      workspace.id,
      'phone.use',
    );
    assert(!incomingAfterRevocation.includes(sales.memberId));
    assert(!incomingAfterRevocation.includes(marketing.memberId));
    assert(incomingAfterRevocation.includes(setter.memberId));
    assert.deepEqual(
      (await readAccess(setter)).grants
        .filter((grant) => grant.capability === 'phone.use')
        .map((grant) => grant.sourceId),
      [defaultRoles.setter.id],
    );
    const roleChanges = (await events()).filter(
      (event) => event.roleId === salesRole.id,
    );
    assert(roleChanges.some((event) => event.action === 'ROLE_UPDATED'));
    assert(
      roleChanges.some(
        (event) =>
          JSON.stringify(event.before).includes('phone.use') &&
          !JSON.stringify(event.after).includes('phone.use'),
      ),
    );

    state = await assignRoles({
      memberId: marketing.memberId,
      roleIds: [defaultRoles.marketing.id],
      revision: 2,
    });
    assert(!(await readAccess(marketing)).capabilities.includes('phone.use'));
    state = await saveRole({
      name: 'SEO and calling fixture',
      description: 'Explicit configurable authority',
      capabilities: ['phone.use'],
    });
    const customRole = state.roles.find(
      (role) => role.name === 'SEO and calling fixture',
    );
    assert(customRole);
    assert.equal(customRole.revision, 1);
    state = await assignRoles({
      memberId: editor.memberId,
      roleIds: [defaultRoles.editor.id, customRole.id],
      revision: 1,
    });
    assert((await readAccess(editor)).capabilities.includes('phone.use'));
    state = await assignRoles({
      memberId: editor.memberId,
      roleIds: [defaultRoles.editor.id],
      revision: 2,
    });
    assert(!(await readAccess(editor)).capabilities.includes('phone.use'));
    state = await assignRoles({
      memberId: legacyAdmin.memberId,
      roleIds: [],
      revision: 0,
    });
    assert.deepEqual((await readAccess(legacyAdmin)).capabilities, []);
    assert.equal((await readAccess(founder)).nativeAdministrator, true);
    assert.deepEqual(
      [...(await readAccess(founder)).capabilities].sort(),
      ALL_CAPABILITIES,
    );

    const administratorsRole = state.roles.find(
      (role) => role.id === defaultRoles.admin.id,
    );
    await assertDeniedWithoutEvent(() =>
      saveRole({ ...administratorsRole, capabilities: [] }, administrator),
    );
    assert.deepEqual(
      [...(await readAccess(administrator)).capabilities].sort(),
      ALL_CAPABILITIES,
    );
    await assertDeniedWithoutEvent(() =>
      assignRoles(
        { memberId: administrator.memberId, roleIds: [], revision: 1 },
        administrator,
      ),
    );
    await assignRoles({
      memberId: secondary.memberId,
      roleIds: [],
      revision: 1,
    });
    nativeAdministrators.delete(founder.userWorkspaceId);
    await assertDeniedWithoutEvent(() =>
      saveRole({ ...administratorsRole, capabilities: [] }, administrator),
    );
    assert.deepEqual(
      [...(await readAccess(administrator)).capabilities].sort(),
      ALL_CAPABILITIES,
    );
    await assertDeniedWithoutEvent(() =>
      assignRoles(
        { memberId: administrator.memberId, roleIds: [], revision: 1 },
        administrator,
      ),
    );
    nativeAdministrators.add(founder.userWorkspaceId);

    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [setter.userWorkspaceId],
    );
    await assertDeniedWithoutEvent(() => readAccess(setter));
    assert(
      !(
        await access.listMemberIdsWithCapability(workspace.id, 'phone.use')
      ).includes(setter.memberId),
    );
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
      [setter.userWorkspaceId],
    );
    await runner.query(
      `UPDATE "${workspace.databaseSchema}"."workspaceMember" SET "deletedAt"=now() WHERE id=$1`,
      [setter.memberId],
    );
    await assertDeniedWithoutEvent(() => readAccess(setter));
    assert(
      !(
        await access.listMemberIdsWithCapability(workspace.id, 'phone.use')
      ).includes(setter.memberId),
    );
    await runner.query(
      `UPDATE "${workspace.databaseSchema}"."workspaceMember" SET "deletedAt"=NULL WHERE id=$1`,
      [setter.memberId],
    );
    await runner.query('UPDATE core."user" SET "deletedAt"=now() WHERE id=$1', [
      setter.userId,
    ]);
    await assertDeniedWithoutEvent(() => readAccess(setter));
    assert(
      !(
        await access.listMemberIdsWithCapability(workspace.id, 'phone.use')
      ).includes(setter.memberId),
    );
    await runner.query('UPDATE core."user" SET "deletedAt"=NULL WHERE id=$1', [
      setter.userId,
    ]);
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      setter.userId,
    ]);
    await assertDeniedWithoutEvent(() => readAccess(setter));
    assert(
      !(
        await access.listMemberIdsWithCapability(workspace.id, 'phone.use')
      ).includes(setter.memberId),
    );
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      setter.userId,
    ]);
    await runner.query(
      'UPDATE core.workspace SET "activationStatus"=\'INACTIVE\' WHERE id=$1',
      [workspace.id],
    );
    await assertDeniedWithoutEvent(() => readAccess(founder));
    await runner.query(
      'UPDATE core.workspace SET "activationStatus"=\'ACTIVE\',"deletedAt"=now() WHERE id=$1',
      [workspace.id],
    );
    await assertDeniedWithoutEvent(() => readAccess(founder));
    await runner.query(
      'UPDATE core.workspace SET "deletedAt"=NULL WHERE id=$1',
      [workspace.id],
    );

    const eventSnapshot = await events();
    await directory();
    await readAccess(setter);
    await access.listMemberIdsWithCapability(workspace.id, 'phone.use');
    assert.deepEqual(await events(), eventSnapshot);
    process.stdout.write(
      'PASS: read-only defaults, legacy authority without label matching, multiple-role union/provenance, phone defaults, custom roles, rename/revocation, stale revisions, self-escalation/last-admin denial, tenant isolation, active/pending membership, permission failure propagation, and before/after access audit. All synthetic rows and schemas rolled back; no network calls.\n',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
