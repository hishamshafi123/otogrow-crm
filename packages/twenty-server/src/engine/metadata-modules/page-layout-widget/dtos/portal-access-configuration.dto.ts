import { Field, ObjectType } from '@nestjs/graphql';

import { IsIn, IsNotEmpty } from 'class-validator';
import { type PortalAccessConfiguration } from 'twenty-shared/types';

import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';

@ObjectType('PortalAccessConfiguration')
export class PortalAccessConfigurationDTO implements PortalAccessConfiguration {
  @Field(() => WidgetConfigurationType)
  @IsIn([WidgetConfigurationType.PORTAL_ACCESS])
  @IsNotEmpty()
  configurationType: WidgetConfigurationType.PORTAL_ACCESS;
}
