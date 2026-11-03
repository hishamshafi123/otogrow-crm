import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import {
  type DeliveryAssistantConfigurationQuery,
  type SaveDeliveryAssistantInput,
} from '~/generated-metadata/graphql';
import { GET_ASSISTANT_CONFIGURATION } from '@/delivery/assistants/delivery-assistants.graphql';
import { assistantDestination } from '@/delivery/assistants/assistant-navigation';
import { assistantForForm } from '@/delivery/assistants/assistant-configuration';
import { type useAssistantContext } from '@/delivery/assistants/useAssistantContext';
import { type useAssistantCommands } from '@/delivery/assistants/useAssistantCommands';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { StyledAssistantBoundary } from '@/delivery/assistants/assistantStyles';
import { DeliveryAgentForm } from '@/delivery/DeliveryAgentForm';
import { type DeliveryAgent } from '@/delivery/delivery-agent.types';
import { type OtogrowRoleDirectory } from '@/otogrow-access/otogrow-access.types';
import { GET_OTOGROW_ROLE_DIRECTORY } from '@/otogrow-access/otogrow-access.graphql';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const assistantConfigurationMissing = (error: unknown) =>
  (CombinedGraphQLErrors.is(error) &&
    error.errors.some((failure) => failure.extensions?.code === 'NOT_FOUND')) ||
  (ServerError.is(error) && error.statusCode === 404);
