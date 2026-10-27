import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type CountryCode } from 'libphonenumber-js';
import { FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { v4 } from 'uuid';

import { MetaAdsConfigEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-ads-config.entity';
import { MetaAdsConfigService } from 'src/engine/metadata-modules/meta-ads-config/meta-ads-config.service';
import {
  type MetaLead,
  MetaGraphApiService,
} from 'src/engine/metadata-modules/meta-ads-config/services/meta-graph-api.service';
import {
  TwentyORMException,
  TwentyORMExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CreateCompanyService } from 'src/modules/contact-creation-manager/services/create-company.service';
import { getDomainNameFromHandle } from 'src/modules/contact-creation-manager/utils/get-domain-name-from-handle.util';
import { addPersonEmailFiltersToQueryBuilder } from 'src/modules/match-participant/utils/add-person-email-filters-to-query-builder';
import { NoteTargetWorkspaceEntity } from 'src/modules/note/standard-objects/note-target.workspace-entity';
import { NoteWorkspaceEntity } from 'src/modules/note/standard-objects/note.workspace-entity';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { isWorkDomain, isWorkEmail } from 'src/utils/is-work-email';

const META_ADS_LEAD_ACTOR = {
  source: FieldActorSource.API,
  workspaceMemberId: null,
  name: 'Meta ads',
  context: {},
};

// Meta's leadgen webhook change payload carries the attribution ids; the lead
// answers themselves live behind the Graph API.
export type MetaLeadgenChangeValue = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  campaign_id?: string;
};

type MappedLeadValues = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  formName: string | null;
  extraFields: NonNullable<PersonWorkspaceEntity['leadFormAnswers']>;
};

const isDuplicateEntryError = (error: unknown) =>
  error instanceof TwentyORMException &&
  error.code === TwentyORMExceptionCode.DUPLICATE_ENTRY_DETECTED;

@Injectable()
export class MetaLeadIntakeService {
  private readonly logger = new Logger(MetaLeadIntakeService.name);

  constructor(
    private readonly metaAdsConfigService: MetaAdsConfigService,
    private readonly metaGraphApiService: MetaGraphApiService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly createCompanyService: CreateCompanyService,
  ) {}

