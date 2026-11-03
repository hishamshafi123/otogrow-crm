import { type DeliveryFounderEscalationRuleDraftInput } from '~/generated-metadata/graphql';
import { type EscalationRule } from '@/delivery/founder/escalation/escalation.types';

export const escalationRuleInput = (
  rule: EscalationRule,
): DeliveryFounderEscalationRuleDraftInput => ({
  id: rule.id,
  revision: rule.revision,
  name: rule.name,
  condition: rule.condition,
  minimumReviewWaitHours: rule.minimumReviewWaitHours ?? null,
  recipientId: rule.recipientId,
  priority: rule.priority,
  projectScope: rule.projectScope,
  projectIds: rule.projectIds,
  includeCompany: rule.includeCompany,
  currency: rule.currency ?? null,
  serviceMonth: rule.serviceMonth ?? null,
  repeatMode: rule.repeatMode,
  repeatHours: rule.repeatHours ?? null,
  maxSends: rule.maxSends,
});
