import {
  ForbiddenException,
  type INestApplication,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Request, type Response } from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { JwtWrapperService } from 'src/engine/core-modules/jwt/services/jwt-wrapper.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserSessionCookieService } from 'src/engine/core-modules/user-session/services/user-session-cookie.service';
import { CookieSessionCsrfMiddleware } from 'src/engine/middlewares/cookie-session-csrf.middleware';
import { MiddlewareService } from 'src/engine/middlewares/middleware.service';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { configureDeliveryFileAuthentication } from 'src/modules/delivery/configure-delivery-file-authentication';
import { DeliveryClientsController } from 'src/modules/delivery/clients/delivery-clients.controller';
import { DeliveryClientFilesController } from 'src/modules/delivery/clients/delivery-client-files.controller';
import { DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';
import { DeliveryKnowledgeAssetsController } from '../delivery-knowledge-assets.controller';
import { DeliveryKnowledgeAssetsService } from '../delivery-knowledge-assets.service';

const WORKSPACE_ID = '18920176-e17d-4dab-bc37-6ef9033814aa';
const MEMBER_ID = '1e19e17d-8084-443b-b9f3-361ad47c70c3';
const USER_WORKSPACE_ID = 'c717e578-5a64-4f40-92e4-420cc70b0bdf';
const SOURCE_ID = '4baaaadb-bbde-4745-9072-867a13c7261c';
const ASSET_ID = '0de0f35d-b2d7-454e-aa87-5c9319d1bbd7';
const ENGAGEMENT_ID = '4a30836c-f6cd-4c74-b9c1-65c14058a660';
const FILE_BYTES = Buffer.from('isolated controller bytes');
const PATH = '/portal/delivery-knowledge-files';
const STAFF_FILE_PATH = `/portal/delivery-client-files/${ENGAGEMENT_ID}/${ASSET_ID}`;
const STAFF_STORAGE_PATH = `${WORKSPACE_ID}/delivery-client/${ENGAGEMENT_ID}/${ASSET_ID}`;
const CONFIGURATION: Record<string, unknown> = {
  SERVER_URL: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:3001',
  AUTH_COOKIE_ALLOWED_ORIGINS: '',
};
const input = { sourceId: SOURCE_ID };
const bearer = (incoming: Request) =>
  /^Bearer\s+(\S+)/i.exec(incoming.headers.authorization ?? '')?.[1];
const middleware = {
  hydrateRestRequest: jest.fn(async (incoming: Request) => {
    if (
      bearer(incoming) !== 'fixture-access' &&
      incoming.headers.cookie !== 'twenty-session=sess_fixture'
    )
      throw new Error('Fixture credential unavailable.');
    Object.assign(incoming, {
      workspace: { id: WORKSPACE_ID },
      workspaceMemberId: MEMBER_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      user: { id: MEMBER_ID },
      workspaceMember: { id: MEMBER_ID },
      tokenType: JwtTokenTypeEnum.ACCESS,
    });
  }),
  writeRestResponseOnExceptionCaught: (response: Response) =>
    response.status(401).json({ error: 'Unauthorized' }),
};
const assets = {
  upload: jest.fn(async () => {
    const context = getWorkspaceAuthContext();
    expect(context.type).toBe('user');
    return { workspaceId: context.workspace.id, memberId: MEMBER_ID };
  }),
  download: jest.fn(async () => ({
    asset: { name: 'fixture.png', mimeType: 'image/png' },
    bytes: FILE_BYTES,
  })),
};
const clients = {
  staffBrandAsset: jest.fn(async () => ({
    asset: { name: 'client-logo.png', mimeType: 'image/png' },
    path: STAFF_STORAGE_PATH,
  })),
  portal: jest.fn(async () => ({ portal: 'explicit portal credential' })),
};
const driver = {
  readFile: jest.fn(async () => Readable.from([FILE_BYTES])),
};
@Module({
  controllers: [
    DeliveryKnowledgeAssetsController,
    DeliveryClientsController,
    DeliveryClientFilesController,
  ],
  providers: [
    { provide: DeliveryKnowledgeAssetsService, useValue: assets },
    { provide: MiddlewareService, useValue: middleware },
    { provide: DeliveryClientsService, useValue: clients },
    {
      provide: FileStorageDriverFactory,
      useValue: { getCurrentDriver: () => driver },
    },
    {
      provide: ThrottlerService,
      useValue: { tokenBucketThrottleOrThrow: jest.fn(async () => undefined) },
    },
    CookieSessionCsrfMiddleware,
    UserSessionCookieService,
    {
      provide: TwentyConfigService,
      useValue: {
        get: (key: string) => CONFIGURATION[key],
      },
    },
    {
      provide: JwtWrapperService,
      useValue: { extractJwtFromRequest: () => bearer },
    },
  ],
})
class FileHttpFixtureModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CookieSessionCsrfMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
    configureDeliveryFileAuthentication(consumer);
  }
}

