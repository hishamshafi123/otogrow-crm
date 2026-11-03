import { useCallback, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useReleaseAccess } from '@/delivery/development/useReleaseAccess';
import { useReleaseRead } from '@/delivery/development/useReleaseRead';
import { GET_RELEASE_LIST } from '@/delivery/development/delivery-release.graphql';
import {
  releaseDestination,
  RELEASE_CLOSE_RECORD,
} from '@/delivery/development/release-navigation';
import { newReleaseBody } from '@/delivery/development/release-body';
import { type ReleaseIntent } from '@/delivery/development/release.types';
import { ReleaseDetailView } from '@/delivery/development/ReleaseDetailView';
import { ReleaseCommandPanel } from '@/delivery/development/ReleaseCommandPanel';
import { useReleaseLabels } from '@/delivery/development/useReleaseLabels';
import {
  StyledReleaseBoundary,
  StyledReleaseItem,
} from '@/delivery/development/releaseStyles';
import { type DeliveryReleaseListQuery } from '~/generated-metadata/graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ReleaseLibraryProps = {
  access: ReturnType<typeof useReleaseAccess>;
  projectId: string;
  onDenied: () => void;
  enabled: boolean;
};
export const ReleaseLibrary = ({
  access,
  projectId,
  onDenied,
  enabled,
}: ReleaseLibraryProps) => {
  const { t } = useLingui();
  const labels = useReleaseLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction, requestNavigation } = useDeliveryDraftGuard();
  const [intent, setIntent] = useState<ReleaseIntent | null>(null);
  const query = useQuery<DeliveryReleaseListQuery>(GET_RELEASE_LIST, {
    variables: {
      input: {
        projectId,
        status: params.get('releaseStatus'),
        afterId: params.get('releaseAfter'),
      },
    },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled,
  });
  const read = useReleaseRead({
    value: query.data?.deliveryReleaseList,
    access,
    scope: `list:${projectId}:${params.get('releaseStatus')}:${params.get('releaseAfter')}`,
    query,
    matches: (value) => value.project.id === projectId,
    onDenied,
  });
  const [retained, setRetained] = useState(read.data);
  if (read.data && !fastDeepEqual(retained, read.data)) setRetained(read.data);
  const context = read.data ?? retained;
  const available = enabled && read.data !== null;
  const consumeIntent = useCallback(
    (requestId: string) =>
      setIntent((previous) =>
        previous?.requestId === requestId ? null : previous,
      ),
    [],
  );
  const openIntent = (next: ReleaseIntent) =>
    requestAction(() => {
      setIntent(next);
      navigate(
        releaseDestination(params, {
          releaseId: next.releaseId,
          releaseRequest: next.requestId,
          releaseMode: next.mode,
          releaseVersion: null,
          releaseHistoryAfter: null,
        }),
      );
    });
  const releaseId = params.get('releaseId');
  const mode = params.get('releaseMode');
  const replaceIntent = (next: ReleaseIntent) => {
    const destination = releaseDestination(params, {
      releaseId: next.releaseId,
      releaseRequest: next.requestId,
      releaseMode: next.mode,
      releaseVersion: null,
      releaseHistoryAfter: null,
    });
    requestNavigation(
      { pathname: '/delivery', search: destination.slice('/delivery'.length) },
      () => {
        setIntent(next);
        navigate(destination);
      },
    );
  };
  return (
    <StyledDeliveryStack>
      {!available && (
        <div role={query.error ? 'alert' : 'status'}>
          <p>
            {query.error ? (
              <Trans>
                Current release access could not be checked. Your preparation is
                hidden while you reconnect.
              </Trans>
            ) : (
              <Trans>Loading current releases…</Trans>
            )}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => void query.refetch()}
          >
            <Trans>Check releases again</Trans>
          </StyledDeliveryButton>
        </div>
      )}
      <StyledReleaseBoundary
        hidden={!available}
        disabled={!available}
        inert={!available || undefined}
      >
        {context && (
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <h2>{context.project.name}</h2>
              <Link to={`/delivery?view=mine&project=${context.project.id}`}>
                <Trans>Open my project tasks</Trans>
              </Link>
              <Link to="/delivery?view=development&developerView=legacy">
                <Trans>Earlier release checklists</Trans>
              </Link>
            </StyledDeliveryRow>
            <p>
              <Trans>
                Plan a release from existing tasks, get an independent review,
                then record deployment and client handover evidence.
              </Trans>
            </p>
            {context.project.companyId === undefined ? null : releaseId ? (
              mode ? (
                <ReleaseCommandPanel
                  key={`${access.source}:${releaseId}:${params.get('releaseRequest')}`}
                  access={access}
                  project={{
                    ...context.project,
                    companyId: context.project.companyId ?? null,
                  }}
                  releaseId={releaseId}
                  requestId={params.get('releaseRequest') ?? ''}
                  mode={mode}
                  intent={intent}
                  consumeIntent={consumeIntent}
                  enabled={available}
                  contextScope={context.scope}
                  onDenied={onDenied}
                  onReplaceIntent={replaceIntent}
                  onSaved={async () => {
                    await query.refetch();
                  }}
                />
              ) : (
                <ReleaseDetailView
                  key={`${releaseId}:${params.get('releaseVersion') ?? 'current'}`}
                  access={access}
                  releaseId={releaseId}
                  projectId={projectId}
                  enabled={available}
                  onDenied={onDenied}
                  openIntent={openIntent}
                />
              )
            ) : (
              <>
                <StyledDeliveryRow>
                  <StyledDeliveryButton
                    type="button"
                    data-primary="true"
                    onClick={() =>
                      openIntent({
                        releaseId: crypto.randomUUID(),
                        requestId: crypto.randomUUID(),
                        projectId,
                        projectRevision: context.project.revision,
                        expectedCompanyId: context.project.companyId ?? null,
                        revision: 0,
                        mode: 'new',
                        sourceFingerprint: '',
                        body: newReleaseBody(
                          access.permission.access?.memberId ?? '',
                          labels.check,
                        ),
                        tasks: [],
                      })
                    }
                  >
                    <Trans>Plan a release</Trans>
                  </StyledDeliveryButton>
                  <label>
                    <Trans>Release status</Trans>
                    <select
                      aria-label={t`Release status`}
                      value={params.get('releaseStatus') ?? ''}
                      onChange={(event) => {
                        const status = event.currentTarget.value;
                        requestAction(() =>
                          navigate(
                            releaseDestination(params, {
                              releaseStatus: status,
                              releaseAfter: null,
                            }),
                          ),
                        );
                      }}
                    >
                      <option value="">{t`All statuses`}</option>
                      {[
                        'DRAFT',
                        'SUBMITTED',
                        'APPROVED',
                        'CHANGES_REQUESTED',
                        'DEPLOYED',
                        'HANDED_OVER',
                        'ACCEPTED',
                      ].map((status) => (
                        <option key={status} value={status}>
                          {labels.state(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                </StyledDeliveryRow>
                <p>{t`${context.totalCount} accessible releases`}</p>
                {!context.items.length && (
                  <p>
                    <Trans>
                      No releases match. Start with the tasks already assigned
                      to this project.
                    </Trans>
                  </p>
                )}
                {context.items.map((release) => (
                  <StyledReleaseItem key={release.id}>
                    <StyledDeliveryStack>
                      <Link
                        to={releaseDestination(params, {
                          releaseId: release.id,
                          releaseVersion: null,
                          releaseHistoryAfter: null,
                        })}
                      >
                        {release.title}
                      </Link>
                      <span>
                        {labels.state(release.status)} · {release.ownerName} ·{' '}
                        {t`Target ${release.targetDate}`}
                      </span>
                      <span>{t`Manifest version ${release.currentVersion}`}</span>
                    </StyledDeliveryStack>
                  </StyledReleaseItem>
                ))}
                <StyledDeliveryRow>
                  {params.get('releaseAfter') && (
                    <Link
                      to={releaseDestination(params, { releaseAfter: null })}
                    >
                      <Trans>First release page</Trans>
                    </Link>
                  )}
                  {context.nextId && (
                    <Link
                      to={releaseDestination(params, {
                        releaseAfter: context.nextId,
                      })}
                    >
                      <Trans>More releases</Trans>
                    </Link>
                  )}
                </StyledDeliveryRow>
              </>
            )}
            {releaseId && (
              <Link to={releaseDestination(params, RELEASE_CLOSE_RECORD)}>
                <Trans>Back to releases</Trans>
              </Link>
            )}
          </StyledDeliveryStack>
        )}
      </StyledReleaseBoundary>
    </StyledDeliveryStack>
  );
};
