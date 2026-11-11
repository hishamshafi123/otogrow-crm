import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { useServiceCatalog } from '@/delivery/onboarding/useServiceCatalog';

const StyledChoices = styled.div`
  display: grid;
  gap: 4px 12px;
  grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
  margin-block: 12px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
  > label {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 8px;
    min-height: 44px;
    overflow-wrap: anywhere;
  }
  input[type='checkbox'] {
    flex: 0 0 auto;
    margin: 0;
  }
`;
const serviceKey = (value: string) =>
  value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
type ClientServicePickerProps = {
  services: string[];
  onChange: (services: string[]) => void;
};
export const ClientServicePicker = ({
  services,
  onChange,
}: ClientServicePickerProps) => {
  const { t } = useLingui();
  const catalog = useServiceCatalog();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const helpId = useId();
  const limitId = useId();
  const viewToggle = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Return focus only after closing the inline editor, never on initial mount.
  const wasAdding = useRef(false);
  useLayoutEffect(() => {
    if (adding) nameInput.current?.focus();
    else if (wasAdding.current) addButton.current?.focus();
    wasAdding.current = adding;
  }, [adding]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const defaults = [
    ['AI video', t`AI video`],
    ['Static ads', t`Static ads`],
    ['Performance marketing', t`Performance marketing`],
    ['SEO', t`SEO`],
    ['Website', t`Website`],
    ['SaaS', t`SaaS`],
    ['Mobile app', t`Mobile app`],
  ];
  const choices = [...defaults];
  for (const value of [...catalog.services, ...services]) {
    if (
      !choices.some(([existing]) => serviceKey(existing) === serviceKey(value))
    )
      choices.push([value, value]);
  }
  const selected = (value: string) =>
    services.some((service) => serviceKey(service) === serviceKey(value));
  const matching = choices.filter(
    ([value, label]) =>
      (!selectedOnly || selected(value)) &&
      serviceKey(`${value} ${label}`).includes(serviceKey(search)),
  );
  const missing = matching.filter(([value]) => !selected(value));
  const hasFilter = Boolean(search.trim()) || selectedOnly;
  const openEditor = () => {
    setName(search.trim());
    setAdding(true);
    setError('');
    setMessage('');
  };
  const select = (value: string) => {
    if (!selected(value)) onChange([...services, value]);
  };
  // oxlint-disable-next-line twenty/no-state-useref -- A catalog response must use the current form callback so concurrent edits are preserved.
  const latestSelect = useRef(select);
  useLayoutEffect(() => {
    latestSelect.current = select;
  });
  const save = async () => {
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (
      !normalized ||
      normalized.length > 100 ||
      /[,\u0000-\u001f\u007f]/.test(name)
    ) {
      setError(
        t`Enter one service name, up to 100 characters, without commas.`,
      );
      return;
    }
    if (services.length >= 20 && !selected(normalized)) {
      setError(t`Select up to 20 services per plan.`);
      return;
    }
    const existing = choices.find(
      ([value]) => serviceKey(value) === serviceKey(normalized),
    );
    // Selected legacy names still need saving to become available to other clients.
    if (
      existing &&
      [...defaults.map(([value]) => value), ...catalog.services].some(
        (value) => serviceKey(value) === serviceKey(normalized),
      )
    ) {
      select(existing[0]);
      setName('');
      setSearch('');
      setSelectedOnly(false);
      setAdding(false);
      setError('');
      setMessage(t`Existing service selected.`);
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await catalog.add(normalized);
      const confirmed = saved?.find(
        (value) => serviceKey(value) === serviceKey(normalized),
      );
      if (!confirmed) {
        setError(t`The service could not be confirmed. Try again.`);
        return;
      }
      latestSelect.current(confirmed);
      setName('');
      setSearch('');
      setSelectedOnly(false);
      setAdding(false);
      setMessage(
        t`Service saved and selected. It is available for future client setups.`,
      );
    } catch {
      setError(t`Could not save the service. Your name is kept; try again.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset disabled={busy}>
      <legend>
        <Trans>Client services</Trans>
      </legend>
      <p>
        <Trans>Select all services included in this plan.</Trans>{' '}
        <Trans>{services.length} of 20 selected.</Trans>
      </p>
      {!adding ? (
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="button"
            ref={addButton}
            disabled={!catalog.canAdd}
            onClick={openEditor}
          >
            <Trans>Add service</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      ) : (
        <div>
          <label>
            <Trans>New service name</Trans>
            <input
              ref={nameInput}
              maxLength={100}
              aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
              aria-invalid={Boolean(error)}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  void save();
                }
              }}
            />
          </label>
          <p id={helpId}>
            <Trans>
              Saved for everyone managing client setups in this workspace, even
              if you cancel this onboarding.
            </Trans>
          </p>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={!catalog.canAdd || !name.trim()}
              onClick={() => {
                void save();
              }}
            >
              {busy ? t`Saving…` : t`Save and select`}
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              onClick={() => {
                setAdding(false);
                setError('');
              }}
            >
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </div>
      )}
      <label>
        <Trans>Find a service</Trans>
        <input
          type="search"
          value={search}
          placeholder={t`Search services`}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <StyledDeliveryRow>
        <StyledDeliveryButton
          type="button"
          ref={viewToggle}
          aria-pressed={selectedOnly}
          onClick={() => setSelectedOnly(!selectedOnly)}
        >
          {selectedOnly ? t`Show all services` : t`Show selected`}
        </StyledDeliveryButton>
        <StyledDeliveryButton
          type="button"
          disabled={!services.length}
          onClick={() => {
            onChange([]);
            setMessage('');
          }}
        >
          <Trans>Clear selection</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      <StyledChoices>
        {matching.map(([value, label]) => (
          <label key={serviceKey(value)}>
            <input
              type="checkbox"
              checked={selected(value)}
              disabled={!selected(value) && services.length >= 20}
              onChange={(event) => {
                if (selectedOnly && !event.target.checked)
                  viewToggle.current?.focus();
                setMessage('');
                onChange(
                  event.target.checked
                    ? [...services, value]
                    : services.filter(
                        (service) => serviceKey(service) !== serviceKey(value),
                      ),
                );
              }}
            />
            {label}
          </label>
        ))}
      </StyledChoices>
      {matching.length === 0 && (
        <p role="status">
          {selectedOnly
            ? t`No selected services match this view. Show all services to choose more.`
            : t`No matching service. Use Add service above to save a new option.`}
        </p>
      )}
      {hasFilter && (
        <p role="status">
          <Trans>
            {matching.length} services shown. Hidden selections are kept.
          </Trans>
        </p>
      )}
      {services.length + missing.length > 20 && (
        <p id={limitId}>
          <Trans>
            You can select {20 - services.length} more services. Narrow your
            search or choose services individually.
          </Trans>
        </p>
      )}
      {choices.length > 20 && (
        <p>
          <Trans>
            Choose up to 20 services individually from your catalog.
          </Trans>
        </p>
      )}
      {catalog.loading && (
        <p role="status">
          <Trans>Loading saved services…</Trans>
        </p>
      )}
      {catalog.unavailable && (
        <p>
          <Trans>
            Saved services could not be loaded. Your current selections are
            kept.
          </Trans>{' '}
          <StyledDeliveryButton
            type="button"
            onClick={() => {
              void catalog.retry().catch(() => {});
            }}
          >
            <Trans>Retry</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      <StyledDeliveryRow>
        <StyledDeliveryButton
          type="button"
          aria-describedby={
            services.length + missing.length > 20 ? limitId : undefined
          }
          disabled={
            missing.length === 0 ||
            services.length + missing.length > 20 ||
            catalog.loading ||
            catalog.unavailable
          }
          onClick={() =>
            onChange([...services, ...missing.map(([value]) => value)])
          }
        >
          {hasFilter ? t`Select results` : t`Select all`}
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {error && (
        <p role="alert" id={errorId}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
};
