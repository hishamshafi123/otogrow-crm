import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { type useSeoAccess } from '@/delivery/seo-results/useSeoAccess';
import { useSeoRead } from '@/delivery/seo-results/useSeoRead';
import {
  GET_SEO_REPORT,
  GET_SEO_STATE,
} from '@/delivery/seo-results/delivery-seo-results.graphql';
import {
  type SeoIntent,
  type SeoReport,
} from '@/delivery/seo-results/seo-results.types';
import { seoDestination } from '@/delivery/seo-results/seo-navigation';
import { SeoReportEvidence } from '@/delivery/seo-results/SeoReportEvidence';
import { SeoCommandPanel } from '@/delivery/seo-results/SeoCommandPanel';
import { seoNotFound } from '@/delivery/seo-results/useSeoCommands';
import { canonicalSeoBody } from '@/delivery/seo-results/seo-body';
import { StyledSeoBoundary } from '@/delivery/seo-results/seoStyles';
import { useSeoLabels } from '@/delivery/seo-results/useSeoLabels';
import {
  StyledDeliveryBadge,
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliverySeoReportQuery,
  type DeliverySeoReportStateQuery,
} from '~/generated-metadata/graphql';

export const SeoReportView = ({
  access,
  project,
  reportId,
  intent,
  consumeIntent,
  openIntent,
  enabled,
  onDenied,
  refreshReports,
}: {
  access: ReturnType<typeof useSeoAccess>;
  project: { id: string; revision: number; companyId: string | null };
  reportId: string;
  intent: SeoIntent | null;
  consumeIntent: (requestId: string) => void;
  openIntent: (intent: SeoIntent) => void;
  enabled: boolean;
  onDenied: () => void;
  refreshReports: () => Promise<unknown>;
}) => {
  const { t } = useLingui();
  const labels = useSeoLabels();
  const [params] = useSearchParams();
  const focus = useAssistantPanelFocus();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const version =
    params.get('seoVersion') === null ? null : Number(params.get('seoVersion'));
  const stateQuery = useQuery<DeliverySeoReportStateQuery>(GET_SEO_STATE, {
    variables: { input: { id: reportId } },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const state = useSeoRead({
    value: stateQuery.data?.deliverySeoReportState,
    access,
    scope: `state:${project.id}:${reportId}`,
    query: stateQuery,
    onDenied,
    matches: (value) =>
      value.project.id === project.id &&
      value.project.revision === project.revision &&
      value.project.companyId === project.companyId &&
      value.report.id === reportId,
  });
  const detailQuery = useQuery<DeliverySeoReportQuery>(GET_SEO_REPORT, {
    variables: {
      input: {
        id: reportId,
        version,
        afterEventId: params.get('seoHistoryAfter'),
      },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const detail = useSeoRead({
    value: detailQuery.data?.deliverySeoReport,
    access,
    scope: `detail:${project.id}:${reportId}:${version}:${params.get('seoHistoryAfter')}`,
    query: detailQuery,
    onDenied,
    matches: (value) =>
      value.project.id === project.id &&
      value.project.revision === project.revision &&
      value.project.companyId === project.companyId &&
      value.report.id === reportId &&
      (version === null || value.version === version),
  });
  const [retained, setRetained] = useState<SeoReport | null>(detail.data);
  if (detail.data && !fastDeepEqual(retained, detail.data))
    setRetained(detail.data);
  const [unavailable, setUnavailable] = useState(false);
  const missing =
    seoNotFound(stateQuery.error) || seoNotFound(detailQuery.error);
  useLayoutEffect(() => {
    if (missing) {
      cancelPendingNavigation();
      setRetained(null);
      setUnavailable(true);
    }
  }, [missing, cancelPendingNavigation]);
  const value = detail.data ?? retained;
  const changed = Boolean(
    state.data &&
    value &&
    (state.data.report.revision !== value.report.revision ||
      state.data.report.status !== value.report.status),
  );
  const available =
    enabled &&
    !missing &&
    !unavailable &&
    state.data !== null &&
    detail.data !== null &&
    !changed;
  const refresh = async () => {
    const results = await Promise.allSettled([
      stateQuery.refetch(),
      detailQuery.refetch(),
      refreshReports(),
    ]);
    if (results.every((result) => result.status === 'fulfilled'))
      setUnavailable(false);
  };
  const mode = params.get('seoMode');
  const requestId = params.get('seoRequest');
  const commandAllowed =
    mode === 'edit'
      ? state.data?.canEdit
      : mode === 'SUBMIT'
        ? state.data?.canSubmit
        : state.data?.canReview;
  return (
    <section ref={focus} tabIndex={-1} aria-label={t`SEO report evidence`}>
      <StyledDeliveryStack>
        {!available && (
          <div
            role={
              missing || stateQuery.error || detailQuery.error || changed
                ? 'alert'
                : 'status'
            }
          >
            <p>
              {missing || unavailable
                ? t`This report is no longer available in the selected project. Close it to return to the library.`
                : changed
                  ? t`This report changed. Refresh to inspect its current version before taking action.`
                  : t`Current report evidence could not be verified. Unsaved preparation is hidden and kept while you reconnect.`}
            </p>
            <StyledDeliveryButton type="button" onClick={() => void refresh()}>
              <Trans>Refresh report evidence</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        <StyledSeoBoundary
          hidden={!available}
          disabled={!available}
          inert={!available || undefined}
        >
          {value && (
            <StyledDeliveryStack>
              <StyledDeliveryRow>
                <h2>{value.body.title}</h2>
                <StyledDeliveryBadge
                  data-state={
                    value.report.status === 'SUBMITTED'
                      ? 'IN_REVIEW'
                      : value.report.status
                  }
                >
                  {labels.status(value.report.status)}
                </StyledDeliveryBadge>
              </StyledDeliveryRow>
              {value.clientAnchorChanged && (
                <p role="alert">
                  <Trans>
                    The project’s client changed. This historical report remains
                    read-only; do not reuse it as evidence for a different
                    client.
                  </Trans>
                </p>
              )}
              {version !== null && (
                <Link
                  to={seoDestination(params, {
                    seoVersion: null,
                    seoHistoryAfter: null,
                  })}
                >
                  <Trans>Open current report version</Trans>
                </Link>
              )}
              {mode && requestId ? (
                <SeoCommandPanel
                  key={`${reportId}:${requestId}:${mode}`}
                  access={access}
                  project={project}
                  reportId={reportId}
                  mode={mode}
                  requestId={requestId}
                  intent={intent}
                  consumeIntent={consumeIntent}
                  enabled={available}
                  currentRevision={state.data?.report.revision}
                  canExecute={state.data ? commandAllowed : true}
                  ownerName={value.report.ownerName}
                  onDenied={onDenied}
                  onSaved={refresh}
                />
              ) : (
                <StyledDeliveryRow>
                  {value.canEdit && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        openIntent({
                          requestId: crypto.randomUUID(),
                          reportId,
                          projectId: project.id,
                          revision: value.report.revision,
                          projectRevision: project.revision,
                          expectedCompanyId: project.companyId,
                          taskNames: Object.fromEntries(
                            value.taskSnapshots.map((task) => [
                              task.taskId,
                              task.title,
                            ]),
                          ),
                          body: canonicalSeoBody(value.body),
                          mode: 'edit',
                        })
                      }
                    >
                      <Trans>Edit report draft</Trans>
                    </StyledDeliveryButton>
                  )}
                  {value.canSubmit && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        openIntent({
                          requestId: crypto.randomUUID(),
                          reportId,
                          projectId: project.id,
                          revision: value.report.revision,
                          projectRevision: project.revision,
                          expectedCompanyId: project.companyId,
                          taskNames: Object.fromEntries(
                            value.taskSnapshots.map((task) => [
                              task.taskId,
                              task.title,
                            ]),
                          ),
                          body: canonicalSeoBody(value.body),
                          mode: 'SUBMIT',
                        })
                      }
                    >
                      <Trans>Prepare submission</Trans>
                    </StyledDeliveryButton>
                  )}
                  {value.canReview && (
                    <>
                      <StyledDeliveryButton
                        type="button"
                        onClick={() =>
                          openIntent({
                            requestId: crypto.randomUUID(),
                            reportId,
                            projectId: project.id,
                            revision: value.report.revision,
                            projectRevision: project.revision,
                            expectedCompanyId: project.companyId,
                            taskNames: Object.fromEntries(
                              value.taskSnapshots.map((task) => [
                                task.taskId,
                                task.title,
                              ]),
                            ),
                            body: canonicalSeoBody(value.body),
                            mode: 'APPROVE',
                          })
                        }
                      >
                        <Trans>Review and approve</Trans>
                      </StyledDeliveryButton>
                      <StyledDeliveryButton
                        type="button"
                        onClick={() =>
                          openIntent({
                            requestId: crypto.randomUUID(),
                            reportId,
                            projectId: project.id,
                            revision: value.report.revision,
                            projectRevision: project.revision,
                            expectedCompanyId: project.companyId,
                            taskNames: Object.fromEntries(
                              value.taskSnapshots.map((task) => [
                                task.taskId,
                                task.title,
                              ]),
                            ),
                            body: canonicalSeoBody(value.body),
                            mode: 'REQUEST_CHANGES',
                          })
                        }
                      >
                        <Trans>Return for changes</Trans>
                      </StyledDeliveryButton>
                    </>
                  )}
                  {value.report.status === 'SUBMITTED' && !value.canReview && (
                    <p>
                      <Trans>
                        An independent manager who did not prepare or own this
                        report must review it.
                      </Trans>
                    </p>
                  )}
                </StyledDeliveryRow>
              )}
              <SeoReportEvidence value={value} />
            </StyledDeliveryStack>
          )}
        </StyledSeoBoundary>
      </StyledDeliveryStack>
    </section>
  );
};
