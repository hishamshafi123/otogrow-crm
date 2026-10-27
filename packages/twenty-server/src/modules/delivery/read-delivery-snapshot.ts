import { type DataSource, type EntityManager } from 'typeorm';

import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import {
  newDeliveryOperations,
  type DeliveryOperations,
} from 'src/modules/delivery/operations/delivery-operations.types';

export const readDeliverySnapshot = async <TResult>(
  dataSource: DataSource,
  workspaceId: string,
  read: (manager: EntityManager) => Promise<TResult>,
  transactionManager?: EntityManager,
): Promise<TResult> => {
  if (
    transactionManager &&
    !transactionManager.queryRunner?.isTransactionActive
  )
    throw new Error(
      'Delivery snapshot manager requires an active transaction.',
    );
  const apply = async (manager: EntityManager) => {
    // Share reads, but serialize their authorization and data with edits and revocations.
    await manager.query(
      'SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))',
      [`delivery:${workspaceId}`],
    );
    return read(manager);
  };
  return transactionManager
    ? apply(transactionManager)
    : dataSource.transaction(apply);
};

export const readDeliveryOperations = <TResult>(
  dataSource: DataSource,
  workspaceId: string,
  read: (state: DeliveryOperations, manager: EntityManager) => Promise<TResult>,
  transactionManager?: EntityManager,
): Promise<TResult> =>
  readDeliverySnapshot(
    dataSource,
    workspaceId,
    async (manager) => {
      const record = await manager
        .getRepository(DeliveryOperationsEntity)
        .findOneBy({ workspaceId });
      return read(record?.state ?? newDeliveryOperations(), manager);
    },
    transactionManager,
  );
