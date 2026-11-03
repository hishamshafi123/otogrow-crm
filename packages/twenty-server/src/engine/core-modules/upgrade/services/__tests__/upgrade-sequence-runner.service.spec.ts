import { type WorkspaceLastAttemptedCommand } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { type ParsedUpgradeCommandOptions } from 'src/database/commands/upgrade-version-command/upgrade.command';
import {
  UpgradeSequenceReaderService,
  type UpgradeStep,
} from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeSequenceRunnerService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service';

const setup = () => {
  const sequence = [
    { kind: 'fast-instance', name: 'existing', version: '2.34.0', command: {} },
    {
      kind: 'fast-instance',
      name: 'added-later',
      version: '2.34.0',
      command: {},
    },
    {
      kind: 'workspace',
      name: 'workspace-completed',
      version: '2.34.0',
      command: {},
    },
  ] as UpgradeStep[];
  const cursors = new Map([
    ['workspace', { name: 'workspace-completed', status: 'completed' }],
  ]);
  const migrations = {
    getLastAttemptedCommandNameOrThrow: jest
      .fn()
      .mockResolvedValue({ name: 'workspace-completed', status: 'completed' }),
    getWorkspaceLastAttemptedCommandNameOrThrow: jest
      .fn()
      .mockResolvedValue(cursors),
    isLastAttemptCompleted: jest.fn(
      async ({ name }: { name: string }) => name === 'existing',
    ),
  };
  const instanceRunner = {
    runFastInstanceCommand: jest.fn().mockResolvedValue({ status: 'success' }),
  };
  const workspaceRunner = { runWorkspaceCommands: jest.fn() };
  const iterator = {
    iterate: jest.fn(
      async ({
        callback,
      }: {
        callback: (context: { workspaceId: string }) => Promise<void>;
      }) => {
        await callback({ workspaceId: 'workspace' });
        return { success: ['workspace'], fail: [], interrupted: false };
      },
    ),
  };
  const service = new UpgradeSequenceRunnerService(
    migrations as never,
    instanceRunner as never,
    workspaceRunner as never,
    new UpgradeSequenceReaderService({} as never),
    { refresh: jest.fn() } as never,
    iterator as never,
    {
      getProvisionedWorkspaceIds: jest.fn().mockResolvedValue(['workspace']),
    } as never,
    { isShutdownRequested: () => false } as never,
  );
  return { service, sequence, migrations, instanceRunner, workspaceRunner };
};

describe('Same-version instance migrations', () => {
  it('applies missing DDL before a completed workspace cursor without replaying workspace commands', async () => {
    const { service, sequence, instanceRunner, workspaceRunner } = setup();
    await service.run({ sequence, options: {} });
    expect(instanceRunner.runFastInstanceCommand).toHaveBeenCalledTimes(1);
    expect(instanceRunner.runFastInstanceCommand).toHaveBeenCalledWith({
      name: 'added-later',
      command: sequence[1].command,
    });
    expect(workspaceRunner.runWorkspaceCommands).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceCommands: [] }),
    );
  });

  it('does not rerun already applied DDL', async () => {
    const { service, sequence, migrations, instanceRunner } = setup();
    migrations.isLastAttemptCompleted.mockResolvedValue(true);
    await service.run({ sequence, options: {} });
    expect(instanceRunner.runFastInstanceCommand).not.toHaveBeenCalled();
  });

  it('stops the upgrade when missing DDL fails', async () => {
    const { service, sequence, instanceRunner, workspaceRunner } = setup();
    instanceRunner.runFastInstanceCommand.mockResolvedValue({
      status: 'failed',
      error: new Error('DDL failed'),
    });
    await expect(service.run({ sequence, options: {} })).rejects.toThrow(
      'DDL failed',
    );
    expect(workspaceRunner.runWorkspaceCommands).not.toHaveBeenCalled();
  });

  it.each([{ workspaceIds: ['workspace'] }])(
    'does not mutate the instance during a filtered upgrade',
    async (options) => {
      const { service, sequence, instanceRunner } = setup();
      await expect(service.run({ sequence, options })).rejects.toThrow(
        'unfiltered upgrade',
      );
      expect(instanceRunner.runFastInstanceCommand).not.toHaveBeenCalled();
    },
  );

  it('plans a late same-version addition without replaying completed workspace work', async () => {
    const { service, sequence, instanceRunner, workspaceRunner } = setup();
    const result = await service.run({ sequence, options: { dryRun: true } });
    expect(result.plannedSteps).toEqual([
      {
        kind: 'fast-instance',
        name: 'added-later',
        version: '2.34.0',
        workspaceId: null,
      },
    ]);
    expect(result.totalSuccesses).toBe(0);
    expect(instanceRunner.runFastInstanceCommand).not.toHaveBeenCalled();
    expect(workspaceRunner.runWorkspaceCommands).not.toHaveBeenCalled();
  });
});

