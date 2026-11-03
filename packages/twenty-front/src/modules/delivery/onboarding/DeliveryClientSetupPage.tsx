import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { isValidUuid, fastDeepEqual } from 'twenty-shared/utils';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useClientSetup } from '@/delivery/onboarding/useClientSetup';
import { ClientSetupWizard } from '@/delivery/onboarding/ClientSetupWizard';
import { type ClientSetupContext } from '@/delivery/onboarding/client-setup.types';
import { StyledSetupBoundary } from '@/delivery/onboarding/onboardingStyles';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryCanvas,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryClientSetupPage = () => {
  const permission = useWorkflowAccess();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  // oxlint-disable-next-line twenty/no-state-useref -- A new identity must cancel queued navigation before the previous private wizard unregisters.
  const previousScope = useRef(permission.scope);
  useLayoutEffect(() => {
    if (previousScope.current !== permission.scope) cancelPendingNavigation();
    previousScope.current = permission.scope;
  }, [permission.scope, cancelPendingNavigation]);
  const [params] = useSearchParams();
  const sourceParams = new URLSearchParams(params);
  sourceParams.delete('setupCompanyRequest');
  sourceParams.delete('setupRequest');
  return <ClientSetupWorkspace key={`${permission.scope}:${sourceParams}`} />;
};
const ClientSetupWorkspace = () => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const companyId = params.get('setupCompany');
  const projectId = params.get('setupProject');
  const planId = params.get('setupPlan');
  const companyRequest = params.get('setupCompanyRequest');
  const request = params.get('setupRequest');
  const search = params.get('setupSearch') ?? '';
  const valid =
    [companyId, projectId, planId, companyRequest, request].every(
      (id) => id === null || isValidUuid(id),
    ) &&
    search.length <= 160 &&
    (!projectId || Boolean(companyId)) &&
    (!planId || Boolean(projectId));
  const state = useClientSetup(
    { companySearch: search, companyId, projectId },
    Boolean(valid),
  );
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const { authority, denyAccess } = state;
  const [privateAuthority, setPrivateAuthority] = useState<string | null>(
    state.data ? state.authority : null,
  );
  const [privateMounted, setPrivateMounted] = useState(true);
  const authorityChanged =
    privateAuthority !== null &&
    state.permission.ready &&
    privateAuthority !== state.authority;
  const confirmedLoss =
    state.denied || (state.permission.ready && !state.permission.manager);
  const [retained, setRetained] = useState<ClientSetupContext | null>(null);
  if (
    state.data &&
    !confirmedLoss &&
    !authorityChanged &&
    !fastDeepEqual(retained, state.data)
  )
    setRetained(state.data);
  if (privateAuthority === null && state.data && !confirmedLoss)
    setPrivateAuthority(state.authority);
  useLayoutEffect(() => {
    if (confirmedLoss || authorityChanged) {
      cancelPendingNavigation();
      denyAccess();
      setPrivateMounted(false);
      setRetained(null);
      if (authorityChanged) setPrivateAuthority(authority);
    }
  }, [
    confirmedLoss,
    authorityChanged,
    authority,
    denyAccess,
    cancelPendingNavigation,
  ]);
  const [version, setVersion] = useState(0);
  const current = !confirmedLoss && !authorityChanged ? state.data : null;
  const context = current ?? retained;
  const retry = async () => {
    await state.permission.refetch().catch(() => undefined);
    if (state.permission.manager && (await state.recheckAccess())) {
      setPrivateAuthority(state.authority);
      setPrivateMounted(true);
    }
  };
  return (
    <PageContainer>
      <PageBody>
        <StyledDeliveryCanvas>
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <div>
                <h1>
                  <Trans>Set up client work</Trans>
                </h1>
                <p>
                  <Trans>
                    Choose the client, review its project and service plan, then
                    optionally prepare the first task.
                  </Trans>
                </p>
              </div>
              <Link to={taskPageDestination(params, { view: 'clients' })}>
                <Trans>Back to Clients</Trans>
              </Link>
            </StyledDeliveryRow>
            {!valid && (
              <>
                <p role="alert">
                  <Trans>
                    This setup link has invalid or incomplete source selections.
                    Clear the setup selections to begin safely.
                  </Trans>
                </p>
                <Link
                  to={taskPageDestination(params, {
                    setupCompany: null,
                    setupProject: null,
                    setupPlan: null,
                    setupCompanyRequest: null,
                    setupRequest: null,
                    setupSearch: null,
                  })}
                >
                  <Trans>Clear setup selections</Trans>
                </Link>
              </>
            )}
            {state.permission.ready && !state.permission.manager && (
              <>
                <p role="alert">
                  <Trans>
                    Client work setup requires current delivery management
                    access. No client draft is shown.
                  </Trans>
                </p>
                <Link to={taskPageDestination(params, { view: 'home' })}>
                  <Trans>Go to Today</Trans>
                </Link>
              </>
            )}
            {valid &&
              !(state.permission.ready && !state.permission.manager) &&
              !current && (
                <>
                  <p
                    role={
                      state.denied ||
                      state.query.error ||
                      state.permission.error
                        ? 'alert'
                        : 'status'
                    }
                  >
                    {state.query.loading && !state.query.error
                      ? t`Checking current client setup sources…`
                      : confirmedLoss || !privateMounted
                        ? t`Setup access changed. Private preparation was cleared. Check current access before continuing; earlier saves remain recoverable from their links.`
                        : t`Current setup access or source data could not be verified. Your retained inputs are hidden and no setup will be saved.`}
                  </p>
                  <StyledDeliveryButton
                    disabled={state.query.loading || state.busy}
                    onClick={() => void retry()}
                  >
                    <Trans>Retry client setup access</Trans>
                  </StyledDeliveryButton>
                </>
              )}
            {valid && context && privateMounted && (
              <StyledSetupBoundary
                hidden={!current}
                disabled={!current}
                inert={!current || undefined}
                aria-hidden={!current || undefined}
              >
                <ClientSetupWizard
                  key={`${privateAuthority}:${version}`}
                  state={state}
                  context={context}
                  companyId={companyId}
                  projectId={projectId}
                  planId={planId}
                  initialRequestId={request}
                  companyRequestId={companyRequest}
                  onReload={() => setVersion((value) => value + 1)}
                />
              </StyledSetupBoundary>
            )}
          </StyledDeliveryStack>
        </StyledDeliveryCanvas>
      </PageBody>
    </PageContainer>
  );
};
