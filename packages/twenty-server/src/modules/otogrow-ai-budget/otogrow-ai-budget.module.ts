import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';
import { OtogrowAiBudgetEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-budget.entity';
import { OtogrowAiPriceEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-price.entity';
import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { OtogrowAiSpendEventEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend-event.entity';
import { OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import { OtogrowAiBudgetResolver } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.resolver';
@Module({
  imports: [
    OtogrowAccessModule,
    TypeOrmModule.forFeature([
      OtogrowAiBudgetEntity,
      OtogrowAiPriceEntity,
      OtogrowAiSpendEntity,
      OtogrowAiSpendEventEntity,
    ]),
  ],
  providers: [OtogrowAiBudgetService, OtogrowAiBudgetResolver],
  exports: [OtogrowAiBudgetService],
})
export class OtogrowAiBudgetModule {}
