import {
  type DeliveryClientSetupQuery,
  type CreateDeliveryClientSetupMutation,
  type DeliveryClientSetupPlanInput,
  type DeliveryClientSetupTaskInput,
} from '~/generated-metadata/graphql';

export type ClientSetupContext =
  DeliveryClientSetupQuery['deliveryClientSetup'];
export type ClientSetupReceipt =
  CreateDeliveryClientSetupMutation['createDeliveryClientSetup'];
export type ClientSetupMember = ClientSetupContext['members'][number];
export type ClientSetupPlan = DeliveryClientSetupPlanInput;
export type ClientSetupTask = DeliveryClientSetupTaskInput;
