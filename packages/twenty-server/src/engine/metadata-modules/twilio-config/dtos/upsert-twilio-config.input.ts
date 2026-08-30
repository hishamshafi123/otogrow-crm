import { Field, InputType } from '@nestjs/graphql';

import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

@InputType()
export class UpsertTwilioConfigInput {
  @IsString()
  @IsNotEmpty()
  @Field()
  accountSid: string;

  // Optional on update: omitting it keeps the stored token.
  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  authToken?: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  whatsappSenderNumber?: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  smsNumber?: string;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  isActive?: boolean;
}
