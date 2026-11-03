import { randomUUID } from 'node:crypto';
import { DeliveryMediaService } from 'src/modules/delivery/creative/delivery-media.service';
import { newCreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
import { type DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

const setup = () => {
  const taskId = randomUUID(),
    memberId = randomUUID(),
    userWorkspaceId = randomUUID();
  const document = newCreativeDocument();
  const atlasId = 'atlascloud/google/nano-banana-pro/text-to-image';
  document.mediaSettings = {
    version: 1,
    enabled: true,
    modelIds: [atlasId],
    roles: ['ADMIN'],
    dailyRunLimit: 3,
    allowUnknownCost: false,
  };
  const scope = { actor: { isAdmin: true } } as Awaited<
    ReturnType<DeliveryCreativeService['scope']>
  >;
  const dependencies = Array.from(
    { length: 9 },
    () => ({}),
  ) as unknown as ConstructorParameters<typeof DeliveryMediaService>;
  dependencies[1] = {
    modify: async (
      ...arguments_: Parameters<DeliveryCreativeService['modify']>
    ) => {
      await arguments_[5](
        document,
        scope,
        {} as Parameters<Parameters<DeliveryCreativeService['modify']>[5]>[2],
      );
      return document;
    },
  } as unknown as DeliveryCreativeService;
  const service = new DeliveryMediaService(...dependencies);
  const command = (modelIds: string[]) =>
    service.command(
      { id: randomUUID() } as WorkspaceEntity,
      memberId,
      userWorkspaceId,
      {
        taskId,
        revision: 1,
        action: 'configure',
        enabled: true,
        modelIds,
        roles: ['ADMIN'],
        dailyRunLimit: 5,
        allowUnknownCost: false,
      },
    );
  return { command, document, atlasId };
};
describe('Legacy media settings and Atlas access', () => {
  it('preserves explicitly granted Atlas IDs when the legacy Google form omits them', async () => {
    const test = setup();
    await test.command([]);
    expect(test.document.mediaSettings?.modelIds).toEqual([test.atlasId]);
    expect(test.document.mediaSettings?.dailyRunLimit).toBe(5);
  });
  it('accepts preserved Atlas IDs without passing them to the Google connection registry', async () => {
    const test = setup();
    await test.command([test.atlasId]);
    expect(test.document.mediaSettings?.modelIds).toEqual([test.atlasId]);
  });
  it('rejects new Atlas grants through the legacy configuration command', async () => {
    const test = setup();
    await expect(
      test.command([test.atlasId, 'atlascloud/openai/gpt-image-2/edit']),
    ).rejects.toThrow('Use Atlas production access');
    expect(test.document.mediaSettings?.modelIds).toEqual([test.atlasId]);
  });
});
