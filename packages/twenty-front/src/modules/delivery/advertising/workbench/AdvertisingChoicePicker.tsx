import { useId, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { GET_ADVERTISING_CHOICES } from '@/delivery/advertising/workbench/delivery-advertising.graphql';
import { StyledAdvertisingItem } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryAdvertisingChoicesQuery } from '~/generated-metadata/graphql';

export type AdvertisingChoice = {
  id: string;
  name: string;
  version: number | null;
};
type AdvertisingChoicePickerProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  sourceKind: string;
  sourceId: string;
  scope: string;
  kind: 'OWNER' | 'REVIEWER' | 'ASSISTANT';
  ownerId?: string | null;
  label: string;
  value: AdvertisingChoice | null;
  disabled: boolean;
  onChange: (value: AdvertisingChoice | null) => void;
};

export const AdvertisingChoicePicker = ({
  state,
  sourceKind,
  sourceId,
  scope,
  kind,
  ownerId,
  label,
  value,
  disabled,
  onChange,
}: AdvertisingChoicePickerProps) => {
  const { t } = useLingui();
  const [opened, setOpened] = useState(false);
  const regionId = useId();
  const needsOwner = kind === 'ASSISTANT' && !ownerId;
  return (
    <StyledDeliveryStack>
      <StyledDeliveryButton
        type="button"
        data-choice-kind={kind}
        data-choice-id={value?.id}
        data-choice-version={value?.version}
        disabled={disabled || needsOwner}
        aria-expanded={opened}
        aria-controls={regionId}
        onClick={() => setOpened((current) => !current)}
      >
        {label}: {value?.name ?? t`Choose`}
      </StyledDeliveryButton>
      {needsOwner && (
        <small>
          <Trans>Choose a human owner before selecting an assistant.</Trans>
        </small>
      )}
      {kind === 'ASSISTANT' && value !== null && (
        <StyledDeliveryButton
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <Trans>Remove optional assistant</Trans>
        </StyledDeliveryButton>
      )}
      {opened && !disabled && !needsOwner && (
        <AdvertisingChoiceOptions
          key={`${scope}:${kind}:${ownerId ?? ''}`}
          id={regionId}
          state={state}
          sourceKind={sourceKind}
          sourceId={sourceId}
          scope={scope}
          kind={kind}
          ownerId={ownerId}
          label={label}
          value={value}
          onChange={(selection) => {
            onChange(selection);
            setOpened(false);
          }}
          onClose={() => setOpened(false)}
        />
      )}
    </StyledDeliveryStack>
  );
};

type AdvertisingChoiceOptionsProps = Omit<
  AdvertisingChoicePickerProps,
  'disabled'
> & { id: string; onClose: () => void };
const AdvertisingChoiceOptions = ({
  id,
  state,
  sourceKind,
  sourceId,
  scope,
  kind,
  ownerId,
  label,
  value,
  onChange,
  onClose,
}: AdvertisingChoiceOptionsProps) => {
  const { t } = useLingui();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [after, setAfter] = useState<string | null>(null);
  const focusPanel = useAssistantPanelFocus();
  const input = {
    sourceKind,
    sourceId,
    kind,
    ownerId,
    search,
    after,
    limit: 25,
  };
  const source = `${state.source}:${scope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAdvertisingChoicesQuery>(
    GET_ADVERTISING_CHOICES,
    {
      variables: { input, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: state.data === null,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingChoices,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (result) =>
      state.permission.matches(result) &&
      fastDeepEqual(result.actor, state.data?.actor),
  });
  return (
    <section
      id={id}
      ref={focusPanel}
      tabIndex={-1}
      aria-label={t`${label} choices`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <label>
            <Trans>Search choices</Trans>
            <input
              maxLength={160}
              value={searchInput}
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
            <Trans>Search</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} permitted choices.`}</p>
            {reading.data.items.map((choice) => (
              <StyledAdvertisingItem key={choice.id}>
                <StyledDeliveryButton
                  type="button"
                  aria-pressed={value?.id === choice.id}
                  onClick={() =>
                    onChange({
                      id: choice.id,
                      name: choice.name,
                      version: choice.version ?? null,
                    })
                  }
                >
                  {choice.name}
                </StyledDeliveryButton>
              </StyledAdvertisingItem>
            ))}
            {reading.data.totalCount === 0 && (
              <p>
                <Trans>No permitted choices match this search.</Trans>
              </p>
            )}
            {reading.data.nextCursor && (
              <StyledDeliveryButton
                type="button"
                onClick={() => setAfter(reading.data?.nextCursor ?? null)}
              >
                <Trans>More choices</Trans>
              </StyledDeliveryButton>
            )}
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Choices could not be verified. Retry current choices.`
              : t`Loading permitted choices…`}
          </p>
        )}
        <StyledDeliveryRow>
          {(after !== null || query.error) && (
            <StyledDeliveryButton
              type="button"
              onClick={() => {
                if (after !== null) setAfter(null);
                else void query.refetch().catch(() => undefined);
              }}
            >
              <Trans>First choices page</Trans>
            </StyledDeliveryButton>
          )}
          {query.error && (
            <StyledDeliveryButton
              type="button"
              onClick={() => void query.refetch().catch(() => undefined)}
            >
              <Trans>Retry choices</Trans>
            </StyledDeliveryButton>
          )}
          <StyledDeliveryButton type="button" onClick={onClose}>
            <Trans>Close choices</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
