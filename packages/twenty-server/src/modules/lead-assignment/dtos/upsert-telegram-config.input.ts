import { Field, InputType } from '@nestjs/graphql';

import { IsBoolean, IsOptional, IsString } from 'class-validator';

@InputType()
export class UpsertTelegramConfigInput {
  // Optional on update: omitting it keeps the stored token.
  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  botToken?: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  botUsername?: string;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  isActive?: boolean;
}
