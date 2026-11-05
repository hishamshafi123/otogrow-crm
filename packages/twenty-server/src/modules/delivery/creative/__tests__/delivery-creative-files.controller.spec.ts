import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type Response } from 'express';
import { Readable, Writable } from 'node:stream';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { DeliveryCreativeFilesController } from 'src/modules/delivery/creative/delivery-creative-files.controller';
import { type DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import {
  type CreativeAsset,
  newCreativeDocument,
} from 'src/modules/delivery/creative/delivery-creative.types';

const WORKSPACE_ID = 'cc595604-847d-415c-a9b8-6bb4e77b217e';
const TASK_ID = '14e508ec-c590-469d-a6c5-428d5960cbfd';
const ASSET_ID = '359e1943-50d1-46bc-b3aa-6f690a1890da';
const MEMBER_ID = '359e1943-50d1-46bc-b3aa-6f690a1890db';
const MEMBERSHIP_ID = '359e1943-50d1-46bc-b3aa-6f690a1890dc';
const FILE_BYTES = Buffer.from('private creative bytes');
const fixture = () => {
  const asset: CreativeAsset = {
    id: ASSET_ID,
    name: 'Product video.mp4',
    mimeType: 'video/mp4',
    size: FILE_BYTES.length,
    createdAt: '2026-11-05T12:00:00.000Z',
    uploadedBy: MEMBER_ID,
    briefVersion: 1,
    productionVersion: 1,
    assemblyVersion: 1,
    shotId: null,
    shotVersion: null,
    kind: 'FINAL',
    parentAssetId: null,
    reviews: [],
    storageState: 'READY',
  };
  const document = { ...newCreativeDocument(), assets: [asset] };
  const read = jest.fn(async () => ({
    document: structuredClone(document),
    revision: 1,
  }));
  const stream = Readable.from([FILE_BYTES]);
  const readFile = jest.fn(async () => stream);
  const chunks: Buffer[] = [];
  const response = Object.assign(
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    }),
    { setHeader: jest.fn() },
  );
  const controller = new DeliveryCreativeFilesController(
    { read } as unknown as DeliveryCreativeService,
    {
      getCurrentDriver: () => ({ readFile }),
    } as unknown as FileStorageDriverFactory,
  );
  return {
    asset,
    document,
    read,
    readFile,
    stream,
    response,
    chunks,
    download: () =>
      controller.download(
        { id: WORKSPACE_ID } as WorkspaceEntity,
        MEMBER_ID,
        MEMBERSHIP_ID,
        TASK_ID,
        ASSET_ID,
        response as unknown as Response,
      ),
  };
};

beforeEach(() => jest.useRealTimers());
afterEach(() => jest.useFakeTimers());

it('streams only after the same member can still read the exact ready file', async () => {
  const { download, read, readFile, response, chunks } = fixture();
  await download();
  expect(Buffer.concat(chunks)).toEqual(FILE_BYTES);
  expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.calls[0]).toEqual(read.mock.calls[1]);
  expect(readFile).toHaveBeenCalledWith({
    filePath: `${WORKSPACE_ID}/delivery-creative/${TASK_ID}/${ASSET_ID}`,
  });
  expect(response.setHeader).toHaveBeenCalledWith(
    'Cache-Control',
    'private, no-store',
  );
});

it('destroys the acquired stream without sending headers or bytes when task access is revoked', async () => {
  const { download, document, read, stream, response, chunks } = fixture();
  read.mockResolvedValueOnce({
    document: structuredClone(document),
    revision: 1,
  });
  read.mockRejectedValueOnce(new ForbiddenException());
  await expect(download()).rejects.toBeInstanceOf(ForbiddenException);
  expect(stream.destroyed).toBe(true);
  expect(response.setHeader).not.toHaveBeenCalled();
  expect(chunks).toEqual([]);
});

it.each([
  { name: 'Different file.mp4' },
  { mimeType: 'image/png' },
  { size: FILE_BYTES.length + 1 },
  { productionVersion: 2 },
  { storageState: 'FAILED' },
] satisfies Partial<CreativeAsset>[])(
  'withholds bytes when the selected file identity changes: %s',
  async (change) => {
    const { download, document, readFile, stream, response, chunks } =
      fixture();
    readFile.mockImplementationOnce(async () => {
      Object.assign(document.assets[0], change);
      return stream;
    });
    await expect(download()).rejects.toBeInstanceOf(BadRequestException);
    expect(stream.destroyed).toBe(true);
    expect(response.setHeader).not.toHaveBeenCalled();
    expect(chunks).toEqual([]);
  },
);

it('withholds an acquired file removed before the second permission read', async () => {
  const { download, document, readFile, stream, response, chunks } = fixture();
  readFile.mockImplementationOnce(async () => {
    document.assets = [];
    return stream;
  });
  await expect(download()).rejects.toBeInstanceOf(BadRequestException);
  expect(stream.destroyed).toBe(true);
  expect(response.setHeader).not.toHaveBeenCalled();
  expect(chunks).toEqual([]);
});

it('does not read storage when initial task access is denied', async () => {
  const { download, read, readFile, response } = fixture();
  read.mockRejectedValueOnce(new ForbiddenException());
  await expect(download()).rejects.toBeInstanceOf(ForbiddenException);
  expect(readFile).not.toHaveBeenCalled();
  expect(response.setHeader).not.toHaveBeenCalled();
});
