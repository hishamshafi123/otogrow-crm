import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';
import { type OtogrowRoleDirectory } from '@/otogrow-access/otogrow-access.types';

export type ConversationPermissionsValue = {
  ownerId: string;
  private: boolean;
  grants: { memberId: string; read: boolean; send: boolean }[];
  roleGrants: { roleId: string; read: boolean; send: boolean }[];
};
type ConversationPermissionsProps = {
  value: ConversationPermissionsValue;
  directory: OtogrowRoleDirectory;
  onChange: (value: ConversationPermissionsValue) => void;
};
const StyledGrantRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 0;
  > strong {
    flex: 1 1 180px;
    overflow-wrap: anywhere;
  }
  label {
    align-items: center;
    display: flex;
    gap: 6px;
  }
`;
const StyledGrantList = styled.div`
  max-height: 320px;
  overflow-y: auto;
  padding: 2px;
`;
const StyledPreview = styled.ul`
  list-style: none;
  margin: 0;
  max-height: 320px;
  overflow-y: auto;
  padding: 0;
  li {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: 10px 0;
  }
  p {
    margin: 4px 0;
    overflow-wrap: anywhere;
  }
`;

export const ConversationPermissions = ({
  value,
  directory,
  onChange,
}: ConversationPermissionsProps) => {
  const { t } = useLingui();
  const updateGrant = (
    kind: 'person' | 'role',
    id: string,
    permission: 'read' | 'send',
    checked: boolean,
  ) => {
    const current =
      kind === 'person'
        ? value.grants.find((grant) => grant.memberId === id)
        : value.roleGrants.find((grant) => grant.roleId === id);
    const next = {
      read: current?.read ?? false,
      send: current?.send ?? false,
      [permission]: checked,
    };
    if (permission === 'send' && checked) next.read = true;
    if (permission === 'read' && !checked) next.send = false;
    if (kind === 'person')
      onChange({
        ...value,
        grants: [
          ...value.grants.filter((grant) => grant.memberId !== id),
          { memberId: id, ...next },
        ].filter((grant) => grant.read),
      });
    else
      onChange({
        ...value,
        roleGrants: [
          ...value.roleGrants.filter((grant) => grant.roleId !== id),
          { roleId: id, ...next },
        ].filter((grant) => grant.read),
      });
  };
  const rows = (kind: 'person' | 'role') =>
    (kind === 'person'
      ? directory.members.map((member) => ({
          id: member.memberId,
          name: member.name,
        }))
      : directory.roles
    ).map(({ id, name }) => {
      const grant =
        kind === 'person'
          ? value.grants.find((entry) => entry.memberId === id)
          : value.roleGrants.find((entry) => entry.roleId === id);
      return (
        <StyledGrantRow key={id}>
          <strong>{name}</strong>
          {(['read', 'send'] as const).map((permission) => (
            <label key={permission}>
              <input
                type="checkbox"
                checked={grant?.[permission] ?? false}
                disabled={value.private}
                aria-label={
                  permission === 'read'
                    ? t`${name}: view conversation`
                    : t`${name}: prepare replies`
                }
                onChange={(event) =>
                  updateGrant(kind, id, permission, event.target.checked)
                }
              />
              {permission === 'read' ? t`View` : t`Prepare replies`}
            </label>
          ))}
        </StyledGrantRow>
      );
    });
  return (
    <StyledDeliveryStack>
      <h3>
        <Trans>Conversation access</Trans>
      </h3>
      <label>
        <Trans>Conversation owner</Trans>
        <select
          required
          value={value.ownerId}
          onChange={(event) =>
            onChange({ ...value, ownerId: event.target.value })
          }
        >
          <option value="">{t`Choose a person`}</option>
          {directory.members.map((member) => (
            <option key={member.memberId} value={member.memberId}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.private}
          onChange={(event) =>
            onChange({ ...value, private: event.target.checked })
          }
        />{' '}
        <Trans>Private to the owner</Trans>
      </label>
      <p>
        {value.private
          ? t`Only the owner can view this conversation or prepare replies. Saved person and role grants are inactive while private, including administrator access.`
          : t`The owner and OS administrators have access. Other people need a grant below. Permissions from all assigned roles and individual grants combine; an unchecked box does not override another grant.`}
      </p>
      <details open={!value.private}>
        <summary>{t`Access by team role`}</summary>
        <p>
          <Trans>
            Applies to everyone currently assigned each selected role, and
            anyone assigned it later. Prepare replies includes viewing. Sending
            to external channels is not implemented.
          </Trans>
        </p>
        <StyledGrantList>{rows('role')}</StyledGrantList>
      </details>
      <details>
        <summary>{t`Additional access for individual people`}</summary>
        <StyledGrantList>{rows('person')}</StyledGrantList>
      </details>
      <details open>
        <summary>{t`Who will have access after saving`}</summary>
        <StyledPreview aria-label={t`Effective conversation access`}>
          {directory.members.map((member) => {
            const owner = member.memberId === value.ownerId;
            const admin =
              member.access.capabilities.includes('workspace.admin');
            const direct = value.grants.find(
              (grant) => grant.memberId === member.memberId && grant.read,
            );
            const roles = value.roleGrants.filter(
              (grant) => grant.read && member.roleIds.includes(grant.roleId),
            );
            const read =
              owner ||
              (!value.private &&
                (admin || Boolean(direct) || roles.length > 0));
            const reply =
              owner ||
              (!value.private &&
                (admin || direct?.send || roles.some((grant) => grant.send)));
            const sources = owner
              ? [t`Conversation owner`]
              : value.private
                ? [t`Private to another owner`]
                : [
                    ...(admin ? [t`OS administrator`] : []),
                    ...(direct
                      ? [
                          direct.send
                            ? t`Individual grant: view and prepare replies`
                            : t`Individual grant: view only`,
                        ]
                      : []),
                    ...roles.map((grant) => {
                      const name =
                        directory.roles.find((role) => role.id === grant.roleId)
                          ?.name ?? t`Unavailable role`;
                      return grant.send
                        ? t`${name}: view and prepare replies`
                        : t`${name}: view only`;
                    }),
                  ];
            return (
              <li key={member.memberId} aria-label={member.name}>
                <strong>{member.name}</strong>
                <p>
                  {reply
                    ? t`View and prepare replies`
                    : read
                      ? t`View only`
                      : t`No access`}
                </p>
                <small>
                  {sources.length ? sources.join(' · ') : t`No matching grant`}
                </small>
              </li>
            );
          })}
        </StyledPreview>
        <p>
          <Trans>
            This preview uses current role assignments. Later role changes can
            change access. Other projects, phone access and finances are
            unaffected.
          </Trans>
        </p>
      </details>
    </StyledDeliveryStack>
  );
};
