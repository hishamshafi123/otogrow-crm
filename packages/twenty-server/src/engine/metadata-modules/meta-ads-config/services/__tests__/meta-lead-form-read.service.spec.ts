import { In } from 'typeorm';

import { MetaLeadFormReadService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-form-read.service';

const buildService = () => {
  const receipts = { find: jest.fn().mockResolvedValue([]) };
  const leads = { find: jest.fn().mockResolvedValue([{ id: 'displayed' }]) };
  const storage = { setIfNotExists: jest.fn().mockResolvedValue(true) };
  const service = new MetaLeadFormReadService(
    receipts as never,
    leads as never,
    storage as never,
  );
  return { service, receipts, leads, storage };
};

describe('Meta lead form read receipts', () => {
  it('marks only displayed leads, scoped to the authenticated user and form', async () => {
    const { service, leads, storage } = buildService();
    await service.markRead('workspace', 'user', 'form', [
      'displayed',
      'displayed',
    ]);
    expect(leads.find).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        formId: 'form',
        skipped: false,
        id: In(['displayed']),
      },
      select: { id: true },
    });
    expect(storage.setIfNotExists).toHaveBeenCalledTimes(1);
    expect(storage.setIfNotExists).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        userId: 'user',
        key: 'metaSheetLeadRead:displayed',
        value: true,
      }),
    );
  });

  it('rejects leads outside the selected form without saving any receipts', async () => {
    const { service, storage } = buildService();
    await expect(
      service.markRead('workspace', 'user', 'form', [
        'displayed',
        'other-form-lead',
      ]),
    ).rejects.toThrow('Some leads do not belong');
    expect(storage.setIfNotExists).not.toHaveBeenCalled();
  });

  it.each([[], Array.from({ length: 51 }, (_, index) => `lead-${index}`)])(
    'rejects an invalid page size',
    async (...leadIds) => {
      const { service, storage } = buildService();
      await expect(
        service.markRead('workspace', 'user', 'form', leadIds),
      ).rejects.toThrow('between 1 and 50');
      expect(storage.setIfNotExists).not.toHaveBeenCalled();
    },
  );

  it('reads only this user’s receipts and returns lead IDs', async () => {
    const { service, receipts } = buildService();
    receipts.find.mockResolvedValue([{ key: 'metaSheetLeadRead:displayed' }]);
    expect(
      await service.getReadLeadIds('workspace', 'user', ['displayed']),
    ).toEqual(new Set(['displayed']));
    expect(receipts.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace',
          userId: 'user',
          key: In(['metaSheetLeadRead:displayed']),
        }),
      }),
    );
  });

  it('does not query receipts for an empty lead list', async () => {
    const { service, receipts } = buildService();
    expect(await service.getReadLeadIds('workspace', 'user', [])).toEqual(
      new Set(),
    );
    expect(receipts.find).not.toHaveBeenCalled();
  });
});
