import { Fragment, useState, type ReactNode } from 'react';
import { NetworkStatus } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual, isDefined } from 'twenty-shared/utils';
import {
  type DeliveryFounderEscalationRuleDraftInput,
  type PreviewDeliveryFounderEscalationRuleQuery,
} from '~/generated-metadata/graphql';
import { PREVIEW_DELIVERY_FOUNDER_ESCALATION_RULE } from '@/delivery/founder/escalation/delivery-founder-escalation.graphql';
import { type EscalationPreview as EscalationPreviewSnapshot } from '@/delivery/founder/escalation/escalation.types';
import { StyledEscalationBoundary } from '@/delivery/founder/escalation/escalationStyles';
import { useEscalationLabels } from '@/delivery/founder/escalation/useEscalationLabels';
import { FounderExceptionRow } from '@/delivery/founder/FounderExceptionRow';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type EscalationPreviewProps = {
  input: DeliveryFounderEscalationRuleDraftInput;
  enabled: boolean;
  children?: (
    snapshot: EscalationPreviewSnapshot,
    available: boolean,
    reload: () => void,
  ) => ReactNode;
};
export const EscalationPreview = ({
  input,
  enabled,
  children,
}: EscalationPreviewProps) => {
  const { t } = useLingui();
  const permission = useWorkflowAccess();
  const labels = useEscalationLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const query = useQuery<PreviewDeliveryFounderEscalationRuleQuery>(
    PREVIEW_DELIVERY_FOUNDER_ESCALATION_RULE,
    {
      variables: { input, identity: permission.scope },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !enabled || !permission.ready || !permission.canManageRoles,
    },
  );
  const candidate = query.data?.previewDeliveryFounderEscalationRule;
  const authorized = enabled && permission.ready && permission.canManageRoles;
  const trusted =
    authorized &&
    !query.error &&
    (!candidate ||
      (permission.matches(candidate) &&
        candidate.canReadFinance === permission.canReadFinance));
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  const [lastVerified, setLastVerified] =
    useState<EscalationPreviewSnapshot | null>(null);
  const [retainReading, setRetainReading] = useState(false);
  const fresh = trusted && !query.loading && candidate ? candidate : null;
  if (fresh && !fastDeepEqual(fresh, lastVerified)) setLastVerified(fresh);
  if (fresh && !retainReading) setRetainReading(true);
  else if (retainReading && (!trusted || (query.loading && !refreshing)))
    setRetainReading(false);
  const data =
    fresh ??
    (retainReading &&
    trusted &&
    refreshing &&
    lastVerified &&
    permission.matches(lastVerified) &&
    lastVerified.canReadFinance === permission.canReadFinance
      ? lastVerified
      : null);
  const reload = async () => {
    setError('');
    try {
      const result = await query.refetch();
      if (
        !permission.matches(result.data?.previewDeliveryFounderEscalationRule)
      )
        throw new Error();
      setVersion((value) => value + 1);
    } catch {
      setError(t`The rule preview could not refresh. Your review is kept.`);
    }
  };
  return (
    <StyledDeliveryStack>
      <StyledDeliveryButton
        type="button"
        disabled={query.loading}
        onClick={() => requestAction(() => void reload())}
      >
        <Trans>Refresh matching preview</Trans>
      </StyledDeliveryButton>
      {error && <p role="alert">{error}</p>}
      {!data && (
        <p role={query.error ? 'alert' : 'status'}>
          {query.error
            ? t`Matching evidence could not be checked. Previous results are hidden.`
            : t`Checking matching evidence…`}
        </p>
      )}
      {data && (
        <>
          <h3>{t`Current matching issues: ${data.matchCount}`}</h3>
          <p>
            <Trans>
              This preview reads the complete bounded source selection. It saves
              no rule, queues no message and shows up to 25 matching sources.
            </Trans>
          </p>
          <small>
            {t`Checked at`}:{' '}
            {new Date(data.observedAt).toLocaleString(undefined, {
              timeZone: 'UTC',
            })}{' '}
            UTC{refreshing ? ` · ${t`Refreshing evidence`}` : ''}
          </small>
          {data.warnings.map((code) => (
            <p key={code} role="status">
              {labels.setupWarning(code)}
            </p>
          ))}
          <details>
            <summary>
              <Trans>Preview coverage</Trans>
            </summary>
            {data.coverage.map((coverage) => (
              <p key={coverage.domain}>
                {labels.domains[coverage.domain] ?? t`Source area`}:{' '}
                {labels.coverageStates[coverage.status] ?? t`Not verified`}
                {coverage.codes.map((code) => (
                  <span key={code}> · {labels.warning(code)}</span>
                ))}
              </p>
            ))}
          </details>
          {!data.items.length && (
            <p>
              <Trans>
                No current matching source was observed. This does not predict
                future issues.
              </Trans>
            </p>
          )}
          {data.items.length > 0 && (
            <details>
              <summary>{t`Matching source examples (${data.items.length})`}</summary>
              {data.items.map((item) => (
                <FounderExceptionRow key={item.key} item={item} />
              ))}
            </details>
          )}
        </>
      )}
      {children && isDefined(lastVerified) && (
        <StyledEscalationBoundary hidden={!data} disabled={!data}>
          <Fragment key={version}>
            {children(
              fresh ?? lastVerified,
              Boolean(data),
              () => void reload(),
            )}
          </Fragment>
        </StyledEscalationBoundary>
      )}
    </StyledDeliveryStack>
  );
};
