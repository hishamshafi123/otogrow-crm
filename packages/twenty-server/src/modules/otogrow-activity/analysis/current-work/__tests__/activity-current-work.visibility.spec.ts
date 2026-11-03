import { randomUUID } from 'crypto';
import { FieldMetadataType } from 'twenty-shared/types';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type ORMWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { createCurrentWorkNativeFixture } from './current-work-native.fixture';
import { buildActivityCurrentWorkVisibility } from '../activity-current-work.visibility';

const fixture = () => {
  const workspaceId = randomUUID();
  const userWorkspaceId = randomUUID();
  const memberId = randomUUID();
  const roleId = randomUUID();
  const metadata = createCurrentWorkNativeFixture(
    workspaceId,
    roleId,
    userWorkspaceId,
  );
  const authContext = {
    type: 'user',
    workspace: { id: workspaceId },
    userWorkspaceId,
    workspaceMemberId: memberId,
    workspaceMember: {
      id: memberId,
      name: { firstName: 'Current', lastName: 'Member' },
    },
  } as UserWorkspaceAuthContext;
  const context: ORMWorkspaceContext = {
    ...metadata.data,
    authContext,
    permissionsPerRoleId: metadata.data.rolesPermissions,
    objectIdByNameSingular: {
      task: metadata.taskObject.id,
      workspaceMember: metadata.memberObject.id,
    },
    entityMetadatas: [],
  };
  return { ...metadata, context, roleId };
};

describe('current work native read permissions', () => {
  it('uses actual native field permissions and RLS to select the managed read boundary', () => {
    const { context } = fixture();
    const result = buildActivityCurrentWorkVisibility(context);
    expect(result.sql).toContain('"activityNativeTask"."title"');
    expect(Object.values(result.parameters)).toEqual(['%Visible%']);
    expect(Object.keys(result.parameters)[0]).toBe('activityNativePredicate0');
    expect(result.sql).not.toContain('delivery_scope');
    expect(result.fingerprint).toHaveLength(64);
  });
  it('keeps semantic visibility stable despite randomized native SQL parameter generation', () => {
    const { context } = fixture();
    expect(buildActivityCurrentWorkVisibility(context)).toEqual(
      buildActivityCurrentWorkVisibility(context),
    );
  });
  it('fails closed on native task object denial instead of returning an empty trusted scope', () => {
    const { context, roleId, taskObject } = fixture();
    context.permissionsPerRoleId[roleId][taskObject.id].canReadObjectRecords =
      false;
    expect(() => buildActivityCurrentWorkVisibility(context)).toThrow();
  });
  it('fails closed when a projected task field is restricted', () => {
    const { context, roleId, taskObject, taskFields } = fixture();
    context.permissionsPerRoleId[roleId][taskObject.id].restrictedFields[
      taskFields[1].id
    ] = { canRead: false, canUpdate: false };
    expect(() => buildActivityCurrentWorkVisibility(context)).toThrow();
  });
  it('checks only the fields projected by the requesting delivery workflow', () => {
    const { context, roleId, taskObject, taskFields } = fixture();
    context.permissionsPerRoleId[roleId][taskObject.id].restrictedFields[
      taskFields[3].id
    ] = { canRead: false, canUpdate: false };
    expect(() => buildActivityCurrentWorkVisibility(context)).toThrow();
    expect(() =>
      buildActivityCurrentWorkVisibility(context, [
        'id',
        'title',
        'assigneeId',
      ]),
    ).not.toThrow();
    context.permissionsPerRoleId[roleId][taskObject.id].restrictedFields[
      taskFields[1].id
    ] = { canRead: false, canUpdate: false };
    expect(() =>
      buildActivityCurrentWorkVisibility(context, [
        'id',
        'title',
        'assigneeId',
      ]),
    ).toThrow();
  });
  it('does not substitute a system or missing native role for a current user', () => {
    const { context } = fixture();
    context.userWorkspaceRoleMap = {};
    expect(() => buildActivityCurrentWorkVisibility(context)).toThrow(
      'native task permissions',
    );
  });
  it('denies unresolved member-dependent visibility rather than dropping its predicate', () => {
    const { context, predicate, memberFields } = fixture();
    predicate.workspaceMemberFieldMetadataId = memberFields[1].id;
    expect(() => buildActivityCurrentWorkVisibility(context)).toThrow(
      'cannot be verified',
    );
  });
  it('does not drop a native enum predicate when the current member value is incompatible', () => {
    const { context, predicate, memberFields, taskFields } = fixture();
    predicate.workspaceMemberFieldMetadataId = memberFields[0].id;
    Object.assign(memberFields[0], { type: FieldMetadataType.SELECT });
    Object.assign(taskFields[1], {
      type: FieldMetadataType.SELECT,
      options: [
        {
          id: randomUUID(),
          value: 'ALLOWED',
          label: 'Allowed',
          position: 0,
          color: 'green',
        },
      ],
    });
    expect(() => buildActivityCurrentWorkVisibility(context)).toThrow(
      'incompatible member value',
    );
  });
  it('changes visibility fingerprint when native predicate meaning changes', () => {
    const { context, predicate } = fixture();
    const first = buildActivityCurrentWorkVisibility(context);
    predicate.value = 'Restricted';
    expect(buildActivityCurrentWorkVisibility(context).fingerprint).not.toBe(
      first.fingerprint,
    );
  });
});
