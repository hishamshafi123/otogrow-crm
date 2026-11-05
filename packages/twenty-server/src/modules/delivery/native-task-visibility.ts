import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type EntityManager, type ObjectLiteral } from 'typeorm';
import { isDefined } from 'twenty-shared/utils';
import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { fromUserEntityToFlat } from 'src/engine/core-modules/user/utils/from-user-entity-to-flat.util';
import { fromWorkspaceEntityToFlat } from 'src/engine/core-modules/workspace/utils/from-workspace-entity-to-flat.util';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { PermissionsException } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import {
  getWorkspaceContext,
  type ORMWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { buildRowLevelPermissionRecordFilter } from 'src/engine/twenty-orm/utils/build-row-level-permission-record-filter.util';
import { validateEnumValueCompatibility } from 'src/engine/twenty-orm/utils/validate-enum-value-compatibility.util';
import { formatResult } from 'src/engine/twenty-orm/utils/format-result.util';
import { getObjectsPermissionsFromRolePermissionConfig } from 'src/engine/twenty-orm/utils/get-objects-permissions-from-role-permission-config.util';
import { renderRowLevelPermissionFilterToSql } from 'src/engine/twenty-orm/utils/render-row-level-permission-filter-to-sql.util';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';

export const DELIVERY_NATIVE_TASK_CACHE_KEYS = [
  'flatObjectMetadataMaps',
  'flatFieldMetadataMaps',
  'rolesPermissions',
  'userWorkspaceRoleMap',
  'flatRowLevelPermissionPredicateMaps',
  'flatRowLevelPermissionPredicateGroupMaps',
] as const;
export const deliveryNativeTaskSchema = (workspace: WorkspaceEntity) => {
  if (
    !workspace.databaseSchema ||
    !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
  )
    throw new ForbiddenException('Current native task access is unavailable.');
  return workspace.databaseSchema;
};
export const buildDeliveryNativeTaskVisibility = (
  context: ORMWorkspaceContext,
  selectedColumns: string[] = ['id', 'title', 'assigneeId', 'dueAt'],
  operation?: DeliveryNativeTaskWriteOperation,
) => {
  const { authContext } = context;
  if (authContext.type !== 'user')
    throw new ForbiddenException(
      'Current work requires a current user identity.',
    );
  const rolePermissionConfig = resolveRolePermissionConfig(context);
  if (!rolePermissionConfig || !('intersectionOf' in rolePermissionConfig))
    throw new ForbiddenException(
      'Current native task permissions are unavailable.',
    );
  const objectsPermissions = getObjectsPermissionsFromRolePermissionConfig({
    rolesPermissions: context.permissionsPerRoleId,
    rolePermissionConfig,
  });
  const objectMetadata = findFlatEntityByIdInFlatEntityMaps({
    flatEntityId: context.objectIdByNameSingular.task,
    flatEntityMaps: context.flatObjectMetadataMaps,
  });
  if (!objectMetadata || objectMetadata.isSystem)
    throw new ForbiddenException(
      'Current native task metadata is unavailable.',
    );
  validateOperationIsPermittedOrThrow({
    entityName: 'task',
    operationType: 'select',
    objectsPermissions,
    flatObjectMetadataMaps: context.flatObjectMetadataMaps,
    flatFieldMetadataMaps: context.flatFieldMetadataMaps,
    objectIdByNameSingular: context.objectIdByNameSingular,
    selectedColumns,
    allFieldsSelected: false,
    updatedColumns: [],
    authContext,
  });
  if (operation)
    validateOperationIsPermittedOrThrow({
      entityName: 'task',
      operationType: operation.type,
      objectsPermissions,
      flatObjectMetadataMaps: context.flatObjectMetadataMaps,
      flatFieldMetadataMaps: context.flatFieldMetadataMaps,
      objectIdByNameSingular: context.objectIdByNameSingular,
      selectedColumns,
      allFieldsSelected: false,
      updatedColumns: operation.updatedColumns,
      authContext,
    });
  // Missing member-dependent predicate values must not turn a restricted task read into an unrestricted one.
  for (const predicate of Object.values(
    context.flatRowLevelPermissionPredicateMaps.byUniversalIdentifier,
  )) {
    if (
      !predicate ||
      predicate.deletedAt ||
      predicate.objectMetadataId !== objectMetadata.id ||
      !rolePermissionConfig.intersectionOf.includes(predicate.roleId) ||
      !predicate.workspaceMemberFieldMetadataId
    )
      continue;
    const field = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: predicate.workspaceMemberFieldMetadataId,
      flatEntityMaps: context.flatFieldMetadataMaps,
    });
    const value = field
      ? Object.entries(authContext.workspaceMember).find(
          ([key]) => key === field.name,
        )?.[1]
      : undefined;
    if (
      !isDefined(value) ||
      (predicate.workspaceMemberSubFieldName &&
        (typeof value !== 'object' ||
          !isDefined(
            Object.entries(value).find(
              ([key]) => key === predicate.workspaceMemberSubFieldName,
            )?.[1],
          )))
    )
      throw new ForbiddenException(
        'A native task visibility rule cannot be verified for the current member.',
      );
    const targetField = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: predicate.fieldMetadataId,
      flatEntityMaps: context.flatFieldMetadataMaps,
    });
    const predicateValue =
      predicate.workspaceMemberSubFieldName && typeof value === 'object'
        ? Object.entries(value).find(
            ([key]) => key === predicate.workspaceMemberSubFieldName,
          )?.[1]
        : value;
    if (
      !field ||
      !targetField ||
      !validateEnumValueCompatibility({
        workspaceMemberFieldMetadata: field,
        targetFieldMetadata: targetField,
        predicateValue,
      })
    )
      throw new ForbiddenException(
        'A native task visibility rule has an incompatible member value.',
      );
  }
  const recordFilter = buildRowLevelPermissionRecordFilter({
    flatRowLevelPermissionPredicateMaps:
      context.flatRowLevelPermissionPredicateMaps,
    flatRowLevelPermissionPredicateGroupMaps:
      context.flatRowLevelPermissionPredicateGroupMaps,
    flatFieldMetadataMaps: context.flatFieldMetadataMaps,
    objectMetadata,
    roleIds: rolePermissionConfig.intersectionOf,
    workspaceMember: authContext.workspaceMember,
  });
  const rendered = recordFilter
    ? renderRowLevelPermissionFilterToSql({
        recordFilter,
        tableAlias: 'activityNativeTask',
        objectMetadata,
        flatFieldMetadataMaps: context.flatFieldMetadataMaps,
      })
    : null;
  if (recordFilter && !rendered)
    throw new ForbiddenException(
      'A native task visibility rule cannot be represented safely.',
    );
  let sql = rendered?.sql ?? 'TRUE';
  const parameters: ObjectLiteral = {};
  for (const [index, [key, value]] of Object.entries(
    rendered?.parameters ?? {},
  ).entries()) {
    const renamed = `activityNativePredicate${index}`;
    sql = sql.replace(
      new RegExp(`:(\\.\\.\\.)?${key}\\b`, 'g'),
      (_match, spread: string | undefined) => `:${spread ?? ''}${renamed}`,
    );
    parameters[renamed] = value;
  }
  return {
    sql,
    parameters,
    fingerprint: advertisingHash({
      workspaceId: authContext.workspace.id,
      userWorkspaceId: authContext.userWorkspaceId,
      memberId: authContext.workspaceMemberId,
      roleIds: [...rolePermissionConfig.intersectionOf].sort(),
      objectMetadata,
      fields: objectMetadata.fieldIds.map((id) =>
        findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: id,
          flatEntityMaps: context.flatFieldMetadataMaps,
        }),
      ),
      permissions: objectsPermissions[objectMetadata.id],
      selectedColumns,
      operation: operation ?? null,
      recordFilter,
    }),
  };
};
export const readDeliveryNativeTaskVisibility = async (
  manager: EntityManager,
  workspace: WorkspaceEntity,
  identity: { memberId: string; userWorkspaceId: string },
  workspaceOrm: GlobalWorkspaceOrmManager,
  cache: WorkspaceCacheService,
  selectedColumns?: string[],
  operation?: DeliveryNativeTaskWriteOperation,
) => {
  const membership = await manager.getRepository(UserWorkspaceEntity).findOne({
    where: { id: identity.userWorkspaceId, workspaceId: workspace.id },
    relations: { user: true, workspace: true },
  });
  if (
    !membership?.user ||
    !membership.workspace ||
    membership.user.disabled ||
    membership.user.deletedAt ||
    membership.deletedAt ||
    membership.workspace.deletedAt
  )
    throw new ForbiddenException(
      'Current native task identity is unavailable.',
    );
  const [member]: WorkspaceMemberWorkspaceEntity[] = await manager.query(
    `SELECT member.* FROM "${deliveryNativeTaskSchema(workspace)}"."workspaceMember" member WHERE member.id=$1 AND member."userId"=$2 AND member."deletedAt" IS NULL`,
    [identity.memberId, membership.userId],
  );
  if (!member)
    throw new ForbiddenException(
      'Current native task identity is unavailable.',
    );
  const authContext = buildUserAuthContext({
    workspace: fromWorkspaceEntityToFlat(membership.workspace),
    user: fromUserEntityToFlat(membership.user),
    userWorkspaceId: membership.id,
    workspaceMemberId: member.id,
    workspaceMember: member,
  });
  try {
    return await workspaceOrm.executeInWorkspaceContext(
      async () => {
        const context = getWorkspaceContext();
        const before = await cache.getCacheHashes(workspace.id, [
          ...DELIVERY_NATIVE_TASK_CACHE_KEYS,
        ]);
        const cached = await cache.getOrRecomputeWithHashes(workspace.id, [
          ...DELIVERY_NATIVE_TASK_CACHE_KEYS,
        ]);
        const memberObject = findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: context.objectIdByNameSingular.workspaceMember,
          flatEntityMaps: context.flatObjectMetadataMaps,
        });
        authContext.workspaceMember =
          formatResult<WorkspaceMemberWorkspaceEntity>(
            member,
            memberObject,
            context.flatObjectMetadataMaps,
            context.flatFieldMetadataMaps,
          );
        const [role]: { roleId: string }[] = await manager.query(
          'SELECT "roleId" FROM core."roleTarget" WHERE "workspaceId"=$1 AND "userWorkspaceId"=$2',
          [workspace.id, identity.userWorkspaceId],
        );
        if (
          !role ||
          context.userWorkspaceRoleMap[identity.userWorkspaceId] !== role.roleId
        )
          throw new ConflictException(
            'Native task permissions changed. Refresh current work.',
          );
        const visibility = buildDeliveryNativeTaskVisibility(
          context,
          selectedColumns,
          operation,
        );
        const after = await cache.getCacheHashes(workspace.id, [
          ...DELIVERY_NATIVE_TASK_CACHE_KEYS,
        ]);
        const loaded: Record<
          (typeof DELIVERY_NATIVE_TASK_CACHE_KEYS)[number],
          unknown
        > = {
          flatObjectMetadataMaps: context.flatObjectMetadataMaps,
          flatFieldMetadataMaps: context.flatFieldMetadataMaps,
          rolesPermissions: context.permissionsPerRoleId,
          userWorkspaceRoleMap: context.userWorkspaceRoleMap,
          flatRowLevelPermissionPredicateMaps:
            context.flatRowLevelPermissionPredicateMaps,
          flatRowLevelPermissionPredicateGroupMaps:
            context.flatRowLevelPermissionPredicateGroupMaps,
        };
        if (
          DELIVERY_NATIVE_TASK_CACHE_KEYS.some(
            (key) =>
              !before[key] ||
              before[key] !== after[key] ||
              after[key] !== cached.hashes[key] ||
              advertisingHash(loaded[key]) !==
                advertisingHash(cached.data[key]),
          )
        )
          throw new ConflictException(
            'Native task permissions changed. Refresh current work.',
          );
        return visibility;
      },
      authContext,
      { skipEntityMetadatas: true },
    );
  } catch (error) {
    if (
      error instanceof ConflictException ||
      error instanceof ForbiddenException
    )
      throw error;
    if (error instanceof PermissionsException)
      throw new ForbiddenException(
        operation
          ? 'Your CRM task permissions do not allow this change. Ask an administrator to check task and field access.'
          : 'Your CRM task permissions do not allow this view. Ask an administrator to check task and field access.',
      );
    throw new ForbiddenException(
      'Native task visibility cannot be verified. Refresh permissions before continuing.',
    );
  }
};
export type DeliveryNativeTaskVisibility = {
  fingerprint: string;
  sql: string;
  parameters: ObjectLiteral;
};
export type DeliveryNativeTaskWriteOperation = {
  type: 'insert' | 'update';
  updatedColumns: string[];
};
