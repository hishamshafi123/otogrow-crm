import { type FormEntity } from 'src/engine/metadata-modules/form/entities/form.entity';
import { FormSubmissionService } from 'src/engine/metadata-modules/form/form-submission.service';
import { NoteTargetWorkspaceEntity } from 'src/modules/note/standard-objects/note-target.workspace-entity';
import { NoteWorkspaceEntity } from 'src/modules/note/standard-objects/note.workspace-entity';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

const WORKSPACE_ID = 'workspace-id';

const FORM = {
  id: 'form-id',
  workspaceId: WORKSPACE_ID,
  name: 'Contact us',
  publicId: '1c9c6b40-1234-4f56-8abc-0123456789ab',
  fields: [
    { key: 'firstName', label: 'First name', type: 'text', required: true },
    { key: 'lastName', label: 'Last name', type: 'text', required: false },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'phone', label: 'Phone', type: 'phone', required: false },
    { key: 'jobTitle', label: 'Job title', type: 'text', required: false },
    { key: 'company', label: 'Company', type: 'text', required: false },
    { key: 'message', label: 'Message', type: 'textarea', required: false },
  ],
  successMessage: null,
  isActive: true,
} as unknown as FormEntity;

const VALUES = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@gmail.com',
  company: 'Acme',
  message: 'Interested in a demo',
};

const PAGE_URL = 'https://example.com/landing';

const buildQueryBuilderStub = (matches: object[]) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  withDeleted: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(matches),
});

describe('FormSubmissionService', () => {
  const personRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    maximum: jest.fn().mockResolvedValue(0),
    insert: jest.fn().mockResolvedValue(undefined),
    updateMany: jest.fn().mockResolvedValue(undefined),
  };
  const noteRepository = {
    maximum: jest.fn().mockResolvedValue(0),
    insert: jest.fn().mockResolvedValue(undefined),
  };
  const noteTargetRepository = {
    insert: jest.fn().mockResolvedValue(undefined),
  };

  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => Promise<void>) =>
      callback(),
    ),
    getRepository: jest.fn((_: string, entity: unknown) => {
      if (entity === PersonWorkspaceEntity) return personRepository;
      if (entity === NoteWorkspaceEntity) return noteRepository;
      if (entity === NoteTargetWorkspaceEntity) return noteTargetRepository;
      throw new Error('Unexpected repository');
    }),
  };

  const createCompanyService = {
    createOrRestoreCompanies: jest.fn().mockResolvedValue({}),
  };

  const buildService = () =>
    new FormSubmissionService(
      globalWorkspaceOrmManager as never,
      createCompanyService as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();

    personRepository.createQueryBuilder.mockReturnValue(
      buildQueryBuilderStub([]),
    );
  });

  it('should create a person with leadStatus NEW and the form details on submission', async () => {
    const service = buildService();

    await service.submit(FORM, VALUES, PAGE_URL);

    expect(personRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: { firstName: 'Jane', lastName: 'Doe' },
        emails: {
          primaryEmail: 'jane@gmail.com',
          additionalEmails: null,
        },
        leadSource: 'FORM',
        leadStatus: 'NEW',
        leadFormName: 'Contact us',
        leadFormAnswers: [
          { label: 'Company', value: 'Acme' },
          { label: 'Message', value: 'Interested in a demo' },
        ],
        leadCaptureUrl: PAGE_URL,
      }),
    );
    expect(noteTargetRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: expect.any(String) }),
    );
  });

  it('should store a null capture URL when no pageUrl is submitted', async () => {
    const service = buildService();

    await service.submit(FORM, VALUES);

    expect(personRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        leadCaptureUrl: null,
      }),
    );
  });

  it('should not change the lead status of an existing person on re-submission', async () => {
    const existingPerson = {
      id: 'existing-person-id',
      name: { firstName: 'Jane', lastName: 'Doe' },
      emails: { primaryEmail: 'jane@gmail.com' },
      phones: { primaryPhoneNumber: '' },
      jobTitle: null,
      companyId: null,
      leadSource: 'FORM',
      leadStatus: 'WARM',
      leadFormName: 'Contact us',
      leadFormAnswers: [{ label: 'Company', value: 'Acme' }],
      leadCaptureUrl: 'https://example.com/old',
      deletedAt: null,
    };

    personRepository.createQueryBuilder.mockReturnValue(
      buildQueryBuilderStub([existingPerson]),
    );
    const service = buildService();

    await service.submit(FORM, VALUES, PAGE_URL);

    expect(personRepository.insert).not.toHaveBeenCalled();
    expect(personRepository.updateMany).not.toHaveBeenCalled();
    expect(noteTargetRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ targetPersonId: 'existing-person-id' }),
    );
  });

  it('should fill empty lifecycle fields on an existing person without touching leadStatus', async () => {
    const existingPerson = {
      id: 'existing-person-id',
      name: { firstName: 'Jane', lastName: 'Doe' },
      emails: { primaryEmail: 'jane@gmail.com' },
      phones: { primaryPhoneNumber: '' },
      jobTitle: null,
      companyId: null,
      leadSource: 'FORM',
      leadStatus: 'CONVERTED',
      leadFormName: null,
      leadFormAnswers: null,
      leadCaptureUrl: null,
      deletedAt: null,
    };

    personRepository.createQueryBuilder.mockReturnValue(
      buildQueryBuilderStub([existingPerson]),
    );
    const service = buildService();

    await service.submit(FORM, VALUES, PAGE_URL);

    expect(personRepository.insert).not.toHaveBeenCalled();
    expect(personRepository.updateMany).toHaveBeenCalledWith(
      [
        {
          criteria: 'existing-person-id',
          partialEntity: {
            leadFormName: 'Contact us',
            leadFormAnswers: [
              { label: 'Company', value: 'Acme' },
              { label: 'Message', value: 'Interested in a demo' },
            ],
            leadCaptureUrl: PAGE_URL,
          },
        },
      ],
      undefined,
      ['id'],
    );
    const partialEntity = personRepository.updateMany.mock.calls[0][0][0]
      .partialEntity as Record<string, unknown>;

    expect(partialEntity).not.toHaveProperty('leadStatus');
  });
});
