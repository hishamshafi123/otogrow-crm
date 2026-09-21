import { MetaLeadFormEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-lead-form.entity';
import { MetaLeadFormService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-form.service';

const WORKSPACE_ID = 'workspace-1';
const FORM_ID = 'form-1';
const LEAD = {
  id: 'lead-123',
  fieldData: [{ name: 'email', values: ['jane@example.com'] }],
  formName: 'Campaign',
  formId: null,
  campaignId: null,
  campaignName: null,
  adsetId: null,
  adsetName: null,
  adId: null,
  adName: null,
};

const buildService = () => {
  const form = {
    id: FORM_ID,
    workspaceId: WORKSPACE_ID,
    isActive: true,
    credentials: 'encrypted',
  };
  const stored = new Map<
    string,
    { personId?: string; skipped?: boolean; answers: typeof LEAD }
  >();
  const leadRepository = {
    findOne: jest.fn(
      async ({ where }: { where: { leadId: string } }) =>
        stored.get(where.leadId) ?? null,
    ),
    save: jest.fn(
      async (row: {
        leadId: string;
        personId: string;
        answers: typeof LEAD;
      }) => {
        stored.set(row.leadId, row);
      },
    ),
  };
  const builder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(form),
  };
  const formRepository = {
    findOne: jest.fn().mockResolvedValue(form),
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    update: jest.fn().mockResolvedValue(undefined),
    manager: {
      transaction: jest.fn(
        async (operation: (manager: unknown) => Promise<void>) =>
          operation({
            getRepository: (entity: unknown) =>
              entity === MetaLeadFormEntity ? formRepository : leadRepository,
          }),
      ),
    },
  };
  const reader = { read: jest.fn().mockResolvedValue([LEAD]) };
  const intake = { importSheetLead: jest.fn().mockResolvedValue('person-1') };
  const assignment = {
    assignPersonToSetter: jest.fn().mockResolvedValue(undefined),
  };
  const encryption = {
    decryptVersionedOrThrow: jest.fn().mockReturnValue('credentials'),
  };
  const service = new MetaLeadFormService(
    formRepository as never,
    leadRepository as never,
    encryption as never,
    reader as never,
    intake as never,
    assignment as never,
  );

  return {
    service,
    form,
    stored,
    reader,
    intake,
    assignment,
    formRepository,
    leadRepository,
    builder,
  };
};

describe('Meta lead form sync', () => {
  it('imports once and retries assignment without duplicating the contact on later polls', async () => {
    const mocks = buildService();
    await mocks.service.sync(WORKSPACE_ID, FORM_ID);
    await mocks.service.sync(WORKSPACE_ID, FORM_ID);
    expect(mocks.intake.importSheetLead).toHaveBeenCalledTimes(1);
    expect(mocks.leadRepository.save).toHaveBeenCalledTimes(1);
    expect(mocks.assignment.assignPersonToSetter).toHaveBeenCalledTimes(2);
    expect(mocks.assignment.assignPersonToSetter).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'person-1',
    );
  });

  it('updates changed answers on the same contact', async () => {
    const mocks = buildService();
    await mocks.service.sync(WORKSPACE_ID, FORM_ID);
    const changed = {
      ...LEAD,
      fieldData: [{ name: 'email', values: ['new@example.com'] }],
    };
    mocks.reader.read.mockResolvedValue([changed]);
    await mocks.service.sync(WORKSPACE_ID, FORM_ID);
    expect(mocks.intake.importSheetLead).toHaveBeenLastCalledWith(
      WORKSPACE_ID,
      changed,
      expect.objectContaining({ personId: 'person-1', answers: LEAD }),
    );
    expect(mocks.stored.get(LEAD.id)?.answers).toEqual(changed);
  });

  it('does not import or notify for existing rows explicitly excluded at connection', async () => {
    const mocks = buildService();
    mocks.stored.set(LEAD.id, { skipped: true, answers: LEAD });
    await mocks.service.sync(WORKSPACE_ID, FORM_ID);
    expect(mocks.intake.importSheetLead).not.toHaveBeenCalled();
    expect(mocks.assignment.assignPersonToSetter).not.toHaveBeenCalled();
  });

  it('does not sync a paused form or a form locked by another worker', async () => {
    const mocks = buildService();
    mocks.form.isActive = false;
    await mocks.service.sync(WORKSPACE_ID, FORM_ID);
    mocks.builder.getOne.mockResolvedValue(null);
    await mocks.service.sync(WORKSPACE_ID, FORM_ID);
    expect(mocks.reader.read).not.toHaveBeenCalled();
  });

  it('records a sanitized failure and retries the lead on the next poll', async () => {
    const mocks = buildService();
    mocks.intake.importSheetLead.mockRejectedValueOnce(
      new Error('private credential details'),
    );
    await mocks.service.sync(WORKSPACE_ID, FORM_ID);
    expect(mocks.formRepository.update).toHaveBeenCalledWith(
      { id: FORM_ID, workspaceId: WORKSPACE_ID },
      { lastError: 'Sync failed. Check server logs and retry.' },
    );
    expect(mocks.stored.size).toBe(0);
    await mocks.service.sync(WORKSPACE_ID, FORM_ID);
    expect(mocks.stored.size).toBe(1);
  });

  it('rejects a form outside the workspace before reading its credentials', async () => {
    const mocks = buildService();
    mocks.formRepository.findOne.mockResolvedValue(null);
    await expect(
      mocks.service.sync('another-workspace', FORM_ID),
    ).rejects.toThrow('not found');
    expect(mocks.reader.read).not.toHaveBeenCalled();
    expect(mocks.formRepository.findOne).toHaveBeenCalledWith({
      where: { workspaceId: 'another-workspace', id: FORM_ID },
    });
  });
});