const previewSetup = () => {
  const forbidden = jest.fn(() => {
    throw new Error('Preview reached an executor or mutating adapter.');
  });
  const command = {
    up: forbidden,
    down: forbidden,
    runDataMigration: forbidden,
    runOnWorkspace: forbidden,
  };
  // A preview must not require or initialize concrete command runners and their mutable dependencies.
  const sequence = [
    { kind: 'fast-instance', name: 'base', version: '2.34.0', command },
    { kind: 'fast-instance', name: 'new-fast', version: '2.34.0', command },
    { kind: 'slow-instance', name: 'new-slow', version: '2.34.0', command },
    { kind: 'workspace', name: 'first-workspace', version: '2.34.0', command },
    { kind: 'workspace', name: 'last-workspace', version: '2.34.0', command },
    {
      kind: 'fast-instance',
      name: 'following-fast',
      version: '2.35.0',
      command,
    },
    {
      kind: 'workspace',
      name: 'following-workspace',
      version: '2.35.0',
      command,
    },
  ] as unknown as UpgradeStep[];
  const cursors = new Map<string, WorkspaceLastAttemptedCommand>(
    ['a', 'b', 'c'].map((workspaceId) => [
      workspaceId,
      {
        workspaceId,
        name: 'base',
        status: 'completed' as const,
        executedByVersion: '2.34.0',
        errorMessage: null,
        createdAt: new Date('2026-11-03T00:00:00Z'),
        isInitial: false,
      },
    ]),
  );
  const migrations = {
    getLastAttemptedCommandNameOrThrow: jest
      .fn()
      .mockResolvedValue({ name: 'base', status: 'completed' }),
    getWorkspaceLastAttemptedCommandNameOrThrow: jest
      .fn()
      .mockResolvedValue(cursors),
    isLastAttemptCompleted: jest.fn(
      async ({ name }: { name: string }) => name === 'base',
    ),
    recordUpgradeMigration: forbidden,
  };
  const instance = {
    runFastInstanceCommand: forbidden,
    runSlowInstanceCommand: forbidden,
  };
  const workspace = { runWorkspaceCommands: forbidden };
  const adapter = { refresh: forbidden };
  const iterator = { iterate: forbidden };
  const versions = {
    getProvisionedWorkspaceIds: jest.fn().mockResolvedValue(['a', 'b', 'c']),
  };
  const runner = new UpgradeSequenceRunnerService(
    migrations as never,
    instance as never,
    workspace as never,
    new UpgradeSequenceReaderService({} as never),
    adapter as never,
    iterator as never,
    versions as never,
    { isShutdownRequested: () => false } as never,
  );
  return { runner, sequence, migrations, forbidden, cursors, versions };
};