  async handleLeadgen({
    workspaceId,
    config,
    value,
  }: {
    workspaceId: string;
    config: MetaAdsConfigEntity;
    value: MetaLeadgenChangeValue;
  }): Promise<void> {
    const leadgenId = value.leadgen_id;

    if (!isNonEmptyString(leadgenId)) {
      return;
    }

    const claimed = await this.metaAdsConfigService.claimLeadgenId({
      configId: config.id,
      leadgenId,
    });

    if (!claimed) {
      this.logger.log(`Leadgen ${leadgenId} already processed, skipping`);

      return;
    }

    try {
      if (
        isNonEmptyString(config.formId) &&
        isNonEmptyString(value.form_id) &&
        value.form_id !== config.formId
      ) {
        return;
      }

      const pageAccessToken =
        this.metaAdsConfigService.decryptPageAccessToken(config);
      const lead = await this.metaGraphApiService.fetchLead({
        leadgenId,
        pageAccessToken,
      });

      if (
        isNonEmptyString(config.formId) &&
        isNonEmptyString(lead.formId) &&
        lead.formId !== config.formId
      ) {
        return;
      }

      const mappedValues = this.mapFieldData(lead);

      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const personRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              PersonWorkspaceEntity,
              { shouldBypassPermissionChecks: true },
            );

          const companyId = await this.findOrCreateCompanyId(
            mappedValues,
            workspaceId,
          );
          const personId = await this.findOrCreatePerson(
            personRepository,
            mappedValues,
            companyId,
          );

          await this.createLeadNote({
            lead,
            mappedValues,
            personId,
            workspaceId,
          });
        },
        buildSystemAuthContext(workspaceId),
      );
    } catch (error) {
      // Release the claim so Meta's retry can reprocess the lead.
      await this.metaAdsConfigService.releaseLeadgenId({
        configId: config.id,
        leadgenId,
      });

      throw error;
    }
  }

  async importSheetLead(
    workspaceId: string,
    lead: MetaLead,
    previous?: { personId: string | null; answers: MetaLead },
  ): Promise<string> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const personRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            PersonWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );
        const mappedValues = this.mapFieldData(lead);
        const person = previous?.personId
          ? await personRepository.findOne({ where: { id: previous.personId } })
          : null;

        if (person && previous) {
          const before = this.mapFieldData(previous.answers);
          const partialEntity: QueryDeepPartialEntity<PersonWorkspaceEntity> =
            {};

          // Preserve CRM edits while applying changes to fields still owned by the sheet.
          if (
            person.name?.firstName === before.firstName &&
            person.name?.lastName === before.lastName
          ) {
            partialEntity.name = {
              firstName: mappedValues.firstName,
              lastName: mappedValues.lastName,
            };
          }
          if (
            person.emails.primaryEmail === (before.email?.toLowerCase() ?? '')
          ) {
            partialEntity.emails = {
              ...person.emails,
              primaryEmail: mappedValues.email?.toLowerCase() ?? '',
            };
          }
          if (person.phones.primaryPhoneNumber === (before.phone ?? '')) {
            partialEntity.phones = {
              ...person.phones,
              primaryPhoneNumber: mappedValues.phone ?? '',
            };
          }
          if (
            person.leadFormName === lead.formName &&
            JSON.stringify(person.leadFormAnswers) ===
              JSON.stringify(before.extraFields)
          ) {
            partialEntity.leadFormAnswers = mappedValues.extraFields;
          }
          if (Object.keys(partialEntity).length > 0) {
            await personRepository.updateMany(
              [{ criteria: person.id, partialEntity }],
              undefined,
              ['id'],
            );
          }
          return person.id;
        }
        // A deleted CRM contact must not be resurrected by an unchanged sheet row.
        if (previous?.personId) return previous.personId;
        const companyId = await this.findOrCreateCompanyId(
          mappedValues,
          workspaceId,
        );

        return this.findOrCreatePerson(
          personRepository,
          mappedValues,
          companyId,
        );
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  private mapFieldData(lead: MetaLead): MappedLeadValues {
    const valueByName = new Map<string, string>();

    for (const datum of lead.fieldData) {
      valueByName.set(datum.name.toLowerCase(), datum.values.join(', '));
    }

    const fullName = valueByName.get('full_name') ?? '';
    const fullNameParts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName =
      valueByName.get('first_name') ??
      (fullNameParts.length > 0 ? fullNameParts[0] : '');
    const lastName =
      valueByName.get('last_name') ??
      (fullNameParts.length > 1 ? fullNameParts.slice(1).join(' ') : '');
    const email = valueByName.get('email') ?? null;
    const phone =
      valueByName.get('phone_number') ?? valueByName.get('phone') ?? null;

    const consumedKeys = new Set([
      'full_name',
      'first_name',
      'last_name',
      'email',
      'phone_number',
      'phone',
    ]);

    return {
      firstName,
      lastName,
      email,
      phone,
      formName: lead.formName,
      extraFields: lead.fieldData
        .filter((datum) => !consumedKeys.has(datum.name.toLowerCase()))
        .map((datum) => ({
          label: datum.name,
          value: datum.values.join(', '),
        }))
        .filter((field) => isNonEmptyString(field.value)),
    };
  }

  private async findOrCreateCompanyId(
    mappedValues: MappedLeadValues,
    workspaceId: string,
  ): Promise<string | null> {
    const email = mappedValues.email;

    if (!isNonEmptyString(email) || !isWorkEmail(email)) {
      return null;
    }

    const domainName = getDomainNameFromHandle(email);

    if (!isNonEmptyString(domainName) || !isWorkDomain(domainName)) {
      return null;
    }

    const companiesMap =
      await this.createCompanyService.createOrRestoreCompanies(
        [
          {
            domainName,
            createdBySource: META_ADS_LEAD_ACTOR.source,
            createdByWorkspaceMember: null,
            createdByContext: {},
          },
        ],
        workspaceId,
      );

    return companiesMap[domainName] ?? null;
  }

  private async findOrCreatePerson(
    personRepository: WorkspaceRepository<PersonWorkspaceEntity>,
    mappedValues: MappedLeadValues,
    companyId: string | null,
  ): Promise<string> {
    const existingPerson = await this.findExistingPerson(
      personRepository,
      mappedValues,
    );

    if (isDefined(existingPerson)) {
      await this.restoreAndFillEmptyPersonFields(
        personRepository,
        existingPerson,
        mappedValues,
        companyId,
      );

      return existingPerson.id;
    }

    try {
      return await this.createPerson(personRepository, mappedValues, companyId);
    } catch (error) {
      // A concurrent delivery can win the insert race; the record we wanted
      // exists either way, so fall back to the existing person.
      if (!isDuplicateEntryError(error)) {
        throw error;
      }

      const person = await this.findExistingPerson(
        personRepository,
        mappedValues,
      );

      if (!isDefined(person)) {
        throw error;
      }

      return person.id;
    }
  }

  private async findExistingPerson(
    personRepository: WorkspaceRepository<PersonWorkspaceEntity>,
    mappedValues: MappedLeadValues,
  ): Promise<PersonWorkspaceEntity | null> {
    if (isNonEmptyString(mappedValues.email)) {
      const queryBuilder = addPersonEmailFiltersToQueryBuilder({
        queryBuilder: personRepository.createQueryBuilder('person'),
        emails: [mappedValues.email],
      });

      const matches = await queryBuilder
        .orderBy('person.createdAt', 'ASC')
        .withDeleted()
        .getMany();

      return matches[0] ?? null;
    }

    if (isNonEmptyString(mappedValues.phone)) {
      return personRepository.findOne({
        where: { phones: { primaryPhoneNumber: mappedValues.phone } },
        withDeleted: true,
      });
    }

    return null;
  }

  private async createPerson(
    personRepository: WorkspaceRepository<PersonWorkspaceEntity>,
    mappedValues: MappedLeadValues,
    companyId: string | null,
  ): Promise<string> {
    const lastPersonPosition =
      (await personRepository.maximum('position', undefined)) ?? 0;
    const personId = v4();

    await personRepository.insert({
      id: personId,
      name: {
        firstName: mappedValues.firstName,
        lastName: mappedValues.lastName,
      },
      emails: {
        primaryEmail: mappedValues.email?.toLowerCase() ?? '',
        additionalEmails: null,
      },
      phones: {
        primaryPhoneNumber: mappedValues.phone ?? '',
        // No country is known for raw lead input; the DB default is ''
        primaryPhoneCountryCode: '' as CountryCode,
        primaryPhoneCallingCode: '',
        additionalPhones: null,
      },
      companyId,
      leadSource: 'META_AD',
      leadStatus: 'NEW',
      leadFormName: mappedValues.formName,
      leadFormAnswers: mappedValues.extraFields,
      createdBy: META_ADS_LEAD_ACTOR,
      position: lastPersonPosition + 1,
    });

    return personId;
  }

  // Populated fields are never overwritten; only empty ones are filled
  private async restoreAndFillEmptyPersonFields(
    personRepository: WorkspaceRepository<PersonWorkspaceEntity>,
    person: PersonWorkspaceEntity,
    mappedValues: MappedLeadValues,
    companyId: string | null,
  ): Promise<void> {
    const partialEntity: QueryDeepPartialEntity<PersonWorkspaceEntity> = {};

    if (isDefined(person.deletedAt)) {
      partialEntity.deletedAt = null;
    }

    const firstName = person.name?.firstName ?? '';
    const lastName = person.name?.lastName ?? '';

    if (!isNonEmptyString(firstName) || !isNonEmptyString(lastName)) {
      partialEntity.name = {
        firstName: isNonEmptyString(firstName)
          ? firstName
          : mappedValues.firstName,
        lastName: isNonEmptyString(lastName) ? lastName : mappedValues.lastName,
      };
    }

    if (
      !isNonEmptyString(person.phones?.primaryPhoneNumber) &&
      isNonEmptyString(mappedValues.phone)
    ) {
      partialEntity.phones = {
        primaryPhoneNumber: mappedValues.phone,
        primaryPhoneCountryCode:
          person.phones?.primaryPhoneCountryCode ?? ('' as CountryCode),
        primaryPhoneCallingCode: person.phones?.primaryPhoneCallingCode ?? '',
        additionalPhones: person.phones?.additionalPhones ?? null,
      };
    }

    if (!isDefined(person.companyId) && isDefined(companyId)) {
      partialEntity.companyId = companyId;
    }

    if (!isDefined(person.leadSource)) {
      partialEntity.leadSource = 'META_AD';
    }

    // leadStatus is owned by the lifecycle once set; intake only stamps it on
    // newly created people
    if (!isDefined(person.leadFormName)) {
      partialEntity.leadFormName = mappedValues.formName;
    }

    if (!isDefined(person.leadFormAnswers)) {
      partialEntity.leadFormAnswers = mappedValues.extraFields;
    }

    if (Object.keys(partialEntity).length === 0) {
      return;
    }

    await personRepository.updateMany(
      [{ criteria: person.id, partialEntity }],
      undefined,
      ['id'],
    );
  }

  private async createLeadNote({
    lead,
    mappedValues,
    personId,
    workspaceId,
  }: {
    lead: MetaLead;
    mappedValues: MappedLeadValues;
    personId: string;
    workspaceId: string;
  }): Promise<void> {
    const noteRepository = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      NoteWorkspaceEntity,
      { shouldBypassPermissionChecks: true },
    );
    const noteTargetRepository =
      await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        NoteTargetWorkspaceEntity,
        { shouldBypassPermissionChecks: true },
      );

    const attributionLines = [
      isDefined(lead.campaignId) || isDefined(lead.campaignName)
        ? `**Campaign:** ${lead.campaignName ?? lead.campaignId} (id: ${lead.campaignId ?? 'unknown'})`
        : null,
      isDefined(lead.adsetId) || isDefined(lead.adsetName)
        ? `**Ad set:** ${lead.adsetName ?? lead.adsetId} (id: ${lead.adsetId ?? 'unknown'})`
        : null,
      isDefined(lead.adId) || isDefined(lead.adName)
        ? `**Ad:** ${lead.adName ?? lead.adId} (id: ${lead.adId ?? 'unknown'})`
        : null,
      isDefined(lead.formId) || isDefined(lead.formName)
        ? `**Form:** ${lead.formName ?? lead.formId} (id: ${lead.formId ?? 'unknown'})`
        : null,
      `**Leadgen id:** ${lead.id}`,
    ].filter(isDefined);

    const markdown = [
      ...attributionLines,
      ...mappedValues.extraFields.map(
        (field) => `**${field.label}:** ${field.value}`,
      ),
    ].join('\n');

    const lastNotePosition =
      (await noteRepository.maximum('position', undefined)) ?? 0;
    const noteId = v4();

    await noteRepository.insert({
      id: noteId,
      title: `Meta ad lead${isDefined(lead.formName) ? `: ${lead.formName}` : ''}`,
      bodyV2: { blocknote: null, markdown },
      createdBy: META_ADS_LEAD_ACTOR,
      position: lastNotePosition + 1,
    });

    await noteTargetRepository.insert({
      noteId,
      targetPersonId: personId,
    });
  }
}
