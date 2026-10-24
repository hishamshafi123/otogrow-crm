// Managed delivery records use the scoped service so generic CRUD cannot bypass review.
export const deliveryTaskIsolationCondition = (
  objectName: string,
  alias: string,
  scope: { workspaceId: string } | { schemaName: string },
): string | null => {
  if (objectName !== 'task') return null;
  const escapedAlias = `"${alias.replace(/"/g, '""')}"`;
  const workspaceCondition =
    'workspaceId' in scope
      ? `delivery_scope."workspaceId" = '${scope.workspaceId.replace(/'/g, "''")}'`
      : `delivery_scope."workspaceId" = (SELECT id FROM "core"."workspace" WHERE "databaseSchema" = '${scope.schemaName.replace(/'/g, "''")}')`;
  return `NOT EXISTS (SELECT 1 FROM "core"."deliveryTask" delivery_scope WHERE delivery_scope."taskId" = ${escapedAlias}."id" AND ${workspaceCondition})`;
};
