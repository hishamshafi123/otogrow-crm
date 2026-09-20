import { BadRequestException, Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type CountryCode } from 'libphonenumber-js';
import { FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type DeepPartial } from 'typeorm';
import { v4 } from 'uuid';

import {
  FORM_PERSON_MAPPED_FIELD_KEYS,
  type FormFieldKey,
} from 'src/engine/metadata-modules/form/constants/form-field-definition.constant';
import { type FormEntity } from 'src/engine/metadata-modules/form/entities/form.entity';
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

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FORM_SUBMISSION_ACTOR = {
  source: FieldActorSource.API,
  workspaceMemberId: null,
  name: '',
  context: {},
};

const isDuplicateEntryError = (error: unknown) =>
  error instanceof TwentyORMException &&
  error.code === TwentyORMExceptionCode.DUPLICATE_ENTRY_DETECTED;

type SanitizedFormValues = Partial<Record<FormFieldKey, string>>;

type LeadFormAnswer = { label: string; value: string };

@Injectable()
export class FormSubmissionService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly createCompanyService: CreateCompanyService,
  ) {}

  async submit(
    form: FormEntity,
    values: Record<string, string>,
    pageUrl?: string,
  ): Promise<void> {
    const sanitizedValues = this.sanitizeAndValidateValues(form, values);
    const leadCaptureUrl =
      typeof pageUrl === 'string' && isNonEmptyString(pageUrl.trim())
        ? pageUrl.trim()
        : null;
    const leadFormAnswers = this.computeLeadFormAnswers(
      form,
      sanitizedValues,
    );
    const workspaceId = form.workspaceId;
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const personRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          PersonWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const companyId = await this.findOrCreateCompanyId(
        sanitizedValues,
        workspaceId,
      );

      const personId = await this.findOrCreatePerson(
        personRepository,
        form,
        sanitizedValues,
        leadFormAnswers,
        leadCaptureUrl,
        companyId,
      );

      await this.createSubmissionNote(
        form,
        sanitizedValues,
        personId,
        workspaceId,
      );
    }, authContext);
  }

  private computeLeadFormAnswers(
    form: FormEntity,
    sanitizedValues: SanitizedFormValues,
  ): LeadFormAnswer[] {
    return form.fields
      .filter((field) => !FORM_PERSON_MAPPED_FIELD_KEYS.includes(field.key))
      .filter((field) => isNonEmptyString(sanitizedValues[field.key]))
      .map((field) => ({
        label: field.label,
        value: sanitizedValues[field.key] ?? '',
      }));
  }

  private sanitizeAndValidateValues(
    form: FormEntity,
    values: Record<string, string>,
  ): SanitizedFormValues {
    const sanitizedValues: SanitizedFormValues = {};

    for (const field of form.fields) {
      const rawValue = values[field.key];
      const value = typeof rawValue === 'string' ? rawValue.trim() : '';

      if (field.required && !isNonEmptyString(value)) {
        throw new BadRequestException(`Missing required field "${field.key}"`);
      }

      if (isNonEmptyString(value)) {
        sanitizedValues[field.key] = value;
      }
    }

    const email = sanitizedValues.email;
    const phone = sanitizedValues.phone;

    if (isNonEmptyString(email) && !EMAIL_FORMAT_REGEX.test(email)) {
      throw new BadRequestException('Invalid email address');
    }

    if (!isNonEmptyString(email) && !isNonEmptyString(phone)) {
      throw new BadRequestException(
        'An email address or a phone number is required',
      );
    }

    return sanitizedValues;
  }

  private async findOrCreateCompanyId(
    sanitizedValues: SanitizedFormValues,
    workspaceId: string,
  ): Promise<string | null> {
    const email = sanitizedValues.email;

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
            createdBySource: FORM_SUBMISSION_ACTOR.source,
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
    form: FormEntity,
    sanitizedValues: SanitizedFormValues,
    leadFormAnswers: LeadFormAnswer[],
    leadCaptureUrl: string | null,
    companyId: string | null,
  ): Promise<string> {
    const existingPerson = await this.findExistingPerson(
      personRepository,
      sanitizedValues,
    );

    if (isDefined(existingPerson)) {
      await this.restoreAndFillEmptyPersonFields(
        personRepository,
        existingPerson,
        form,
        sanitizedValues,
        leadFormAnswers,
        leadCaptureUrl,
        companyId,
      );

      return existingPerson.id;
    }

    try {
      return await this.createPerson(
        personRepository,
        form,
        sanitizedValues,
        leadFormAnswers,
        leadCaptureUrl,
        companyId,
      );
    } catch (error) {
      // A concurrent submission can win the insert race; the record we
      // wanted exists either way, so fall back to the existing person.
      if (!isDuplicateEntryError(error)) {
        throw error;
      }

      const person = await this.findExistingPerson(
        personRepository,
        sanitizedValues,
      );

      if (!isDefined(person)) {
        throw error;
      }

      return person.id;
    }
  }

  private async findExistingPerson(
    personRepository: WorkspaceRepository<PersonWorkspaceEntity>,
    sanitizedValues: SanitizedFormValues,
  ): Promise<PersonWorkspaceEntity | null> {
    if (isNonEmptyString(sanitizedValues.email)) {
      const queryBuilder = addPersonEmailFiltersToQueryBuilder({
        queryBuilder: personRepository.createQueryBuilder('person'),
        emails: [sanitizedValues.email],
      });

      const matches = await queryBuilder
        .orderBy('person.createdAt', 'ASC')
        .withDeleted()
        .getMany();

      return matches[0] ?? null;
    }

    if (isNonEmptyString(sanitizedValues.phone)) {
      return personRepository.findOne({
        where: { phones: { primaryPhoneNumber: sanitizedValues.phone } },
        withDeleted: true,
      });
    }

    return null;
  }

  private async createPerson(
    personRepository: WorkspaceRepository<PersonWorkspaceEntity>,
    form: FormEntity,
    sanitizedValues: SanitizedFormValues,
    leadFormAnswers: LeadFormAnswer[],
    leadCaptureUrl: string | null,
    companyId: string | null,
  ): Promise<string> {
    const lastPersonPosition =
      (await personRepository.maximum('position', undefined)) ?? 0;
    const personId = v4();

    await personRepository.insert({
      id: personId,
      name: {
        firstName: sanitizedValues.firstName ?? '',
        lastName: sanitizedValues.lastName ?? '',
      },
      emails: {
        primaryEmail: sanitizedValues.email?.toLowerCase() ?? '',
        additionalEmails: null,
      },
      phones: {
        primaryPhoneNumber: sanitizedValues.phone ?? '',
        // No country is known for raw form input; the DB default is ''
        primaryPhoneCountryCode: '' as CountryCode,
        primaryPhoneCallingCode: '',
        additionalPhones: null,
      },
      jobTitle: sanitizedValues.jobTitle ?? null,
      companyId,
      leadSource: 'FORM',
      leadStatus: 'NEW',
      leadFormName: form.name,
      leadFormAnswers,
      leadCaptureUrl,
      createdBy: FORM_SUBMISSION_ACTOR,
      position: lastPersonPosition + 1,
    });

    return personId;
  }

  // Populated fields are never overwritten; only empty ones are filled
  private async restoreAndFillEmptyPersonFields(
    personRepository: WorkspaceRepository<PersonWorkspaceEntity>,
    person: PersonWorkspaceEntity,
    form: FormEntity,
    sanitizedValues: SanitizedFormValues,
    leadFormAnswers: LeadFormAnswer[],
    leadCaptureUrl: string | null,
    companyId: string | null,
  ): Promise<void> {
    const partialEntity: DeepPartial<PersonWorkspaceEntity> = {};

    if (isDefined(person.deletedAt)) {
      partialEntity.deletedAt = null;
    }

    const firstName = person.name?.firstName ?? '';
    const lastName = person.name?.lastName ?? '';
    const enrichedFirstName = isNonEmptyString(firstName)
      ? firstName
      : (sanitizedValues.firstName ?? '');
    const enrichedLastName = isNonEmptyString(lastName)
      ? lastName
      : (sanitizedValues.lastName ?? '');

    if (enrichedFirstName !== firstName || enrichedLastName !== lastName) {
      partialEntity.name = {
        firstName: enrichedFirstName,
        lastName: enrichedLastName,
      };
    }

    if (
      !isNonEmptyString(person.phones?.primaryPhoneNumber) &&
      isNonEmptyString(sanitizedValues.phone)
    ) {
      partialEntity.phones = {
        primaryPhoneNumber: sanitizedValues.phone,
        primaryPhoneCountryCode:
          person.phones?.primaryPhoneCountryCode ?? ('' as CountryCode),
        primaryPhoneCallingCode: person.phones?.primaryPhoneCallingCode ?? '',
        additionalPhones: person.phones?.additionalPhones ?? null,
      };
    }

    if (
      !isNonEmptyString(person.jobTitle) &&
      isNonEmptyString(sanitizedValues.jobTitle)
    ) {
      partialEntity.jobTitle = sanitizedValues.jobTitle;
    }

    if (!isDefined(person.companyId) && isDefined(companyId)) {
      partialEntity.companyId = companyId;
    }

    if (!isDefined(person.leadSource)) {
      partialEntity.leadSource = 'FORM';
    }

    // leadStatus is owned by the lifecycle once set; intake only stamps it on
    // newly created people
    if (!isDefined(person.leadFormName)) {
      partialEntity.leadFormName = form.name;
    }

    if (!isDefined(person.leadFormAnswers)) {
      partialEntity.leadFormAnswers = leadFormAnswers;
    }

    if (!isDefined(person.leadCaptureUrl) && isDefined(leadCaptureUrl)) {
      partialEntity.leadCaptureUrl = leadCaptureUrl;
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

  private async createSubmissionNote(
    form: FormEntity,
    sanitizedValues: SanitizedFormValues,
    personId: string,
    workspaceId: string,
  ): Promise<void> {
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

    const markdown = form.fields
      .filter((field) => isNonEmptyString(sanitizedValues[field.key]))
      .map((field) => `**${field.label}:** ${sanitizedValues[field.key]}`)
      .join('\n');

    const lastNotePosition =
      (await noteRepository.maximum('position', undefined)) ?? 0;
    const noteId = v4();

    await noteRepository.insert({
      id: noteId,
      title: `Form submission: ${form.name}`,
      bodyV2: { blocknote: null, markdown },
      createdBy: FORM_SUBMISSION_ACTOR,
      position: lastNotePosition + 1,
    });

    await noteTargetRepository.insert({
      noteId,
      targetPersonId: personId,
    });
  }
}
