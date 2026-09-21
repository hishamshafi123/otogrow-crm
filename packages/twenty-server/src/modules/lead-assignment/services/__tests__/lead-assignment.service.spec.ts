import { QueryFailedError } from 'typeorm';

import { LeadAssignmentService } from 'src/modules/lead-assignment/services/lead-assignment.service';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { TaskTargetWorkspaceEntity } from 'src/modules/task/standard-objects/task-target.workspace-entity';
import { TaskWorkspaceEntity } from 'src/modules/task/standard-objects/task.workspace-entity';

const WORKSPACE_ID = 'workspace-id';
const PERSON_ID = 'person-id';

const PERSON = {
  id: PERSON_ID,
  name: { firstName: 'Jane', lastName: 'Doe' },
  leadSource: 'FORM',
  phones: { primaryPhoneNumber: '+15551234567' },
};

const SETTER = {
  id: 'setter-profile-1',
  workspaceMemberId: 'workspace-member-1',
  telegramChatId: 'chat-1',
  isSetter: true,
  activeDays: '1,2,3,4,5,6,7',
  activeStartHour: 0,
  activeEndHour: 23,
  dailyLeadCap: null,
  lastAssignedAt: null,
};

const buildService = ({
  existingAssignment = null,
  setters = [SETTER],
  person = PERSON as object | null,
  insertError = null as unknown,
}: {
  existingAssignment?: object | null;
  setters?: object[];
  person?: object | null;
  insertError?: unknown;
} = {}) => {
  const notificationUpdate = jest.fn().mockResolvedValue(undefined);
  const setterAssignmentRepository = {
    findOne: jest.fn().mockResolvedValue(existingAssignment),
    count: jest.fn().mockResolvedValue(0),
    update: notificationUpdate,
    manager: {
      transaction: jest.fn(
        async (operation: (manager: unknown) => Promise<boolean>) =>
          operation({
            getRepository: () => ({
              findOne: jest
                .fn()
                .mockResolvedValue({ notificationSentAt: null }),
              update: notificationUpdate,
            }),
          }),
      ),
    },
    insert: insertError
      ? jest.fn().mockRejectedValue(insertError)
      : jest.fn().mockResolvedValue(undefined),
  };

  const personRepository = {
    findOne: jest.fn().mockResolvedValue(person),
  };
  const taskRepository = { insert: jest.fn().mockResolvedValue(undefined) };
  const taskTargetRepository = {
    insert: jest.fn().mockResolvedValue(undefined),
  };

  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (fn: () => Promise<void>) => await fn(),
    ),
    getRepository: jest.fn(async (_workspaceId: string, entity: unknown) => {
      if (entity === PersonWorkspaceEntity) return personRepository;
      if (entity === TaskWorkspaceEntity) return taskRepository;
      if (entity === TaskTargetWorkspaceEntity) return taskTargetRepository;
      throw new Error('Unexpected repository');
    }),
  };

  const setterProfileService = {
    findByWorkspaceId: jest.fn().mockResolvedValue(setters),
    updateLastAssignedAt: jest.fn().mockResolvedValue(undefined),
  };

  const telegramConfigService = {
    findByWorkspaceId: jest
      .fn()
      .mockResolvedValue({ workspaceId: WORKSPACE_ID, isActive: true }),
  };

  const telegramService = {
    sendLeadAssignmentMessage: jest.fn().mockResolvedValue(undefined),
  };

  const twentyConfigService = {
    get: jest.fn().mockReturnValue('http://localhost:3001'),
  };

  const service = new LeadAssignmentService(
    globalWorkspaceOrmManager as never,
    setterProfileService as never,
    telegramConfigService as never,
    telegramService as never,
    twentyConfigService as never,
    setterAssignmentRepository as never,
  );

  return {
    service,
    setterAssignmentRepository,
    taskRepository,
    taskTargetRepository,
    setterProfileService,
    telegramService,
  };
};

