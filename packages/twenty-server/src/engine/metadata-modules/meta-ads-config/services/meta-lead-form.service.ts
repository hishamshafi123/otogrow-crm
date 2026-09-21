import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';

import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { type CreateMetaLeadFormInput } from 'src/engine/metadata-modules/meta-ads-config/dtos/create-meta-lead-form.input';
import { MetaLeadFormEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-lead-form.entity';
import { MetaSheetLeadEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-sheet-lead.entity';
import { MetaLeadIntakeService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-intake.service';
import { MetaSheetReaderService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-sheet-reader.service';
import { parseMetaSheetUrl } from 'src/engine/metadata-modules/meta-ads-config/utils/parse-meta-sheet.util';
import { LeadAssignmentService } from 'src/modules/lead-assignment/services/lead-assignment.service';

@Injectable()
export class MetaLeadFormService {
  private readonly logger = new Logger(MetaLeadFormService.name);
  constructor(
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- polling uses explicit workspace IDs
    @InjectRepository(MetaLeadFormEntity)
    private readonly formRepository: Repository<MetaLeadFormEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- polling uses explicit workspace IDs
    @InjectRepository(MetaSheetLeadEntity)
    private readonly leadRepository: Repository<MetaSheetLeadEntity>,
    private readonly secretEncryptionService: SecretEncryptionService,
    private readonly metaSheetReaderService: MetaSheetReaderService,
    private readonly metaLeadIntakeService: MetaLeadIntakeService,
    private readonly leadAssignmentService: LeadAssignmentService,
  ) {}

  findAll(workspaceId: string) {
    return this.formRepository.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
  }

  async findLeads(workspaceId: string, formId: string, offset: number) {
    await this.findForm(workspaceId, formId);
    const leads = await this.leadRepository.find({
      where: { workspaceId, formId, skipped: false },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: offset,
      take: 50,
    });

    return leads.map((lead) => {
      const values = new Map(
        lead.answers.fieldData.map((field) => [
          field.name,
          field.values.join(', '),
        ]),
      );

      return {
        id: lead.id,
        leadId: lead.leadId,
        personId: lead.personId,
        name:
          values.get('full_name') ||
          [values.get('first_name'), values.get('last_name')]
            .filter(isDefined)
            .join(' '),
        email: values.get('email') ?? '',
        phone: values.get('phone_number') ?? values.get('phone') ?? '',
        answers: lead.answers.fieldData.map((field) => ({
          label: field.name,
          value: field.values.join(', '),
        })),
        createdAt: lead.createdAt,
      };
    });
  }

  async create(workspaceId: string, input: CreateMetaLeadFormInput) {
    let source: ReturnType<typeof parseMetaSheetUrl>;

    try {
      source = parseMetaSheetUrl(input.sheetUrl);
    } catch {
      throw new BadRequestException('Enter a valid Google Sheets link.');
    }
    const name = input.name.trim();

    if (!name) throw new BadRequestException('Enter a form name.');
    const rows = await this.metaSheetReaderService.read(
      { ...source, name },
      input.serviceAccountJson,
    );

    const form = await this.formRepository.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(MetaLeadFormEntity);
        const existing = await repository.findOne({
          where: { workspaceId, ...source },
        });

        if (existing)
          throw new BadRequestException('This sheet tab is already connected.');
        const created = await repository.save({
          workspaceId,
          ...source,
          name,
          credentials: this.secretEncryptionService.encryptVersioned(
            input.serviceAccountJson as PlaintextString,
            { workspaceId },
          ),
        });

        if (!input.importExisting && rows.length > 0) {
          await manager.getRepository(MetaSheetLeadEntity).save(
            rows.map((lead) => ({
              workspaceId,
              formId: created.id,
              leadId: lead.id,
              answers: lead,
              skipped: true,
            })),
            { chunk: 200 },
          );
        }
        return created;
      },
    );

    return form;
  }

  async setActive(workspaceId: string, id: string, isActive: boolean) {
    await this.findForm(workspaceId, id);
    await this.formRepository.update({ workspaceId, id }, { isActive });
    return this.findForm(workspaceId, id);
  }

  async sync(workspaceId: string, formId: string) {
    await this.findForm(workspaceId, formId);
    await this.formRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(MetaLeadFormEntity);
      // A row lock prevents two workers or a manual sync importing the same form concurrently.
      const form = await repository
        .createQueryBuilder('form')
        .addSelect('form.credentials')
        .where('form.id = :formId AND form.workspaceId = :workspaceId', {
          formId,
          workspaceId,
        })
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getOne();

      if (!form || !form.isActive) return;
      try {
        const credentials =
          this.secretEncryptionService.decryptVersionedOrThrow(
            form.credentials,
            { workspaceId },
          );
        const rows = await this.metaSheetReaderService.read(form, credentials);
        const leads = manager.getRepository(MetaSheetLeadEntity);

        for (const row of rows) {
          const previous = await leads.findOne({
            where: { workspaceId, formId, leadId: row.id },
          });

          if (previous?.skipped) continue;
          const changed =
            !previous ||
            JSON.stringify(previous.answers) !== JSON.stringify(row);
          const personId =
            changed || !previous?.personId
              ? await this.metaLeadIntakeService.importSheetLead(
                  workspaceId,
                  row,
                  previous ?? undefined,
                )
              : previous.personId;

          if (
            !previous ||
            JSON.stringify(previous.answers) !== JSON.stringify(row)
          ) {
            await leads.save({
              ...previous,
              workspaceId,
              formId,
              leadId: row.id,
              personId,
              answers: row,
              skipped: false,
            });
          }
          // Retry unassigned leads on subsequent polls when a setter becomes available.
          await this.leadAssignmentService.assignPersonToSetter(
            workspaceId,
            personId,
          );
        }
        await repository.update(
          { id: formId, workspaceId },
          { lastSyncedAt: new Date(), lastError: null },
        );
      } catch (error) {
        this.logger.warn(
          `Meta lead form ${formId} failed to sync (${error instanceof Error ? error.name : 'unknown error'}).`,
        );
        const lastError =
          error instanceof BadRequestException
            ? error.message
            : 'Sync failed. Check server logs and retry.';

        await repository.update({ id: formId, workspaceId }, { lastError });
      }
    });
    return this.findForm(workspaceId, formId);
  }

  async syncActiveForms() {
    const forms = await this.formRepository.find({
      where: { isActive: true },
      select: { id: true, workspaceId: true },
    });

    for (const form of forms) {
      try {
        await this.sync(form.workspaceId, form.id);
      } catch {
        this.logger.warn(
          `Could not sync Meta lead form ${form.id}; continuing with other forms.`,
        );
      }
    }
  }

  private async findForm(workspaceId: string, id: string) {
    const form = await this.formRepository.findOne({
      where: { workspaceId, id },
    });

    if (!form) throw new NotFoundException('Meta lead form not found.');
    return form;
  }
}
