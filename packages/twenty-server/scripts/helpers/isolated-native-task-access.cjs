const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { isAbsolute } = require('node:path');

// Older domain proofs isolate delivery policy with synthetic members and no native role metadata.
// This fixture-only visibility cannot establish native object, field, row or write permission coverage.
const createIsolatedNativeTaskAccess = () => {
  const {
    DeliveryNativeTaskAccessService,
  } = require('../../dist/modules/delivery/delivery-native-task-access.service');
  const access = new DeliveryNativeTaskAccessService(null, null);
  access.visibility = async (
    manager,
    workspace,
    identity,
    selectedColumns,
    operation,
  ) => {
    assert(
      manager.queryRunner?.isTransactionActive,
      'Synthetic native visibility belongs only to an explicit fixture transaction.',
    );
    const host =
      manager.queryRunner.databaseConnection?.connectionParameters?.host;
    assert(
      manager.connection.options.type === 'postgres' &&
        typeof host === 'string' &&
        (['localhost', '127.0.0.1', '::1'].includes(host) || isAbsolute(host)),
      'Synthetic native visibility requires a connected local PostgreSQL fixture.',
    );
    return {
      sql: 'TRUE',
      parameters: {},
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            fixtureMode: 'UNRESTRICTED_SYNTHETIC_NATIVE_VISIBILITY',
            workspaceId: workspace.id,
            identity,
            selectedColumns,
            operation,
          }),
        )
        .digest('hex'),
    };
  };
  return access;
};

module.exports = { createIsolatedNativeTaskAccess };
