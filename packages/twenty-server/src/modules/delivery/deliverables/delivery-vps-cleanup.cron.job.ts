import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Repository } from 'typeorm';
import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryVpsCleanupService } from 'src/modules/delivery/deliverables/delivery-vps-cleanup.service';

export const DELIVERY_VPS_CLEANUP_CRON_JOB_NAME =
  'DeliveryVpsVideoCleanupCronJob';
// Runs hourly at minute 17 to purge local VPS videos 24+ hours after confirmed Google Drive sync.
export const DELIVERY_VPS_CLEANUP_CRON_PATTERN = '17 * * * *';

@Processor(MessageQueue.cronQueue)
export class DeliveryVpsCleanupCronJob {
  private readonly logger = new Logger(DeliveryVpsCleanupCronJob.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly cleanupService: DeliveryVpsCleanupService,
    private readonly exceptionHandlerService: ExceptionHandlerService,
  ) {}

  @Process(DELIVERY_VPS_CLEANUP_CRON_JOB_NAME)
  @SentryCronMonitor(
    DELIVERY_VPS_CLEANUP_CRON_JOB_NAME,
    DELIVERY_VPS_CLEANUP_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const activeWorkspaces = await this.workspaceRepository.find({
      where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
    });

    const failedWorkspaceIds: string[] = [];

    for (const workspace of activeWorkspaces) {
      try {
        const result =
          await this.cleanupService.purgeEligibleVpsVideosForWorkspace(
            workspace.id,
          );
        if (result.purgedDeliverables > 0 || result.purgedVariations > 0) {
          this.logger.log(
            `VPS cleanup for workspace ${workspace.id}: purged ${result.purgedDeliverables} deliverables, ${result.purgedVariations} variations (${(result.reclaimedBytes / (1024 * 1024)).toFixed(1)} MB freed).`,
          );
        }
      } catch (error) {
        failedWorkspaceIds.push(workspace.id);
        this.exceptionHandlerService.captureExceptions([error], {
          workspace: { id: workspace.id },
        });
      }
    }

    if (failedWorkspaceIds.length > 0) {
      throw new Error(
        `VPS video cleanup failed for ${failedWorkspaceIds.length} workspace(s): ${failedWorkspaceIds.join(', ')}`,
      );
    }
  }
}
