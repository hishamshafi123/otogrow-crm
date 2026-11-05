import { NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';

const workspace = {
  id: '86b5b121-2909-49bf-bc47-70203d497b7f',
  databaseSchema: 'native_access_fixture',
} as WorkspaceEntity;
const taskId = 'aba82da2-3979-40e8-bdac-c84cabba6d85';
const identity = { memberId: taskId, userWorkspaceId: workspace.id };
const setup = () => {
  const connection = new DataSource({ type: 'postgres' });
  const query = jest.fn().mockResolvedValue([{ id: taskId }]);
  const manager = { connection, query } as unknown as EntityManager;
  const service = new DeliveryNativeTaskAccessService(
    {} as GlobalWorkspaceOrmManager,
    {} as WorkspaceCacheService,
  );
  return { service, manager, query };
};

describe('DeliveryNativeTaskAccessService', () => {
  it('binds positional, repeated named, spread and null values with the real PostgreSQL driver', async () => {
    const { service, manager, query } = setup();
    const privateValue = "private' OR TRUE --";
    await service.query(
      manager,
      'SELECT $1, $2 WHERE title=:name OR title=:name OR id IN (:...ids) OR due=:empty',
      [taskId, null],
      {
        sql: 'TRUE',
        fingerprint: 'fixture',
        parameters: {
          name: privateValue,
          ids: ['first', 'second'],
          empty: null,
        },
      },
    );
    expect(query).toHaveBeenCalledWith(
      'SELECT $1, $2 WHERE title=$3 OR title=$3 OR id IN ($4, $5) OR due=$6',
      [taskId, null, privateValue, 'first', 'second', null],
    );
    expect(query.mock.calls[0][0]).not.toContain(privateValue);
  });

  it('keeps policy names distinct from the native positional parameter namespace', async () => {
    const { service, manager, query } = setup();
    await service.query(
      manager,
      'SELECT $1 WHERE title=:deliveryBase0',
      ['base'],
      {
        sql: 'TRUE',
        fingerprint: 'fixture',
        parameters: { deliveryBase0: 'policy' },
      },
    );
    expect(query).toHaveBeenCalledWith('SELECT $1 WHERE title=$2', [
      'base',
      'policy',
    ]);
  });

  it('applies exact row visibility and forwards selected read/write fields', async () => {
    const { service, manager, query } = setup();
    const visibility = {
      sql: '"activityNativeTask".title=:title',
      fingerprint: 'fixture',
      parameters: { title: 'Visible' },
    };
    const read = jest
      .spyOn(service, 'visibility')
      .mockResolvedValue(visibility);
    const operation = { type: 'update' as const, updatedColumns: ['status'] };
    await expect(
      service.assert(manager, workspace, identity, taskId, ['id'], operation),
    ).resolves.toBe(visibility);
    expect(read).toHaveBeenCalledWith(
      manager,
      workspace,
      identity,
      ['id'],
      operation,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        '"activityNativeTask".id=$1::uuid AND "activityNativeTask"."deletedAt" IS NULL AND ("activityNativeTask".title=$2)',
      ),
      [taskId, 'Visible'],
    );
  });

  it('returns the same unavailable result for an absent or filtered exact task', async () => {
    const { service, manager, query } = setup();
    query.mockResolvedValue([]);
    jest.spyOn(service, 'visibility').mockResolvedValue({
      sql: 'FALSE',
      parameters: {},
      fingerprint: 'fixture',
    });
    await expect(
      service.assert(manager, workspace, identity, taskId),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.assert(manager, workspace, identity, taskId),
    ).rejects.toThrow('This task is unavailable under your current access.');
  });

  it('does not query native rows after a policy denial', async () => {
    const { service, manager, query } = setup();
    const denial = new Error('Native task access denied');
    jest.spyOn(service, 'visibility').mockRejectedValue(denial);
    await expect(
      service.assert(manager, workspace, identity, taskId),
    ).rejects.toBe(denial);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unsafe workspace schema before composing a predicate', () => {
    const { service } = setup();
    expect(() =>
      service.predicate(
        { ...workspace, databaseSchema: 'schema" OR TRUE' },
        { sql: 'TRUE', parameters: {}, fingerprint: 'fixture' },
        '$1',
      ),
    ).toThrow('Current native task access is unavailable.');
  });
});
