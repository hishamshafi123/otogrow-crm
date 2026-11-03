import { useCallback, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useSeoAccess } from '@/delivery/seo-results/useSeoAccess';
import { useSeoRead } from '@/delivery/seo-results/useSeoRead';
import { GET_SEO_REPORTS } from '@/delivery/seo-results/delivery-seo-results.graphql';
import {
  seoDestination,
  SEO_CLOSE_REPORT,
} from '@/delivery/seo-results/seo-navigation';
import { newSeoBody } from '@/delivery/seo-results/seo-body';
import { type SeoIntent } from '@/delivery/seo-results/seo-results.types';
import { SeoReportView } from '@/delivery/seo-results/SeoReportView';
import { SeoCommandPanel } from '@/delivery/seo-results/SeoCommandPanel';
import { useSeoLabels } from '@/delivery/seo-results/useSeoLabels';
import {
  StyledSeoBoundary,
  StyledSeoItem,
} from '@/delivery/seo-results/seoStyles';
import { type DeliverySeoReportsQuery } from '~/generated-metadata/graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const SeoReports = ({
  access,
  projectId,
  onDenied,
}: {
  access: ReturnType<typeof useSeoAccess>;
  projectId: string;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const labels = useSeoLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const [intent, setIntent] = useState<SeoIntent | null>(null);
  const query = useQuery<DeliverySeoReportsQuery>(GET_SEO_REPORTS, {
    variables: {
      input: {
        projectId,
        status: params.get('seoStatus'),
        afterId: params.get('seoAfter'),
      },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !access.permission.ready,
  });
  const read = useSeoRead({
    value: query.data?.deliverySeoReports,
    access,
    scope: `reports:${projectId}:${params.get('seoAfter')}:${params.get('seoStatus')}`,
    query,
    matches: (value) => value.project.id === projectId,
    onDenied,
  });
  const [retained, setRetained] = useState(read.data);
  if (read.data && !fastDeepEqual(retained, read.data)) setRetained(read.data);
  const context = read.data ?? retained;
  const currentProject = context?.project;
  const project =
    currentProject && currentProject.companyId !== undefined
      ? { ...currentProject, companyId: currentProject.companyId }
      : null;
  const consumeIntent = useCallback(
    (requestId: string) =>
      setIntent((previous) =>
        previous?.requestId === requestId ? null : previous,
      ),
    [],
  );
  const openIntent = (next: SeoIntent) =>
    requestAction(() => {
      setIntent(next);
      navigate(
        seoDestination(params, {
          seoReport: next.reportId,
          seoRequest: next.requestId,
          seoMode: next.mode,
          seoVersion: null,
          seoHistoryAfter: null,
        }),
      );
    });
  const reportId = params.get('seoReport');
  const newReport = params.get('seoMode') === 'new';
  return (
    <StyledDeliveryStack>
      {!read.data && (
        <p role={query.error ? 'alert' : 'status'}>
          <Trans>
            Report access or the current project could not be verified. Your
            preparation is hidden while the connection recovers.
          </Trans>{' '}
          <StyledDeliveryButton
            type="button"
            onClick={() => void query.refetch()}
          >
            <Trans>Check reports again</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      <StyledSeoBoundary
        hidden={!read.data}
        disabled={!read.data}
        inert={!read.data || undefined}
      >
        {context && project && (
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <h2>{context.project.name}</h2>
              <StyledDeliveryButton
                type="button"
                disabled={!read.data}
                onClick={() =>
                  openIntent({
                    requestId: crypto.randomUUID(),
                    reportId: crypto.randomUUID(),
                    projectId,
                    revision: 0,
                    projectRevision: project.revision,
                    expectedCompanyId: project.companyId,
                    body: newSeoBody(),
                    mode: 'new',
                  })
                }
              >
                <Trans>New SEO report</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
            <p>
              <Trans>
                Measurements are entered from documented sources. Search Console
                and Analytics are not automatically connected.
              </Trans>
            </p>
            {reportId ? (
              <>
                <Link to={seoDestination(params, SEO_CLOSE_REPORT)}>
                  <Trans>Close report</Trans>
                </Link>
                {newReport ? (
                  <SeoCommandPanel
                    key={`${projectId}:${reportId}:${params.get('seoRequest')}`}
                    access={access}
                    project={project}
                    reportId={reportId}
                    mode="new"
                    requestId={params.get('seoRequest') ?? ''}
                    intent={intent}
                    consumeIntent={consumeIntent}
                    enabled={Boolean(read.data)}
                    onDenied={onDenied}
                    onSaved={() => query.refetch()}
                  />
                ) : (
                  <SeoReportView
                    key={`${projectId}:${reportId}`}
                    access={access}
                    project={project}
                    reportId={reportId}
                    intent={intent}
                    consumeIntent={consumeIntent}
                    openIntent={openIntent}
                    enabled={Boolean(read.data)}
                    onDenied={onDenied}
                    refreshReports={() => query.refetch()}
                  />
                )}
              </>
            ) : (
              <>
                <label>
                  <Trans>Report status</Trans>
                  <select
                    aria-label={t`Report status`}
                    value={params.get('seoStatus') ?? ''}
                    onChange={(event) =>
                      navigate(
                        seoDestination(params, {
                          seoStatus: event.currentTarget.value,
                          seoAfter: null,
                        }),
                      )
                    }
                  >
                    <option value="">{t`All accessible reports`}</option>
                    {[
                      'DRAFT',
                      'SUBMITTED',
                      'APPROVED',
                      'CHANGES_REQUESTED',
                    ].map((status) => (
                      <option key={status} value={status}>
                        {labels.status(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <p>{t`${context.totalCount} accessible reports`}</p>
                {context.items.length === 0 && (
                  <p>
                    <Trans>No reports match this project and status.</Trans>
                  </p>
                )}
                {context.items.map((report) => (
                  <StyledSeoItem key={report.id}>
                    <Link
                      to={seoDestination(params, {
                        seoReport: report.id,
                        seoVersion: null,
                        seoHistoryAfter: null,
                      })}
                    >
                      {report.title}
                    </Link>
                    <p>
                      {labels.status(report.status)} · {report.periodStart} –{' '}
                      {report.periodEnd}
                    </p>
                    <p>
                      {t`Owner: ${report.ownerName}`} ·{' '}
                      {t`Version ${report.currentVersion}`}
                    </p>
                  </StyledSeoItem>
                ))}
                <StyledDeliveryRow>
                  {params.get('seoAfter') && (
                    <Link to={seoDestination(params, { seoAfter: null })}>
                      <Trans>First report page</Trans>
                    </Link>
                  )}
                  {context.nextId && (
                    <Link
                      to={seoDestination(params, { seoAfter: context.nextId })}
                    >
                      <Trans>More reports</Trans>
                    </Link>
                  )}
                </StyledDeliveryRow>
              </>
            )}
          </StyledDeliveryStack>
        )}
      </StyledSeoBoundary>
    </StyledDeliveryStack>
  );
};
