import { randomUUID } from 'crypto';
import {
  FeatureFlagKey,
  FieldMetadataType,
  RowLevelPermissionPredicateOperand,
  type ObjectsPermissionsByRoleId,
} from 'twenty-shared/types';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatRowLevelPermissionPredicate } from 'src/engine/metadata-modules/row-level-permission-predicate/types/flat-row-level-permission-predicate.type';

const maps = <TEntity extends SyncableFlatEntity>(
  entities: TEntity[],
): FlatEntityMaps<TEntity> => ({
  byUniversalIdentifier: Object.fromEntries(
    entities.map((entity) => [entity.universalIdentifier, entity]),
  ),
  universalIdentifierById: Object.fromEntries(
    entities.map((entity) => [entity.id, entity.universalIdentifier]),
  ),
  universalIdentifiersByApplicationId: {},
});
export const createCurrentWorkNativeFixture = (
  workspaceId: string,
  roleId: string,
  userWorkspaceId: string,
) => {
  const taskObjectId = randomUUID();
  const memberObjectId = randomUUID();
  const applicationId = randomUUID();
  const field = (
    name: string,
    type: FieldMetadataType,
    objectMetadataId: string,
  ) => {
    const id = randomUUID();
    return getFlatFieldMetadataMock({
      id,
      universalIdentifier: id,
      applicationId,
      applicationUniversalIdentifier: applicationId,
      workspaceId,
      objectMetadataId,
      objectMetadataUniversalIdentifier: objectMetadataId,
      name,
      type,
    });
  };
  const taskFields = [
    field('id', FieldMetadataType.UUID, taskObjectId),
    field('title', FieldMetadataType.TEXT, taskObjectId),
    field('assigneeId', FieldMetadataType.UUID, taskObjectId),
    field('dueAt', FieldMetadataType.DATE_TIME, taskObjectId),
  ];
  const memberFields = [
    field('id', FieldMetadataType.UUID, memberObjectId),
    field('userId', FieldMetadataType.UUID, memberObjectId),
    field('name', FieldMetadataType.FULL_NAME, memberObjectId),
  ];
  const object = (id: string, name: string, fields: typeof taskFields) =>
    getFlatObjectMetadataMock({
      id,
      universalIdentifier: id,
      applicationId,
      applicationUniversalIdentifier: applicationId,
      workspaceId,
      nameSingular: name,
      namePlural: `${name}s`,
      fieldIds: fields.map((item) => item.id),
      fieldUniversalIdentifiers: fields.map((item) => item.universalIdentifier),
    });
  const taskObject = object(taskObjectId, 'task', taskFields);
  const memberObject = object(memberObjectId, 'workspaceMember', memberFields);
  const permissions = {
    canReadObjectRecords: true,
    canUpdateObjectRecords: false,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
    restrictedFields: {},
    rowLevelPermissionPredicates: [],
    rowLevelPermissionPredicateGroups: [],
  };
  const rolesPermissions: ObjectsPermissionsByRoleId = {
    [roleId]: { [taskObjectId]: permissions },
  };
  const predicateId = randomUUID();
  const predicate = {
    id: predicateId,
    universalIdentifier: predicateId,
    workspaceId,
    applicationId,
    applicationUniversalIdentifier: applicationId,
    roleId,
    roleUniversalIdentifier: roleId,
    objectMetadataId: taskObjectId,
    objectMetadataUniversalIdentifier: taskObjectId,
    fieldMetadataId: taskFields[1].id,
    fieldMetadataUniversalIdentifier: taskFields[1].universalIdentifier,
    operand: RowLevelPermissionPredicateOperand.CONTAINS,
    value: 'Visible',
    subFieldName: null,
    workspaceMemberFieldMetadataId: null,
    workspaceMemberSubFieldName: null,
    workspaceMemberFieldMetadataUniversalIdentifier: null,
    rowLevelPermissionPredicateGroupId: null,
    rowLevelPermissionPredicateGroupUniversalIdentifier: null,
    positionInRowLevelPermissionPredicateGroup: null,
    deletedAt: null,
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
  } as FlatRowLevelPermissionPredicate;
  const data = {
    flatObjectMetadataMaps: maps([taskObject, memberObject]),
    flatFieldMetadataMaps: maps([...taskFields, ...memberFields]),
    flatIndexMaps: createEmptyFlatEntityMaps(),
    rolesPermissions,
    userWorkspaceRoleMap: { [userWorkspaceId]: roleId },
    apiKeyRoleMap: {},
    flatRowLevelPermissionPredicateMaps: maps([predicate]),
    flatRowLevelPermissionPredicateGroupMaps: createEmptyFlatEntityMaps(),
    featureFlagsMap: {
      [FeatureFlagKey.IS_ORM_V2_READ_PATH_ENABLED]: false,
    } as Record<FeatureFlagKey, boolean>,
  };
  return {
    data,
    taskObject,
    memberObject,
    taskFields,
    memberFields,
    predicate,
    maps,
  };
};
