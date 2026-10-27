import { ForbiddenException } from '@nestjs/common';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { CallLogService } from 'src/modules/calling/services/call-log.service';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

const WORKSPACE_ID = 'workspace-id';
const PERSON_ID = '42d54d12-499f-4fa8-8395-7a427cd00d2c';
const CALLER_CONTEXT = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
  workspaceMemberId: 'member-id',
  userWorkspaceId: 'user-workspace-id',
} as UserWorkspaceAuthContext;

describe('CallLogService', () => {
  const callRepository = {
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const personRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      (callback: () => Promise<unknown>, _context?: unknown) => callback(),
    ),
    getRepository: jest.fn((_workspaceId: string, entity: { name: string }) =>
      Promise.resolve(
        entity.name === 'CallWorkspaceEntity'
          ? callRepository
          : personRepository,
      ),
    ),
  };

  const createPersonService = {
    createPeople: jest.fn(),
  };

  const callTimelineService = {
    upsertPersonCallActivity: jest.fn().mockResolvedValue(undefined),
  };

  const buildService = () =>
    new CallLogService(
      globalWorkspaceOrmManager as never,
      createPersonService as never,
      callTimelineService as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    callRepository.findOne.mockReset().mockResolvedValue(null);
    personRepository.findOne.mockReset().mockResolvedValue(null);
    personRepository.createQueryBuilder.mockReset();
  });

  describe('outbound contact scope', () => {
    const outbound = () => ({
      workspaceId: WORKSPACE_ID,
      callSid: 'CA123',
      fromNumber: '+12533525757',
      toNumber: '+14155552671',
      personId: PERSON_ID,
      callerAuthContext: CALLER_CONTEXT,
    });

    it('does not log or link an explicitly requested contact hidden by native record scope', async () => {
      await expect(
        buildService().upsertOutboundCall(outbound()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        globalWorkspaceOrmManager.executeInWorkspaceContext,
      ).toHaveBeenCalledWith(expect.any(Function), CALLER_CONTEXT);
      expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
        WORKSPACE_ID,
        PersonWorkspaceEntity,
      );
      expect(callRepository.insert).not.toHaveBeenCalled();
    });

    it('preserves native object denial for an explicitly requested contact', async () => {
      personRepository.findOne.mockRejectedValueOnce(
        new PermissionsException(
          'Denied',
          PermissionsExceptionCode.PERMISSION_DENIED,
        ),
      );
      await expect(
        buildService().upsertOutboundCall(outbound()),
      ).rejects.toBeInstanceOf(PermissionsException);
      expect(callRepository.insert).not.toHaveBeenCalled();
    });

    it('rejects a caller context for another workspace before reading contacts', async () => {
      await expect(
        buildService().upsertOutboundCall({
          ...outbound(),
          workspaceId: 'other-workspace',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(globalWorkspaceOrmManager.getRepository).not.toHaveBeenCalled();
      expect(callRepository.insert).not.toHaveBeenCalled();
    });

    it('links a visible contact and resolves its company using the same native caller scope', async () => {
      personRepository.findOne
        .mockResolvedValueOnce({ id: PERSON_ID })
        .mockResolvedValueOnce({ companyId: 'company-id' });
      const result = await buildService().upsertOutboundCall(outbound());
      expect(result.created).toBe(true);
      expect(callRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'OUTBOUND',
          personId: PERSON_ID,
          companyId: 'company-id',
        }),
      );
      expect(
        globalWorkspaceOrmManager.getRepository.mock.calls.filter(
          ([, entity]) => entity === PersonWorkspaceEntity,
        ),
      ).toEqual([
        [WORKSPACE_ID, PersonWorkspaceEntity],
        [WORKSPACE_ID, PersonWorkspaceEntity, undefined],
      ]);
      expect(
        globalWorkspaceOrmManager.executeInWorkspaceContext.mock.calls.filter(
          ([, context]) => context === CALLER_CONTEXT,
        ),
      ).toHaveLength(2);
    });

    it('can dial a number without exposing restricted contacts through automatic phone matching', async () => {
      const getOne = jest
        .fn()
        .mockRejectedValueOnce(
          new PermissionsException(
            'Denied',
            PermissionsExceptionCode.PERMISSION_DENIED,
          ),
        );
      personRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne,
      });
      await buildService().upsertOutboundCall({
        ...outbound(),
        personId: null,
      });
      expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
        WORKSPACE_ID,
        PersonWorkspaceEntity,
        undefined,
      );
      expect(
        globalWorkspaceOrmManager.executeInWorkspaceContext,
      ).toHaveBeenCalledWith(expect.any(Function), CALLER_CONTEXT);
      expect(callRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ personId: null, companyId: null }),
      );
    });
  });

  describe('updateCallStatus', () => {
    it('should map in-progress to IN_PROGRESS and stamp answeredAt', async () => {
      const service = buildService();

      await service.updateCallStatus({
        workspaceId: WORKSPACE_ID,
        callSid: 'CA123',
        twilioStatus: 'in-progress',
        callDurationSeconds: null,
        errorMessage: null,
      });

      const [where, update] = callRepository.update.mock.calls[0];

      expect(where).toEqual({ externalId: 'CA123' });
      expect(update.status).toBe('IN_PROGRESS');
      expect(update.answeredAt).toBeInstanceOf(Date);
      expect(update.endedAt).toBeUndefined();
    });

    it('should map completed with duration and stamp endedAt', async () => {
      const service = buildService();

      await service.updateCallStatus({
        workspaceId: WORKSPACE_ID,
        callSid: 'CA123',
        twilioStatus: 'completed',
        callDurationSeconds: 42,
        errorMessage: null,
      });

      const [, update] = callRepository.update.mock.calls[0];

      expect(update.status).toBe('COMPLETED');
      expect(update.durationSeconds).toBe(42);
      expect(update.endedAt).toBeInstanceOf(Date);
    });

    it('should map no-answer and busy to terminal statuses without duration', async () => {
      const service = buildService();

      await service.updateCallStatus({
        workspaceId: WORKSPACE_ID,
        callSid: 'CA123',
        twilioStatus: 'no-answer',
        callDurationSeconds: null,
        errorMessage: null,
      });
      await service.updateCallStatus({
        workspaceId: WORKSPACE_ID,
        callSid: 'CA124',
        twilioStatus: 'busy',
        callDurationSeconds: null,
        errorMessage: null,
      });

      expect(callRepository.update.mock.calls[0][1].status).toBe('NO_ANSWER');
      expect(callRepository.update.mock.calls[1][1].status).toBe('BUSY');
      expect(
        callRepository.update.mock.calls[0][1].durationSeconds,
      ).toBeUndefined();
    });

    it('should persist the error message on failed calls', async () => {
      const service = buildService();

      await service.updateCallStatus({
        workspaceId: WORKSPACE_ID,
        callSid: 'CA123',
        twilioStatus: 'failed',
        callDurationSeconds: null,
        errorMessage: 'Number is unreachable',
      });

      const [, update] = callRepository.update.mock.calls[0];

      expect(update.status).toBe('FAILED');
      expect(update.errorMessage).toBe('Number is unreachable');
    });

    it('should ignore unknown Twilio statuses', async () => {
      const service = buildService();

      await service.updateCallStatus({
        workspaceId: WORKSPACE_ID,
        callSid: 'CA123',
        twilioStatus: 'some-future-status',
        callDurationSeconds: null,
        errorMessage: null,
      });

      expect(callRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('handleInboundCall', () => {
    it('should not duplicate the call or the timeline entry on Twilio retries', async () => {
      callRepository.findOne.mockResolvedValue({ id: 'existing-call-id' });
      personRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'person-id' }),
      });

      const service = buildService();

      const result = await service.handleInboundCall({
        workspaceId: WORKSPACE_ID,
        callSid: 'CA123',
        fromNumber: '+14155552671',
        toNumber: '+12533525757',
      });

      expect(result).toEqual({ callId: 'existing-call-id', created: false });
      expect(callRepository.insert).not.toHaveBeenCalled();
      expect(
        callTimelineService.upsertPersonCallActivity,
      ).not.toHaveBeenCalled();
    });

    it('should create the call and link a timeline entry for a known person', async () => {
      callRepository.findOne
        .mockResolvedValueOnce(null) // insertCallIfAbsent dedupe check
        .mockResolvedValueOnce(null);
      personRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'person-id' }),
      });
      personRepository.findOne.mockResolvedValue({ companyId: 'company-id' });

      const service = buildService();

      const result = await service.handleInboundCall({
        workspaceId: WORKSPACE_ID,
        callSid: 'CA123',
        fromNumber: '+14155552671',
        toNumber: '+12533525757',
      });

      expect(result.created).toBe(true);
      expect(callRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'INBOUND',
          status: 'INITIATED',
          fromNumber: '+14155552671',
          toNumber: '+12533525757',
          externalId: 'CA123',
          personId: 'person-id',
          companyId: 'company-id',
        }),
      );
      expect(callTimelineService.upsertPersonCallActivity).toHaveBeenCalledWith(
        {
          workspaceId: WORKSPACE_ID,
          personId: 'person-id',
          callId: result.callId,
        },
      );
    });
  });
});
