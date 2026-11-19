import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useIsMobile } from 'twenty-ui/utilities';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  useClientContacts,
  useClientContactsAccess,
} from '@/delivery/client-workspace/useClientContacts';

type ClientContactsProps = { companyId: string };

export const ClientContacts = ({ companyId }: ClientContactsProps) => {
  const access = useClientContactsAccess();
  return (
    <ClientContactsList
      key={`${access.source}:${companyId}`}
      companyId={companyId}
      access={access}
    />
  );
};

const ClientContactsList = ({
  companyId,
  access,
}: ClientContactsProps & {
  access: ReturnType<typeof useClientContactsAccess>;
}) => {
  const { t } = useLingui();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const state = useClientContacts(companyId, cursors.at(-1) ?? null, access);
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { requestAction } = useDeliveryDraftGuard();
  const isMobile = useIsMobile();
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>
            <Trans>Contacts</Trans>
          </h2>
          <StyledDeliveryButton
            disabled={!state.allowed || state.loading}
            onClick={() => {
              void state.refetch().catch(() => undefined);
            }}
          >
            <Trans>Refresh contacts</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {!state.allowed ? (
          <p role="status">
            <Trans>Your current access does not allow this contact list.</Trans>
          </p>
        ) : state.loading ? (
          <p role="status">
            <Trans>Loading contacts…</Trans>
          </p>
        ) : state.error || !state.data ? (
          <p role="alert">
            <Trans>Contacts could not be verified. Refresh to try again.</Trans>
          </p>
        ) : (
          <>
            <p>
              <Trans>
                Open a contact to review or edit the fields your CRM access
                permits.
              </Trans>
            </p>
            {!state.data.edges.length && (
              <p>
                <Trans>No contacts on this page.</Trans>
              </p>
            )}
            {state.data.edges.map(({ node }) => {
              const name =
                (access.fields.name
                  ? [node.name?.firstName, node.name?.lastName]
                  : []
                )
                  .filter(Boolean)
                  .join(' ') || t`Contact`;
              return (
                <StyledDeliveryStack key={node.id}>
                  {isMobile ? (
                    <a
                      href={`/object/person/${node.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {name} <Trans>(opens in a new tab)</Trans>
                    </a>
                  ) : (
                    <StyledDeliveryButton
                      onClick={() =>
                        requestAction(() =>
                          openRecordInSidePanel({
                            recordId: node.id,
                            objectNameSingular: 'person',
                          }),
                        )
                      }
                    >
                      {name}
                    </StyledDeliveryButton>
                  )}
                  {access.fields.jobTitle && node.jobTitle && (
                    <span>{node.jobTitle}</span>
                  )}
                  {access.fields.emails && node.emails?.primaryEmail && (
                    <span>{node.emails.primaryEmail}</span>
                  )}
                </StyledDeliveryStack>
              );
            })}
            <StyledDeliveryRow>
              <StyledDeliveryButton
                disabled={cursors.length === 1}
                onClick={() => setCursors(cursors.slice(0, -1))}
              >
                <Trans>Previous contacts</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                disabled={
                  !state.data.pageInfo.hasNextPage ||
                  !state.data.pageInfo.endCursor
                }
                onClick={() =>
                  setCursors([
                    ...cursors,
                    state.data?.pageInfo.endCursor ?? null,
                  ])
                }
              >
                <Trans>Next contacts</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
