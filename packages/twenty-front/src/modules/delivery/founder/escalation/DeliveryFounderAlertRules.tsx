import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NetworkStatus } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual, isValidUuid } from 'twenty-shared/utils';
import {
  type AcknowledgeDeliveryFounderEscalationMutation,
  type ChangeDeliveryFounderEscalationRuleMutation,
  type DeliveryFounderEscalationAcknowledgeInput,
  type DeliveryFounderEscalationRuleSaveInput,
  type DeliveryFounderEscalationRuleStateInput,
  type DeliveryFounderEscalationsQuery,
  type SaveDeliveryFounderEscalationRuleMutation,
} from '~/generated-metadata/graphql';
import {
  ACKNOWLEDGE_DELIVERY_FOUNDER_ESCALATION,
  CHANGE_DELIVERY_FOUNDER_ESCALATION_RULE,
  GET_DELIVERY_FOUNDER_ESCALATIONS,
  SAVE_DELIVERY_FOUNDER_ESCALATION_RULE,
} from '@/delivery/founder/escalation/delivery-founder-escalation.graphql';
import { type EscalationSnapshot } from '@/delivery/founder/escalation/escalation.types';
import {
  escalationDestination,
  founderQueueDestination,
} from '@/delivery/founder/escalation/escalation-navigation';
import { EscalationRuleForm } from '@/delivery/founder/escalation/EscalationRuleForm';
import { EscalationRuleSummary } from '@/delivery/founder/escalation/EscalationRuleSummary';
import { EscalationFollowUpOwner } from '@/delivery/founder/escalation/EscalationFollowUpOwner';
import { EscalationSetupStatus } from '@/delivery/founder/escalation/EscalationSetupStatus';
import { EscalationHistory } from '@/delivery/founder/escalation/EscalationHistory';
import { EscalationEnableReview } from '@/delivery/founder/escalation/EscalationEnableReview';
import { EscalationConfirmForm } from '@/delivery/founder/escalation/EscalationConfirmForm';
import {
  StyledEscalationBoundary,
  StyledEscalationEntry,
} from '@/delivery/founder/escalation/escalationStyles';
import { useEscalationLabels } from '@/delivery/founder/escalation/useEscalationLabels';
import { useEscalationRequestGuard } from '@/delivery/founder/escalation/useEscalationRequestGuard';
import { FounderExceptionRow } from '@/delivery/founder/FounderExceptionRow';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryFounderAlertRules = () => {
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const [verified, setVerified] = useState({
    scope: permission.scope,
    admin: permission.ready && permission.canManageRoles,
  });
  const retainedAdmin = permission.denied
    ? false
    : permission.ready
      ? permission.canManageRoles
      : verified.scope === permission.scope && verified.admin;
  if (verified.scope !== permission.scope || verified.admin !== retainedAdmin)
    setVerified({ scope: permission.scope, admin: retainedAdmin });
  return (
    <AlertRulesWorkspace
      key={`${permission.scope}:${retainedAdmin}:${params}`}
      permission={permission}
    />
  );
};
type AlertRulesWorkspaceProps = {
  permission: ReturnType<typeof useWorkflowAccess>;
};
const AlertRulesWorkspace = ({ permission }: AlertRulesWorkspaceProps) => {
  const { t } = useLingui();
  const labels = useEscalationLabels();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const [params] = useSearchParams();
  const ruleId = params.get('founderRule');
  const episodeId = params.get('founderIssue');
  const identifiers = [
    ruleId,
    episodeId,
    params.get('founderRulesAfter'),
    params.get('founderIssuesAfter'),
    params.get('founderNoticesAfter'),
  ];
  const valid = identifiers.every((id) => !id || isValidUuid(id));
  const authorized = permission.ready && permission.canManageRoles;
  const query = useQuery<DeliveryFounderEscalationsQuery>(
    GET_DELIVERY_FOUNDER_ESCALATIONS,
    {
      variables: {
        input: {
          ruleId: ruleId || undefined,
          episodeId: episodeId || undefined,
          afterRuleId: params.get('founderRulesAfter') || undefined,
          afterEpisodeId: params.get('founderIssuesAfter') || undefined,
          afterNoticeId: params.get('founderNoticesAfter') || undefined,
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !authorized || !valid,
    },
  );
  const candidate = query.data?.deliveryFounderEscalations;
  const matches = (snapshot: EscalationSnapshot) =>
    permission.matches(snapshot) &&
    snapshot.canReadFinance === permission.canReadFinance &&
    (permission.canReadFinance ||
      !snapshot.episodes.some(
        (episode) => episode.source.domain === 'FINANCE',
      ));
  const trusted =
    authorized && valid && !query.error && (!candidate || matches(candidate));
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  const [lastVerified, setLastVerified] = useState<EscalationSnapshot | null>(
    null,
  );
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
    matches(lastVerified)
      ? lastVerified
      : null);
  const available = Boolean(data);
  const retained = fresh ?? lastVerified;
  const rule = retained?.rules.find((item) => item.id === ruleId);
  const episode = retained?.episodes.find((item) => item.id === episodeId);
  const [editor, setEditor] = useState<{
    kind: 'rule' | 'enable' | 'pause' | 'ack';
    ruleId?: string;
  } | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveRule] = useMutation<SaveDeliveryFounderEscalationRuleMutation>(
    SAVE_DELIVERY_FOUNDER_ESCALATION_RULE,
  );
  const [changeRule] = useMutation<ChangeDeliveryFounderEscalationRuleMutation>(
    CHANGE_DELIVERY_FOUNDER_ESCALATION_RULE,
  );
  const [acknowledge] =
    useMutation<AcknowledgeDeliveryFounderEscalationMutation>(
      ACKNOWLEDGE_DELIVERY_FOUNDER_ESCALATION,
    );
  const startRequest = useEscalationRequestGuard(
    permission.scope,
    available && authorized,
  );
  const destination = (changes: Record<string, string | null>) =>
    escalationDestination(params, changes);
  const open = (
    kind: NonNullable<typeof editor>['kind'],
    selectedRuleId?: string,
  ) =>
    requestAction(() => {
      setEditor({ kind, ruleId: selectedRuleId });
      setVersion((value) => value + 1);
      setError('');
    });
  const refresh = async () => {
    try {
      const response = await query.refetch();
      if (
        !authorized ||
        !response.data?.deliveryFounderEscalations ||
        !matches(response.data.deliveryFounderEscalations)
      )
        throw new Error();
      return true;
    } catch {
      setError(
        t`Alert rules could not refresh. Previous information is hidden and your draft is kept.`,
      );
      return false;
    }
  };
  const reload = async () => {
    if (await refresh()) setVersion((value) => value + 1);
  };
  const save = async (input: DeliveryFounderEscalationRuleSaveInput) => {
    if (!available || !authorized || busy) return false;
    const current = startRequest();
    setBusy(true);
    setError('');
    try {
      const result = (await saveRule({ variables: { input } })).data
        ?.saveDeliveryFounderEscalationRule;
      if (!current()) return false;
      if (!result) throw new Error(t`The paused rule save was not confirmed.`);
      setEditor(null);
      setNotice(
        result.replayed
          ? t`This earlier request was processed. Review the current saved rule and history.`
          : t`Rule saved paused. Review and enable it separately.`,
      );
      navigate(
        destination({
          founderRule: result.rule.id,
          founderIssue: null,
          founderRulesAfter: null,
          founderIssuesAfter: null,
          founderNoticesAfter: null,
        }),
      );
      void refresh();
      return true;
    } catch (failure) {
      if (current())
        setError(
          failure instanceof Error
            ? failure.message
            : t`The rule could not be saved. Your request is kept.`,
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const change = async (input: DeliveryFounderEscalationRuleStateInput) => {
    if (!available || !authorized || busy) return false;
    const current = startRequest();
    setBusy(true);
    setError('');
    try {
      const result = (await changeRule({ variables: { input } })).data
        ?.changeDeliveryFounderEscalationRule;
      if (!current()) return false;
      if (!result) throw new Error(t`The rule state was not confirmed.`);
      setEditor(null);
      setNotice(
        result.rule.enabled
          ? t`The current rule is enabled. Inspect actual occurrence receipts for delivery outcomes.`
          : t`The current rule is paused. Source issues are unchanged.`,
      );
      await refresh();
      return true;
    } catch (failure) {
      if (current())
        setError(
          failure instanceof Error
            ? failure.message
            : t`The rule state could not be confirmed. Your request is kept.`,
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const ack = async (input: DeliveryFounderEscalationAcknowledgeInput) => {
    if (!available || !authorized || busy) return false;
    const current = startRequest();
    setBusy(true);
    setError('');
    try {
      const result = (await acknowledge({ variables: { input } })).data
        ?.acknowledgeDeliveryFounderEscalation;
      if (!current()) return false;
      if (!result) throw new Error(t`The acknowledgement was not confirmed.`);
      setEditor(null);
      setNotice(
        t`Acknowledgement recorded. Repeats stop; the original task, fulfilment or financial source is unchanged.`,
      );
      await refresh();
      return true;
    } catch (failure) {
      if (current())
        setError(
          failure instanceof Error
            ? failure.message
            : t`The acknowledgement could not be confirmed. Your request is kept.`,
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const editingRule = editor?.ruleId
    ? retained?.rules.find((item) => item.id === editor.ruleId)
    : null;
  const focusEditor = useCallback((element: HTMLFieldSetElement | null) => {
    element?.focus();
    element?.scrollIntoView?.({ block: 'start' });
  }, []);
  const editorContent = (
    <>
      <StyledEscalationBoundary
        hidden={!available}
        disabled={!available || busy}
      >
        {editor?.kind === 'rule' &&
          retained &&
          (!editor.ruleId || editingRule) && (
            <EscalationRuleForm
              key={version}
              initial={editingRule ?? null}
              catalog={retained}
              identity={permission.scope}
              readOnly={!available || !authorized || busy}
              onSave={save}
              onCancel={() => setEditor(null)}
              onReload={() => void reload()}
            />
          )}
        {editor?.kind === 'pause' && editingRule && (
          <EscalationConfirmForm
            key={version}
            title={t`Pause founder alert rule`}
            description={t`Pausing stops future eligible sends from this rule. It does not resolve source issues or undo messages already claimed by the sender.`}
            confirmLabel={t`Pause this rule without changing its original sources.`}
            submitLabel={t`Pause this rule`}
            signature={`${editingRule.id}:${editingRule.revision}:${editingRule.enabled}`}
            identity={permission.scope}
            readOnly={!available || !authorized || busy}
            canConfirm={editingRule.enabled}
            buildInput={(commandId, reason) => ({
              commandId,
              ruleId: editingRule.id,
              revision: editingRule.revision,
              enabled: false,
              previewToken: null,
              adoptLegacyRouting: false,
              reason,
            })}
            onSave={change}
            onCancel={() => setEditor(null)}
            onReload={() => void reload()}
          />
        )}
        {editor?.kind === 'ack' && episode && (
          <EscalationConfirmForm
            key={version}
            title={t`Acknowledge observed issue`}
            description={t`Acknowledgement stops repeats for this observed issue. It does not mark work delivered, clear a client promise or change financial sources.`}
            confirmLabel={t`Stop repeats without marking the original source resolved.`}
            submitLabel={t`Acknowledge issue`}
            signature={`${episode.id}:${episode.revision}:${episode.acknowledgedAt}`}
            identity={permission.scope}
            readOnly={!available || !authorized || busy}
            canConfirm={
              !episode.acknowledgedAt &&
              ['OPEN', 'UNAVAILABLE'].includes(episode.status)
            }
            buildInput={(commandId, reason) => ({
              commandId,
              episodeId: episode.id,
              revision: episode.revision,
              reason,
            })}
            onSave={ack}
            onCancel={() => setEditor(null)}
            onReload={() => void reload()}
          />
        )}
      </StyledEscalationBoundary>
      {editor?.kind === 'enable' && editingRule && retained && (
        <EscalationEnableReview
          key={version}
          rule={editingRule}
          projects={retained.projects}
          routingAdopted={retained.routingAdopted}
          identity={permission.scope}
          enabled={available && authorized && !busy}
          onSave={change}
          onCancel={() => setEditor(null)}
          onReload={() => void reload()}
        />
      )}
    </>
  );
  if (permission.ready && !permission.canManageRoles)
    return (
      <p>
        <Trans>
          Current administrator access is required to configure founder alerts.
        </Trans>
      </p>
    );
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>
            <Trans>Founder alert rules</Trans>
          </h2>
          <StyledDeliveryButton
            disabled={!available || busy}
            data-primary="true"
            onClick={() => open('rule')}
          >
            <Trans>New paused rule</Trans>
          </StyledDeliveryButton>
          <Link to={founderQueueDestination(params)}>
            <Trans>Back to Needs attention</Trans>
          </Link>
          <StyledDeliveryButton
            disabled={busy || query.loading || !valid}
            onClick={() => void refresh()}
          >
            <Trans>Refresh alert rules</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {editor && (
          <StyledEscalationBoundary
            key={version}
            hidden={!available}
            disabled={!available || busy}
            role="region"
            aria-label={
              editor.kind === 'rule'
                ? editor.ruleId
                  ? t`Edit founder alert rule`
                  : t`New founder alert rule`
                : editor.kind === 'enable'
                  ? t`Enable founder alert rule`
                  : editor.kind === 'pause'
                    ? t`Pause founder alert rule`
                    : t`Acknowledge observed issue`
            }
            tabIndex={-1}
            ref={focusEditor}
          >
            {editorContent}
          </StyledEscalationBoundary>
        )}
        <p>
          <Trans>
            Configure factual Telegram alerts. Save paused, preview, then
            enable.
          </Trans>
        </p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {!permission.ready && (
          <p role="status">
            <Trans>
              Current overview access could not be checked. Saved information is
              hidden and your draft is kept.
            </Trans>{' '}
            <StyledDeliveryButton
              onClick={() => void permission.refetch().catch(() => undefined)}
            >
              <Trans>Retry alert-rule access</Trans>
            </StyledDeliveryButton>
          </p>
        )}
        {!valid && (
          <p role="alert">
            <Trans>
              The alert-rule link has an invalid identity. Return to the rule
              list.
            </Trans>{' '}
            <Link
              to={destination({
                founderRule: null,
                founderIssue: null,
                founderRulesAfter: null,
                founderIssuesAfter: null,
                founderNoticesAfter: null,
              })}
            >
              <Trans>All alert rules</Trans>
            </Link>
          </p>
        )}
        {query.error && (
          <p role="alert">
            <Trans>
              Alert rules and receipts could not be checked. Previous data is
              hidden; retry before making a change.
            </Trans>
          </p>
        )}
        {query.error && valid && identifiers.some(Boolean) && (
          <Link
            to={destination({
              founderRule: null,
              founderIssue: null,
              founderRulesAfter: null,
              founderIssuesAfter: null,
              founderNoticesAfter: null,
            })}
          >
            <Trans>All alert rules</Trans>
          </Link>
        )}
        {!data && !query.error && permission.ready && valid && (
          <p role="status">
            <Trans>Checking current alert rules…</Trans>
          </p>
        )}
        {data && (
          <>
            <small>
              {t`Data checked at`}:{' '}
              {new Date(data.observedAt).toLocaleString(undefined, {
                timeZone: 'UTC',
              })}{' '}
              UTC
            </small>
            {refreshing && (
              <p role="status">
                <Trans>
                  Refreshing; showing the last verified alert-rule check.
                </Trans>
              </p>
            )}
            <EscalationSetupStatus snapshot={data} rule={rule} />
            <StyledDeliveryRow>
              {ruleId && (
                <Link
                  to={destination({
                    founderRule: null,
                    founderIssue: null,
                    founderRulesAfter: null,
                    founderIssuesAfter: null,
                    founderNoticesAfter: null,
                  })}
                >
                  <Trans>All alert rules</Trans>
                </Link>
              )}
            </StyledDeliveryRow>
            {!data.rules.length && (
              <p>
                <Trans>
                  No rules in this selection. No recipient or enabled rule is
                  assumed.
                </Trans>
              </p>
            )}
            {data.rules.map((item) => (
              <StyledEscalationEntry key={item.id}>
                <EscalationRuleSummary rule={item} projects={data.projects} />
                <Link
                  to={destination({
                    founderRule: item.id,
                    founderIssue: null,
                    founderIssuesAfter: null,
                    founderNoticesAfter: null,
                  })}
                >
                  <Trans>Open rule and receipts</Trans>
                </Link>
                {item.id === ruleId && (
                  <StyledDeliveryRow>
                    <StyledDeliveryButton onClick={() => open('rule', item.id)}>
                      <Trans>Edit and save paused</Trans>
                    </StyledDeliveryButton>
                    <StyledDeliveryButton
                      onClick={() =>
                        open(item.enabled ? 'pause' : 'enable', item.id)
                      }
                    >
                      {item.enabled ? t`Pause this rule` : t`Review and enable`}
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                )}
              </StyledEscalationEntry>
            ))}
            {data.nextRuleId && (
              <Link to={destination({ founderRulesAfter: data.nextRuleId })}>
                <Trans>More rules</Trans>
              </Link>
            )}
            {params.has('founderRulesAfter') && (
              <Link to={destination({ founderRulesAfter: null })}>
                <Trans>First rules page</Trans>
              </Link>
            )}
            {ruleId && !rule && (
              <p role="alert">
                <Trans>
                  This rule is unavailable. Choose a currently permitted rule.
                </Trans>
              </p>
            )}
            <section aria-label={t`Observed alert issues`}>
              <h3>
                <Trans>Observed issues</Trans>
              </h3>
              {!data.episodes.length && (
                <p>
                  <Trans>
                    No observed issues on this page. Previewing a rule does not
                    create an issue or notification.
                  </Trans>
                </p>
              )}
              {data.episodes.map((item) => (
                <StyledEscalationEntry key={item.id}>
                  <EscalationFollowUpOwner
                    rule={data.rules.find(
                      (current) => current.id === item.ruleId,
                    )}
                  />
                  <strong>{item.title}</strong>
                  <p>
                    {labels.reason(item.condition)} ·{' '}
                    {labels.status(item.status)}
                  </p>
                  <small>
                    {t`First observed`}:{' '}
                    {new Date(item.firstSeenAt).toLocaleString(undefined, {
                      timeZone: 'UTC',
                    })}{' '}
                    UTC · {t`Last observed`}:{' '}
                    {new Date(item.lastSeenAt).toLocaleString(undefined, {
                      timeZone: 'UTC',
                    })}{' '}
                    UTC
                  </small>
                  {item.acknowledgedAt && (
                    <p>
                      {t`Acknowledged by`}:{' '}
                      {item.acknowledgedByName || t`Administrator`} ·{' '}
                      {new Date(item.acknowledgedAt).toLocaleString(undefined, {
                        timeZone: 'UTC',
                      })}{' '}
                      UTC · {item.acknowledgementReason}
                      <br />
                      <Trans>
                        Acknowledgement stops repeats; it does not resolve the
                        source.
                      </Trans>
                    </p>
                  )}
                  {item.resolvedAt && (
                    <p>
                      {t`Source observed clear at`}:{' '}
                      {new Date(item.resolvedAt).toLocaleString(undefined, {
                        timeZone: 'UTC',
                      })}{' '}
                      UTC
                    </p>
                  )}
                  {item.id === episodeId ? (
                    <>
                      <details>
                        <summary>
                          <Trans>Last observed issue evidence</Trans>
                        </summary>
                        <FounderExceptionRow item={item.source} />
                      </details>
                      {!item.acknowledgedAt &&
                        ['OPEN', 'UNAVAILABLE'].includes(item.status) && (
                          <StyledDeliveryButton onClick={() => open('ack')}>
                            <Trans>Acknowledge and stop repeats</Trans>
                          </StyledDeliveryButton>
                        )}
                    </>
                  ) : (
                    <Link
                      to={destination({
                        founderRule: item.ruleId,
                        founderIssue: item.id,
                        founderIssuesAfter: null,
                        founderNoticesAfter: null,
                      })}
                    >
                      <Trans>Open issue and occurrence receipts</Trans>
                    </Link>
                  )}
                </StyledEscalationEntry>
              ))}
              {data.nextEpisodeId && (
                <Link
                  to={destination({ founderIssuesAfter: data.nextEpisodeId })}
                >
                  <Trans>More observed issues</Trans>
                </Link>
              )}
              {params.has('founderIssuesAfter') && (
                <Link to={destination({ founderIssuesAfter: null })}>
                  <Trans>First observed issues</Trans>
                </Link>
              )}
              {episodeId && !episode && (
                <p role="alert">
                  <Trans>
                    This issue is unavailable in the current selection.
                  </Trans>
                </p>
              )}
            </section>
            <EscalationHistory
              notices={data.notices}
              destination={destination}
              nextNoticeId={data.nextNoticeId}
              hasCursor={params.has('founderNoticesAfter')}
            />
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
