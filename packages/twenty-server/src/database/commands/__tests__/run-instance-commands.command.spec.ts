import { RunInstanceCommandsCommand } from 'src/database/commands/run-instance-commands.command';
import { type UpgradeStep } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { TWENTY_CURRENT_VERSION } from 'src/engine/core-modules/upgrade/constants/twenty-current-version.constant';
import { TWENTY_PREVIOUS_VERSIONS } from 'src/engine/core-modules/upgrade/constants/twenty-previous-versions.constant';
import { type UpgradeMigrationStatus } from 'src/engine/core-modules/upgrade/upgrade-migration.entity';

type Evidence = {
  workspaceId: string;
  name: string;
  status: UpgradeMigrationStatus;
  isInitial: boolean;
};
const EXISTING_WORKSPACE = '00000000-0000-4000-8000-000000000001';
const NEW_WORKSPACE = '00000000-0000-4000-8000-000000000002';
const PREVIOUS_LAST = 'registered-previous-last-workspace';
const NEW_INITIAL = 'registered-new-instance';
const fixture = () => {
  const fast = { up: jest.fn(), down: jest.fn() };
  const slow = { up: jest.fn(), down: jest.fn(), runDataMigration: jest.fn() };
  const previousVersion =
    TWENTY_PREVIOUS_VERSIONS[TWENTY_PREVIOUS_VERSIONS.length - 1];
  // Instance-only execution must never invoke a workspace command body.
  const sequence: UpgradeStep[] = [
    {
      kind: 'fast-instance',
      name: 'registered-older-instance',
      version: previousVersion,
      timestamp: 1,
      command: fast,
    },
    {
      kind: 'workspace',
      name: PREVIOUS_LAST,
      version: previousVersion,
      timestamp: 2,
      command: {} as never,
    },
    {
      kind: 'fast-instance',
      name: NEW_INITIAL,
      version: TWENTY_CURRENT_VERSION,
      timestamp: 3,
      command: fast,
    },
    {
      kind: 'slow-instance',
      name: 'registered-new-slow',
      version: TWENTY_CURRENT_VERSION,
      timestamp: 4,
      command: slow,
    },
    {
      kind: 'workspace',
      name: 'registered-new-workspace',
      version: TWENTY_CURRENT_VERSION,
      timestamp: 5,
      command: {} as never,
    },
  ];
  const evidence: Evidence[] = [
    {
      workspaceId: EXISTING_WORKSPACE,
      name: PREVIOUS_LAST,
      status: 'completed',
      isInitial: true,
    },
    {
      workspaceId: NEW_WORKSPACE,
      name: NEW_INITIAL,
      status: 'completed',
      isInitial: true,
    },
  ];
  const database = {
    query: jest.fn().mockResolvedValue(evidence),
    runMigrations: jest.fn().mockResolvedValue([]),
  };
  const workspaces = {
    getProvisionedWorkspaceIds: jest
      .fn()
      .mockResolvedValue([EXISTING_WORKSPACE, NEW_WORKSPACE]),
  };
  const registry = {
    getLastWorkspaceCommandForVersion: jest.fn().mockReturnValue(sequence[1]),
  };
  const reader = { getUpgradeSequence: jest.fn(() => sequence) };
  const runner = {
    runFastInstanceCommand: jest
      .fn()
      .mockResolvedValue({ status: 'completed' }),
    runSlowInstanceCommand: jest
      .fn()
      .mockResolvedValue({ status: 'completed' }),
  };
  const ledger = {
    areAllWorkspacesAtCommand: jest.fn().mockResolvedValue(false),
  };
  const status = { invalidateInstanceAndAllWorkspacesStatus: jest.fn() };
  const command = new RunInstanceCommandsCommand(
    database as never,
    workspaces as never,
    registry as never,
    reader as never,
    runner as never,
    ledger as never,
    status as never,
  );
  return {
    command,
    database,
    workspaces,
    registry,
    reader,
    runner,
    ledger,
    status,
    sequence,
    evidence,
    fast,
    slow,
  };
};

