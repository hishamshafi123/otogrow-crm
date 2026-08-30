import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { LessThanOrEqual, Repository } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  SEND_SEQUENCE_STEP_JOB,
  SEQUENCE_SCHEDULER_BATCH_SIZE,
  SEQUENCE_SCHEDULER_CRON_JOB_NAME,
  SEQUENCE_SCHEDULER_CRON_PATTERN,
  SEQUENCE_SEND_RETRY_LIMIT,
} from 'src/modules/sequences/constants/sequence.constant';
import { SequenceEnrollmentWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-enrollment.workspace-entity';
import { type SendSequenceStepJobData } from 'src/modules/sequences/types/send-sequence-step-job-data.type';

@Processor(MessageQueue.cronQueue)
export class SequenceSchedulerCronJob {
  private readonly logger = new Logger(SequenceSchedulerCronJob.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectMessageQueue(MessageQueue.emailQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly exceptionHandlerService: ExceptionHandlerService,
  ) {}

  @Process(SEQUENCE_SCHEDULER_CRON_JOB_NAME)
  @SentryCronMonitor(
    SEQUENCE_SCHEDULER_CRON_JOB_NAME,
    SEQUENCE_SCHEDULER_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const activeWorkspaces = await this.workspaceRepository.find({
      where: {
        activationStatus: WorkspaceActivationStatus.ACTIVE,
      },
    });

    for (const activeWorkspace of activeWorkspaces) {
      try {
        await this.scheduleDueEnrollments(activeWorkspace.id);
      } catch (error) {
        this.exceptionHandlerService.captureExceptions([error], {
          workspace: { id: activeWorkspace.id },
        });
      }
    }
  }

  // Safety net for worker restarts and crashed delayed jobs: anything due is
  // (re-)enqueued; the send job itself no-ops when nextSendAt is in the
  // future, so duplicates are harmless.
  private async scheduleDueEnrollments(workspaceId: string): Promise<void> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const enrollmentRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            SequenceEnrollmentWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const dueEnrollments = await enrollmentRepository.find({
          where: {
            status: 'ACTIVE',
            nextSendAt: LessThanOrEqual(new Date()),
          },
          select: { id: true },
          take: SEQUENCE_SCHEDULER_BATCH_SIZE,
        });

        for (const enrollment of dueEnrollments) {
          await this.messageQueueService.add<SendSequenceStepJobData>(
            SEND_SEQUENCE_STEP_JOB,
            { workspaceId, enrollmentId: enrollment.id },
            { retryLimit: SEQUENCE_SEND_RETRY_LIMIT },
          );
        }

        if (dueEnrollments.length > 0) {
          this.logger.log(
            `Scheduled ${dueEnrollments.length} due sequence enrollment(s) for workspace ${workspaceId}`,
          );
        }
      },
      buildSystemAuthContext(workspaceId),
    );
  }
}
