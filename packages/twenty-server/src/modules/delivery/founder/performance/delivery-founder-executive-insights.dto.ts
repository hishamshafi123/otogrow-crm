import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryFounderExecutiveInsightsInput')
export class DeliveryFounderExecutiveInsightsInput {
  @Field() month: string;
  @Field() timezone: string;
  @Field(() => String, { nullable: true }) currency?: string | null;
  @Field(() => Int, { nullable: true }) months?: number | null;
}

@ObjectType('DeliveryFounderTrendPoint')
export class DeliveryFounderTrendPointDTO {
  @Field() month: string;
  @Field() revenueMicros: string;
  @Field() costMicros: string;
  @Field() resultMicros: string;
  @Field(() => Int) postedEntryCount: number;
  @Field(() => Int) draftEntryCount: number;
}

@ObjectType('DeliveryFounderCurrencyTrend')
export class DeliveryFounderCurrencyTrendDTO {
  @Field() currency: string;
  @Field(() => [DeliveryFounderTrendPointDTO])
  points: DeliveryFounderTrendPointDTO[];
}

@ObjectType('DeliveryFounderCurrencyAmount')
export class DeliveryFounderCurrencyAmountDTO {
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field(() => Int) dealCount: number;
}

@ObjectType('DeliveryFounderFunnelStage')
export class DeliveryFounderFunnelStageDTO {
  @Field() stage: string;
  @Field(() => Int) dealCount: number;
  @Field(() => [DeliveryFounderCurrencyAmountDTO])
  valuesByCurrency: DeliveryFounderCurrencyAmountDTO[];
}

@ObjectType('DeliveryFounderExpiringQuote')
export class DeliveryFounderExpiringQuoteDTO {
  @Field(() => ID) id: string;
  @Field() quoteNumber: string;
  @Field() status: string;
  @Field() validUntil: string;
  @Field(() => Int) daysRemaining: number;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field(() => String, { nullable: true }) totalAmountMicros: string | null;
}

@ObjectType('DeliveryFounderSalesFunnel')
export class DeliveryFounderSalesFunnelDTO {
  @Field() restricted: boolean;
  @Field(() => Int) totalOpenDeals: number;
  @Field(() => Int) wonDealsCount: number;
  @Field(() => [DeliveryFounderCurrencyAmountDTO])
  openValuesByCurrency: DeliveryFounderCurrencyAmountDTO[];
  @Field(() => [DeliveryFounderFunnelStageDTO])
  stages: DeliveryFounderFunnelStageDTO[];
  @Field(() => Int) expiringQuotesCount: number;
  @Field(() => [DeliveryFounderExpiringQuoteDTO])
  expiringQuotes: DeliveryFounderExpiringQuoteDTO[];
}

@ObjectType('DeliveryFounderRenewalAlert')
export class DeliveryFounderRenewalAlertDTO {
  @Field(() => ID) periodId: string;
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field() label: string;
  @Field() billing: string;
  @Field() endDateExclusive: string;
  @Field(() => Int) daysRemaining: number;
  @Field() state: string;
}

@ObjectType('DeliveryFounderInboxSlaItem')
export class DeliveryFounderInboxSlaItemDTO {
  @Field(() => ID) replyId: string;
  @Field(() => ID) conversationId: string;
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field() status: string;
  @Field(() => Int) ageHours: number;
  @Field(() => String, { nullable: true }) problem: string | null;
}

@ObjectType('DeliveryFounderInboxSla')
export class DeliveryFounderInboxSlaDTO {
  @Field(() => Int) connectedThreadsCount: number;
  @Field(() => Int) pendingRepliesCount: number;
  @Field(() => Int) failedRepliesCount: number;
  @Field(() => Int, { nullable: true }) oldestPendingHours: number | null;
  @Field(() => [DeliveryFounderInboxSlaItemDTO])
  items: DeliveryFounderInboxSlaItemDTO[];
}

@ObjectType('DeliveryFounderExecutiveInsights')
export class DeliveryFounderExecutiveInsightsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field() month: string;
  @Field() timezone: string;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field() canReadFinance: boolean;
  @Field(() => [String]) trendMonths: string[];
  @Field(() => [DeliveryFounderCurrencyTrendDTO])
  trends: DeliveryFounderCurrencyTrendDTO[];
  @Field(() => DeliveryFounderSalesFunnelDTO)
  salesFunnel: DeliveryFounderSalesFunnelDTO;
  @Field(() => [DeliveryFounderRenewalAlertDTO])
  renewals: DeliveryFounderRenewalAlertDTO[];
  @Field(() => DeliveryFounderInboxSlaDTO)
  inboxSla: DeliveryFounderInboxSlaDTO;
  @Field(() => [String]) warnings: string[];
}
