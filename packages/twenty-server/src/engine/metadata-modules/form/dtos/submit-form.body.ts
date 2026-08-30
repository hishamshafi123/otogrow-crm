import { IsObject, IsOptional, IsString } from 'class-validator';

export class SubmitFormBodyDto {
  @IsObject()
  values: Record<string, string>;

  // Honeypot: invisible to humans, filled by bots
  @IsOptional()
  @IsString()
  _hp?: string;
}
