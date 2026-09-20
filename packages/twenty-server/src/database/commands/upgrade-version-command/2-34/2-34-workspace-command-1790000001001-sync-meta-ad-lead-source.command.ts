import { Command } from 'nest-commander';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { TwentyStandardApplicationService } from 'src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service';

@RegisteredWorkspaceCommand('2.34.0', 1790000001001)
@Command({
  name: 'upgrade:2-34:sync-meta-ad-lead-source',
  description:
    'Re-sync the twenty-standard application so existing workspaces get the META_AD option on the person.leadSource select field',
})
export class SyncMetaAdLeadSourceCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly twentyStandardApplicationService: TwentyStandardApplicationService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
  }: RunOnWorkspaceArgs): Promise<void> {
    await this.twentyStandardApplicationService.synchronizeTwentyStandardApplicationOrThrow(
      { workspaceId },
    );

    this.logger.log(
      `Synced the META_AD leadSource option for workspace ${workspaceId}`,
    );
  }
}
