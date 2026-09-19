import { CallLogService } from 'src/modules/calling/services/call-log.service';

const WORKSPACE_ID = 'workspace-id';

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
      (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn((_workspaceId: string, entity: { name: string }) =>
      Promise.resolve(
        entity.name === 'CallWorkspaceEntity' ? callRepository : personRepository,
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
      expect(
        callTimelineService.upsertPersonCallActivity,
      ).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        personId: 'person-id',
        callId: result.callId,
      });
    });
  });
});
