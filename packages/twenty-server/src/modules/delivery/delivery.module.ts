import { DeliveryCreativeLearningService } from 'src/modules/delivery/creative/learning/delivery-creative-learning.service';
import { DeliveryInboxService } from 'src/modules/delivery/inbox/delivery-inbox.service';
import { DeliveryInboxGmailService } from 'src/modules/delivery/inbox/gmail/delivery-inbox-gmail.service';
import { DeliveryInboxReplyService } from 'src/modules/delivery/inbox/delivery-inbox-reply.service';
import { DeliveryInboxResolver } from 'src/modules/delivery/inbox/delivery-inbox.resolver';
import { DeliveryInboxBindingEntity } from 'src/modules/delivery/inbox/entities/delivery-inbox-binding.entity';
import { DeliveryInboxConsentEntity } from 'src/modules/delivery/inbox/entities/delivery-inbox-consent.entity';
import { DeliveryInboxReplyEntity } from 'src/modules/delivery/inbox/entities/delivery-inbox-reply.entity';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';
import { DeliveryCreativeLearningResolver } from 'src/modules/delivery/creative/learning/delivery-creative-learning.resolver';
import { DeliveryCreativeAdLinkEntity } from 'src/modules/delivery/creative/learning/entities/delivery-creative-ad-link.entity';
import { DeliveryCreativeAdVersionEntity } from 'src/modules/delivery/creative/learning/entities/delivery-creative-ad-version.entity';
import { DeliveryCreativeLearningEventEntity } from 'src/modules/delivery/creative/learning/entities/delivery-creative-learning-event.entity';
import { DeliveryCreativeLessonEntity } from 'src/modules/delivery/creative/learning/entities/delivery-creative-lesson.entity';
import { DeliveryVideoQaReportEntity } from 'src/modules/delivery/creative/video-qa/entities/delivery-video-qa-report.entity';
import { DeliveryVideoQaService } from 'src/modules/delivery/creative/video-qa/delivery-video-qa.service';
import { DeliveryVideoQaAdapter } from 'src/modules/delivery/creative/video-qa/delivery-video-qa.adapter';
import { DeliveryVideoQaResolver } from 'src/modules/delivery/creative/video-qa/delivery-video-qa.resolver';
import { DeliveryVideoQaFilesController } from 'src/modules/delivery/creative/video-qa/delivery-video-qa-files.controller';
import { DeliveryFathomConnectionEntity } from 'src/modules/delivery/knowledge/fathom/entities/delivery-fathom-connection.entity';
import { DeliveryFathomService } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.service';
import { DeliveryFathomAdapter } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.adapter';
import { DeliveryFathomResolver } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.resolver';
import { DeliveryAdvertisingReviewEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-review.entity';
import { DeliveryAdvertisingDraftRunEntity } from 'src/modules/delivery/advertising/drafts/entities/delivery-advertising-draft-run.entity';
import { DeliveryAdvertisingDraftService } from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.service';
import { DeliveryAdvertisingDraftResolver } from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.resolver';
import { DeliveryAdvertisingDraftJob } from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.job';
import { DeliveryAdvertisingActionEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-action.entity';
import { DeliveryAdvertisingObservationEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-observation.entity';
import { DeliveryAdvertisingEventEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-event.entity';
import { DeliveryAdvertisingSourcesService } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.service';
import { DeliveryAdvertisingWorkbenchService } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.service';
import { DeliveryAdvertisingWorkbenchResolver } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.resolver';
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
import { DeliveryFinanceExportProfileEntity } from 'src/modules/delivery/finance/export/entities/delivery-finance-export-profile.entity';
import { DeliveryFinanceExportBatchEntity } from 'src/modules/delivery/finance/export/entities/delivery-finance-export-batch.entity';
import { DeliveryFinanceExportService } from 'src/modules/delivery/finance/export/delivery-finance-export.service';
import { DeliveryFinanceExportResolver } from 'src/modules/delivery/finance/export/delivery-finance-export.resolver';
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
import { DeliveryFounderService } from 'src/modules/delivery/founder/delivery-founder.service';
import { DeliveryFounderResolver } from 'src/modules/delivery/founder/delivery-founder.resolver';
import { DeliveryFounderEscalationService } from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.service';
import { DeliveryFounderEscalationResolver } from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.resolver';
import { DeliveryFounderEscalationRuleEntity } from 'src/modules/delivery/founder/escalation/entities/delivery-founder-escalation-rule.entity';
import { DeliveryFounderEscalationEpisodeEntity } from 'src/modules/delivery/founder/escalation/entities/delivery-founder-escalation-episode.entity';
import { DeliveryFounderEscalationNoticeEntity } from 'src/modules/delivery/founder/escalation/entities/delivery-founder-escalation-notice.entity';
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
import { DeliveryCapacityReadService } from 'src/modules/delivery/capacity/read/delivery-capacity-read.service';
import { DeliveryCapacityReadResolver } from 'src/modules/delivery/capacity/read/delivery-capacity-read.resolver';
import { DeliveryKnowledgeSourceEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-source.entity';
import { DeliveryKnowledgeVersionEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-version.entity';
import { DeliveryKnowledgeService } from 'src/modules/delivery/knowledge/delivery-knowledge.service';
import { DeliveryKnowledgeReadsService } from 'src/modules/delivery/knowledge/reads/delivery-knowledge-reads.service';
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
import { DeliveryAtlasConnectionEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-connection.entity';
import { DeliveryAtlasCredentialEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-credential.entity';
import { DeliveryAtlasJobEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-job.entity';
import { DeliveryAtlasAdapter } from 'src/modules/delivery/creative/atlas/delivery-atlas.adapter';
import { DeliveryAtlasConnectionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-connection.service';
import { DeliveryAtlasProductionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-production.service';
import { DeliveryAtlasService } from 'src/modules/delivery/creative/atlas/delivery-atlas.service';
import { DeliveryAtlasResolver } from 'src/modules/delivery/creative/atlas/delivery-atlas.resolver';
import { DeliveryClientSetupEntity } from 'src/modules/delivery/onboarding/entities/delivery-client-setup.entity';
import { DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import { DeliveryClientSetupService } from 'src/modules/delivery/onboarding/delivery-client-setup.service';
import { DeliveryClientSetupResolver } from 'src/modules/delivery/onboarding/delivery-client-setup.resolver';
import { DeliveryGoogleMediaAdapter } from 'src/modules/delivery/creative/delivery-google-media.adapter';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { DeliveryCreativeReviewService } from 'src/modules/delivery/creative/review/delivery-creative-review.service';
import { DeliveryReviewsService } from 'src/modules/delivery/reviews/delivery-reviews.service';
import { DeliveryTasksService } from 'src/modules/delivery/tasks/delivery-tasks.service';
import { DeliveryTasksResolver } from 'src/modules/delivery/tasks/delivery-tasks.resolver';
import { DeliveryReviewsResolver } from 'src/modules/delivery/reviews/delivery-reviews.resolver';
import { DeliveryReviewAssignmentEntity } from 'src/modules/delivery/reviews/entities/delivery-review-assignment.entity';
import { DeliveryReviewAssignmentEventEntity } from 'src/modules/delivery/reviews/entities/delivery-review-assignment-event.entity';
import { DeliveryCreativeReviewResolver } from 'src/modules/delivery/creative/review/delivery-creative-review.resolver';
import { DeliveryCreativeFeedbackEntity } from 'src/modules/delivery/creative/review/entities/delivery-creative-feedback.entity';
import { DeliveryCreativeFeedbackEventEntity } from 'src/modules/delivery/creative/review/entities/delivery-creative-feedback-event.entity';
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
import { DeliveryAssistantsService } from 'src/modules/delivery/agents/reads/delivery-assistants.service';
import { DeliveryAssistantsResolver } from 'src/modules/delivery/agents/reads/delivery-assistants.resolver';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAgentRunEntity } from 'src/modules/delivery/entities/delivery-agent-run.entity';
import { DeliverySeoResultsModule } from 'src/modules/delivery/seo-results/seo-results.module';
import { DeliveryCreativeReadsService } from 'src/modules/delivery/creative/reads/delivery-creative-reads.service';
import { DeliveryCreativeReadsResolver } from 'src/modules/delivery/creative/reads/delivery-creative-reads.resolver';

@Module({
  imports: [
    MessagingSendManagerModule,
    DeliverySeoResultsModule,
    OtogrowAiBudgetModule,
    OtogrowAccessModule,
    OtogrowActivityModule,
    SecretEncryptionModule,
    ThrottlerModule,
    AiModelsModule,
    LeadAssignmentModule,
    PermissionsModule,
    TypeOrmModule.forFeature([
      DeliveryInboxBindingEntity,
      DeliveryInboxConsentEntity,
      DeliveryInboxReplyEntity,
      DeliveryCreativeAdLinkEntity,
      DeliveryCreativeAdVersionEntity,
      DeliveryCreativeLearningEventEntity,
      DeliveryCreativeLessonEntity,
      DeliveryVideoQaReportEntity,
      DeliveryFathomConnectionEntity,
      DeliveryAdvertisingDraftRunEntity,
      DeliveryAdvertisingReviewEntity,
      DeliveryAdvertisingActionEntity,
      DeliveryAdvertisingObservationEntity,
      DeliveryAdvertisingEventEntity,
      DeliveryClientSetupEntity,
      DeliveryAtlasConnectionEntity,
      DeliveryAtlasCredentialEntity,
      DeliveryAtlasJobEntity,
      DeliveryReviewAssignmentEntity,
      DeliveryReviewAssignmentEventEntity,
      DeliveryCreativeFeedbackEntity,
      DeliveryCreativeFeedbackEventEntity,
      DeliveryFounderEscalationRuleEntity,
      DeliveryFounderEscalationEpisodeEntity,
      DeliveryFounderEscalationNoticeEntity,
      DeliveryFinanceExportProfileEntity,
      DeliveryFinanceExportBatchEntity,
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
    DeliveryVideoQaFilesController,
    DeliveryCreativeFilesController,
    DeliveryClientsController,
    DeliveryClientFilesController,
  ],
  providers: [
    DeliveryInboxService,
    DeliveryInboxGmailService,
    DeliveryInboxReplyService,
    DeliveryInboxResolver,
    DeliveryCreativeLearningService,
    DeliveryCreativeLearningResolver,
    DeliveryVideoQaService,
    DeliveryVideoQaAdapter,
    DeliveryVideoQaResolver,
    DeliveryFathomService,
    DeliveryFathomAdapter,
    DeliveryFathomResolver,
    DeliveryCreativeReadsService,
    DeliveryCreativeReadsResolver,
    DeliveryAdvertisingDraftService,
    DeliveryAdvertisingDraftResolver,
    DeliveryAdvertisingDraftJob,
    DeliveryAdvertisingSourcesService,
    DeliveryAdvertisingWorkbenchService,
    DeliveryAdvertisingWorkbenchResolver,
    DeliveryClientSetupSourceService,
    DeliveryClientSetupService,
    DeliveryClientSetupResolver,
    DeliveryAssistantsService,
    DeliveryAssistantsResolver,
    DeliveryAtlasAdapter,
    DeliveryAtlasConnectionService,
    DeliveryAtlasProductionService,
    DeliveryAtlasService,
    DeliveryAtlasResolver,
    DeliveryTasksService,
    DeliveryTasksResolver,
    DeliveryReviewsService,
    DeliveryReviewsResolver,
    DeliveryCreativeReviewService,
    DeliveryCreativeReviewResolver,
    DeliveryFounderEscalationService,
    DeliveryFounderEscalationResolver,
    DeliveryFounderService,
    DeliveryFounderResolver,
    DeliveryFinanceExportService,
    DeliveryFinanceExportResolver,
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
    DeliveryCapacityReadService,
    DeliveryCapacityReadResolver,
    DeliveryKnowledgeService,
    DeliveryKnowledgeReadsService,
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
    DeliveryInboxReplyService,
    DeliveryAtlasService,
    DeliveryAgentService,
    DeliveryMediaService,
    DeliveryOperationsService,
    DeliveryReminderService,
  ],
})
export class DeliveryModule {}
