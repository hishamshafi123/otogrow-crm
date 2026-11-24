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
import { DeliveryFinanceV2Service } from 'src/modules/delivery/finance-v2/finance-v2.service';

export const DELIVERY_FINANCE_V2_CRON_JOB_NAME =
  'DeliveryFinanceV2AutomationCronJob';
// Runs daily at 01:05 UTC to post due recurring expenses, payday payroll adjustments,
// and generate recurring invoice PDFs inside the OS (never auto-emailing clients).
export const DELIVERY_FINANCE_V2_CRON_PATTERN = '5 1 * * *';
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

@Processor(MessageQueue.cronQueue)
export class DeliveryFinanceV2CronJob {
  private readonly logger = new Logger(DeliveryFinanceV2CronJob.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly financeV2: DeliveryFinanceV2Service,
    private readonly exceptionHandlerService: ExceptionHandlerService,
  ) {}

  @Process(DELIVERY_FINANCE_V2_CRON_JOB_NAME)
  @SentryCronMonitor(
    DELIVERY_FINANCE_V2_CRON_JOB_NAME,
    DELIVERY_FINANCE_V2_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const activeWorkspaces = await this.workspaceRepository.find({
      where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
    });

    const failedWorkspaceIds: string[] = [];

    for (const workspace of activeWorkspaces) {
      try {
        const result = await this.financeV2.runDueAutomationForWorkspace(
          workspace.id,
          SYSTEM_ACTOR_ID,
        );
        if (
          result.recurringExpensesPosted > 0 ||
          result.payrollAdjustmentsPosted > 0 ||
          result.invoicesCreated > 0
        ) {
          this.logger.log(
            `Finance V2 automation for workspace ${workspace.id}: ${result.recurringExpensesPosted} expenses, ${result.payrollAdjustmentsPosted} payroll adjustments, ${result.invoicesCreated} invoices.`,
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
        `Finance V2 automation failed for ${failedWorkspaceIds.length} workspace(s): ${failedWorkspaceIds.join(', ')}`,
      );
    }
  }
}