export const AssistantConfigurationEditor = ({
  state,
  commands,
  agentId,
  createId,
  intent,
  close,
  duplicate,
  onPrivateAuthorityLost,
  releaseCreateIntent,
  restoreLogicalFocus,
}: {
  state: ReturnType<typeof useAssistantContext>;
  commands: ReturnType<typeof useAssistantCommands>;
  agentId: string | null;
  createId: string | null;
  intent: { id: string; seed?: DeliveryAgent } | null;
  close: () => void;
  duplicate: (agent: DeliveryAgent) => void;
  onPrivateAuthorityLost: () => void;
  releaseCreateIntent: (id: string) => void;
  restoreLogicalFocus: () => boolean;
}) => {
  const { t } = useLingui();
  const focusPanel = useAssistantPanelFocus(restoreLogicalFocus);
  const [params] = useSearchParams();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const source = `${state.scope}:${agentId ?? createId}`;
  const [freshCreate, setFreshCreate] = useState(intent?.id === createId);
  const [createSeed, setCreateSeed] = useState(() =>
    intent !== null && intent.id === createId ? intent.seed : undefined,
  );
  useLayoutEffect(() => {
    if (createId !== null) releaseCreateIntent(createId);
  }, [createId, releaseCreateIntent]);
  const [checking, setChecking] = useState(false);
  const [recovery, setRecovery] = useState('');
  const [frozen, setFrozen] = useState<SaveDeliveryAssistantInput | null>(null);
  const [version, setVersion] = useState(0);
  const [opened, setOpened] = useState<DeliveryAgent | null>(null);
  const [found, setFound] = useState<DeliveryAgent | null>(null);
  const [committed, setCommitted] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [privateDenied, setPrivateDenied] = useState(false);
  useDeliveryDraftStatus({
    dirty: frozen !== null,
    saving: checking || commands.busy,
  });
  const query = useQuery<DeliveryAssistantConfigurationQuery>(
    GET_ASSISTANT_CONFIGURATION,
    {
      variables: { input: { agentId }, identity: source },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      notifyOnNetworkStatusChange: true,
      skip: !state.canConfigure || agentId === null,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryAssistantConfiguration,
    source,
    enabled: state.canConfigure && agentId !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) => state.permission.matches(value) && value.id === agentId,
  });
  const directoryQuery = useQuery<{
    otogrowRoleDirectory: OtogrowRoleDirectory;
  }>(GET_OTOGROW_ROLE_DIRECTORY, {
    variables: { identity: state.scope },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !state.canConfigure,
    notifyOnNetworkStatusChange: true,
  });
  const directory =
    !directoryQuery.loading &&
    !directoryQuery.error &&
    state.permission.matches(directoryQuery.data?.otogrowRoleDirectory.actor)
      ? directoryQuery.data?.otogrowRoleDirectory
      : undefined;
  const readDenied =
    isOtogrowAccessDenied(query.error) ||
    isOtogrowAccessDenied(directoryQuery.error);
  const sourceFailed = Boolean(query.error) || Boolean(directoryQuery.error);
  const current =
    !privateDenied && !readDenied && reading.data
      ? assistantForForm(reading.data)
      : null;
  if (opened === null && current !== null) setOpened(current);
  // oxlint-disable-next-line twenty/no-state-useref -- Recovery must not publish an exact private configuration after its source or authority changed.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [source, state.canConfigure]);
  useLayoutEffect(() => {
    if (sourceFailed) epoch.current += 1;
  }, [sourceFailed]);
  const discardPrivateAuthority = useCallback(() => {
    epoch.current += 1;
    cancelPendingNavigation();
    setPrivateDenied(true);
    setOpened(null);
    setFound(null);
    setFrozen(null);
    setFreshCreate(false);
    setCreateSeed(undefined);
    setRetryAllowed(false);
    setCommitted(false);
    setVersion((value) => value + 1);
    onPrivateAuthorityLost();
  }, [cancelPendingNavigation, onPrivateAuthorityLost]);
  useLayoutEffect(() => {
    if (readDenied && !privateDenied) discardPrivateAuthority();
  }, [readDenied, privateDenied, discardPrivateAuthority]);
  const refreshCurrentAuthority = async () => {
    if (!state.canConfigure || checking) return;
    const started = epoch.current;
    setChecking(true);
    try {
      const [roles, configuration] = await Promise.all([
        directoryQuery.refetch(),
        agentId !== null ? query.refetch() : Promise.resolve(null),
      ]);
      if (
        started !== epoch.current ||
        !state.permission.matches(roles.data?.otogrowRoleDirectory.actor) ||
        (agentId !== null &&
          (!state.permission.matches(
            configuration?.data?.deliveryAssistantConfiguration,
          ) ||
            configuration?.data?.deliveryAssistantConfiguration.id !== agentId))
      )
        return;
      if (privateDenied) {
        const latest = configuration?.data?.deliveryAssistantConfiguration;
        setOpened(latest ? assistantForForm(latest) : null);
        setPrivateDenied(false);
        setVersion((value) => value + 1);
        setRecovery(
          t`Current configuration access was verified. Previous private edits were discarded after access was denied.`,
        );
      }
    } catch (error) {
      if (started === epoch.current && isOtogrowAccessDenied(error))
        discardPrivateAuthority();
    } finally {
      setChecking(false);
    }
  };
  const check = async () => {
    if (!state.canConfigure || privateDenied || sourceFailed || checking)
      return;
    const started = epoch.current;
    setChecking(true);
    setRecovery('');
    setRetryAllowed(false);
    try {
      const response =
        await query.client.query<DeliveryAssistantConfigurationQuery>({
          query: GET_ASSISTANT_CONFIGURATION,
          variables: { input: { agentId: createId ?? agentId } },
          fetchPolicy: 'no-cache',
        });
      if (
        started !== epoch.current ||
        !state.permission.matches(
          response.data?.deliveryAssistantConfiguration,
        ) ||
        response.data?.deliveryAssistantConfiguration.id !==
          (createId ?? agentId)
      )
        return;
      const saved = assistantForForm(
        response.data.deliveryAssistantConfiguration,
      );
      if (saved === null) {
        setRecovery(
          t`The saved configuration cannot be safely edited here. Refresh its current record.`,
        );
        return;
      }
      setFound(saved);
      setRecovery(
        t`This exact assistant exists. Review its current configuration before making another change.`,
      );
    } catch (error) {
      if (started !== epoch.current) return;
      if (isOtogrowAccessDenied(error)) {
        discardPrivateAuthority();
        setRecovery(
          t`Configuration access was denied. Previous private edits were discarded. Refresh current access before continuing.`,
        );
        return;
      }
      if (createId !== null && assistantConfigurationMissing(error)) {
        setFreshCreate(true);
        setRetryAllowed(true);
        setRecovery(
          t`No saved assistant was found under this exact ID. You can continue with the same request ID; a late original save cannot create another assistant.`,
        );
      } else
        setRecovery(
          t`The exact assistant could not be checked. Keep this request ID and retry the check.`,
        );
    } finally {
      setChecking(false);
    }
  };
  const available =
    state.canConfigure &&
    !sourceFailed &&
    !readDenied &&
    !privateDenied &&
    (createId !== null ? freshCreate : current !== null);
  const formAgent = createId !== null ? createSeed : (opened ?? undefined);
  return (
    <StyledDeliveryCard
      ref={focusPanel}
      tabIndex={-1}
      aria-label={t`Assistant configuration`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            <Trans>Assistant configuration</Trans>
          </h3>
          <StyledDeliveryButton
            type="button"
            disabled={commands.busy || checking}
            onClick={() => requestAction(close)}
          >
            <Trans>Close configuration</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {(frozen !== null ||
          (createId !== null && !freshCreate) ||
          found !== null) && (
          <>
            <p role="status">
              <Trans>
                Check this exact saved ID before another save. Your prepared
                inputs are kept while this page stays open.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={
                !state.canConfigure ||
                privateDenied ||
                sourceFailed ||
                checking ||
                commands.busy
              }
              onClick={() => void check()}
            >
              <Trans>Check saved assistant</Trans>
            </StyledDeliveryButton>
          </>
        )}
        {recovery && <p role="status">{recovery}</p>}
        {privateDenied && (
          <>
            <p role="status">
              <Trans>
                Configuration access was denied. Previous private edits were
                discarded.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={!state.canConfigure || checking}
              onClick={() => void refreshCurrentAuthority()}
            >
              <Trans>Refresh current configuration access</Trans>
            </StyledDeliveryButton>
          </>
        )}
        {directory === undefined &&
          state.canConfigure &&
          !privateDenied &&
          !readDenied && (
            <StyledDeliveryButton
              type="button"
              disabled={directoryQuery.loading}
              onClick={() =>
                void directoryQuery.refetch().catch(() => undefined)
              }
            >
              <Trans>Refresh team access</Trans>
            </StyledDeliveryButton>
          )}
        {found && !sourceFailed && !privateDenied && (
          <>
            <p>
              {found.configuration.name} · {t`Current version ${found.version}`}
            </p>
            {createId === null ? (
              <StyledDeliveryButton
                type="button"
                disabled={commands.busy}
                onClick={() =>
                  requestAction(() => {
                    setOpened(found);
                    setFrozen(null);
                    setRetryAllowed(false);
                    setFound(null);
                    setCommitted(false);
                    setVersion((value) => value + 1);
                    setRecovery(
                      t`The current saved configuration is open. Earlier unsaved inputs were discarded after your review.`,
                    );
                  })
                }
              >
                <Trans>Review current saved configuration</Trans>
              </StyledDeliveryButton>
            ) : (
              <Link
                to={assistantDestination(params, {
                  assistant: found.id,
                  assistantCreate: null,
                  assistantEdit: '1',
                })}
              >
                <Trans>Review current saved configuration</Trans>
              </Link>
            )}
          </>
        )}
        {agentId !== null && !available && !privateDenied && !readDenied && (
          <>
            <p role="status">
              {query.error
                ? t`The current configuration could not be verified. Private edits are hidden and retained.`
                : t`Checking the current configuration…`}
            </p>
            <StyledDeliveryButton
              type="button"
              onClick={() => void refreshCurrentAuthority()}
            >
              <Trans>Refresh configuration</Trans>
            </StyledDeliveryButton>
          </>
        )}
        {current && !committed && (
          <StyledDeliveryButton
            type="button"
            disabled={commands.busy || !available || frozen !== null}
            onClick={() => duplicate(current)}
          >
            <Trans>Duplicate assistant</Trans>
          </StyledDeliveryButton>
        )}
        <StyledAssistantBoundary
          hidden={!available || committed}
          disabled={!available || frozen !== null || commands.busy}
          inert={!available ? true : undefined}
        >
          {!committed &&
            !readDenied &&
            !privateDenied &&
            ((createId !== null && freshCreate) || opened !== null) && (
              <DeliveryAgentForm
                key={`${agentId ?? createId}:${version}`}
                agent={formAgent}
                duplicate={createId !== null && formAgent !== undefined}
                projects={state.data?.projects ?? []}
                models={state.data?.models ?? []}
                directory={directory}
                busy={commands.busy}
                readOnly={!available || frozen !== null || committed}
                latestVersion={
                  current !== null &&
                  opened !== null &&
                  current.version < opened.version
                    ? opened.version
                    : current?.version
                }
                onReload={() =>
                  requestAction(() => {
                    if (current) setOpened(current);
                    setVersion((value) => value + 1);
                  })
                }
                close={close}
                onSaved={() => undefined}
                save={async (input) => {
                  if (!available || committed || frozen !== null) return false;
                  const exact: SaveDeliveryAssistantInput = {
                    configuration: input.configuration,
                    ...(createId !== null
                      ? { createId }
                      : { id: input.id, version: input.version }),
                  };
                  setFrozen(exact);
                  const started = epoch.current;
                  const result = await commands.save(exact);
                  if (started !== epoch.current) return false;
                  if (result) {
                    setFrozen(null);
                    setCommitted(true);
                    setRecovery(
                      result.replayed
                        ? t`An earlier matching create request was recovered. Review the current saved configuration.`
                        : t`Assistant configuration saved. Existing runs keep their recorded configuration.`,
                    );
                  }
                  return result !== null;
                }}
              />
            )}
        </StyledAssistantBoundary>
        {frozen !== null && retryAllowed && !committed && (
          <StyledDeliveryButton
            type="button"
            disabled={!available || commands.busy || checking}
            onClick={async () => {
              const started = epoch.current;
              const result = await commands.save(frozen);
              if (started !== epoch.current) return;
              if (result) {
                setFrozen(null);
                setCommitted(true);
                setRecovery(
                  t`The original saved assistant was confirmed. Open its current configuration before another change.`,
                );
              }
            }}
          >
            <Trans>Retry exact original save</Trans>
          </StyledDeliveryButton>
        )}
        {committed && createId === null && (
          <StyledDeliveryButton
            type="button"
            disabled={current === null}
            onClick={() => {
              if (current !== null) {
                setOpened(current);
                setVersion((value) => value + 1);
                setCommitted(false);
                setRecovery('');
              }
            }}
          >
            <Trans>Review saved configuration</Trans>
          </StyledDeliveryButton>
        )}
        {committed && createId !== null && (
          <Link
            to={assistantDestination(params, {
              assistant: createId ?? agentId,
              assistantCreate: null,
            })}
          >
            <Trans>Open saved assistant</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
