import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitFormBodyDto {
  @IsObject()
  values: Record<string, string>;

  // Honeypot: invisible to humans, filled by bots
  @IsOptional()
  @IsString()
  _hp?: string;

  // Untrusted free text: stored verbatim as person.leadCaptureUrl
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;
}
