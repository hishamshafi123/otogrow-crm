import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';
import { OtogrowActivityEventEntity } from 'src/modules/otogrow-activity/entities/otogrow-activity-event.entity';
import { OtogrowActivityResolver } from 'src/modules/otogrow-activity/otogrow-activity.resolver';
import { OtogrowActivityService } from 'src/modules/otogrow-activity/otogrow-activity.service';
import { AiModelsModule } from 'src/engine/metadata-modules/ai/ai-models/ai-models.module';
import { OtogrowAiBudgetModule } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.module';
import { OtogrowActivityAnalysisRunEntity } from 'src/modules/otogrow-activity/analysis/entities/otogrow-activity-analysis-run.entity';
import { OtogrowActivityAnalysisService } from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.service';
import { OtogrowActivityAnalysisResolver } from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.resolver';
import { OtogrowActivityAnalysisJob } from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.job';
import { OtogrowActivityCurrentWorkService } from 'src/modules/otogrow-activity/analysis/current-work/otogrow-activity-current-work.service';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';

@Module({
  imports: [
    OtogrowAccessModule,
    AiModelsModule,
    OtogrowAiBudgetModule,
    WorkspaceCacheModule,
    TypeOrmModule.forFeature([
      OtogrowActivityEventEntity,
      OtogrowActivityAnalysisRunEntity,
    ]),
  ],
  providers: [
    OtogrowActivityService,
    OtogrowActivityResolver,
    OtogrowActivityAnalysisService,
    OtogrowActivityAnalysisResolver,
    OtogrowActivityAnalysisJob,
    OtogrowActivityCurrentWorkService,
  ],
})
export class OtogrowActivityModule {}
