import { DeliveryFinanceReconciliationService } from 'src/modules/delivery/finance/delivery-finance-reconciliation.service';
import { DeliveryFinanceReconciliationResolver } from 'src/modules/delivery/finance/delivery-finance-reconciliation.resolver';
import { DeliveryFinanceSourceEntity } from 'src/modules/delivery/finance/entities/delivery-finance-source.entity';
import { DeliveryFinanceAiClaimEntity } from 'src/modules/delivery/finance/entities/delivery-finance-ai-claim.entity';
import { DeliveryFinancePeriodEntity } from 'src/modules/delivery/finance/entities/delivery-finance-period.entity';
import { DeliveryFinancePeriodService } from 'src/modules/delivery/finance/delivery-finance-period.service';
import { DeliveryFinancePeriodResolver } from 'src/modules/delivery/finance/delivery-finance-period.resolver';
import { DeliveryFinanceForecastAnchorEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-anchor.entity';
import { DeliveryFinanceForecastItemEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-item.entity';
import { DeliveryFinanceForecastRealizationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-realization.entity';
import { DeliveryFinanceForecastService } from 'src/modules/delivery/finance/delivery-finance-forecast.service';
import { DeliveryFinanceForecastResolver } from 'src/modules/delivery/finance/delivery-finance-forecast.resolver';
import { DeliveryFinanceAiCostService } from 'src/modules/delivery/finance/delivery-finance-ai-cost.service';
import { DeliveryFinanceAiCostResolver } from 'src/modules/delivery/finance/delivery-finance-ai-cost.resolver';
import { DeliveryFinanceSettlementEntity } from 'src/modules/delivery/finance/entities/delivery-finance-settlement.entity';
import { DeliveryFinanceCashMatchEntity } from 'src/modules/delivery/finance/entities/delivery-finance-cash-match.entity';
import { DeliveryFinanceService } from 'src/modules/delivery/finance/delivery-finance.service';
import { DeliveryFinanceResolver } from 'src/modules/delivery/finance/delivery-finance.resolver';
import { DeliveryFinancePlanEntity } from 'src/modules/delivery/finance/entities/delivery-finance-plan.entity';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';
import { DeliveryFinanceAllocationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-allocation.entity';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import { DeliveryReadinessService } from 'src/modules/delivery/readiness/delivery-readiness.service';
import { DeliveryReadinessResolver } from 'src/modules/delivery/readiness/delivery-readiness.resolver';
import { DeliveryAvailabilityEntity } from 'src/modules/delivery/capacity/entities/delivery-availability.entity';
import { DeliveryHandoffEntity } from 'src/modules/delivery/handoffs/entities/delivery-handoff.entity';
import { DeliveryHandoffSourceService } from 'src/modules/delivery/handoffs/delivery-handoff-source.service';
import { DeliveryHandoffsService } from 'src/modules/delivery/handoffs/delivery-handoffs.service';
import { DeliveryHandoffsResolver } from 'src/modules/delivery/handoffs/delivery-handoffs.resolver';
import { DeliveryRevisionEntity } from 'src/modules/delivery/revisions/entities/delivery-revision.entity';
import { DeliveryRevisionsService } from 'src/modules/delivery/revisions/delivery-revisions.service';
import { DeliveryRevisionsResolver } from 'src/modules/delivery/revisions/delivery-revisions.resolver';
import { DeliveryCapacityService } from 'src/modules/delivery/capacity/delivery-capacity.service';
import { DeliveryCapacityResolver } from 'src/modules/delivery/capacity/delivery-capacity.resolver';
import { DeliveryKnowledgeSourceEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-source.entity';
import { DeliveryKnowledgeVersionEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-version.entity';
import { DeliveryKnowledgeService } from 'src/modules/delivery/knowledge/delivery-knowledge.service';
import { DeliveryKnowledgeResolver } from 'src/modules/delivery/knowledge/delivery-knowledge.resolver';
import { DeliveryChatService } from 'src/modules/delivery/chat/delivery-chat.service';
import { DeliveryChatResolver } from 'src/modules/delivery/chat/delivery-chat.resolver';
import { DeliveryChatMessageEntity } from 'src/modules/delivery/chat/entities/delivery-chat-message.entity';
import { DeliveryMetaReportEntity } from 'src/modules/delivery/advertising/entities/delivery-meta-report.entity';
import { DeliveryBatchesResolver } from 'src/modules/delivery/batches/delivery-batches.resolver';
import { DeliveryBatchesService } from 'src/modules/delivery/batches/delivery-batches.service';
import { DeliveryBatchEventEntity } from 'src/modules/delivery/batches/entities/delivery-batch-event.entity';
import { DeliveryBatchItemEntity } from 'src/modules/delivery/batches/entities/delivery-batch-item.entity';
import { DeliveryBatchEntity } from 'src/modules/delivery/batches/entities/delivery-batch.entity';
import { DeliveryWorkflowArchiveEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-archive.entity';
import { DeliveryWorkflowVersionEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-version.entity';
import { DeliveryWorkflowTemplateEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-template.entity';
import { DeliveryWorkflowsResolver } from 'src/modules/delivery/workflows/delivery-workflows.resolver';
import { DeliveryWorkflowsService } from 'src/modules/delivery/workflows/delivery-workflows.service';
import { DeliveryCommitmentEventEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-event.entity';
import { DeliveryCommitmentAllocationEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-allocation.entity';
import { DeliveryCommitmentLineEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-line.entity';
import { DeliveryCommitmentPeriodEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-period.entity';
import { DeliveryCommitmentsResolver } from 'src/modules/delivery/commitments/delivery-commitments.resolver';
import { DeliveryCommitmentsService } from 'src/modules/delivery/commitments/delivery-commitments.service';
import { OtogrowAiBudgetModule } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.module';
import { DeliveryReminderOutboxEntity } from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import { DeliveryReminderService } from 'src/modules/delivery/operations/delivery-reminder.service';
import { DeliveryMetaService } from 'src/modules/delivery/advertising/delivery-meta.service';
import { DeliveryMetaAdapter } from 'src/modules/delivery/advertising/delivery-meta.adapter';
import { SecretEncryptionModule } from 'src/engine/core-modules/secret-encryption/secret-encryption.module';
import { DeliveryBusinessService } from 'src/modules/delivery/business/delivery-business.service';
import { DeliveryClientFilesController } from 'src/modules/delivery/clients/delivery-client-files.controller';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { DeliveryClientsController } from 'src/modules/delivery/clients/delivery-clients.controller';
import { DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';
import { DeliveryOperationsService } from 'src/modules/delivery/operations/delivery-operations.service';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { LeadAssignmentModule } from 'src/modules/lead-assignment/lead-assignment.module';
import { DeliveryAssemblyAdapter } from 'src/modules/delivery/creative/delivery-assembly.adapter';
import { DeliveryMediaService } from 'src/modules/delivery/creative/delivery-media.service';
import { DeliveryGoogleMediaAdapter } from 'src/modules/delivery/creative/delivery-google-media.adapter';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { DeliveryCreativeFilesController } from 'src/modules/delivery/creative/delivery-creative-files.controller';
import { Module } from '@nestjs/common';
import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';
import { OtogrowActivityModule } from 'src/modules/otogrow-activity/otogrow-activity.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryResolver } from 'src/modules/delivery/delivery.resolver';
import { AiModelsModule } from 'src/engine/metadata-modules/ai/ai-models/ai-models.module';
import { DeliveryAgentService } from 'src/modules/delivery/agents/delivery-agent.service';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAgentRunEntity } from 'src/modules/delivery/entities/delivery-agent-run.entity';

@Module({
  imports: [
    OtogrowAiBudgetModule,
    OtogrowAccessModule,
    OtogrowActivityModule,
    SecretEncryptionModule,
    ThrottlerModule,
    AiModelsModule,
    LeadAssignmentModule,
    PermissionsModule,
    TypeOrmModule.forFeature([
      DeliveryFinanceForecastAnchorEntity,
      DeliveryFinanceForecastItemEntity,
      DeliveryFinanceForecastRealizationEntity,
      DeliveryFinancePeriodEntity,
      DeliveryFinanceAiClaimEntity,
      DeliveryFinanceSourceEntity,
      DeliveryFinanceSettlementEntity,
      DeliveryFinanceCashMatchEntity,
      DeliveryFinancePlanEntity,
      DeliveryFinanceEntryEntity,
      DeliveryFinanceAllocationEntity,
      DeliveryFinanceEventEntity,
      DeliveryHandoffEntity,
      DeliveryRevisionEntity,
      DeliveryAvailabilityEntity,
      DeliveryKnowledgeSourceEntity,
      DeliveryKnowledgeVersionEntity,
      DeliveryChatMessageEntity,
      DeliveryMetaReportEntity,
      DeliveryBatchEntity,
      DeliveryBatchItemEntity,
      DeliveryBatchEventEntity,
      DeliveryWorkflowArchiveEntity,
      DeliveryWorkflowVersionEntity,
      DeliveryWorkflowTemplateEntity,
      DeliveryCommitmentEventEntity,
      DeliveryCommitmentAllocationEntity,
      DeliveryCommitmentLineEntity,
      DeliveryCommitmentPeriodEntity,
      DeliveryOperationsEntity,
      DeliveryReminderOutboxEntity,
      DeliveryMemberEntity,
      DeliveryProjectEntity,
      DeliveryTaskEntity,
      DeliveryAgentEntity,
      DeliveryAgentRunEntity,
    ]),
  ],
  controllers: [
    DeliveryCreativeFilesController,
    DeliveryClientsController,
    DeliveryClientFilesController,
  ],
  providers: [
    DeliveryFinanceForecastService,
    DeliveryFinanceForecastResolver,
    DeliveryFinancePeriodService,
    DeliveryFinancePeriodResolver,
    DeliveryFinanceAiCostService,
    DeliveryFinanceAiCostResolver,
    DeliveryFinanceReconciliationService,
    DeliveryFinanceReconciliationResolver,
    DeliveryFinanceService,
    DeliveryFinanceResolver,
    DeliveryReadinessService,
    DeliveryReadinessResolver,
    DeliveryHandoffSourceService,
    DeliveryHandoffsService,
    DeliveryHandoffsResolver,
    DeliveryRevisionsService,
    DeliveryRevisionsResolver,
    DeliveryCapacityService,
    DeliveryCapacityResolver,
    DeliveryKnowledgeService,
    DeliveryKnowledgeResolver,
    DeliveryChatService,
    DeliveryChatResolver,
    DeliveryBatchesService,
    DeliveryBatchesResolver,
    DeliveryWorkflowsResolver,
    DeliveryWorkflowsService,
    DeliveryCommitmentsService,
    DeliveryCommitmentsResolver,
    DeliveryMetaService,
    DeliveryMetaAdapter,
    DeliveryBusinessService,
    DeliveryClientsService,
    DeliveryOperationsService,
    DeliveryReminderService,
    DeliveryService,
    DeliveryResolver,
    DeliveryAgentService,
    DeliveryCreativeService,
    DeliveryMediaService,
    DeliveryGoogleMediaAdapter,
    DeliveryAssemblyAdapter,
  ],
  exports: [
    DeliveryAgentService,
    DeliveryMediaService,
    DeliveryOperationsService,
    DeliveryReminderService,
  ],
})
export class DeliveryModule {}
