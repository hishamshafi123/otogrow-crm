import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { randomBytes } from 'crypto';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';

import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { type UpsertMetaAdsConfigInput } from 'src/engine/metadata-modules/meta-ads-config/dtos/upsert-meta-ads-config.input';
import { MetaAdsConfigEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-ads-config.entity';
import { MetaAdsConfigEncryptionService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-ads-config-encryption.service';

@Injectable()
export class MetaAdsConfigService {
  constructor(
    @InjectRepository(MetaAdsConfigEntity)
    private readonly metaAdsConfigRepository: Repository<MetaAdsConfigEntity>,
    private readonly metaAdsConfigEncryptionService: MetaAdsConfigEncryptionService,
  ) {}

  async findByWorkspaceId(
    workspaceId: string,
  ): Promise<MetaAdsConfigEntity | null> {
    return this.metaAdsConfigRepository.findOne({ where: { workspaceId } });
  }

  async upsert(
    input: UpsertMetaAdsConfigInput,
    workspaceId: string,
  ): Promise<MetaAdsConfigEntity> {
    const existing = await this.findByWorkspaceId(workspaceId);

    if (
      !isDefined(existing) &&
      (!isNonEmptyString(input.appSecret) ||
        !isNonEmptyString(input.pageAccessToken))
    ) {
      throw new BadRequestException(
        'An app secret and a page access token are required to configure Meta ads',
      );
    }

    const appSecret = isNonEmptyString(input.appSecret)
      ? this.metaAdsConfigEncryptionService.encrypt({
          plaintext: input.appSecret as PlaintextString,
          workspaceId,
        })
      : existing?.appSecret;
    const pageAccessToken = isNonEmptyString(input.pageAccessToken)
      ? this.metaAdsConfigEncryptionService.encrypt({
          plaintext: input.pageAccessToken as PlaintextString,
          workspaceId,
        })
      : existing?.pageAccessToken;

    if (!isDefined(appSecret) || !isDefined(pageAccessToken)) {
      throw new BadRequestException(
        'An app secret and a page access token are required to configure Meta ads',
      );
    }

    const verifyToken = isNonEmptyString(input.verifyToken)
      ? input.verifyToken
      : (existing?.verifyToken ?? randomBytes(16).toString('hex'));

    if (isDefined(existing)) {
      return this.metaAdsConfigRepository.save({
        ...existing,
        appId: input.appId,
        appSecret,
        pageId: input.pageId,
        pageAccessToken,
        verifyToken,
        formId: input.formId !== undefined ? input.formId : existing.formId,
        isActive: input.isActive ?? existing.isActive,
      });
    }

    return this.metaAdsConfigRepository.save({
      appId: input.appId,
      appSecret,
      pageId: input.pageId,
      pageAccessToken,
      verifyToken,
      formId: input.formId ?? null,
      processedLeadgenIds: [],
      isActive: input.isActive ?? true,
      workspaceId,
    });
  }

  async delete(workspaceId: string): Promise<MetaAdsConfigEntity> {
    const existing = await this.findByWorkspaceId(workspaceId);

    if (!isDefined(existing)) {
      throw new NotFoundException('Meta ads is not configured');
    }

    return this.metaAdsConfigRepository.softRemove(existing);
  }

  decryptAppSecret(config: MetaAdsConfigEntity): PlaintextString {
    return this.metaAdsConfigEncryptionService.decrypt({
      ciphertext: config.appSecret,
      workspaceId: config.workspaceId,
    });
  }

  decryptPageAccessToken(config: MetaAdsConfigEntity): PlaintextString {
    return this.metaAdsConfigEncryptionService.decrypt({
      ciphertext: config.pageAccessToken,
      workspaceId: config.workspaceId,
    });
  }

  // Atomic claim so a redelivered leadgen notification (Meta retries on
  // non-200) is processed exactly once even under concurrent delivery.
  async claimLeadgenId({
    configId,
    leadgenId,
  }: {
    configId: string;
    leadgenId: string;
  }): Promise<boolean> {
    // TypeORM unwraps UPDATE ... RETURNING to [rows, rowCount]
    const [rows]: [{ id: string }[]] = await this.metaAdsConfigRepository.query(
      `UPDATE "core"."metaAdsConfig"
       SET "processedLeadgenIds" = "processedLeadgenIds" || to_jsonb($2::text)
       WHERE "id" = $1 AND NOT ("processedLeadgenIds" ? $2)
       RETURNING "id"`,
      [configId, leadgenId],
    );

    return rows.length > 0;
  }

  async releaseLeadgenId({
    configId,
    leadgenId,
  }: {
    configId: string;
    leadgenId: string;
  }): Promise<void> {
    await this.metaAdsConfigRepository.query(
      `UPDATE "core"."metaAdsConfig"
       SET "processedLeadgenIds" = "processedLeadgenIds" - $2
       WHERE "id" = $1`,
      [configId, leadgenId],
    );
  }
}
