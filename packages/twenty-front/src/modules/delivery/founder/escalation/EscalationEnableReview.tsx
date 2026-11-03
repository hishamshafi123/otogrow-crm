import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { type DeliveryFounderEscalationRuleStateInput } from '~/generated-metadata/graphql';
import {
  type EscalationRule,
  type EscalationSnapshot,
} from '@/delivery/founder/escalation/escalation.types';
import { EscalationPreview } from '@/delivery/founder/escalation/EscalationPreview';
import { EscalationConfirmForm } from '@/delivery/founder/escalation/EscalationConfirmForm';
import { EscalationRuleSummary } from '@/delivery/founder/escalation/EscalationRuleSummary';
import { escalationRuleInput } from '@/delivery/founder/escalation/escalation-rule-input';

type EscalationEnableReviewProps = {
  rule: EscalationRule;
  projects: EscalationSnapshot['projects'];
  routingAdopted: boolean;
  identity: string;
  enabled: boolean;
  onSave: (input: DeliveryFounderEscalationRuleStateInput) => Promise<boolean>;
  onCancel: () => void;
  onReload: () => void;
};
export const EscalationEnableReview = ({
  rule,
  projects,
  routingAdopted,
  identity,
  enabled,
  onSave,
  onCancel,
  onReload,
}: EscalationEnableReviewProps) => {
  const { t } = useLingui();
  const [opened] = useState(() => escalationRuleInput(rule));
  return (
    <EscalationPreview input={opened} enabled={enabled}>
      {(snapshot, available, reload) => (
        <>
          <section aria-label={t`Saved rule to enable`}>
            <EscalationRuleSummary rule={rule} projects={projects} />
          </section>
          <EscalationConfirmForm
            title={t`Enable founder alert rule`}
            description={t`The configured follow-up owner, ${rule.recipientName}, reviews these issues and arranges next steps. Source ownership stays separate. Enabling permits generic Telegram alerts 24/7 when current checks pass.`}
            confirmLabel={t`I reviewed the condition, scope, follow-up owner and Telegram recipient, priority and repeat policy and want to enable this rule.`}
            submitLabel={t`Enable this rule`}
            signature={`${rule.id}:${rule.revision}:${snapshot.previewToken}:${routingAdopted}`}
            identity={identity}
            readOnly={!available}
            canConfirm={
              snapshot.canEnable &&
              !rule.enabled &&
              rule.revision === opened.revision
            }
            adoptionRequired={!routingAdopted}
            buildInput={(commandId, reason, adoptLegacyRouting) => ({
              commandId,
              ruleId: opened.id,
              revision: opened.revision,
              enabled: true,
              previewToken: snapshot.previewToken,
              adoptLegacyRouting,
              reason,
            })}
            onSave={onSave}
            onCancel={onCancel}
            onReload={() => {
              if (rule.revision !== opened.revision) onReload();
              else reload();
            }}
          />
        </>
      )}
    </EscalationPreview>
  );
};