it('accepts mixed completed previous workspaces and newer registered initialization without workspace replay or forced execution', async () => {
  const value = fixture();
  await value.command.run([], {});
  expect(value.ledger.areAllWorkspacesAtCommand).toHaveBeenCalledWith({
    commandName: PREVIOUS_LAST,
    workspaceIds: [EXISTING_WORKSPACE, NEW_WORKSPACE],
  });
  expect(value.database.query).toHaveBeenCalledTimes(1);
  expect(value.database.query.mock.calls[0][1]).toEqual([
    [EXISTING_WORKSPACE, NEW_WORKSPACE],
    PREVIOUS_LAST,
  ]);
  expect(value.database.runMigrations).toHaveBeenCalledWith({
    transaction: 'each',
  });
  expect(value.runner.runFastInstanceCommand).toHaveBeenCalledTimes(2);
  expect(value.runner.runSlowInstanceCommand).not.toHaveBeenCalled();
  expect(value.fast.up).not.toHaveBeenCalled();
  expect(value.slow.runDataMigration).not.toHaveBeenCalled();
});
it('preserves the exact-previous fast path and ordinary explicit slow behavior', async () => {
  const value = fixture();
  value.ledger.areAllWorkspacesAtCommand.mockResolvedValue(true);
  await value.command.run([], { includeSlow: true });
  expect(value.database.query).not.toHaveBeenCalled();
  expect(value.runner.runSlowInstanceCommand).toHaveBeenCalledWith({
    command: value.slow,
    name: 'registered-new-slow',
    skipDataMigration: false,
  });
});
it.each([
  { name: NEW_INITIAL, status: 'completed', isInitial: false },
  { name: NEW_INITIAL, status: 'failed', isInitial: true },
  { name: 'registered-older-instance', status: 'completed', isInitial: true },
  {
    name: '2.999_invented_later_cursor_9999999999999',
    status: 'completed',
    isInitial: true,
  },
] satisfies Omit<Evidence, 'workspaceId'>[])(
  'rejects noninitial, failed, older and unknown evidence before any migration: %j',
  async (row) => {
    const value = fixture();
    value.evidence[1] = { workspaceId: NEW_WORKSPACE, ...row };
    await expect(value.command.run([], {})).rejects.toThrow(
      'have not completed',
    );
    expect(value.database.runMigrations).not.toHaveBeenCalled();
    expect(value.runner.runFastInstanceCommand).not.toHaveBeenCalled();
    expect(value.runner.runSlowInstanceCommand).not.toHaveBeenCalled();
  },
);
it('does not use a valid later initial cursor to hide an explicitly failed previous-version command', async () => {
  const value = fixture();
  value.evidence.push({
    workspaceId: NEW_WORKSPACE,
    name: PREVIOUS_LAST,
    status: 'failed',
    isInitial: false,
  });
  await expect(value.command.run([], {})).rejects.toThrow('have not completed');
  expect(value.database.runMigrations).not.toHaveBeenCalled();
});
it('requires evidence for every provisioned workspace, not a different workspace or global instance ledger', async () => {
  const value = fixture();
  value.evidence[1].workspaceId = 'different-workspace';
  await expect(value.command.run([], {})).rejects.toThrow('have not completed');
  expect(value.database.runMigrations).not.toHaveBeenCalled();
});
it('fails closed when the previous registry boundary is absent from the actual supported sequence', async () => {
  const value = fixture();
  value.sequence.splice(1, 1);
  await expect(value.command.run([], {})).rejects.toThrow('have not completed');
  expect(value.database.query).not.toHaveBeenCalled();
  expect(value.database.runMigrations).not.toHaveBeenCalled();
});
it('keeps the no-provisioned-workspace bootstrap path unchanged', async () => {
  const value = fixture();
  value.workspaces.getProvisionedWorkspaceIds.mockResolvedValue([]);
  await value.command.run([], { includeSlow: true });
  expect(value.database.query).not.toHaveBeenCalled();
  expect(value.ledger.areAllWorkspacesAtCommand).not.toHaveBeenCalled();
  expect(value.runner.runSlowInstanceCommand).toHaveBeenCalledWith(
    expect.objectContaining({ skipDataMigration: true }),
  );
});
