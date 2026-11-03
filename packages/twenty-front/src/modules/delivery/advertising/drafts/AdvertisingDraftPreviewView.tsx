import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type AdvertisingDraftPreview } from '@/delivery/advertising/drafts/advertising-draft-types';
import { AdvertisingDraftContextView } from '@/delivery/advertising/drafts/AdvertisingDraftContextView';
import { StyledAdvertisingFacts } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const AdvertisingDraftPreviewView = ({
  preview,
  confirmed,
  disabled,
  stale,
  onConfirmedChange,
  onStart,
}: {
  preview: AdvertisingDraftPreview;
  confirmed: boolean;
  disabled: boolean;
  stale: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  onStart: () => void;
}) => {
  const { t } = useLingui();
  const context = preview.context;
  const canStart =
    preview.budget.budgetReady &&
    preview.budget.maximumCostUsd != null &&
    preview.budget.pricingRevision != null &&
    confirmed &&
    !stale &&
    !disabled;
  return (
    <section aria-label={t`Review AI inputs and reservation`}>
      <StyledDeliveryStack>
        <h5>
          <Trans>Review the report evidence and reservation</Trans>
        </h5>
        <p>
          <Trans>
            This assistant receives account totals only. It cannot inspect
            individual ads, watch creatives, establish a trend from one report
            or change an ad account.
          </Trans>
        </p>
        <StyledAdvertisingFacts>
          <dt>
            <Trans>Assistant</Trans>
          </dt>
          <dd>
            {preview.agent.name} · {t`version ${preview.agent.version}`}
          </dd>
          <dt>
            <Trans>Maximum reservation</Trans>
          </dt>
          <dd>
            {preview.budget.maximumCostUsd == null
              ? t`Unavailable`
              : `USD ${preview.budget.maximumCostUsd}`}
          </dd>
        </StyledAdvertisingFacts>
        <p>
          <Trans>
            The reservation limits this request's exposure. It is not a
            confirmed charge; recorded usage and any unresolved cost remain
            visible with the run.
          </Trans>
        </p>
        {!preview.budget.budgetReady && (
          <p role="status">
            {preview.budget.blockedReason ??
              t`AI spending or pricing setup needs attention.`}{' '}
            <Link to="/delivery?view=agents&agentView=spending">
              <Trans>Review AI spending</Trans>
            </Link>
          </p>
        )}
        <AdvertisingDraftContextView context={context} />
        {context.limitations.length > 0 && (
          <ul>
            {context.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        )}
        {stale && (
          <p role="alert">
            <Trans>
              The selected evidence or requirements changed. Preview the current
              inputs before starting.
            </Trans>
          </p>
        )}
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            disabled={disabled || stale}
            onChange={(event) => onConfirmedChange(event.target.checked)}
          />
          <Trans>
            I reviewed this evidence, its limits and the maximum reservation.
          </Trans>
        </label>
        <StyledDeliveryButton
          type="button"
          data-primary="true"
          disabled={!canStart}
          onClick={onStart}
        >
          <Trans>Start one suggestion run</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </section>
  );
};
