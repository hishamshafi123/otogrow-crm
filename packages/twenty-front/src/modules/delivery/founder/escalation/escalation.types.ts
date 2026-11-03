import {
  type DeliveryFounderEscalationsQuery,
  type PreviewDeliveryFounderEscalationRuleQuery,
} from '~/generated-metadata/graphql';

export type EscalationSnapshot =
  DeliveryFounderEscalationsQuery['deliveryFounderEscalations'];
export type EscalationRule = EscalationSnapshot['rules'][number];
export type EscalationEpisode = EscalationSnapshot['episodes'][number];
export type EscalationNotice = EscalationSnapshot['notices'][number];
export type EscalationConfiguration = NonNullable<
  EscalationNotice['configuration']
>;
export type EscalationPreview =
  PreviewDeliveryFounderEscalationRuleQuery['previewDeliveryFounderEscalationRule'];
export type EscalationDestination = (
  changes: Record<string, string | null>,
) => string;
