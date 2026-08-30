import { Field, ObjectType } from '@nestjs/graphql';

import { IsIn, IsNotEmpty } from 'class-validator';
import { type SequenceBuilderConfiguration } from 'twenty-shared/types';

import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';

@ObjectType('SequenceBuilderConfiguration')
export class SequenceBuilderConfigurationDTO implements SequenceBuilderConfiguration {
  @Field(() => WidgetConfigurationType)
  @IsIn([WidgetConfigurationType.SEQUENCE_BUILDER])
  @IsNotEmpty()
  configurationType: WidgetConfigurationType.SEQUENCE_BUILDER;
}
