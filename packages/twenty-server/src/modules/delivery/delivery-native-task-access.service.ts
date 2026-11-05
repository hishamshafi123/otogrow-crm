import { Injectable, NotFoundException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import {
  deliveryNativeTaskSchema,
  readDeliveryNativeTaskVisibility,
  type DeliveryNativeTaskVisibility,
  type DeliveryNativeTaskWriteOperation,
} from 'src/modules/delivery/native-task-visibility';

@Injectable()
export class DeliveryNativeTaskAccessService {
  constructor(
    private readonly workspaceOrm: GlobalWorkspaceOrmManager,
    private readonly cache: WorkspaceCacheService,
  ) {}

  visibility(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    identity: { memberId: string; userWorkspaceId: string },
    selectedColumns?: string[],
    operation?: DeliveryNativeTaskWriteOperation,
  ) {
    return readDeliveryNativeTaskVisibility(
      manager,
      workspace,
      identity,
      this.workspaceOrm,
      this.cache,
      selectedColumns,
      operation,
    );
  }

  predicate(
    workspace: WorkspaceEntity,
    visibility: DeliveryNativeTaskVisibility,
    taskIdSql: string,
  ) {
    return `EXISTS (SELECT 1 FROM "${deliveryNativeTaskSchema(workspace)}"."task" "activityNativeTask" WHERE "activityNativeTask".id=${taskIdSql} AND "activityNativeTask"."deletedAt" IS NULL AND (${visibility.sql}))`;
  }

  query<TResult>(
    manager: EntityManager,
    sql: string,
    baseParameters: unknown[],
    visibility: DeliveryNativeTaskVisibility,
  ): Promise<TResult> {
    // Keep existing positional values ahead of named native row-policy values, including spread parameters.
    const [query, parameters] =
      manager.connection.driver.escapeQueryWithParameters(
        sql,
        visibility.parameters,
        Object.fromEntries(
          baseParameters.map((value, index) => [`deliveryBase${index}`, value]),
        ),
      );
    return manager.query(query, parameters);
  }

  async assert(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    identity: { memberId: string; userWorkspaceId: string },
    taskId: string,
    selectedColumns?: string[],
    operation?: DeliveryNativeTaskWriteOperation,
  ) {
    const visibility = await this.visibility(
      manager,
      workspace,
      identity,
      selectedColumns,
      operation,
    );
    const rows = await this.query<{ id: string }[]>(
      manager,
      `SELECT $1::uuid AS id WHERE ${this.predicate(workspace, visibility, '$1::uuid')}`,
      [taskId],
      visibility,
    );
    if (!rows.length)
      throw new NotFoundException(
        'This task is unavailable under your current access.',
      );
    return visibility;
  }
}
