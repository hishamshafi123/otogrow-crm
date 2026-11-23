import { type ORMWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { ForbiddenException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import {
  DeliveryNativeTaskPermissionDeniedException,
  buildDeliveryNativeTaskVisibility,
  readDeliveryNativeTaskVisibility,
} from 'src/modules/delivery/native-task-visibility';

jest.mock(
  'src/engine/core-modules/workspace/utils/from-workspace-entity-to-flat.util',
  () => ({ fromWorkspaceEntityToFlat: (value: unknown) => value }),
);
jest.mock(
  'src/engine/core-modules/user/utils/from-user-entity-to-flat.util',
  () => ({ fromUserEntityToFlat: (value: unknown) => value }),
);
jest.mock(
  'src/engine/core-modules/auth/utils/build-user-auth-context.util',
  () => ({ buildUserAuthContext: (value: unknown) => value }),
);

const readFailure = (failure: Error) => {
  const workspace = {
    id: 'workspace',
    databaseSchema: 'fixture',
  } as WorkspaceEntity;
  const manager = {
    getRepository: () => ({
      findOne: async () => ({
        id: 'membership',
        userId: 'user',
        user: {},
        workspace,
      }),
    }),
    query: async () => [{ id: 'member' }],
  } as unknown as EntityManager;
  const workspaceOrm = {
    executeInWorkspaceContext: async () => {
      throw failure;
    },
  } as unknown as GlobalWorkspaceOrmManager;
  return readDeliveryNativeTaskVisibility(
    manager,
    workspace,
    { memberId: 'member', userWorkspaceId: 'membership' },
    workspaceOrm,
    {} as WorkspaceCacheService,
  );
};

it('identifies only an explicit native permission denial as an optional task projection', async () => {
  await expect(
    readFailure(
      new PermissionsException(
        'Denied',
        PermissionsExceptionCode.PERMISSION_DENIED,
      ),
    ),
  ).rejects.toBeInstanceOf(DeliveryNativeTaskPermissionDeniedException);
});

it.each([
  PermissionsExceptionCode.ROLE_NOT_FOUND,
  PermissionsExceptionCode.OBJECT_METADATA_NOT_FOUND,
  PermissionsExceptionCode.USER_WORKSPACE_NOT_FOUND,
])(
  'does not turn native verification failure %s into an empty permitted projection',
  async (code) => {
    const result = await readFailure(
      new PermissionsException('Missing verification source', code),
    ).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(ForbiddenException);
    expect(result).not.toBeInstanceOf(
      DeliveryNativeTaskPermissionDeniedException,
    );
  },
);

it.each([
  new Error('Database unavailable'),
  new ForbiddenException('Identity unavailable'),
])(
  'keeps infrastructure and identity failures distinct from an expected permission denial',
  async (failure) => {
    const result = await readFailure(failure).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(ForbiddenException);
    expect(result).not.toBeInstanceOf(
      DeliveryNativeTaskPermissionDeniedException,
    );
  },
);

const permissionContext = (includeRole: boolean) =>
  ({
    authContext: { type: 'user', userWorkspaceId: 'membership' },
    userWorkspaceRoleMap: { membership: 'role' },
    apiKeyRoleMap: {},
    permissionsPerRoleId: includeRole ? { role: {} } : {},
    objectIdByNameSingular: { task: 'task' },
    flatObjectMetadataMaps: {
      universalIdentifierById: { task: 'task' },
      byUniversalIdentifier: {
        task: {
          id: 'task',
          universalIdentifier: 'task',
          nameSingular: 'task',
          isSystem: false,
          fieldIds: [],
        },
      },
    },
    flatFieldMetadataMaps: {
      universalIdentifierById: {},
      byUniversalIdentifier: {},
    },
  }) as unknown as ORMWorkspaceContext;

it('rejects an absent resolved role entry before it can become an expected deny', () => {
  expect(() =>
    buildDeliveryNativeTaskVisibility(permissionContext(false)),
  ).toThrow('role permissions are incomplete');
});

it('preserves an explicitly present role with an empty permitted-object set as an ordinary denied task view', () => {
  try {
    buildDeliveryNativeTaskVisibility(permissionContext(true));
    throw new Error('Expected a denied view');
  } catch (failure) {
    expect(failure).toBeInstanceOf(PermissionsException);
    expect((failure as PermissionsException).code).toBe(
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
  }
});
