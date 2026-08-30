import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { IsNull, type Repository } from 'typeorm';

import { PortalAccessEntity } from 'src/modules/portal/entities/portal-access.entity';
import { generatePortalToken } from 'src/modules/portal/utils/generate-portal-token.util';
import { hashPortalToken } from 'src/modules/portal/utils/hash-portal-token.util';

export type PortalAccessWithToken = {
  portalAccess: PortalAccessEntity;
  token: string;
};

@Injectable()
export class PortalAccessService {
  constructor(
    @InjectRepository(PortalAccessEntity)
    private readonly portalAccessRepository: Repository<PortalAccessEntity>,
  ) {}

  isActive(portalAccess: PortalAccessEntity): boolean {
    if (isDefined(portalAccess.revokedAt)) {
      return false;
    }

    if (
      isDefined(portalAccess.expiresAt) &&
      portalAccess.expiresAt.getTime() <= Date.now()
    ) {
      return false;
    }

    return true;
  }

  async findByCompany(
    workspaceId: string,
    companyId: string,
  ): Promise<PortalAccessEntity | null> {
    return this.portalAccessRepository.findOne({
      where: { workspaceId, companyId },
      order: { createdAt: 'DESC' },
    });
  }

  async findActiveByToken(token: string): Promise<PortalAccessEntity | null> {
    const portalAccess = await this.portalAccessRepository.findOne({
      where: { tokenHash: hashPortalToken(token), revokedAt: IsNull() },
    });

    if (!isDefined(portalAccess) || !this.isActive(portalAccess)) {
      return null;
    }

    return portalAccess;
  }

  async generate({
    workspaceId,
    companyId,
  }: {
    workspaceId: string;
    companyId: string;
  }): Promise<PortalAccessWithToken> {
    const existing = await this.findByCompany(workspaceId, companyId);

    if (isDefined(existing) && this.isActive(existing)) {
      throw new BadRequestException(
        'Portal access already exists for this company; regenerate it instead',
      );
    }

    const token = generatePortalToken();

    const portalAccess = await this.portalAccessRepository.save(
      this.portalAccessRepository.create({
        workspaceId,
        companyId,
        tokenHash: hashPortalToken(token),
        expiresAt: null,
        revokedAt: null,
      }),
    );

    return { portalAccess, token };
  }

  async revoke({
    id,
    workspaceId,
  }: {
    id: string;
    workspaceId: string;
  }): Promise<PortalAccessEntity> {
    const portalAccess = await this.portalAccessRepository.findOne({
      where: { id, workspaceId },
    });

    if (!isDefined(portalAccess)) {
      throw new NotFoundException('Portal access not found');
    }

    if (!isDefined(portalAccess.revokedAt)) {
      portalAccess.revokedAt = new Date();
      await this.portalAccessRepository.save(portalAccess);
    }

    return portalAccess;
  }

  async regenerate({
    id,
    workspaceId,
  }: {
    id: string;
    workspaceId: string;
  }): Promise<PortalAccessWithToken> {
    const portalAccess = await this.portalAccessRepository.findOne({
      where: { id, workspaceId },
    });

    if (!isDefined(portalAccess)) {
      throw new NotFoundException('Portal access not found');
    }

    if (!isDefined(portalAccess.revokedAt)) {
      portalAccess.revokedAt = new Date();
      await this.portalAccessRepository.save(portalAccess);
    }

    const token = generatePortalToken();

    const successor = await this.portalAccessRepository.save(
      this.portalAccessRepository.create({
        workspaceId,
        companyId: portalAccess.companyId,
        tokenHash: hashPortalToken(token),
        expiresAt: null,
        revokedAt: null,
      }),
    );

    return { portalAccess: successor, token };
  }
}
