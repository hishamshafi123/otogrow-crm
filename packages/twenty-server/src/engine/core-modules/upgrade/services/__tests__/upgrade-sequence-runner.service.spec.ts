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

  it.each([{ dryRun: true }, { workspaceIds: ['workspace'] }])(
    'does not mutate the instance during a dry run or filtered upgrade',
    async (options) => {
      const { service, sequence, instanceRunner } = setup();
      await expect(service.run({ sequence, options })).rejects.toThrow(
        'unfiltered upgrade',
      );
      expect(instanceRunner.runFastInstanceCommand).not.toHaveBeenCalled();
    },
  );
});
