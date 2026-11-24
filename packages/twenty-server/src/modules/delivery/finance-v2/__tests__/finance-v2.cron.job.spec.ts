jest.mock('src/modules/delivery/finance-v2/finance-v2-pdf.util', () => ({
  renderFinanceV2PdfBuffer: jest.fn(),
}));
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { type Repository } from 'typeorm';
import { type ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryFinanceV2CronJob } from 'src/modules/delivery/finance-v2/finance-v2.cron.job';
import { type DeliveryFinanceV2Service } from 'src/modules/delivery/finance-v2/finance-v2.service';

describe('DeliveryFinanceV2CronJob', () => {
  it('runs all active workspaces, reports per-workspace exceptions, and rethrows summary error for Sentry alerting', async () => {
    const workspaceRepository = {
      find: jest.fn(async () => [
        { id: 'ws-ok-1', activationStatus: WorkspaceActivationStatus.ACTIVE },
        { id: 'ws-fail', activationStatus: WorkspaceActivationStatus.ACTIVE },
        { id: 'ws-ok-2', activationStatus: WorkspaceActivationStatus.ACTIVE },
      ]),
    } as unknown as Repository<WorkspaceEntity>;

    const boom = new Error('DB connection lost');
    const financeV2 = {
      runDueAutomationForWorkspace: jest.fn(async (workspaceId: string) => {
        if (workspaceId === 'ws-fail') {
          throw boom;
        }
        return {
          recurringExpensesPosted: 1,
          payrollAdjustmentsPosted: 0,
          invoicesCreated: 0,
        };
      }),
    } as unknown as DeliveryFinanceV2Service;

    const exceptionHandlerService = {
      captureExceptions: jest.fn(),
    } as unknown as ExceptionHandlerService;

    const job = new DeliveryFinanceV2CronJob(
      workspaceRepository,
      financeV2,
      exceptionHandlerService,
    );

    await expect(job.handle()).rejects.toThrow(
      'Finance V2 automation failed for 1 workspace(s): ws-fail',
    );
    expect(financeV2.runDueAutomationForWorkspace).toHaveBeenCalledTimes(3);
    expect(exceptionHandlerService.captureExceptions).toHaveBeenCalledWith(
      [boom],
      { workspace: { id: 'ws-fail' } },
    );
  });

  it('resolves cleanly when all active workspaces succeed', async () => {
    const workspaceRepository = {
      find: jest.fn(async () => [
        { id: 'ws-ok-1', activationStatus: WorkspaceActivationStatus.ACTIVE },
      ]),
    } as unknown as Repository<WorkspaceEntity>;
    const financeV2 = {
      runDueAutomationForWorkspace: jest.fn(async () => ({
        recurringExpensesPosted: 0,
        payrollAdjustmentsPosted: 0,
        invoicesCreated: 0,
      })),
    } as unknown as DeliveryFinanceV2Service;
    const exceptionHandlerService = {
      captureExceptions: jest.fn(),
    } as unknown as ExceptionHandlerService;

    const job = new DeliveryFinanceV2CronJob(
      workspaceRepository,
      financeV2,
      exceptionHandlerService,
    );

    await expect(job.handle()).resolves.toBeUndefined();
    expect(exceptionHandlerService.captureExceptions).not.toHaveBeenCalled();
  });
});