describe('LeadAssignmentService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-21T12:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a task for the picked setter and marks lastAssignedAt', async () => {
    const {
      service,
      setterAssignmentRepository,
      taskRepository,
      taskTargetRepository,
      setterProfileService,
      telegramService,
    } = buildService();

    await service.assignPersonToSetter(WORKSPACE_ID, PERSON_ID);

    expect(setterAssignmentRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        setterProfileId: SETTER.id,
        workspaceMemberId: SETTER.workspaceMemberId,
        personId: PERSON_ID,
      }),
    );
    expect(taskRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Call new lead Jane Doe',
        status: 'TODO',
        assigneeId: SETTER.workspaceMemberId,
        dueAt: expect.any(Date),
      }),
    );
    expect(taskTargetRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ targetPersonId: PERSON_ID }),
    );
    expect(setterProfileService.updateLastAssignedAt).toHaveBeenCalledWith(
      SETTER.id,
      expect.any(Date),
    );
    expect(telegramService.sendLeadAssignmentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID }),
      SETTER.telegramChatId,
      expect.objectContaining({
        leadName: 'Jane Doe',
        leadPhone: '+15551234567',
        leadSource: 'FORM',
        personUrl: `http://localhost:3001/object/person/${PERSON_ID}`,
      }),
    );
  });

  it('does nothing when the person was already assigned (idempotent)', async () => {
    const { service, taskRepository, setterAssignmentRepository } =
      buildService({ existingAssignment: { id: 'assignment-1' } });

    await service.assignPersonToSetter(WORKSPACE_ID, PERSON_ID);

    expect(setterAssignmentRepository.insert).not.toHaveBeenCalled();
    expect(taskRepository.insert).not.toHaveBeenCalled();
  });

  it('treats a unique-violation on the assignment log as a successful no-op', async () => {
    const uniqueViolation = new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('duplicate'), { code: '23505' }),
    );

    const { service, taskRepository } = buildService({
      insertError: uniqueViolation,
    });

    await expect(
      service.assignPersonToSetter(WORKSPACE_ID, PERSON_ID),
    ).resolves.toBeUndefined();
    expect(taskRepository.insert).not.toHaveBeenCalled();
  });

  it('does nothing when the person has no leadSource', async () => {
    const { service, taskRepository, setterAssignmentRepository } =
      buildService({ person: { ...PERSON, leadSource: null } });

    await service.assignPersonToSetter(WORKSPACE_ID, PERSON_ID);

    expect(setterAssignmentRepository.insert).not.toHaveBeenCalled();
    expect(taskRepository.insert).not.toHaveBeenCalled();
  });

  it('does nothing when no setter is eligible', async () => {
    const { service, taskRepository, setterAssignmentRepository } =
      buildService({ setters: [{ ...SETTER, isSetter: false }] });

    await service.assignPersonToSetter(WORKSPACE_ID, PERSON_ID);

    expect(setterAssignmentRepository.insert).not.toHaveBeenCalled();
    expect(taskRepository.insert).not.toHaveBeenCalled();
  });

  it('still completes the assignment when the Telegram ping fails', async () => {
    const mocks = buildService();

    mocks.telegramService.sendLeadAssignmentMessage.mockRejectedValue(
      new Error('telegram down'),
    );

    await expect(
      mocks.service.assignPersonToSetter(WORKSPACE_ID, PERSON_ID),
    ).resolves.toBeUndefined();
    expect(mocks.taskRepository.insert).toHaveBeenCalled();
    expect(mocks.setterProfileService.updateLastAssignedAt).toHaveBeenCalled();
  });
  it('retries an unsent Telegram notification without creating another task', async () => {
    const mocks = buildService({
      existingAssignment: {
        id: 'assignment-1',
        setterProfileId: SETTER.id,
        personId: PERSON_ID,
        notificationSentAt: null,
      },
    });
    await mocks.service.assignPersonToSetter(WORKSPACE_ID, PERSON_ID);
    expect(mocks.taskRepository.insert).not.toHaveBeenCalled();
    expect(
      mocks.telegramService.sendLeadAssignmentMessage,
    ).toHaveBeenCalledTimes(1);
    expect(mocks.setterAssignmentRepository.update).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE_ID, personId: PERSON_ID },
      { notificationSentAt: expect.any(Date) },
    );
  });

  it('does not resend a notification already recorded as delivered', async () => {
    const mocks = buildService({
      existingAssignment: {
        id: 'assignment-1',
        notificationSentAt: new Date(),
      },
    });
    await mocks.service.assignPersonToSetter(WORKSPACE_ID, PERSON_ID);
    expect(
      mocks.telegramService.sendLeadAssignmentMessage,
    ).not.toHaveBeenCalled();
  });
});