describe('Brand-file HTTP authentication boundary', () => {
  let app: INestApplication;
  beforeAll(async () => {
    jest.useRealTimers();
    const module = await Test.createTestingModule({
      imports: [FileHttpFixtureModule],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    jest.useFakeTimers();
  });
  beforeEach(() => jest.clearAllMocks());

  const upload = () => request(app.getHttpServer()).post(`${PATH}/upload`);

  it('hydrates an allowed browser session before parsing the multipart upload', async () => {
    const result = await upload()
      .set('Cookie', 'twenty-session=sess_fixture')
      .set('Origin', 'http://localhost:3001')
      .field('input', JSON.stringify(input))
      .attach('file', FILE_BYTES, 'fixture.png')
      .expect(201);
    expect(result.body).toEqual({
      workspaceId: WORKSPACE_ID,
      memberId: MEMBER_ID,
    });
    expect(assets.upload).toHaveBeenCalledWith(
      expect.objectContaining({ id: WORKSPACE_ID }),
      MEMBER_ID,
      USER_WORKSPACE_ID,
      input,
      expect.objectContaining({
        buffer: FILE_BYTES,
        originalname: 'fixture.png',
      }),
    );
  });

  it('hydrates a bearer access request without requiring browser origin', async () => {
    await upload()
      .set('Authorization', 'Bearer fixture-access')
      .field('input', JSON.stringify(input))
      .attach('file', FILE_BYTES, 'fixture.png')
      .expect(201);
    expect(assets.upload).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 'https://unrelated.example'])(
    'rejects a cookie POST with unsafe origin %s before hydration',
    async (origin) => {
      const pending = upload().set('Cookie', 'twenty-session=sess_fixture');
      if (origin) pending.set('Origin', origin);
      await pending
        .field('input', JSON.stringify(input))
        .attach('file', FILE_BYTES, 'fixture.png')
        .expect(403);
      expect(middleware.hydrateRestRequest).not.toHaveBeenCalled();
      expect(assets.upload).not.toHaveBeenCalled();
    },
  );

  it('denies missing credentials without reaching storage', async () => {
    await upload()
      .field('input', JSON.stringify(input))
      .attach('file', FILE_BYTES, 'fixture.png')
      .expect(401);
    expect(assets.upload).not.toHaveBeenCalled();
  });

  it.each([`upload/${ASSET_ID}`, `${SOURCE_ID}/1/${ASSET_ID}`])(
    'authenticates file read %s and preserves private response headers',
    async (path) => {
      await request(app.getHttpServer()).get(`${PATH}/${path}`).expect(401);
      expect(assets.download).not.toHaveBeenCalled();
      const result = await request(app.getHttpServer())
        .get(`${PATH}/${path}`)
        .set('Cookie', 'twenty-session=sess_fixture')
        .expect(200);
      expect(result.headers['cache-control']).toBe('private, no-store');
      expect(result.headers['x-content-type-options']).toBe('nosniff');
      expect(result.headers['content-disposition']).toContain('attachment');
      expect(assets.download).toHaveBeenCalledTimes(1);
      expect(assets.download.mock.calls[0]).toEqual(
        expect.arrayContaining([MEMBER_ID, USER_WORKSPACE_ID, ASSET_ID]),
      );
    },
  );

  it.each(['cookie', 'bearer'])(
    'authenticates staff client asset reads using %s without changing scoped domain authority',
    async (credential) => {
      const pending = request(app.getHttpServer()).get(STAFF_FILE_PATH);
      if (credential === 'cookie')
        pending.set('Cookie', 'twenty-session=sess_fixture');
      else pending.set('Authorization', 'Bearer fixture-access');
      const result = await pending.expect(200);
      expect(clients.staffBrandAsset).toHaveBeenCalledWith(
        expect.objectContaining({ id: WORKSPACE_ID }),
        MEMBER_ID,
        USER_WORKSPACE_ID,
        ENGAGEMENT_ID,
        ASSET_ID,
      );
      expect(driver.readFile).toHaveBeenCalledWith({
        filePath: STAFF_STORAGE_PATH,
      });
      expect(result.headers['cache-control']).toBe('private, no-store');
      expect(result.headers['x-content-type-options']).toBe('nosniff');
      expect(result.headers['content-disposition']).toContain('attachment');
      expect(result.body).toEqual(FILE_BYTES);
    },
  );

  it('rejects unauthenticated staff client file reads before domain or storage access', async () => {
    await request(app.getHttpServer()).get(STAFF_FILE_PATH).expect(401);
    expect(clients.staffBrandAsset).not.toHaveBeenCalled();
    expect(driver.readFile).not.toHaveBeenCalled();
  });

  it('does not read staff file bytes when current domain permission is denied', async () => {
    clients.staffBrandAsset.mockRejectedValueOnce(new ForbiddenException());
    await request(app.getHttpServer())
      .get(STAFF_FILE_PATH)
      .set('Cookie', 'twenty-session=sess_fixture')
      .expect(403);
    expect(clients.staffBrandAsset).toHaveBeenCalledTimes(1);
    expect(driver.readFile).not.toHaveBeenCalled();
  });

  it('preserves independent client portal credentials without workspace session hydration', async () => {
    const result = await request(app.getHttpServer())
      .get('/portal/delivery-client/session')
      .set('Authorization', 'Bearer fixture-portal')
      .expect(200);
    expect(result.body).toEqual({ portal: 'explicit portal credential' });
    expect(clients.portal).toHaveBeenCalledWith('fixture-portal');
    expect(middleware.hydrateRestRequest).not.toHaveBeenCalled();
    expect(driver.readFile).not.toHaveBeenCalled();
  });
});
