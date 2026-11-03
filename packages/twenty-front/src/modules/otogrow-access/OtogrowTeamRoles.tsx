import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  ASSIGN_OTOGROW_ROLES,
  GET_OTOGROW_ROLE_DIRECTORY,
  SAVE_OTOGROW_ROLE,
} from '@/otogrow-access/otogrow-access.graphql';
import {
  OTOGROW_CAPABILITIES,
  hasOtogrowCapability,
  type OtogrowRoleDirectory,
  type OtogrowRole,
  type OtogrowRoleMember,
} from '@/otogrow-access/otogrow-access.types';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import {
  type AssignOtogrowRolesMutation,
  type AssignOtogrowRolesMutationVariables,
  type SaveOtogrowRoleMutation,
  type SaveOtogrowRoleMutationVariables,
} from '~/generated-metadata/graphql';

const StyledList = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
`;
const StyledRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: minmax(0, 1fr) auto;
  padding: ${themeCssVariables.spacing[3]} 0;
  > div {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  p {
    margin: ${themeCssVariables.spacing[1]} 0;
  }
`;
const StyledChoices = styled.fieldset`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[3]};
  label {
    align-items: start;
    display: flex;
    flex-direction: row;
    gap: ${themeCssVariables.spacing[2]};
  }
`;
const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-start;
  button[aria-pressed='true'] {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.font.color.primary};
    font-weight: 600;
  }
