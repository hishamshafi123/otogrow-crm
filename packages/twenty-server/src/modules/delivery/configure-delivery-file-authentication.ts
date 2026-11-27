import { type MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ApiPath } from 'twenty-shared/types';
import { WorkspaceAuthContextMiddleware } from 'src/engine/core-modules/auth/middlewares/workspace-auth-context.middleware';
import { RestCoreMiddleware } from 'src/engine/middlewares/rest-core.middleware';

export const configureDeliveryFileAuthentication = (
  consumer: MiddlewareConsumer,
) => {
  consumer.apply(RestCoreMiddleware, WorkspaceAuthContextMiddleware).forRoutes(
    { path: `${ApiPath.DeliveryCreative}/*path`, method: RequestMethod.ALL },
    {
      path: 'portal/delivery-knowledge-files/*path',
      method: RequestMethod.ALL,
    },
    { path: 'portal/delivery-client-files/*path', method: RequestMethod.ALL },
    {
      path: 'portal/delivery-finance-v2-files/*path',
      method: RequestMethod.ALL,
    },
    {
      path: 'portal/delivery-chat-files/*path',
      method: RequestMethod.ALL,
    },
    {
      path: 'portal/delivery-deliverables/*path',
      method: RequestMethod.ALL,
    },
    {
      path: 'portal/delivery-studio/*path',
      method: RequestMethod.ALL,
    },
  );
};
