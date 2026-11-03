import { UpgradeCommand } from 'src/database/commands/upgrade-version-command/upgrade.command';

const fixture = () => {
  const runner = {
    run: jest.fn().mockResolvedValue({
      totalSuccesses: 0,
      totalFailures: 0,
      plannedSteps: [],
    }),
  };
  const status = { invalidateInstanceAndAllWorkspacesStatus: jest.fn() };
  const command = new UpgradeCommand(
    { getUpgradeSequence: () => [] } as never,
    runner as never,
    status as never,
    { listenToShutdownSignals: jest.fn() } as never,
  );
  return { command, runner, status };
};
describe('Upgrade CLI plan-only boundary', () => {
  it('forwards exact scope and preview mode without invalidating status caches', async () => {
    const { command, runner, status } = fixture();
    await command.run([], {
      dryRun: true,
      workspaceId: new Set(['workspace-b']),
      workspaceCountLimit: 1,
    });
    expect(runner.run).toHaveBeenCalledWith({
      sequence: [],
      options: expect.objectContaining({
        dryRun: true,
        workspaceIds: ['workspace-b'],
        workspaceCountLimit: 1,
      }),
    });
    expect(status.invalidateInstanceAndAllWorkspacesStatus).not.toHaveBeenCalled();
  });
  it('does not invalidate caches even when the plan fails to read its ledger', async () => {
    const { command, runner, status } = fixture();
    runner.run.mockRejectedValue(new Error('Cannot read current cursor'));
    await expect(command.run([], { dryRun: true })).rejects.toThrow(
      'Cannot read current cursor',
    );
    expect(status.invalidateInstanceAndAllWorkspacesStatus).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'retains cache invalidation after an actual run (failure=%s)',
    async (failure) => {
      const { command, runner, status } = fixture();
      if (failure) runner.run.mockRejectedValue(new Error('Command failed'));
      if (failure)
        await expect(command.run([], {})).rejects.toThrow('Command failed');
      else await command.run([], {});
      expect(
        status.invalidateInstanceAndAllWorkspacesStatus,
      ).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects contradictory scope before planning or invalidating', async () => {
    const { command, runner, status } = fixture();
    await expect(
      command.run([], {
        dryRun: true,
        workspaceId: new Set(['a']),
        startFromWorkspaceId: 'b',
      }),
    ).rejects.toThrow('Cannot use');
    expect(runner.run).not.toHaveBeenCalled();
    expect(status.invalidateInstanceAndAllWorkspacesStatus).not.toHaveBeenCalled();
  });
});
