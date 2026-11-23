import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { useServiceCatalog } from '@/delivery/onboarding/useServiceCatalog';

const StyledServiceChoices = styled.div`
  display: grid;
  gap: 8px 10px;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  margin-block: 12px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  > label {
    align-items: center;
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 12px;
    cursor: pointer;
    display: flex;
    gap: 10px;
    min-height: 44px;
    overflow-wrap: anywhere;
    padding: 8px 12px;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      box-shadow 150ms ease;
  }
  > label:hover {
    background: ${themeCssVariables.color.transparent.iris1};
    border-color: ${themeCssVariables.color.iris6};
    box-shadow: 0 4px 12px -8px ${themeCssVariables.color.transparent.iris5};
  }
  input[type='checkbox'] {
    accent-color: ${themeCssVariables.color.iris9};
    flex: 0 0 auto;
    margin: 0;
  }
`;
const StyledSelectedServices = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  li {
    align-items: center;
    background: ${themeCssVariables.color.transparent.iris2};
    border: 1px solid ${themeCssVariables.color.iris5};
    border-radius: 999px;
    color: ${themeCssVariables.color.iris11};
    display: flex;
    flex-wrap: wrap;
    font-size: 13px;
    font-weight: 500;
    gap: 8px;
    max-width: 100%;
    padding: 4px 6px 4px 14px;
  }
  li > span {
    overflow-wrap: anywhere;
  }
  li > button {
    border-radius: 999px;
    min-height: 28px;
    padding: 4px 10px;
  }
`;
const StyledCustomService = styled.div`
  background: ${themeCssVariables.color.transparent.iris1};
  border: 1px solid ${themeCssVariables.color.iris5};
  border-left: 3px solid ${themeCssVariables.color.iris9};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 12px 0;
  padding: 14px 16px;
`;
const serviceKey = (value: string) =>
  value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
export type ClientServiceEditorState = { dirty: boolean; busy: boolean };
type ClientServicePickerProps = {
  services: string[];
  onChange: (services: string[]) => void;
  onEditorStateChange?: (state: ClientServiceEditorState) => void;
};
export const ClientServicePicker = ({
  services,
  onChange,
  onEditorStateChange,
}: ClientServicePickerProps) => {
  const { t } = useLingui();
  const catalog = useServiceCatalog();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const helpId = useId();
  const errorId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Store live DOM inputs only to restore keyboard focus after removal.
  const availableOptions = useRef(new Map<string, HTMLInputElement>());
  // oxlint-disable-next-line twenty/no-state-useref -- Coordinate imperative focus once the restored option mounts, not rendered state.
  const pendingFocus = useRef<string | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Return focus only after closing the inline editor, never on initial mount.
  const wasAdding = useRef(false);
  useLayoutEffect(() => {
    if (adding) nameInput.current?.focus();
    else if (wasAdding.current) addButton.current?.focus();
    wasAdding.current = adding;
  }, [adding]);
  useLayoutEffect(() => {
    onEditorStateChange?.({ dirty: adding, busy });
  }, [adding, busy, onEditorStateChange]);
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const input = availableOptions.current.get(pendingFocus.current);
    if (input) input.focus();
    else searchInput.current?.focus();
    pendingFocus.current = null;
  }, [services]);
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
  const available = choices.filter(
    ([value, label]) =>
      !selected(value) &&
      serviceKey(`${value} ${label}`).includes(serviceKey(search)),
  );
  const openEditor = () => {
    setName(search.trim());
    setAdding(true);
    setError('');
    setMessage('');
  };
  const select = (value: string) => {
    if (!selected(value) && services.length < 20)
      onChange([...services, value]);
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
      setError(t`Enter one name, up to 100 characters, without commas.`);
      return;
    }
    if (services.length >= 20 && !selected(normalized)) {
      setError(t`Select up to 20 services per plan.`);
      return;
    }
    const existing = choices.find(
      ([value]) => serviceKey(value) === serviceKey(normalized),
    );
    if (existing) {
      select(existing[0]);
      setName('');
      setSearch('');
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
        <Trans>Included services and products</Trans>
      </legend>
      <p>
        <Trans>
          Choose the work covered by this plan. Add a custom option only when it
          is missing.
        </Trans>{' '}
        <Trans>{services.length} of 20 selected.</Trans>
      </p>
      {services.length > 0 && (
        <StyledSelectedServices aria-label={t`Selected services`}>
          {services.map((service) => (
            <li key={serviceKey(service)}>
              <span>{service}</span>
              <StyledDeliveryButton
                type="button"
                data-variant="quiet"
                aria-label={t`Remove ${service}`}
                onClick={() => {
                  pendingFocus.current = serviceKey(service);
                  setSearch('');
                  setMessage(t`${service} removed.`);
                  onChange(
                    services.filter(
                      (value) => serviceKey(value) !== serviceKey(service),
                    ),
                  );
                }}
              >
                <Trans>Remove</Trans>
              </StyledDeliveryButton>
            </li>
          ))}
        </StyledSelectedServices>
      )}
      <label>
        <Trans>Find a service or product</Trans>
        <input
          ref={searchInput}
          type="search"
          value={search}
          placeholder={t`Search available options`}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <StyledServiceChoices>
        {available.map(([value, label]) => (
          <label key={serviceKey(value)}>
            <input
              ref={(input) => {
                if (input)
                  availableOptions.current.set(serviceKey(value), input);
                else availableOptions.current.delete(serviceKey(value));
              }}
              type="checkbox"
              checked={false}
              disabled={services.length >= 20}
              onChange={() => {
                select(value);
                setMessage(t`${value} selected.`);
                searchInput.current?.focus();
              }}
            />
            {label}
          </label>
        ))}
      </StyledServiceChoices>
      {available.length === 0 && (
        <p role="status">
          <Trans>
            No available options match. Your selected items remain included.
          </Trans>
        </p>
      )}
      {services.length >= 20 && (
        <p role="status">
          <Trans>This plan has reached its 20-service limit.</Trans>
        </p>
      )}
      {!adding ? (
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="button"
            ref={addButton}
            disabled={!catalog.canAdd}
            onClick={openEditor}
          >
            <Trans>Add a custom service or product</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      ) : (
        <StyledCustomService>
          <label>
            <Trans>New service or product name</Trans>
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
              Saving adds this option to the shared workspace catalog, even if
              you later cancel this client setup. Save or cancel this custom
              option before saving or continuing the service plan.
            </Trans>
          </p>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={!catalog.canAdd || !name.trim()}
              onClick={() => void save()}
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
        </StyledCustomService>
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
            onClick={() => void catalog.retry().catch(() => {})}
          >
            <Trans>Retry</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      {error && (
        <p role="alert" id={errorId}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
};
