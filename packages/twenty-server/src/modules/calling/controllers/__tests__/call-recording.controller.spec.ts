import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { PassThrough } from 'stream';
import { finished } from 'stream/promises';
import { CallRecordingController } from 'src/modules/calling/controllers/call-recording.controller';
import { CallWorkspaceEntity } from 'src/modules/calling/standard-objects/call.workspace-entity';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';

const WORKSPACE_ID = 'workspace-id';
const CALL_ID = '42d54d12-499f-4fa8-8395-7a427cd00d2c';
const RECORDING_SID = `RE${'a'.repeat(32)}`;
const ACCOUNT_SID = `AC${'b'.repeat(32)}`;
const request = {
  workspace: { id: WORKSPACE_ID },
  workspaceMemberId: 'member-id',
  workspaceMember: { id: 'member-id', userId: 'user-id' },
  userWorkspaceId: 'user-workspace-id',
  user: { id: 'user-id' },
  application: { id: 'app-id', defaultRoleId: 'restricted-app-role' },
} as unknown as Request;
const workspace = { id: WORKSPACE_ID } as never;

describe('call recording access', () => {
  const access = { requireCapability: jest.fn() };
  const repository = { findOne: jest.fn() };
  const orm = {
    executeInWorkspaceContext: jest.fn((operation: () => Promise<unknown>) =>
      operation(),
    ),
    getRepository: jest.fn(),
  };
  const configuration = {
    findByWorkspaceId: jest.fn(),
    decryptAuthToken: jest.fn().mockReturnValue('synthetic-token'),
  };
  const fetchProvider = jest.fn();
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.clearAllMocks();
    access.requireCapability.mockReset().mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      memberId: 'member-id',
      userWorkspaceId: 'user-workspace-id',
      capabilities: ['phone.use'],
    });
    repository.findOne
      .mockReset()
      .mockResolvedValue({ id: CALL_ID, recordingSid: RECORDING_SID });
    orm.getRepository.mockReset().mockResolvedValue(repository);
    configuration.findByWorkspaceId
      .mockReset()
      .mockResolvedValue({ accountSid: ACCOUNT_SID });
    fetchProvider.mockReset();
    global.fetch = fetchProvider;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });
  const controller = () =>
    new CallRecordingController(
      configuration as never,
      orm as never,
      access as never,
    );

  it('rejects a revoked phone capability before looking up a recording or provider credentials', async () => {
    access.requireCapability.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      controller().streamRecording(CALL_ID, workspace, request, {} as Response),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(orm.getRepository).not.toHaveBeenCalled();
    expect(configuration.findByWorkspaceId).not.toHaveBeenCalled();
    expect(fetchProvider).not.toHaveBeenCalled();
  });

  it('does not use a stale or mismatched session membership', async () => {
    await expect(
      controller().streamRecording(
        CALL_ID,
        workspace,
        { ...request, userWorkspaceId: 'old-membership' } as Request,
        {} as Response,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(orm.getRepository).not.toHaveBeenCalled();
    expect(fetchProvider).not.toHaveBeenCalled();
  });

  it('keeps native object denial even when the member has phone.use', async () => {
    repository.findOne.mockRejectedValueOnce(
      new PermissionsException(
        'Object access denied',
        PermissionsExceptionCode.PERMISSION_DENIED,
      ),
    );
    await expect(
      controller().streamRecording(CALL_ID, workspace, request, {} as Response),
    ).rejects.toBeInstanceOf(PermissionsException);
    expect(orm.getRepository).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CallWorkspaceEntity,
    );
    expect(fetchProvider).not.toHaveBeenCalled();
  });

  it('returns no recording when native row scope hides the requested call', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      controller().streamRecording(CALL_ID, workspace, request, {} as Response),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(configuration.findByWorkspaceId).not.toHaveBeenCalled();
    expect(fetchProvider).not.toHaveBeenCalled();
  });

  it('streams an allowed recording using native user and application scope with private caching', async () => {
    fetchProvider.mockResolvedValueOnce(
      new global.Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-length': '3' },
      }),
    );
    const response = new PassThrough();
    const bytes: Buffer[] = [];
    response.on('data', (chunk: Buffer) => bytes.push(chunk));
    const set = jest.fn();
    const outgoing = Object.assign(response, { set });
    await controller().streamRecording(
      CALL_ID,
      workspace,
      request,
      outgoing as unknown as Response,
    );
    await finished(response);
    expect(Buffer.concat(bytes)).toEqual(Buffer.from([1, 2, 3]));
    expect(orm.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        type: 'user',
        userWorkspaceId: 'user-workspace-id',
        workspaceMemberId: 'member-id',
        application: request.application,
      }),
    );
    expect(orm.getRepository).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CallWorkspaceEntity,
    );
    expect(fetchProvider).toHaveBeenCalledWith(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings/${RECORDING_SID}.mp3`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Cache-Control': 'private, no-store' }),
    );
  });
});