describe('Upgrade plan-only preview', () => {
  it('plans fast, slow and every pending workspace segment without calling any execution boundary', async () => {
    const { runner, sequence, forbidden, cursors } = previewSetup();
    const original = [...cursors.entries()];
    const result = await runner.run({ sequence, options: { dryRun: true } });
    expect(
      result.plannedSteps?.map((step) => [step.name, step.workspaceId]),
    ).toEqual([
      ['new-fast', null],
      ['new-slow', null],
      ['first-workspace', 'a'],
      ['last-workspace', 'a'],
      ['first-workspace', 'b'],
      ['last-workspace', 'b'],
      ['first-workspace', 'c'],
      ['last-workspace', 'c'],
      ['following-fast', null],
      ['following-workspace', 'a'],
      ['following-workspace', 'b'],
      ['following-workspace', 'c'],
    ]);
    expect(result.totalSuccesses).toBe(0);
    expect(result.totalFailures).toBe(0);
    expect([...cursors.entries()]).toEqual(original);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it.each<[ParsedUpgradeCommandOptions, string[]]>([
    [{ workspaceIds: ['b'] }, ['b']],
    [{ startFromWorkspaceId: 'b', workspaceCountLimit: 1 }, ['b']],
    [{ workspaceCountLimit: 2 }, ['a', 'b']],
  ])(
    'respects workspace selection and stops before the next instance barrier: %j',
    async (options, selected) => {
      const { runner, sequence, forbidden, cursors, migrations } =
        previewSetup();
      migrations.getLastAttemptedCommandNameOrThrow.mockResolvedValue({
        name: 'first-workspace',
        status: 'failed',
      });
      migrations.isLastAttemptCompleted.mockResolvedValue(true);
      for (const [id, cursor] of cursors)
        cursors.set(id, { ...cursor, name: 'first-workspace' });
      const result = await runner.run({
        sequence,
        options: { ...options, dryRun: true },
      });
      expect(
        result.plannedSteps?.map((step) => [step.name, step.workspaceId]),
      ).toEqual(selected.map((id) => ['last-workspace', id]));
      expect(result.stoppedBefore).toBe('following-fast');
      expect(forbidden).not.toHaveBeenCalled();
    },
  );
  it('reports a filtered pending instance barrier without executing or pretending workspaces upgraded', async () => {
    const { runner, sequence, forbidden } = previewSetup();
    const result = await runner.run({
      sequence,
      options: { dryRun: true, workspaceIds: ['b'] },
    });
    expect(result.plannedSteps).toEqual([]);
    expect(result.stoppedBefore).toBe('new-fast');
    expect(forbidden).not.toHaveBeenCalled();
  });
  it('includes failed workspace command retries but excludes completed commands', async () => {
    const { runner, sequence, forbidden, migrations, cursors } = previewSetup();
    migrations.getLastAttemptedCommandNameOrThrow.mockResolvedValue({
      name: 'first-workspace',
      status: 'failed',
    });
    migrations.isLastAttemptCompleted.mockResolvedValue(true);
    for (const [id, cursor] of cursors)
      cursors.set(id, {
        ...cursor,
        name: id === 'b' ? 'last-workspace' : 'first-workspace',
        status: id === 'a' ? 'failed' : 'completed',
      });
    const result = await runner.run({
      sequence,
      options: { dryRun: true, workspaceIds: ['a', 'b'] },
    });
    expect(
      result.plannedSteps?.map((step) => [step.name, step.workspaceId]),
    ).toEqual([
      ['first-workspace', 'a'],
      ['last-workspace', 'a'],
    ]);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it('empty sequence and no-workspace preview do not initialize mutable adapters', async () => {
    const { runner, sequence, forbidden, versions, migrations } =
      previewSetup();
    expect(
      (await runner.run({ sequence: [], options: { dryRun: true } }))
        .plannedSteps,
    ).toEqual([]);
    versions.getProvisionedWorkspaceIds.mockResolvedValue([]);
    migrations.getWorkspaceLastAttemptedCommandNameOrThrow.mockResolvedValue(
      new Map(),
    );
    const result = await runner.run({ sequence, options: { dryRun: true } });
    expect(
      result.plannedSteps?.every((step) => step.workspaceId === null),
    ).toBe(true);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it('a failed ledger read never enters adapter refresh or an executor', async () => {
    const { runner, sequence, forbidden, migrations } = previewSetup();
    migrations.getLastAttemptedCommandNameOrThrow.mockRejectedValue(
      new Error('Read unavailable'),
    );
    await expect(
      runner.run({ sequence, options: { dryRun: true } }),
    ).rejects.toThrow('Read unavailable');
    expect(forbidden).not.toHaveBeenCalled();
  });
});
