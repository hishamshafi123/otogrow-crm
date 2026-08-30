import { Field, ObjectType } from '@nestjs/graphql';

import { IsNotEmpty, IsString } from 'class-validator';

import { PortalAccessDTO } from 'src/modules/portal/dtos/portal-access.dto';

@ObjectType('PortalAccessToken')
export class PortalAccessTokenDTO extends PortalAccessDTO {
  @IsString()
  @IsNotEmpty()
  @Field()
  token: string;
}
