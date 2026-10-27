import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { DeliveryHandoffForm } from '@/delivery/handoffs/DeliveryHandoffForm';
import {
  GET_HANDOFFS,
  GET_HANDOFF_PREVIEW,
  CREATE_HANDOFF,
} from '@/delivery/handoffs/delivery-handoffs.graphql';
import {
  type DeliveryHandoffsQuery,
  type DeliveryHandoffPreviewQuery,
  type CreateDeliveryHandoffMutation,
  type DeliveryHandoffCreateInput,
} from '~/generated-metadata/graphql';
type DeliveryHandoffsProps = {
  workspace: DeliveryWorkspace;
  onCreated: (engagementId: string) => Promise<unknown>;
};
export const DeliveryHandoffs = ({
  workspace,
  onCreated,
}: DeliveryHandoffsProps) => {
  const access = useWorkflowAccess();
  return (
    <HandoffDirectory
      key={access.scope}
      workspace={workspace}
      onCreated={onCreated}
    />
  );
};
type HandoffDirectoryProps = DeliveryHandoffsProps;
const HandoffDirectory = ({ workspace, onCreated }: HandoffDirectoryProps) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const { requestAction } = useDeliveryDraftGuard();
  const permitted =
    access.manager &&
    (access.access?.capabilities.includes('finance.read') === true ||
      access.access?.capabilities.includes('finance.manage') === true ||
      access.access?.capabilities.includes('workspace.admin') === true);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [selected, setSelected] = useState<{
    opportunityId: string;
    quoteId: string;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery<DeliveryHandoffsQuery>(GET_HANDOFFS, {
    variables: { search, identity: access.scope },
    skip: !permitted || !expanded,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
  });
  const preview = useQuery<DeliveryHandoffPreviewQuery>(GET_HANDOFF_PREVIEW, {
    variables: { input: selected, identity: access.scope },
    skip: !permitted || !selected,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
  });
  const [create] = useMutation<CreateDeliveryHandoffMutation>(CREATE_HANDOFF);
  const data =
    permitted &&
    !query.error &&
    access.matches(query.data?.deliveryHandoffs) &&
    query.data?.deliveryHandoffs.search === search
      ? query.data.deliveryHandoffs
      : null;
  const candidate = preview.data?.deliveryHandoffPreview;
  const source =
    permitted &&
    !preview.error &&
    access.matches(candidate) &&
    candidate?.source.opportunityId === selected?.opportunityId &&
    candidate?.source.quoteId === selected?.quoteId
      ? candidate?.source
      : undefined;
  const [opened, setOpened] = useState<
    DeliveryHandoffPreviewQuery['deliveryHandoffPreview']['source'] | null
  >(null);
  const save = async (input: DeliveryHandoffCreateInput) => {
    if (!source || !permitted) return false;
    try {
      const result = await create({ variables: { input } });
      const saved = result.data?.createDeliveryHandoff;
      if (!saved) return false;
      setNotice(
        t`Client setup created. Onboarding, billing confirmation and first-period planning are still pending.`,
      );
      try {
        await onCreated(saved.engagementId);
        await query.refetch();
      } catch {
        setNotice(
          t`Client setup was created. Refresh the page to load the engagement and its setup tasks.`,
        );
      }
      return true;
    } catch {
      try {
        await preview.refetch();
      } catch {}
      return false;
    }
  };
  if (!permitted) return null;
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <div>
            <h2>
              <Trans>Sales to delivery</Trans>
            </h2>
            <p>
              <Trans>
                Bring a won deal and accepted scope into client setup.
              </Trans>
            </p>
          </div>
          <StyledDeliveryButton
            onClick={() =>
              requestAction(() => {
                setExpanded(!expanded);
                setSelected(null);
                setOpened(null);
              })
            }
          >
            {expanded ? t`Close sales handoff` : t`Start from a won deal`}
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {notice && <p role="status">{notice}</p>}
        {expanded && (
          <>
            {!opened && (
              <form
                aria-label={t`Find a won deal`}
                onSubmit={(event) => {
                  event.preventDefault();
                  setSelected(null);
                  const nextSearch = searchDraft.trim();
                  if (nextSearch === search)
                    void query.refetch().catch(() => undefined);
                  else setSearch(nextSearch);
                }}
              >
                <StyledDeliveryRow>
                  <label>
                    <Trans>Deal name</Trans>
                    <input
                      value={searchDraft}
                      maxLength={160}
                      onChange={(event) => setSearchDraft(event.target.value)}
                    />
                  </label>
                  <StyledDeliveryButton type="submit">
                    <Trans>Find won deals</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
              </form>
            )}
            {query.error && (
              <div role="alert">
                <p>
                  <Trans>
                    Won deals are unavailable. Check your CRM access and retry.
                  </Trans>
                </p>
                <StyledDeliveryButton
                  onClick={() => void query.refetch().catch(() => undefined)}
                >
                  <Trans>Retry won deals</Trans>
                </StyledDeliveryButton>
              </div>
            )}
            {!data && !query.error && (
              <p role="status">
                <Trans>Loading won deals…</Trans>
              </p>
            )}
            {data && !opened && (
              <>
                {data.hasMore && (
                  <p>
                    <Trans>
                      Showing a limited set of matches. Narrow the deal name to
                      find older work.
                    </Trans>
                  </p>
                )}
                {!data.opportunities.length && (
                  <p>
                    <Trans>
                      No won deals match. Mark the agreed opportunity as
                      Customer in the CRM and attach an accepted quote.
                    </Trans>
                  </p>
                )}
                {data.opportunities.map((deal) => {
                  const existing = data.handoffs.find(
                    (row) => row.opportunityId === deal.id,
                  );
                  return (
                    <section key={deal.id} aria-label={deal.name}>
                      <strong>{deal.name}</strong>
                      {existing ? (
                        <>
                          <p>
                            <Trans>
                              Already handed into delivery. Review the setup
                              tasks before starting production.
                            </Trans>
                          </p>
                          <StyledDeliveryButton
                            onClick={() =>
                              void onCreated(existing.engagementId).catch(() =>
                                setNotice(
                                  t`The client engagement could not be loaded. Refresh and try again.`,
                                ),
                              )
                            }
                          >
                            <Trans>Open client engagement</Trans>
                          </StyledDeliveryButton>
                          {existing.setupTaskIds.map((taskId, index) => {
                            const task = workspace.tasks.find(
                              (item) => item.id === taskId,
                            );
                            const labels = [
                              t`Brand onboarding`,
                              t`Billing confirmation`,
                              t`First-period planning`,
                            ];
                            return (
                              <p key={taskId}>
                                <Link
                                  to={`/delivery?view=planner&task=${taskId}`}
                                >
                                  {task?.title ??
                                    labels[index] ??
                                    t`Setup task`}
                                </Link>{' '}
                                ·{' '}
                                {task?.details.state === 'APPROVED'
                                  ? t`Internally approved`
                                  : task
                                    ? t`Pending setup`
                                    : t`Check current task access`}
                              </p>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          {!deal.hasCompany && (
                            <p>
                              <Trans>
                                Link this deal to a client company in the CRM
                                first.
                              </Trans>
                            </p>
                          )}
                          {!deal.quotes.length && (
                            <p>
                              <Trans>
                                No accepted quote is available. Confirm the
                                quote with the client and record its acceptance
                                in the CRM.
                              </Trans>
                            </p>
                          )}
                          <StyledDeliveryRow>
                            {deal.quotes.map((quote) => (
                              <StyledDeliveryButton
                                key={quote.id}
                                disabled={!deal.hasCompany}
                                onClick={() => {
                                  setNotice('');
                                  setSelected({
                                    opportunityId: deal.id,
                                    quoteId: quote.id,
                                  });
                                }}
                              >{t`Review ${quote.name}`}</StyledDeliveryButton>
                            ))}
                          </StyledDeliveryRow>
                        </>
                      )}
                    </section>
                  );
                })}
              </>
            )}
            {selected && !opened && (
              <>
                {preview.error ? (
                  <div role="alert">
                    <p>
                      <Trans>
                        The selected deal or quote cannot be used. Check its
                        current company, won/accepted status, scope length and
                        CRM permissions.
                      </Trans>
                    </p>
                    <StyledDeliveryButton
                      onClick={() =>
                        void preview.refetch().catch(() => undefined)
                      }
                    >
                      <Trans>Retry accepted scope</Trans>
                    </StyledDeliveryButton>
                  </div>
                ) : !source ? (
                  <p role="status">
                    <Trans>Loading accepted scope…</Trans>
                  </p>
                ) : (
                  <StyledDeliveryStack>
                    <h3>
                      {source.companyName} · {source.quoteNumber}
                    </h3>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{source.scope}</p>
                    <StyledDeliveryButton onClick={() => setOpened(source)}>
                      <Trans>Set delivery owners and next steps</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryStack>
                )}
              </>
            )}
            {opened && (
              <div hidden={!source}>
                <DeliveryHandoffForm
                  key={`${opened.opportunityId}:${opened.quoteId}`}
                  source={opened}
                  latest={source}
                  ready={Boolean(source) && permitted}
                  workspace={workspace}
                  onSave={save}
                  onClose={() => {
                    setOpened(null);
                    setSelected(null);
                  }}
                />
              </div>
            )}
            {opened && !source && (
              <div role="alert">
                <p>
                  <Trans>
                    The source could not be verified. Your choices are
                    preserved; reload the accepted quote before saving.
                  </Trans>
                </p>
                <StyledDeliveryButton
                  onClick={() => void preview.refetch().catch(() => undefined)}
                >
                  <Trans>Retry accepted scope</Trans>
                </StyledDeliveryButton>
              </div>
            )}
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
