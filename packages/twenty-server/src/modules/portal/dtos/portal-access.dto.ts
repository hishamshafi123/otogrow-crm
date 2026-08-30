import { Field, HideField, ObjectType } from '@nestjs/graphql';

import { IsBoolean, IsDateString, IsNotEmpty, IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

// The token hash never leaves the server; the raw token is only exposed once
// by the generate/regenerate mutations through PortalAccessTokenDTO.
@ObjectType('PortalAccess')
export class PortalAccessDTO {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  id: string;

  @IsUUID()
  @Field(() => UUIDScalarType)
  companyId: string;

  @IsDateString()
  @Field()
  createdAt: Date;

  @IsDateString()
  @Field(() => Date, { nullable: true })
  expiresAt: Date | null;

  @IsDateString()
  @Field(() => Date, { nullable: true })
  revokedAt: Date | null;

  @IsBoolean()
  @Field()
  isActive: boolean;

  @HideField()
  workspaceId: string;

  @HideField()
  tokenHash: string;
}
