import { Field, ObjectType } from '@nestjs/graphql';

import { IsIn, IsNotEmpty } from 'class-validator';
import { type QuoteBuilderConfiguration } from 'twenty-shared/types';

import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';

@ObjectType('QuoteBuilderConfiguration')
export class QuoteBuilderConfigurationDTO implements QuoteBuilderConfiguration {
  @Field(() => WidgetConfigurationType)
  @IsIn([WidgetConfigurationType.QUOTE_BUILDER])
  @IsNotEmpty()
  configurationType: WidgetConfigurationType.QUOTE_BUILDER;
}
