import {
  ForbiddenException,
  NotFoundException,
  type RawBodyRequest,
} from '@nestjs/common';

import { createHmac } from 'crypto';

import { type Request } from 'express';

import { MetaLeadgenWebhookController } from 'src/engine/metadata-modules/meta-ads-config/controllers/meta-leadgen-webhook.controller';
import { MetaLeadIntakeService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-intake.service';
import { MetaGraphApiService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-graph-api.service';
import { NoteTargetWorkspaceEntity } from 'src/modules/note/standard-objects/note-target.workspace-entity';
import { NoteWorkspaceEntity } from 'src/modules/note/standard-objects/note.workspace-entity';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

const WORKSPACE_ID = 'workspace-id';
const APP_SECRET = 'test-meta-app-secret';
const PAGE_ACCESS_TOKEN = 'test-page-access-token';
const VERIFY_TOKEN = 'test-verify-token';
const LEADGEN_ID = '987654321';

const CONFIG = {
  id: 'config-id',
  workspaceId: WORKSPACE_ID,
  appId: 'app-id',
  appSecret: 'enc:v2:app-secret',
  pageId: 'page-id',
  pageAccessToken: 'enc:v2:page-access-token',
  verifyToken: VERIFY_TOKEN,
  formId: null,
  processedLeadgenIds: [],
  isActive: true,
};

const LEAD_PAYLOAD = {
  object: 'page',
  entry: [
    {
      id: 'page-id',
      changes: [
        {
          field: 'leadgen',
          value: {
            leadgen_id: LEADGEN_ID,
            page_id: 'page-id',
            form_id: 'form-id-1',
            ad_id: 'ad-id-1',
            adgroup_id: 'adset-id-1',
            campaign_id: 'campaign-id-1',
          },
        },
      ],
    },
  ],
};

const GRAPH_LEAD_RESPONSE = {
  id: LEADGEN_ID,
  field_data: [
    { name: 'full_name', values: ['Bob Jones'] },
    { name: 'email', values: ['bob@acme.com'] },
    { name: 'phone_number', values: ['+15559876543'] },
    { name: 'car_model', values: ['Model S'] },
  ],
  form_id: 'form-id-1',
  campaign_id: 'campaign-id-1',
  campaign_name: 'Spring Promo',
  adset_id: 'adset-id-1',
  adset_name: 'Lookalike US',
  ad_id: 'ad-id-1',
  ad_name: 'Video Ad 1',
};

const signBody = (rawBody: string): string =>
  `sha256=${createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;

const buildRequest = (
  body: object,
  signature?: string,
): RawBodyRequest<Request> => {
  const rawBody = JSON.stringify(body);

  return {
    ip: '127.0.0.1',
    headers:
      signature !== undefined ? { 'x-hub-signature-256': signature } : {},
    rawBody: Buffer.from(rawBody),
  } as unknown as RawBodyRequest<Request>;
};

const buildQueryBuilderStub = (matches: object[]) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  withDeleted: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(matches),
});

describe('MetaLeadgenWebhookController', () => {
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

  const metaAdsConfigService = {
    findByWorkspaceId: jest.fn().mockResolvedValue(CONFIG),
    decryptAppSecret: jest.fn().mockReturnValue(APP_SECRET),
    decryptPageAccessToken: jest.fn().mockReturnValue(PAGE_ACCESS_TOKEN),
    claimLeadgenId: jest.fn().mockResolvedValue(true),
    releaseLeadgenId: jest.fn().mockResolvedValue(undefined),
  };

  const createCompanyService = {
    createOrRestoreCompanies: jest
      .fn()
      .mockResolvedValue({ 'acme.com': 'company-id' }),
  };

  const throttlerService = {
    tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(undefined),
  };

  const buildController = () =>
    new MetaLeadgenWebhookController(
      metaAdsConfigService as never,
      new MetaLeadIntakeService(
        metaAdsConfigService as never,
        new MetaGraphApiService(),
        globalWorkspaceOrmManager as never,
        createCompanyService as never,
      ),
      throttlerService as never,
    );

  const mockGraphApiFetch = () => {
    global.fetch = jest.fn((input) => {
      const url = String(input);

      if (url.includes(`/${LEADGEN_ID}?`)) {
        return Promise.resolve(
          new Response(JSON.stringify(GRAPH_LEAD_RESPONSE), { status: 200 }),
        );
      }

      if (url.includes('/form-id-1?')) {
        return Promise.resolve(
          new Response(JSON.stringify({ name: 'Spring Promo Form' }), {
            status: 200,
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    personRepository.createQueryBuilder.mockReturnValue(
      buildQueryBuilderStub([]),
    );
  });

  describe('verifyLeadgenWebhook', () => {
    it('should echo the challenge when the verify token matches', async () => {
      const controller = buildController();

      const result = await controller.verifyLeadgenWebhook(
        WORKSPACE_ID,
        'subscribe',
        VERIFY_TOKEN,
        'challenge-123',
      );

      expect(result).toBe('challenge-123');
    });

    it('should reject an unknown verify token', async () => {
      const controller = buildController();

      await expect(
        controller.verifyLeadgenWebhook(
          WORKSPACE_ID,
          'subscribe',
          'wrong-token',
          'challenge-123',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject an unknown workspace', async () => {
      metaAdsConfigService.findByWorkspaceId.mockResolvedValueOnce(null);
      const controller = buildController();

      await expect(
        controller.verifyLeadgenWebhook(
          'unknown-workspace',
          'subscribe',
          VERIFY_TOKEN,
          'challenge-123',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('handleLeadgenWebhook', () => {
    it('should reject requests without a Meta signature', async () => {
      const controller = buildController();

      await expect(
        controller.handleLeadgenWebhook(
          WORKSPACE_ID,
          buildRequest(LEAD_PAYLOAD),
          LEAD_PAYLOAD,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should reject requests with an invalid Meta signature', async () => {
      const controller = buildController();

      await expect(
        controller.handleLeadgenWebhook(
          WORKSPACE_ID,
          buildRequest(LEAD_PAYLOAD, 'sha256=deadbeef'),
          LEAD_PAYLOAD,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should create a person with leadSource META_AD and an attribution note on a valid delivery', async () => {
      mockGraphApiFetch();
      const controller = buildController();
      const rawBody = JSON.stringify(LEAD_PAYLOAD);

      const result = await controller.handleLeadgenWebhook(
        WORKSPACE_ID,
        buildRequest(LEAD_PAYLOAD, signBody(rawBody)),
        LEAD_PAYLOAD,
      );

      expect(result).toBe('EVENT_RECEIVED');
      expect(metaAdsConfigService.claimLeadgenId).toHaveBeenCalledWith({
        configId: CONFIG.id,
        leadgenId: LEADGEN_ID,
      });
      expect(personRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: { firstName: 'Bob', lastName: 'Jones' },
          emails: {
            primaryEmail: 'bob@acme.com',
            additionalEmails: null,
          },
          leadSource: 'META_AD',
          companyId: 'company-id',
        }),
      );
      expect(noteRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Meta ad lead: Spring Promo Form',
          bodyV2: expect.objectContaining({
            markdown: expect.stringContaining(
              '**Campaign:** Spring Promo (id: campaign-id-1)',
            ),
          }),
        }),
      );
      const noteMarkdown = noteRepository.insert.mock.calls[0][0].bodyV2
        .markdown as string;

      expect(noteMarkdown).toContain(`**Leadgen id:** ${LEADGEN_ID}`);
      expect(noteMarkdown).toContain('**car_model:** Model S');
      expect(noteTargetRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ noteId: expect.any(String) }),
      );
    });

    it('should skip a leadgen id that was already processed', async () => {
      metaAdsConfigService.claimLeadgenId.mockResolvedValueOnce(false);
      mockGraphApiFetch();
      const controller = buildController();
      const rawBody = JSON.stringify(LEAD_PAYLOAD);

      const result = await controller.handleLeadgenWebhook(
        WORKSPACE_ID,
        buildRequest(LEAD_PAYLOAD, signBody(rawBody)),
        LEAD_PAYLOAD,
      );

      expect(result).toBe('EVENT_RECEIVED');
      expect(personRepository.insert).not.toHaveBeenCalled();
      expect(noteRepository.insert).not.toHaveBeenCalled();
    });

    it('should dedupe by email and attach the note to the existing person', async () => {
      const existingPerson = {
        id: 'existing-person-id',
        name: { firstName: 'Bob', lastName: 'Jones' },
        emails: { primaryEmail: 'bob@acme.com' },
        phones: { primaryPhoneNumber: '+15559876543' },
        companyId: null,
        leadSource: 'META_AD',
        deletedAt: null,
      };

      personRepository.createQueryBuilder.mockReturnValue(
        buildQueryBuilderStub([existingPerson]),
      );
      mockGraphApiFetch();
      const controller = buildController();
      const rawBody = JSON.stringify(LEAD_PAYLOAD);

      await controller.handleLeadgenWebhook(
        WORKSPACE_ID,
        buildRequest(LEAD_PAYLOAD, signBody(rawBody)),
        LEAD_PAYLOAD,
      );

      expect(personRepository.insert).not.toHaveBeenCalled();
      expect(personRepository.updateMany).toHaveBeenCalledWith(
        [
          {
            criteria: 'existing-person-id',
            partialEntity: { companyId: 'company-id' },
          },
        ],
        undefined,
        ['id'],
      );
      expect(noteTargetRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ targetPersonId: 'existing-person-id' }),
      );
    });
  });
});
