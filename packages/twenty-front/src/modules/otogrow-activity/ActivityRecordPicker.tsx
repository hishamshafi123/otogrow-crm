import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { GET_ACTIVITY_OPTIONS } from '@/otogrow-activity/activity-reads.graphql';
import {
  matchesActivityIdentity,
  type useActivityContext,
} from '@/otogrow-activity/useActivityContext';
import { type OtogrowActivityOptionsQuery } from '~/generated-metadata/graphql';

export const ActivityRecordPicker = ({
  state,
  kind,
  label,
  value,
  onChange,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useActivityContext>;
  kind: 'PERSON' | 'PROJECT' | 'CLIENT';
  label: string;
  value: string;
  onChange: (value: string) => void;
  onAuthorityLost: () => void;
}) => {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [after, setAfter] = useState<string | null>(null);
  const input = { kind, search, after, selectedId: value || null, limit: 25 };
  const source = `${state.source}:${JSON.stringify(input)}`;
  const enabled = state.data !== null && state.administrator;
  const query = useQuery<OtogrowActivityOptionsQuery>(GET_ACTIVITY_OPTIONS, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !enabled || (!open && !value),
  });
  const reading = useAssistantRead({
    value: query.data?.otogrowActivityOptions,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (result) => matchesActivityIdentity(state, result),
  });
  const denied = isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onAuthorityLost();
  }, [denied, onAuthorityLost]);
  return (
    <StyledDeliveryStack>
      <StyledDeliveryButton
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}:{' '}
        {value
          ? (reading.data?.selected?.name ?? t`Selected record`)
          : t`All records`}
      </StyledDeliveryButton>
      {open && (
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <label>
              {t`Find ${label.toLowerCase()}`}
              <input
                value={searchInput}
                maxLength={160}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    setSearch(searchInput.trim());
                    setAfter(null);
                  }
                }}
              />
            </label>
            <StyledDeliveryButton
              type="button"
              onClick={() => {
                setSearch(searchInput.trim());
                setAfter(null);
              }}
            >
              <Trans>Find records</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
          <StyledDeliveryButton
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            <Trans>Use all records</Trans>
          </StyledDeliveryButton>
          {reading.data ? (
            <>
              <small>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} matching records.`}</small>
              {reading.data.items.map((item) => (
                <StyledDeliveryButton
                  type="button"
                  key={item.id}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  {item.name}
                </StyledDeliveryButton>
              ))}
              {reading.data.items.length === 0 && (
                <p>
                  <Trans>No matching records.</Trans>
                </p>
              )}
              {reading.data.nextCursor && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setAfter(reading.data?.nextCursor ?? null)}
                >
                  <Trans>More records</Trans>
                </StyledDeliveryButton>
              )}
            </>
          ) : (
            <p role={query.error ? 'alert' : 'status'}>
              {query.error
                ? t`These records could not be verified.`
                : t`Loading records…`}
            </p>
          )}
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              onClick={() => {
                setAfter(null);
                void query.refetch().catch((error: unknown) => {
                  if (isOtogrowAccessDenied(error)) onAuthorityLost();
                });
              }}
            >
              <Trans>First page and retry</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton type="button" onClick={() => setOpen(false)}>
              <Trans>Close choices</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      )}
    </StyledDeliveryStack>
  );
};
