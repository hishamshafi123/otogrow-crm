import { useQuery, useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryKnowledgeForm } from '@/delivery/knowledge/DeliveryKnowledgeForm';
import { useKnowledgeCategories } from '@/delivery/knowledge/useKnowledgeCategories';
import {
  GET_DELIVERY_KNOWLEDGE,
  SAVE_DELIVERY_KNOWLEDGE,
  PUBLISH_DELIVERY_KNOWLEDGE,
} from '@/delivery/knowledge/delivery-knowledge.graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryKnowledgeQuery,
  type DeliveryKnowledgeQueryVariables,
  type DeliveryKnowledgeSaveInput,
  type SaveDeliveryKnowledgeMutation,
  type SaveDeliveryKnowledgeMutationVariables,
  type PublishDeliveryKnowledgeMutationVariables,
} from '~/generated-metadata/graphql';

type DeliveryKnowledgeProps = { workspace: DeliveryWorkspace };
export const DeliveryKnowledge = ({ workspace }: DeliveryKnowledgeProps) => {
  const permission = useWorkflowAccess();
  return (
    <DeliveryKnowledgeWorkspace
      key={permission.scope}
      workspace={workspace}
      permission={permission}
    />
  );
};
export const DeliveryKnowledgeWorkspace = ({
  workspace,
  permission,
}: DeliveryKnowledgeProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const categories = useKnowledgeCategories();
  const [params, setParams] = useSearchParams();
  const { requestAction } = useDeliveryDraftGuard();
  const projectId = params.get('project') ?? '';
  const sourceId = params.get('source');
  const [editing, setEditing] = useState<DeliveryKnowledgeSaveInput | null>(
    null,
  );
  const [error, setError] = useState('');
  const query = useQuery<
    DeliveryKnowledgeQuery,
    DeliveryKnowledgeQueryVariables
  >(GET_DELIVERY_KNOWLEDGE, {
    variables: {
      input: {
        projectId,
        sourceId,
        after: params.get('knowledgeAfter'),
        category: params.get('knowledgeCategory'),
        search: params.get('knowledgeSearch'),
        version: params.get('knowledgeVersion')
          ? Number(params.get('knowledgeVersion'))
          : null,
      },
    },
    skip: !projectId || !permission.ready,
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
  });
  const data =
    !query.error &&
    !query.loading &&
    permission.matches(query.data?.deliveryKnowledge)
      ? query.data?.deliveryKnowledge
      : undefined;
  const [save, saving] = useMutation<
    SaveDeliveryKnowledgeMutation,
    SaveDeliveryKnowledgeMutationVariables
  >(SAVE_DELIVERY_KNOWLEDGE);
  const [publish, publishing] = useMutation<
    unknown,
    PublishDeliveryKnowledgeMutationVariables
  >(PUBLISH_DELIVERY_KNOWLEDGE);
  const updatedParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return next;
  };
  const navigate = (updates: Record<string, string | null>) =>
    requestAction(() => {
      setEditing(null);
      setError('');
      setParams(updatedParams(updates));
    });
  const detail = data?.detail;
  const busy = saving.loading || publishing.loading;
  const initial =
    editing && detail?.id === editing.id
      ? {
          ...editing,
          revision: detail.revision,
          title: detail.title,
          category: detail.category,
          meetingDate: detail.meetingDate,
          sourceUrl: detail.sourceUrl,
          transcript: detail.transcript ?? '',
          knowledge: detail.knowledge,
        }
      : editing;
  const close = () => requestAction(() => setEditing(null));
  const addSource = (category: string) =>
    requestAction(() =>
      setEditing({
        id: crypto.randomUUID(),
        projectId,
        revision: 0,
        category,
        title: '',
        meetingDate: new Date().toLocaleDateString('en-CA'),
        sourceUrl: '',
        transcript: '',
        knowledge: '',
      }),
    );
  const publishVersion = async (publishValue: boolean) => {
    if (!detail || !data?.canPublish) return;
    setError('');
    try {
      await publish({
        variables: {
          input: {
            id: detail.id,
            projectId,
            revision: detail.revision,
            publish: publishValue,
          },
        },
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not update published knowledge.`,
      );
      return;
    }
    try {
      await query.refetch();
    } catch {
      setError(t`Publication was saved. Refresh before making another change.`);
    }
  };
  if (permission.ready && workspace.projects.length === 0)
    return (
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <h2>
            <Trans>A project keeps brand knowledge with the right team</Trans>
          </h2>
          {permission.manager ? (
            <>
              <p>
                <Trans>
                  Set up the client project and its team, then add brand
                  knowledge here.
                </Trans>
              </p>
              <Link to="/delivery?view=team">
                <Trans>Set up your first project</Trans>
              </Link>
            </>
          ) : (
            <p>
              <Trans>
                Ask your project manager to assign you to a project before
                adding brand knowledge.
              </Trans>
            </p>
          )}
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    );
  return (
    <StyledDeliveryStack>
      <p>
        <Trans>
          Keep brand facts, claims, visual rules, references, reusable prompts
          and meeting decisions with this project's team and task assistants.
          Other projects do not receive it automatically.
        </Trans>
      </p>
      <StyledDeliveryRow>
        <label>
          <Trans>Client project</Trans>
          <select
            value={projectId}
            onChange={(event) =>
              navigate({
                project: event.target.value,
                source: null,
                knowledgeAfter: null,
                knowledgeVersion: null,
              })
            }
          >
            <option value="">{t`Choose a project`}</option>
            {workspace.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <StyledDeliveryButton
          disabled={!data || busy}
          data-primary="true"
          onClick={() => addSource('BRAND_FACTS')}
        >
          <Trans>Add knowledge</Trans>
        </StyledDeliveryButton>
        <StyledDeliveryButton
          disabled={!data || busy}
          onClick={() => addSource('MEETING')}
        >
          <Trans>Add meeting</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {projectId && !editing && (
        <StyledDeliveryRow>
          <label>
            <Trans>Filter category</Trans>
            <select
              value={params.get('knowledgeCategory') ?? ''}
              onChange={(event) =>
                navigate({
                  knowledgeCategory: event.target.value || null,
                  knowledgeAfter: null,
                  source: null,
                  knowledgeVersion: null,
                })
              }
            >
              <option value="">{t`All knowledge`}</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <form
            aria-label={t`Search brand knowledge`}
            onSubmit={(event) => {
              event.preventDefault();
              const search = String(
                new FormData(event.currentTarget).get('knowledgeSearch') ?? '',
              ).trim();
              navigate({
                knowledgeSearch: search || null,
                knowledgeAfter: null,
                source: null,
                knowledgeVersion: null,
              });
            }}
          >
            <StyledDeliveryRow>
              <label>
                <Trans>Find title or reviewed text</Trans>
                <input
                  key={params.get('knowledgeSearch') ?? ''}
                  name="knowledgeSearch"
                  maxLength={160}
                  defaultValue={params.get('knowledgeSearch') ?? ''}
                />
              </label>
              <StyledDeliveryButton type="submit">
                <Trans>Search knowledge</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          </form>
          {(params.has('knowledgeSearch') ||
            params.has('knowledgeCategory')) && (
            <Link
              to={{
                search: updatedParams({
                  knowledgeSearch: null,
                  knowledgeCategory: null,
                  knowledgeAfter: null,
                  source: null,
                  knowledgeVersion: null,
                }).toString(),
              }}
            >
              <Trans>Clear knowledge filters</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
      )}
      {!projectId && (
        <p>
          <Trans>
            Select a project to see its approved knowledge and your drafts.
          </Trans>
        </p>
      )}
      {projectId && query.loading && (
        <p role="status">
          <Trans>Loading brand knowledge…</Trans>
        </p>
      )}
      {(error || query.error || permission.error) && (
        <p role="alert">
          {error ||
            query.error?.message ||
            t`Could not verify access. Knowledge is hidden.`}
        </p>
      )}
      {initial && (
        <div hidden={!data || !permission.ready}>
          <DeliveryKnowledgeForm
            key={initial.id}
            initial={initial}
            busy={busy}
            enabled={
              Boolean(data) &&
              permission.ready &&
              (initial.revision === 0 || detail?.canEdit === true)
            }
            onClose={close}
            onSaved={() => setEditing(null)}
            onSave={async (input) => {
              setError('');
              try {
                await save({ variables: { input } });
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : t`Could not save brand knowledge.`,
                );
                return false;
              }
              try {
                await query.refetch();
              } catch {
                setError(
                  t`Knowledge saved. Refresh before making another change.`,
                );
              }
              return true;
            }}
          />
        </div>
      )}
      {data && !editing && (
        <>
          {!data.items.length && (
            <StyledDeliveryCard>
              <p>
                <Trans>
                  No knowledge matches this view. Clear the filters or add a
                  source with reviewed facts, rules or meeting decisions.
                </Trans>
              </p>
            </StyledDeliveryCard>
          )}
          {data.items.map((item) => (
            <StyledDeliveryCard key={item.id}>
              <StyledDeliveryRow>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {categories.find(
                      (category) => category.value === item.category,
                    )?.label ?? item.category}{' '}
                    · {item.meetingDate} ·{' '}
                    {item.publishedVersion
                      ? t`Published version ${item.publishedVersion}`
                      : t`Draft — not used by agents`}
                    {item.publishedVersion &&
                    item.version !== item.publishedVersion
                      ? ` · ${t`New draft awaiting review`}`
                      : ''}
                  </p>
                </div>
                <Link
                  to={{
                    search: updatedParams({
                      source: item.id,
                      knowledgeVersion: null,
                    }).toString(),
                  }}
                  onClick={() => setError('')}
                  aria-label={t`Open ${item.title}`}
                >
                  <Trans>Open knowledge</Trans>
                </Link>
              </StyledDeliveryRow>
            </StyledDeliveryCard>
          ))}
          <StyledDeliveryRow>
            {params.has('knowledgeAfter') && (
              <Link
                to={{
                  search: updatedParams({ knowledgeAfter: null }).toString(),
                }}
              >
                <Trans>First page</Trans>
              </Link>
            )}
            {data.nextCursor && (
              <Link
                to={{
                  search: updatedParams({
                    knowledgeAfter: data.nextCursor ?? null,
                  }).toString(),
                }}
              >
                <Trans>Next sources</Trans>
              </Link>
            )}
          </StyledDeliveryRow>
          {detail && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <h2>{detail.title}</h2>
                <p>
                  {categories.find(
                    (category) => category.value === detail.category,
                  )?.label ?? detail.category}{' '}
                  · {t`Version ${detail.version}`} · {detail.meetingDate} ·{' '}
                  {detail.version === detail.publishedVersion
                    ? t`Published for agents`
                    : t`Not current agent knowledge`}
                </p>
                {detail.canEdit && (
                  <label>
                    <Trans>Source version</Trans>
                    <input
                      type="number"
                      min={1}
                      max={detail.currentVersion}
                      value={detail.version}
                      onChange={(event) => {
                        const version = Number(event.target.value);
                        if (
                          Number.isInteger(version) &&
                          version >= 1 &&
                          version <= detail.currentVersion
                        )
                          navigate({ knowledgeVersion: String(version) });
                      }}
                    />
                  </label>
                )}
                {detail.sourceUrl && (
                  <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
                    <Trans>Open original source</Trans>
                  </a>
                )}
                {detail.transcript !== null && (
                  <details>
                    <summary>
                      {detail.category === 'MEETING'
                        ? t`Original transcript or notes`
                        : t`Source evidence and notes`}
                    </summary>
                    <p
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {detail.transcript ||
                        t`Source evidence has not been added. Paste notes or a transcript before publishing.`}
                    </p>
                  </details>
                )}
                <h3>
                  <Trans>Reviewed brand knowledge</Trans>
                </h3>
                <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {detail.knowledge ||
                    t`No facts, rules or decisions drafted yet.`}
                </p>
                <StyledDeliveryRow>
                  {detail.canEdit &&
                    detail.version === detail.currentVersion && (
                      <StyledDeliveryButton
                        onClick={() =>
                          setEditing({
                            id: detail.id,
                            projectId,
                            revision: detail.revision,
                            title: detail.title,
                            category: detail.category,
                            meetingDate: detail.meetingDate,
                            sourceUrl: detail.sourceUrl,
                            transcript: detail.transcript ?? '',
                            knowledge: detail.knowledge,
                          })
                        }
                      >
                        <Trans>Edit draft</Trans>
                      </StyledDeliveryButton>
                    )}
                  {data.canPublish &&
                    detail.version === detail.currentVersion &&
                    detail.publishedVersion !== detail.currentVersion && (
                      <StyledDeliveryButton
                        data-primary="true"
                        disabled={
                          busy || !detail.knowledge || !detail.transcript
                        }
                        onClick={() => void publishVersion(true)}
                      >
                        <Trans>Publish reviewed knowledge</Trans>
                      </StyledDeliveryButton>
                    )}
                  {data.canPublish && detail.publishedVersion && (
                    <StyledDeliveryButton
                      disabled={busy}
                      onClick={() => void publishVersion(false)}
                    >
                      <Trans>Withdraw from agents</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledDeliveryRow>
                <small>
                  <Trans>
                    Publishing updates future task assistant context. It does
                    not change tasks, budgets or approvals. Review suggested
                    edits before applying them.
                  </Trans>
                </small>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
        </>
      )}
    </StyledDeliveryStack>
  );
};