`;
type RoleEditor = {
  kind: 'role';
  role: Omit<OtogrowRole, 'id' | 'revision'> & {
    id?: string;
    revision?: number;
  };
};
type MemberEditor = {
  kind: 'member';
  member: OtogrowRoleMember;
  roles: OtogrowRole[];
};
type Editor = RoleEditor | MemberEditor;
const editorValues = (editor: Editor | null) =>
  JSON.stringify(
    !editor
      ? null
      : editor.kind === 'member'
        ? [...editor.member.roleIds].sort()
        : {
            name: editor.role.name,
            description: editor.role.description,
            capabilities: [...editor.role.capabilities].sort(),
          },
  );
type OtogrowTeamRolesProps = { onChanged: () => Promise<unknown> };

export const OtogrowTeamRoles = ({ onChanged }: OtogrowTeamRolesProps) => {
  const { t } = useLingui();
  const permission = useOtogrowAccess();
  const query = useQuery<{ otogrowRoleDirectory: OtogrowRoleDirectory }>(
    GET_OTOGROW_ROLE_DIRECTORY,
    {
      skip: !permission.canManageRoles,
      fetchPolicy: 'network-only',
      variables: { identity: permission.scopeKey },
    },
  );
  const [saveRole, savingRole] = useMutation<
    SaveOtogrowRoleMutation,
    SaveOtogrowRoleMutationVariables
  >(SAVE_OTOGROW_ROLE);
  const [assignRoles, assigningRoles] = useMutation<
    AssignOtogrowRolesMutation,
    AssignOtogrowRolesMutationVariables
  >(ASSIGN_OTOGROW_ROLES);
  const [view, setView] = useState<'people' | 'roles'>('people');
  const [draft, setEditor] = useState<Editor | null>(null);
  const [baseline, setBaseline] = useState(editorValues(null));
  const { requestAction } = useDeliveryDraftGuard();
  const [editorScope, setEditorScope] = useState<string | null>(null);
  const editor = editorScope === permission.scopeKey ? draft : null;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const editorRef = useRef<HTMLFormElement>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Reject late network completions after identity changes without retaining UI data across workspaces.
  const currentScope = useRef(permission.scopeKey);
  currentScope.current = permission.scopeKey;
  const busy = savingRole.loading || assigningRoles.loading;
  useDeliveryDraftStatus({
    dirty: Boolean(editor) && editorValues(editor) !== baseline,
    saving: busy,
  });
  const directory = query.data?.otogrowRoleDirectory;
  const matchesCurrentActor = (candidate: OtogrowRoleDirectory) =>
    candidate.actor.workspaceId === permission.access?.workspaceId &&
    candidate.actor.memberId === permission.access?.memberId &&
    candidate.actor.userWorkspaceId === permission.access?.userWorkspaceId;
  const labels: Record<string, string> = {
    'workspace.admin': t`Administer Otogrow OS`,
    'delivery.manage': t`Plan and review all projects`,
    'delivery.review': t`Review submissions assigned to you`,
    'phone.use': t`Use the phone`,
    'finance.read': t`View and export finances`,
    'finance.manage': t`Record and correct finances`,
  };
  const explanations: Record<string, string> = {
    'workspace.admin': t`Manage OS settings and roles, and access shared business data. Owner-private conversations and private team chats keep their access limits. CRM settings keep their separate permissions.`,
    'delivery.manage': t`Manage work and review delivery across projects. Final work still needs an independent reviewer.`,
    'delivery.review': t`Review only submissions assigned to you in projects you already belong to. You cannot approve your own work. This grants no planning, production management, client delivery, fulfilment or finance access.`,
    'phone.use': t`Make and receive calls. CRM record permissions still limit access to call records.`,
    'finance.read': t`See and export all company financial entries, salary allocations and cash reports. Does not grant access to project tasks or client conversations.`,
    'finance.manage': t`Includes viewing all finances. Record receipts and expenses, confirm payments and void incorrect entries. Does not grant role administration.`,
  };
  const openEditor = (value: Editor) => {
    setEditorScope(permission.scopeKey);
    setEditor(value);
    setBaseline(editorValues(value));
    setError('');
    setNotice('');
    requestAnimationFrame(() => {
      if (!editorRef.current?.contains(document.activeElement))
        editorRef.current?.focus();
    });
  };
  const save = async () => {
    if (!editor || !permission.canManageRoles || busy) return;
    const savedScope = permission.scopeKey;
    setError('');
    setNotice('');
    try {
      if (editor.kind === 'role') {
        await saveRole({
          variables: {
            input: {
              id: editor.role.id,
              revision: editor.role.revision,
              name: editor.role.name,
              description: editor.role.description,
              capabilities: editor.role.capabilities,
            },
          },
        });
      } else {
        await assignRoles({
          variables: {
            input: {
              memberId: editor.member.memberId,
              roleIds: editor.member.roleIds,
              revision: editor.member.revision,
              roleRevisions: editor.roles
                .filter((role) => editor.member.roleIds.includes(role.id))
                .map((role) => ({ id: role.id, revision: role.revision })),
            },
          },
        });
      }
    } catch (saveError) {
      if (currentScope.current !== savedScope) return;
      const messages = CombinedGraphQLErrors.is(saveError)
        ? saveError.errors.map((item) => item.message)
        : saveError instanceof Error
          ? [saveError.message]
          : [];
      const explanations: Record<string, string> = {
        'Choose a unique role name.': t`A role already has that name. Choose a different name.`,
        'Ask another administrator to change your own roles.': t`Ask another administrator to change your own roles.`,
        'Ask another administrator to change the roles that give you administrator access.': t`Ask another administrator to change the roles that give you administrator access.`,
        'Keep at least one active administrator.': t`Keep at least one active administrator.`,
        'This role changed. Reload the latest access before saving.': t`This role changed. Reload the latest access before saving.`,
        'This person’s roles changed. Reload the latest access before saving.': t`This person’s roles changed. Reload the latest access before saving.`,
        'A selected role changed. Reload its latest permissions before saving.': t`A selected role changed. Reload its latest permissions before saving.`,
      };
      const explanation = messages
        .map((message) => explanations[message])
        .find(Boolean);
      setError(
        explanation
          ? `${explanation} ${t`Your edits are still here.`}`
          : t`Could not save access. Your edits are still here. Check your connection and access, or reload the latest version before trying again.`,
      );
      return;
    }
    if (currentScope.current !== savedScope) return;
    setEditor(null);
    setNotice(t`Access changes saved.`);
    try {
      await Promise.all([query.refetch(), permission.refetch(), onChanged()]);
    } catch {
      setError(
        t`Access was saved, but the latest view could not be loaded. Refresh this page before making another change.`,
      );
    }
  };
  const reloadKeepingEdits = async () => {
    const reloadedScope = permission.scopeKey;
    try {
      const result = await query.refetch();
      const latest = result.data?.otogrowRoleDirectory;
      if (
        currentScope.current !== reloadedScope ||
        !latest ||
        !editor ||
        !matchesCurrentActor(latest)
      )
        return;
      if (editor.kind === 'member') {
        const member = latest.members.find(
          (item) => item.memberId === editor.member.memberId,
        );
        if (!member) {
          setError(
            t`This person is no longer available. Cancel these edits and refresh the people list.`,
          );
          return;
        }
        setBaseline(
          editorValues({ kind: 'member', member, roles: latest.roles }),
        );
        setEditor({
          kind: 'member',
          member: { ...member, roleIds: editor.member.roleIds },
          roles: latest.roles,
        });
      } else if (editor.role.id) {
        const role = latest.roles.find((item) => item.id === editor.role.id);
        if (!role) {
          setError(
            t`This role is no longer available. Cancel these edits and refresh the role list.`,
          );
          return;
        }
        setBaseline(editorValues({ kind: 'role', role }));
        setEditor({
          kind: 'role',
          role: { ...editor.role, revision: role.revision },
        });
      }
      setError('');
      setNotice(
        t`Latest version loaded. Your edits are retained; review the access preview before saving.`,
      );
    } catch {
      if (currentScope.current !== reloadedScope) return;
      setError(
        t`Could not reload access. Your edits are still here. Try again when the connection is restored.`,
      );
    }
  };
  if (permission.loading)
    return (
      <p role="status">
        <Trans>Checking role-management access…</Trans>
      </p>
    );
  if (permission.error)
    return (
      <div role="alert">
        <p>
          <Trans>Could not check role-management access.</Trans>
        </p>
        <StyledDeliveryButton onClick={() => void permission.refetch()}>
          <Trans>Try again</Trans>
        </StyledDeliveryButton>
      </div>
    );
  if (!permission.canManageRoles)
    return (
      <p>
        <Trans>
          Only an Otogrow OS administrator can manage business roles.
        </Trans>
      </p>
    );
  if (!directory || query.loading || query.error)
    return (
      <StyledDeliveryCard>
        {query.error ? (
          <>
            <p role="alert">
              <Trans>Could not load people and roles.</Trans>
            </p>
            <StyledDeliveryButton onClick={() => void query.refetch()}>
              <Trans>Try again</Trans>
            </StyledDeliveryButton>
          </>
        ) : (
          <p role="status">
            <Trans>Loading people and roles…</Trans>
          </p>
        )}
      </StyledDeliveryCard>
    );
  if (!matchesCurrentActor(directory))
    return (
      <p role="status">
        <Trans>Loading access for this workspace…</Trans>
      </p>
    );
  const previewRoles =
    editor?.kind === 'member'
      ? editor.roles.filter((role) => editor.member.roleIds.includes(role.id))
      : editor?.kind === 'role'
        ? [editor.role]
        : [];
  const nativeGrants =
    editor?.kind === 'member'
      ? editor.member.access.grants.filter(
          (grant) => grant.sourceType === 'native',
        )
      : [];
  const errorFeedback = error && (
    <div role="alert">
      <p>{error}</p>
      {editor && (
        <StyledDeliveryButton
          type="button"
          disabled={busy}
          onClick={() => void reloadKeepingEdits()}
        >
          <Trans>Reload latest version and keep edits</Trans>
        </StyledDeliveryButton>
      )}
    </div>
  );
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h2>
          <Trans>People and roles</Trans>
        </h2>
        <p>
          <Trans>
            Give each person the roles they need. Their access combines every
            assigned role. Assigned project access remains available without an
            extra permission.
          </Trans>
        </p>
        <small>
          <Trans>
            These are Otogrow business roles. CRM data and settings permissions
            remain separate.
          </Trans>
        </small>
        <StyledActions>
          <StyledDeliveryButton
            aria-pressed={view === 'people'}
            disabled={editor !== null}
            onClick={() => setView('people')}
          >
            <Trans>People</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            aria-pressed={view === 'roles'}
            disabled={editor !== null}
            onClick={() => setView('roles')}
          >
            <Trans>Roles</Trans>
          </StyledDeliveryButton>
          {view === 'roles' && !editor && (
            <StyledDeliveryButton
              onClick={() =>
                openEditor({
                  kind: 'role',
                  role: { name: '', description: '', capabilities: [] },
                })
              }
            >
              <Trans>Create role</Trans>
            </StyledDeliveryButton>
          )}
        </StyledActions>
        {!editor && notice && <p role="status">{notice}</p>}
        {!editor && errorFeedback}
        {editor ? (
          <form
            ref={editorRef}
            tabIndex={-1}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <StyledDeliveryStack>
              <h3>
                {editor.kind === 'member'
                  ? t`Roles for ${editor.member.name}`
                  : editor.role.id
                    ? t`Edit role`
                    : t`Create role`}
              </h3>
              {editor.kind === 'member' ? (
                <StyledChoices disabled={busy}>
                  <legend>
                    <Trans>Assigned roles</Trans>
                  </legend>
                  {editor.roles.map((role) => (
                    <label key={role.id}>
                      <input
                        type="checkbox"
                        checked={editor.member.roleIds.includes(role.id)}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            member: {
                              ...editor.member,
                              roleIds: event.target.checked
                                ? [...editor.member.roleIds, role.id]
                                : editor.member.roleIds.filter(
                                    (id) => id !== role.id,
                                  ),
                            },
                          })
                        }
                      />
                      <span>
                        {role.name}
                        {role.description && (
                          <small> — {role.description}</small>
                        )}
                      </span>
                    </label>
                  ))}
                </StyledChoices>
              ) : (
                <>
                  <label>
                    <Trans>Role name</Trans>
                    <input
                      required
                      disabled={busy}
                      maxLength={100}
                      value={editor.role.name}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          role: { ...editor.role, name: event.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    <Trans>Description</Trans>
                    <textarea
                      disabled={busy}
                      maxLength={500}
                      value={editor.role.description}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          role: {
                            ...editor.role,
                            description: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <StyledChoices disabled={busy}>
                    <legend>
                      <Trans>Role permissions</Trans>
                    </legend>
                    {OTOGROW_CAPABILITIES.map((capability) => (
                      <label key={capability}>
                        <input
                          type="checkbox"
                          checked={editor.role.capabilities.includes(
                            capability,
                          )}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              role: {
                                ...editor.role,
                                capabilities: event.target.checked
                                  ? [...editor.role.capabilities, capability]
                                  : editor.role.capabilities.filter(
                                      (value) => value !== capability,
                                    ),
                              },
                            })
                          }
                        />
                        <span>
                          {labels[capability]}
                          <small> — {explanations[capability]}</small>
                        </span>
                      </label>
                    ))}
                  </StyledChoices>
                  {editor.role.id && (
                    <p>
                      <Trans>
                        Saving changes the access of everyone assigned this
                        role.
                      </Trans>
                    </p>
                  )}
                </>
              )}
              <section aria-label={t`Combined access preview`}>
                <h4>
                  <Trans>Combined access preview</Trans>
                </h4>
                <ul>
                  {OTOGROW_CAPABILITIES.map((capability) => {
                    const sources = [
                      ...previewRoles
                        .filter((role) =>
                          hasOtogrowCapability(role.capabilities, capability),
                        )
                        .map((role) => role.name || t`This role`),
                      ...nativeGrants
                        .filter((grant) =>
                          hasOtogrowCapability([grant.capability], capability),
                        )
                        .map(
                          (grant) => t`${grant.sourceName} (from CRM settings)`,
                        ),
                    ];
                    return (
                      <li key={capability}>
                        <span>
                          <strong>{labels[capability]}:</strong>{' '}
                          {sources.length ? t`Allowed` : t`Not granted`}
                        </span>
                        {sources.length > 0 && (
                          <span>
                            {' '}
                            — {t`From`}: {sources.join(', ')}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p>
                  <Trans>
                    This preview covers OS permissions. Project membership,
                    conversation access, CRM permissions and independent
                    approval still apply.
                  </Trans>
                </p>
                <p>
                  <Trans>
                    Review-only access requires a current reviewer assignment
                    and existing project membership. A review role never grants
                    self-approval or transfers client-delivery ownership.
                  </Trans>
                </p>
                {editor.kind === 'member' && (
                  <section aria-label={t`Existing project review scope`}>
                    <strong>
                      <Trans>Existing project memberships</Trans>
                    </strong>
                    <p>
                      {editor.member.projectMemberships.length
                        ? editor.member.projectMemberships
                            .map((project) => project.name)
                            .join(', ')
                        : t`No current project memberships`}
                    </p>
                    <small>
                      <Trans>
                        These memberships define potential project scope. This
                        person still needs an explicit independent submission
                        assignment; saving a review role assigns no work.
                      </Trans>
                    </small>
                  </section>
                )}
              </section>
              {notice && <p role="status">{notice}</p>}
              {errorFeedback}
              <StyledActions>
                <StyledDeliveryButton type="submit" disabled={busy}>
                  {busy ? t`Saving…` : t`Save access`}
                </StyledDeliveryButton>
                <StyledDeliveryButton
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    requestAction(() => {
                      setEditor(null);
                      setError('');
                      setNotice('');
                    })
                  }
                >
                  <Trans>Cancel</Trans>
                </StyledDeliveryButton>
              </StyledActions>
            </StyledDeliveryStack>
          </form>
        ) : (
          <StyledList>
            {view === 'people' ? (
              directory.members.length ? (
                directory.members.map((member) => (
                  <StyledRow key={member.memberId}>
                    <div>
                      <strong>{member.name}</strong>
                      <p>
                        {directory.roles
                          .filter((role) => member.roleIds.includes(role.id))
                          .map((role) => role.name)
                          .join(', ') || t`No business roles assigned`}
                      </p>
                      <small>
                        {member.access.capabilities
                          .map(
                            (capability) =>
                              labels[capability] ??
                              t`Permission name unavailable`,
                          )
                          .join(' · ') || t`Assigned projects only`}
                      </small>
                      {member.access.nativeAdministrator && (
                        <p>
                          <Trans>
                            Administrator access comes from CRM settings
                          </Trans>
                        </p>
                      )}
                    </div>
                    <StyledDeliveryButton
                      disabled={member.memberId === directory.actor.memberId}
                      title={
                        member.memberId === directory.actor.memberId
                          ? t`Ask another administrator to change your roles.`
                          : undefined
                      }
                      onClick={() =>
                        openEditor({
                          kind: 'member',
                          member: { ...member, roleIds: [...member.roleIds] },
                          roles: directory.roles,
                        })
                      }
                    >{t`Edit roles for ${member.name}`}</StyledDeliveryButton>
                  </StyledRow>
                ))
              ) : (
                <p>
                  <Trans>
                    No people yet. Invite teammates through workspace settings
                    before assigning business roles.
                  </Trans>
                </p>
              )
            ) : directory.roles.length ? (
              directory.roles.map((role) => (
                <StyledRow key={role.id}>
                  <div>
                    <strong>{role.name}</strong>
                    <p>{role.description}</p>
                    <small>
                      {OTOGROW_CAPABILITIES.filter((capability) =>
                        hasOtogrowCapability(role.capabilities, capability),
                      )
                        .map((capability) => labels[capability] ?? capability)
                        .join(' · ') || t`Assigned projects only`}
                    </small>
                  </div>
                  <StyledDeliveryButton
                    onClick={() =>
                      openEditor({
                        kind: 'role',
                        role: { ...role, capabilities: [...role.capabilities] },
                      })
                    }
                  >{t`Edit ${role.name}`}</StyledDeliveryButton>
                </StyledRow>
              ))
            ) : (
              <p>
                <Trans>
                  No business roles yet. Create a role to define access.
                </Trans>
              </p>
            )}
          </StyledList>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
